import {
  AIRTABLE_CHARACTERS_TABLE,
  SERVICE_VERSION,
  airtableCreateRecord,
  airtableEnabled,
  airtableFindRecordByField,
  airtableListRecords,
  airtableUpdateRecord,
  createServiceApp,
  defaultCharacterKnowledge,
  getRequestId,
  makeId,
  nowIso,
  sendError,
  sendSuccess,
  starterKnownSkills
} from "../../../packages/shared/src/index";
import type { CharacterRecord } from "../../../packages/shared/src/index";

const SERVICE_NAME = "character-system";
const PORT = Number(process.env.CHARACTER_SYSTEM_PORT ?? 41734);
const app = createServiceApp(SERVICE_NAME);
const characters = new Map<string, CharacterRecord>();
const vitalsHistory = new Map<string, Array<Record<string, unknown>>>();
const survivalHistory = new Map<string, Array<Record<string, unknown>>>();
const inventoryViews = new Map<string, { containers: Record<string, Record<string, number>> }>();
const equipmentByCharacter = new Map<string, Record<string, Record<string, unknown>>>();
const statusEffectsByCharacter = new Map<string, Array<Record<string, unknown>>>();
const reputationByCharacter = new Map<string, Record<string, number>>();
const factionsByCharacter = new Map<string, string[]>();
const homesByCharacter = new Map<string, Record<string, unknown>>();
const deathHistory = new Map<string, Array<Record<string, unknown>>>();
const titleHistory = new Map<string, Array<Record<string, unknown>>>();
const appearanceByCharacter = new Map<string, Record<string, unknown>>();


type CharacterFields = {
  characterId: string;
  accountId: string;
  name: string;
  race: string;
  positionJson: string;
  statsJson: string;
  vitalsJson: string;
  inventoryJson: string;
  skillsJson: string;
  knowledgeJson: string;
  createdAt: string;
  updatedAt: string;
};

type ExtendedCharacter = CharacterRecord & {
  inventory?: Record<string, number>;
  knowledge?: Record<string, unknown>;
  vitals?: Record<string, number>;
  position?: Record<string, unknown>;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sumInventory(containers: Record<string, Record<string, number>>) {
  const total: Record<string, number> = {};
  for (const container of Object.values(containers)) {
    for (const [itemKey, amountRaw] of Object.entries(container ?? {})) {
      const amount = Number(amountRaw ?? 0);
      if (!amount) continue;
      total[itemKey] = (total[itemKey] ?? 0) + amount;
      if (!total[itemKey]) delete total[itemKey];
    }
  }
  return total;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ensureKnowledgeShape(knowledge: Record<string, unknown> | null | undefined) {
  return {
    ...defaultCharacterKnowledge(),
    ...(knowledge ?? {}),
    unlockedTopics: Array.from(new Set([...(Array.isArray(knowledge?.unlockedTopics) ? knowledge.unlockedTopics : [])])),
    unlockedRecipes: Array.from(new Set([...(Array.isArray(knowledge?.unlockedRecipes) ? knowledge.unlockedRecipes : [])])),
    discoveredWorlds: Array.from(new Set(["world_prime", ...(Array.isArray(knowledge?.discoveredWorlds) ? knowledge.discoveredWorlds : [])])),
    generatedItemMeta: typeof knowledge?.generatedItemMeta === "object" && knowledge?.generatedItemMeta ? knowledge.generatedItemMeta : {},
    generatedSkillMeta: typeof knowledge?.generatedSkillMeta === "object" && knowledge?.generatedSkillMeta ? knowledge.generatedSkillMeta : {}
  };
}

function ensureCharacterShape(character: CharacterRecord): CharacterRecord {
  const next = character as ExtendedCharacter;
  next.position = next.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 };
  next.stats = next.stats ?? { strength: 5, agility: 5, intellect: 5, vitality: 5 };
  next.vitals = {
    hp: 100,
    mp: 25,
    stamina: 100,
    food: 100,
    water: 100,
    sleep: 100,
    ...(next.vitals ?? {})
  };
  next.inventory = typeof next.inventory === "object" && next.inventory ? next.inventory : {};
  next.skills = Array.isArray(next.skills) ? next.skills : starterKnownSkills();
  next.knowledge = ensureKnowledgeShape(next.knowledge ?? defaultCharacterKnowledge());
  return next as CharacterRecord;
}

function serializeCharacter(character: CharacterRecord): CharacterFields {
  const shaped = ensureCharacterShape(character) as ExtendedCharacter;
  const inventoryState = ensureInventoryState(shaped.characterId, shaped.inventory ?? {});
  shaped.inventory = sumInventory(inventoryState.containers);
  return {
    characterId: shaped.characterId,
    accountId: shaped.accountId,
    name: shaped.name,
    race: shaped.race,
    positionJson: JSON.stringify(shaped.position),
    statsJson: JSON.stringify(shaped.stats),
    vitalsJson: JSON.stringify(shaped.vitals),
    inventoryJson: JSON.stringify(shaped.inventory ?? {}),
    skillsJson: JSON.stringify(shaped.skills),
    knowledgeJson: JSON.stringify({ ...ensureKnowledgeShape(shaped.knowledge), lastSavedAt: nowIso() }),
    createdAt: shaped.createdAt,
    updatedAt: nowIso()
  };
}

function deserializeCharacter(fields: CharacterFields): CharacterRecord {
  return ensureCharacterShape({
    characterId: String(fields.characterId),
    accountId: String(fields.accountId),
    name: String(fields.name),
    race: String(fields.race) as CharacterRecord["race"],
    position: parseJson(fields.positionJson, { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 }),
    stats: parseJson(fields.statsJson, { strength: 5, agility: 5, intellect: 5, vitality: 5 }),
    vitals: parseJson(fields.vitalsJson, { hp: 100, mp: 25, stamina: 100, food: 100, water: 100, sleep: 100 }),
    inventory: parseJson(fields.inventoryJson, {}),
    skills: parseJson(fields.skillsJson, starterKnownSkills()),
    knowledge: ensureKnowledgeShape(parseJson(fields.knowledgeJson, defaultCharacterKnowledge())),
    createdAt: String(fields.createdAt ?? nowIso())
  } as CharacterRecord);
}

function createStarterCharacter(input: { accountId: string; name: string; race: string }): CharacterRecord {
  return ensureCharacterShape({
    characterId: makeId("char"),
    accountId: input.accountId,
    name: input.name,
    race: input.race as CharacterRecord["race"],
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 },
    stats: { strength: 5, agility: 5, intellect: 5, vitality: 5 },
    vitals: { hp: 100, mp: 25, stamina: 100, food: 100, water: 100, sleep: 100 },
    inventory: {},
    skills: starterKnownSkills(),
    knowledge: ensureKnowledgeShape(defaultCharacterKnowledge()),
    createdAt: nowIso()
  } as CharacterRecord);
}

