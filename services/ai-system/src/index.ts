import { SERVICE_VERSION, createServiceApp, getRequestId, getServiceUrl, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "ai-system";
const PORT = 41742;
const app = createServiceApp(SERVICE_NAME);

const NPC_RULES = {
  toneRules: [
    "Keep NPC replies grounded, readable, and in-world.",
    "No modern slang, memes, or fourth-wall jokes.",
    "Stay concise: usually 1 to 3 sentences.",
    "Offer direction, not endless exposition.",
    "Dangerous or cruel themes should feel restrained, not graphic.",
    "When a player describes a mixed-skill action, reflect the idea naturally without sounding mechanical."
  ],
  themeRules: [
    "The world tone is frontier fantasy with survival pressure.",
    "Nature feels old, watchful, and slightly mystical.",
    "NPCs speak like people shaped by work, weather, and risk.",
    "Hope exists, but it is earned through effort and trust.",
    "Magic should feel uncommon, deliberate, and costly rather than flashy."
  ],
  guardrails: [
    "Do not reveal hidden system internals.",
    "Do not break character unless asked in an admin context.",
    "Give practical next-step hints when the player seems lost.",
    "Treat player action notes as intent signals, not guaranteed outcomes."
  ]
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

type RecipeRecord = {
  recipeKey: string;
  name: string;
  inputs: Array<{ itemKey: string; amount: number }>;
  outputs: Array<{ itemKey: string; amount: number }>;
  tools?: Array<{ toolKey: string }>;
  station?: string;
  keywords?: string[];
};

type DiscoverySeedRecord = {
  discoveryKey: string;
  type: string;
  targetKey: string;
  aliases: string[];
  terrainRules?: string[];
  intentRules?: string[];
  confidenceMin?: number;
  autoCreate?: boolean;
  status?: string;
  item?: DynamicItemRecord | null;
  skill?: DynamicSkillRecord | null;
  recipe?: RecipeRecord | null;
  reason?: string;
};

type ContentSnapshot = {
  items: Record<string, { name: string; description: string }>;
  dynamicItems: Record<string, DynamicItemRecord>;
  skills: Record<string, DynamicSkillRecord>;
  skillPrereqs: Record<string, string[]>;
  intentSkills: Record<string, string[]>;
  herbCatalog: Array<{ key: string; weight: number; terrain: string[] }>;
  discoveries: DiscoverySeedRecord[];
  aliases: Record<string, { canonicalType: string; canonicalKey: string; confidenceBoost?: number }>;
  recipes: Record<string, RecipeRecord>;
  source: string;
};

type Proposal = {
  type: "item" | "skill" | "recipe";
  key: string;
  name?: string;
  description?: string;
  confidence: number;
  reason: string;
  item?: DynamicItemRecord;
  skill?: DynamicSkillRecord;
  recipe?: RecipeRecord;
  aliases?: string[];
  requiredTerrain?: string[];
  preferredSkills?: string[];
};

const FALLBACK_DISCOVERIES: DiscoverySeedRecord[] = [
  {
    discoveryKey: "discovery_flint",
    type: "item",
    targetKey: "flint",
    aliases: ["flint", "flint stone", "flint shard"],
    terrainRules: ["rock", "grass"],
    intentRules: ["MINE", "SCOUT", "FORAGE"],
    confidenceMin: 0.6,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "flint",
      name: "Flint",
      description: "A hard dark stone that breaks into sharp edges, useful for primitive tools and sparks.",
      category: "MINERAL",
      preferredSkills: ["MINING", "SURVIVAL"],
      requiredTerrain: ["rock", "grass"],
      synonyms: ["flint", "flint stone", "flint shard"],
      discoverable: true,
      status: "active"
    },
    skill: {
      skillKey: "KNAPPING",
      name: "Knapping",
      description: "The shaping of flint and similar stone into sharp, useful forms.",
      unlockHint: "Chip, shape, or craft simple flint tools to discover Knapping.",
      prereqs: ["CRAFTING"],
      discoverable: true,
      status: "active"
    },
    reason: "Rocky terrain often exposes workable flint."
  },
  {
    discoveryKey: "discovery_quartz",
    type: "item",
    targetKey: "quartz",
    aliases: ["quartz", "quarz", "quartz crystal", "crystal quartz"],
    terrainRules: ["rock"],
    intentRules: ["MINE", "SCOUT"],
    confidenceMin: 0.6,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "quartz",
      name: "Quartz",
      description: "A pale crystal vein with glassy fracture lines and a faint inner gleam.",
      category: "MINERAL",
      preferredSkills: ["MINING"],
      requiredTerrain: ["rock"],
      synonyms: ["quartz", "quarz", "quartz crystal", "crystal quartz"],
      discoverable: true,
      status: "active"
    },
    skill: {
      skillKey: "LAPIDARY",
      name: "Lapidary",
      description: "The cutting, shaping, and finishing of crystal and stone.",
      unlockHint: "Cut, polish, or mount quartz and other crystals to discover Lapidary.",
      prereqs: ["MINING"],
      discoverable: true,
      status: "active"
    },
    reason: "Quartz is a known crystal-bearing discovery for rock tiles."
  }
];

