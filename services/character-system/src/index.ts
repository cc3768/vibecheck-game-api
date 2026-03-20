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

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
  const next = character as CharacterRecord & { inventory?: Record<string, number>; knowledge?: Record<string, unknown> };
  next.position = next.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 };
  next.stats = next.stats ?? { strength: 5, agility: 5, intellect: 5, vitality: 5 };
  next.vitals = next.vitals ?? { hp: 100, mp: 25, stamina: 100 };
  next.inventory = typeof next.inventory === "object" && next.inventory ? next.inventory : {};
  next.skills = Array.isArray(next.skills) ? next.skills : starterKnownSkills();
  next.knowledge = ensureKnowledgeShape(next.knowledge ?? defaultCharacterKnowledge());
  return next as CharacterRecord;
}

function serializeCharacter(character: CharacterRecord): CharacterFields {
  const shaped = ensureCharacterShape(character);
  return {
    characterId: shaped.characterId,
    accountId: shaped.accountId,
    name: shaped.name,
    race: shaped.race,
    positionJson: JSON.stringify(shaped.position),
    statsJson: JSON.stringify(shaped.stats),
    vitalsJson: JSON.stringify(shaped.vitals),
    inventoryJson: JSON.stringify((shaped as CharacterRecord & { inventory?: Record<string, number> }).inventory ?? {}),
    skillsJson: JSON.stringify(shaped.skills),
    knowledgeJson: JSON.stringify({ ...ensureKnowledgeShape((shaped as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge), lastSavedAt: nowIso() }),
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
    position: parseJson(fields.positionJson, { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 }),
    stats: parseJson(fields.statsJson, { strength: 5, agility: 5, intellect: 5, vitality: 5 }),
    vitals: parseJson(fields.vitalsJson, { hp: 100, mp: 25, stamina: 100 }),
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
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 },
    stats: { strength: 5, agility: 5, intellect: 5, vitality: 5 },
    vitals: { hp: 100, mp: 25, stamina: 100 },
    inventory: {},
    skills: starterKnownSkills(),
    knowledge: ensureKnowledgeShape(defaultCharacterKnowledge()),
    createdAt: nowIso()
  } as CharacterRecord);
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
  const shaped = ensureCharacterShape(character);
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

app.post("/api/v1/character/create", async (req, res) => {
  const requestId = getRequestId(req);
  if (!req.body?.accountId || !req.body?.name || !req.body?.race) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_CHARACTER_CREATE", "accountId, name, and race are required", 400);
  }

  try {
    const character = createStarterCharacter(req.body);
    await saveCharacter(character);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character }, 201);
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_STORE_ERROR", error instanceof Error ? error.message : "Could not create character", 500);
  }
});

app.get("/api/v1/character/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character: await loadCharacter(req.params.characterId) });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_LOAD_ERROR", error instanceof Error ? error.message : "Could not load character", 500);
  }
});

app.post("/api/v1/character/load-by-account", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characters: await loadCharactersByAccount(String(req.body.accountId ?? "")) });
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

    const inventory = (character as CharacterRecord & { inventory?: Record<string, number> }).inventory ?? {};
    for (const [itemKey, amountRaw] of Object.entries(req.body.inventoryChanges ?? {})) {
      const amount = Number(amountRaw ?? 0);
      inventory[itemKey] = Math.max(0, Number(inventory[itemKey] ?? 0) + amount);
      if (!inventory[itemKey]) delete inventory[itemKey];
    }
    (character as CharacterRecord & { inventory?: Record<string, number> }).inventory = inventory;

    const vitals = character.vitals ?? { hp: 100, mp: 25, stamina: 100 };
    vitals.hp = Math.max(1, Math.min(100, Number(vitals.hp ?? 100) + Number(req.body.vitals?.hp ?? 0)));
    vitals.mp = Math.max(0, Math.min(100, Number(vitals.mp ?? 25) + Number(req.body.vitals?.mp ?? 0)));
    vitals.stamina = Math.max(0, Math.min(100, Number(vitals.stamina ?? 100) + Number(req.body.vitals?.stamina ?? 0)));
    character.vitals = vitals;

    applyXpToCharacter(character, req.body.xp ?? {});

    const discoveredSkills = Array.isArray(req.body.discoveredSkills) ? req.body.discoveredSkills : [];
    for (const rawSkill of discoveredSkills) {
      const skillKey = String(rawSkill).toUpperCase();
      if (!character.skills.some((entry) => entry.skill === skillKey)) {
        character.skills.push({ skill: skillKey, xp: 0, level: 1 });
      }
    }

    const knowledge = ensureKnowledgeShape((character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge);
    if (req.body.itemMeta && typeof req.body.itemMeta === "object") {
      knowledge.generatedItemMeta = { ...(knowledge.generatedItemMeta as Record<string, unknown>), ...(req.body.itemMeta as Record<string, unknown>) };
    }
    if (req.body.skillMeta && typeof req.body.skillMeta === "object") {
      knowledge.generatedSkillMeta = { ...(knowledge.generatedSkillMeta as Record<string, unknown>), ...(req.body.skillMeta as Record<string, unknown>) };
    }
    (character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge = knowledge;

    await saveCharacter(character);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { character });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_ACTION_RESULT_ERROR", error instanceof Error ? error.message : "Could not apply action result", 500);
  }
});

app.post("/api/v1/character/apply-reward", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(String(req.body.characterId ?? ""));
    if (character && req.body.rewardPackage?.knowledgeUnlocks) {
      const knowledge = ensureKnowledgeShape((character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge);
      knowledge.unlockedTopics = Array.from(new Set([...(knowledge.unlockedTopics as string[]), ...req.body.rewardPackage.knowledgeUnlocks]));
      (character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge = knowledge;
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
      character.vitals.hp = Math.max(1, character.vitals.hp - 5);
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
      const knowledge = ensureKnowledgeShape((character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge);
      knowledge.unlockedTopics = Array.from(new Set([...(knowledge.unlockedTopics as string[]), ...(req.body.knowledgeUnlocks ?? [])]));
      knowledge.unlockedRecipes = Array.from(new Set([...(knowledge.unlockedRecipes as string[]), ...(req.body.recipeUnlocks ?? [])]));
      if (Array.isArray(req.body.discoveredWorlds)) {
        knowledge.discoveredWorlds = Array.from(new Set([...(knowledge.discoveredWorlds as string[]), ...req.body.discoveredWorlds]));
      }
      (character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge = knowledge;
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
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { knowledge: (character as CharacterRecord & { knowledge?: Record<string, unknown> }).knowledge ?? null });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_KNOWLEDGE_ERROR", error instanceof Error ? error.message : "Could not load knowledge", 500);
  }
});

app.get("/api/v1/character/:characterId/stats", async (req, res) => {
  const requestId = getRequestId(req);
  try {
    const character = await loadCharacter(req.params.characterId);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      stats: character?.stats ?? null,
      vitals: character?.vitals ?? null,
      inventory: (character as CharacterRecord & { inventory?: Record<string, number> } | null)?.inventory ?? {}
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CHARACTER_STATS_ERROR", error instanceof Error ? error.message : "Could not load stats", 500);
  }
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