function ensureInventoryState(characterId: string, baseInventory?: Record<string, number>) {
  const existing = inventoryViews.get(characterId);
  if (existing) {
    if (baseInventory && Object.keys(existing.containers.main ?? {}).length === 0) existing.containers.main = { ...baseInventory };
    return existing;
  }
  const created = { containers: { main: { ...(baseInventory ?? {}) } } };
  inventoryViews.set(characterId, created);
  return created;
}

function inventoryContainer(character: ExtendedCharacter, containerKey = "main") {
  const state = ensureInventoryState(character.characterId, character.inventory ?? {});
  if (!state.containers[containerKey]) state.containers[containerKey] = {};
  return state.containers[containerKey];
}

function syncInventoryToCharacter(character: ExtendedCharacter) {
  const state = ensureInventoryState(character.characterId, character.inventory ?? {});
  character.inventory = sumInventory(state.containers);
  return character.inventory;
}

function equipmentState(characterId: string) {
  if (!equipmentByCharacter.has(characterId)) equipmentByCharacter.set(characterId, {});
  return equipmentByCharacter.get(characterId) ?? {};
}

function statusEffects(characterId: string) {
  if (!statusEffectsByCharacter.has(characterId)) statusEffectsByCharacter.set(characterId, []);
  return statusEffectsByCharacter.get(characterId) ?? [];
}

function ensureReputation(characterId: string) {
  if (!reputationByCharacter.has(characterId)) reputationByCharacter.set(characterId, { settlers: 0, wilds: 0 });
  return reputationByCharacter.get(characterId) ?? { settlers: 0, wilds: 0 };
}

function ensureFactions(characterId: string) {
  if (!factionsByCharacter.has(characterId)) factionsByCharacter.set(characterId, ["settlers"]);
  return factionsByCharacter.get(characterId) ?? ["settlers"];
}

function pushVitalsHistory(characterId: string, reason: string, vitals: Record<string, number>) {
  const log = vitalsHistory.get(characterId) ?? [];
  const entry = { at: nowIso(), reason, vitals: { ...vitals } };
  log.push(entry);
  vitalsHistory.set(characterId, log.slice(-200));
  return entry;
}

function pushSurvivalHistory(characterId: string, kind: string, details: Record<string, unknown>) {
  const log = survivalHistory.get(characterId) ?? [];
  log.push({ at: nowIso(), kind, ...details });
  survivalHistory.set(characterId, log.slice(-200));
}

