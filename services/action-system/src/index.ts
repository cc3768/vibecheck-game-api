import { SERVICE_VERSION, createServiceApp, getRequestId, getServiceUrl, nowIso, sendError, sendSuccess } from "../../../packages/shared/src/index";
import type { CharacterRecord, XpActionRecord } from "../../../packages/shared/src/index";

const SERVICE_NAME = "action-system";
const PORT = 41736;
const app = createServiceApp(SERVICE_NAME);

const history = new Map<string, Array<Record<string, unknown>>>();

const FALLBACK_SKILL_PREREQS: Record<string, string[]> = {
  GENERAL: [],
  SURVIVAL: ["GENERAL"],
  SOCIAL: ["GENERAL"],
  EXPLORATION: ["GENERAL"],
  WOODCUTTING: ["GENERAL"],
  FORAGING: ["GENERAL"],
  MINING: ["GENERAL"],
  BUILDING: ["GENERAL"],
  FISHING: ["GENERAL"],
  FARMING: ["GENERAL"],
  COOKING: ["GENERAL"],
  CRAFTING: ["GENERAL"],
  COMBAT: ["GENERAL"],
  TRACKING: ["SURVIVAL"],
  STEALTH: ["SURVIVAL"],
  HEALING: ["SURVIVAL"],
  MAGIC: ["GENERAL"],
  RITUALS: ["MAGIC"],
  KNAPPING: ["CRAFTING"],
  LAPIDARY: ["MINING"],
  WEAVING: ["FORAGING"],
  MASONRY: ["BUILDING"],
  ALCHEMY: ["CRAFTING"]
};

const FALLBACK_INTENT_SKILLS: Record<string, string[]> = {
  FISH: ["FISHING", "SURVIVAL"],
  COOK_FISH: ["COOKING", "FISHING"],
  OBSERVE: ["GENERAL"],
  SCOUT: ["GENERAL", "EXPLORATION"],
  FORAGE: ["FORAGING", "SURVIVAL"],
  WATER_COLLECT: ["GENERAL", "SURVIVAL"],
  WATER_USE: ["GENERAL"],
  WOODCUT: ["WOODCUTTING", "SURVIVAL"],
  MINE: ["MINING", "SURVIVAL"],
  DROP_ITEM: ["GENERAL"],
  SPLIT_ITEM: ["GENERAL"],
  UNPACK_HERB_BUNDLE: ["GENERAL"],
  IDENTIFY_HERB: ["GENERAL", "FORAGING"],
  CRAFT_RECIPE: ["CRAFTING"],
  BREW_TEA: ["COOKING", "GENERAL"],
  BUILD: ["BUILDING", "GENERAL"],
  REST: ["GENERAL"],
  SOCIAL: ["SOCIAL", "GENERAL"],
  RITUAL: ["RITUALS", "MAGIC"],
  MAGIC: ["MAGIC", "GENERAL"],
  GENERAL: ["GENERAL"]
};

const FALLBACK_ITEM_META: Record<string, { name: string; description: string }> = {
  raw_fish: { name: "Raw Fish", description: "A freshly caught fish, still wet from the water." },
  cooked_fish: { name: "Cooked Fish", description: "A fish roasted over a fire until it flakes apart." },
  cooked_perch: { name: "Cooked Perch", description: "A river perch roasted over coals — firm and fragrant." },
  cooked_catfish: { name: "Cooked Catfish", description: "Catfish roasted whole, smoky and rich." },
  charred_fish: { name: "Charred Fish", description: "A fish badly burnt over an uncontrolled fire. Still edible, barely." },
  small_fish: { name: "Small Fish", description: "A small catch — bony but edible." },
  river_perch: { name: "River Perch", description: "A firm-fleshed river fish with striped sides." },
  catfish: { name: "Catfish", description: "A whiskered bottom-dweller, good eating if you gut it right." },
  mudfish: { name: "Mudfish", description: "A murky-water fish. Edible but unpleasant." },
  fishing_line: { name: "Fishing Line", description: "A length of twisted fiber line, usable for a basic fishing rig." },
  fishing_hook: { name: "Fishing Hook", description: "A simple bent-bone or stone hook for catching fish." },
  fishing_rod: { name: "Fishing Rod", description: "A sturdy rod with line attached, ready for casting." },
  bait: { name: "Bait", description: "Grubs, worms, or scraps suitable for baiting a hook." },
  unidentified_herb: { name: "Unidentified Herb", description: "A fresh plant you have not classified yet." },
  raw_herb: { name: "Raw Herb", description: "A loose herb fit for simple medicine or tea." },
  stem_fiber: { name: "Stem Fiber", description: "Tough plant fibers useful in primitive craft." },
  bitter_root: { name: "Bitter Root", description: "Edible, but unpleasant and sharp on the tongue." },
  wild_berry: { name: "Wild Berry", description: "Small tart berries picked from a bush. Edible, though some are more sour than sweet." },
  strange_seed: { name: "Strange Seed", description: "A seed of unknown origin that may sprout later." },
  fresh_water: { name: "Fresh Water", description: "Clear water collected from a nearby source." },
  bark_strip: { name: "Bark Strip", description: "Rough bark stripped from green wood." },
  wood_log: { name: "Wood Log", description: "A sturdy section of usable wood." },
  iron_ore: { name: "Iron Ore", description: "Ore that could be smelted with proper heat and tools." },
  stone_chunk: { name: "Stone Chunk", description: "A workable chunk of hard stone." },
  shale_fragment: { name: "Shale Fragment", description: "A brittle shard split from poor stone." },
  splintered_bark: { name: "Splintered Bark", description: "Shredded bark left from a bad cut." },
  scrap: { name: "Scrap", description: "A ruined or low-value leftover from a failed attempt." },
  kindling: { name: "Kindling", description: "Small pieces of split wood useful for fire-starting." },
  charred_slurry: { name: "Charred Slurry", description: "A blackened ruined mixture from a failed brew." },
  ritual_ash: { name: "Ritual Ash", description: "A faintly charged ash left after unstable magic." },
  wooden_frame: { name: "Wooden Frame", description: "A simple wooden structure base." },
  stone_marker: { name: "Stone Marker", description: "A carved stone used to mark a place." },
  herb_moonmint: { name: "Moonmint", description: "A cool minty herb often steeped into tea." },
  herb_sunroot: { name: "Sunroot", description: "A bright root with warming properties." },
  herb_silverleaf: { name: "Silverleaf", description: "A calming leaf with a silvery underside." },
  herb_bitterwort: { name: "Bitterwort", description: "Sharp and medicinal in very small doses." },
  herb_pine_needles: { name: "Pine Needles", description: "Needles with a clean resin scent." },
  tea_moonmint: { name: "Moonmint Tea", description: "A cool, soothing herbal tea." },
  tea_sunroot: { name: "Sunroot Tea", description: "A bright warming tea with a sharp finish." },
  tea_silverleaf: { name: "Silverleaf Tea", description: "A calming silverleaf infusion." },
  tea_bitterwort: { name: "Bitterwort Tea", description: "A harsh but medicinal brew." },
  tea_pine_needles: { name: "Pine Needle Tea", description: "A clear forest-scented tea." },
  herbal_tea: { name: "Herbal Tea", description: "A basic brewed herb drink." }
};

const FALLBACK_HERB_CATALOG = [
  { key: "moonmint", weight: 2, terrain: ["forest", "grass"] },
  { key: "sunroot", weight: 1, terrain: ["grass", "sand"] },
  { key: "silverleaf", weight: 2, terrain: ["forest", "grass"] },
  { key: "bitterwort", weight: 1, terrain: ["rock", "grass"] },
  { key: "pine_needles", weight: 2, terrain: ["forest"] }
];

type ContentSnapshot = {
  items: Record<string, { name: string; description: string }>;
  dynamicItems: Record<string, DynamicItemRecord>;
  skills: Record<string, DynamicSkillRecord>;
  skillPrereqs: Record<string, string[]>;
  intentSkills: Record<string, string[]>;
  herbCatalog: Array<{ key: string; weight: number; terrain: string[] }>;
  discoveries: Array<Record<string, unknown>>;
  aliases: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>;
  recipes: Record<string, RecipeRecord>;
  source: string;
};

const contentCache: ContentSnapshot = {
  items: { ...FALLBACK_ITEM_META },
  dynamicItems: {},
  skills: {},
  skillPrereqs: { ...FALLBACK_SKILL_PREREQS },
  intentSkills: { ...FALLBACK_INTENT_SKILLS },
  herbCatalog: [...FALLBACK_HERB_CATALOG],
  discoveries: [],
  aliases: {},
  recipes: {},
  source: "seed"
};
let contentCacheAt = 0;

