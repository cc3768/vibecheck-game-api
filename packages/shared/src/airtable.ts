import "./config";
import { nowIso } from "./envelope";
import { getRedisClient, redisEnabled, redisKey } from "./redis";

export const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN ?? process.env.AIRTABLE_API_KEY ?? "";
export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID ?? "";
export const AIRTABLE_ACCOUNTS_TABLE = process.env.AIRTABLE_ACCOUNTS_TABLE ?? "Accounts";
export const AIRTABLE_CHARACTERS_TABLE = process.env.AIRTABLE_CHARACTERS_TABLE ?? "Characters";
export const AIRTABLE_SESSIONS_TABLE = process.env.AIRTABLE_SESSIONS_TABLE ?? "Sessions";
export const AIRTABLE_PLAYER_PRESENCE_TABLE = process.env.AIRTABLE_PLAYER_PRESENCE_TABLE ?? "Player Presence";
export const AIRTABLE_WORLD_REGIONS_TABLE = process.env.AIRTABLE_WORLD_REGIONS_TABLE ?? "World Regions";
export const AIRTABLE_WORLD_TILES_TABLE = process.env.AIRTABLE_WORLD_TILES_TABLE ?? "World Tiles";
export const AIRTABLE_WORLD_OBJECTS_TABLE = process.env.AIRTABLE_WORLD_OBJECTS_TABLE ?? "World Objects";
export const AIRTABLE_SERVICE_EVENTS_TABLE = process.env.AIRTABLE_SERVICE_EVENTS_TABLE ?? "Service Events";