const COMMON_WORDS = new Set([
  "the", "a", "an", "i", "me", "my", "you", "it", "that", "this", "these", "those", "thing", "things", "stuff", "item", "items", "world", "area", "place", "common", "word", "words", "something", "anything", "everything", "there", "here", "look", "search", "find", "gather", "collect", "make", "craft", "build", "shape", "prepare", "mine", "forage", "check", "want", "need", "should", "could", "would", "with", "from", "into", "using", "new", "more", "less", "such"
]);

async function serviceFetch<T = unknown>(serviceName: string, routePath: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${getServiceUrl(serviceName)}${routePath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token"
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const json = (await response.json()) as { data?: T };
  if (!response.ok) throw new Error(`${serviceName} returned ${response.status}`);
  return json.data as T;
}

let snapshotCache: { at: number; data: ContentSnapshot | null } = { at: 0, data: null };
async function getContentSnapshot(force = false): Promise<ContentSnapshot> {
  if (!force && snapshotCache.data && Date.now() - snapshotCache.at < 30_000) return snapshotCache.data;
  try {
    const data = await serviceFetch<ContentSnapshot>("content-system", "/api/v1/content/snapshot");
    snapshotCache = { at: Date.now(), data };
    return data;
  } catch {
    const fallback: ContentSnapshot = {
      items: {},
      dynamicItems: Object.fromEntries(FALLBACK_DISCOVERIES.filter((entry) => entry.item).map((entry) => [entry.item!.itemKey, entry.item!])),
      skills: Object.fromEntries(FALLBACK_DISCOVERIES.filter((entry) => entry.skill).map((entry) => [entry.skill!.skillKey, entry.skill!])),
      skillPrereqs: {},
      intentSkills: {},
      herbCatalog: [],
      discoveries: FALLBACK_DISCOVERIES,
      aliases: Object.fromEntries(FALLBACK_DISCOVERIES.flatMap((entry) => (entry.aliases ?? []).map((alias) => [normalizeText(alias), { canonicalType: entry.type, canonicalKey: entry.targetKey, confidenceBoost: 0.18 }]))),
      recipes: {},
      source: "seed"
    };
    snapshotCache = { at: Date.now(), data: fallback };
    return fallback;
  }
}

function hasToxicLanguage(content: string): boolean {
  const banned = ["slur", "hate", "kill"];
  return banned.some((word) => content.toLowerCase().includes(word));
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseLocal(value: string): string {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function slugifyWords(value: string): string {
  return normalizeText(value).replaceAll(" ", "_").slice(0, 48) || "unknown_discovery";
}

function uniqueList(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function buildNpcReply(payload: Record<string, unknown>) {
  const npcId = String(payload.npcId ?? "npc_unknown");
  const prompt = String(payload.prompt ?? "Hello.");
  const tone = String(payload.tone ?? "grounded");
  const theme = String(payload.theme ?? "frontier_fantasy");
  const npcName = npcId === "npc_elder_rowan" ? "Elder Rowan" : npcId === "npc_guard_lyra" ? "Guard Lyra" : "The local";

  let lead = `${npcName} studies you for a moment.`;
  if (npcId === "npc_elder_rowan") lead = "Elder Rowan warms his hands by the fire before answering.";
  if (npcId === "npc_guard_lyra") lead = "Guard Lyra shifts her stance, voice steady and measured.";

  let guidance = "Take the next small task seriously, and the land will start opening to you.";
  if (/wood|tree|forest/i.test(prompt)) guidance = "The woods will give what you ask of them, but only if you move with care and leave with purpose.";
  if (/fight|spar|combat/i.test(prompt)) guidance = "Keep your footing, watch their shoulders, and never throw strength where timing would do.";
  if (/build|block|wall|place/i.test(prompt)) guidance = "Build where the ground is honest, and think about tomorrow before you drop the first stone.";
  if (/ritual|sigil|altar|magic/i.test(prompt)) guidance = "If you work ritual into labor, be precise about the place, the cost, and what you are asking the land to accept.";
  if (/forag|herb|mushroom|berry/i.test(prompt)) guidance = "Foraging rewards patience. The useful things rarely sit in the open for long.";

  const tonalTail =
    tone === "grim"
      ? "Out here, hesitation has a cost."
      : tone === "warm"
        ? "You do not have to face the frontier alone."
        : tone === "mysterious"
          ? "Some paths only answer when you walk them."
          : "Learn the rhythm of this place, and it will stop feeling hostile.";

  const themeTail =
    theme === "ancient_mystic"
      ? "There are older patterns under the soil than most settlers understand."
      : theme === "hard_survival"
        ? "Food, shelter, and patience matter more than pride."
        : "The frontier remembers what people build and what they abandon.";

  return `${lead} ${guidance} ${tonalTail} ${themeTail}`.trim();
}

function detectCanonicalDiscovery(text: string, snapshot: ContentSnapshot) {
  const normalized = normalizeText(text);
  for (const entry of snapshot.discoveries ?? []) {
    if ((entry.aliases ?? []).some((alias) => normalized.includes(normalizeText(alias)))) return entry;
  }
  const aliasHit = Object.entries(snapshot.aliases ?? {}).find(([alias]) => normalized.includes(alias));
  if (aliasHit) {
    return (snapshot.discoveries ?? []).find((entry) => entry.targetKey === aliasHit[1].canonicalKey) ?? null;
  }
  return null;
}

function isLikelyCommonWord(candidate: string) {
  const normalized = normalizeText(candidate);
  if (!normalized || normalized.length < 3) return true;
  const words = normalized.split(" ");
  if (words.length > 4) return true;
  return words.every((word) => COMMON_WORDS.has(word));
}

function extractCandidatePhrase(text: string, intent: string): string | null {
  const normalized = normalizeText(text);
  const patterns = [
    /(?:find|look for|search for|gather|collect|harvest|mine|dig up|forage for|track down)\s+([a-z][a-z\s_-]{1,40})/,
    /(?:craft|make|build|shape|assemble|forge|smelt|brew|prepare)\s+(?:a|an|some)?\s*([a-z][a-z\s_-]{1,40})/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].replace(/\b(with|from|using|near|at|on|into|out of)\b.*$/, "").trim();
      if (candidate && !isLikelyCommonWord(candidate)) return candidate;
    }
  }

  const tokens = normalized.match(/\b([a-z][a-z_-]{2,})\b/g) ?? [];
  const filtered = tokens.filter((token) => !COMMON_WORDS.has(token));
  if (intent === "MINE") return filtered.find((token) => !["rock", "stone", "ore", "quarry"].includes(token)) ?? null;
  if (intent === "FORAGE" || intent === "SCOUT") return filtered.find((token) => !["nearby", "patch", "terrain", "brush"].includes(token)) ?? null;
  if (intent === "BUILD" || intent === "CRAFT_RECIPE") return filtered.find((token) => !["tool", "recipe", "craft", "build"].includes(token)) ?? null;
  return filtered[0] ?? null;
}

function pickDynamicSkill(text: string, intent: string, canonical: DiscoverySeedRecord | null) {
  const normalized = normalizeText(text);
  if (/(knap|knapp|chip stone|shape flint|arrowhead|stone blade|flint tool)/.test(normalized)) {
    return {
      skillKey: "KNAPPING",
      name: "Knapping",
      description: "The shaping of brittle stone into edges, points, and practical tools.",
      unlockHint: "Shape flint, obsidian, or quartz into useful forms to discover Knapping.",
      prereqs: ["CRAFTING"],
      discoverable: true,
      status: "active"
    } satisfies DynamicSkillRecord;
  }
  if (/(lapidar|polish|facet|cut crystal|cut quartz|gem work|mount crystal)/.test(normalized)) {
    return {
      skillKey: "LAPIDARY",
      name: "Lapidary",
      description: "The cutting and finishing of crystal and decorative stone.",
      unlockHint: "Cut or polish quartz and other crystals to discover Lapidary.",
      prereqs: ["MINING"],
      discoverable: true,
      status: "active"
    } satisfies DynamicSkillRecord;
  }
  if (/(weave|woven|cordage|rope|braid fiber|basket)/.test(normalized)) {
    return {
      skillKey: "WEAVING",
      name: "Weaving",
      description: "The twisting and interlocking of fibers into stronger forms.",
      unlockHint: "Twist reeds or plant fiber into bindings and simple goods to discover Weaving.",
      prereqs: ["FORAGING"],
      discoverable: true,
      status: "active"
    } satisfies DynamicSkillRecord;
  }
  if (/(mason|stonework|stone wall|cut stone|dress stone|mortar)/.test(normalized) || (intent === "BUILD" && normalized.includes("stone"))) {
    return {
      skillKey: "MASONRY",
      name: "Masonry",
      description: "The careful shaping and fitting of stone into lasting structures.",
      unlockHint: "Build with stone and shaped blocks to discover Masonry.",
      prereqs: ["BUILDING"],
      discoverable: true,
      status: "active"
    } satisfies DynamicSkillRecord;
  }
  if (/(alchemy|potion|tincture|distill|compound|reagent)/.test(normalized)) {
    return {
      skillKey: "ALCHEMY",
      name: "Alchemy",
      description: "The combining of volatile ingredients into concentrated effects.",
      unlockHint: "Experiment with herbs, ash, and crystal reagents to discover Alchemy.",
      prereqs: ["CRAFTING"],
      discoverable: true,
      status: "active"
    } satisfies DynamicSkillRecord;
  }
  if (canonical?.skill && (intent === "CRAFT_RECIPE" || intent === "BUILD" || /shape|craft|make|tool|cut|polish/.test(normalized))) return canonical.skill;
  return null;
}

function buildDynamicItem(candidate: string, intent: string, nearbyTerrain: string[], canonical: DiscoverySeedRecord | null) {
  if (canonical?.item) return canonical.item;
  if (!candidate || isLikelyCommonWord(candidate)) return null;
  const itemKey = slugifyWords(candidate);
  const terrain = uniqueList([
    ...(nearbyTerrain.length ? nearbyTerrain : [intent === "MINE" ? "rock" : intent === "FORAGE" ? "forest" : intent === "BUILD" ? "grass" : "grass"])
  ]);
  const category = intent === "MINE" ? "MINERAL" : intent === "FORAGE" || intent === "SCOUT" ? "PLANT" : intent === "BUILD" ? "BUILDING_COMPONENT" : "CRAFTED_GOOD";
  const preferredSkills = uniqueList([
    intent === "MINE" ? "MINING" : null,
    intent === "FORAGE" || intent === "SCOUT" ? "FORAGING" : null,
    intent === "BUILD" ? "BUILDING" : null,
    intent === "CRAFT_RECIPE" ? "CRAFTING" : null,
    "SURVIVAL"
  ]);
  const name = titleCaseLocal(itemKey);
  const flavorPrefix = category === "MINERAL"
    ? "A rough mineral piece"
    : category === "PLANT"
      ? "A gathered natural material"
      : category === "BUILDING_COMPONENT"
        ? "A simple building component"
        : "A frontier-made item";

  return {
    itemKey,
    name,
    description: `${flavorPrefix} described by the player as ${candidate}.`,
    category,
    preferredSkills,
    requiredTerrain: terrain,
    synonyms: uniqueList([candidate]),
    discoverable: true,
    status: "active"
  } satisfies DynamicItemRecord;
}

function buildRecipeHint(text: string, intent: string, item: DynamicItemRecord | null) {
  if (!item || !(intent === "CRAFT_RECIPE" || intent === "BUILD" || /craft|make|build|shape|assemble|forge|brew/.test(normalizeText(text)))) return null;
  const normalized = normalizeText(text);
  if (item.itemKey === "flint" && /(knife|blade|point|arrow)/.test(normalized)) {
    return {
      recipeKey: "recipe_flint_blade",
      name: "Flint Blade",
      inputs: [{ itemKey: "flint", amount: 1 }, { itemKey: "stem_fiber", amount: 1 }],
      outputs: [{ itemKey: "flint_blade", amount: 1 }],
      keywords: ["flint", "blade", "knife", "primitive tool"]
    } satisfies RecipeRecord;
  }
  if (item.itemKey === "quartz" && /(focus|charm|lens|pendant|setting)/.test(normalized)) {
    return {
      recipeKey: "recipe_quartz_focus",
      name: "Quartz Focus",
      inputs: [{ itemKey: "quartz", amount: 1 }, { itemKey: "stem_fiber", amount: 1 }],
      outputs: [{ itemKey: "quartz_focus", amount: 1 }],
      keywords: ["quartz", "focus", "charm", "lens"]
    } satisfies RecipeRecord;
  }
  if (intent === "BUILD") {
    return {
      recipeKey: `recipe_${item.itemKey}`,
      name: item.name,
      inputs: [{ itemKey: "wood_log", amount: 1 }],
      outputs: [{ itemKey: item.itemKey, amount: 1 }],
      keywords: [item.itemKey, item.name.toLowerCase()]
    } satisfies RecipeRecord;
  }
  return {
    recipeKey: `recipe_${item.itemKey}`,
    name: item.name,
    inputs: [{ itemKey: item.preferredSkills?.includes("MINING") ? "stone_chunk" : "stem_fiber", amount: 1 }],
    outputs: [{ itemKey: item.itemKey, amount: 1 }],
    keywords: [item.itemKey, item.name.toLowerCase()]
  } satisfies RecipeRecord;
}

function buildAnalysis(note: string, intent: string, nearbyTerrain: string[], knownItems: string[], knownSkills: string[], snapshot: ContentSnapshot) {
  const canonical = detectCanonicalDiscovery(note, snapshot);
  const candidate = extractCandidatePhrase(note, intent) ?? canonical?.aliases?.[0] ?? null;
  const proposals: Proposal[] = [];
  const item = candidate ? buildDynamicItem(candidate, intent, nearbyTerrain, canonical) : null;
  const skill = pickDynamicSkill(note, intent, canonical);
  const recipe = buildRecipeHint(note, intent, item);

  if (item && !knownItems.includes(item.itemKey)) {
    proposals.push({
      type: "item",
      key: item.itemKey,
      name: item.name,
      description: item.description,
      confidence: canonical ? 0.95 : 0.76,
      reason: canonical?.reason ?? `The note appears to reference a valid world material called ${item.name}.`,
      item,
      aliases: uniqueList([candidate, ...(item.synonyms ?? [])]),
      requiredTerrain: item.requiredTerrain,
      preferredSkills: item.preferredSkills
    });
  }

  if (skill && !knownSkills.includes(skill.skillKey)) {
    proposals.push({
      type: "skill",
      key: skill.skillKey,
      name: skill.name,
      description: skill.description,
      confidence: canonical?.skill?.skillKey === skill.skillKey ? 0.92 : 0.74,
      reason: skill.unlockHint,
      skill
    });
  }

  if (recipe && !snapshot.recipes[recipe.recipeKey]) {
    proposals.push({
      type: "recipe",
      key: recipe.recipeKey,
      name: recipe.name,
      description: `A craftable result inferred from the note for ${recipe.name}.`,
      confidence: 0.68,
      reason: `The note suggests a craft path for ${recipe.name}.`,
      recipe
    });
  }

  return {
    intent,
    target: candidate ? { text: candidate, normalizedKey: slugifyWords(candidate), type: item ? "item_candidate" : "unknown" } : null,
    confidence: proposals.length ? Math.max(...proposals.map((proposal) => proposal.confidence)) : canonical ? 0.6 : 0.32,
    proposals,
    message: proposals.length ? `Generated ${proposals.length} canonical content proposal(s).` : "No stable content proposal was inferred from that note."
  };
}

app.post("/api/v1/ai/classify-actions", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "rules-demo-v3",
      confidence: 0.87,
      content: (req.body.actions ?? []).map((action: { actionType?: string; note?: string; primarySkill?: string; secondarySkill?: string }) => {
        const text = `${action.actionType ?? ""} ${action.note ?? ""} ${action.primarySkill ?? ""} ${action.secondarySkill ?? ""}`.toUpperCase();
        const label = /RITUAL|MAGIC|SIGIL|ARCANE/.test(text)
          ? "MYSTIC"
          : /BUILD|PLACE|WALL|BLOCK/.test(text)
            ? "BUILDING"
            : /WOOD|LOG|TREE|FORAGE|HERB/.test(text)
              ? "GATHERING"
              : /MINE|ROCK|ORE|STONE/.test(text)
                ? "EXTRACTION"
                : /CHAT|TALK|GREET|BARTER/.test(text)
                  ? "SOCIAL"
                  : /FIGHT|SPAR|ATTACK/.test(text)
                    ? "COMBAT"
                    : "GENERAL";
        return { actionType: action.actionType ?? "UNKNOWN", label };
      })
    }
  });
});

