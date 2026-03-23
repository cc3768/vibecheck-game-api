import { titleCase } from "/shared.js";

const TRANSITION_KEY = "vibecheck.worldTransition.v1";
const TRANSITION_MAX_AGE_MS = 2 * 60 * 1000;

function $(id) {
  return document.getElementById(id);
}

function parseTransition() {
  try {
    const raw = localStorage.getItem(TRANSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - Number(parsed.at) > TRANSITION_MAX_AGE_MS) {
      localStorage.removeItem(TRANSITION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(TRANSITION_KEY);
    return null;
  }
}

function setOverlay(title, copy, progress) {
  const titleEl = $("world-boot-title");
  const statusEl = $("world-boot-status");
  const barEl = $("world-boot-progress-bar");
  if (titleEl) titleEl.textContent = title;
  if (statusEl) statusEl.textContent = copy;
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
}

function hideOverlay() {
  const overlay = $("world-boot-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;
  overlay.classList.add("hidden");
  window.setTimeout(() => {
    localStorage.removeItem(TRANSITION_KEY);
  }, 200);
}

function jsonResponse(data) {
  return new Response(JSON.stringify({
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function prettyRegion(regionId) {
  return titleCase(String(regionId || "starter_lowlands").replace(/^starter_/, "starter "));
}

const transition = parseTransition();
const originalFetch = window.fetch.bind(window);
let bootstrapServed = false;
let contentServed = false;

if (transition?.hero?.name) {
  const meta = $("world-boot-meta");
  if (meta) {
    meta.textContent = `${transition.hero.name} • ${prettyRegion(transition.scene?.regionId)} • ${transition.scene?.x ?? 0}, ${transition.scene?.y ?? 0}`;
  }
  setOverlay(
    "Entering the play world",
    `Using the chunk already loaded from the character hub for ${transition.hero.name}.`,
    52
  );
} else {
  setOverlay(
    "Loading world state",
    "Checking the current region and reading nearby terrain, inventory, and character state.",
    18
  );
}

window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url || "";

  if (transition && !bootstrapServed && /\/api\/v1\/world\/bootstrap(?:\?|$)/.test(url)) {
    bootstrapServed = true;
    setOverlay(
      "Rendering terrain",
      "Using the preloaded region and chunk from the transition screen.",
      78
    );
    return jsonResponse(transition.bootstrap || {});
  }

  if (transition?.contentSnapshot && !contentServed && /\/api\/v1\/content\/snapshot(?:\?|$)/.test(url)) {
    contentServed = true;
    return jsonResponse({ snapshot: transition.contentSnapshot });
  }

  return originalFetch(input, init);
};

function watchForWorldReady() {
  const grid = $("chunk-grid");
  const observer = new MutationObserver(() => {
    if (grid && grid.children.length > 0) {
      setOverlay("World ready", "The nearby terrain has finished drawing.", 100);
      observer.disconnect();
      window.setTimeout(hideOverlay, 180);
    }
  });

  if (grid) {
    observer.observe(grid, { childList: true, subtree: true });
    if (grid.children.length > 0) {
      setOverlay("World ready", "The nearby terrain has finished drawing.", 100);
      observer.disconnect();
      window.setTimeout(hideOverlay, 180);
      return;
    }
  }

  const pill = $("world-status-pill");
  const poll = window.setInterval(() => {
    const chunkReady = grid && grid.children.length > 0;
    const statusReady = pill && pill.textContent && !/loading/i.test(pill.textContent);
    if (chunkReady || statusReady) {
      window.clearInterval(poll);
      observer.disconnect();
      setOverlay("World ready", "The nearby terrain has finished drawing.", 100);
      window.setTimeout(hideOverlay, 180);
    }
  }, 250);

  window.setTimeout(() => {
    window.clearInterval(poll);
    observer.disconnect();
    if (grid && grid.children.length > 0) {
      setOverlay("World ready", "The nearby terrain has finished drawing.", 100);
      window.setTimeout(hideOverlay, 180);
    } else {
      hideOverlay();
    }
  }, transition ? 8000 : 12000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchForWorldReady, { once: true });
} else {
  watchForWorldReady();
}
