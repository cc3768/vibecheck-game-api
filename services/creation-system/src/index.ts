import { SERVICE_VERSION, createServiceApp, getRequestId, getServiceUrl, sendError, sendSuccess } from "../../../packages/shared/src/index";

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
  discoverable?: boolean;
  status?: string;
};

type DynamicSkillRecord = {
  skillKey: string;
  name: string;
  description: string;
  unlockHint: string;
  prereqs?: string[];
  discoverable?: boolean;
  status?: string;
};

type DiscoveryRecord = {
  item: DynamicItemRecord | null;
  skill: DynamicSkillRecord | null;
  recipe: RecipeRecord | null;
  message?: string | null;
};

type ContentSnapshot = {
  items: Record<string, { name: string; description: string }>;
  dynamicItems: Record<string, DynamicItemRecord>;
  skills: Record<string, DynamicSkillRecord>;
  skillPrereqs: Record<string, string[]>;
  intentSkills: Record<string, string[]>;
  herbCatalog: Array<{ key: string; weight: number; terrain: string[] }>;
  discoveries: Array<{ discoveryKey: string; type: string; targetKey: string; aliases: string[]; terrainRules?: string[]; intentRules?: string[]; confidenceMin?: number; autoCreate?: boolean; status?: string; item?: DynamicItemRecord | null; skill?: DynamicSkillRecord | null; recipe?: RecipeRecord | null }>;
  aliases: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>;
  recipes: Record<string, RecipeRecord>;
  source: string;
};

type Proposal = {
  type: "item" | "skill" | "recipe";
  key: string;
  name?: string;
  description?: string;
  confidence?: number;
  reason?: string;
  item?: DynamicItemRecord;
  skill?: DynamicSkillRecord;
  recipe?: RecipeRecord;
  aliases?: string[];
  requiredTerrain?: string[];
  preferredSkills?: string[];
};

const SERVICE_NAME = "creation-system";
const PORT = 41744;
const app = createServiceApp(SERVICE_NAME);

const STOPWORDS = new Set(["something", "anything", "everything", "there", "thing", "stuff", "item", "items", "world", "area", "place", "maybe", "could", "would", "should", "into", "from", "with", "using", "look", "search", "find", "gather", "collect", "make", "craft", "build", "shape", "prepare", "mine", "forage", "check", "common", "words"]);

type AirtableConfig = { apiKey: string; baseId: string; tableItems: string; tableSkills: string; tableRecipes: string; tableDiscoveries: string; tableAliases: string };
function airtableConfig(): AirtableConfig | null {
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
    tableAliases: process.env.AIRTABLE_TABLE_ALIASES ?? "Aliases"
  };
}

function normalizeText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyWords(value: string) {
  return normalizeText(value).replaceAll(" ", "_").slice(0, 48) || "unknown_discovery";
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
  if (!response.ok) throw new Error(json?.error?.message || `${serviceName} returned ${response.status}`);
  return json.data as T;
}

async function readSnapshot() {
  return serviceFetch<ContentSnapshot>("content-system", "/api/v1/content/snapshot");
}

function defaultPrereq(intent: string, primarySkill: string | null | undefined) {
  if (intent === "BUILD") return ["BUILDING"];
  if (intent === "CRAFT_RECIPE") return ["CRAFTING"];
  if (intent === "MINE") return ["MINING"];
  if (intent === "FORAGE") return ["FORAGING"];
  if (intent === "SCOUT") return ["EXPLORATION"];
  return [String(primarySkill ?? "GENERAL").toUpperCase() || "GENERAL"];
}

function commonWordRisk(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  const words = normalized.split(" ");
  if (words.length > 4) return true;
  return words.every((word) => STOPWORDS.has(word));
}

function terrainMatches(requiredTerrain: string[] | undefined, nearbyTerrain: string[]) {
  if (!requiredTerrain?.length) return true;
  const normalized = nearbyTerrain.map((entry) => normalizeText(entry));
  return requiredTerrain.some((entry) => normalized.includes(normalizeText(entry)));
}

