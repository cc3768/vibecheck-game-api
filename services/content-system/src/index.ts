import { createClient, type RedisClientType } from "redis";
import { SERVICE_VERSION, createServiceApp, getRequestId, sendError, sendSuccess } from "../../../packages/shared/src/index";
import {
  SEED_DISCOVERIES,
  SEED_HERB_CATALOG,
  SEED_INTENT_SKILLS,
  SEED_ITEMS,
  SEED_SKILLS,
  SEED_SKILL_PREREQS,
  type DiscoverySeedRecord,
  type DynamicItemRecord,
  type DynamicSkillRecord,
  type HerbCatalogEntry,
  type ItemMetaRecord,
  type RecipeRecord
} from "./seed";

const SERVICE_NAME = "content-system";
const PORT = Number(process.env.CONTENT_SYSTEM_PORT ?? 41743);
const app = createServiceApp(SERVICE_NAME);

type ContentSource = "redis" | "redis-seeded";
type AliasRecord = { canonicalType: string; canonicalKey: string; confidenceBoost?: number };
type ContentSnapshot = {
  items: Record<string, ItemMetaRecord>;
  dynamicItems: Record<string, DynamicItemRecord>;
  skills: Record<string, DynamicSkillRecord>;
  skillPrereqs: Record<string, string[]>;
  intentSkills: Record<string, string[]>;
  herbCatalog: HerbCatalogEntry[];
  discoveries: DiscoverySeedRecord[];
  aliases: Record<string, AliasRecord>;
  recipes: Record<string, RecipeRecord>;
  source: ContentSource;
};

type StoredContentSnapshot = Partial<ContentSnapshot> & {
  updatedAt?: number;
  seededAt?: number;
  schemaVersion?: number;
};

const SNAPSHOT_SCHEMA_VERSION = 2;
const SNAPSHOT_CACHE_TTL_MS = 5_000;
const snapshotCache = {
  at: 0,
  data: null as ContentSnapshot | null
};

let redisClientPromise: Promise<RedisClientType> | null = null;

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

function redisKey(name: string) {
  const prefix = String(process.env.REDIS_KEY_PREFIX ?? "vibecheck").trim() || "vibecheck";
  return `${prefix}:content:${name}`;
}

async function getRedis() {
  if (!redisClientPromise) {
    const url = String(process.env.REDIS_URL ?? "").trim();
    if (!url) throw new Error("REDIS_URL is required for redis-only content-system.");
    const client = createClient({ url });
    client.on("error", (error) => console.error(`[${SERVICE_NAME}] redis error`, error));
    redisClientPromise = client.connect().then(() => client);
  }
  return redisClientPromise;
}

function seedDynamicItems() {
  const out: Record<string, DynamicItemRecord> = {};
  for (const discovery of SEED_DISCOVERIES) {
    if (discovery.item?.itemKey) out[discovery.item.itemKey] = discovery.item;
  }
  return out;
}

