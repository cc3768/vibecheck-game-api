import { SERVICE_VERSION, createServiceApp, getRequestId, sendError, sendSuccess } from "../../../packages/shared/src/index";
import { SEED_DISCOVERIES, SEED_HERB_CATALOG, SEED_INTENT_SKILLS, SEED_ITEMS, SEED_SKILLS, SEED_SKILL_PREREQS, type DiscoverySeedRecord, type DynamicItemRecord, type DynamicSkillRecord, type HerbCatalogEntry, type ItemMetaRecord, type RecipeRecord } from "./seed";

const SERVICE_NAME = "content-system";
const PORT = 41743;
const app = createServiceApp(SERVICE_NAME);

const runtimeItems = new Map<string, DynamicItemRecord>();
const runtimeSkills = new Map<string, DynamicSkillRecord>();
const runtimeRecipes = new Map<string, RecipeRecord>();
const runtimeDiscoveries = new Map<string, DiscoverySeedRecord>();
const runtimeAliases = new Map<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>();

const snapshotCache = { at: 0, data: null as ContentSnapshot | null };

type ContentSnapshot = {
  items: Record<string, ItemMetaRecord>;
  dynamicItems: Record<string, DynamicItemRecord>;
  skills: Record<string, DynamicSkillRecord>;
  skillPrereqs: Record<string, string[]>;
  intentSkills: Record<string, string[]>;
  herbCatalog: HerbCatalogEntry[];
  discoveries: DiscoverySeedRecord[];
  aliases: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>;
  recipes: Record<string, RecipeRecord>;
  source: "seed" | "airtable" | "hybrid";
};

type AirtableRecord = { id: string; fields: Record<string, unknown> };

function normalizeText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseLocal(value: string) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function uniqueList(values: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueList(value.map((entry) => String(entry)));
  if (typeof value === "string") return uniqueList(value.split(/[;,|]/g).map((entry) => entry.trim()));
  return [];
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function airtableConfig() {
  const apiKey = process.env.AIRTABLE_API_KEY ?? "";
  const baseId = process.env.AIRTABLE_BASE_ID ?? "";
  if (!apiKey || !baseId) return null;
  return {
    apiKey,
    baseId,
    tableItems: process.env.AIRTABLE_TABLE_ITEMS ?? "Items",
    tableSkills: process.env.AIRTABLE_TABLE_SKILLS ?? "Skills",
    tableRecipes: process.env.AIRTABLE_TABLE_RECIPES ?? "Recipes",
    tableDiscoveries: process.env.AIRTABLE_TABLE_DISCOVERIES ?? "Discoveries",
    tableAliases: process.env.AIRTABLE_TABLE_ALIASES ?? "Aliases",
    tableIntentSkills: process.env.AIRTABLE_TABLE_INTENT_SKILLS ?? "Intent Skills",
    tableHerbCatalog: process.env.AIRTABLE_TABLE_HERB_CATALOG ?? "Herb Catalog"
  };
}

async function airtableListRecords(tableName: string) {
  const cfg = airtableConfig();
  if (!cfg) return [] as AirtableRecord[];
  const results: AirtableRecord[] = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    if (!response.ok) throw new Error(`Airtable ${tableName} fetch failed with ${response.status}`);
    const json = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    results.push(...(json.records ?? []));
    offset = json.offset ?? "";
  } while (offset);
  return results;
}

function buildSeedAliases() {
  const out: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }> = {};
  for (const discovery of SEED_DISCOVERIES) {
    for (const alias of discovery.aliases ?? []) {
      out[normalizeText(alias)] = { canonicalType: discovery.type, canonicalKey: discovery.targetKey, confidenceBoost: 0.18 };
    }
  }
  return out;
}

function mergeItems(seed: Record<string, ItemMetaRecord>, dynamicItems: Record<string, DynamicItemRecord>) {
  const out = { ...seed };
  for (const item of Object.values(dynamicItems)) {
    out[item.itemKey] = {
      name: item.name ?? titleCaseLocal(item.itemKey),
      description: item.description ?? `A content entry for ${titleCaseLocal(item.itemKey)}.`
    };
  }
  return out;
}

