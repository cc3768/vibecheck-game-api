import {
  $, NEWS_ITEMS, api, contentSourceLabel, createCharacter, escapeHtml, loadCharacters, loadContentSnapshot, loadFriends, loadProfile, loadSession, loadSettings, pushFeed,
  refreshServiceStatus, renderChat, renderFeed, requireSessionOrRedirect, saveFriends, saveProfile, saveSettings,
  selectedCharacter, sendLobbyChat, summarizeServices, titleCase, loadLobbyHistory
} from "/shared.js";

const profile = loadProfile();
const session = loadSession();
let characters = [];
let friends = loadFriends();
let chatMessages = [];
let settings = loadSettings();
let activeTab = "characters";

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

function renderHeader() {
  $("account-name").textContent = session?.username || "—";
  const selected = selectedCharacter(characters, profile);
  $("selected-character").textContent = selected?.name || "None";
  $("play-btn").disabled = !selected;
  $("character-summary").textContent = `${characters.length} character${characters.length === 1 ? "" : "s"}`;
}

function renderCharacters() {
  const selected = selectedCharacter(characters, profile);
  if (!characters.length) {
    $("character-list").className = "stack-list empty-state";
    $("character-list").innerHTML = "No characters yet. Create one to continue.";
    $("creation-hint").textContent = "No roster found";
    setTab("characters");
    return;
  }

  $("creation-hint").textContent = "Ready";
  $("character-list").className = "stack-list";
  $("character-list").innerHTML = characters
    .map((character) => `
      <button class="card-button ${selected?.characterId === character.characterId ? "active" : ""}" data-character-id="${character.characterId}">
        <strong>${escapeHtml(character.name)}</strong>
        <span>${escapeHtml(titleCase(character.race))} • ${escapeHtml(titleCase(character.position.regionId))}</span>
      </button>
    `)
    .join("");

  $("character-list").querySelectorAll("[data-character-id]").forEach((button) => {
    button.addEventListener("click", () => {
      profile.selectedCharacterId = button.getAttribute("data-character-id");
      saveProfile(profile);
      renderHeader();
      renderCharacters();
      pushFeed(profile, "Character selected", `${selectedCharacter(characters, profile)?.name || "Hero"} is ready to play.`, "info");
      renderFeed($("feed"), profile, "Your hub actions will appear here.");
    });
  });
}

function renderNews() {
  $("news-grid").innerHTML = NEWS_ITEMS.map((item) => `
    <article class="news-card">
      <span class="tiny-label">${escapeHtml(item.tag)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
    </article>
  `).join("");
}

function renderFriendsList() {
  if (!friends.length) {
    $("friend-list").className = "stack-list empty-state";
    $("friend-list").textContent = "No friends saved yet.";
    return;
  }

  $("friend-list").className = "stack-list";
  $("friend-list").innerHTML = friends
    .map((friend) => `
      <article class="stack-item inline-between">
        <div>
          <strong>${escapeHtml(friend.name)}</strong>
          <span class="muted">Saved locally for this browser</span>
        </div>
        <button data-remove-friend="${escapeHtml(friend.name)}" class="ghost">Remove</button>
      </article>
    `)
    .join("");

  $("friend-list").querySelectorAll("[data-remove-friend]").forEach((button) => {
    button.addEventListener("click", () => {
      friends = friends.filter((friend) => friend.name !== button.dataset.removeFriend);
      saveFriends(friends);
      renderFriendsList();
      pushFeed(profile, "Friend removed", `${button.dataset.removeFriend} was removed from your local list.`, "warn");
      renderFeed($("feed"), profile, "Your hub actions will appear here.");
    });
  });
}

function renderSettings() {
  $("setting-sfx").checked = Boolean(settings.sfx);
  $("setting-music").checked = Boolean(settings.music);
  $("setting-compact").checked = Boolean(settings.compact);
  $("setting-chat-theme").value = settings.chatTheme || "ocean";
  document.body.classList.toggle("compact-mode", Boolean(settings.compact));
}

