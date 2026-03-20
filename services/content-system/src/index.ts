import { SERVICE_VERSION, airtableEnabled, airtableEnsureTable, airtableUpsertByField, createServiceApp, getRequestId, sendError, sendSuccess } from "../../../packages/shared/src/index";
import { SEED_DISCOVERIES, SEED_HERB_CATALOG, SEED_INTENT_SKILLS, SEED_ITEMS, SEED_SKILLS, SEED_SKILL_PREREQS, type DiscoverySeedRecord, type DynamicItemRecord, type DynamicSkillRecord, type HerbCatalogEntry, type ItemMetaRecord, type RecipeRecord } from "./seed";

const SERVICE_NAME = "content-system";
const PORT = 41743;
const app = createServiceApp(SERVICE_NAME);

const runtimeItems = new Map<string, DynamicItemRecord>();
const runtimeSkills = new Map<string, DynamicSkillRecord>();
const runtimeRecipes = new Map<string, RecipeRecord>();
const runtimeDiscoveries = new Map<string, DiscoverySeedRecord>();
const runtimeAliases = new Map<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>();
let airtableTablesReady = false;

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
  const apiKey = process.env.AIRTABLE_TOKEN ?? process.env.AIRTABLE_API_KEY ?? "";
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

async function ensureAirtableContentTables() {
  if (!airtableEnabled() || airtableTablesReady) return;
  const cfg = airtableConfig();
  if (!cfg) return;

  try {
    await Promise.all([
      airtableEnsureTable(cfg.tableItems, [
        { name: "itemKey", type: "singleLineText" },
        { name: "name", type: "singleLineText" },
        { name: "description", type: "multilineText" },
        { name: "category", type: "singleLineText" },
        { name: "preferredSkills", type: "multilineText" },
        { name: "requiredTerrain", type: "multilineText" },
        { name: "synonyms", type: "multilineText" },
        { name: "discoverable", type: "checkbox" },
        { name: "status", type: "singleLineText" }
      ]),
      airtableEnsureTable(cfg.tableSkills, [
        { name: "skillKey", type: "singleLineText" },
        { name: "name", type: "singleLineText" },
        { name: "description", type: "multilineText" },
        { name: "unlockHint", type: "multilineText" },
        { name: "prereqs", type: "multilineText" },
        { name: "discoverable", type: "checkbox" },
        { name: "status", type: "singleLineText" }
      ]),
      airtableEnsureTable(cfg.tableRecipes, [
        { name: "recipeKey", type: "singleLineText" },
        { name: "name", type: "singleLineText" },
        { name: "inputsJson", type: "multilineText" },
        { name: "outputsJson", type: "multilineText" },
        { name: "toolsJson", type: "multilineText" },
        { name: "station", type: "singleLineText" },
        { name: "keywords", type: "multilineText" }
      ]),
      airtableEnsureTable(cfg.tableDiscoveries, [
        { name: "discoveryKey", type: "singleLineText" },
        { name: "type", type: "singleLineText" },
        { name: "targetKey", type: "singleLineText" },
        { name: "aliases", type: "multilineText" },
        { name: "reason", type: "multilineText" },
        { name: "terrainRules", type: "multilineText" },
        { name: "intentRules", type: "multilineText" },
        { name: "confidenceMin", type: "number", options: { precision: 2 } },
        { name: "autoCreate", type: "checkbox" },
        { name: "status", type: "singleLineText" },
        { name: "skillKey", type: "singleLineText" },
        { name: "recipeKey", type: "singleLineText" }
      ]),
      airtableEnsureTable(cfg.tableAliases, [
        { name: "alias", type: "singleLineText" },
        { name: "canonicalType", type: "singleLineText" },
        { name: "canonicalKey", type: "singleLineText" },
        { name: "confidenceBoost", type: "number", options: { precision: 2 } }
      ]),
      airtableEnsureTable(cfg.tableIntentSkills, [
        { name: "intentKey", type: "singleLineText" },
        { name: "skills", type: "multilineText" }
      ]),
      airtableEnsureTable(cfg.tableHerbCatalog, [
        { name: "key", type: "singleLineText" },
        { name: "weight", type: "number", options: { precision: 0 } },
        { name: "terrain", type: "multilineText" }
      ])
    ]);

    airtableTablesReady = true;
    console.log(`[${SERVICE_NAME}] Airtable content tables ready`);
  } catch (error) {
    airtableTablesReady = false;
    console.warn(
      `[${SERVICE_NAME}] Airtable content table ensure failed; will retry on next snapshot`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
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

  await ensureAirtableContentTables();

  const safeList = async (tableName: string) => airtableListRecords(tableName).catch(() => [] as AirtableRecord[]);

  const [itemRows, skillRows, recipeRows, discoveryRows, aliasRows, intentRows, herbRows] = await Promise.all([
    safeList(cfg.tableItems),
    safeList(cfg.tableSkills),
    safeList(cfg.tableRecipes),
    safeList(cfg.tableDiscoveries),
    safeList(cfg.tableAliases),
    safeList(cfg.tableIntentSkills),
    safeList(cfg.tableHerbCatalog)
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
  if (!airtableEnabled()) {
    for (const [key, item] of runtimeItems) dynamicItems[key] = item;
  }

  const skills: Record<string, DynamicSkillRecord> = { ...SEED_SKILLS, ...airtable.skills };
  if (!airtableEnabled()) {
    for (const [key, skill] of runtimeSkills) skills[key] = skill;
  }

  const recipes: Record<string, RecipeRecord> = { ...airtable.recipes };
  if (!airtableEnabled()) {
    for (const [key, recipe] of runtimeRecipes) recipes[key] = recipe;
  }

  const discoveries = [...SEED_DISCOVERIES, ...airtable.discoveries, ...(airtableEnabled() ? [] : Array.from(runtimeDiscoveries.values()))];
  const aliases = { ...buildSeedAliases(), ...airtable.aliases };
  for (const discovery of discoveries) {
    for (const alias of discovery.aliases ?? []) {
      aliases[normalizeText(alias)] = { canonicalType: discovery.type, canonicalKey: discovery.targetKey, confidenceBoost: 0.18 };
    }
  }
  if (!airtableEnabled()) {
    for (const [alias, record] of runtimeAliases) aliases[alias] = record;
  }

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

app.post("/api/v1/content/upsert-runtime", async (req, res) => {
  const requestId = getRequestId(req);
  const item = req.body.item as DynamicItemRecord | undefined;
  const skill = req.body.skill as DynamicSkillRecord | undefined;
  const recipe = req.body.recipe as RecipeRecord | undefined;
  const discovery = req.body.discovery as DiscoverySeedRecord | undefined;
  const aliasPairs = Array.isArray(req.body.aliases) ? req.body.aliases as Array<{ alias: string; canonicalType: string; canonicalKey: string; confidenceBoost?: number }> : [];

  const cfg = airtableConfig();
  if (cfg && airtableEnabled()) {
    await ensureAirtableContentTables();
    if (item?.itemKey) {
      await airtableUpsertByField(cfg.tableItems, "itemKey", item.itemKey, {
        itemKey: item.itemKey,
        name: item.name,
        description: item.description,
        category: item.category,
        preferredSkills: item.preferredSkills ?? [],
        requiredTerrain: item.requiredTerrain ?? [],
        synonyms: item.synonyms ?? [],
        discoverable: item.discoverable ?? true,
        status: item.status ?? "active"
      });
    }
    if (skill?.skillKey) {
      const skillKey = String(skill.skillKey).toUpperCase();
      await airtableUpsertByField(cfg.tableSkills, "skillKey", skillKey, {
        skillKey,
        name: skill.name,
        description: skill.description,
        unlockHint: skill.unlockHint,
        prereqs: skill.prereqs ?? [],
        discoverable: skill.discoverable ?? true,
        status: skill.status ?? "active"
      });
    }
    if (recipe?.recipeKey) {
      await airtableUpsertByField(cfg.tableRecipes, "recipeKey", recipe.recipeKey, {
        recipeKey: recipe.recipeKey,
        name: recipe.name,
        inputsJson: JSON.stringify(recipe.inputs ?? []),
        outputsJson: JSON.stringify(recipe.outputs ?? []),
        toolsJson: JSON.stringify(recipe.tools ?? []),
        station: recipe.station ?? "FIELD",
        keywords: recipe.keywords ?? []
      });
    }
    if (discovery?.discoveryKey) {
      await airtableUpsertByField(cfg.tableDiscoveries, "discoveryKey", discovery.discoveryKey, {
        discoveryKey: discovery.discoveryKey,
        type: discovery.type,
        targetKey: discovery.targetKey,
        aliases: discovery.aliases ?? [],
        reason: discovery.reason ?? "",
        terrainRules: discovery.terrainRules ?? [],
        intentRules: discovery.intentRules ?? [],
        confidenceMin: Number(discovery.confidenceMin ?? 0.6),
        autoCreate: Boolean(discovery.autoCreate ?? true),
        status: discovery.status ?? "active",
        skillKey: discovery.skill?.skillKey ?? "",
        recipeKey: discovery.recipe?.recipeKey ?? ""
      });
    }
    for (const entry of aliasPairs) {
      const alias = normalizeText(entry.alias);
      if (!alias) continue;
      await airtableUpsertByField(cfg.tableAliases, "alias", alias, {
        alias,
        canonicalType: entry.canonicalType,
        canonicalKey: entry.canonicalKey,
        confidenceBoost: Number(entry.confidenceBoost ?? 0.18)
      });
    }
  } else {
    if (item?.itemKey) runtimeItems.set(item.itemKey, item);
    if (skill?.skillKey) runtimeSkills.set(String(skill.skillKey).toUpperCase(), { ...skill, skillKey: String(skill.skillKey).toUpperCase() });
    if (recipe?.recipeKey) runtimeRecipes.set(recipe.recipeKey, recipe);
    if (discovery?.discoveryKey) runtimeDiscoveries.set(discovery.discoveryKey, discovery);
    for (const entry of aliasPairs) {
      const alias = normalizeText(entry.alias);
      if (alias) runtimeAliases.set(alias, { canonicalType: entry.canonicalType, canonicalKey: entry.canonicalKey, confidenceBoost: entry.confidenceBoost });
    }
  }
  snapshotCache.at = 0;
  const snapshot = await buildSnapshot(true);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ok: true, source: cfg && airtableEnabled() ? "airtable" : "runtime", snapshot });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