async function loadAirtableSnapshot() {
  const cfg = airtableConfig();
  if (!cfg) {
    return {
      items: {} as Record<string, ItemMetaRecord>,
      dynamicItems: {} as Record<string, DynamicItemRecord>,
      skills: {} as Record<string, DynamicSkillRecord>,
      skillPrereqs: {} as Record<string, string[]>,
      intentSkills: {} as Record<string, string[]>,
      herbCatalog: [] as HerbCatalogEntry[],
      discoveries: [] as DiscoverySeedRecord[],
      aliases: {} as Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>,
      recipes: {} as Record<string, RecipeRecord>,
      source: "seed" as const
    };
  }

  const [itemRows, skillRows, recipeRows, discoveryRows, aliasRows, intentRows, herbRows] = await Promise.all([
    airtableListRecords(cfg.tableItems),
    airtableListRecords(cfg.tableSkills),
    airtableListRecords(cfg.tableRecipes),
    airtableListRecords(cfg.tableDiscoveries),
    airtableListRecords(cfg.tableAliases),
    airtableListRecords(cfg.tableIntentSkills),
    airtableListRecords(cfg.tableHerbCatalog)
  ]);

  const dynamicItems: Record<string, DynamicItemRecord> = {};
  for (const row of itemRows) {
    const itemKey = String(row.fields.itemKey ?? row.fields.key ?? "").trim();
    if (!itemKey) continue;
    dynamicItems[itemKey] = {
      itemKey,
      name: String(row.fields.name ?? titleCaseLocal(itemKey)),
      description: String(row.fields.description ?? `A content entry for ${titleCaseLocal(itemKey)}.`),
      category: row.fields.category ? String(row.fields.category) : undefined,
      preferredSkills: asArray(row.fields.preferredSkills),
      requiredTerrain: asArray(row.fields.requiredTerrain),
      synonyms: asArray(row.fields.synonyms),
      discoverable: Boolean(row.fields.discoverable ?? true),
      status: row.fields.status ? String(row.fields.status) : "active"
    };
  }

  const skills: Record<string, DynamicSkillRecord> = {};
  const skillPrereqs: Record<string, string[]> = {};
  for (const row of skillRows) {
    const skillKey = String(row.fields.skillKey ?? row.fields.key ?? "").trim().toUpperCase();
    if (!skillKey) continue;
    const prereqs = asArray(row.fields.prereqs).map((entry) => entry.toUpperCase());
    skills[skillKey] = {
      skillKey,
      name: String(row.fields.name ?? titleCaseLocal(skillKey)),
      description: String(row.fields.description ?? `${titleCaseLocal(skillKey)} is available.`),
      unlockHint: String(row.fields.unlockHint ?? `Discover ${titleCaseLocal(skillKey)} through play.`),
      prereqs,
      discoverable: Boolean(row.fields.discoverable ?? true),
      status: row.fields.status ? String(row.fields.status) : "active"
    };
    if (prereqs.length) skillPrereqs[skillKey] = prereqs;
  }

  const recipes: Record<string, RecipeRecord> = {};
  for (const row of recipeRows) {
    const recipeKey = String(row.fields.recipeKey ?? row.fields.key ?? "").trim();
    if (!recipeKey) continue;
    recipes[recipeKey] = {
      recipeKey,
      name: String(row.fields.name ?? titleCaseLocal(recipeKey)),
      inputs: parseJson(row.fields.inputsJson, []),
      outputs: parseJson(row.fields.outputsJson, []),
      tools: parseJson(row.fields.toolsJson, []),
      station: row.fields.station ? String(row.fields.station) : undefined,
      keywords: asArray(row.fields.keywords)
    };
  }

  const discoveries: DiscoverySeedRecord[] = [];
  for (const row of discoveryRows) {
    const targetKey = String(row.fields.targetKey ?? row.fields.key ?? "").trim();
    if (!targetKey) continue;
    const type = String(row.fields.type ?? "item") as DiscoverySeedRecord["type"];
    const item = dynamicItems[targetKey] ?? null;
    const skill = row.fields.skillKey ? skills[String(row.fields.skillKey).toUpperCase()] ?? null : null;
    const recipe = row.fields.recipeKey ? recipes[String(row.fields.recipeKey)] ?? null : null;
    discoveries.push({
      discoveryKey: String(row.fields.discoveryKey ?? `discovery_${targetKey}`),
      type,
      targetKey,
      aliases: asArray(row.fields.aliases),
      reason: row.fields.reason ? String(row.fields.reason) : undefined,
      terrainRules: asArray(row.fields.terrainRules),
      intentRules: asArray(row.fields.intentRules),
      confidenceMin: Number(row.fields.confidenceMin ?? 0.6),
      autoCreate: Boolean(row.fields.autoCreate ?? true),
      status: row.fields.status ? String(row.fields.status) : "active",
      item: type === "item" ? item : null,
      skill,
      recipe
    });
  }

  const aliases: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }> = {};
  for (const row of aliasRows) {
    const alias = normalizeText(String(row.fields.alias ?? ""));
    if (!alias) continue;
    aliases[alias] = {
      canonicalType: String(row.fields.canonicalType ?? "item"),
      canonicalKey: String(row.fields.canonicalKey ?? row.fields.targetKey ?? ""),
      confidenceBoost: Number(row.fields.confidenceBoost ?? 0.18)
    };
  }

  const intentSkills: Record<string, string[]> = {};
  for (const row of intentRows) {
    const intentKey = String(row.fields.intentKey ?? row.fields.intent ?? "").trim().toUpperCase();
    if (!intentKey) continue;
    intentSkills[intentKey] = asArray(row.fields.skills).map((entry) => entry.toUpperCase());
  }

  const herbCatalog: HerbCatalogEntry[] = herbRows
    .map((row) => ({ key: String(row.fields.key ?? "").trim(), weight: Number(row.fields.weight ?? 1), terrain: asArray(row.fields.terrain) }))
    .filter((entry) => entry.key);

  return { items: mergeItems({}, dynamicItems), dynamicItems, skills, skillPrereqs, intentSkills, herbCatalog, discoveries, aliases, recipes, source: "airtable" as const };
}

