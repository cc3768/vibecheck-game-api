import {
  $, api, clearProfile, clearSession, contentSourceLabel, loadContentSnapshot, loadProfile, loadRememberedAuth, loadSession, pushFeed,
  refreshServiceStatus, renderFeed, saveRememberedAuth, saveSession, shortToken, validateSession
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
    const [statusJson, contentSnapshot] = await Promise.all([refreshServiceStatus(), loadContentSnapshot()]);
    const services = statusJson?.data?.services || [];
    const healthy = services.filter((item) => item.healthy).length;
    $("gateway-status").textContent = "Online";
    $("service-status").textContent = `${healthy}/${services.length} healthy`;
    $("data-source-status").textContent = contentSourceLabel(contentSnapshot);
  } catch (error) {
    $("gateway-status").textContent = "Offline";
    $("service-status").textContent = "Unavailable";
    $("data-source-status").textContent = "Unavailable";
    pushFeed(profile, "Gateway issue", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  }
}

async function boot() {
  $("username").value = remembered.username || "";
  $("password").value = "";
  $("remember-me").checked = Boolean(remembered.remember);
  $("register-username").value = "";
  $("register-password").value = "";
  $("register-confirm").value = "";
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
  $("register-username").value = "";
  $("register-password").value = "";
  $("register-confirm").value = "";
  $("register-state").textContent = "Ready";
  renderMeta(null);
  pushFeed(profile, "Site data cleared", "Saved session, remembered username, and local progress were removed.", "warn");
  renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("username").value.trim();
  const password = $("password").value.trim();
  const remember = $("remember-me").checked;

  if (!username || !password) {
    pushFeed(profile, "Login blocked", "Enter both a username and password.", "warn");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
    return;
  }

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

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("register-username").value.trim();
  const password = $("register-password").value.trim();
  const confirm = $("register-confirm").value.trim();
  if (!username || !password) {
    $("register-state").textContent = "Need details";
    pushFeed(profile, "Registration blocked", "Choose a username and password for the new account.", "warn");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
    return;
  }
  if (password !== confirm) {
    $("register-state").textContent = "Passwords differ";
    pushFeed(profile, "Registration blocked", "The password confirmation does not match.", "warn");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
    return;
  }

  try {
    $("register-state").textContent = "Creating…";
    const json = await api("/api/v1/session/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    const session = json?.data?.session || json?.data;
    if (!session?.accessToken) throw new Error("The account was created, but no session was returned.");
    saveSession(session);
    saveRememberedAuth({ remember: true, username });
    $("register-state").textContent = "Created";
    pushFeed(profile, "Account created", `${username} has a new account and is heading to the hub.`, "success");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
    window.location.href = "/lobby.html";
  } catch (error) {
    $("register-state").textContent = "Failed";
    pushFeed(profile, "Registration failed", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
  }
});

boot().catch((error) => {
  pushFeed(profile, "Boot failed", error instanceof Error ? error.message : String(error), "danger");
  renderFeed($("feed"), profile, "Nothing yet. Sign in to begin.");
});