async function ensureContentCache(force = false) {
  const ttlMs = 30_000;
  if (!force && Date.now() - contentCacheAt < ttlMs) return contentCache;
  try {
    const snapshot = await serviceFetch<ContentSnapshot>("content-system", "/api/v1/content/snapshot");
    contentCache.items = { ...FALLBACK_ITEM_META, ...(snapshot.items ?? {}) };
    contentCache.dynamicItems = snapshot.dynamicItems ?? {};
    contentCache.skills = snapshot.skills ?? {};
    contentCache.skillPrereqs = { ...FALLBACK_SKILL_PREREQS, ...(snapshot.skillPrereqs ?? {}) };
    contentCache.intentSkills = { ...FALLBACK_INTENT_SKILLS, ...(snapshot.intentSkills ?? {}) };
    contentCache.herbCatalog = snapshot.herbCatalog?.length ? snapshot.herbCatalog : [...FALLBACK_HERB_CATALOG];
    contentCache.discoveries = snapshot.discoveries ?? [];
    contentCache.aliases = snapshot.aliases ?? {};
    contentCache.recipes = snapshot.recipes ?? {};
    contentCache.source = snapshot.source ?? "seed";
    contentCacheAt = Date.now();
  } catch {
    if (!contentCacheAt) contentCacheAt = Date.now();
  }
  return contentCache;
}

function itemMetaFor(itemKey: string) {
  return contentCache.items[itemKey] ?? FALLBACK_ITEM_META[itemKey] ?? null;
}

function skillPrereqsFor(skill: string | null | undefined) {
  const normalized = String(skill ?? "GENERAL").toUpperCase();
  return contentCache.skillPrereqs[normalized] ?? FALLBACK_SKILL_PREREQS[normalized] ?? ["GENERAL"];
}

function intentSkillsFor(intent: string) {
  const normalized = String(intent ?? "GENERAL").toUpperCase();
  return contentCache.intentSkills[normalized] ?? FALLBACK_INTENT_SKILLS[normalized] ?? ["GENERAL"];
}

function herbCatalog() {
  return contentCache.herbCatalog?.length ? contentCache.herbCatalog : FALLBACK_HERB_CATALOG;
}


type RecipeRecord = {
  recipeKey: string;
  name: string;
  inputs: Array<{ itemKey: string; amount: number }>;
  outputs: Array<{ itemKey: string; amount: number }>;
  tools?: Array<{ toolKey: string }>;
  station?: string;
  keywords?: string[];
};

type DynamicItemRecord = {
  itemKey: string;
  name: string;
  description: string;
  category?: string;
  preferredSkills?: string[];
  requiredTerrain?: string[];
  synonyms?: string[];
};

type DynamicSkillRecord = {
  skillKey: string;
  name: string;
  description: string;
  unlockHint: string;
};

type DiscoveryRecord = {
  item: DynamicItemRecord | null;
  skill: DynamicSkillRecord | null;
  recipe: RecipeRecord | null;
  message?: string | null;
};

type ActionDraft = Record<string, unknown> & {
  actionType?: string;
  actionIntent?: string;
  primarySkill?: string;
  secondarySkill?: string | null;
  note?: string;
  context?: Record<string, unknown>;
};

type ActionPlan = {
  category: string;
  intent: string;
  primarySkill: string;
  secondarySkill: string | null;
  note: string;
  nearbyTerrain: string[];
  nearbyObjects: string[];
  discoveredSkills: string[];
  requiredSkills: string[];
  recipe: RecipeRecord | null;
  discovery: DiscoveryRecord | null;
  dropTarget: { itemKey: string; amount: number } | null;
  splitTarget: { itemKey: string; amount: number } | null;
  allowed: boolean;
  reasons: string[];
};

type ActionOutcome = {
  category: string;
  intent: string;
  success: boolean;
  catastrophic: boolean;
  roll: number;
  successChance: number;
  inventoryChanges: Record<string, number>;
  vitalChanges: Record<string, number>;
  rewards: Array<{ itemKey: string; amount: number }>;
  consumed: Array<{ itemKey: string; amount: number }>;
  drawbacks: Array<{ type: string; amount: number; reason: string }>;
  itemMeta: Record<string, { name: string; description: string }>;
  discoveredSkills?: string[];
  message: string;
};

function actionHistory(characterId: string) {
  return history.get(characterId) ?? [];
}

function saveHistory(characterId: string, entries: Array<Record<string, unknown>>) {
  history.set(characterId, entries.slice(-300));
}

function combineDelta(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + Number(value ?? 0);
    if (!target[key]) delete target[key];
  }
}

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

function inventoryLabel(itemKey: string) {
  return itemMetaFor(itemKey)?.name ?? titleCaseLocal(itemKey);
}

function getSkillLevel(character: CharacterRecord, skill: string | null | undefined) {
  if (!skill) return 0;
  return character.skills.find((entry) => entry.skill === String(skill).toUpperCase())?.level ?? 0;
}

function discoveredSkills(character: CharacterRecord) {
  return new Set(["GENERAL", ...character.skills.map((entry) => entry.skill.toUpperCase())]);
}

function dynamicMetaRecord(item: DynamicItemRecord | null | undefined) {
  if (!item?.itemKey) return {};
  return { [item.itemKey]: { name: item.name ?? titleCaseLocal(item.itemKey), description: item.description ?? `A discovered item called ${titleCaseLocal(item.itemKey)}.` } };
}

function recipeMetaRecord(recipe: RecipeRecord | null | undefined) {
  if (!recipe) return {};
  const out: Record<string, { name: string; description: string }> = {};
  for (const output of recipe.outputs ?? []) {
    const knownMeta = itemMetaFor(output.itemKey);
    if (knownMeta) {
      out[output.itemKey] = knownMeta;
    } else {
      out[output.itemKey] = { name: titleCaseLocal(output.itemKey), description: `A crafted item produced by ${recipe.name}.` };
    }
  }
  return out;
}

function mergeMetaMaps(...maps: Array<Record<string, { name: string; description: string }> | null | undefined>) {
  const out: Record<string, { name: string; description: string }> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) out[key] = value;
  }
  return out;
}

async function discoverContent(note: string, intent: string, nearbyTerrain: string[], nearbyObjects: string[], character: CharacterRecord): Promise<DiscoveryRecord | null> {
  if (!note.trim()) return null;
  try {
    const analysis = await serviceFetch<{ result?: { proposals?: Array<Record<string, unknown>>; confidence?: number; target?: { text?: string; normalizedKey?: string; type?: string } } }>("ai-system", "/api/v1/ai/analyze-action", "POST", {
      note,
      intent,
      nearbyTerrain,
      nearbyObjects,
      knownSkills: character.skills.map((entry) => entry.skill),
      knownItems: Object.keys((character as CharacterRecord & { inventory?: Record<string, number> }).inventory ?? {})
    });
    const proposals = analysis?.result?.proposals ?? [];
    if (!proposals.length) return null;
    const resolved = await serviceFetch<{ content?: DiscoveryRecord }>("creation-system", "/api/v1/creation/resolve-proposals", "POST", {
      note,
      intent,
      nearbyTerrain,
      nearbyObjects,
      primarySkill: character.skills[0]?.skill ?? "GENERAL",
      knownSkills: character.skills.map((entry) => entry.skill),
      knownItems: Object.keys((character as CharacterRecord & { inventory?: Record<string, number> }).inventory ?? {}),
      proposals
    });
    return resolved?.content ?? null;
  } catch {
    return null;
  }
}

async function serviceFetch<T = unknown>(serviceName: string, routePath: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${getServiceUrl(serviceName)}${routePath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token"
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const json = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json?.error?.message || `${serviceName} returned ${response.status}`);
  }
  return json.data as T;
}

function terrainKindsFromAction(action: ActionDraft) {
  const selected = action.context && typeof action.context === "object" ? (action.context as Record<string, unknown>).selectedTile : null;
  const nearby = action.context && typeof action.context === "object" ? (action.context as Record<string, unknown>).nearbyTiles : null;
  const kinds = new Set<string>();
  if (selected && typeof selected === "object" && (selected as Record<string, unknown>).kind) {
    kinds.add(String((selected as Record<string, unknown>).kind).toLowerCase());
  }
  if (Array.isArray(nearby)) {
    for (const item of nearby) {
      if (item && typeof item === "object" && (item as Record<string, unknown>).kind) {
        kinds.add(String((item as Record<string, unknown>).kind).toLowerCase());
      }
    }
  }
  return Array.from(kinds);
}

function nearbyObjectsFromAction(action: ActionDraft) {
  const ctx = action.context && typeof action.context === "object" ? (action.context as Record<string, unknown>) : null;
  const nearby = ctx ? ctx.nearbyObjects : null;
  const types = new Set<string>();
  if (Array.isArray(nearby)) {
    for (const item of nearby) {
      if (item && typeof item === "object" && (item as Record<string, unknown>).type) {
        types.add(String((item as Record<string, unknown>).type).toUpperCase());
      } else if (typeof item === "string") {
        types.add(String(item).toUpperCase());
      }
    }
  }
  return Array.from(types);
}

function randomPick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function canEverUseSkill(skill: string, available: Set<string>) {
  const normalized = String(skill || "GENERAL").toUpperCase();
  const prereqs = skillPrereqsFor(normalized);
  return prereqs.every((entry) => available.has(entry));
}

function parseDraft(rawAction: ActionDraft) {
  return {
    actionType: String(rawAction.actionType ?? rawAction.actionIntent ?? "GENERAL"),
    actionIntent: rawAction.actionIntent ? String(rawAction.actionIntent) : null,
    primarySkill: String(rawAction.primarySkill ?? "GENERAL").toUpperCase(),
    secondarySkill: rawAction.secondarySkill ? String(rawAction.secondarySkill).toUpperCase() : null,
    note: String(rawAction.note ?? "").trim(),
    context: (rawAction.context && typeof rawAction.context === "object" ? rawAction.context : {}) as Record<string, unknown>
  };
}