async function buildSnapshot(force = false): Promise<ContentSnapshot> {
  const ttlMs = 30_000;
  if (!force && snapshotCache.data && Date.now() - snapshotCache.at < ttlMs) return snapshotCache.data;
  const airtable = await loadAirtableSnapshot().catch(() => ({ items: {}, dynamicItems: {}, skills: {}, skillPrereqs: {}, intentSkills: {}, herbCatalog: [], discoveries: [], aliases: {}, recipes: {}, source: "seed" as const }));

  const dynamicItems: Record<string, DynamicItemRecord> = {};
  for (const discovery of SEED_DISCOVERIES) if (discovery.item) dynamicItems[discovery.item.itemKey] = discovery.item;
  Object.assign(dynamicItems, airtable.dynamicItems);
  for (const [key, item] of runtimeItems) dynamicItems[key] = item;

  const skills: Record<string, DynamicSkillRecord> = { ...SEED_SKILLS, ...airtable.skills };
  for (const [key, skill] of runtimeSkills) skills[key] = skill;

  const recipes: Record<string, RecipeRecord> = { ...airtable.recipes };
  for (const [key, recipe] of runtimeRecipes) recipes[key] = recipe;

  const discoveries = [...SEED_DISCOVERIES, ...airtable.discoveries, ...Array.from(runtimeDiscoveries.values())];
  const aliases = { ...buildSeedAliases(), ...airtable.aliases };
  for (const discovery of discoveries) {
    for (const alias of discovery.aliases ?? []) {
      aliases[normalizeText(alias)] = { canonicalType: discovery.type, canonicalKey: discovery.targetKey, confidenceBoost: 0.18 };
    }
  }
  for (const [alias, record] of runtimeAliases) aliases[alias] = record;

  const skillPrereqs = { ...SEED_SKILL_PREREQS, ...airtable.skillPrereqs };
  for (const [key, skill] of Object.entries(skills)) {
    if (skill.prereqs?.length) skillPrereqs[key] = skill.prereqs.map((entry) => entry.toUpperCase());
  }
  const intentSkills = { ...SEED_INTENT_SKILLS, ...airtable.intentSkills };
  const herbCatalog = airtable.herbCatalog.length ? airtable.herbCatalog : SEED_HERB_CATALOG;
  const items = mergeItems(SEED_ITEMS, dynamicItems);
  const source = airtable.source === "airtable" ? "hybrid" : "seed";

  snapshotCache.data = { items, dynamicItems, skills, skillPrereqs, intentSkills, herbCatalog, discoveries, aliases, recipes, source };
  snapshotCache.at = Date.now();
  return snapshotCache.data;
}

