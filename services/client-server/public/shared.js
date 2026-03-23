const SESSION_KEY = "vibecheck.session.v1";
const REMEMBER_KEY = "vibecheck.remember.v1";
const PROFILE_KEY = "vibecheck.profile.v1";
const SETTINGS_KEY = "vibecheck.settings.v1";
const FRIENDS_KEY = "vibecheck.friends.v1";

export const REGION_META = {
  starter_lowlands: {
    title: "Starter Lowlands",
    summary: "The first settled patch of World Prime: open grass, a training yard, a campfire, and a path toward the woods.",
    flavor: "Warm wind rolls over the grass while villagers study the road for fresh arrivals.",
    danger: 1,
    bounds: { minX: 0, maxX: 11, minY: 0, maxY: 11 },
    neighbors: { east: "whisper_woods" },
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 1, y: 1 }
  },
  whisper_woods: {
    title: "Whisper Woods",
    summary: "Tall trees, drifting mist, and the sound of branches rubbing together in the distance.",
    flavor: "The woods dim the light. Every snapped twig sounds louder here, but the trees are rich with usable timber.",
    danger: 3,
    bounds: { minX: 12, maxX: 23, minY: 0, maxY: 11 },
    neighbors: { west: "starter_lowlands" },
    position: { worldId: "world_prime", regionId: "whisper_woods", x: 13, y: 5 }
  }
};

export const NEWS_ITEMS = [
  {
    title: "Persistent Character Saves",
    body: "Characters now stay attached to the account that created them, even after restarting the stack.",
    tag: "Accounts"
  },
  {
    title: "Map-Centered World Screen",
    body: "The world page is now focused on the chunk map, tile interaction, tile-detail zoom, and the AI action menu instead of a debug-first layout.",
    tag: "World"
  },
  {
    title: "Action Outcomes and Inventory",
    body: "Queued actions now resolve into concrete results, item changes, failures, survival pressure, and specific rewards instead of vague bundles.",
    tag: "Actions"
  }
];

const DEFAULT_SURVIVAL = {
  health: 100,
  water: 100,
  food: 100,
  sleep: 100
};

export function $(id) {
  return document.getElementById(id);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function chunkCoords(x, y, size = 12) {
  return {
    chunkX: Math.floor(Number(x ?? 0) / size),
    chunkY: Math.floor(Number(y ?? 0) / size),
    size
  };
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadSession() {
  return readJson(SESSION_KEY, null);
}

export function saveSession(session) {
  writeJson(SESSION_KEY, session);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function loadRememberedAuth() {
  return readJson(REMEMBER_KEY, { remember: false, username: "" });
}

export function saveRememberedAuth({ remember, username }) {
  if (!remember) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  writeJson(REMEMBER_KEY, { remember: true, username: String(username || "") });
}

export function normalizeProfile(profile) {
  const current = profile && typeof profile === "object" ? profile : {};
  return {
    selectedCharacterId: current.selectedCharacterId || null,
    scene: current.scene || REGION_META.starter_lowlands.position,
    feed: Array.isArray(current.feed) ? current.feed : [],
    selectedNpcId: current.selectedNpcId || null,
    selectedBuildType: current.selectedBuildType || "WOOD_WALL",
    selectedTile: current.selectedTile || null,
    selectedSubTile: current.selectedSubTile || { x: 0, y: 0 },
    mapMode: current.mapMode === "detail" ? "detail" : "region",
    actionQueue: Array.isArray(current.actionQueue) ? current.actionQueue : [],
    survival: { ...DEFAULT_SURVIVAL, ...(current.survival || {}) }
  };
}

export function loadProfile() {
  return normalizeProfile(readJson(PROFILE_KEY, {}));
}

export function saveProfile(profile) {
  writeJson(PROFILE_KEY, normalizeProfile(profile));
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

export function loadSettings() {
  return readJson(SETTINGS_KEY, {
    sfx: true,
    music: false,
    compact: false,
    chatTheme: "ocean",
    npcTone: "grounded",
    npcTheme: "frontier_fantasy",
    mapLabels: true
  });
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, settings);
}

export function loadFriends() {
  return readJson(FRIENDS_KEY, []);
}

export function saveFriends(friends) {
  writeJson(FRIENDS_KEY, friends);
}

export function resetAllClientState() {
  clearSession();
  clearProfile();
  localStorage.removeItem(FRIENDS_KEY);
}

export function pushFeed(profile, title, text, tone = "info") {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    text,
    tone,
    at: new Date().toLocaleTimeString()
  };
  profile.feed = [entry, ...(profile.feed || [])].slice(0, 80);
  saveProfile(profile);
  return entry;
}

export function renderFeed(target, profile, emptyText) {
  const entries = profile.feed || [];
  if (!entries.length) {
    target.className = "feed-list empty-state";
    target.textContent = emptyText;
    return;
  }

  target.className = "feed-list";
  target.innerHTML = entries
    .map((entry) => `
      <article class="feed-entry ${entry.tone || ""}">
        <div class="feed-head">
          <strong>${escapeHtml(entry.title)}</strong>
          <small>${escapeHtml(entry.at)}</small>
        </div>
        <p>${escapeHtml(entry.text)}</p>
      </article>
    `)
    .join("");
}

export async function api(path, options = {}) {
  const session = loadSession();
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      ...(options.headers || {})
    },
    ...options
  });

  const raw = await response.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `${response.status} ${response.statusText}`);
  }

  return json;
}