function explicitIntent(note: string) {
  const text = normalizeText(note).toUpperCase();
  if (/(DROP|DISCARD|DUMP|THROW AWAY|TRASH|REMOVE FROM)/.test(text)) return "DROP_ITEM";
  if (/(UNPACK|UNWRAP|OPEN|BREAK APART|BREAK DOWN|SEPARATE|SORT) .*HERB/.test(text) || /HERB BUNDLE/.test(text) && /(UNPACK|OPEN|BREAK|SORT|UNTIE|UNWRAP)/.test(text)) return "UNPACK_HERB_BUNDLE";
  if (/(IDENTIF|INSPECT|APPRAIS|ANALYZ).*(HERB|PLANT)|UNIDENTIF/.test(text)) return "IDENTIFY_HERB";
  if (/(SPLIT|CUT|SHAVE).*(WOOD|LOG)|KINDLING/.test(text)) return "SPLIT_ITEM";
  if (/(COOK|ROAST|FRY|SMOKE|GRILL|SEAR).*(FISH|PERCH|CATFISH|MUDFISH)|COOK.*RAW.FISH|ROAST.*FISH/.test(text)) return "COOK_FISH";
  if (/(TEA|BREW|STEEP|INFUSE)/.test(text)) return "BREW_TEA";
  if (/(REST|SIT|CATCH MY BREATH|PAUSE|SETTLE DOWN)/.test(text)) return "REST";
  if (/(LOOK AROUND|SCOUT|SURVEY|SEARCH THE AREA|OBSERVE THE AREA|CHECK THE AREA)/.test(text)) return "SCOUT";
  if (/(FILL|DRAW|COLLECT).*(WATER)|FETCH WATER/.test(text)) return "WATER_COLLECT";
  if (/(WASH|RINSE|CLEAN).*(WATER|ITEM)/.test(text)) return "WATER_USE";
  if (/(FORAGE|HERB|BERRY|ROOT|MUSHROOM|GATHER)/.test(text)) return "FORAGE";
  if (/(WOOD|TREE|TIMBER|LOG|CHOP|FELL)/.test(text)) return "WOODCUT";
  if (/(MINE|ORE|STONE|ROCK|QUARRY)/.test(text)) return "MINE";
  if (/(CRAFT|MAKE|ASSEMBLE|SMELT|FORGE|COOK|RECIPE)/.test(text)) return "CRAFT_RECIPE";
  if (/(BUILD|PLACE|WALL|BLOCK|CAMPFIRE|STRUCTURE|FORTIFY)/.test(text)) return "BUILD";
  if (/(FISH|CAST|HOOK|ANGLE|NET|CATCH FISH|THROW LINE)/.test(text)) return "FISH";
  if (/(TALK|CHAT|ASK|GREET|BARTER|TRADE)/.test(text)) return "SOCIAL";
  if (/(RITUAL|SIGIL|CHANT|ALTAR|OFFERING)/.test(text)) return "RITUAL";
  if (/(MAGIC|SPELL|ARCANE|FOCUS)/.test(text)) return "MAGIC";
  return "GENERAL";
}

function classifyIntent(draft: ReturnType<typeof parseDraft>) {
  if (draft.actionIntent) return draft.actionIntent.toUpperCase();
  const fromNote = explicitIntent(draft.note);
  if (fromNote !== "GENERAL") return fromNote;
  switch (draft.primarySkill) {
    case "FISHING": return "FISH";
    case "FORAGING": return "FORAGE";
    case "WOODCUTTING": return "WOODCUT";
    case "MINING": return "MINE";
    case "COOKING": {
      const n = normalizeText(draft.note);
      if (/(fish|perch|catfish|mudfish)/.test(n)) return "COOK_FISH";
      return draft.note ? "BREW_TEA" : "CRAFT_RECIPE";
    }
    case "CRAFTING": return "CRAFT_RECIPE";
    case "BUILDING": return "BUILD";
    case "SOCIAL": return "SOCIAL";
    case "RITUALS": return "RITUAL";
    case "MAGIC": return "MAGIC";
    case "EXPLORATION": return "SCOUT";
    default: return draft.note ? "OBSERVE" : "GENERAL";
  }
}

function categoryForIntent(intent: string) {
  switch (intent) {
    case "SCOUT":
    case "FORAGE":
    case "FISH":
    case "WOODCUT":
    case "MINE":
    case "WATER_COLLECT":
    case "WATER_USE":
      return "COLLECTION";
    case "DROP_ITEM":
    case "SPLIT_ITEM":
    case "UNPACK_HERB_BUNDLE":
    case "IDENTIFY_HERB":
      return "MANIPULATION";
    case "CRAFT_RECIPE":
    case "BREW_TEA":
    case "COOK_FISH":
      return "CRAFTING";
    case "BUILD":
      return "BUILDING";
    case "SOCIAL":
      return "SOCIAL";
    case "RITUAL":
    case "MAGIC":
      return "ARCANE";
    case "REST":
    case "OBSERVE":
    default:
      return "UTILITY";
  }
}

function requiredSkillsForIntent(intent: string, primarySkill: string, secondarySkill: string | null) {
  const set = new Set<string>([...intentSkillsFor(intent), primarySkill]);
  if (secondarySkill) set.add(secondarySkill);
  return Array.from(set).filter(Boolean);
}

function resolveInventoryTarget(inventory: Record<string, number>, note: string, itemHints: string[]) {
  const normalizedNote = normalizeText(note);
  const countMatch = normalizedNote.match(/\b(\d+)\b/);
  const requestedAmount = Math.max(1, Number(countMatch?.[1] ?? 1));

  const keys = Object.keys(inventory ?? {}).filter((key) => Number(inventory[key] ?? 0) > 0);
  let best: { itemKey: string; score: number } | null = null;
  for (const key of keys) {
    const phrase = normalizeText(key);
    if (!phrase) continue;
    const checks = [phrase, ...itemHints.map((hint) => normalizeText(hint))].filter(Boolean);
    for (const check of checks) {
      if (normalizedNote.includes(check) || normalizedNote.includes(`${check}s`)) {
        const score = check.length;
        if (!best || score > best.score) best = { itemKey: key, score };
      }
    }
  }

  if (!best) return null;
  return { itemKey: best.itemKey, amount: requestedAmount };
}

function pickHerb(note: string, nearbyTerrain: string[]) {
  const upper = note.toUpperCase();
  if (upper.includes("MOON")) return "moonmint";
  if (upper.includes("SUN")) return "sunroot";
  if (upper.includes("SILVER")) return "silverleaf";
  if (upper.includes("BITTER")) return "bitterwort";
  if (upper.includes("PINE")) return "pine_needles";

  const matches = herbCatalog().filter((herb) => herb.terrain.some((terrain) => nearbyTerrain.includes(terrain)));
  const pool = matches.length ? matches : herbCatalog();
  const weighted: string[] = [];
  for (const herb of pool) {
    for (let i = 0; i < herb.weight; i += 1) weighted.push(herb.key);
  }
  return randomPick(weighted);
}

function herbInventoryKeyFromNote(inventory: Record<string, number>, note: string) {
  const normalized = normalizeText(note);
  const herbKeys = Object.keys(inventory ?? {}).filter((key) => key.startsWith("herb_") && Number(inventory[key] ?? 0) > 0);
  const explicit = herbKeys.find((key) => normalized.includes(normalizeText(key.replace(/^herb_/, ""))) || normalized.includes(normalizeText(key)));
  if (explicit) return explicit;
  if (Number(inventory.raw_herb ?? 0) > 0) return "raw_herb";
  return herbKeys[0] ?? null;
}

