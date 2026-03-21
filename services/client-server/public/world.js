import {
  $, REGION_META, api, chunkCoords, clamp, contentSourceLabel, discoveredSkillsFromSheet, escapeHtml, hydrateCharacterSheet,
  loadCharacters, loadContentSnapshot, loadProfile, loadSession, loadSettings, normalizeProfile, pushFeed, renderFeed,
  requireSessionOrRedirect, saveProfile, selectedCharacter, titleCase
} from "/shared.js";

const CHUNK_SIZE = 12;
const DETAIL_GRID_SIZE = 12;
const AUTO_ANALYZE_DELAY = 2500;
const profile = normalizeProfile(loadProfile());
const session = loadSession();
const settings = loadSettings();

const DEFAULT_SURVIVAL = { health: 100, water: 100, food: 100, sleep: 100 };
const BUILD_TYPES = [
  { key: "WOOD_WALL", name: "Wood Wall", needs: "2 wood logs" },
  { key: "CAMPFIRE", name: "Campfire", needs: "1 wood log + kindling" },
  { key: "STONE_MARKER", name: "Stone Marker", needs: "2 stone chunks" },
  { key: "WOODEN_FRAME", name: "Wooden Frame", needs: "3 wood logs" }
];

let characters = [];
let hero = null;
let sheet = { character: null, stats: null, vitals: null, inventory: {}, skills: [], knowledge: null, discoveredWorlds: ["world_prime"] };
let contentSnapshot = null;
let autoAnalyzeTimer = null;
let lastPreview = null;
let actionQueue = Array.isArray(profile.actionQueue) ? profile.actionQueue : [];
let itemMeta = loadItemMeta();

let worldState = {
  region: null,
  chunk: null,
  detail: null,
  nearbyNpcs: [],
  presence: [],
  selectedNpcId: profile.selectedNpcId || null,
  activeQuest: null,
  questOffer: null,
  lastDialogue: "No dialogue yet.",
  promptRules: null,
  lastActionResults: []
};

const ITEM_META_KEY = "vibecheck.itemmeta.v1";

function ensureProfileDefaults() {
  profile.mapMode = profile.mapMode === "detail" ? "detail" : "region";
  profile.selectedSubTile = profile.selectedSubTile || { x: 0, y: 0 };
  profile.survival = { ...DEFAULT_SURVIVAL, ...(profile.survival || {}) };
  saveProfile(profile);
}
ensureProfileDefaults();