function applyVitalsPatch(character: ExtendedCharacter, patch: Record<string, unknown>, reason: string) {
  const vitals = character.vitals ?? { hp: 100, mp: 25, stamina: 100, food: 100, water: 100, sleep: 100 };
  vitals.hp = clamp(Number(patch.hp ?? vitals.hp ?? 100), 0, 100);
  vitals.mp = clamp(Number(patch.mp ?? vitals.mp ?? 25), 0, 100);
  vitals.stamina = clamp(Number(patch.stamina ?? vitals.stamina ?? 100), 0, 100);
  vitals.food = clamp(Number(patch.food ?? vitals.food ?? 100), 0, 100);
  vitals.water = clamp(Number(patch.water ?? vitals.water ?? 100), 0, 100);
  vitals.sleep = clamp(Number(patch.sleep ?? vitals.sleep ?? 100), 0, 100);
  character.vitals = vitals;
  pushVitalsHistory(character.characterId, reason, vitals);
  return vitals;
}

function applyXpToCharacter(character: CharacterRecord, xp: Record<string, number>) {
  for (const [skill, amountRaw] of Object.entries(xp ?? {})) {
    const normalizedSkill = String(skill).toUpperCase();
    const amount = Number(amountRaw ?? 0);
    const hit = character.skills.find((entry) => entry.skill === normalizedSkill);
    if (hit) {
      hit.xp += amount;
      hit.level = Math.max(1, Math.floor(hit.xp / 100) + 1);
    } else {
      character.skills.push({ skill: normalizedSkill, xp: amount, level: 1 });
    }
  }
}

async function loadCharacter(characterId: string) {
  if (!airtableEnabled()) {
    const found = characters.get(characterId) ?? null;
    return found ? ensureCharacterShape(found) : null;
  }
  const record = await airtableFindRecordByField<CharacterFields>(AIRTABLE_CHARACTERS_TABLE, "characterId", characterId);
  return record ? deserializeCharacter(record.fields) : null;
}

async function loadCharactersByAccount(accountId: string) {
  if (!airtableEnabled()) {
    return Array.from(characters.values()).filter((character) => character.accountId === accountId).map(ensureCharacterShape);
  }

  const result = await airtableListRecords<CharacterFields>(AIRTABLE_CHARACTERS_TABLE, {
    filterByFormula: `{accountId}='${String(accountId).replaceAll("'", "\\'")}'`
  });
  return result.records.map((record) => deserializeCharacter(record.fields));
}

async function saveCharacter(character: CharacterRecord) {
  const shaped = ensureCharacterShape(character) as ExtendedCharacter;
  syncInventoryToCharacter(shaped);
  if (!airtableEnabled()) {
    characters.set(shaped.characterId, shaped);
    return shaped;
  }

  const existing = await airtableFindRecordByField<CharacterFields>(AIRTABLE_CHARACTERS_TABLE, "characterId", shaped.characterId);
  const fields = serializeCharacter(shaped);

  if (existing) {
    await airtableUpdateRecord<CharacterFields>(AIRTABLE_CHARACTERS_TABLE, existing.id, fields);
  } else {
    await airtableCreateRecord<CharacterFields>(AIRTABLE_CHARACTERS_TABLE, fields);
  }

  return shaped;
}

async function requireCharacter(res: any, requestId: string, characterId: string) {
  const character = await loadCharacter(characterId);
  if (!character) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_NOT_FOUND", "Character not found", 404);
    return null;
  }
  return character as ExtendedCharacter;
}

async function consumeForNeed(character: ExtendedCharacter, itemKey: string, need: "food" | "water" | "sleep", amount = 20) {
  const main = inventoryContainer(character, "main");
  if (need !== "sleep") {
    if (Number(main[itemKey] ?? 0) < 1) return false;
    main[itemKey] = Number(main[itemKey] ?? 0) - 1;
    if (!main[itemKey]) delete main[itemKey];
  }
  const patch = need === "food"
    ? { food: Number(character.vitals?.food ?? 100) + amount, stamina: Number(character.vitals?.stamina ?? 100) + 5 }
    : need === "water"
      ? { water: Number(character.vitals?.water ?? 100) + amount, stamina: Number(character.vitals?.stamina ?? 100) + 3 }
      : { sleep: Number(character.vitals?.sleep ?? 100) + amount, stamina: Number(character.vitals?.stamina ?? 100) + 12 };
  applyVitalsPatch(character, patch, `consume:${need}`);
  syncInventoryToCharacter(character);
  return true;
}