// Search contentCache.recipes locally before hitting production-system, so
// seed/runtime recipes (fishing line, rod, etc.) resolve without the shared package.
function findRecipeInCache(note: string): RecipeRecord | null {
  const normalized = normalizeText(note);
  if (!normalized) return null;
  const tokens = normalized.split(" ").filter(Boolean);
  let best: { recipe: RecipeRecord; score: number } | null = null;
  for (const recipe of Object.values(contentCache.recipes ?? {})) {
    const hay = [recipe.recipeKey, recipe.name, ...(recipe.keywords ?? [])].map(normalizeText).join(" ");
    let score = 0;
    if (hay.includes(normalized)) score += normalized.length + 10;
    for (const token of tokens) {
      if (hay.includes(token)) score += token.length + 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { recipe, score };
  }
  return best?.recipe ?? null;
}

async function resolveRecipeForAction(character: CharacterRecord, plan: Omit<ActionPlan, "recipe" | "dropTarget" | "splitTarget" | "allowed" | "reasons">, simulatedInventory?: Record<string, number>) {
  const note = plan.note;
  if (!note) return null;
  const inventory = simulatedInventory ?? character.inventory ?? {};

  // Try local content cache first (covers seed recipes + runtime-created recipes)
  const cached = findRecipeInCache(note);
  if (cached) return cached;

  // Fall back to production-system (covers RECIPE_DEFINITIONS from shared package)
  const discover = await serviceFetch<{ matches: RecipeRecord[] }>("production-system", "/api/v1/production/discover", "POST", {
    query: note,
    availableItems: Object.entries(inventory).map(([itemKey, amount]) => ({ itemKey, amount })),
    nearbyObjects: plan.nearbyObjects
  });
  const unlocked = new Set((character.knowledge?.unlockedRecipes ?? []).map((value) => String(value)));
  const best = discover.matches.find((recipe) => unlocked.has(recipe.recipeKey)) ?? discover.matches[0];
  return best ?? null;
}

async function buildPlan(character: CharacterRecord, rawAction: ActionDraft, simulatedInventory?: Record<string, number>): Promise<ActionPlan> {
  await ensureContentCache();
  const draft = parseDraft(rawAction);
  const intent = classifyIntent(draft);
  const category = categoryForIntent(intent);
  const nearbyTerrain = terrainKindsFromAction(rawAction);
  const nearbyObjects = nearbyObjectsFromAction(rawAction);
  const available = discoveredSkills(character);
  const requiredSkills = requiredSkillsForIntent(intent, draft.primarySkill, draft.secondarySkill);
  const reasons: string[] = [];

  for (const skill of requiredSkills) {
    if (skill === "GENERAL") continue;
    if (!available.has(skill)) {
      if (!canEverUseSkill(skill, available)) {
        const prereqs = skillPrereqsFor(skill);
        reasons.push(`${skill} is not available from your current foundations. You still need ${prereqs.join(", ")}.`);
      }
    }
  }

  const effectiveInventory = simulatedInventory ?? character.inventory ?? {};
  let recipe: RecipeRecord | null = null;
  let discovery: DiscoveryRecord | null = null;
  let dropTarget: { itemKey: string; amount: number } | null = null;
  let splitTarget: { itemKey: string; amount: number } | null = null;

  if (["OBSERVE", "SCOUT", "FORAGE", "FISH", "MINE", "CRAFT_RECIPE", "BUILD"].includes(intent) && draft.note) {
    discovery = await discoverContent(draft.note, intent, nearbyTerrain, nearbyObjects, character);
    const discoveredSkillKey = discovery?.skill?.skillKey ? String(discovery.skill.skillKey).toUpperCase() : null;
    if (discoveredSkillKey && !contentCache.skillPrereqs[discoveredSkillKey]) {
      contentCache.skillPrereqs[discoveredSkillKey] = [intent === "BUILD" ? "BUILDING" : intent === "CRAFT_RECIPE" ? "CRAFTING" : intent === "MINE" ? "MINING" : intent === "FORAGE" ? "FORAGING" : draft.primarySkill || "GENERAL"];
    }
    if (discovery?.item?.requiredTerrain?.length) {
      const matchesTerrain = discovery.item.requiredTerrain.some((terrain) => nearbyTerrain.includes(String(terrain).toLowerCase()));
      if (!matchesTerrain && ["SCOUT", "FORAGE", "MINE"].includes(intent)) {
        reasons.push(`${discovery.item.name} does not fit the terrain around you right now.`);
      }
    }
  }

  if (intent === "DROP_ITEM") {
    dropTarget = resolveInventoryTarget(effectiveInventory, draft.note, []);
    if (!dropTarget) {
      reasons.push("I couldn't tell which item you want to drop. Try 'drop: item_key x1'.");
    } else if (Number(effectiveInventory[dropTarget.itemKey] ?? 0) < dropTarget.amount) {
      reasons.push(`You only have ${Number(effectiveInventory[dropTarget.itemKey] ?? 0)} ${inventoryLabel(dropTarget.itemKey)}.`);
    }
  }

  if (intent === "SPLIT_ITEM") {
    splitTarget = resolveInventoryTarget(effectiveInventory, draft.note, ["wood log", "log", "timber"]);
    if (!splitTarget || splitTarget.itemKey !== "wood_log") {
      reasons.push("You need at least 1 wood_log to split into kindling.");
    }
  }

  if (intent === "UNPACK_HERB_BUNDLE" && Number(effectiveInventory.herb_bundle ?? 0) < 1) {
    reasons.push("You do not have a herb bundle to unpack.");
  }

  if (intent === "IDENTIFY_HERB" && Number(effectiveInventory.unidentified_herb ?? 0) < 1) {
    reasons.push("You do not have any unidentified herbs to identify.");
  }

  if (intent === "WATER_COLLECT" && !nearbyTerrain.includes("water")) {
    reasons.push("You need to stand on or next to water to collect it.");
  }

  if (intent === "WOODCUT" && !nearbyTerrain.some((kind) => ["forest", "grass"].includes(kind))) {
    reasons.push("There is no workable tree line on this tile or its edge.");
  }

  if (intent === "MINE" && !nearbyTerrain.includes("rock")) {
    reasons.push("There is no mineable stone or ore patch here.");
  }

  if (intent === "FORAGE" && !nearbyTerrain.some((kind) => ["forest", "grass", "water"].includes(kind))) {
    reasons.push("This tile does not look like a useful foraging patch.");
  }

  if (intent === "FISH") {
    if (!nearbyTerrain.includes("water")) {
      reasons.push("You need to be on or next to water to fish.");
    }
    if (discovery?.item?.requiredTerrain?.length) {
      const matchesTerrain = discovery.item.requiredTerrain.some((t) => nearbyTerrain.includes(String(t).toLowerCase()));
      if (!matchesTerrain) reasons.push(`${discovery.item.name} cannot be found in the water here.`);
    }
  }

  if (intent === "BREW_TEA") {
    const herbKey = herbInventoryKeyFromNote(effectiveInventory, draft.note);
    if (!nearbyObjects.includes("CAMPFIRE")) reasons.push("You need a campfire nearby to brew tea.");
    if (Number(effectiveInventory.fresh_water ?? 0) < 1) reasons.push("You need fresh water in your inventory to brew tea.");
    if (!herbKey) reasons.push("You need an herb in your inventory to brew tea.");
  }

  if (intent === "COOK_FISH") {
    const fishKeys = ["raw_fish", "small_fish", "river_perch", "catfish", "mudfish"];
    const hasFish = fishKeys.some((k) => Number(effectiveInventory[k] ?? 0) >= 1);
    if (!nearbyObjects.includes("CAMPFIRE")) reasons.push("You need a campfire nearby to cook fish.");
    if (!hasFish) reasons.push("You need a raw fish in your inventory to cook.");
  }

  if (intent === "CRAFT_RECIPE") {
    recipe = await resolveRecipeForAction(character, {
      category,
      intent,
      primarySkill: draft.primarySkill,
      secondarySkill: draft.secondarySkill,
      note: draft.note,
      nearbyTerrain,
      nearbyObjects,
      discoveredSkills: Array.from(available),
      requiredSkills
    }, effectiveInventory);

    if (!recipe && discovery?.recipe) {
      recipe = discovery.recipe;
    }

    if (!recipe) {
      reasons.push("No matching recipe was found for that note.");
    } else if (discovery?.recipe && recipe.recipeKey === discovery.recipe.recipeKey) {
      for (const input of recipe.inputs ?? []) {
        const have = Number(effectiveInventory[input.itemKey] ?? 0);
        const need = Number(input.amount ?? 0);
        if (have < need) reasons.push(`Missing ${need - have} ${inventoryLabel(input.itemKey)}.`);
      }
      for (const tool of recipe.tools ?? []) {
        if (Number(effectiveInventory[tool.toolKey] ?? 0) < 1) reasons.push(`Missing tool ${titleCaseLocal(tool.toolKey)}.`);
      }
      if (recipe.station && recipe.station !== "FIELD" && !nearbyObjects.includes(String(recipe.station).toUpperCase())) {
        reasons.push(`You need ${titleCaseLocal(recipe.station)} nearby for this recipe.`);
      }
    } else {
      const evaluation = await serviceFetch<{ valid: boolean; missingIngredients: Array<{ itemKey: string; amount: number }>; missingTools: Array<{ toolKey: string }>; contextBlocks: string[] }>(
        "production-system",
        "/api/v1/production/evaluate",
        "POST",
        {
          recipeKey: recipe.recipeKey,
          availableItems: Object.entries(effectiveInventory).map(([itemKey, amount]) => ({ itemKey, amount })),
          availableTools: Object.keys(character.inventory ?? {}).filter((key) => Number(character.inventory[key] ?? 0) > 0),
          nearbyObjects,
          stationContext: nearbyObjects
        }
      );
      for (const item of evaluation.missingIngredients ?? []) reasons.push(`Missing ${item.amount} ${inventoryLabel(item.itemKey)}.`);
      for (const item of evaluation.missingTools ?? []) reasons.push(`Missing tool ${titleCaseLocal(item.toolKey)}.`);
      for (const reason of evaluation.contextBlocks ?? []) reasons.push(reason);
    }
  }

  return {
    category,
    intent,
    primarySkill: draft.primarySkill,
    secondarySkill: draft.secondarySkill,
    note: draft.note,
    nearbyTerrain,
    nearbyObjects,
    discoveredSkills: Array.from(available),
    requiredSkills,
    recipe,
    discovery,
    dropTarget,
    splitTarget,
    allowed: reasons.length === 0,
    reasons
  };
}

function addReward(target: Record<string, number>, itemKey: string, amount: number) {
  target[itemKey] = (target[itemKey] ?? 0) + amount;
}

function asRewardList(delta: Record<string, number>) {
  return Object.entries(delta)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([itemKey, amount]) => ({ itemKey, amount: Number(amount) }));
}