function loadItemMeta() {
  try {
    const raw = localStorage.getItem(ITEM_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveItemMeta(next) {
  itemMeta = next;
  localStorage.setItem(ITEM_META_KEY, JSON.stringify(next));
}

function mergeItemMeta(update) {
  if (!update || typeof update !== "object") return;
  const next = { ...itemMeta };
  for (const [key, meta] of Object.entries(update)) {
    if (!next[key] && meta && typeof meta === "object") next[key] = meta;
  }
  saveItemMeta(next);
}

function itemLabel(itemKey) {
  return itemMeta?.[itemKey]?.name || titleCase(itemKey);
}

function currentScene() {
  return profile.scene || REGION_META.starter_lowlands.position;
}

function currentChunkMeta() {
  const scene = currentScene();
  return chunkCoords(scene.x, scene.y, CHUNK_SIZE);
}

function selectedTileCoords() {
  return profile.selectedTile || { x: currentScene().x, y: currentScene().y };
}

function selectedSubTile() {
  return profile.selectedSubTile || { x: 0, y: 0 };
}

function tileAt(x, y) {
  return worldState.chunk?.tiles?.find((tile) => tile.x === x && tile.y === y) || null;
}

function selectedTile() {
  const coords = selectedTileCoords();
  return tileAt(coords.x, coords.y);
}

function detailCellAt(x, y) {
  return worldState.detail?.cells?.find((cell) => cell.x === x && cell.y === y) || null;
}

function selectedDetailCell() {
  const cell = selectedSubTile();
  return detailCellAt(cell.x, cell.y);
}

function selectedNpc() {
  return worldState.nearbyNpcs.find((npc) => npc.npcId === worldState.selectedNpcId) || null;
}

function objectsOnTile(x, y) {
  return (worldState.chunk?.objects || []).filter((item) => item.position.x === x && item.position.y === y);
}

function adjacentTiles(x, y) {
  return [
    tileAt(x, y - 1),
    tileAt(x + 1, y),
    tileAt(x, y + 1),
    tileAt(x - 1, y)
  ].filter(Boolean);
}

function setScene(next) {
  profile.scene = {
    worldId: String(next.worldId),
    regionId: String(next.regionId),
    x: Number(next.x),
    y: Number(next.y)
  };
  profile.selectedTile = { x: Number(next.x), y: Number(next.y) };
  saveProfile(profile);
}

function setSelectedTile(x, y) {
  profile.selectedTile = { x: Number(x), y: Number(y) };
  saveProfile(profile);
}

function setSelectedSubTile(x, y) {
  profile.selectedSubTile = { x: Number(x), y: Number(y) };
  saveProfile(profile);
}

function setMapMode(mode) {
  profile.mapMode = mode === "detail" ? "detail" : "region";
  saveProfile(profile);
}

function requireHero() {
  if (!hero?.characterId) throw new Error("No selected character found. Return to the hub.");
}

function regionMeta() {
  return REGION_META[currentScene().regionId] || REGION_META.starter_lowlands;
}

function currentObjectiveText() {
  if (!worldState.activeQuest) return "Explore the world, read the terrain, and test new actions";
  const next = worldState.activeQuest.progress.find((objective) => !objective.completed);
  if (!next) return "Return to Rowan and complete the quest";
  return `${titleCase(next.key)} ${next.currentCount}/${next.targetCount}`;
}

function questReadyToComplete() {
  return Boolean(worldState.activeQuest && worldState.activeQuest.progress.every((item) => item.completed));
}

function isHerbBundleUnpackText(text) {
  const normalized = String(text || "").toUpperCase();
  const mentionsBundle = normalized.includes("HERB_BUNDLE") || (normalized.includes("HERB") && normalized.includes("BUNDLE"));
  const unpackVerb = /(UNPACK|OPEN|BREAK\s*DOWN|BREAK\s*APART|SEPARAT|SORT|UNTIE|UNWRAP|DISMANTLE|TAKE\s*APART)/.test(normalized);
  return mentionsBundle && unpackVerb;
}

function inferIntentFromDraft(draft) {
  const text = `${draft.primarySkill || ""} ${draft.secondarySkill || ""} ${draft.note || ""}`.toUpperCase();
  if (isHerbBundleUnpackText(text)) return "UNPACK_HERB_BUNDLE";
  if (/(\bDROP\b|DISCARD|DUMP|THROW\s*AWAY|TRASH|REMOVE\s*FROM\s*(PACK|BAG|INVENTORY))/.test(text)) return "DROP_ITEM";
  if (/(IDENTIF|APPRAIS|ANALYZ|INSPECT).*HERB|UNIDENTIF/.test(text)) return "IDENTIFY_HERB";
  if (/(SPLIT|CUT|SHAVE).*(WOOD|LOG)|KINDLING/.test(text)) return "SPLIT_ITEM";
  if (/(TEA|BREW|STEEP|INFUSE)/.test(text)) return "BREW_TEA";
  if (/(REST|SIT|CATCH MY BREATH|PAUSE|SETTLE DOWN|SLEEP|NAP)/.test(text)) return "REST";
  if (/(LOOK\s*AROUND|SCOUT|SURVEY|SEARCH\s*(THE\s*)?AREA|OBSERVE\s*(THE\s*)?AREA|CHECK\s*(THE\s*)?AREA)/.test(text)) return "SCOUT";
  if (/(CRAFT|MAKE|ASSEMBLE|SMELT|FORGE|COOK|RECIPE)/.test(text)) return "CRAFT_RECIPE";
  if (/(FILL|DRAW|COLLECT).*(WATER)|FETCH WATER/.test(text)) return "WATER_COLLECT";
  if (/(WASH|RINSE|CLEAN).*(WATER|ITEM)/.test(text)) return "WATER_USE";
  if (/(BUILD|PLACE|WALL|BLOCK|CAMPFIRE|STRUCTURE)/.test(text)) return "BUILD";
  if (/(WOOD|TREE|TIMBER|CHOP|FELL)/.test(text)) return "WOODCUT";
  if (/(MINE|ROCK|ORE|STONE|QUARRY)/.test(text)) return "MINE";
  if (/(FORAGE|HERB|ROOT|BERRY|MUSHROOM)/.test(text)) return "FORAGE";
  if (/(RITUAL|CHANT|ALTAR|SIGIL)/.test(text)) return "RITUAL";
  if (/(MAGIC|SPELL|ARCANE)/.test(text)) return "MAGIC";
  if (/(TALK|GREET|ASK|BARTER|TRADE)/.test(text)) return "SOCIAL";
  return draft.note ? "OBSERVE" : "GENERAL";
}

function actionTypeForDraft(draft) {
  return [inferIntentFromDraft(draft), draft.primarySkill || "GENERAL", draft.secondarySkill || ""].filter(Boolean).join("__");
}

function buildQueuedActionPayload(draft) {
  const tile = selectedTile();
  const scene = currentScene();
  const nearby = adjacentTiles(scene.x, scene.y).map((item) => ({ x: item.x, y: item.y, kind: item.kind }));
  const nearbyObjects = (worldState.chunk?.objects || [])
    .filter((obj) => Math.abs(obj.position.x - scene.x) + Math.abs(obj.position.y - scene.y) <= 1)
    .map((obj) => ({ type: obj.type, x: obj.position.x, y: obj.position.y }));
  return {
    actionType: actionTypeForDraft(draft),
    primarySkill: String(draft.primarySkill || "GENERAL").toUpperCase(),
    secondarySkill: draft.secondarySkill ? String(draft.secondarySkill).toUpperCase() : null,
    note: String(draft.note || "").trim(),
    duration: 12,
    count: 1,
    completion: 1,
    context: {
      worldId: scene.worldId,
      regionId: scene.regionId,
      x: scene.x,
      y: scene.y,
      selectedTile: tile ? { x: tile.x, y: tile.y, kind: tile.kind } : null,
      selectedSubTile: profile.mapMode === "detail" ? selectedSubTile() : null,
      nearbyTiles: nearby,
      nearbyObjects,
      tone: settings.npcTone,
      theme: settings.npcTheme
    },
    tools: [],
    actionIntent: inferIntentFromDraft(draft)
  };
}

function populateBuildTypes() {
  const select = $("build-type-select");
  if (!select) return;
  select.innerHTML = BUILD_TYPES.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.name)}</option>`).join("");
  select.value = profile.selectedBuildType || BUILD_TYPES[0].key;
  renderBuildRequirement();
}

function renderBuildRequirement() {
  const selected = BUILD_TYPES.find((item) => item.key === $("build-type-select")?.value) || BUILD_TYPES[0];
  $("build-requirements-summary").textContent = `${selected.name} requires ${selected.needs}.`;
  profile.selectedBuildType = selected.key;
  saveProfile(profile);
}

function populateSkillSelects() {
  const discovered = discoveredSkillsFromSheet(sheet);
  const options = discovered.map((skill) => `<option value="${escapeHtml(skill)}">${escapeHtml(titleCase(skill))}</option>`).join("");
  const secondaryOptions = ['<option value="">None</option>', ...discovered.map((skill) => `<option value="${escapeHtml(skill)}">${escapeHtml(titleCase(skill))}</option>`)].join("");
  const primarySelect = $("primary-skill-select");
  const secondarySelect = $("secondary-skill-select");
  const currentPrimary = primarySelect.value;
  const currentSecondary = secondarySelect.value;
  primarySelect.innerHTML = options;
  secondarySelect.innerHTML = secondaryOptions;
  primarySelect.value = discovered.includes(currentPrimary) ? currentPrimary : discovered[0] || "GENERAL";
  secondarySelect.value = currentSecondary && discovered.includes(currentSecondary) ? currentSecondary : "";
}

function normalizeVitalNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function effectiveVitals() {
  const server = sheet.vitals || {};
  const survival = { ...DEFAULT_SURVIVAL, ...(profile.survival || {}) };
  const base = {
    health: normalizeVitalNumber(server.health ?? server.hp, survival.health),
    stamina: normalizeVitalNumber(server.stamina ?? server.energy, 100),
    water: normalizeVitalNumber(server.water, survival.water),
    food: normalizeVitalNumber(server.food, survival.food),
    sleep: normalizeVitalNumber(server.sleep, survival.sleep)
  };
  for (const [key, value] of Object.entries(server)) {
    if (!(key in base)) base[key] = normalizeVitalNumber(value, 0);
  }
  return base;
}

function saveSurvival(values) {
  profile.survival = { ...DEFAULT_SURVIVAL, ...(profile.survival || {}), ...values };
  saveProfile(profile);
}

function adjustSurvival(delta = {}, reason = "") {
  const next = { ...DEFAULT_SURVIVAL, ...(profile.survival || {}) };
  for (const key of Object.keys(DEFAULT_SURVIVAL)) {
    next[key] = clamp(normalizeVitalNumber(next[key], DEFAULT_SURVIVAL[key]) + normalizeVitalNumber(delta[key], 0), 0, 100);
  }
  const starvationPenalty = (next.water <= 0 ? 4 : 0) + (next.food <= 0 ? 2 : 0) + (next.sleep <= 0 ? 2 : 0);
  if (starvationPenalty) next.health = clamp(next.health - starvationPenalty, 0, 100);
  saveSurvival(next);
  if (reason) {
    pushFeed(profile, "Survival state", reason, starvationPenalty ? "warn" : "info");
  }
}

function applyActionSurvival(intent) {
  const upper = String(intent || "GENERAL").toUpperCase();
  if (upper === "REST") {
    adjustSurvival({ sleep: 16, water: -1, food: -1, health: 3 }, "A short rest eased strain and restored some sleep.");
    return;
  }
  if (upper === "WATER_COLLECT") {
    adjustSurvival({ water: 10, food: -1, sleep: -1 }, "Collecting water replenished hydration a bit.");
    return;
  }
  if (upper === "BREW_TEA") {
    adjustSurvival({ water: 4, food: -1 }, "A warm drink helped with hydration.");
    return;
  }
  if (["MINE", "WOODCUT", "BUILD", "FORAGE", "CRAFT_RECIPE"].includes(upper)) {
    adjustSurvival({ water: -4, food: -3, sleep: -2 }, `${titleCase(upper)} wore the character down.`);
    return;
  }
  adjustSurvival({ water: -2, food: -1, sleep: -1 });
}

function playersOnTile(tileX, tileY) {
  return (worldState.presence || []).filter((player) => Number(player.x) === Number(tileX) && Number(player.y) === Number(tileY));
}

function normalizePresenceEntry(entry) {
  const position = entry?.position || entry?.scene || {};
  const x = Number(entry?.x ?? position?.x);
  const y = Number(entry?.y ?? position?.y);
  const regionId = String(entry?.regionId ?? position?.regionId ?? currentScene().regionId);
  const worldId = String(entry?.worldId ?? position?.worldId ?? currentScene().worldId);
  return {
    accountId: String(entry?.accountId ?? entry?.userId ?? ""),
    characterId: String(entry?.characterId ?? entry?.id ?? entry?.playerId ?? ""),
    name: String(entry?.name ?? entry?.characterName ?? entry?.username ?? entry?.accountName ?? "Traveler"),
    x: Number.isFinite(x) ? x : currentScene().x,
    y: Number.isFinite(y) ? y : currentScene().y,
    regionId,
    worldId,
    raw: entry
  };
}

function uniquePresence(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const normalized = normalizePresenceEntry(entry);
    const key = normalized.characterId || normalized.accountId || `${normalized.name}:${normalized.x}:${normalized.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.filter((entry) => entry.regionId === currentScene().regionId && entry.worldId === currentScene().worldId && entry.characterId !== hero?.characterId);
}

function pseudo(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function detailKindFor(tile, x, y) {
  const base = String(tile?.kind || "grass");
  const seed = tile.x * 7349 + tile.y * 9151 + x * 131 + y * 197;
  const noise = pseudo(seed);
  if (base === "water") return noise > 0.22 ? "water" : "grass";
  if (base === "forest") return noise > 0.25 ? "forest" : noise > 0.1 ? "grass" : "rock";
  if (base === "rock") return noise > 0.28 ? "rock" : noise > 0.12 ? "grass" : "water";
  return noise > 0.84 ? "water" : noise > 0.68 ? "forest" : noise > 0.15 ? "grass" : "rock";
}

function buildFallbackDetail(tile, size = DETAIL_GRID_SIZE) {
  const cells = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const kind = detailKindFor(tile, x, y);
      cells.push({
        x,
        y,
        kind,
        walkable: kind !== "water" || tile.kind === "water",
        hasObject: pseudo(tile.x * 31 + tile.y * 47 + x * 13 + y * 17) > 0.94
      });
    }
  }
  return {
    tileX: tile.x,
    tileY: tile.y,
    size,
    source: "client-fallback",
    summary: `This tile is expanded locally as a ${titleCase(tile.kind)} patch. The region tile acts like a zoomed-out shell around this denser local ground.`,
    cells
  };
}

function normalizeDetailPayload(tile, payload) {
  const detailPayload = payload?.detail || payload?.tileDetail || payload?.localMap || payload || {};
  const rawCells = Array.isArray(detailPayload?.cells)
    ? detailPayload.cells
    : Array.isArray(detailPayload?.tiles)
      ? detailPayload.tiles
      : Array.isArray(detailPayload?.grid)
        ? detailPayload.grid.flatMap((row, y) => row.map((cell, x) => ({ ...cell, x, y })))
        : [];
  if (!rawCells.length) return buildFallbackDetail(tile);
  const size = Number(detailPayload?.size ?? detailPayload?.width ?? DETAIL_GRID_SIZE) || DETAIL_GRID_SIZE;
  return {
    tileX: tile.x,
    tileY: tile.y,
    size,
    source: "world-system",
    summary: String(detailPayload?.summary || `A closer look inside tile ${tile.x}, ${tile.y}.`),
    cells: rawCells.map((cell) => ({
      x: Number(cell?.x ?? cell?.localX ?? cell?.col ?? 0),
      y: Number(cell?.y ?? cell?.localY ?? cell?.row ?? 0),
      kind: String(cell?.kind ?? tile.kind),
      walkable: cell?.walkable !== false,
      hasObject: Boolean(cell?.hasObject ?? cell?.objectCount ?? cell?.object)
    }))
  };
}

async function loadHero() {
  characters = await loadCharacters(session.accountId);
  hero = selectedCharacter(characters, profile);
  if (!hero) {
    window.location.href = "/lobby.html";
    throw new Error("No selected character found. Return to the hub.");
  }
}

async function syncSheet() {
  sheet = await hydrateCharacterSheet(hero.characterId);
  if (sheet?.knowledge?.generatedItemMeta) mergeItemMeta(sheet.knowledge.generatedItemMeta);
  populateSkillSelects();
}

async function loadQuest() {
  const json = await api(`/api/v1/quest/active/${hero.characterId}`);
  worldState.activeQuest = json?.data?.active?.[0] || null;
}

async function loadPromptRules() {
  const json = await api("/api/v1/ai/prompt-template/npc_dialogue_rules");
  worldState.promptRules = json?.data?.rules || null;
}

async function refreshContentSource(force = false) {
  try {
    contentSnapshot = await loadContentSnapshot(force);
  } catch {
    contentSnapshot = null;
  }
}

async function ensureWorldPosition() {
  if (!profile.scene?.worldId || !profile.scene?.regionId) {
    const json = await api(`/api/v1/world/spawn/${hero.characterId}`);
    setScene(json?.data?.position);
  }
}

async function hydrateWorld() {
  const scene = currentScene();
  const chunk = currentChunkMeta();
  const [regionJson, chunkJson, npcJson] = await Promise.all([
    api(`/api/v1/world/${scene.worldId}/region/${scene.regionId}`),
    api(`/api/v1/world/${scene.worldId}/chunk?regionId=${encodeURIComponent(scene.regionId)}&chunkX=${chunk.chunkX}&chunkY=${chunk.chunkY}&size=${chunk.size}`),
    api(`/api/v1/npc/nearby?regionId=${encodeURIComponent(scene.regionId)}`)
  ]);

  worldState.region = regionJson?.data?.region || null;
  worldState.chunk = chunkJson?.data?.chunk || null;
  worldState.nearbyNpcs = npcJson?.data?.npcs || [];
  if (!worldState.selectedNpcId || !worldState.nearbyNpcs.some((item) => item.npcId === worldState.selectedNpcId)) {
    worldState.selectedNpcId = worldState.nearbyNpcs[0]?.npcId || null;
  }
  if (!selectedTile()) setSelectedTile(scene.x, scene.y);
}

async function updatePresence(status = "active") {
  try {
    const scene = currentScene();
    await api("/api/v1/world/presence/update", {
      method: "POST",
      body: JSON.stringify({
        worldId: scene.worldId,
        regionId: scene.regionId,
        characterId: hero.characterId,
        accountId: session.accountId,
        characterName: hero.name,
        username: session.username,
        position: { worldId: scene.worldId, regionId: scene.regionId, x: scene.x, y: scene.y },
        status,
        mapMode: profile.mapMode,
        seenAt: new Date().toISOString()
      })
    });
  } catch {
    // presence should be best-effort only
  }
}

async function loadPresence() {
  const scene = currentScene();
  let entries = [];
  try {
    const json = await api(`/api/v1/world/presence/region/${scene.regionId}?worldId=${encodeURIComponent(scene.worldId)}`);
    entries = json?.data?.players || json?.data?.presence || json?.data?.entries || [];
  } catch {
    try {
      const json = await api(`/api/v1/session/active-players/${scene.regionId}?worldId=${encodeURIComponent(scene.worldId)}`);
      entries = json?.data?.players || json?.data?.activePlayers || [];
    } catch {
      entries = [];
    }
  }
  worldState.presence = uniquePresence(entries);
}

async function hydrateTileDetail() {
  const tile = selectedTile();
  if (!tile) {
    worldState.detail = null;
    return;
  }
  try {
    const scene = currentScene();
    const json = await api(`/api/v1/world/${scene.worldId}/region/${scene.regionId}/tile/${tile.x}/${tile.y}/detail?size=${DETAIL_GRID_SIZE}&z=0`);
    worldState.detail = normalizeDetailPayload(tile, json?.data);
  } catch {
    worldState.detail = buildFallbackDetail(tile);
  }
  const sub = selectedSubTile();
  setSelectedSubTile(clamp(sub.x, 0, worldState.detail.size - 1), clamp(sub.y, 0, worldState.detail.size - 1));
}

async function refreshWorld({ forceContent = false } = {}) {
  await Promise.all([hydrateWorld(), syncSheet(), loadQuest(), loadPromptRules(), refreshContentSource(forceContent)]);
  await updatePresence();
  await loadPresence();
  if (profile.mapMode === "detail") await hydrateTileDetail();
  renderAll();
}

function autoTravelRegion(x, y) {
  const meta = regionMeta();
  if (x > meta.bounds.maxX && meta.neighbors?.east) return REGION_META[meta.neighbors.east]?.position || null;
  if (x < meta.bounds.minX && meta.neighbors?.west) return REGION_META[meta.neighbors.west]?.position || null;
  return null;
}

async function moveTo(x, y) {
  const regionJump = autoTravelRegion(x, y);
  if (regionJump) {
    setScene(regionJump);
    await refreshWorld();
    pushFeed(profile, "Region travel", `${hero.name} moved into ${REGION_META[regionJump.regionId]?.title || regionJump.regionId}.`, "info");
    renderFeed($("feed"), profile, "Your adventure entries will appear here.");
    return;
  }

  const tile = tileAt(x, y);
  if (!tile) throw new Error("That tile is outside the loaded chunk.");
  if (!tile.walkable) throw new Error("That terrain is blocked.");
  const before = currentChunkMeta();
  setScene({ ...currentScene(), x, y });
  const after = currentChunkMeta();
  adjustSurvival({ water: -1, food: -1, sleep: -0.5 }, `${hero.name} moved across the region map.`);
  if (before.chunkX !== after.chunkX || before.chunkY !== after.chunkY) {
    await refreshWorld();
  } else {
    await updatePresence();
    await loadPresence();
    renderAll();
  }
  pushFeed(profile, "Movement", `${hero.name} moved to ${x}, ${y}.`, "info");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

async function moveWithinDetail(dx, dy) {
  if (!worldState.detail) await hydrateTileDetail();
  const current = selectedSubTile();
  const nextX = clamp(current.x + dx, 0, worldState.detail.size - 1);
  const nextY = clamp(current.y + dy, 0, worldState.detail.size - 1);
  setSelectedSubTile(nextX, nextY);
  renderAll();
}

async function moveBy(dx, dy) {
  if (profile.mapMode === "detail") {
    await moveWithinDetail(dx, dy);
    return;
  }
  const scene = currentScene();
  await moveTo(scene.x + dx, scene.y + dy);
}

async function travelTo(regionId) {
  const target = REGION_META[regionId] || REGION_META.starter_lowlands;
  setScene(target.position);
  setMapMode("region");
  await refreshWorld();
  pushFeed(profile, "Travel", `${hero.name} traveled within World Prime to ${target.title}.`, "info");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

async function handleTileClick(x, y) {
  const scene = currentScene();
  setSelectedTile(x, y);
  if (profile.mapMode === "detail") {
    await hydrateTileDetail();
    renderAll();
    return;
  }
  renderMap();
  renderInspector();
  if (Math.abs(scene.x - x) + Math.abs(scene.y - y) === 1) {
    await moveTo(x, y);
  }
}

async function handleDetailClick(x, y) {
  setSelectedSubTile(x, y);
  renderAll();
}

async function enterTileDetail() {
  if (!selectedTile()) throw new Error("Select a region tile first.");
  setMapMode("detail");
  await hydrateTileDetail();
  renderAll();
}

async function exitTileDetail() {
  setMapMode("region");
  renderAll();
}

async function placeBlock() {
  const tile = selectedTile();
  if (!tile) throw new Error("Select a tile first.");
  await api("/api/v1/world/place-structure", {
    method: "POST",
    body: JSON.stringify({
      worldId: currentScene().worldId,
      regionId: currentScene().regionId,
      characterId: hero.characterId,
      structureType: $("build-type-select").value,
      note: $("action-note").value.trim(),
      position: { worldId: currentScene().worldId, regionId: currentScene().regionId, x: tile.x, y: tile.y }
    })
  });
  applyActionSurvival("BUILD");
  pushFeed(profile, "Build placed", `A new structure was placed at ${tile.x}, ${tile.y}.`, "success");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
  await refreshWorld();
}

async function removeBlock() {
  const tile = selectedTile();
  if (!tile) throw new Error("Select a tile first.");
  await api("/api/v1/world/remove-structure", {
    method: "POST",
    body: JSON.stringify({ position: { worldId: currentScene().worldId, regionId: currentScene().regionId, x: tile.x, y: tile.y } })
  });
  pushFeed(profile, "Build removed", `A placed object was removed from ${tile.x}, ${tile.y}.`, "warn");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
  await refreshWorld();
}

async function analyzeAction() {
  requireHero();
  const draft = {
    primarySkill: $("primary-skill-select").value || "GENERAL",
    secondarySkill: $("secondary-skill-select").value || "",
    note: $("action-note").value.trim()
  };
  const payload = buildQueuedActionPayload(draft);
  const [checkJson, aiJson] = await Promise.all([
    api("/api/v1/actions/check", {
      method: "POST",
      body: JSON.stringify({ characterId: hero.characterId, action: payload })
    }),
    api("/api/v1/ai/suggest-skill", {
      method: "POST",
      body: JSON.stringify({ text: `${draft.primarySkill} ${draft.secondarySkill} ${draft.note}` })
    })
  ]);

  const check = checkJson?.data?.check;
  const suggestions = aiJson?.data?.result?.content || [];
  const discovery = check?.discovery;
  if (discovery?.item) {
    mergeItemMeta({ [discovery.item.itemKey]: { name: discovery.item.name, description: discovery.item.description } });
  }
  $("action-analysis-box").innerHTML = `
    <strong>${escapeHtml(titleCase(draft.primarySkill))}${draft.secondarySkill ? ` + ${escapeHtml(titleCase(draft.secondarySkill))}` : ""}</strong>
    <div class="muted">Intent: ${escapeHtml(titleCase(check?.intent || inferIntentFromDraft(draft)))}</div>
    <div class="muted">Category: ${escapeHtml(titleCase(check?.category || "UTILITY"))}</div>
    <div class="muted">Allowed: ${check?.allowed ? "Yes" : "No"}</div>
    <div>Nearby terrain: ${escapeHtml((check?.nearbyTerrain || []).join(", ") || "none")}</div>
    <div>Nearby objects: ${escapeHtml((check?.nearbyObjects || []).join(", ") || "none")}</div>
    <div>Suggested skills from note: ${escapeHtml(suggestions.join(", ") || "GENERAL")}</div>
    ${check?.recipe?.name ? `<div>Recipe: ${escapeHtml(check.recipe.name)}</div>` : ""}
    ${discovery?.item ? `<div>Possible discovery: ${escapeHtml(discovery.item.name)}${discovery.item.requiredTerrain?.length ? ` • ${escapeHtml(discovery.item.requiredTerrain.join(", "))}` : ""}</div>` : ""}
    ${discovery?.skill ? `<div>Possible new skill: ${escapeHtml(discovery.skill.name)} — ${escapeHtml(discovery.skill.unlockHint || discovery.skill.description || "")}</div>` : ""}
    ${check?.dropTarget ? `<div>Drop target: ${escapeHtml(check.dropTarget.itemKey)} x${escapeHtml(String(check.dropTarget.amount))}</div>` : ""}
    ${check?.reasons?.length ? `<div class="danger-text">${escapeHtml(check.reasons.join(" "))}</div>` : `<div class="success-text">This action can be attempted with your current skills and surroundings.</div>`}
  `;
}

function queueSummary(item) {
  return `${titleCase(item.primarySkill)}${item.secondarySkill ? ` + ${titleCase(item.secondarySkill)}` : ""}`;
}

function renderQueue() {
  const target = $("action-queue-box");
  $("action-mode-pill").textContent = actionQueue.length ? `${actionQueue.length} queued` : "Queue ready";
  if (!actionQueue.length) {
    target.className = "stack-list compact empty-state";
    target.textContent = "No queued actions.";
    return;
  }
  target.className = "stack-list compact";
  target.innerHTML = actionQueue
    .map((item, index) => `
      <article class="stack-item">
        <div class="inline-between">
          <strong>${escapeHtml(queueSummary(item))}</strong>
          <button data-remove-queue="${index}" class="ghost">Remove</button>
        </div>
        <span>${escapeHtml(item.note || "No note")}</span>
      </article>
    `)
    .join("");

  target.querySelectorAll("[data-remove-queue]").forEach((button) => {
    button.addEventListener("click", () => {
      actionQueue.splice(Number(button.dataset.removeQueue), 1);
      profile.actionQueue = actionQueue;
      saveProfile(profile);
      renderQueue();
    });
  });
}

function renderActionResults() {
  const target = $("action-results-box");
  const results = worldState.lastActionResults || [];
  if (!results.length) {
    target.className = "stack-list compact empty-state";
    target.textContent = "Run the queue to see outcomes, rewards, failures, and inventory changes.";
    return;
  }
  target.className = "stack-list compact";
  target.innerHTML = results
    .map((result) => {
      const items = result.rewards?.items?.length
        ? result.rewards.items.map((item) => `${itemLabel(item.itemKey)} x${item.amount}`).join(", ")
        : "No items";
      const consumed = Array.isArray(result.consumed) && result.consumed.length
        ? result.consumed.map((item) => `${itemLabel(item.itemKey)} x${item.amount}`).join(", ")
        : "Nothing consumed";
      const xp = result.xp && Object.keys(result.xp).length
        ? Object.entries(result.xp).map(([skill, amount]) => `${skill} +${amount}`).join(", ")
        : "No XP";
      const discoveredSkills = Array.isArray(result.discoveredSkills) && result.discoveredSkills.length
        ? result.discoveredSkills.map((skill) => titleCase(skill)).join(", ")
        : "";
      return `
        <article class="stack-item ${result.success ? "success-outline" : result.allowed === false ? "danger-outline" : "warn-outline"}">
          <strong>${escapeHtml(titleCase(result.intent || result.actionType || "Action"))}</strong>
          <div class="muted">${escapeHtml(titleCase(result.category || "utility"))}</div>
          <div>${escapeHtml(result.message || "No outcome message")}</div>
          <div class="muted">Consumed: ${escapeHtml(consumed)}</div>
          <div class="muted">Items: ${escapeHtml(items)}</div>
          <div class="muted">XP: ${escapeHtml(xp)}</div>
          ${discoveredSkills ? `<div class="success-text">New skill discovered: ${escapeHtml(discoveredSkills)}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

async function queueAction() {
  const draft = {
    primarySkill: $("primary-skill-select").value || "GENERAL",
    secondarySkill: $("secondary-skill-select").value || "",
    note: $("action-note").value.trim()
  };
  if (!draft.note) throw new Error("Write a note so the action has real intent.");
  const payload = buildQueuedActionPayload(draft);
  actionQueue.push(payload);
  profile.actionQueue = actionQueue;
  saveProfile(profile);
  renderQueue();
  pushFeed(profile, "Action queued", `${titleCase(draft.primarySkill)} action added to the queue.`, "info");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

async function runQueue() {
  requireHero();
  if (!actionQueue.length) throw new Error("Queue at least one action first.");
  const json = await api("/api/v1/actions/resolve-queue", {
    method: "POST",
    body: JSON.stringify({ characterId: hero.characterId, actions: actionQueue })
  });
  mergeItemMeta(json?.data?.itemMeta);
  worldState.lastActionResults = json?.data?.results || [];
  for (const result of worldState.lastActionResults) {
    mergeItemMeta(result.itemMeta);
    applyActionSurvival(result.intent || result.actionIntent || result.actionType);
  }
  actionQueue = [];
  profile.actionQueue = [];
  saveProfile(profile);
  await syncSheet();
  renderAll();

  for (const result of worldState.lastActionResults) {
    if (Array.isArray(result.discoveredSkills) && result.discoveredSkills.length) {
      pushFeed(profile, "Skill discovered", `New skill unlocked: ${result.discoveredSkills.map((skill) => titleCase(skill)).join(", ")}.`, "success");
    }
    pushFeed(profile, result.success ? "Action success" : result.allowed === false ? "Action blocked" : "Action failed", result.message || "Action resolved.", result.success ? "success" : result.allowed === false ? "danger" : "warn");
  }
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

function previewPayloads() {
  return actionQueue.map((item) => ({
    actionType: item.actionType,
    duration: 12,
    count: 1,
    completion: 1,
    context: { note: item.note },
    tools: [],
    primarySkill: item.primarySkill,
    secondarySkill: item.secondarySkill
  }));
}

async function previewXp() {
  if (!actionQueue.length) throw new Error("Queue an action first.");
  const json = await api("/api/v1/xp/preview", {
    method: "POST",
    body: JSON.stringify({ actions: previewPayloads() })
  });
  lastPreview = json?.data || null;
  $("action-analysis-box").innerHTML = `
    <strong>XP Preview</strong>
    <div>Total XP: ${escapeHtml(String(lastPreview?.totalXp || 0))}</div>
    <div>${escapeHtml((lastPreview?.distribution || []).map((entry) => `${entry.skill} +${entry.amount}`).join(", ") || "No XP")}</div>
  `;
}

async function applyPreviewXp() {
  if (!lastPreview?.distribution?.length) throw new Error("Preview XP first.");
  const xp = Object.fromEntries(lastPreview.distribution.map((entry) => [entry.skill, entry.amount]));
  await api("/api/v1/character/apply-xp", {
    method: "POST",
    body: JSON.stringify({ characterId: hero.characterId, xp })
  });
  await syncSheet();
  renderAll();
  pushFeed(profile, "Preview XP applied", "The current XP preview was applied directly to your character sheet.", "success");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

async function talkToNpc() {
  const npc = selectedNpc();
  if (!npc) throw new Error("Select an NPC first.");
  const json = await api("/api/v1/router/dialogue", {
    method: "POST",
    body: JSON.stringify({ npcId: npc.npcId, characterId: hero.characterId, prompt: "Hello." })
  });
  worldState.lastDialogue = json?.data?.reply || "The NPC stays quiet.";
  renderDialogue();
}

async function aiDialogue() {
  const npc = selectedNpc();
  if (!npc) throw new Error("Select an NPC first.");
  const json = await api("/api/v1/ai/generate-dialogue", {
    method: "POST",
    body: JSON.stringify({
      npcId: npc.npcId,
      prompt: $("ai-prompt").value.trim() || "What should I do next?",
      tone: $("npc-tone-select").value,
      theme: $("npc-theme-select").value
    })
  });
  worldState.lastDialogue = json?.data?.result?.content?.reply || "The air stays silent.";
  renderDialogue();
}

async function offerQuest() {
  const npc = selectedNpc();
  if (!npc) throw new Error("Select an NPC first.");
  const json = await api("/api/v1/quest/offer-from-npc", {
    method: "POST",
    body: JSON.stringify({ npcId: npc.npcId, characterId: hero.characterId })
  });
  worldState.questOffer = json?.data?.offered || null;
  renderQuest();
}

async function acceptQuest() {
  const questId = worldState.questOffer?.questId || "quest_first_steps";
  const json = await api("/api/v1/router/quest", {
    method: "POST",
    body: JSON.stringify({ event: "ACCEPT", characterId: hero.characterId, questId })
  });
  worldState.activeQuest = json?.data?.quest || null;
  renderQuest();
}

async function completeQuest() {
  if (!questReadyToComplete()) throw new Error("The current quest is not ready to complete.");
  const json = await api("/api/v1/router/quest", {
    method: "POST",
    body: JSON.stringify({ event: "COMPLETE", characterId: hero.characterId, questId: worldState.activeQuest.questId })
  });
  worldState.activeQuest = json?.data?.quest || null;
  renderQuest();
}

function renderRegionMap(target) {
  const scene = currentScene();
  const selected = selectedTileCoords();
  if (!worldState.chunk?.tiles?.length) {
    target.innerHTML = "";
    return;
  }

  target.className = "chunk-grid large-chunk-grid";
  target.innerHTML = worldState.chunk.tiles
    .map((tile) => {
      const classes = ["chunk-tile", `terrain-${tile.kind}`];
      const tilePlayers = playersOnTile(tile.x, tile.y);
      if (scene.x === tile.x && scene.y === tile.y) classes.push("active");
      if (selected.x === tile.x && selected.y === tile.y) classes.push("selected");
      if (!tile.walkable) classes.push("blocked");
      if (tilePlayers.length) classes.push("has-player-presence");
      const title = `${titleCase(tile.kind)} (${tile.x}, ${tile.y})${tilePlayers.length ? ` • Players: ${tilePlayers.map((player) => player.name).join(", ")}` : ""}`;
      return `
        <button class="${classes.join(" ")}" data-tile-x="${tile.x}" data-tile-y="${tile.y}" title="${escapeHtml(title)}">
          ${tilePlayers.length ? `<span class="presence-badge">${tilePlayers.length}</span>` : ""}
        </button>
      `;
    })
    .join("");

  target.querySelectorAll("[data-tile-x]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleTileClick(Number(button.dataset.tileX), Number(button.dataset.tileY));
    });
  });
}

function renderDetailMap(target) {
  if (!worldState.detail?.cells?.length) {
    target.innerHTML = "";
    return;
  }
  const selected = selectedSubTile();
  const focusPlayers = playersOnTile(selectedTileCoords().x, selectedTileCoords().y);
  target.className = "chunk-grid detail-grid";
  target.innerHTML = worldState.detail.cells
    .map((cell) => {
      const classes = ["chunk-tile", `terrain-${cell.kind}`];
      if (selected.x === cell.x && selected.y === cell.y) classes.push("selected", "detail-focus");
      if (!cell.walkable) classes.push("blocked");
      if (cell.hasObject) classes.push("has-object");
      const showPlayer = focusPlayers.length && selected.x === cell.x && selected.y === cell.y;
      return `
        <button class="${classes.join(" ")}" data-sub-x="${cell.x}" data-sub-y="${cell.y}" title="${escapeHtml(`${titleCase(cell.kind)} (${cell.x}, ${cell.y})`)}">
          ${showPlayer ? `<span class="presence-badge detail-presence">${focusPlayers.length}</span>` : ""}
        </button>
      `;
    })
    .join("");
  target.querySelectorAll("[data-sub-x]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleDetailClick(Number(button.dataset.subX), Number(button.dataset.subY));
    });
  });
}

function renderMap() {
  const target = $("chunk-grid");
  const scene = currentScene();
  const selected = selectedTileCoords();
  $("chunk-chip").textContent = `${currentChunkMeta().chunkX},${currentChunkMeta().chunkY}`;
  $("coord-chip").textContent = profile.mapMode === "detail"
    ? `${selected.x},${selected.y} • ${selectedSubTile().x},${selectedSubTile().y}`
    : `${selected.x},${selected.y}`;
  $("map-level-pill").textContent = profile.mapMode === "detail" ? "Tile detail" : "Region map";
  $("enter-tile-btn").disabled = profile.mapMode === "detail";
  $("exit-tile-btn").disabled = profile.mapMode !== "detail";
  if (profile.mapMode === "detail") {
    renderDetailMap(target);
  } else {
    renderRegionMap(target);
  }
}

function renderInspector() {
  const tile = selectedTile();
  const scene = currentScene();
  const terrain = [tile, ...adjacentTiles(scene.x, scene.y)].filter(Boolean);
  const tilePlayers = tile ? playersOnTile(tile.x, tile.y) : [];
  $("hero-name").textContent = hero?.name || "—";
  $("region-chip").textContent = worldState.region?.name || regionMeta().title;
  $("objective-chip").textContent = currentObjectiveText();
  $("world-status-pill").textContent = worldState.region ? `World Prime • danger ${worldState.region.dangerLevel}` : "Loading";
  $("data-source-chip").textContent = contentSourceLabel(contentSnapshot);
  $("player-presence-pill").textContent = `${worldState.presence.length} nearby`;
  $("scene-title").textContent = worldState.region?.name || regionMeta().title;
  $("scene-text").textContent = regionMeta().flavor;
  $("region-summary").textContent = `${worldState.region?.name || regionMeta().title} • ${titleCase(worldState.region?.biome || "plains")} • Content source: ${contentSourceLabel(contentSnapshot)}`;
  $("tile-summary").textContent = tile
    ? `Tile ${tile.x}, ${tile.y} is ${titleCase(tile.kind)}.${tile.walkable ? " It can be walked across." : " It blocks movement."}`
    : "Select a tile.";
  $("resource-summary").innerHTML = terrain.length
    ? terrain.map((item) => `<span class="mini-chip">${escapeHtml(titleCase(item.kind))}</span>`).join("")
    : '<span class="mini-chip muted-chip">No terrain data</span>';

  const objects = tile ? objectsOnTile(tile.x, tile.y) : [];
  $("placed-objects-summary").innerHTML = objects.length
    ? objects.map((item) => `<span class="mini-chip">${escapeHtml(titleCase(item.type))}</span>`).join("")
    : '<span class="mini-chip muted-chip">No placed objects</span>';

  if (profile.mapMode === "detail" && worldState.detail) {
    const cell = selectedDetailCell();
    $("detail-summary").textContent = worldState.detail.summary || "Tile detail loaded.";
    if (cell) {
      $("detail-summary").textContent = `${worldState.detail.summary} Selected local cell ${cell.x}, ${cell.y} is ${titleCase(cell.kind)}${cell.walkable ? " and passable." : " and blocked."}`;
    }
  } else {
    $("detail-summary").textContent = tile
      ? `Enter tile ${tile.x}, ${tile.y} to view the zoomed-in local map inside this region tile.`
      : "Enter a tile to inspect the local ground inside that region tile.";
  }

  $("selected-tile-players").textContent = tilePlayers.length
    ? `Players on this tile: ${tilePlayers.map((player) => player.name).join(", ")}.`
    : "No other players on this tile.";

  $("edge-travel-summary").textContent = profile.mapMode === "detail"
    ? "You are viewing the inner tile map. Arrow buttons now move inside the local tile until you return to the region map."
    : "Move toward a region edge and the neighboring region takes over automatically when a linked border exists.";
}

function renderNpcList() {
  $("npc-count-pill").textContent = `${worldState.nearbyNpcs.length} NPC${worldState.nearbyNpcs.length === 1 ? "" : "s"}`;
  const target = $("npc-list");
  if (!worldState.nearbyNpcs.length) {
    target.className = "npc-list empty-state";
    target.textContent = "No one is nearby.";
    return;
  }
  target.className = "npc-list";
  target.innerHTML = worldState.nearbyNpcs
    .map((npc) => `
      <article class="npc-card ${worldState.selectedNpcId === npc.npcId ? "selected" : ""}">
        <div>
          <strong>${escapeHtml(npc.name)}</strong>
          <div class="muted">${escapeHtml(titleCase(npc.role.roleType))} • ${escapeHtml(titleCase(npc.regionId))}</div>
        </div>
        <button data-npc-id="${escapeHtml(npc.npcId)}" class="secondary">Select</button>
      </article>
    `)
    .join("");
  target.querySelectorAll("[data-npc-id]").forEach((button) => {
    button.addEventListener("click", () => {
      worldState.selectedNpcId = button.dataset.npcId;
      profile.selectedNpcId = worldState.selectedNpcId;
      saveProfile(profile);
      renderNpcList();
      renderDialogue();
    });
  });
}

function renderDialogue() {
  const npc = selectedNpc();
  $("dialogue-box").textContent = npc ? `${npc.name}: ${worldState.lastDialogue}` : worldState.lastDialogue;
  const rules = worldState.promptRules;
  $("npc-rules-box").innerHTML = rules?.toneRules?.length
    ? [...rules.toneRules.slice(0, 3), ...rules.themeRules.slice(0, 2)].map((line) => `<div>• ${escapeHtml(line)}</div>`).join("")
    : "Communication rules unavailable.";
}

function renderQuest() {
  if (!worldState.activeQuest) {
    if (worldState.questOffer) {
      $("quest-box").innerHTML = `
        <div class="stack-item">
          <strong>${escapeHtml(worldState.questOffer.title)}</strong>
          <span>${escapeHtml(worldState.questOffer.summary)}</span>
        </div>
      `;
    } else {
      $("quest-box").textContent = "No active quest.";
    }
    return;
  }

  $("quest-box").innerHTML = `
    <div><strong>${escapeHtml(worldState.activeQuest.questId)}</strong></div>
    ${worldState.activeQuest.progress.map((item) => `
      <div class="quest-objective">
        <span>${escapeHtml(titleCase(item.key))}</span>
        <strong class="${item.completed ? "objective-done" : "objective-open"}">${item.currentCount}/${item.targetCount}</strong>
      </div>
    `).join("")}
  `;
}

function renderVitals() {
  const target = $("vitals-box");
  const vitals = effectiveVitals();
  if (!Object.keys(vitals).length) {
    target.innerHTML = '<div class="empty-state">No vitals loaded.</div>';
    return;
  }
  target.innerHTML = Object.entries(vitals)
    .map(([key, value]) => `
      <div class="meter">
        <div class="meter-row"><span>${escapeHtml(titleCase(key))}</span><strong>${Math.round(Number(value))}</strong></div>
        <div class="meter-fill"><span style="width:${clamp(Number(value), 0, 100)}%"></span></div>
      </div>
    `)
    .join("");
}

function renderSkills() {
  const target = $("skills-box");
  if (!sheet.skills.length) {
    target.innerHTML = '<div class="empty-state">No skills loaded.</div>';
    return;
  }
  target.innerHTML = sheet.skills
    .slice()
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .map((skill) => `<div class="stack-item inline-between"><span>${escapeHtml(titleCase(skill.skill))}</span><strong>Lv ${skill.level}</strong></div>`)
    .join("");
}

function renderInventory() {
  const target = $("inventory-box");
  const entries = Object.entries(sheet.inventory || {}).filter(([, amount]) => Number(amount) > 0);
  if (!entries.length) {
    target.innerHTML = '<div class="empty-state">Inventory is empty.</div>';
    return;
  }
  target.innerHTML = entries
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([item, amount]) => `<div class="stack-item inline-between"><span>${escapeHtml(itemLabel(item))}</span><strong>${amount}</strong></div>`)
    .join("");
}

function renderAll() {
  renderMap();
  renderInspector();
  renderNpcList();
  renderDialogue();
  renderQuest();
  renderVitals();
  renderSkills();
  renderInventory();
  renderQueue();
  renderActionResults();
  renderBuildRequirement();
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
  $("combat-state-pill").textContent = "No encounter";
}

async function boot() {
  await requireSessionOrRedirect();
  await loadHero();
  populateBuildTypes();
  await ensureWorldPosition();
  await refreshWorld();
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
}

function attach(id, handler) {
  const element = $(id);
  if (!element) return;
  element.addEventListener("click", async () => {
    try {
      await handler();
      renderAll();
    } catch (error) {
      pushFeed(profile, "Action failed", error instanceof Error ? error.message : String(error), "danger");
      renderFeed($("feed"), profile, "Your adventure entries will appear here.");
    }
  });
}

function scheduleAnalyze() {
  if (autoAnalyzeTimer) window.clearTimeout(autoAnalyzeTimer);
  autoAnalyzeTimer = window.setTimeout(async () => {
    try {
      if (!$("action-note").value.trim()) return;
      await analyzeAction();
    } catch {
      // ignore auto check failures while typing
    }
  }, AUTO_ANALYZE_DELAY);
}

function setNpcModalOpen(open) {
  const modal = $("npc-modal");
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
  modal.setAttribute("aria-hidden", String(!open));
}

attach("back-to-hub-btn", async () => { window.location.href = "/lobby.html"; });
attach("refresh-world-btn", async () => refreshWorld({ forceContent: true }));
attach("open-npc-btn", async () => setNpcModalOpen(true));
attach("close-npc-btn", async () => setNpcModalOpen(false));
attach("enter-tile-btn", enterTileDetail);
attach("exit-tile-btn", exitTileDetail);

const backdrop = document.getElementById("npc-modal-backdrop");
if (backdrop) backdrop.addEventListener("click", () => setNpcModalOpen(false));
attach("travel-starter-btn", async () => travelTo("starter_lowlands"));
attach("travel-woods-btn", async () => travelTo("whisper_woods"));
attach("move-north-btn", async () => moveBy(0, -1));
attach("move-west-btn", async () => moveBy(-1, 0));
attach("move-south-btn", async () => moveBy(0, 1));
attach("move-east-btn", async () => moveBy(1, 0));
attach("place-block-btn", placeBlock);
attach("remove-block-btn", removeBlock);
attach("analyze-action-btn", analyzeAction);
attach("queue-action-btn", queueAction);
attach("run-action-btn", runQueue);
attach("clear-action-queue-btn", async () => {
  actionQueue = [];
  profile.actionQueue = [];
  saveProfile(profile);
  worldState.lastActionResults = [];
});
attach("preview-xp-btn", previewXp);
attach("submit-xp-btn", applyPreviewXp);
attach("talk-btn", talkToNpc);
attach("ai-dialogue-btn", aiDialogue);
attach("offer-quest-btn", offerQuest);
attach("accept-quest-btn", acceptQuest);
attach("complete-quest-btn", completeQuest);

$("build-type-select")?.addEventListener("change", renderBuildRequirement);
$("action-note")?.addEventListener("input", scheduleAnalyze);
$("primary-skill-select")?.addEventListener("change", scheduleAnalyze);
$("secondary-skill-select")?.addEventListener("change", scheduleAnalyze);

document.querySelectorAll(".guide-question-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    $("action-note").value = button.dataset.guideQuestion || "";
    await analyzeAction();
  });
});

window.setInterval(async () => {
  if (!hero?.characterId) return;
  try {
    await updatePresence();
    await loadPresence();
    renderInspector();
    renderMap();
  } catch {
    // ignore background presence errors
  }
}, 10000);

boot().catch((error) => {
  pushFeed(profile, "Boot failed", error instanceof Error ? error.message : String(error), "danger");
  renderFeed($("feed"), profile, "Your adventure entries will appear here.");
});
