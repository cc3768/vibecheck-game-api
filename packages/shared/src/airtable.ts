import "./config";
import { nowIso } from "./envelope";

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

export function airtableEnabled() {
  return Boolean(AIRTABLE_TOKEN && AIRTABLE_BASE_ID);
}

function tableUrl(tableName: string) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };
}

function ensureConfigured() {
  if (!airtableEnabled()) {
    throw new Error("Airtable is not configured. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID.");
  }
}

function escapeFormulaValue(value: string) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  ensureConfigured();
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: { message?: string; type?: string } };

  if (!response.ok) {
    const message = payload?.error?.message ?? `Airtable request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function requestNoThrow<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; payload: T | null; message: string | null }> {
  ensureConfigured();
  const response = await fetch(url, init);
  let payload: (T & { error?: { message?: string } }) | null = null;
  try {
    payload = (await response.json()) as T & { error?: { message?: string } };
  } catch {
    payload = null;
  }
  const message = payload && typeof payload === "object" && "error" in payload ? payload.error?.message ?? null : null;
  return { ok: response.ok, status: response.status, payload: payload as T | null, message };
}

function baseMetaTablesUrl() {
  return `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
}

function baseMetaFieldsUrl(tableId: string) {
  return `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields`;
}

export async function airtableListTables() {
  const payload = await request<{ tables: AirtableMetaTable[] }>(baseMetaTablesUrl(), {
    method: "GET",
    headers: authHeaders()
  });
  return payload.tables ?? [];
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

async function ensureMissingFields(tableId: string, tableName: string, fields: AirtableFieldSpec[]) {
  const tables = await airtableListTables();
  const current = tables.find((table) => table.id === tableId || table.name === tableName);
  const existingNames = new Set((current?.fields ?? []).map((field) => String(field.name).toLowerCase()));
  const missing = fields.filter((field) => !existingNames.has(String(field.name).toLowerCase()));

  for (const field of missing) {
    const createFieldAttempt = await requestNoThrow<{ id: string; name: string }>(baseMetaFieldsUrl(tableId), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(field)
    });

    if (!createFieldAttempt.ok) {
      const refreshed = await airtableListTables();
      const after = refreshed.find((table) => table.id === tableId || table.name === tableName);
      const afterNames = new Set((after?.fields ?? []).map((metaField) => String(metaField.name).toLowerCase()));
      if (afterNames.has(String(field.name).toLowerCase())) {
        continue;
      }

      throw new Error(
        createFieldAttempt.message ?? `Could not create Airtable field '${field.name}' on table '${tableName}' (status ${createFieldAttempt.status})`
      );
    }

    tableFieldMapCache.delete(tableName);
  }

  return missing.length;
}

export async function airtableEnsureTable(tableName: string, fields: AirtableFieldSpec[]) {
  const tables = await airtableListTables();
  const hit = tables.find((table) => table.name === tableName);
  if (hit) {
    const fieldsAdded = await ensureMissingFields(hit.id, tableName, fields);
    tableFieldMapCache.delete(tableName);
    return { created: false, tableId: hit.id, fieldsAdded };
  }

  const createAttempt = await requestNoThrow<{ id: string; name: string }>(baseMetaTablesUrl(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: tableName,
      fields
    })
  });

  if (!createAttempt.ok) {
    const maybeExists = await airtableListTables();
    const afterHit = maybeExists.find((table) => table.name === tableName);
    if (afterHit) {
      return { created: false, tableId: afterHit.id };
    }
    throw new Error(createAttempt.message ?? `Could not create Airtable table '${tableName}' (status ${createAttempt.status})`);
  }

  return {
    created: true,
    tableId: createAttempt.payload?.id ?? null
  };
}

export async function airtableListRecords<T extends AirtableFields>(tableName: string, params?: Record<string, string>) {
  const url = new URL(tableUrl(tableName));
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return request<{ records: Array<AirtableRecord<T>> }>(url.toString(), {
    method: "GET",
    headers: authHeaders()
  });
}

export async function airtableFindRecordByField<T extends AirtableFields>(tableName: string, fieldName: string, fieldValue: string) {
  const normalizedFieldName = await normalizeFieldName(tableName, fieldName);
  const formula = `{${normalizedFieldName}}='${escapeFormulaValue(fieldValue)}'`;
  const result = await airtableListRecords<T>(tableName, {
    filterByFormula: formula,
    maxRecords: "1"
  });

  return result.records[0] ?? null;
}

export async function airtableCreateRecord<T extends AirtableFields>(tableName: string, fields: T) {
  const normalizedFields = await normalizeFieldsForTable(tableName, fields);
  return request<{ id: string; createdTime?: string; fields: T }>(tableUrl(tableName), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ records: [{ fields: normalizedFields }], typecast: true })
  }).then((payload) => {
    const record = (payload as unknown as { records?: Array<AirtableRecord<T>> }).records?.[0];
    if (!record) throw new Error("Airtable did not return a created record.");
    return record;
  });
}

export async function airtableUpdateRecord<T extends AirtableFields>(tableName: string, recordId: string, fields: Partial<T>) {
  const normalizedFields = await normalizeFieldsForTable(tableName, fields);
  return request<{ id: string; createdTime?: string; fields: T }>(`${tableUrl(tableName)}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ fields: normalizedFields, typecast: true })
  }) as Promise<AirtableRecord<T>>;
}

export async function airtableUpsertByField<T extends AirtableFields>(tableName: string, fieldName: string, fieldValue: string, fields: T) {
  const existing = await airtableFindRecordByField<T>(tableName, fieldName, fieldValue);
  if (existing) {
    await airtableUpdateRecord<T>(tableName, existing.id, fields);
    return { created: false, recordId: existing.id };
  }
  const created = await airtableCreateRecord<T>(tableName, fields);
  return { created: true, recordId: created.id };
}

export async function airtableDeleteRecord(tableName: string, recordId: string) {
  return request<{ deleted: boolean; id: string }>(`${tableUrl(tableName)}/${recordId}`, {
    method: "DELETE",
    headers: authHeaders()
  });
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
