import {
  $, api, loadCharacters, loadProfile, loadSession, normalizeProfile, requireSessionOrRedirect, saveProfile, selectedCharacter, titleCase
} from "/shared.js";

const TRANSITION_KEY = "vibecheck.worldTransition.v1";
const CHUNK_SIZE = 12;

const profile = normalizeProfile(loadProfile());
const session = loadSession();

function pretty(value) {
  return titleCase(String(value || "").replace(/^world_/, "").replace(/^starter_/, "starter "));
}

function setStage(title, copy, progress, stageLabel) {
  $("transition-title").textContent = title;
  $("transition-copy").textContent = copy;
  $("transition-stage").textContent = stageLabel || title;
  $("transition-progress-bar").style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
}

function showError(message) {
  const box = $("transition-error");
  box.textContent = message;
  box.classList.remove("hidden");
  $("retry-loading-btn").classList.remove("hidden");
}

function hideError() {
  const box = $("transition-error");
  box.textContent = "";
  box.classList.add("hidden");
  $("retry-loading-btn").classList.add("hidden");
}

function writeTransition(payload) {
  localStorage.setItem(TRANSITION_KEY, JSON.stringify({
    at: Date.now(),
    ...payload
  }));
}

function clearTransition() {
  localStorage.removeItem(TRANSITION_KEY);
}

function saveScene(scene) {
  profile.scene = {
    worldId: String(scene.worldId || "world_prime"),
    regionId: String(scene.regionId || "starter_lowlands"),
    x: Number(scene.x || 0),
    y: Number(scene.y || 0)
  };
  profile.selectedTile = { x: profile.scene.x, y: profile.scene.y };
  saveProfile(profile);
}

async function resolveHero() {
  const characters = await loadCharacters(session.accountId);
  const hero = selectedCharacter(characters, profile);
  if (!hero) {
    window.location.href = "/lobby.html";
    throw new Error("No selected character found. Return to the hub and choose a hero first.");
  }
  profile.selectedCharacterId = hero.characterId;
  saveProfile(profile);
  return hero;
}

async function resolveScene(hero) {
  if (profile.scene?.worldId && profile.scene?.regionId) {
    return profile.scene;
  }

  try {
    const json = await api(`/api/v1/world/spawn/${hero.characterId}`);
    if (json?.data?.position) {
      saveScene(json.data.position);
      return profile.scene;
    }
  } catch {
    // fall through to local fallback
  }

  const fallback = hero?.position?.worldId
    ? hero.position
    : { worldId: "world_prime", regionId: "starter_lowlands", x: 1, y: 1 };

  saveScene(fallback);
  return profile.scene;
}

async function preloadWorld(hero, scene) {
  const [bootstrapResult, contentResult] = await Promise.allSettled([
    api("/api/v1/world/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        characterId: hero.characterId,
        worldId: scene.worldId,
        regionId: scene.regionId,
        x: scene.x,
        y: scene.y,
        size: CHUNK_SIZE
      })
    }),
    api("/api/v1/content/snapshot")
  ]);

  if (bootstrapResult.status !== "fulfilled") {
    throw bootstrapResult.reason instanceof Error
      ? bootstrapResult.reason
      : new Error("World bootstrap failed before the play page opened.");
  }

  return {
    bootstrap: bootstrapResult.value?.data || {},
    contentSnapshot: contentResult.status === "fulfilled"
      ? (contentResult.value?.data?.snapshot || contentResult.value?.data || null)
      : null
  };
}

async function boot() {
  hideError();
  clearTransition();
  setStage(
    "Preparing your world",
    "Checking the session and selected character before opening the play world.",
    10,
    "Session check"
  );

  await requireSessionOrRedirect();

  const hero = await resolveHero();
  $("transition-hero").textContent = hero.name || "Unknown hero";

  setStage(
    "Resolving spawn point",
    `${hero.name} is being aligned with the last known world position and nearest playable region.`,
    28,
    "Spawn resolution"
  );

  const scene = await resolveScene(hero);
  $("transition-destination").textContent = `${pretty(scene.regionId)} • ${scene.x}, ${scene.y}`;

  setStage(
    "Streaming nearby map data",
    `Loading region ${pretty(scene.regionId)} and the first nearby chunk before entering ground play.`,
    62,
    "World bootstrap"
  );

  const preloaded = await preloadWorld(hero, scene);

  writeTransition({
    characterId: hero.characterId,
    hero,
    scene,
    bootstrap: preloaded.bootstrap,
    contentSnapshot: preloaded.contentSnapshot
  });

  setStage(
    "Opening the play world",
    "The first chunk is ready. Moving from the character hub into the live world view now.",
    100,
    "Redirecting"
  );

  window.setTimeout(() => {
    window.location.href = "/world.html";
  }, 180);
}

$("retry-loading-btn").addEventListener("click", () => {
  void boot().catch((error) => {
    showError(error instanceof Error ? error.message : String(error));
  });
});

$("back-to-lobby-btn").addEventListener("click", () => {
  window.location.href = "/lobby.html";
});

boot().catch((error) => {
  showError(error instanceof Error ? error.message : String(error));
});