app.post("/api/v1/ai/suggest-skill", (req, res) => {
  const requestId = getRequestId(req);
  const text = String(req.body.text ?? "").toLowerCase();
  const skills = new Set<string>();
  if (/axe|wood|tree|log|timber/.test(text)) skills.add("WOODCUTTING");
  if (/mine|rock|ore|stone|quarry|flint|quartz|quarz|crystal/.test(text)) skills.add("MINING");
  if (/build|wall|block|house|fortify/.test(text)) skills.add("BUILDING");
  if (/talk|chat|friend|barter|trade/.test(text)) skills.add("SOCIAL");
  if (/explore|map|scout|travel/.test(text)) skills.add("EXPLORATION");
  if (/forage|herb|mushroom|berry|root|reed|fiber/.test(text)) skills.add("FORAGING");
  if (/fish|river|hook|net/.test(text)) skills.add("FISHING");
  if (/track|trail|footprint|prints/.test(text)) skills.add("TRACKING");
  if (/ritual|sigil|altar|offering|chant/.test(text)) skills.add("RITUALS");
  if (/magic|spell|arcane|mana|focus/.test(text)) skills.add("MAGIC");
  if (/heal|bandage|medic/.test(text)) skills.add("HEALING");
  if (/knap|arrowhead|stone blade|flint tool/.test(text)) skills.add("KNAPPING");
  if (/lapidar|polish|facet|quartz focus|cut crystal/.test(text)) skills.add("LAPIDARY");
  if (/weave|cordage|braid|basket/.test(text)) skills.add("WEAVING");
  if (/mason|stonework|mortar|stone wall/.test(text)) skills.add("MASONRY");
  if (/alchemy|tincture|potion|reagent/.test(text)) skills.add("ALCHEMY");
  if (!skills.size) skills.add("SURVIVAL");
  skills.add("SURVIVAL");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: { model: "rules-demo-v3", confidence: 0.78, content: Array.from(skills) }
  });
});

