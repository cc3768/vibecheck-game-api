const STORAGE_KEY = "vibecheck-play-client-v2";

const REGION_META = {
  starter_lowlands: {
    title: "Starter Lowlands",
    summary: "A calm village edge with a notice board, Elder Rowan's fire, and Lyra's training ground.",
    flavor: "Warm wind rolls over the grass. Smoke rises from a small camp while villagers watch the road for new arrivals.",
    danger: 1,
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 }
  },
  whisper_woods: {
    title: "Whisper Woods",
    summary: "Tall trees, drifting mist, and the sound of branches rubbing together in the distance.",
    flavor: "The woods dim the light. Every snapped twig sounds louder here, but the trees are full of useful lumber.",
    danger: 3,
    position: { worldId: "world_prime", regionId: "whisper_woods", x: 10, y: 4 }
  }
};

const state = {
  session: null,
  characters: [],
  character: null,
  worldEntered: false,
  scene: { ...REGION_META.starter_lowlands.position },
  region: null,
  worldContext: null,
  resources: [],
  nearbyNpcs: [],
  selectedNpcId: null,
  activeQuest: null,
  questOffer: null,
  encounter: null,
  stats: null,
  vitals: null,
  skills: [],
  knowledge: null,
  recordedActions: [],
  localInventory: { wood_log: 0, iron_ore: 0, bread: 0, stone_chunk: 0 },
  earnedXp: {},
  lastDialogue: "No dialogue yet.",
  serviceSummary: null,
  journal: []
};

const $ = (id) => document.getElementById(id);
const els = {
  gatewayStatus: $("gateway-status"),
  serviceStatus: $("service-status"),
  regionChip: $("region-chip"),
  dangerChip: $("danger-chip"),
  accountId: $("account-id"),
  tokenPreview: $("token-preview"),
  selectedCharacterPill: $("selected-character-pill"),
  worldStatusPill: $("world-status-pill"),
  objectiveChip: $("objective-chip"),
  npcCountPill: $("npc-count-pill"),
  questStatusPill: $("quest-status-pill"),
  combatStatePill: $("combat-state-pill"),
  sceneTitle: $("scene-title"),
  sceneText: $("scene-text"),
  regionSummary: $("region-summary"),
  resourceSummary: $("resource-summary"),
  characterList: $("character-list"),
  npcList: $("npc-list"),
  dialogueBox: $("dialogue-box"),
  vitalsBox: $("vitals-box"),
  statsBox: $("stats-box"),
  skillsBox: $("skills-box"),
  questBox: $("quest-box"),
  inventoryBox: $("inventory-box"),
  xpBox: $("xp-box"),
  combatBox: $("combat-box"),
  journal: $("journal")
};