app.post("/api/v1/character/create", async (req, res) => {
  const requestId = getRequestId(req);
  if (!req.body?.accountId || !req.body?.name || !req.body?.race) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_CHARACTER_CREATE", "accountId, name, and race are required", 400);
  }

  try {
    const character = createStarterCharacter(req.body);
    ensureInventoryState(character.characterId, (character as ExtendedCharacter).inventory ?? {});
    pushVitalsHistory(character.characterId, "created", (character as ExtendedCharacter).vitals ?? {});
    await saveCharacter(character);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character }, 201);
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_STORE_ERROR", error instanceof Error ? error.message : "Could not create character", 500);
  }
});

app.get("/api/v1/character/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(req.params.characterId);
    if (character) ensureInventoryState(character.characterId, (character as ExtendedCharacter).inventory ?? {});
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_LOAD_ERROR", error instanceof Error ? error.message : "Could not load character", 500);
  }
});

app.post("/api/v1/character/load-by-account", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const found = await loadCharactersByAccount(String(req.body.accountId ?? ""));
    for (const character of found) ensureInventoryState(character.characterId, (character as ExtendedCharacter).inventory ?? {});
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characters: found });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_LIST_ERROR", error instanceof Error ? error.message : "Could not list characters", 500);
  }
});

app.post("/api/v1/character/validate-auth", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { valid: character?.accountId === req.body.accountId });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_AUTH_ERROR", error instanceof Error ? error.message : "Could not validate character owner", 500);
  }
});

app.post("/api/v1/character/apply-xp", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (character) {
      applyXpToCharacter(character, req.body.xp ?? {});
      await saveCharacter(character);
    }
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.body.characterId, updatedSkills: character?.skills ?? [] });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_XP_ERROR", error instanceof Error ? error.message : "Could not apply xp", 500);
  }
});

app.post("/api/v1/character/apply-action-result", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (!character) {
      return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_NOT_FOUND", "Character not found", 404);
    }

    const ext = character as ExtendedCharacter;
    const main = inventoryContainer(ext, "main");
    for (const [itemKey, amountRaw] of Object.entries(req.body.inventoryChanges ?? {})) {
      const amount = Number(amountRaw ?? 0);
      main[itemKey] = Math.max(0, Number(main[itemKey] ?? 0) + amount);
      if (!main[itemKey]) delete main[itemKey];
    }
    syncInventoryToCharacter(ext);

    const vitals = applyVitalsPatch(ext, {
      hp: Number(ext.vitals?.hp ?? 100) + Number(req.body.vitals?.hp ?? 0),
      mp: Number(ext.vitals?.mp ?? 25) + Number(req.body.vitals?.mp ?? 0),
      stamina: Number(ext.vitals?.stamina ?? 100) + Number(req.body.vitals?.stamina ?? 0),
      food: Number(ext.vitals?.food ?? 100) + Number(req.body.vitals?.food ?? 0),
      water: Number(ext.vitals?.water ?? 100) + Number(req.body.vitals?.water ?? 0),
      sleep: Number(ext.vitals?.sleep ?? 100) + Number(req.body.vitals?.sleep ?? 0)
    }, "apply-action-result");

    applyXpToCharacter(ext, req.body.xp ?? {});

    const discoveredSkills = Array.isArray(req.body.discoveredSkills) ? req.body.discoveredSkills : [];
    for (const rawSkill of discoveredSkills) {
      const skillKey = String(rawSkill).toUpperCase();
      if (!ext.skills.some((entry) => entry.skill === skillKey)) {
        ext.skills.push({ skill: skillKey, xp: 0, level: 1 });
      }
    }

    const knowledge = ensureKnowledgeShape(ext.knowledge);
    if (req.body.itemMeta && typeof req.body.itemMeta === "object") {
      knowledge.generatedItemMeta = { ...(knowledge.generatedItemMeta as Record<string, unknown>), ...(req.body.itemMeta as Record<string, unknown>) };
    }
    if (req.body.skillMeta && typeof req.body.skillMeta === "object") {
      knowledge.generatedSkillMeta = { ...(knowledge.generatedSkillMeta as Record<string, unknown>), ...(req.body.skillMeta as Record<string, unknown>) };
    }
    ext.knowledge = knowledge;
    if (Number(vitals.hp ?? 1) <= 0) {
      const deaths = deathHistory.get(ext.characterId) ?? [];
      deaths.push({ at: nowIso(), cause: String(req.body?.cause ?? "action_result") });
      deathHistory.set(ext.characterId, deaths.slice(-50));
    }

    await saveCharacter(ext);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character: ext });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_ACTION_RESULT_ERROR", error instanceof Error ? error.message : "Could not apply action result", 500);
  }
});