function asConsumedList(delta: Record<string, number>) {
  return Object.entries(delta)
    .filter(([, amount]) => Number(amount) < 0)
    .map(([itemKey, amount]) => ({ itemKey, amount: Math.abs(Number(amount)) }));
}

function registerKnownMeta(delta: Record<string, number>) {
  const out: Record<string, { name: string; description: string }> = {};
  for (const key of Object.keys(delta)) {
    const meta = itemMetaFor(key);
    if (meta) out[key] = meta;
  }
  return out;
}

function resolveObservation(character: CharacterRecord, plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = {};
  const vitalChanges: Record<string, number> = { stamina: -1 };
  const drawbacks: Array<{ type: string; amount: number; reason: string }> = [{ type: "stamina", amount: -1, reason: "Careful observation still takes a little focus." }];
  const successChance = 0.92;
  const roll = Math.random();
  const success = true;
  const area = plan.nearbyTerrain.length ? plan.nearbyTerrain.map(titleCaseLocal).join(", ") : "quiet ground";
  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: [],
    consumed: [],
    drawbacks,
    itemMeta: {},
    message: `You slow down and read the area: ${area}. Nothing is taken yet, but you get a better sense of what can be worked here.`
  } satisfies ActionOutcome;
}

function resolveScout(character: CharacterRecord, plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = {};
  const vitalChanges: Record<string, number> = { stamina: -2 };
  const drawbacks = [{ type: "stamina", amount: -2, reason: "Searching the terrain costs time and focus." }];
  const primaryLevel = Math.max(1, getSkillLevel(character, plan.primarySkill));
  const successChance = Math.max(0.18, Math.min(0.94, 0.38 + (primaryLevel - 1) * 0.06 + (plan.nearbyTerrain.includes("forest") ? 0.16 : 0) + (plan.note.length >= 18 ? 0.06 : 0)));
  const roll = Math.random();
  const success = roll <= successChance;
  let message = "You search carefully but fail to spot anything worth keeping.";

  if (success) {
    const found = plan.discovery?.item?.itemKey ?? (plan.nearbyTerrain.includes("forest") ? "unidentified_herb" : plan.nearbyTerrain.includes("water") ? "fresh_water" : "strange_seed");
    inventoryChanges[found] = 1;
    message = plan.discovery?.item
      ? `You search the patch and discover ${plan.discovery.item.name}.`
      : `You search the patch and turn up ${inventoryLabel(found)}.`;
  }

  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks,
    itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery?.item)),
    discoveredSkills: [],
    message
  } satisfies ActionOutcome;
}

function resolveForage(character: CharacterRecord, plan: ActionPlan, inv?: Record<string, number>) {
  const inventory = inv ?? character.inventory ?? {};
  const inventoryChanges: Record<string, number> = {};
  const vitalChanges: Record<string, number> = { stamina: -3 };
  const drawbacks = [{ type: "stamina", amount: -3, reason: "Foraging takes effort and attention." }];
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill));
  const successChance = Math.max(0.15, Math.min(0.9, 0.45 + (level - 1) * 0.06 + (plan.nearbyTerrain.includes("forest") ? 0.1 : 0)));
  const roll = Math.random();
  const success = roll <= successChance;
  if (success) {
    const normalized = normalizeText(plan.note);
    // Bait note: explicitly looking for worms/grubs near water or grass
    const wantsBait = /(worm|grub|bait|lure)/.test(normalized);
    const nearWet = plan.nearbyTerrain.some((t) => ["water", "grass"].includes(t));
    const foundBait = (wantsBait || (nearWet && Math.random() < 0.12));
    if (foundBait) {
      inventoryChanges.bait = 1;
      return {
        category: plan.category,
        intent: plan.intent,
        success,
        catastrophic: false,
        roll,
        successChance,
        inventoryChanges,
        vitalChanges,
        rewards: asRewardList(inventoryChanges),
        consumed: [],
        drawbacks,
        itemMeta: registerKnownMeta(inventoryChanges),
        discoveredSkills: [],
        message: "You turn over rocks and leaf litter and collect some grubs for bait."
      } satisfies ActionOutcome;
    }
    const found = plan.discovery?.item?.itemKey ?? (normalized.includes("berry") ? "wild_berry" : normalized.includes("root") ? "bitter_root" : normalized.includes("herb") ? "unidentified_herb" : plan.nearbyTerrain.includes("forest") ? "unidentified_herb" : "bitter_root");
    inventoryChanges[found] = 1;
    return {
      category: plan.category,
      intent: plan.intent,
      success,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: [],
      drawbacks,
      itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery?.item)),
      discoveredSkills: [],
      message: plan.discovery?.item ? `You search the brush and gather ${plan.discovery.item.name}.` : `You search the brush and gather ${inventoryLabel(found)}.`
    } satisfies ActionOutcome;
  }

  inventoryChanges.bitter_root = 1;
  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    discoveredSkills: [],
    message: "You search the brush but mostly come away with a bitter root."
  } satisfies ActionOutcome;
}

function resolveWaterCollect(character: CharacterRecord, plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = { fresh_water: 1 };
  const vitalChanges: Record<string, number> = { stamina: -1 };
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 0.95,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks: [{ type: "stamina", amount: -1, reason: "Collecting water takes a little time." }],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: "You gather fresh water from the nearby source."
  } satisfies ActionOutcome;
}

function resolveWaterUse(character: CharacterRecord, plan: ActionPlan, inv?: Record<string, number>) {
  const inventory = inv ?? character.inventory ?? {};
  const hasWater = Number(inventory.fresh_water ?? 0) >= 1;
  const inventoryChanges: Record<string, number> = hasWater ? { fresh_water: -1 } : {};
  return {
    category: plan.category,
    intent: plan.intent,
    success: hasWater,
    catastrophic: false,
    roll: Math.random(),
    successChance: 1,
    inventoryChanges,
    vitalChanges: {},
    rewards: [],
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: hasWater
      ? "You use the fresh water to wash and clean."
      : "You have no fresh water to use."
  } satisfies ActionOutcome;
}

function resolveWoodcut(character: CharacterRecord, plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = {};
  const vitalChanges: Record<string, number> = { stamina: -5 };
  const drawbacks: Array<{ type: string; amount: number; reason: string }> = [{ type: "stamina", amount: -5, reason: "Chopping wood is physically demanding." }];
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill));
  const successChance = Math.max(0.12, Math.min(0.91, 0.48 + (level - 1) * 0.07));
  const catastrophicChance = 0.000001; // 1-in-a-million
  const roll = Math.random();
  const catastrophic = roll < catastrophicChance;
  let success = !catastrophic && roll <= successChance;

  if (catastrophic) {
    vitalChanges.hp = -40;
    drawbacks.push({ type: "hp", amount: -40, reason: "A heavy tree twisted and landed on you." });
    return {
      category: plan.category,
      intent: plan.intent,
      success: false,
      catastrophic: true,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: [],
      consumed: [],
      drawbacks,
      itemMeta: {},
      message: "The tree went with gravity instead of your plan and crashed down on you."
    } satisfies ActionOutcome;
  }

  if (success) {
    inventoryChanges.wood_log = 2;
    inventoryChanges.bark_strip = 1;
    return {
      category: plan.category,
      intent: plan.intent,
      success,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: [],
      drawbacks,
      itemMeta: registerKnownMeta(inventoryChanges),
      message: "You fell a workable section and come away with usable logs and bark."
    } satisfies ActionOutcome;
  }

  inventoryChanges.splintered_bark = 1;
  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    message: "Your cut goes bad and you mostly come away with splintered bark."
  } satisfies ActionOutcome;
}

function resolveMine(character: CharacterRecord, plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = {};
  const vitalChanges: Record<string, number> = { stamina: -5 };
  const drawbacks = [{ type: "stamina", amount: -5, reason: "Mining is exhausting work." }];
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill));
  const successChance = Math.max(0.16, Math.min(0.9, 0.42 + (level - 1) * 0.07));
  const roll = Math.random();
  const success = roll <= successChance;

  if (success && plan.discovery?.item) {
    inventoryChanges[plan.discovery.item.itemKey] = 1;
    inventoryChanges.stone_chunk = 1;
    return {
      category: plan.category,
      intent: plan.intent,
      success,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: [],
      drawbacks,
      itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery.item)),
      discoveredSkills: [],
      message: `You crack into the seam and pull free ${plan.discovery.item.name}.`
    } satisfies ActionOutcome;
  }

  inventoryChanges[success ? "stone_chunk" : "shale_fragment"] = success ? 2 : 1;
  if (success && roll < successChance * 0.35) inventoryChanges.iron_ore = 1;

  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    discoveredSkills: [],
    message: success ? "You crack into the seam and carry away workable stone." : "The strike only shears off brittle shale fragments."
  } satisfies ActionOutcome;
}

function resolveDrop(plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = {};
  if (plan.dropTarget) inventoryChanges[plan.dropTarget.itemKey] = -plan.dropTarget.amount;
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 1,
    inventoryChanges,
    vitalChanges: {},
    rewards: [],
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: plan.dropTarget ? `You drop ${plan.dropTarget.amount} ${inventoryLabel(plan.dropTarget.itemKey)}.` : "Nothing was dropped."
  } satisfies ActionOutcome;
}