app.get("/api/v1/content/snapshot", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const snapshot = await buildSnapshot(String(req.query.force ?? "") === "1");
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, snapshot);
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CONTENT_SNAPSHOT_FAILED", error instanceof Error ? error.message : "Content snapshot failed", 500);
  }
});

app.get("/api/v1/content/items/:itemKey", async (req, res) => {
  const requestId = getRequestId(req);
  const snapshot = await buildSnapshot();
  const itemKey = String(req.params.itemKey ?? "").trim();
  const item = snapshot.dynamicItems[itemKey];
  const meta = snapshot.items[itemKey];
  if (!item && !meta) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ITEM_NOT_FOUND", "Item not found", 404);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { itemKey, item: item ?? { itemKey, name: meta?.name ?? titleCaseLocal(itemKey), description: meta?.description ?? `${titleCaseLocal(itemKey)}.` } });
});

app.post("/api/v1/content/find-alias", async (req, res) => {
  const requestId = getRequestId(req);
  const snapshot = await buildSnapshot();
  const query = normalizeText(String(req.body.term ?? req.body.query ?? ""));
  const direct = snapshot.aliases[query] ?? null;
  if (direct) return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { alias: query, match: direct });
  const fuzzy = Object.entries(snapshot.aliases).find(([alias]) => query.includes(alias) || alias.includes(query));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { alias: query, match: fuzzy ? fuzzy[1] : null });
});

app.get("/api/v1/content/discoveries", async (req, res) => {
  const requestId = getRequestId(req);
  const snapshot = await buildSnapshot();
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { discoveries: snapshot.discoveries, aliases: snapshot.aliases });
});

app.get("/api/v1/content/unidentified-categories", async (req, res) => {
  const requestId = getRequestId(req);
  const snapshot = await buildSnapshot();
  const herbDiscovery = snapshot.discoveries.find((entry) => entry.targetKey === "unidentified_herb" && entry.type === "item");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    categories: [
      {
        categoryKey: "unidentified_herb",
        itemKey: "unidentified_herb",
        name: snapshot.items.unidentified_herb?.name ?? "Unidentified Herb",
        description: snapshot.items.unidentified_herb?.description ?? "A gathered herb that still needs to be identified.",
        identifyAction: "IDENTIFY_HERB",
        aliases: herbDiscovery?.aliases ?? [],
        possibleResults: snapshot.herbCatalog.map((entry) => `herb_${entry.key}`)
      }
    ]
  });
});

app.post("/api/v1/content/upsert-runtime", async (req, res) => {
  const requestId = getRequestId(req);
  const item = req.body.item as DynamicItemRecord | undefined;
  const skill = req.body.skill as DynamicSkillRecord | undefined;
  const recipe = req.body.recipe as RecipeRecord | undefined;
  const discovery = req.body.discovery as DiscoverySeedRecord | undefined;
  const aliasPairs = Array.isArray(req.body.aliases) ? req.body.aliases as Array<{ alias: string; canonicalType: string; canonicalKey: string; confidenceBoost?: number }> : [];

  if (item?.itemKey) runtimeItems.set(item.itemKey, item);
  if (skill?.skillKey) runtimeSkills.set(String(skill.skillKey).toUpperCase(), { ...skill, skillKey: String(skill.skillKey).toUpperCase() });
  if (recipe?.recipeKey) runtimeRecipes.set(recipe.recipeKey, recipe);
  if (discovery?.discoveryKey) runtimeDiscoveries.set(discovery.discoveryKey, discovery);
  for (const entry of aliasPairs) {
    const alias = normalizeText(entry.alias);
    if (alias) runtimeAliases.set(alias, { canonicalType: entry.canonicalType, canonicalKey: entry.canonicalKey, confidenceBoost: entry.confidenceBoost });
  }
  snapshotCache.at = 0;
  const snapshot = await buildSnapshot(true);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ok: true, source: airtableConfig() ? "airtable-configured" : "runtime", snapshot });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