function seedRecipes() {
  const out: Record<string, RecipeRecord> = {};
  for (const discovery of SEED_DISCOVERIES) {
    if (discovery.recipe?.recipeKey) out[discovery.recipe.recipeKey] = discovery.recipe;
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

function buildAliasesFromDiscoveries(discoveries: DiscoverySeedRecord[]) {
  const out: Record<string, AliasRecord> = {};
  for (const discovery of discoveries) {
    for (const alias of discovery.aliases ?? []) {
      const normalized = normalizeText(alias);
      if (!normalized) continue;
      out[normalized] = { canonicalType: discovery.type, canonicalKey: discovery.targetKey, confidenceBoost: 0.18 };
    }
  }
  return out;
}

function dedupeDiscoveries(discoveries: DiscoverySeedRecord[]) {
  const map = new Map<string, DiscoverySeedRecord>();
  for (const discovery of discoveries) {
    const key = String(discovery.discoveryKey ?? `discovery_${discovery.targetKey}`).trim();
    if (!key) continue;
    map.set(key, {
      ...discovery,
      discoveryKey: key,
      aliases: uniqueList(discovery.aliases ?? [])
    });
  }
  return Array.from(map.values());
}

function buildSeedSnapshot(source: ContentSource = "redis-seeded"): ContentSnapshot {
  const dynamicItems = seedDynamicItems();
  const skills = { ...SEED_SKILLS };
  const recipes = seedRecipes();
  const discoveries = dedupeDiscoveries([...SEED_DISCOVERIES]);
  const aliases = buildAliasesFromDiscoveries(discoveries);
  const skillPrereqs = { ...SEED_SKILL_PREREQS };
  for (const [skillKey, skill] of Object.entries(skills)) {
    if (skill.prereqs?.length) skillPrereqs[skillKey] = skill.prereqs.map((entry) => entry.toUpperCase());
  }
  return {
    items: mergeItems(SEED_ITEMS, dynamicItems),
    dynamicItems,
    skills,
    skillPrereqs,
    intentSkills: { ...SEED_INTENT_SKILLS },
    herbCatalog: [...SEED_HERB_CATALOG],
    discoveries,
    aliases,
    recipes,
    source
  };
}

function normalizeHerbCatalog(entries: unknown, fallback: HerbCatalogEntry[]) {
  if (!Array.isArray(entries) || !entries.length) return fallback;
  return entries
    .map((entry) => ({
      key: String((entry as { key?: unknown })?.key ?? "").trim(),
      weight: Number((entry as { weight?: unknown })?.weight ?? 1),
      terrain: Array.isArray((entry as { terrain?: unknown })?.terrain)
        ? uniqueList(((entry as { terrain?: unknown[] }).terrain ?? []).map((value) => String(value)))
        : []
    }))
    .filter((entry) => entry.key);
}

function normalizeSnapshot(stored: StoredContentSnapshot | null | undefined, source: ContentSource): ContentSnapshot {
  const seed = buildSeedSnapshot("redis-seeded");
  const dynamicItems = { ...seed.dynamicItems, ...((stored?.dynamicItems as Record<string, DynamicItemRecord> | undefined) ?? {}) };
  const skills = { ...seed.skills, ...((stored?.skills as Record<string, DynamicSkillRecord> | undefined) ?? {}) };
  const recipes = { ...seed.recipes, ...((stored?.recipes as Record<string, RecipeRecord> | undefined) ?? {}) };
  const discoveries = dedupeDiscoveries([
    ...seed.discoveries,
    ...(Array.isArray(stored?.discoveries) ? stored!.discoveries as DiscoverySeedRecord[] : [])
  ]);
  const aliases = {
    ...buildAliasesFromDiscoveries(discoveries),
    ...((stored?.aliases as Record<string, AliasRecord> | undefined) ?? {})
  };
  const skillPrereqs = {
    ...seed.skillPrereqs,
    ...((stored?.skillPrereqs as Record<string, string[]> | undefined) ?? {})
  };
  for (const [skillKey, skill] of Object.entries(skills)) {
    if (skill.prereqs?.length) skillPrereqs[skillKey] = uniqueList(skill.prereqs.map((entry) => String(entry).toUpperCase()));
  }
  const intentSkills = {
    ...seed.intentSkills,
    ...((stored?.intentSkills as Record<string, string[]> | undefined) ?? {})
  };
  const herbCatalog = normalizeHerbCatalog(stored?.herbCatalog, seed.herbCatalog);
  const items = mergeItems({ ...seed.items, ...((stored?.items as Record<string, ItemMetaRecord> | undefined) ?? {}) }, dynamicItems);

  return {
    items,
    dynamicItems,
    skills,
    skillPrereqs,
    intentSkills,
    herbCatalog,
    discoveries,
    aliases,
    recipes,
    source
  };
}

function snapshotToStored(snapshot: ContentSnapshot): StoredContentSnapshot {
  return {
    ...snapshot,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: Date.now(),
    seededAt: snapshot.source === "redis-seeded" ? Date.now() : undefined
  };
}

async function readStoredSnapshot(): Promise<StoredContentSnapshot | null> {
  const client = await getRedis();
  const raw = await client.get(redisKey("snapshot"));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredContentSnapshot;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: ContentSnapshot) {
  const client = await getRedis();
  const stored = snapshotToStored(snapshot);
  await client.set(redisKey("snapshot"), JSON.stringify(stored));
  snapshotCache.at = Date.now();
  snapshotCache.data = snapshot;
  return snapshot;
}

async function bootstrapSnapshot() {
  const snapshot = buildSeedSnapshot("redis-seeded");
  await writeSnapshot(snapshot);
  return snapshot;
}

async function buildSnapshot(force = false): Promise<ContentSnapshot> {
  if (!force && snapshotCache.data && Date.now() - snapshotCache.at < SNAPSHOT_CACHE_TTL_MS) return snapshotCache.data;
  const stored = await readStoredSnapshot();
  if (!stored) return bootstrapSnapshot();
  const source: ContentSource = stored.source === "redis-seeded" ? "redis-seeded" : "redis";
  const normalized = normalizeSnapshot(stored, source);
  snapshotCache.at = Date.now();
  snapshotCache.data = normalized;
  return normalized;
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

app.get("/api/v1/content/health", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const client = await getRedis();
    const snapshot = await buildSnapshot(String(req.query.force ?? "") === "1");
    const ping = await client.ping();
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      ok: ping === "PONG",
      source: snapshot.source,
      redisKey: redisKey("snapshot"),
      redisUrlConfigured: Boolean(process.env.REDIS_URL),
      ping
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CONTENT_HEALTH_FAILED", error instanceof Error ? error.message : "Content health failed", 500);
  }
});

app.get("/api/v1/content/items/:itemKey", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const snapshot = await buildSnapshot();
    const itemKey = String(req.params.itemKey ?? "").trim();
    const item = snapshot.dynamicItems[itemKey];
    const meta = snapshot.items[itemKey];
    if (!item && !meta) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ITEM_NOT_FOUND", "Item not found", 404);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      itemKey,
      item: item ?? {
        itemKey,
        name: meta?.name ?? titleCaseLocal(itemKey),
        description: meta?.description ?? `${titleCaseLocal(itemKey)}.`
      }
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ITEM_LOOKUP_FAILED", error instanceof Error ? error.message : "Item lookup failed", 500);
  }
});