app.post("/api/v1/character/apply-reward", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (character && req.body.rewardPackage?.knowledgeUnlocks) {
      const knowledge = ensureKnowledgeShape((character as ExtendedCharacter).knowledge);
      knowledge.unlockedTopics = Array.from(new Set([...(knowledge.unlockedTopics as string[]), ...req.body.rewardPackage.knowledgeUnlocks]));
      (character as ExtendedCharacter).knowledge = knowledge;
      await saveCharacter(character);
    }
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.body.characterId, applied: true });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_REWARD_ERROR", error instanceof Error ? error.message : "Could not apply reward", 500);
  }
});

app.post("/api/v1/character/apply-combat-result", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (character) {
      applyVitalsPatch(character as ExtendedCharacter, { hp: Number((character as ExtendedCharacter).vitals?.hp ?? 100) - 5 }, "combat");
      await saveCharacter(character);
    }
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.body.characterId, applied: true });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_COMBAT_ERROR", error instanceof Error ? error.message : "Could not apply combat result", 500);
  }
});

app.post("/api/v1/character/update-knowledge", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (character) {
      const knowledge = ensureKnowledgeShape((character as ExtendedCharacter).knowledge);
      knowledge.unlockedTopics = Array.from(new Set([...(knowledge.unlockedTopics as string[]), ...(req.body.knowledgeUnlocks ?? [])]));
      knowledge.unlockedRecipes = Array.from(new Set([...(knowledge.unlockedRecipes as string[]), ...(req.body.recipeUnlocks ?? [])]));
      if (Array.isArray(req.body.discoveredWorlds)) {
        knowledge.discoveredWorlds = Array.from(new Set([...(knowledge.discoveredWorlds as string[]), ...req.body.discoveredWorlds]));
      }
      (character as ExtendedCharacter).knowledge = knowledge;
      await saveCharacter(character);
    }
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: Boolean(character) });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_KNOWLEDGE_ERROR", error instanceof Error ? error.message : "Could not update knowledge", 500);
  }
});

app.get("/api/v1/character/:characterId/skills", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(req.params.characterId);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { skills: character?.skills ?? [] });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_SKILLS_ERROR", error instanceof Error ? error.message : "Could not load skills", 500);
  }
});

app.get("/api/v1/character/:characterId/knowledge", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(req.params.characterId);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { knowledge: (character as ExtendedCharacter | null)?.knowledge ?? null });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_KNOWLEDGE_ERROR", error instanceof Error ? error.message : "Could not load knowledge", 500);
  }
});

app.get("/api/v1/character/:characterId/stats", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(req.params.characterId);
    const ext = character as ExtendedCharacter | null;
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      stats: character?.stats ?? null,
      vitals: ext?.vitals ?? null,
      inventory: ext?.inventory ?? {}
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_STATS_ERROR", error instanceof Error ? error.message : "Could not load stats", 500);
  }
});

app.get("/api/v1/character/:characterId/vitals", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { vitals: character.vitals });
});

app.patch("/api/v1/character/:characterId/vitals", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const vitals = applyVitalsPatch(character, req.body ?? {}, "patch-vitals");
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { vitals });
});

app.get("/api/v1/character/:characterId/vitals/history", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { history: vitalsHistory.get(req.params.characterId) ?? [] });
});

app.get("/api/v1/character/:characterId/inventory", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const state = ensureInventoryState(character.characterId, character.inventory ?? {});
  syncInventoryToCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    inventory: character.inventory ?? {},
    containers: state.containers,
    equipment: equipmentState(character.characterId)
  });
});

app.post("/api/v1/character/:characterId/inventory/move", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const from = inventoryContainer(character, String(req.body?.fromContainer ?? "main"));
  const to = inventoryContainer(character, String(req.body?.toContainer ?? "stash"));
  const itemKey = String(req.body?.itemKey ?? "");
  const amount = clamp(Number(req.body?.amount ?? 1), 1, Number(from[itemKey] ?? 0));
  if (!itemKey || amount <= 0) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVENTORY_MOVE_INVALID", "itemKey and a positive amount are required", 400);
  from[itemKey] = Number(from[itemKey] ?? 0) - amount;
  if (!from[itemKey]) delete from[itemKey];
  to[itemKey] = Number(to[itemKey] ?? 0) + amount;
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { moved: true, inventory: character.inventory, containers: ensureInventoryState(character.characterId).containers });
});