function resolveSplit(character: CharacterRecord, plan: ActionPlan) {
  const amount = Math.min(plan.splitTarget?.amount ?? 1, Number(character.inventory.wood_log ?? 0));
  const inventoryChanges: Record<string, number> = { wood_log: -amount, kindling: amount * 3, bark_strip: amount };
  const vitalChanges: Record<string, number> = { stamina: -2 * amount };
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 0.98,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [{ type: "stamina", amount: -2 * amount, reason: "Splitting material still takes some effort." }],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: amount > 1
      ? `You split ${amount} logs down into kindling and peel away strips of bark.`
      : "You split the log down into kindling and peel away a strip of bark."
  } satisfies ActionOutcome;
}

function resolveUnpackHerbBundle() {
  const inventoryChanges: Record<string, number> = { herb_bundle: -1, raw_herb: 3, stem_fiber: 1 };
  return {
    category: "MANIPULATION",
    intent: "UNPACK_HERB_BUNDLE",
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 1,
    inventoryChanges,
    vitalChanges: {},
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: "You untie the bundle and sort the contents into loose herbs and usable fiber."
  } satisfies ActionOutcome;
}

function resolveIdentifyHerb(character: CharacterRecord, plan: ActionPlan) {
  const herbKey = pickHerb(plan.note, plan.nearbyTerrain);
  const itemKey = `herb_${herbKey}`;
  const inventoryChanges: Record<string, number> = { unidentified_herb: -1, [itemKey]: 1 };
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 0.97,
    inventoryChanges,
    vitalChanges: {},
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: `You inspect the plant and identify it as ${inventoryLabel(itemKey)}.`
  } satisfies ActionOutcome;
}

function resolveBrewTea(character: CharacterRecord, plan: ActionPlan, inv?: Record<string, number>) {
  const inventory = inv ?? character.inventory ?? {};
  const herbKey = herbInventoryKeyFromNote(inventory, plan.note) ?? "raw_herb";
  const inventoryChanges: Record<string, number> = { fresh_water: -1, [herbKey ?? "raw_herb"]: -1 };
  const vitalChanges: Record<string, number> = { stamina: -2 };
  const drawbacks = [{ type: "stamina", amount: -2, reason: "Brewing takes time and attention." }];
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill || "COOKING"));
  const successChance = Math.max(0.2, Math.min(0.94, 0.58 + (level - 1) * 0.06 + (plan.nearbyObjects.includes("CAMPFIRE") ? 0.08 : 0)));
  const roll = Math.random();
  const success = roll <= successChance;

  if (success) {
    const output = herbKey.startsWith("herb_") ? `tea_${herbKey.replace(/^herb_/, "")}` : "herbal_tea";
    inventoryChanges[output] = 1;
    return {
      category: plan.category,
      intent: plan.intent,
      success,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: asConsumedList(inventoryChanges),
      drawbacks,
      itemMeta: registerKnownMeta(inventoryChanges),
      message: `You brew ${inventoryLabel(output)} over the fire.`
    } satisfies ActionOutcome;
  }

  inventoryChanges.charred_slurry = 1;
  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    message: "The mixture goes bitter and breaks down into charred slurry."
  } satisfies ActionOutcome;
}

// Fish catalog: what can be caught and where
const FISH_CATALOG: Array<{ itemKey: string; weight: number; terrain: string[]; minLevel?: number }> = [
  { itemKey: "small_fish",   weight: 4, terrain: ["water"] },
  { itemKey: "raw_fish",     weight: 3, terrain: ["water"] },
  { itemKey: "river_perch",  weight: 2, terrain: ["water"] },
  { itemKey: "catfish",      weight: 1, terrain: ["water"], minLevel: 2 },
  { itemKey: "mudfish",      weight: 2, terrain: ["water"] }
];

function pickFish(note: string, nearbyTerrain: string[], level: number): string {
  const upper = note.toUpperCase();
  if (upper.includes("PERCH")) return "river_perch";
  if (upper.includes("CATFISH") || upper.includes("CAT FISH")) return "catfish";
  if (upper.includes("MUD")) return "mudfish";

  const eligible = FISH_CATALOG.filter(
    (f) => f.terrain.some((t) => nearbyTerrain.includes(t)) && (f.minLevel ?? 1) <= level
  );
  const pool = eligible.length ? eligible : FISH_CATALOG.filter((f) => !f.minLevel || f.minLevel <= 1);
  const weighted: string[] = [];
  for (const fish of pool) {
    for (let i = 0; i < fish.weight; i++) weighted.push(fish.itemKey);
  }
  return randomPick(weighted) ?? "raw_fish";
}

function hasFishingGear(inventory: Record<string, number>): { hasRod: boolean; hasLine: boolean; hasHook: boolean; hasBait: boolean } {
  return {
    hasRod:  Number(inventory.fishing_rod  ?? 0) >= 1,
    hasLine: Number(inventory.fishing_line ?? 0) >= 1,
    hasHook: Number(inventory.fishing_hook ?? 0) >= 1,
    hasBait: Number(inventory.bait         ?? 0) >= 1
  };
}

function fishingGearBonus(gear: ReturnType<typeof hasFishingGear>): number {
  let bonus = 0;
  if (gear.hasRod)  bonus += 0.14;
  if (gear.hasLine) bonus += 0.06;
  if (gear.hasHook) bonus += 0.08;
  if (gear.hasBait) bonus += 0.10;
  return bonus;
}

function resolveFish(character: CharacterRecord, plan: ActionPlan, effectiveInventory?: Record<string, number>) {
  const inventory = effectiveInventory ?? character.inventory ?? {};
  const gear = hasFishingGear(inventory);
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill));

  // Base success: 30% bare-handed, up to ~75% with full gear + high level
  const successChance = Math.max(0.10, Math.min(0.82,
    0.30
    + (level - 1) * 0.05
    + fishingGearBonus(gear)
    + (plan.note.length >= 12 ? 0.04 : 0) // specific intent helps
  ));

  const staminaCost = gear.hasRod ? -3 : -5; // bare-hand fishing is harder
  const vitalChanges: Record<string, number> = { stamina: staminaCost };
  const drawbacks: Array<{ type: string; amount: number; reason: string }> = [
    { type: "stamina", amount: staminaCost, reason: gear.hasRod ? "Fishing takes patience and focus." : "Fishing without a rod is exhausting work." }
  ];

  const roll = Math.random();
  const success = roll <= successChance;

  const inventoryChanges: Record<string, number> = {};

  // Consume bait on each attempt if present
  if (gear.hasBait) inventoryChanges.bait = -1;

  if (success) {
    const caught = plan.discovery?.item?.itemKey ?? pickFish(plan.note, plan.nearbyTerrain, level);
    inventoryChanges[caught] = 1;

    // Bonus catch: small chance of a second fish at higher levels
    const bonusCatch = level >= 4 && Math.random() < 0.15;
    if (bonusCatch) {
      const bonus = pickFish("", plan.nearbyTerrain, level);
      inventoryChanges[bonus] = (inventoryChanges[bonus] ?? 0) + 1;
    }

    const caughtName = plan.discovery?.item?.name ?? inventoryLabel(caught);
    const message = bonusCatch
      ? `You pull in ${caughtName} — and your line stays live long enough for a second catch.`
      : plan.discovery?.item
        ? `You wait out the current and land ${caughtName}.`
        : `You wait patiently and pull up ${inventoryLabel(caught)}.`;

    return {
      category: plan.category,
      intent: plan.intent,
      success: true,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: asConsumedList(inventoryChanges),
      drawbacks,
      itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery?.item)),
      discoveredSkills: [],
      message
    } satisfies ActionOutcome;
  }

  // Failed attempt messages
  const failMessages = [
    "You cast your line and wait, but nothing bites.",
    "A tug on the line — then nothing. The catch got away.",
    "The water looks promising but stays quiet.",
    "You sit with the line for a while and come away empty-handed."
  ];

  return {
    category: plan.category,
    intent: plan.intent,
    success: false,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: [],
    consumed: asConsumedList(inventoryChanges),
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    discoveredSkills: [],
    message: randomPick(failMessages)
  } satisfies ActionOutcome;
}

// Fish cooking — resolves which raw fish to consume and what cooked item to produce
const FISH_COOK_MAP: Record<string, string> = {
  river_perch: "cooked_perch",
  catfish: "cooked_catfish",
  raw_fish: "cooked_fish",
  small_fish: "cooked_fish",
  mudfish: "cooked_fish"
};

function pickRawFishFromInventory(inv: Record<string, number>, note: string): string | null {
  const normalized = normalizeText(note);
  const fishKeys = Object.keys(FISH_COOK_MAP);
  // Explicit note match first
  const explicit = fishKeys.find((k) => normalized.includes(normalizeText(k)));
  if (explicit && Number(inv[explicit] ?? 0) >= 1) return explicit;
  // Then any fish in inventory
  return fishKeys.find((k) => Number(inv[k] ?? 0) >= 1) ?? null;
}