export async function validateSession() {
  const session = loadSession();
  if (!session?.accessToken) return false;
  try {
    const json = await api("/api/v1/session/me");
    return Boolean(json?.data?.valid);
  } catch {
    return false;
  }
}

export async function requireSessionOrRedirect() {
  const valid = await validateSession();
  if (!valid) {
    clearSession();
    window.location.href = "/";
    throw new Error("Session not valid.");
  }
  return loadSession();
}

export async function refreshServiceStatus() {
  return api("/api/v1/services/status");
}

export function summarizeServices(services) {
  const healthy = services.filter((item) => item.healthy).length;
  return `${healthy}/${services.length} healthy`;
}

export async function loadContentSnapshot(force = false) {
  const query = force ? "?force=1" : "";
  const json = await api(`/api/v1/content/snapshot${query}`);
  return json?.data?.snapshot || json?.data || null;
}

export function contentSourceLabel(snapshot) {
  const source = String(snapshot?.source || "unknown").toLowerCase();
  if (source === "redis") return "Redis";
  if (source === "redis-seeded") return "Redis (Seeded)";
  if (source === "redis-unavailable") return "Redis Unavailable";
  if (source === "airtable") return "Airtable";
  if (source === "hybrid") return "Hybrid";
  if (source === "seed") return "Seed Fallback";
  return source && source !== "unknown" ? source.replaceAll("-", " ").replace(/\w/g, (m) => m.toUpperCase()) : "Unknown";
}

export async function loadCharacters(accountId) {
  const json = await api("/api/v1/character/load-by-account", {
    method: "POST",
    body: JSON.stringify({ accountId })
  });
  return json?.data?.characters || [];
}

export async function createCharacter(accountId, name, race) {
  const json = await api("/api/v1/character/create", {
    method: "POST",
    body: JSON.stringify({ accountId, name, race })
  });
  return json?.data?.character;
}

export function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function shortToken(token) {
  return token ? `${token.slice(0, 10)}…${token.slice(-4)}` : "—";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function selectedCharacter(characters, profile) {
  if (!characters.length) return null;
  const chosen = characters.find((item) => item.characterId === profile.selectedCharacterId);
  return chosen || characters[0];
}

export async function loadLobbyHistory() {
  const json = await api("/api/v1/chat/channel/lobby/history");
  return json?.data?.messages || [];
}

export async function sendLobbyChat(authorId, content) {
  const json = await api("/api/v1/chat/send", {
    method: "POST",
    body: JSON.stringify({ channelId: "lobby", authorId, content })
  });
  return json?.data?.message;
}

export function renderChat(target, messages, emptyText = "No messages yet.") {
  if (!messages.length) {
    target.className = "chat-list empty-state";
    target.textContent = emptyText;
    return;
  }

  target.className = "chat-list";
  target.innerHTML = messages
    .slice()
    .reverse()
    .map((message) => `
      <article class="chat-entry">
        <div class="feed-head">
          <strong>${escapeHtml(message.authorId)}</strong>
          <small>${escapeHtml(new Date(message.createdAt).toLocaleTimeString())}</small>
        </div>
        <p>${escapeHtml(message.content)}</p>
      </article>
    `)
    .join("");
}

export function discoveredSkillsFromSheet(sheet) {
  const list = ["GENERAL"];
  for (const skill of sheet?.skills || []) {
    if (skill?.skill && !list.includes(skill.skill)) {
      list.push(skill.skill);
    }
  }
  return list;
}

export async function hydrateCharacterSheet(characterId) {
  const bust = `ts=${Date.now()}`;
  const [characterJson, statsJson, skillsJson, knowledgeJson] = await Promise.all([
    api(`/api/v1/character/${characterId}?${bust}`),
    api(`/api/v1/character/${characterId}/stats?${bust}`),
    api(`/api/v1/character/${characterId}/skills?${bust}`),
    api(`/api/v1/character/${characterId}/knowledge?${bust}`)
  ]);

  return {
    character: characterJson?.data?.character || null,
    stats: statsJson?.data?.stats || null,
    vitals: statsJson?.data?.vitals || null,
    inventory: characterJson?.data?.character?.inventory || statsJson?.data?.inventory || {},
    skills: skillsJson?.data?.skills || [],
    knowledge: knowledgeJson?.data?.knowledge || null,
    discoveredWorlds: characterJson?.data?.character?.discoveredWorlds || ["world_prime"]
  };
}