app.post("/api/v1/character/:characterId/inventory/split", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const from = inventoryContainer(character, String(req.body?.fromContainer ?? "main"));
  const to = inventoryContainer(character, String(req.body?.toContainer ?? "split"));
  const itemKey = String(req.body?.itemKey ?? "");
  const amount = clamp(Number(req.body?.amount ?? 1), 1, Number(from[itemKey] ?? 0));
  if (!itemKey || amount <= 0) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVENTORY_SPLIT_INVALID", "itemKey and a positive amount are required", 400);
  from[itemKey] = Number(from[itemKey] ?? 0) - amount;
  if (!from[itemKey]) delete from[itemKey];
  to[itemKey] = Number(to[itemKey] ?? 0) + amount;
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { split: true, itemKey, amount, inventory: character.inventory, containers: ensureInventoryState(character.characterId).containers });
});

app.post("/api/v1/character/:characterId/inventory/merge", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const source = inventoryContainer(character, String(req.body?.fromContainer ?? "split"));
  const target = inventoryContainer(character, String(req.body?.toContainer ?? "main"));
  const itemKey = String(req.body?.itemKey ?? "");
  const amount = Number(source[itemKey] ?? 0);
  if (itemKey && amount > 0) {
    target[itemKey] = Number(target[itemKey] ?? 0) + amount;
    delete source[itemKey];
  }
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { merged: true, inventory: character.inventory, containers: ensureInventoryState(character.characterId).containers });
});

app.post("/api/v1/character/:characterId/inventory/drop", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const container = inventoryContainer(character, String(req.body?.fromContainer ?? "main"));
  const itemKey = String(req.body?.itemKey ?? "");
  const amount = clamp(Number(req.body?.amount ?? 1), 1, Number(container[itemKey] ?? 0));
  if (!itemKey || amount <= 0) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVENTORY_DROP_INVALID", "itemKey and a positive amount are required", 400);
  container[itemKey] = Number(container[itemKey] ?? 0) - amount;
  if (!container[itemKey]) delete container[itemKey];
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { dropped: true, itemKey, amount, inventory: character.inventory });
});

app.post("/api/v1/character/:characterId/inventory/pickup", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const container = inventoryContainer(character, String(req.body?.toContainer ?? "main"));
  const itemKey = String(req.body?.itemKey ?? "");
  const amount = Math.max(1, Number(req.body?.amount ?? 1));
  if (!itemKey) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVENTORY_PICKUP_INVALID", "itemKey is required", 400);
  container[itemKey] = Number(container[itemKey] ?? 0) + amount;
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { pickedUp: true, itemKey, amount, inventory: character.inventory });
});

app.post("/api/v1/character/:characterId/equip", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const slot = String(req.body?.slot ?? "main_hand");
  const itemKey = String(req.body?.itemKey ?? "");
  const main = inventoryContainer(character, String(req.body?.fromContainer ?? "main"));
  if (Number(main[itemKey] ?? 0) < 1) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "EQUIP_MISSING_ITEM", "Item is not in inventory", 409);
  const equipment = equipmentState(character.characterId);
  const existing = equipment[slot];
  if (existing?.itemKey) {
    main[String(existing.itemKey)] = Number(main[String(existing.itemKey)] ?? 0) + Number(existing.amount ?? 1);
  }
  main[itemKey] = Number(main[itemKey] ?? 0) - 1;
  if (!main[itemKey]) delete main[itemKey];
  equipment[slot] = { itemKey, amount: 1, equippedAt: nowIso() };
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { equipped: true, slot, equipment, inventory: character.inventory });
});

app.post("/api/v1/character/:characterId/unequip", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const slot = String(req.body?.slot ?? "main_hand");
  const equipment = equipmentState(character.characterId);
  const equipped = equipment[slot];
  if (equipped?.itemKey) {
    const main = inventoryContainer(character, String(req.body?.toContainer ?? "main"));
    main[String(equipped.itemKey)] = Number(main[String(equipped.itemKey)] ?? 0) + Number(equipped.amount ?? 1);
    delete equipment[slot];
  }
  syncInventoryToCharacter(character);
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { unequipped: true, slot, equipment, inventory: character.inventory });
});

app.get("/api/v1/character/:characterId/equipment", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { equipment: equipmentState(req.params.characterId) });
});

app.get("/api/v1/character/:characterId/status-effects", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { statusEffects: statusEffects(req.params.characterId) });
});

app.post("/api/v1/character/:characterId/status-effects/clear", async (req, res) => {
  const requestId = getRequestId(req);
  statusEffectsByCharacter.set(req.params.characterId, []);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { cleared: true, statusEffects: [] });
});

app.get("/api/v1/character/:characterId/encumbrance", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const totalWeight = Object.values(character.inventory ?? {}).reduce((sum, amount) => sum + Number(amount ?? 0), 0);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { totalWeight, capacity: 100, ratio: Number((totalWeight / 100).toFixed(4)) });
});

app.get("/api/v1/character/:characterId/reputation", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { reputation: ensureReputation(req.params.characterId) });
});

