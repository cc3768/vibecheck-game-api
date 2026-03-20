import { nowIso } from "./envelope";

export const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN ?? "";
export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID ?? "";
export const AIRTABLE_ACCOUNTS_TABLE = process.env.AIRTABLE_ACCOUNTS_TABLE ?? "Accounts";
export const AIRTABLE_CHARACTERS_TABLE = process.env.AIRTABLE_CHARACTERS_TABLE ?? "Characters";

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
  const formula = `{${fieldName}}='${escapeFormulaValue(fieldValue)}'`;
  const result = await airtableListRecords<T>(tableName, {
    filterByFormula: formula,
    maxRecords: "1"
  });

  return result.records[0] ?? null;
}

export async function airtableCreateRecord<T extends AirtableFields>(tableName: string, fields: T) {
  return request<{ id: string; createdTime?: string; fields: T }>(tableUrl(tableName), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  }).then((payload) => {
    const record = (payload as unknown as { records?: Array<AirtableRecord<T>> }).records?.[0];
    if (!record) throw new Error("Airtable did not return a created record.");
    return record;
  });
}

export async function airtableUpdateRecord<T extends AirtableFields>(tableName: string, recordId: string, fields: Partial<T>) {
  return request<{ id: string; createdTime?: string; fields: T }>(`${tableUrl(tableName)}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ fields, typecast: true })
  }) as Promise<AirtableRecord<T>>;
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