function resolveCookFish(character: CharacterRecord, plan: ActionPlan, inv?: Record<string, number>) {
  const inventory = inv ?? character.inventory ?? {};
  const rawKey = pickRawFishFromInventory(inventory, plan.note);
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill || "COOKING"));

  if (!rawKey) {
    return {
      category: plan.category,
      intent: plan.intent,
      success: false,
      catastrophic: false,
      roll: 1,
      successChance: 0,
      inventoryChanges: {},
      vitalChanges: {},
      rewards: [],
      consumed: [],
      drawbacks: [],
      itemMeta: {},
      message: "You have no fish to cook."
    } satisfies ActionOutcome;
  }

  const cookedKey = FISH_COOK_MAP[rawKey] ?? "cooked_fish";
  const successChance = Math.max(0.35, Math.min(0.95, 0.55 + (level - 1) * 0.06 + (plan.nearbyObjects.includes("CAMPFIRE") ? 0.08 : 0)));
  const roll = Math.random();
  const success = roll <= successChance;
  const vitalChanges: Record<string, number> = { stamina: -2 };
  const drawbacks = [{ type: "stamina", amount: -2, reason: "Tending a fire takes patience." }];

  if (success) {
    const inventoryChanges: Record<string, number> = { [rawKey]: -1, [cookedKey]: 1 };
    return {
      category: plan.category,
      intent: plan.intent,
      success: true,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: asConsumedList(inventoryChanges),
      drawbacks,
      itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges)),
      message: `You roast the ${inventoryLabel(rawKey)} over the fire and it comes out well.`
    } satisfies ActionOutcome;
  }

  // Failed — fish is charred and wasted
  const inventoryChanges: Record<string, number> = { [rawKey]: -1, charred_fish: 1 };
  return {
    category: plan.category,
    intent: plan.intent,
    success: false,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks,
    itemMeta: registerKnownMeta(inventoryChanges),
    message: "The fire runs too hot and the fish chars before you can pull it free."
  } satisfies ActionOutcome;
}

function resolveBuild(character: CharacterRecord, plan: ActionPlan) {
  const useStone = Number(character.inventory.stone_chunk ?? 0) >= 1;
  const inventoryChanges: Record<string, number> = useStone ? { stone_chunk: -1, stone_marker: 1 } : { wood_log: -1, wooden_frame: 1 };
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 0.96,
    inventoryChanges,
    vitalChanges: { stamina: -3 },
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks: [{ type: "stamina", amount: -3, reason: "Building takes measured effort." }],
    itemMeta: mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery?.item), recipeMetaRecord(plan.discovery?.recipe)),
    discoveredSkills: [],
    message: useStone ? "You shape the stone into a simple marker." : "You bind the wood into a basic frame."
  } satisfies ActionOutcome;
}

function resolveRest() {
  return {
    category: "UTILITY",
    intent: "REST",
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 1,
    inventoryChanges: {},
    vitalChanges: { stamina: 6 },
    rewards: [],
    consumed: [],
    drawbacks: [],
    itemMeta: {},
    message: "You take a moment to steady yourself and recover a little stamina."
  } satisfies ActionOutcome;
}

function resolveMagicLike(plan: ActionPlan) {
  const inventoryChanges: Record<string, number> = { ritual_ash: 1 };
  const vitalChanges: Record<string, number> = { mp: -4, stamina: -2 };
  return {
    category: plan.category,
    intent: plan.intent,
    success: true,
    catastrophic: false,
    roll: Math.random(),
    successChance: 0.8,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: [],
    drawbacks: [
      { type: "mp", amount: -4, reason: "Shaping energy drains your focus." },
      { type: "stamina", amount: -2, reason: "Holding the working steady still costs effort." }
    ],
    itemMeta: registerKnownMeta(inventoryChanges),
    message: plan.intent === "RITUAL" ? "The ritual holds briefly and leaves a trace of charged ash." : "You draw power through the action and leave behind a faint residue of ash."
  } satisfies ActionOutcome;
}

async function resolveCraftRecipe(character: CharacterRecord, plan: ActionPlan, effectiveInventory?: Record<string, number>) {
  const inv = effectiveInventory ?? character.inventory ?? {};
  const recipe = plan.recipe;
  if (!recipe) {
    return {
      category: plan.category,
      intent: plan.intent,
      success: false,
      catastrophic: false,
      roll: 1,
      successChance: 0,
      inventoryChanges: {},
      vitalChanges: {},
      rewards: [],
      consumed: [],
      drawbacks: [],
      itemMeta: {},
      discoveredSkills: [],
      message: "No recipe matched that action note."
    } satisfies ActionOutcome;
  }

  const inputs: Record<string, number> = {};
  for (const item of recipe.inputs ?? []) inputs[item.itemKey] = (inputs[item.itemKey] ?? 0) - Number(item.amount ?? 0);
  const inventoryChanges: Record<string, number> = { ...inputs };
  const vitalChanges: Record<string, number> = { stamina: -4 };
  const drawbacks = [{ type: "stamina", amount: -4, reason: "Crafting costs energy even when it goes badly." }];
  const level = Math.max(1, getSkillLevel(character, plan.primarySkill || "CRAFTING"));
  const successChance = Math.max(0.18, Math.min(0.93, 0.52 + (level - 1) * 0.07));
  const roll = Math.random();
  const success = roll <= successChance;
  const meta = mergeMetaMaps(registerKnownMeta(inventoryChanges), dynamicMetaRecord(plan.discovery?.item), recipeMetaRecord(recipe));

  if (success) {
    for (const output of recipe.outputs ?? []) {
      inventoryChanges[output.itemKey] = (inventoryChanges[output.itemKey] ?? 0) + Number(output.amount ?? 0);
    }
    return {
      category: plan.category,
      intent: plan.intent,
      success,
      catastrophic: false,
      roll,
      successChance,
      inventoryChanges,
      vitalChanges,
      rewards: asRewardList(inventoryChanges),
      consumed: asConsumedList(inventoryChanges),
      drawbacks,
      itemMeta: mergeMetaMaps(meta, registerKnownMeta(inventoryChanges), recipeMetaRecord(recipe)),
      discoveredSkills: [],
      message: `You craft ${recipe.name}.`
    } satisfies ActionOutcome;
  }

  inventoryChanges.scrap = (inventoryChanges.scrap ?? 0) + 1;
  return {
    category: plan.category,
    intent: plan.intent,
    success,
    catastrophic: false,
    roll,
    successChance,
    inventoryChanges,
    vitalChanges,
    rewards: asRewardList(inventoryChanges),
    consumed: asConsumedList(inventoryChanges),
    drawbacks,
    itemMeta: mergeMetaMaps(meta, registerKnownMeta(inventoryChanges), recipeMetaRecord(recipe)),
    discoveredSkills: [],
    message: `The craft attempt fails and the materials collapse into scrap.`
  } satisfies ActionOutcome;
}

function resolvePlan(character: CharacterRecord, plan: ActionPlan, effectiveInventory?: Record<string, number>) {
  const inv = effectiveInventory ?? character.inventory ?? {};
  switch (plan.intent) {
    case "OBSERVE": return resolveObservation(character, plan);
    case "SCOUT": return resolveScout(character, plan);
    case "FORAGE": return resolveForage(character, plan, inv);
    case "FISH": return resolveFish(character, plan, inv);
    case "COOK_FISH": return resolveCookFish(character, plan, inv);
    case "WATER_COLLECT": return resolveWaterCollect(character, plan);
    case "WATER_USE": return resolveWaterUse(character, plan, inv);
    case "WOODCUT": return resolveWoodcut(character, plan);
    case "MINE": return resolveMine(character, plan);
    case "DROP_ITEM": return resolveDrop(plan);
    case "SPLIT_ITEM": return resolveSplit(character, plan);
    case "UNPACK_HERB_BUNDLE": return resolveUnpackHerbBundle();
    case "IDENTIFY_HERB": return resolveIdentifyHerb(character, plan);
    case "BREW_TEA": return resolveBrewTea(character, plan, inv);
    case "BUILD": return resolveBuild(character, plan);
    case "REST": return resolveRest();
    case "RITUAL":
    case "MAGIC": return resolveMagicLike(plan);
    default: return resolveObservation(character, plan);
  }
}

async function xpForAction(action: Record<string, unknown>, success: boolean, intent: string) {
  if (["DROP_ITEM"].includes(intent)) return {};
  const response = await serviceFetch<{ totalXp: number; distribution: Array<{ skill: string; amount: number }> }>("xp-system", "/api/v1/xp/preview", "POST", { actions: [action] });
  const multiplier = success ? 1 : 0.3;
  const xp: Record<string, number> = {};
  for (const entry of response.distribution ?? []) {
    const scaled = Math.max(1, Math.round(Number(entry.amount ?? 0) * multiplier));
    xp[entry.skill] = (xp[entry.skill] ?? 0) + scaled;
  }
  return xp;
}

app.post("/api/v1/actions/check", async (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  if (!characterId) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "MISSING_CHARACTER", "characterId is required", 400);
  }

  try {
    const data = await serviceFetch<{ character: CharacterRecord | null }>("character-system", `/api/v1/character/${characterId}`);
    if (!data.character) {
      return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_NOT_FOUND", "Character not found", 404);
    }
    const check = await buildPlan(data.character, (req.body.action ?? {}) as ActionDraft);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { check });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACTION_CHECK_FAILED", error instanceof Error ? error.message : "Action check failed", 500);
  }
});