app.post("/api/v1/ai/analyze-action", async (req, res) => {
  const requestId = getRequestId(req);
  const note = String(req.body.note ?? req.body.text ?? "");
  const intent = String(req.body.intent ?? "GENERAL").toUpperCase();
  const nearbyTerrain = Array.isArray(req.body.nearbyTerrain) ? req.body.nearbyTerrain.map((value: unknown) => normalizeText(String(value))) : [];
  const knownItems = Array.isArray(req.body.knownItems) ? req.body.knownItems.map((value: unknown) => String(value)) : [];
  const knownSkills = Array.isArray(req.body.knownSkills) ? req.body.knownSkills.map((value: unknown) => String(value).toUpperCase()) : [];
  const snapshot = await getContentSnapshot();
  const analysis = buildAnalysis(note, intent, nearbyTerrain, knownItems, knownSkills, snapshot);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "frontier-discovery-rules-v2",
      confidence: analysis.confidence,
      intent: analysis.intent,
      target: analysis.target,
      proposals: analysis.proposals,
      message: analysis.message
    }
  });
});

app.post("/api/v1/ai/discover-content", async (req, res) => {
  const requestId = getRequestId(req);
  const note = String(req.body.note ?? req.body.text ?? "");
  const intent = String(req.body.intent ?? "GENERAL").toUpperCase();
  const nearbyTerrain = Array.isArray(req.body.nearbyTerrain) ? req.body.nearbyTerrain.map((value: unknown) => normalizeText(String(value))) : [];
  const knownItems = Array.isArray(req.body.knownItems) ? req.body.knownItems.map((value: unknown) => String(value)) : [];
  const knownSkills = Array.isArray(req.body.knownSkills) ? req.body.knownSkills.map((value: unknown) => String(value).toUpperCase()) : [];
  const snapshot = await getContentSnapshot();
  const analysis = buildAnalysis(note, intent, nearbyTerrain, knownItems, knownSkills, snapshot);
  const firstItem = analysis.proposals.find((proposal) => proposal.type === "item")?.item ?? null;
  const firstSkill = analysis.proposals.find((proposal) => proposal.type === "skill")?.skill ?? null;
  const firstRecipe = analysis.proposals.find((proposal) => proposal.type === "recipe")?.recipe ?? null;

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "frontier-discovery-rules-v2",
      confidence: analysis.confidence,
      content: {
        item: firstItem,
        skill: firstSkill,
        recipe: firstRecipe,
        message: analysis.message
      },
      proposals: analysis.proposals
    }
  });
});