async function refreshStatus() {
  try {
    const [json, contentSnapshot] = await Promise.all([refreshServiceStatus(), loadContentSnapshot()]);
    const services = json?.data?.services || [];
    $("gateway-status").textContent = "Online";
    $("service-status").textContent = summarizeServices(services);
    $("data-source-status").textContent = contentSourceLabel(contentSnapshot);
  } catch (error) {
    $("gateway-status").textContent = "Offline";
    $("service-status").textContent = "Unavailable";
    $("data-source-status").textContent = "Unavailable";
    pushFeed(profile, "Gateway issue", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  }
}

async function refreshCharacters() {
  characters = await loadCharacters(session.accountId);
  if (!profile.selectedCharacterId && characters[0]) {
    profile.selectedCharacterId = characters[0].characterId;
    saveProfile(profile);
  }
  renderHeader();
  renderCharacters();
}

async function refreshChat() {
  try {
    chatMessages = await loadLobbyHistory();
    renderChat($("chat-list"), chatMessages, "No messages in the lobby yet.");
  } catch (error) {
    $("chat-list").className = "chat-list empty-state";
    $("chat-list").textContent = error instanceof Error ? error.message : String(error);
  }
}

async function boot() {
  await requireSessionOrRedirect();
  renderFeed($("feed"), profile, "Your hub actions will appear here.");
  renderNews();
  renderSettings();
  renderFriendsList();
  await refreshStatus();
  await refreshCharacters();
  await refreshChat();

  if (!characters.length) {
    setTab("characters");
    pushFeed(profile, "Character creation ready", "No characters were found, so the hub is focused on creation.", "info");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  }
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

$("refresh-status-btn").addEventListener("click", refreshStatus);

$("reload-characters-btn").addEventListener("click", async () => {
  await refreshCharacters();
  pushFeed(profile, "Roster refreshed", "Character list was refreshed from the service.", "info");
  renderFeed($("feed"), profile, "Your hub actions will appear here.");
});

$("create-character-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("character-name").value.trim();
  const race = $("character-race").value;

  if (!name) return;

  try {
    const created = await createCharacter(session.accountId, name, race);
    profile.selectedCharacterId = created.characterId;
    saveProfile(profile);
    await refreshCharacters();
    pushFeed(profile, "Character created", `${created.name} the ${titleCase(created.race)} is ready.`, "success");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  } catch (error) {
    pushFeed(profile, "Creation failed", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  }
});

$("friend-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("friend-name").value.trim();
  if (!name) return;
  if (!friends.some((friend) => friend.name.toLowerCase() === name.toLowerCase())) {
    friends = [{ name }, ...friends].slice(0, 30);
    saveFriends(friends);
    renderFriendsList();
    pushFeed(profile, "Friend added", `${name} was saved to your local social list.`, "success");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  }
  $("friend-name").value = "";
});

$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = $("chat-input").value.trim();
  if (!content) return;

  try {
    await sendLobbyChat(session.username || session.accountId, content);
    $("chat-input").value = "";
    await refreshChat();
    pushFeed(profile, "Lobby chat", "Your message was sent to the foyer channel.", "info");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  } catch (error) {
    pushFeed(profile, "Chat failed", error instanceof Error ? error.message : String(error), "danger");
    renderFeed($("feed"), profile, "Your hub actions will appear here.");
  }
});

$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  settings = {
    sfx: $("setting-sfx").checked,
    music: $("setting-music").checked,
    compact: $("setting-compact").checked,
    chatTheme: $("setting-chat-theme").value
  };
  saveSettings(settings);
  renderSettings();
  pushFeed(profile, "Settings saved", `Audio and interface preferences were saved with ${settings.chatTheme} chat theme.`, "success");
  renderFeed($("feed"), profile, "Your hub actions will appear here.");
});

$("play-btn").addEventListener("click", () => {
  if (!selectedCharacter(characters, profile)) return;
  window.location.href = "/world.html";
});

$("logout-btn").addEventListener("click", async () => {
  try {
    await api("/api/v1/session/logout", {
      method: "POST",
      body: JSON.stringify({ accessToken: session.accessToken })
    });
  } catch {
    // ignore service race on logout
  }
  localStorage.removeItem("vibecheck.session.v1");
  window.location.href = "/";
});

boot().catch((error) => {
  pushFeed(profile, "Hub failed to load", error instanceof Error ? error.message : String(error), "danger");
  renderFeed($("feed"), profile, "Your hub actions will appear here.");
});