async function airtableCreate(tableName: string, fields: Record<string, unknown>) {
  const cfg = airtableConfig();
  if (!cfg) return null;
  const response = await fetch(`https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] })
  });
  if (!response.ok) throw new Error(`Airtable create failed for ${tableName} with ${response.status}`);
  return response.json();
}

async function persistRuntime(record: { item?: DynamicItemRecord | null; skill?: DynamicSkillRecord | null; recipe?: RecipeRecord | null; aliases?: string[]; discovery?: ContentSnapshot["discoveries"][number] | null }) {
  await serviceFetch("content-system", "/api/v1/content/upsert-runtime", "POST", {
    item: record.item ?? undefined,
    skill: record.skill ?? undefined,
    recipe: record.recipe ?? undefined,
    discovery: record.discovery ?? undefined,
    aliases: uniqueList(record.aliases ?? []).map((alias) => ({ alias, canonicalType: record.discovery?.type ?? (record.item ? "item" : record.skill ? "skill" : record.recipe ? "recipe" : "item"), canonicalKey: record.discovery?.targetKey ?? record.item?.itemKey ?? record.skill?.skillKey ?? record.recipe?.recipeKey ?? "" }))
  });
}

function buildDiscoveryRecord(item: DynamicItemRecord | null, skill: DynamicSkillRecord | null, recipe: RecipeRecord | null, message: string, aliases: string[], intent: string, nearbyTerrain: string[], confidence: number) {
  const type = item ? "item" : skill ? "skill" : recipe ? "recipe" : "item";
  const targetKey = item?.itemKey ?? skill?.skillKey ?? recipe?.recipeKey ?? "unknown_discovery";
  return {
    discoveryKey: `discovery_${targetKey}`,
    type,
    targetKey,
    aliases,
    terrainRules: nearbyTerrain,
    intentRules: [intent],
    confidenceMin: confidence,
    autoCreate: true,
    status: "active",
    item,
    skill,
    recipe,
    reason: message
  };
}

async function persistIfNeeded(item: DynamicItemRecord | null, skill: DynamicSkillRecord | null, recipe: RecipeRecord | null, aliases: string[], intent: string, nearbyTerrain: string[], confidence: number, message: string) {
  const discovery = buildDiscoveryRecord(item, skill, recipe, message, aliases, intent, nearbyTerrain, confidence);
  const cfg = airtableConfig();
  if (cfg) {
    if (item) {
      await airtableCreate(cfg.tableItems, {
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
    if (skill) {
      await airtableCreate(cfg.tableSkills, {
        skillKey: skill.skillKey,
        name: skill.name,
        description: skill.description,
        unlockHint: skill.unlockHint,
        prereqs: skill.prereqs ?? [],
        discoverable: skill.discoverable ?? true,
        status: skill.status ?? "active"
      });
    }
    if (recipe) {
      await airtableCreate(cfg.tableRecipes, {
        recipeKey: recipe.recipeKey,
        name: recipe.name,
        inputsJson: JSON.stringify(recipe.inputs ?? []),
        outputsJson: JSON.stringify(recipe.outputs ?? []),
        toolsJson: JSON.stringify(recipe.tools ?? []),
        station: recipe.station ?? "FIELD",
        keywords: recipe.keywords ?? []
      });
    }
    await airtableCreate(cfg.tableDiscoveries, {
      discoveryKey: discovery.discoveryKey,
      type: discovery.type,
      targetKey: discovery.targetKey,
      aliases: discovery.aliases,
      reason: discovery.reason,
      terrainRules: discovery.terrainRules,
      intentRules: discovery.intentRules,
      confidenceMin: discovery.confidenceMin,
      autoCreate: discovery.autoCreate,
      status: discovery.status,
      skillKey: skill?.skillKey,
      recipeKey: recipe?.recipeKey
    });
    for (const alias of aliases) {
      await airtableCreate(cfg.tableAliases, { alias, canonicalType: discovery.type, canonicalKey: discovery.targetKey, confidenceBoost: 0.18 });
    }
  } else {
    await persistRuntime({ item, skill, recipe, aliases, discovery });
  }
}

function canonicalItemFromSnapshot(snapshot: ContentSnapshot, key: string, aliasHint?: string | null) {
  const aliasRecord = aliasHint ? snapshot.aliases[normalizeText(aliasHint)] : null;
  const canonicalKey = aliasRecord?.canonicalKey ?? key;
  return snapshot.dynamicItems[canonicalKey] ?? null;
}

app.post("/api/v1/creation/resolve-proposals", async (req, res) => {
  const requestId = getRequestId(req);
  const proposals = Array.isArray(req.body.proposals) ? req.body.proposals as Proposal[] : [];
  const intent = String(req.body.intent ?? "GENERAL").toUpperCase();
  const primarySkill = String(req.body.primarySkill ?? "GENERAL").toUpperCase();
  const nearbyTerrain = Array.isArray(req.body.nearbyTerrain) ? req.body.nearbyTerrain.map((entry: unknown) => normalizeText(String(entry))) : [];
  const note = String(req.body.note ?? "");

  try {
    const snapshot = await readSnapshot();
    let item: DynamicItemRecord | null = null;
    let skill: DynamicSkillRecord | null = null;
    let recipe: RecipeRecord | null = null;
    const resolutions: Array<{ type: string; key: string; status: string }> = [];

    for (const proposal of proposals.sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))) {
      if (proposal.type === "item" && !item) {
        const aliasCandidates = uniqueList([proposal.key, ...(proposal.aliases ?? [])]);
        const matchedAlias = aliasCandidates.map((alias) => snapshot.aliases[normalizeText(alias)]).find(Boolean) ?? null;
        const existing = canonicalItemFromSnapshot(snapshot, proposal.key, aliasCandidates[0] ?? null);
        if (existing || matchedAlias) {
          item = existing ?? snapshot.dynamicItems[matchedAlias?.canonicalKey ?? ""] ?? null;
          if (item) resolutions.push({ type: "item", key: item.itemKey, status: "linked_existing" });
          continue;
        }
        const candidate = proposal.item ?? {
          itemKey: slugifyWords(proposal.key),
          name: proposal.name ?? titleCaseLocal(proposal.key),
          description: proposal.description ?? `A newly recognized world item described by the action note as ${normalizeText(proposal.key)}.`,
          category: "DISCOVERED",
          preferredSkills: proposal.preferredSkills ?? [primarySkill, "SURVIVAL"],
          requiredTerrain: proposal.requiredTerrain ?? nearbyTerrain,
          synonyms: aliasCandidates,
          discoverable: true,
          status: "active"
        };
        const confidence = Number(proposal.confidence ?? 0.5);
        if (commonWordRisk(candidate.itemKey) || commonWordRisk(candidate.name)) {
          resolutions.push({ type: "item", key: candidate.itemKey, status: "rejected_common_word" });
          continue;
        }
        if (!terrainMatches(candidate.requiredTerrain, nearbyTerrain) && ["MINE", "FORAGE", "SCOUT"].includes(intent)) {
          resolutions.push({ type: "item", key: candidate.itemKey, status: "rejected_terrain_mismatch" });
          continue;
        }
        item = candidate;
        await persistIfNeeded(item, null, null, aliasCandidates, intent, nearbyTerrain, confidence, proposal.reason ?? `Created from action note: ${note}`);
        resolutions.push({ type: "item", key: item.itemKey, status: airtableConfig() ? "created_airtable" : "created_runtime" });
      }

      if (proposal.type === "skill" && !skill) {
        const skillKey = String(proposal.skill?.skillKey ?? proposal.key ?? "").toUpperCase();
        if (!skillKey) continue;
        if (snapshot.skills[skillKey]) {
          skill = snapshot.skills[skillKey];
          resolutions.push({ type: "skill", key: skillKey, status: "linked_existing" });
          continue;
        }
        const candidate = proposal.skill ?? {
          skillKey,
          name: proposal.name ?? titleCaseLocal(skillKey),
          description: proposal.description ?? `${titleCaseLocal(skillKey)} became discoverable through play.`,
          unlockHint: proposal.reason ?? `Continue using ${titleCaseLocal(primarySkill)} actions to develop ${titleCaseLocal(skillKey)}.`,
          prereqs: defaultPrereq(intent, primarySkill),
          discoverable: true,
          status: "active"
        };
        const confidence = Number(proposal.confidence ?? 0.5);
        skill = candidate;
        await persistIfNeeded(null, skill, null, [skill.name, skill.skillKey], intent, nearbyTerrain, confidence, proposal.reason ?? `Created from action note: ${note}`);
        resolutions.push({ type: "skill", key: skill.skillKey, status: airtableConfig() ? "created_airtable" : "created_runtime" });
      }

      if (proposal.type === "recipe" && !recipe) {
        const candidate = proposal.recipe ?? null;
        if (!candidate) continue;
        if (snapshot.recipes[candidate.recipeKey]) {
          recipe = snapshot.recipes[candidate.recipeKey];
          resolutions.push({ type: "recipe", key: recipe.recipeKey, status: "linked_existing" });
          continue;
        }
        const confidence = Number(proposal.confidence ?? 0.5);
        recipe = candidate;
        await persistIfNeeded(null, null, recipe, [recipe.name, recipe.recipeKey], intent, nearbyTerrain, confidence, proposal.reason ?? `Created from action note: ${note}`);
        resolutions.push({ type: "recipe", key: recipe.recipeKey, status: airtableConfig() ? "created_airtable" : "created_runtime" });
      }
    }

    const message = item
      ? `Resolved content for ${item.name}${skill ? ` and ${skill.name}` : ""}.`
      : skill
        ? `Resolved content for ${skill.name}.`
        : recipe
          ? `Resolved content for ${recipe.name}.`
          : "No proposal was approved into canonical content.";

    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      content: { item, skill, recipe, message } satisfies DiscoveryRecord,
      resolutions,
      source: airtableConfig() ? "airtable" : "runtime"
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CREATE_RESOLVE_FAILED", error instanceof Error ? error.message : "Creation failed", 500);
  }
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