app.post("/api/v1/ai/evaluate-recipe", (req, res) => {
  const requestId = getRequestId(req);
  const description = String(req.body.description ?? "");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "rules-demo-v2",
      confidence: 0.76,
      content: {
        viable: description.length > 10,
        notes: ["Recipe description was parsed", "Check tools, fuel, and nearby terrain before allowing craft", "Mixed action notes can help infer missing ingredients"]
      }
    }
  });
});

app.post("/api/v1/ai/generate-dialogue", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "npc-rules-v3",
      confidence: 0.9,
      content: {
        reply: buildNpcReply(req.body ?? {}),
        appliedRules: NPC_RULES
      }
    }
  });
});

app.post("/api/v1/ai/generate-quest-text", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "template-demo-v2",
      confidence: 0.83,
      content: {
        title: `The ${req.body.theme ?? "Frontier"} Path`,
        summary: `Investigate ${req.body.theme ?? "the frontier"} signs around quest ${req.body.questId ?? "quest_unknown"} and return with proof of progress.`
      }
    }
  });
});

app.post("/api/v1/ai/summarize-behavior", (req, res) => {
  const requestId = getRequestId(req);
  const events = req.body.events ?? [];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "summary-demo-v2",
      confidence: 0.75,
      content: { summary: `Character ${req.body.characterId} generated ${events.length} tracked behavior events, with a focus on ${events[0]?.actionType ?? "survival basics"}.` }
    }
  });
});

app.post("/api/v1/ai/moderate-chat", (req, res) => {
  const requestId = getRequestId(req);
  const flagged = hasToxicLanguage(String(req.body.content ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    result: {
      model: "moderation-demo-v1",
      confidence: flagged ? 0.9 : 0.88,
      content: { allowed: !flagged, labels: flagged ? ["ABUSE_RISK"] : [] }
    }
  });
});

app.get("/api/v1/ai/prompt-template/:templateKey", (req, res) => {
  const requestId = getRequestId(req);
  const templateKey = req.params.templateKey;
  const prompt =
    templateKey === "npc_dialogue_rules"
      ? [...NPC_RULES.toneRules, ...NPC_RULES.themeRules, ...NPC_RULES.guardrails].join(" ")
      : templateKey === "action_note_rules"
        ? "Action notes should be concrete, short, and describe what the player is trying to do, what primary skill is leading, what secondary skill is supporting, what tool is involved, and what the terrain or target is. Mixed notes like ritual foraging should read like real intent, not command syntax."
        : "You are an in-world assistant. Keep responses structured, lore-aware, grounded, and concise.";

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    templateKey,
    prompt,
    rules: NPC_RULES
  });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