export interface AirtableFieldSpec {
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

interface AirtableMetaField {
  id: string;
  name: string;
  type: string;
}

interface AirtableMetaTable {
  id: string;
  name: string;
  fields?: AirtableMetaField[];
}

const tableFieldMapCache = new Map<string, Map<string, string>>();

export type AirtableFields = Record<string, unknown>;
export interface AirtableRecord<T extends AirtableFields = AirtableFields> {
  id: string;
  createdTime?: string;
  fields: T;
}

const META_TABLES_KEY = redisKey("db", "meta", "tables");
const SCHEMA_LOCK_TTL_MS = Number(process.env.REDIS_SCHEMA_LOCK_TTL_MS ?? 12000);
const SCHEMA_LOCK_RETRY_MS = Number(process.env.REDIS_SCHEMA_LOCK_RETRY_MS ?? 120);
const SCHEMA_LOCK_MAX_WAIT_MS = Number(process.env.REDIS_SCHEMA_LOCK_MAX_WAIT_MS ?? 20000);

function tableRecordsKey(tableName: string) {
  return redisKey("db", "table", tableName, "records");
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson<T>(raw: string, fallback: T) {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function airtableEnabled() {
  return redisEnabled();
}

async function ensureConfigured() {
  if (!airtableEnabled()) {
    throw new Error("Redis is not configured. Set REDIS_URL.");
  }
  return getRedisClient();
}

function escapeFormulaValue(value: string) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function listTableMeta() {
  const client = await ensureConfigured();
  const raw = await client.hGetAll(META_TABLES_KEY);
  return Object.values(raw)
    .map((entry) => parseJson<AirtableMetaTable | null>(String(entry), null))
    .filter((entry): entry is AirtableMetaTable => Boolean(entry && entry.name));
}

async function saveTableMeta(table: AirtableMetaTable) {
  const client = await ensureConfigured();
  await client.hSet(META_TABLES_KEY, table.name, JSON.stringify(table));
}

async function withSchemaLock<T>(tableName: string, operation: () => Promise<T>) {
  const client = await ensureConfigured();
  const lockKey = redisKey("db", "lock", "schema", tableName);
  const ownerToken = makeId("lock");
  const startedAt = Date.now();

  while (Date.now() - startedAt < SCHEMA_LOCK_MAX_WAIT_MS) {
    const acquired = await client.set(lockKey, ownerToken, { NX: true, PX: SCHEMA_LOCK_TTL_MS });
    if (acquired === "OK") {
      try {
        return await operation();
      } finally {
        const owner = await client.get(lockKey);
        if (owner === ownerToken) {
          await client.del(lockKey);
        }
      }
    }
    await wait(SCHEMA_LOCK_RETRY_MS + Math.floor(Math.random() * 40));
  }

  throw new Error(`Timed out waiting for schema lock on '${tableName}'.`);
}

async function upsertRecord<T extends AirtableFields>(tableName: string, record: AirtableRecord<T>) {
  const client = await ensureConfigured();
  await client.hSet(tableRecordsKey(tableName), record.id, JSON.stringify(record));
}

async function getRecord<T extends AirtableFields>(tableName: string, recordId: string) {
  const client = await ensureConfigured();
  const raw = await client.hGet(tableRecordsKey(tableName), recordId);
  if (!raw) return null;
  return parseJson<AirtableRecord<T> | null>(raw, null);
}

async function listRecords<T extends AirtableFields>(tableName: string) {
  const client = await ensureConfigured();
  const rows = await client.hGetAll(tableRecordsKey(tableName));
  return Object.values(rows)
    .map((raw) => parseJson<AirtableRecord<T> | null>(String(raw), null))
    .filter((entry): entry is AirtableRecord<T> => Boolean(entry && entry.id && entry.fields));
}

async function deleteRecord(tableName: string, recordId: string) {
  const client = await ensureConfigured();
  const removed = await client.hDel(tableRecordsKey(tableName), recordId);
  return removed > 0;
}

function valueAsString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function valueAsNumber(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getFieldValue(fields: Record<string, unknown>, fieldName: string) {
  if (fieldName in fields) return fields[fieldName];
  const lower = fieldName.toLowerCase();
  const match = Object.keys(fields).find((key) => key.toLowerCase() === lower);
  return match ? fields[match] : undefined;
}

type Condition = { field: string; expected: string | number; mode: "string" | "number" };

function parseCondition(rawCondition: string): Condition | null {
  const condition = rawCondition.trim();
  const strMatch = condition.match(/^\{([^}]+)\}\s*=\s*'((?:\\'|[^'])*)'$/);
  if (strMatch) {
    return {
      field: strMatch[1].trim(),
      expected: strMatch[2].replaceAll("\\'", "'").replaceAll("\\\\", "\\"),
      mode: "string"
    };
  }

  const numMatch = condition.match(/^\{([^}]+)\}\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (numMatch) {
    return { field: numMatch[1].trim(), expected: Number(numMatch[2]), mode: "number" };
  }

  return null;
}

function splitTopLevelByComma(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function matchesCondition(fields: Record<string, unknown>, condition: Condition) {
  const value = getFieldValue(fields, condition.field);
  if (condition.mode === "number") {
    const actual = valueAsNumber(value);
    return Number.isFinite(actual) && actual === condition.expected;
  }
  return valueAsString(value) === String(condition.expected);
}

function filterByFormula<T extends AirtableFields>(records: Array<AirtableRecord<T>>, formula: string | undefined) {
  if (!formula?.trim()) return records;
  const source = formula.trim();

  const andMatch = source.match(/^AND\((.*)\)$/i);
  const pieces = andMatch ? splitTopLevelByComma(andMatch[1]) : [source];
  const conditions = pieces.map(parseCondition).filter((entry): entry is Condition => Boolean(entry));
  if (!conditions.length) return records;

  return records.filter((record) => conditions.every((condition) => matchesCondition(record.fields, condition)));
}

async function fieldNameMapForTable(tableName: string) {
  const cacheHit = tableFieldMapCache.get(tableName);
  if (cacheHit) return cacheHit;

  const tables = await airtableListTables();
  const hit = tables.find((table) => table.name === tableName);
  const map = new Map<string, string>();
  for (const field of hit?.fields ?? []) {
    map.set(String(field.name).toLowerCase(), field.name);
  }
  tableFieldMapCache.set(tableName, map);
  return map;
}

async function normalizeFieldName(tableName: string, fieldName: string) {
  const map = await fieldNameMapForTable(tableName);
  return map.get(String(fieldName).toLowerCase()) ?? fieldName;
}

async function normalizeFieldsForTable<T extends AirtableFields>(tableName: string, fields: T | Partial<T>) {
  const map = await fieldNameMapForTable(tableName);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    const normalizedKey = map.get(String(key).toLowerCase()) ?? key;
    out[normalizedKey] = value;
  }
  return out;
}

function inferFieldType(value: unknown) {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  if (Array.isArray(value)) return "multilineText";
  if (typeof value === "object" && value !== null) return "multilineText";
  return "singleLineText";
}

async function ensureTableExistsNoLock(tableName: string, fields?: Record<string, unknown>) {
  const tables = await listTableMeta();
  const hit = tables.find((table) => table.name === tableName);
  if (hit) return hit;

  const specs: AirtableFieldSpec[] = Object.keys(fields ?? {}).map((name) => ({ name, type: inferFieldType(fields?.[name]) }));
  const table: AirtableMetaTable = {
    id: makeId("tbl"),
    name: tableName,
    fields: specs.map((field) => ({ id: makeId("fld"), name: field.name, type: field.type }))
  };
  await saveTableMeta(table);
  tableFieldMapCache.delete(tableName);
  return table;
}

async function ensureTableExists(tableName: string, fields?: Record<string, unknown>) {
  const tables = await listTableMeta();
  const hit = tables.find((table) => table.name === tableName);
  if (hit) return hit;

  return withSchemaLock(tableName, async () => ensureTableExistsNoLock(tableName, fields));
}

export async function airtableListTables() {
  return listTableMeta();
}

async function ensureMissingFields(tableId: string, tableName: string, fields: AirtableFieldSpec[]) {
  const tables = await listTableMeta();
  const current = tables.find((table) => table.id === tableId || table.name === tableName);
  const currentFields = current?.fields ?? [];
  const existingNames = new Set(currentFields.map((field) => String(field.name).toLowerCase()));
  const missing = fields.filter((field) => !existingNames.has(String(field.name).toLowerCase()));

  if (!missing.length || !current) {
    return 0;
  }

  current.fields = [
    ...currentFields,
    ...missing.map((field) => ({ id: makeId("fld"), name: field.name, type: field.type }))
  ];
  await saveTableMeta(current);
  tableFieldMapCache.delete(tableName);
  return missing.length;
}

export async function airtableEnsureTable(tableName: string, fields: AirtableFieldSpec[]) {
  return withSchemaLock(tableName, async () => {
    const tables = await listTableMeta();
    const existing = tables.find((table) => table.name === tableName);
    if (existing) {
      const fieldsAdded = await ensureMissingFields(existing.id, tableName, fields);
      return { created: false, tableId: existing.id, fieldsAdded };
    }

    const seededFields = Object.fromEntries(fields.map((field) => [field.name, null]));
    const created = await ensureTableExistsNoLock(tableName, seededFields);
    const fieldsAdded = await ensureMissingFields(created.id, tableName, fields);
    return { created: true, tableId: created.id, fieldsAdded };
  });
}

export async function airtableListRecords<T extends AirtableFields>(tableName: string, params?: Record<string, string>) {
  await ensureTableExists(tableName);
  const maxRecords = Number(params?.maxRecords ?? "0");
  const formula = params?.filterByFormula;
  const records = filterByFormula(await listRecords<T>(tableName), formula);
  const limited = Number.isFinite(maxRecords) && maxRecords > 0 ? records.slice(0, Math.floor(maxRecords)) : records;
  return { records: limited };
}

export async function airtableFindRecordByField<T extends AirtableFields>(tableName: string, fieldName: string, fieldValue: string) {
  await ensureTableExists(tableName);
  const normalizedFieldName = await normalizeFieldName(tableName, fieldName);
  const target = String(fieldValue);
  const records = await listRecords<T>(tableName);
  return records.find((record) => valueAsString(getFieldValue(record.fields, normalizedFieldName)) === target) ?? null;
}

export async function airtableCreateRecord<T extends AirtableFields>(tableName: string, fields: T) {
  await ensureTableExists(tableName, fields);
  const normalizedFields = await normalizeFieldsForTable(tableName, fields);
  const record: AirtableRecord<T> = {
    id: makeId("rec"),
    createdTime: nowIso(),
    fields: normalizedFields as T
  };
  await upsertRecord(tableName, record);
  return record;
}

export async function airtableUpdateRecord<T extends AirtableFields>(tableName: string, recordId: string, fields: Partial<T>) {
  await ensureTableExists(tableName, fields as Record<string, unknown>);
  const existing = await getRecord<T>(tableName, recordId);
  if (!existing) {
    throw new Error(`Record '${recordId}' not found in table '${tableName}'.`);
  }
  const normalizedFields = await normalizeFieldsForTable(tableName, fields);
  const merged: AirtableRecord<T> = {
    ...existing,
    fields: {
      ...(existing.fields as Record<string, unknown>),
      ...normalizedFields
    } as T
  };
  await upsertRecord(tableName, merged);
  return merged;
}

export async function airtableUpsertByField<T extends AirtableFields>(tableName: string, fieldName: string, fieldValue: string, fields: T) {
  await ensureTableExists(tableName, fields);
  const existing = await airtableFindRecordByField<T>(tableName, fieldName, fieldValue);
  if (existing) {
    await airtableUpdateRecord<T>(tableName, existing.id, fields);
    return { created: false, recordId: existing.id };
  }

  const normalizedFieldName = await normalizeFieldName(tableName, fieldName);
  const created = await airtableCreateRecord<T>(tableName, {
    ...fields,
    [normalizedFieldName]: fieldValue
  } as T);
  return { created: true, recordId: created.id };
}

export async function airtableDeleteRecord(tableName: string, recordId: string) {
  await ensureTableExists(tableName);
  const deleted = await deleteRecord(tableName, recordId);
  return { deleted, id: recordId };
}

export function starterKnownSkills() {
  return [
    { skill: "GENERAL", level: 0, xp: 0 },
    { skill: "GATHERING", level: 0, xp: 0 },
    { skill: "EXPLORATION", level: 0, xp: 0 },
    { skill: "SURVIVAL", level: 0, xp: 0 },
    { skill: "SOCIAL", level: 0, xp: 0 },
    { skill: "CRAFTING", level: 0, xp: 0 }
  ];
}

export function defaultCharacterKnowledge() {
  return {
    unlockedTopics: ["starter_tips"],
    unlockedRecipes: [],
    discoveredWorlds: ["world_prime"],
    lastSavedAt: nowIso()
  };
}