app.post("/api/v1/character/:characterId/reputation/update", async (req, res) => {
  const requestId = getRequestId(req);
  const reputation = ensureReputation(req.params.characterId);
  for (const [faction, delta] of Object.entries(req.body?.changes ?? req.body ?? {})) {
    reputation[faction] = Number(reputation[faction] ?? 0) + Number(delta ?? 0);
  }
  reputationByCharacter.set(req.params.characterId, reputation);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { reputation });
});

app.get("/api/v1/character/:characterId/factions", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { factions: ensureFactions(req.params.characterId) });
});

app.post("/api/v1/character/:characterId/rename", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const previous = character.name;
  character.name = String(req.body?.name ?? character.name);
  const history = titleHistory.get(character.characterId) ?? [];
  history.push({ at: nowIso(), kind: "rename", from: previous, to: character.name });
  titleHistory.set(character.characterId, history.slice(-50));
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character });
});

app.patch("/api/v1/character/:characterId/appearance", async (req, res) => {
  const requestId = getRequestId(req);
  const current = appearanceByCharacter.get(req.params.characterId) ?? {};
  const next = { ...current, ...(req.body ?? {}), updatedAt: nowIso() };
  appearanceByCharacter.set(req.params.characterId, next);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { appearance: next });
});

app.post("/api/v1/character/:characterId/set-home", async (req, res) => {
  const requestId = getRequestId(req);
  const home = req.body?.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 };
  homesByCharacter.set(req.params.characterId, home);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { home });
});

app.post("/api/v1/character/:characterId/respawn", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  character.position = { ...(homesByCharacter.get(character.characterId) ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 }) };
  applyVitalsPatch(character, { hp: 100, stamina: 100, food: 80, water: 80, sleep: 80 }, "respawn");
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { respawned: true, position: character.position, vitals: character.vitals });
});

app.get("/api/v1/character/:characterId/death-history", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { history: deathHistory.get(req.params.characterId) ?? [] });
});

app.get("/api/v1/character/:characterId/title-history", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { history: titleHistory.get(req.params.characterId) ?? [] });
});

app.post("/api/v1/character/:characterId/eat", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const itemKey = String(req.body?.itemKey ?? "wild_berry");
  const ok = await consumeForNeed(character, itemKey, "food", 24);
  if (!ok) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "FOOD_ITEM_MISSING", "Food item not present in inventory", 409);
  pushSurvivalHistory(character.characterId, "eat", { itemKey });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ate: true, itemKey, vitals: character.vitals, inventory: character.inventory });
});

app.post("/api/v1/character/:characterId/drink", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  const itemKey = String(req.body?.itemKey ?? "fresh_water");
  const ok = await consumeForNeed(character, itemKey, "water", 28);
  if (!ok) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "WATER_ITEM_MISSING", "Water item not present in inventory", 409);
  pushSurvivalHistory(character.characterId, "drink", { itemKey });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { drank: true, itemKey, vitals: character.vitals, inventory: character.inventory });
});

app.post("/api/v1/character/:characterId/sleep", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  await consumeForNeed(character, "", "sleep", Math.max(20, Number(req.body?.amount ?? 35)));
  pushSurvivalHistory(character.characterId, "sleep", { amount: Number(req.body?.amount ?? 35) });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { slept: true, vitals: character.vitals });
});

app.get("/api/v1/survival/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, req.params.characterId);
  if (!character) return;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { survival: { vitals: character.vitals, buffs: [], thresholds: { hungryBelow: 35, thirstyBelow: 35, tiredBelow: 30 } } });
});

app.post("/api/v1/survival/tick", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  const minutes = Math.max(1, Number(req.body?.minutes ?? 15));
  applyVitalsPatch(character, {
    food: Number(character.vitals?.food ?? 100) - Math.ceil(minutes / 12),
    water: Number(character.vitals?.water ?? 100) - Math.ceil(minutes / 10),
    sleep: Number(character.vitals?.sleep ?? 100) - Math.ceil(minutes / 16),
    stamina: Number(character.vitals?.stamina ?? 100) - Math.ceil(minutes / 18)
  }, "survival-tick");
  pushSurvivalHistory(character.characterId, "tick", { minutes });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { advanced: true, minutes, vitals: character.vitals });
});

app.post("/api/v1/survival/eat", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  const itemKey = String(req.body?.itemKey ?? "wild_berry");
  const ok = await consumeForNeed(character, itemKey, "food", 24);
  if (!ok) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "FOOD_ITEM_MISSING", "Food item not present in inventory", 409);
  pushSurvivalHistory(character.characterId, "eat", { itemKey });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ate: true, itemKey, vitals: character.vitals, inventory: character.inventory });
});

