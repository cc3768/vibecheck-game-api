import {
  $, api, clearProfile, clearSession, loadProfile, loadRememberedAuth, loadSession, pushFeed, refreshServiceStatus,
  renderFeed, saveRememberedAuth, saveSession, summarizeServices, shortToken, validateSession
} from "/shared.js";

const profile = loadProfile();
const remembered = loadRememberedAuth();

function renderMeta(session = loadSession()) {
  $("session-state").textContent = session ? "Session active" : "No session";
  $("current-account").textContent = session?.accountId || "—";
  $("remembered-user").textContent = remembered.username || "None";
  if (session?.accessToken) {
    pushFeed(profile, "Session detected", `Current access token ${shortToken(session.accessToken)} is present in site data.`, "info");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  }
}

async function refreshStatus() {
  try {
    const json = await refreshServiceStatus();
    const services = json?.data?.services || [];
    $("gateway-status").textContent = "Online";
    $("service-status").textContent = summarizeServices(services);
  } catch (error) {
    $("gateway-status").textContent = "Offline";
    $("service-status").textContent = "Unavailable";
    pushFeed(profile, "Gateway issue", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  }
}

async function boot() {
  $("username").value = remembered.username || "demo";
  $("password").value = "demo";
  $("remember-me").checked = Boolean(remembered.remember);
  renderMeta();
  renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  await refreshStatus();

  const valid = await validateSession();
  if (valid) {
    pushFeed(profile, "Welcome back", "A valid session was found. Redirecting to the character hub.", "success");
    window.location.href = "/lobby.html";
  }
}

$("refresh-status-btn").addEventListener("click", async () => {
  await refreshStatus();
});

$("clear-site-data-btn").addEventListener("click", () => {
  clearSession();
  clearProfile();
  localStorage.removeItem("vibecheck.remember.v1");
  $("username").value = "";
  $("password").value = "";
  $("remember-me").checked = false;
  renderMeta(null);
  pushFeed(profile, "Site data cleared", "Saved session, remembered username, and local progress were removed.", "warn");
  renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("username").value.trim() || "demo";
  const password = $("password").value.trim() || "demo";
  const remember = $("remember-me").checked;

  try {
    const json = await api("/api/v1/session/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    saveSession(json?.data?.session);
    saveRememberedAuth({ remember, username });
    pushFeed(profile, "Login successful", `${username} entered the gate and is heading to the hub.`, "success");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
    renderMeta(json?.data?.session);
    window.location.href = "/lobby.html";
  } catch (error) {
    pushFeed(profile, "Login failed", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  }
});

boot().catch((error) => {
  pushFeed(profile, "Boot failed", error instanceof Error ? error.message : String(error), "danger");
  renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
});