app.post("/api/v1/actions/resolve-queue", async (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  const actions = Array.isArray(req.body.actions) ? (req.body.actions as Array<ActionDraft>) : [];
  if (!characterId) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "MISSING_CHARACTER", "characterId is required", 400);
  }

  try {
    const characterData = await serviceFetch<{ character: CharacterRecord | null }>("character-system", `/api/v1/character/${characterId}`);
    if (!characterData.character) {
      return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_NOT_FOUND", "Character not found", 404);
    }

    const simulated = JSON.parse(JSON.stringify(characterData.character)) as CharacterRecord;
    const aggregateInventory: Record<string, number> = {};
    const aggregateXp: Record<string, number> = {};
    const aggregateVitals: Record<string, number> = {};
    const aggregateItemMeta: Record<string, { name: string; description: string }> = {};
    const aggregateSkillMeta: Record<string, { name: string; description: string; unlockHint?: string }> = {};
    const aggregateDiscoveredSkills = new Set<string>();
    const results: Array<Record<string, unknown>> = [];

    for (const [index, rawAction] of actions.entries()) {
      const parsed = parseDraft(rawAction);
      const plan = await buildPlan(simulated, rawAction, simulated.inventory);
      if (!plan.allowed) {
        results.push({
          index,
          actionType: parsed.actionType,
          intent: plan.intent,
          category: plan.category,
          success: false,
          allowed: false,
          message: plan.reasons.join(" "),
          rewards: { items: [] },
          consumed: [],
          inventoryChanges: {},
          xp: {},
          vitalChanges: {}
        });
        continue;
      }

      const outcome = plan.intent === "CRAFT_RECIPE" ? await resolveCraftRecipe(simulated, plan, simulated.inventory) : resolvePlan(simulated, plan, simulated.inventory);
      for (const [key, meta] of Object.entries(outcome.itemMeta ?? {})) aggregateItemMeta[key] = meta as { name: string; description: string };
      const xpAction = {
        actionType: parsed.actionType,
        primarySkill: plan.primarySkill,
        secondarySkill: plan.secondarySkill,
        actionIntent: plan.intent,
        duration: 12,
        count: 1,
        completion: outcome.success ? 1 : 0.35,
        context: { note: plan.note },
        tools: []
      };
      const xp = await xpForAction(xpAction, outcome.success, plan.intent);
      const newlyDiscoveredSkills: string[] = [];
      const discoverySkillKey = outcome.success && plan.discovery?.skill?.skillKey ? String(plan.discovery.skill.skillKey).toUpperCase() : null;
      if (discoverySkillKey && !simulated.skills.some((entry) => entry.skill === discoverySkillKey)) {
        const prereqs = skillPrereqsFor(discoverySkillKey) ?? [plan.primarySkill || "GENERAL"];
        const foundations = discoveredSkills(simulated);
        if (prereqs.every((entry) => foundations.has(entry))) {
          simulated.skills.push({ skill: discoverySkillKey, xp: 0, level: 1 });
          newlyDiscoveredSkills.push(discoverySkillKey);
          aggregateDiscoveredSkills.add(discoverySkillKey);
          aggregateSkillMeta[discoverySkillKey] = {
            name: plan.discovery?.skill?.name ?? titleCaseLocal(discoverySkillKey),
            description: plan.discovery?.skill?.description ?? `${titleCaseLocal(discoverySkillKey)} is now available to this character.`,
            unlockHint: plan.discovery?.skill?.unlockHint
          };
        }
      }

      combineDelta(aggregateInventory, outcome.inventoryChanges);
      combineDelta(aggregateXp, xp);
      combineDelta(aggregateVitals, outcome.vitalChanges);
      combineDelta(simulated.inventory, outcome.inventoryChanges);
      const vitalDelta = outcome.vitalChanges as Record<string, number>;
      simulated.vitals.hp = Math.max(1, Math.min(100, Number(simulated.vitals.hp ?? 100) + Number(vitalDelta.hp ?? 0)));
      simulated.vitals.mp = Math.max(0, Math.min(100, Number(simulated.vitals.mp ?? 0) + Number(vitalDelta.mp ?? 0)));
      simulated.vitals.stamina = Math.max(0, Math.min(100, Number(simulated.vitals.stamina ?? 100) + Number(vitalDelta.stamina ?? 0)));
      for (const [skill, amount] of Object.entries(xp)) {
        const hit = simulated.skills.find((entry) => entry.skill === skill);
        if (hit) {
          hit.xp += amount;
          hit.level = Math.floor(hit.xp / 100) + 1;
        } else {
          simulated.skills.push({ skill, xp: amount, level: Math.floor(amount / 100) + 1 });
        }
      }

      results.push({
        index,
        actionType: parsed.actionType,
        intent: plan.intent,
        category: plan.category,
        success: outcome.success,
        allowed: true,
        catastrophic: outcome.catastrophic,
        message: outcome.message,
        roll: Number(outcome.roll.toFixed(4)),
        successChance: Number(outcome.successChance.toFixed(4)),
        rewards: { items: outcome.rewards },
        consumed: outcome.consumed,
        itemMeta: outcome.itemMeta,
        inventoryChanges: outcome.inventoryChanges,
        xp,
        vitalChanges: outcome.vitalChanges,
        drawbacks: outcome.drawbacks,
        discoveredSkills: newlyDiscoveredSkills
      });

      const log = actionHistory(characterId);
      log.push({
        characterId,
        createdAt: nowIso(),
        actionType: parsed.actionType,
        intent: plan.intent,
        category: plan.category,
        primarySkill: plan.primarySkill,
        secondarySkill: plan.secondarySkill,
        note: plan.note,
        success: outcome.success,
        message: outcome.message,
        rewards: outcome.rewards,
        consumed: outcome.consumed
      });
      saveHistory(characterId, log);
    }

    const applyData = await serviceFetch<{ character: CharacterRecord }>("character-system", "/api/v1/character/apply-action-result", "POST", {
      characterId,
      inventoryChanges: aggregateInventory,
      xp: aggregateXp,
      vitals: aggregateVitals,
      discoveredSkills: Array.from(aggregateDiscoveredSkills),
      itemMeta: aggregateItemMeta,
      skillMeta: aggregateSkillMeta
    });

    const itemsGranted: Record<string, number> = {};
    for (const result of results) {
      for (const item of ((result.rewards as { items?: Array<{ itemKey: string; amount: number }> })?.items ?? [])) {
        itemsGranted[item.itemKey] = (itemsGranted[item.itemKey] ?? 0) + Number(item.amount ?? 0);
      }
    }

    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      character: applyData.character,
      results,
      itemMeta: aggregateItemMeta,
      summary: {
        queued: actions.length,
        completed: results.filter((item) => item.allowed).length,
        successful: results.filter((item) => item.success).length,
        failed: results.filter((item) => item.allowed && !item.success).length,
        blocked: results.filter((item) => item.allowed === false).length,
        itemsGranted,
        xpGranted: aggregateXp,
        discoveredSkills: Array.from(aggregateDiscoveredSkills)
      }
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACTION_RESOLVE_FAILED", error instanceof Error ? error.message : "Action queue failed", 500);
  }
});

app.post("/api/v1/actions/intake", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  const actions = Array.isArray(req.body.actions) ? req.body.actions : [];
  const log = actionHistory(characterId);
  for (const action of actions) {
    const parsed = parseDraft(action as ActionDraft);
    log.push({
      characterId,
      createdAt: nowIso(),
      actionType: parsed.actionType,
      primarySkill: parsed.primarySkill,
      secondarySkill: parsed.secondarySkill,
      note: parsed.note
    });
  }
  saveHistory(characterId, log);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ingested: actions.length, actions });
});

app.post("/api/v1/actions/group-window", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  const actions = actionHistory(characterId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    windows: actions.length ? [{ groupKey: `${characterId}-recent`, startedAt: actions[0]?.createdAt, endedAt: actions[actions.length - 1]?.createdAt, actions }] : []
  });
});

app.post("/api/v1/actions/summarize", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  const actions = actionHistory(characterId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    summary: {
      characterId,
      totalActions: actions.length,
      successful: actions.filter((entry) => entry.success === true).length,
      failed: actions.filter((entry) => entry.success === false).length
    }
  });
});

app.get("/api/v1/actions/history/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, actions: actionHistory(req.params.characterId) });
});

app.post("/api/v1/actions/infer-skills", (req, res) => {
  const requestId = getRequestId(req);
  const actions = Array.isArray(req.body.actions) ? req.body.actions : [];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    inferredSkills: actions.map((action) => {
      const parsed = parseDraft(action as ActionDraft);
      const intent = classifyIntent(parsed);
      return {
        actionType: parsed.actionType,
        intent,
        category: categoryForIntent(intent),
        skills: Array.from(new Set([parsed.primarySkill, parsed.secondarySkill].filter(Boolean)))
      };
    })
  });
});

app.post("/api/v1/actions/submit-to-xp", async (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? "");
  const actions = actionHistory(characterId).map((entry) => ({
    actionType: entry.actionType,
    duration: 12,
    count: 1,
    completion: entry.success ? 1 : 0.35,
    context: { note: entry.note ?? "" },
    tools: [],
    primarySkill: entry.primarySkill,
    secondarySkill: entry.secondarySkill,
    actionIntent: entry.intent
  })) as Array<XpActionRecord & Record<string, unknown>>;
  const preview = await serviceFetch<{ totalXp: number; distribution: Array<{ skill: string; amount: number }> }>("xp-system", "/api/v1/xp/from-actions", "POST", { actions });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, preview);
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