app.post("/api/v1/content/find-alias", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const snapshot = await buildSnapshot();
    const query = normalizeText(String(req.body.term ?? req.body.query ?? ""));
    const direct = snapshot.aliases[query] ?? null;
    if (direct) return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { alias: query, match: direct });
    const fuzzy = Object.entries(snapshot.aliases).find(([alias]) => query.includes(alias) || alias.includes(query));
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { alias: query, match: fuzzy ? fuzzy[1] : null });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ALIAS_LOOKUP_FAILED", error instanceof Error ? error.message : "Alias lookup failed", 500);
  }
});

app.get("/api/v1/content/discoveries", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const snapshot = await buildSnapshot();
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { discoveries: snapshot.discoveries, aliases: snapshot.aliases });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "DISCOVERIES_FAILED", error instanceof Error ? error.message : "Discovery list failed", 500);
  }
});

app.get("/api/v1/content/unidentified-categories", async (req, res) => {
  const requestId = getRequestId(req);
  try {
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
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "UNIDENTIFIED_CATEGORIES_FAILED", error instanceof Error ? error.message : "Unidentified categories failed", 500);
  }
});

app.post("/api/v1/content/upsert-runtime", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const snapshot = await buildSnapshot(true);
    const next: ContentSnapshot = JSON.parse(JSON.stringify(snapshot)) as ContentSnapshot;
    const item = req.body.item as DynamicItemRecord | undefined;
    const skill = req.body.skill as DynamicSkillRecord | undefined;
    const recipe = req.body.recipe as RecipeRecord | undefined;
    const discovery = req.body.discovery as DiscoverySeedRecord | undefined;
    const aliasPairs = Array.isArray(req.body.aliases)
      ? (req.body.aliases as Array<{ alias: string; canonicalType: string; canonicalKey: string; confidenceBoost?: number }>)
      : [];

    if (item?.itemKey) {
      next.dynamicItems[item.itemKey] = item;
      next.items[item.itemKey] = {
        name: item.name ?? titleCaseLocal(item.itemKey),
        description: item.description ?? `${titleCaseLocal(item.itemKey)}.`
      };
    }
    if (skill?.skillKey) {
      const skillKey = String(skill.skillKey).toUpperCase();
      next.skills[skillKey] = { ...skill, skillKey };
      if (skill.prereqs?.length) next.skillPrereqs[skillKey] = uniqueList(skill.prereqs.map((entry) => String(entry).toUpperCase()));
    }
    if (recipe?.recipeKey) next.recipes[recipe.recipeKey] = recipe;
    if (discovery?.discoveryKey) {
      next.discoveries = dedupeDiscoveries([...next.discoveries, { ...discovery, aliases: uniqueList(discovery.aliases ?? []) }]);
    }
    for (const entry of aliasPairs) {
      const alias = normalizeText(entry.alias);
      if (!alias) continue;
      next.aliases[alias] = {
        canonicalType: entry.canonicalType,
        canonicalKey: entry.canonicalKey,
        confidenceBoost: entry.confidenceBoost
      };
    }

    next.discoveries = dedupeDiscoveries(next.discoveries);
    next.aliases = { ...buildAliasesFromDiscoveries(next.discoveries), ...next.aliases };
    next.items = mergeItems(next.items, next.dynamicItems);
    next.source = "redis";

    const persisted = await writeSnapshot(next);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ok: true, source: persisted.source, snapshot: persisted });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "UPSERT_RUNTIME_FAILED", error instanceof Error ? error.message : "Content upsert failed", 500);
  }
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