app.post("/api/v1/survival/drink", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  const itemKey = String(req.body?.itemKey ?? "fresh_water");
  const ok = await consumeForNeed(character, itemKey, "water", 28);
  if (!ok) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "WATER_ITEM_MISSING", "Water item not present in inventory", 409);
  pushSurvivalHistory(character.characterId, "drink", { itemKey });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { drank: true, itemKey, vitals: character.vitals, inventory: character.inventory });
});

app.post("/api/v1/survival/sleep", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  await consumeForNeed(character, "", "sleep", Math.max(20, Number(req.body?.amount ?? 35)));
  pushSurvivalHistory(character.characterId, "sleep", { amount: Number(req.body?.amount ?? 35) });
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { slept: true, vitals: character.vitals });
});

app.post("/api/v1/survival/wake", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  applyVitalsPatch(character, { stamina: Number(character.vitals?.stamina ?? 100) + 6 }, "wake");
  pushSurvivalHistory(character.characterId, "wake", {});
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { awake: true, vitals: character.vitals });
});

app.post("/api/v1/survival/recover", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  applyVitalsPatch(character, { hp: 100, stamina: 100 }, "recover");
  pushSurvivalHistory(character.characterId, "recover", {});
  await saveCharacter(character);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recovered: true, vitals: character.vitals });
});

app.post("/api/v1/survival/preview", async (req, res) => {
  const requestId = getRequestId(req);
  const character = await requireCharacter(res, requestId, String(req.body?.characterId ?? ""));
  if (!character) return;
  const minutes = Math.max(1, Number(req.body?.minutes ?? 15));
  const preview = {
    hp: Number(character.vitals?.hp ?? 100),
    mp: Number(character.vitals?.mp ?? 25),
    stamina: clamp(Number(character.vitals?.stamina ?? 100) - Math.ceil(minutes / 18), 0, 100),
    food: clamp(Number(character.vitals?.food ?? 100) - Math.ceil(minutes / 12), 0, 100),
    water: clamp(Number(character.vitals?.water ?? 100) - Math.ceil(minutes / 10), 0, 100),
    sleep: clamp(Number(character.vitals?.sleep ?? 100) - Math.ceil(minutes / 16), 0, 100)
  };
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { preview, minutes });
});

app.get("/api/v1/survival/history/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { history: survivalHistory.get(req.params.characterId) ?? [] });
});

app.get("/api/v1/survival/thresholds", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { thresholds: { hungryBelow: 35, thirstyBelow: 35, tiredBelow: 30, exhaustedBelow: 15 } });
});

app.get("/api/v1/survival/buffs/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  const characterBuffs = [] as Array<Record<string, unknown>>;
  const recentSleep = vitalsHistory.get(req.params.characterId)?.slice(-1)[0] as { vitals?: Record<string, number> } | undefined;
  if (Number(recentSleep?.vitals?.sleep ?? 0) >= 90) characterBuffs.push({ key: "well_rested", bonus: "+10% stamina recovery" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { buffs: characterBuffs });
});


app.post("/api/v1/survival/apply-environment", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const character = requireCharacter(characterId);
  applyVitalsPatch(character, { stamina: -Math.max(1, Number(req.body.staminaDelta ?? 4)) });
  pushSurvivalHistory(characterId, 'apply-environment', { weather: req.body.weather ?? null, terrain: req.body.terrain ?? null });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId, vitals: character.vitals, environmentApplied: true });
});

app.post("/api/v1/survival/apply-disease", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const character = requireCharacter(characterId);
  applyVitalsPatch(character, { hp: -Math.max(1, Number(req.body.hpDelta ?? 3)), stamina: -Math.max(1, Number(req.body.staminaDelta ?? 2)) });
  statusEffects(characterId).push({ key: String(req.body.diseaseKey ?? 'DISEASE'), turnsRemaining: Number(req.body.turnsRemaining ?? 3), magnitude: Number(req.body.magnitude ?? 1) });
  pushSurvivalHistory(characterId, 'apply-disease', { diseaseKey: req.body.diseaseKey ?? 'DISEASE' });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId, vitals: character.vitals, statusEffects: statusEffects(characterId) });
});

app.post("/api/v1/survival/apply-weather", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const character = requireCharacter(characterId);
  applyVitalsPatch(character, { water: -Math.max(1, Number(req.body.waterDelta ?? 2)), sleep: -Math.max(1, Number(req.body.sleepDelta ?? 1)) });
  pushSurvivalHistory(characterId, 'apply-weather', { weather: req.body.weather ?? null });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId, vitals: character.vitals, weatherApplied: true });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