function saveState() {
  const snapshot = {
    session: state.session,
    character: state.character,
    scene: state.scene,
    worldEntered: state.worldEntered,
    selectedNpcId: state.selectedNpcId,
    localInventory: state.localInventory,
    earnedXp: state.earnedXp,
    journal: state.journal.slice(0, 30)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    if (saved.session) state.session = saved.session;
    if (saved.character) state.character = saved.character;
    if (saved.scene) state.scene = saved.scene;
    if (typeof saved.worldEntered === "boolean") state.worldEntered = saved.worldEntered;
    if (saved.selectedNpcId) state.selectedNpcId = saved.selectedNpcId;
    if (saved.localInventory) state.localInventory = { ...state.localInventory, ...saved.localInventory };
    if (saved.earnedXp) state.earnedXp = { ...saved.earnedXp };
    if (Array.isArray(saved.journal)) state.journal = saved.journal;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function clearProgress() {
  state.session = null;
  state.characters = [];
  state.character = null;
  state.worldEntered = false;
  state.scene = { ...REGION_META.starter_lowlands.position };
  state.region = null;
  state.worldContext = null;
  state.resources = [];
  state.nearbyNpcs = [];
  state.selectedNpcId = null;
  state.activeQuest = null;
  state.questOffer = null;
  state.encounter = null;
  state.stats = null;
  state.vitals = null;
  state.skills = [];
  state.knowledge = null;
  state.recordedActions = [];
  state.lastDialogue = "No dialogue yet.";
  saveState();
}

function setDisabled(id, disabled) {
  const el = $(id);
  if (el) el.disabled = disabled;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function shortToken(token) {
  return token ? `${token.slice(0, 10)}…${token.slice(-4)}` : "—";
}

function npcById(npcId) {
  return state.nearbyNpcs.find((npc) => npc.npcId === npcId) || null;
}

function currentRegionMeta() {
  return REGION_META[state.scene.regionId] || REGION_META.starter_lowlands;
}

function currentObjectiveText() {
  if (!state.activeQuest) return "Meet Rowan and begin your first steps";
  const next = state.activeQuest.progress.find((objective) => !objective.completed);
  if (!next) return "Return to Rowan and complete your quest";
  return `${titleCase(next.key)} ${next.currentCount}/${next.targetCount}`;
}

function questCanComplete() {
  return Boolean(state.activeQuest && state.activeQuest.progress.every((objective) => objective.completed));
}

function pushJournal(title, text, tone = "info") {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    text,
    tone,
    at: new Date().toLocaleTimeString()
  };
  state.journal.unshift(entry);
  state.journal = state.journal.slice(0, 40);
  saveState();
  renderJournal();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(state.session?.accessToken ? { Authorization: `Bearer ${state.session.accessToken}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const raw = await response.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message = json?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return json;
}

async function refreshStatus() {
  try {
    const json = await api("/api/v1/services/status");
    const services = json.data.services || [];
    const healthy = services.filter((service) => service.healthy).length;
    state.serviceSummary = services;
    els.gatewayStatus.textContent = "Online";
    els.serviceStatus.textContent = `${healthy}/${services.length} healthy`;
  } catch (error) {
    els.gatewayStatus.textContent = "Offline";
    els.serviceStatus.textContent = "Unavailable";
    pushJournal("Gateway issue", error instanceof Error ? error.message : String(error), "danger");
  }
}

async function heartbeat() {
  requireSession();
  const json = await api("/api/v1/session/heartbeat", {
    method: "POST",
    body: JSON.stringify({ accountId: state.session.accountId, accessToken: state.session.accessToken })
  });
  pushJournal("Heartbeat confirmed", `Session for ${json.data.accountId} is alive.`, "success");
}

async function validateSession() {
  if (!state.session?.accessToken) return false;
  try {
    const json = await api("/api/v1/session/me");
    if (!json.data.valid) throw new Error("Session expired");
    return true;
  } catch {
    clearProgress();
    pushJournal("Session reset", "The backend was restarted, so your local session was cleared.", "warn");
    render();
    return false;
  }
}

function requireSession() {
  if (!state.session?.accountId) throw new Error("Login first.");
}

function requireCharacter() {
  if (!state.character?.characterId) throw new Error("Create or select a character first.");
}

function requireWorld() {
  if (!state.worldEntered) throw new Error("Enter the world first.");
}

async function login() {
  const username = $("username").value.trim();
  const password = $("password").value.trim();
  const json = await api("/api/v1/session/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  state.session = json.data.session;
  saveState();
  render();
  pushJournal("You entered the gate", `Welcome back, ${state.session.username}.`, "success");
  await loadCharacters();
}

async function logout() {
  if (state.session?.accessToken) {
    try {
      await api("/api/v1/session/logout", {
        method: "POST",
        body: JSON.stringify({ accessToken: state.session.accessToken })
      });
    } catch {
      // ignore logout race during service restarts
    }
  }
  clearProgress();
  pushJournal("You left the world", "Your local session and active scene were cleared.", "warn");
  render();
}

async function loadCharacters() {
  requireSession();
  const json = await api("/api/v1/character/load-by-account", {
    method: "POST",
    body: JSON.stringify({ accountId: state.session.accountId })
  });
  state.characters = json.data.characters || [];

  if (state.character?.characterId) {
    const updated = state.characters.find((character) => character.characterId === state.character.characterId);
    if (updated) state.character = updated;
  }

  if (!state.character && state.characters[0]) {
    state.character = state.characters[0];
  }

  saveState();
  render();
}

async function createCharacter() {
  requireSession();
  const name = $("character-name").value.trim();
  const race = $("character-race").value;

  if (!name) throw new Error("Give your character a name.");

  const json = await api("/api/v1/character/create", {
    method: "POST",
    body: JSON.stringify({ accountId: state.session.accountId, name, race })
  });

  state.character = json.data.character;
  pushJournal("A new hero rises", `${state.character.name} the ${titleCase(state.character.race)} has stepped forward.`, "success");
  await loadCharacters();
  await syncCharacterSheet();
}

function selectCharacter(characterId) {
  const chosen = state.characters.find((character) => character.characterId === characterId);
  if (!chosen) return;
  state.character = chosen;
  state.worldEntered = false;
  state.encounter = null;
  state.activeQuest = null;
  state.questOffer = null;
  saveState();
  render();
  pushJournal("Character selected", `${chosen.name} is now your active character.`, "info");
}

async function syncCharacterSheet() {
  if (!state.character?.characterId) return;
  const [statsJson, skillsJson, knowledgeJson] = await Promise.all([
    api(`/api/v1/character/${state.character.characterId}/stats`),
    api(`/api/v1/character/${state.character.characterId}/skills`),
    api(`/api/v1/character/${state.character.characterId}/knowledge`)
  ]);

  state.stats = statsJson.data.stats;
  state.vitals = statsJson.data.vitals;
  state.skills = skillsJson.data.skills || [];
  state.knowledge = knowledgeJson.data.knowledge || null;
  render();
}

async function loadActiveQuest() {
  if (!state.character?.characterId) return;
  const json = await api(`/api/v1/quest/active/${state.character.characterId}`);
  state.activeQuest = json.data.active?.[0] || null;
  render();
}

async function hydrateScene() {
  const regionId = state.scene.regionId;
  const worldId = state.scene.worldId;

  const [regionJson, contextJson, resourceJson, npcJson] = await Promise.all([
    api(`/api/v1/world/${worldId}/region/${regionId}`),
    api("/api/v1/world/query-position", {
      method: "POST",
      body: JSON.stringify({ position: state.scene })
    }),
    api("/api/v1/world/query-resource", {
      method: "POST",
      body: JSON.stringify({ worldId, regionId })
    }),
    api(`/api/v1/npc/nearby?regionId=${encodeURIComponent(regionId)}`)
  ]);

  state.region = regionJson.data.region;
  state.worldContext = contextJson.data;
  state.resources = resourceJson.data.nodes || [];
  state.nearbyNpcs = npcJson.data.npcs || [];

  if (!npcById(state.selectedNpcId)) {
    state.selectedNpcId = state.nearbyNpcs[0]?.npcId || null;
  }

  render();
}

async function enterWorld() {
  requireCharacter();

  const spawnJson = await api(`/api/v1/world/spawn/${state.character.characterId}`);
  state.scene = spawnJson.data.position;
  state.worldEntered = true;
  state.character = { ...state.character, position: spawnJson.data.position };
  saveState();

  await Promise.all([hydrateScene(), syncCharacterSheet(), loadActiveQuest()]);
  pushJournal("You entered the world", `${state.character.name} arrives in ${currentRegionMeta().title}.`, "success");
}

async function travelTo(regionId) {
  requireCharacter();
  const meta = REGION_META[regionId];
  if (!meta) throw new Error("Unknown destination.");

  state.scene = { ...meta.position };
  state.worldEntered = true;
  state.character = { ...state.character, position: { ...meta.position } };
  saveState();

  await hydrateScene();
  pushJournal("Travel", `${state.character.name} travels to ${meta.title}.`, "info");
}

async function refreshWorld() {
  requireWorld();
  await Promise.all([hydrateScene(), syncCharacterSheet(), loadActiveQuest()]);
  pushJournal("World refreshed", "Nearby people, resources, and quest state were refreshed.", "info");
}

async function offerQuest() {
  requireCharacter();
  const json = await api("/api/v1/quest/offer-from-npc", {
    method: "POST",
    body: JSON.stringify({ npcId: "npc_elder_rowan", characterId: state.character.characterId })
  });
  state.questOffer = json.data.offered;
  render();
  pushJournal("Quest offered", `${json.data.offered.title}: ${json.data.offered.summary}`, "info");
}

async function acceptQuest() {
  requireCharacter();
  if (state.activeQuest?.status === "ACTIVE") throw new Error("You already have an active quest.");

  const questId = state.questOffer?.questId || "quest_first_steps";
  const json = await api("/api/v1/router/quest", {
    method: "POST",
    body: JSON.stringify({ event: "ACCEPT", characterId: state.character.characterId, questId })
  });

  state.activeQuest = json.data.quest;
  render();
  pushJournal("Quest accepted", "First Steps is now active. Gather wood, then speak with Rowan.", "success");
}

async function progressQuest(objectiveKey, increment = 1, silent = false) {
  if (!state.activeQuest) return;
  const json = await api("/api/v1/router/quest", {
    method: "POST",
    body: JSON.stringify({
      event: "PROGRESS",
      characterId: state.character.characterId,
      questId: state.activeQuest.questId,
      payload: { objectiveKey, increment }
    })
  });

  state.activeQuest = json.data.quest;
  render();

  if (!silent) {
    const objective = state.activeQuest.progress.find((item) => item.key === objectiveKey);
    pushJournal(
      "Quest progress",
      `${titleCase(objectiveKey)} advanced to ${objective?.currentCount ?? 0}/${objective?.targetCount ?? 0}.`,
      "success"
    );
  }
}

async function completeQuest() {
  requireCharacter();
  if (!state.activeQuest) throw new Error("Accept a quest first.");
  if (!questCanComplete()) throw new Error("Finish every objective first.");

  const questId = state.activeQuest.questId;
  const completionJson = await api("/api/v1/router/quest", {
    method: "POST",
    body: JSON.stringify({ event: "COMPLETE", characterId: state.character.characterId, questId })
  });

  state.activeQuest = completionJson.data.quest;

  const rewardJson = await api("/api/v1/rewards/from-quest", {
    method: "POST",
    body: JSON.stringify({ characterId: state.character.characterId, questId })
  });

  await api("/api/v1/rewards/grant", {
    method: "POST",
    body: JSON.stringify({ characterId: state.character.characterId, rewardPackage: rewardJson.data.rewardPackage })
  });

  applyRewardPackage(rewardJson.data.rewardPackage);
  pushJournal("Quest completed", "Rowan rewards your first real effort with supplies and experience.", "success");
  render();
}

function applyRewardPackage(rewardPackage) {
  for (const item of rewardPackage.items || []) {
    state.localInventory[item.itemKey] = (state.localInventory[item.itemKey] || 0) + Number(item.amount || 0);
  }

  for (const [skill, amount] of Object.entries(rewardPackage.xp || {})) {
    state.earnedXp[skill] = (state.earnedXp[skill] || 0) + Number(amount || 0);
  }

  saveState();
}

async function talkToSelectedNpc() {
  requireCharacter();
  requireWorld();

  const npc = npcById(state.selectedNpcId);
  if (!npc) throw new Error("Select an NPC first.");

  const json = await api("/api/v1/router/dialogue", {
    method: "POST",
    body: JSON.stringify({ npcId: npc.npcId, characterId: state.character.characterId, prompt: "Hello." })
  });

  state.lastDialogue = json.data.reply || "The NPC has nothing to say.";
  render();
  pushJournal("Conversation", `${npc.name}: ${state.lastDialogue}`, "info");

  if (npc.npcId === "npc_elder_rowan" && state.activeQuest?.status === "ACTIVE") {
    const objective = state.activeQuest.progress.find((item) => item.key === "speak_rowan");
    if (objective && !objective.completed) {
      await progressQuest("speak_rowan", 1, true);
      pushJournal("Quest progress", "Speaking with Rowan counted toward your task.", "success");
    }
  }
}

async function generateAiDialogue() {
  requireWorld();
  const npc = npcById(state.selectedNpcId) || { npcId: "npc_elder_rowan", name: "Elder Rowan" };
  const prompt = $("ai-prompt").value.trim() || "What should I do next?";
  const json = await api("/api/v1/ai/generate-dialogue", {
    method: "POST",
    body: JSON.stringify({ npcId: npc.npcId, prompt })
  });

  state.lastDialogue = json.data.result?.content?.reply || json.data.reply || "The air stays silent.";
  render();
  pushJournal("AI flavor", `${npc.name}: ${state.lastDialogue}`, "info");
}

async function gatherWood() {
  requireCharacter();
  requireWorld();
  if (state.scene.regionId !== "whisper_woods") throw new Error("Travel to Whisper Woods to gather wood.");

  const action = {
    actionType: "GATHER_WOOD",
    duration: 12,
    count: 1,
    completion: 1,
    context: { regionId: state.scene.regionId },
    tools: ["axe"]
  };

  await api("/api/v1/actions/intake", {
    method: "POST",
    body: JSON.stringify({ characterId: state.character.characterId, actions: [action] })
  });

  state.recordedActions.push(action);
  state.localInventory.wood_log = (state.localInventory.wood_log || 0) + 1;
  saveState();
  render();
  pushJournal("Gathering", "You chop an oak limb into a usable wood log.", "success");

  const objective = state.activeQuest?.progress.find((item) => item.key === "gather_wood");
  if (objective && !objective.completed) {
    await progressQuest("gather_wood", 1, true);
    pushJournal("Quest progress", "The bundle of wood brings you closer to Rowan's request.", "success");
  }
}

async function mineIron() {
  requireCharacter();
  requireWorld();
  if (state.scene.regionId !== "starter_lowlands") throw new Error("The iron vein is in the Starter Lowlands.");

  const action = {
    actionType: "MINE_IRON",
    duration: 10,
    count: 1,
    completion: 1,
    context: { regionId: state.scene.regionId },
    tools: ["pickaxe"]
  };

  await api("/api/v1/actions/intake", {
    method: "POST",
    body: JSON.stringify({ characterId: state.character.characterId, actions: [action] })
  });

  state.recordedActions.push(action);
  state.localInventory.iron_ore = (state.localInventory.iron_ore || 0) + 1;
  saveState();
  render();
  pushJournal("Mining", "You chip a small piece of iron ore from the exposed vein.", "info");
}

async function previewXp() {
  if (!state.recordedActions.length) throw new Error("Gather or mine something first.");
  const json = await api("/api/v1/xp/preview", {
    method: "POST",
    body: JSON.stringify({ actions: state.recordedActions })
  });

  const distribution = json.data.distribution || [];
  const summary = distribution.map((item) => `${item.skill} +${item.amount}`).join(", ") || "No XP calculated";
  pushJournal("XP preview", summary, "info");
}

async function submitXp() {
  requireCharacter();
  if (!state.recordedActions.length) throw new Error("No actions recorded yet.");

  const json = await api("/api/v1/actions/submit-to-xp", {
    method: "POST",
    body: JSON.stringify({ characterId: state.character.characterId })
  });

  for (const item of json.data.distribution || []) {
    state.earnedXp[item.skill] = (state.earnedXp[item.skill] || 0) + Number(item.amount || 0);
  }

  saveState();
  render();
  pushJournal("XP applied to ledger", (json.data.distribution || []).map((item) => `${item.skill} +${item.amount}`).join(", "), "success");
}

async function startCombat() {
  requireCharacter();
  requireWorld();
  if (state.scene.regionId !== "starter_lowlands") throw new Error("Lyra only spars in the Starter Lowlands.");

  const targetNpcId = state.selectedNpcId || "npc_guard_lyra";
  const json = await api("/api/v1/router/combat", {
    method: "POST",
    body: JSON.stringify({ action: "START", characterId: state.character.characterId, targetNpcId })
  });

  state.encounter = json.data.encounter;
  render();
  pushJournal("Combat started", "Guard Lyra takes a ready stance and invites you to spar.", "warn");
}

async function attack() {
  if (!state.encounter?.encounterId) throw new Error("Start combat first.");
  const targetId = state.encounter.participants.find((participant) => participant.type === "NPC")?.id || "npc_guard_lyra";
  const json = await api("/api/v1/router/combat", {
    method: "POST",
    body: JSON.stringify({ action: "ATTACK", characterId: state.character.characterId, encounterId: state.encounter.encounterId, targetNpcId: targetId })
  });

  state.encounter = json.data.encounter;
  render();
  pushJournal("Combat action", "You strike and the practice duel shifts in your favor.", "warn");
}

async function resolveCombat() {
  if (!state.encounter?.encounterId) throw new Error("Start combat first.");
  const json = await api("/api/v1/router/combat", {
    method: "POST",
    body: JSON.stringify({ action: "RESOLVE", characterId: state.character.characterId, encounterId: state.encounter.encounterId })
  });

  state.encounter = json.data.encounter;
  render();
  const outcome = json.data.outcome;
  pushJournal("Combat resolved", `${outcome.winnerId} wins the spar.`, "success");
}

async function retreatCombat() {
  if (!state.encounter?.encounterId) throw new Error("Start combat first.");
  const json = await api("/api/v1/router/combat", {
    method: "POST",
    body: JSON.stringify({ action: "RETREAT", characterId: state.character.characterId, encounterId: state.encounter.encounterId })
  });

  state.encounter = json.data.encounter;
  render();
  pushJournal("Retreat", "You step back and end the spar before either side commits further.", "warn");
}

function renderCharacterList() {
  if (!state.characters.length) {
    els.characterList.innerHTML = '<div class="empty-state">No characters loaded yet.</div>';
    return;
  }

  els.characterList.innerHTML = state.characters
    .map((character) => `
      <button class="card-button ${state.character?.characterId === character.characterId ? "active" : ""}" data-character-id="${character.characterId}">
        <strong>${escapeHtml(character.name)}</strong>
        <span>${titleCase(character.race)} • ${escapeHtml(character.position.regionId || "starter_lowlands")}</span>
      </button>
    `)
    .join("");

  els.characterList.querySelectorAll("[data-character-id]").forEach((button) => {
    button.addEventListener("click", () => selectCharacter(button.getAttribute("data-character-id")));
  });
}

function renderScene() {
  const meta = currentRegionMeta();
  const regionName = state.region?.name || meta.title;
  const regionSummary = state.region
    ? `${regionName} • ${titleCase(state.region.biome)} biome • danger ${state.region.dangerLevel}`
    : meta.summary;

  const npcNames = state.nearbyNpcs.map((npc) => npc.name).join(", ");
  const line = !state.session
    ? "The world waits for you beyond the gate. Login to begin."
    : !state.character
      ? "A blank hero sheet lies before you. Create a character to step into the world."
      : !state.worldEntered
        ? `${state.character.name} is ready. Enter the world to begin the starter path.`
        : `${meta.flavor} ${npcNames ? `Nearby: ${npcNames}.` : "No one is nearby."}`;

  els.sceneTitle.textContent = state.worldEntered ? regionName : "Outside the gates";
  els.sceneText.textContent = line;
  els.regionSummary.textContent = regionSummary;
  els.regionChip.textContent = state.worldEntered ? regionName : "Not entered";
  els.dangerChip.textContent = state.worldEntered ? String(state.region?.dangerLevel ?? meta.danger) : "—";

  els.resourceSummary.innerHTML = state.resources.length
    ? state.resources
        .map((node) => `<span class="mini-chip">${escapeHtml(titleCase(node.type))}</span>`)
        .join("")
    : '<span class="mini-chip muted-chip">No visible resources</span>';
}

function renderNpcList() {
  els.npcCountPill.textContent = `${state.nearbyNpcs.length} NPC${state.nearbyNpcs.length === 1 ? "" : "s"}`;

  if (!state.nearbyNpcs.length) {
    els.npcList.innerHTML = '<div class="empty-state">No one is nearby.</div>';
    return;
  }

  els.npcList.innerHTML = state.nearbyNpcs
    .map((npc) => `
      <div class="npc-card ${state.selectedNpcId === npc.npcId ? "selected" : ""}">
        <div>
          <strong>${escapeHtml(npc.name)}</strong>
          <div class="muted">${escapeHtml(titleCase(npc.role.roleType))} • ${escapeHtml(titleCase(npc.regionId))}</div>
        </div>
        <div class="npc-meta">
          <span class="mini-chip muted-chip">${npc.role.tags.map((tag) => escapeHtml(titleCase(tag))).join(" • ")}</span>
          <button data-npc-id="${npc.npcId}" class="secondary">Select</button>
        </div>
      </div>
    `)
    .join("");

  els.npcList.querySelectorAll("[data-npc-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNpcId = button.getAttribute("data-npc-id");
      saveState();
      renderNpcList();
      renderDialogue();
    });
  });
}

function renderDialogue() {
  const npc = npcById(state.selectedNpcId);
  const prefix = npc ? `${npc.name}: ` : "";
  els.dialogueBox.textContent = `${prefix}${state.lastDialogue}`;
}

function renderQuest() {
  els.objectiveChip.textContent = currentObjectiveText();

  if (!state.activeQuest) {
    const offer = state.questOffer
      ? `<div class="stack-item"><strong>${escapeHtml(state.questOffer.title)}</strong><span>${escapeHtml(state.questOffer.summary)}</span></div>`
      : "<div class=\"empty-state\">Ask Rowan for work to receive your first quest.</div>";

    els.questStatusPill.textContent = state.questOffer ? "Quest offered" : "No quest";
    els.questBox.innerHTML = offer;
    return;
  }

  els.questStatusPill.textContent = state.activeQuest.status;
  els.questBox.innerHTML = `
    <div>
      <strong>${escapeHtml(titleCase(state.activeQuest.questId.replace("quest_", "")))}</strong>
      <div class="muted">Status: ${escapeHtml(state.activeQuest.status)}</div>
    </div>
    ${state.activeQuest.progress
      .map((objective) => `
        <div class="quest-objective">
          <span>${escapeHtml(titleCase(objective.key))}</span>
          <strong class="${objective.completed ? "objective-done" : "objective-open"}">${objective.currentCount}/${objective.targetCount}</strong>
        </div>
      `)
      .join("")}
  `;
}

function renderCharacterSheet() {
  els.accountId.textContent = state.session?.accountId || "No account";
  els.tokenPreview.textContent = shortToken(state.session?.accessToken);
  els.selectedCharacterPill.textContent = state.character?.name || "No character";
  els.worldStatusPill.textContent = state.worldEntered ? "In world" : "Not in world";

  if (!state.vitals) {
    els.vitalsBox.innerHTML = '<div class="empty-state">No vitals loaded.</div>';
  } else {
    els.vitalsBox.innerHTML = Object.entries(state.vitals)
      .map(([key, value]) => `
        <div class="meter">
          <div class="meter-row"><span>${escapeHtml(titleCase(key))}</span><strong>${value}</strong></div>
          <div class="meter-fill"><span style="width:${Math.max(0, Math.min(100, Number(value)))}%"></span></div>
        </div>
      `)
      .join("");
  }

  els.statsBox.innerHTML = state.stats
    ? Object.entries(state.stats)
        .map(([key, value]) => `<div class="stack-item"><strong>${escapeHtml(titleCase(key))}</strong><span>${value}</span></div>`)
        .join("")
    : '<div class="empty-state">No stats loaded.</div>';

  els.skillsBox.innerHTML = state.skills.length
    ? state.skills
        .map((skill) => `<div class="stack-item"><strong>${escapeHtml(skill.skill)}</strong><span>Level ${skill.level} • ${skill.xp} XP</span></div>`)
        .join("")
    : '<div class="empty-state">No skills loaded.</div>';
}

function renderInventory() {
  const inventoryEntries = Object.entries(state.localInventory).filter(([, amount]) => Number(amount) > 0);
  els.inventoryBox.innerHTML = inventoryEntries.length
    ? inventoryEntries
        .map(([item, amount]) => `<div class="stack-item inventory-row"><span>${escapeHtml(titleCase(item))}</span><strong>${amount}</strong></div>`)
        .join("")
    : '<div class="empty-state">Your bag is empty.</div>';

  const xpEntries = Object.entries(state.earnedXp).filter(([, amount]) => Number(amount) > 0);
  els.xpBox.innerHTML = xpEntries.length
    ? xpEntries
        .sort((a, b) => b[1] - a[1])
        .map(([skill, amount]) => `<div class="stack-item xp-row"><span>${escapeHtml(skill)}</span><strong>${amount}</strong></div>`)
        .join("")
    : '<div class="empty-state">No earned XP tracked yet.</div>';
}

function renderCombat() {
  els.combatStatePill.textContent = state.encounter?.state || "No encounter";

  if (!state.encounter) {
    els.combatBox.innerHTML = "No encounter active.";
    return;
  }

  const participants = state.encounter.participants
    .map((participant) => `
      <div class="stack-item combatant-row">
        <span>${escapeHtml(participant.name)} (${escapeHtml(participant.type)})</span>
        <strong>${participant.hp} HP</strong>
      </div>
    `)
    .join("");

  const logLines = state.encounter.log
    .slice(-4)
    .map((entry) => `<div class="stack-item"><strong>${escapeHtml(entry.action)}</strong><span>${escapeHtml(entry.result)}</span></div>`)
    .join("");

  els.combatBox.innerHTML = `${participants}${logLines ? `<div class="stack-list compact">${logLines}</div>` : ""}`;
}

function renderJournal() {
  if (!state.journal.length) {
    els.journal.innerHTML = 'Your story entries will appear here.';
    return;
  }

  els.journal.innerHTML = state.journal
    .map((entry) => `
      <div class="journal-entry ${entry.tone === "danger" ? "danger-text" : entry.tone === "warn" ? "warn-text" : entry.tone === "success" ? "success-text" : ""}">
        <div class="journal-head">
          <strong>${escapeHtml(entry.title)}</strong>
          <small>${escapeHtml(entry.at)}</small>
        </div>
        <div>${escapeHtml(entry.text)}</div>
      </div>
    `)
    .join("");
}

function updateActionLocks() {
  const hasSession = Boolean(state.session);
  const hasCharacter = Boolean(state.character);
  const inWorld = Boolean(state.worldEntered);
  const inWoods = state.scene.regionId === "whisper_woods";
  const inStarter = state.scene.regionId === "starter_lowlands";
  const hasEncounter = Boolean(state.encounter?.encounterId && state.encounter.state === "ACTIVE");
  const activeQuest = Boolean(state.activeQuest?.status === "ACTIVE");

  setDisabled("login-btn", false);
  setDisabled("heartbeat-btn", !hasSession);
  setDisabled("create-character-btn", !hasSession);
  setDisabled("load-characters-btn", !hasSession);
  setDisabled("enter-world-btn", !hasCharacter);
  setDisabled("refresh-world-btn", !inWorld);
  setDisabled("travel-starter-btn", !hasCharacter || !inWorld || inStarter);
  setDisabled("travel-woods-btn", !hasCharacter || !inWorld || inWoods);
  setDisabled("gather-wood-btn", !inWorld || !inWoods);
  setDisabled("mine-iron-btn", !inWorld || !inStarter);
  setDisabled("offer-quest-btn", !inWorld);
  setDisabled("accept-quest-btn", !inWorld || activeQuest);
  setDisabled("complete-quest-btn", !questCanComplete());
  setDisabled("preview-xp-btn", state.recordedActions.length === 0);
  setDisabled("submit-xp-btn", !hasCharacter || state.recordedActions.length === 0);
  setDisabled("talk-btn", !inWorld || !state.selectedNpcId);
  setDisabled("ai-dialogue-btn", !inWorld || !state.selectedNpcId);
  setDisabled("start-combat-btn", !inWorld || !inStarter || hasEncounter);
  setDisabled("attack-btn", !hasEncounter);
  setDisabled("resolve-combat-btn", !hasEncounter);
  setDisabled("retreat-combat-btn", !hasEncounter);
}

function render() {
  renderCharacterList();
  renderScene();
  renderNpcList();
  renderDialogue();
  renderQuest();
  renderCharacterSheet();
  renderInventory();
  renderCombat();
  renderJournal();
  updateActionLocks();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attach(id, handler) {
  $(id).addEventListener("click", async () => {
    try {
      await handler();
      saveState();
      render();
    } catch (error) {
      pushJournal("Action failed", error instanceof Error ? error.message : String(error), "danger");
    }
  });
}

async function boot() {
  restoreState();
  render();
  await refreshStatus();

  const sessionValid = await validateSession();
  if (!sessionValid) return;

  if (state.session) {
    await loadCharacters();
  }

  if (state.character) {
    await syncCharacterSheet();
    await loadActiveQuest();
  }

  if (state.character && state.worldEntered) {
    await hydrateScene();
  }

  render();
}

attach("refresh-status-btn", refreshStatus);
attach("login-btn", login);
attach("heartbeat-btn", heartbeat);
attach("logout-btn", logout);
attach("create-character-btn", createCharacter);
attach("load-characters-btn", loadCharacters);
attach("enter-world-btn", enterWorld);
attach("refresh-world-btn", refreshWorld);
attach("travel-starter-btn", () => travelTo("starter_lowlands"));
attach("travel-woods-btn", () => travelTo("whisper_woods"));
attach("gather-wood-btn", gatherWood);
attach("mine-iron-btn", mineIron);
attach("offer-quest-btn", offerQuest);
attach("accept-quest-btn", acceptQuest);
attach("complete-quest-btn", completeQuest);
attach("preview-xp-btn", previewXp);
attach("submit-xp-btn", submitXp);
attach("talk-btn", talkToSelectedNpc);
attach("ai-dialogue-btn", generateAiDialogue);
attach("start-combat-btn", startCombat);
attach("attack-btn", attack);
attach("resolve-combat-btn", resolveCombat);
attach("retreat-combat-btn", retreatCombat);

boot().catch((error) => {
  pushJournal("Boot failed", error instanceof Error ? error.message : String(error), "danger");
});