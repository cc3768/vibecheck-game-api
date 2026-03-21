import {
  AIRTABLE_ACCOUNTS_TABLE,
  AIRTABLE_PLAYER_PRESENCE_TABLE,
  AIRTABLE_SESSIONS_TABLE,
  SERVICE_VERSION,
  airtableCreateRecord,
  airtableDeleteRecord,
  airtableEnabled,
  airtableEnsureTable,
  airtableFindRecordByField,
  airtableListRecords,
  airtableUpdateRecord,
  airtableUpsertByField,
  createServiceApp,
  getRequestId,
  getServiceUrl,
  internalAuthRequired,
  makeId,
  nowIso,
  sendError,
  sendSuccess
} from "../../../packages/shared/src/index";
import type { LoginRequest, UserSession, ValidateTokenRequest } from "../../../packages/shared/src/index";

const SERVICE_NAME = "login-system";
const PORT = Number(process.env.LOGIN_SYSTEM_PORT ?? 41731);
const app = createServiceApp(SERVICE_NAME);
const sessions = new Map<string, UserSession>();
let authTablesReady = false;

const accountProfiles = new Map<string, Record<string, unknown>>();
const accountPreferences = new Map<string, Record<string, unknown>>();
const accountDevices = new Map<string, Array<Record<string, unknown>>>();
const accountSecrets = new Map<string, Record<string, unknown>>();
const deleteRequests = new Map<string, Record<string, unknown>>();


type AccountFields = {
  accountId: string;
  username: string;
  usernameNormalized: string;
  createdAt: string;
  lastLoginAt: string;
};

type SessionFields = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  username: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

function defaultProfile(accountId: string, username: string) {
  return {
    accountId,
    username,
    displayName: username,
    email: "",
    bio: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function ensureProfile(accountId: string, username: string, patch?: Record<string, unknown>) {
  const current = accountProfiles.get(accountId) ?? defaultProfile(accountId, username);
  const next = {
    ...current,
    ...patch,
    accountId,
    username: String(patch?.username ?? current.username ?? username),
    displayName: String(patch?.displayName ?? current.displayName ?? username),
    email: String(patch?.email ?? current.email ?? ""),
    updatedAt: nowIso()
  };
  accountProfiles.set(accountId, next);
  return next;
}

function ensurePreferences(accountId: string) {
  const current = accountPreferences.get(accountId) ?? {
    theme: "system",
    sharePresence: true,
    allowDirectMessages: true,
    tutorialHints: true,
    updatedAt: nowIso()
  };
  accountPreferences.set(accountId, current);
  return current;
}

function ensureSecretState(accountId: string, patch?: Record<string, unknown>) {
  const current = accountSecrets.get(accountId) ?? {
    password: "dev-password",
    emailVerified: false,
    verificationToken: "",
    resetToken: "",
    mfaEnabled: false,
    mfaSecret: "",
    mfaVerifiedAt: "",
    consent: { telemetry: true, aiContent: true, marketingEmail: false },
    updatedAt: nowIso()
  };
  const next = { ...current, ...(patch ?? {}), updatedAt: nowIso() };
  accountSecrets.set(accountId, next);
  return next;
}

function publicSessionShape(session: UserSession) {
  return {
    sessionId: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accountId: session.accountId,
    username: session.username,
    expiresAt: session.expiresAt
  };
}

function escapeFormulaValue(value: string) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function ensureAuthTables() {
  if (!airtableEnabled() || authTablesReady) return;

  await Promise.all([
    airtableEnsureTable(AIRTABLE_ACCOUNTS_TABLE, [
      { name: "accountId", type: "singleLineText" },
      { name: "username", type: "singleLineText" },
      { name: "usernameNormalized", type: "singleLineText" },
      { name: "createdAt", type: "singleLineText" },
      { name: "lastLoginAt", type: "singleLineText" }
    ]),
    airtableEnsureTable(AIRTABLE_SESSIONS_TABLE, [
      { name: "accessToken", type: "singleLineText" },
      { name: "refreshToken", type: "singleLineText" },
      { name: "accountId", type: "singleLineText" },
      { name: "username", type: "singleLineText" },
      { name: "expiresAt", type: "singleLineText" },
      { name: "createdAt", type: "singleLineText" },
      { name: "updatedAt", type: "singleLineText" }
    ]),
    airtableEnsureTable(AIRTABLE_PLAYER_PRESENCE_TABLE, [
      { name: "presenceKey", type: "singleLineText" },
      { name: "characterId", type: "singleLineText" },
      { name: "accountId", type: "singleLineText" },
      { name: "worldId", type: "singleLineText" },
      { name: "regionId", type: "singleLineText" },
      { name: "x", type: "number", options: { precision: 0 } },
      { name: "y", type: "number", options: { precision: 0 } },
      { name: "z", type: "number", options: { precision: 0 } },
      { name: "updatedAt", type: "singleLineText" }
    ])
  ]);

  authTablesReady = true;
}

async function accountByUsernameNormalized(normalized: string) {
  if (!airtableEnabled()) {
    const profile = Array.from(accountProfiles.values()).find((entry) => normalizeUsername(String(entry.username ?? "")) === normalized) ?? null;
    return profile
      ? { accountId: String(profile.accountId ?? ""), username: String(profile.username ?? "") }
      : null;
  }

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, "usernameNormalized", normalized);
  if (!hit) return null;
  return {
    accountId: String(hit.fields.accountId ?? ""),
    username: String(hit.fields.username ?? "")
  };
}

async function accountById(accountId: string) {
  const inMemory = accountProfiles.get(accountId);
  if (inMemory) {
    return {
      accountId,
      username: String(inMemory.username ?? ""),
      profile: inMemory
    };
  }

  if (!airtableEnabled()) return null;
  await ensureAuthTables();
  const hit = await airtableFindRecordByField<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, "accountId", accountId);
  if (!hit) return null;
  const username = String(hit.fields.username ?? "");
  const profile = ensureProfile(accountId, username, {
    createdAt: String(hit.fields.createdAt ?? nowIso()),
    updatedAt: nowIso()
  });
  return { accountId, username, profile };
}

async function ensureAccount(username: string) {
  const normalized = normalizeUsername(username);
  const fallbackAccountId = normalized === "demo" ? "acc_demo" : `acc_${normalized.replace(/[^a-z0-9_]/g, "_")}`;

  if (!airtableEnabled()) {
    ensureProfile(fallbackAccountId, username);
    ensurePreferences(fallbackAccountId);
    ensureSecretState(fallbackAccountId);
    return { accountId: fallbackAccountId, username };
  }

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, "usernameNormalized", normalized);

  if (hit) {
    await airtableUpdateRecord<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, hit.id, {
      lastLoginAt: nowIso(),
      username
    });
    const accountId = String(hit.fields.accountId ?? fallbackAccountId);
    ensureProfile(accountId, String(hit.fields.username ?? username));
    ensurePreferences(accountId);
    ensureSecretState(accountId);
    return {
      accountId,
      username: String(hit.fields.username ?? username)
    };
  }

  const created = await airtableCreateRecord<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, {
    accountId: fallbackAccountId,
    username,
    usernameNormalized: normalized,
    createdAt: nowIso(),
    lastLoginAt: nowIso()
  });

  ensureProfile(fallbackAccountId, username, { createdAt: String(created.fields.createdAt ?? nowIso()) });
  ensurePreferences(fallbackAccountId);
  ensureSecretState(fallbackAccountId);

  return {
    accountId: String(created.fields.accountId ?? fallbackAccountId),
    username: String(created.fields.username ?? username)
  };
}

async function persistSession(session: UserSession) {
  if (!airtableEnabled()) return;
  await ensureAuthTables();
  await airtableUpsertByField<SessionFields>(AIRTABLE_SESSIONS_TABLE, "accessToken", session.accessToken, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accountId: session.accountId,
    username: session.username,
    expiresAt: session.expiresAt,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

async function sessionByAccessToken(accessToken: string) {
  const cacheHit = sessions.get(accessToken);
  if (cacheHit) return cacheHit;
  if (!airtableEnabled() || !accessToken) return null;

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<SessionFields>(AIRTABLE_SESSIONS_TABLE, "accessToken", accessToken);
  if (!hit) return null;

  const session: UserSession = {
    accountId: String(hit.fields.accountId ?? ""),
    username: String(hit.fields.username ?? ""),
    accessToken: String(hit.fields.accessToken ?? accessToken),
    refreshToken: String(hit.fields.refreshToken ?? ""),
    expiresAt: String(hit.fields.expiresAt ?? nowIso())
  };

  sessions.set(session.accessToken, session);
  return session;
}

async function sessionByRefreshToken(refreshToken: string) {
  const cacheHit = Array.from(sessions.values()).find((s) => s.refreshToken === refreshToken);
  if (cacheHit) return cacheHit;
  if (!airtableEnabled() || !refreshToken) return null;

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<SessionFields>(AIRTABLE_SESSIONS_TABLE, "refreshToken", refreshToken);
  if (!hit) return null;

  const session: UserSession = {
    accountId: String(hit.fields.accountId ?? ""),
    username: String(hit.fields.username ?? ""),
    accessToken: String(hit.fields.accessToken ?? ""),
    refreshToken: String(hit.fields.refreshToken ?? refreshToken),
    expiresAt: String(hit.fields.expiresAt ?? nowIso())
  };

  sessions.set(session.accessToken, session);
  return session;
}

async function listSessionsForAccount(accountId: string) {
  const combined = Array.from(sessions.values()).filter((session) => session.accountId === accountId);
  if (airtableEnabled()) {
    await ensureAuthTables();
    const result = await airtableListRecords<SessionFields>(AIRTABLE_SESSIONS_TABLE, {
      filterByFormula: `{accountId}='${escapeFormulaValue(accountId)}'`
    });
    for (const record of result.records) {
      const session: UserSession = {
        accountId: String(record.fields.accountId ?? accountId),
        username: String(record.fields.username ?? ""),
        accessToken: String(record.fields.accessToken ?? ""),
        refreshToken: String(record.fields.refreshToken ?? ""),
        expiresAt: String(record.fields.expiresAt ?? nowIso())
      };
      if (!combined.some((entry) => entry.accessToken === session.accessToken)) combined.push(session);
      sessions.set(session.accessToken, session);
    }
  }
  return combined.map(publicSessionShape);
}

async function deleteSession(accessToken: string) {
  sessions.delete(accessToken);
  if (!airtableEnabled() || !accessToken) return;

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<SessionFields>(AIRTABLE_SESSIONS_TABLE, "accessToken", accessToken);
  if (hit) {
    await airtableDeleteRecord(AIRTABLE_SESSIONS_TABLE, hit.id);
  }
}

async function createSession(username: string): Promise<UserSession> {
  const account = await ensureAccount(username);
  const session: UserSession = {
    accountId: account.accountId,
    username: account.username,
    accessToken: makeId("atk"),
    refreshToken: makeId("rtk"),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString()
  };
  sessions.set(session.accessToken, session);
  await persistSession(session);
  return session;
}

async function listPresenceByWorld(worldId: string) {
  if (!airtableEnabled()) {
    try {
      const upstream = await fetch(`${getServiceUrl("world-system")}/api/v1/world/presence/world/${encodeURIComponent(worldId)}`, {
        headers: { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token" }
      });
      const payload = (await upstream.json()) as { data?: { players?: Array<Record<string, unknown>> } };
      return payload?.data?.players ?? [];
    } catch {
      return [];
    }
  }

  await ensureAuthTables();
  const result = await airtableListRecords<Record<string, unknown>>(AIRTABLE_PLAYER_PRESENCE_TABLE, {
    filterByFormula: `{worldId}='${escapeFormulaValue(worldId)}'`
  });
  const freshnessMs = 1000 * 60 * 2;
  return result.records
    .map((record) => ({
      presenceKey: String(record.fields.presenceKey ?? record.fields.characterId ?? record.id),
      characterId: String(record.fields.characterId ?? ""),
      accountId: String(record.fields.accountId ?? ""),
      worldId: String(record.fields.worldId ?? worldId),
      regionId: String(record.fields.regionId ?? "starter_lowlands"),
      x: Number(record.fields.x ?? 0),
      y: Number(record.fields.y ?? 0),
      z: Number(record.fields.z ?? 0),
      updatedAt: String(record.fields.updatedAt ?? nowIso())
    }))
    .filter((entry) => Date.now() - new Date(entry.updatedAt).getTime() <= freshnessMs);
}

app.post("/api/v1/auth/register", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as LoginRequest & { email?: string; displayName?: string };
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const email = normalizeEmail(String(body.email ?? ""));
  const displayName = String(body.displayName ?? username).trim();

  if (!username || !password) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_REGISTER", "username and password are required", 400);
  }

  const normalized = normalizeUsername(username);
  const existing = await accountByUsernameNormalized(normalized);
  if (existing) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "USERNAME_TAKEN", "That username is already in use", 409);
  }

  const emailTaken = email && Array.from(accountProfiles.values()).some((entry) => normalizeEmail(String(entry.email ?? "")) === email);
  if (emailTaken) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "EMAIL_TAKEN", "That email is already in use", 409);
  }

  const account = await ensureAccount(username);
  const verificationToken = makeId("verify");
  ensureProfile(account.accountId, account.username, { displayName, email });
  ensurePreferences(account.accountId);
  ensureSecretState(account.accountId, { password, verificationToken, emailVerified: false });
  const session = await createSession(account.username);

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    registered: true,
    account: {
      accountId: account.accountId,
      username: account.username,
      profile: accountProfiles.get(account.accountId) ?? null
    },
    session,
    verificationRequested: Boolean(email)
  }, 201);
});

app.post("/api/v1/auth/check-username", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const username = normalizeUsername(String(req.body?.username ?? ""));
  const existing = username ? await accountByUsernameNormalized(username) : null;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { username, available: Boolean(username) && !existing });
});

app.post("/api/v1/auth/check-email", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const email = normalizeEmail(String(req.body?.email ?? ""));
  const available = Boolean(email) && !Array.from(accountProfiles.values()).some((entry) => normalizeEmail(String(entry.email ?? "")) === email);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { email, available });
});

app.post("/api/v1/auth/check-display-name", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const displayName = String(req.body?.displayName ?? "").trim().toLowerCase();
  const available = Boolean(displayName) && !Array.from(accountProfiles.values()).some((entry) => String(entry.displayName ?? "").trim().toLowerCase() === displayName);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { displayName, available });
});

app.post("/api/v1/auth/login", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as LoginRequest;
  if (!body.username || !body.password) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_LOGIN", "username and password are required", 400);
  }

  try {
    const normalized = normalizeUsername(body.username);
    const existing = await accountByUsernameNormalized(normalized);
    if (existing) {
      const secret = ensureSecretState(existing.accountId);
      const storedPassword = String(secret.password ?? "dev-password");
      if (storedPassword && storedPassword !== String(body.password)) {
        return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_CREDENTIALS", "Username or password is incorrect", 401);
      }
    }
    const session = await createSession(body.username);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { session });
  } catch (error) {
    sendError(
      res,
      SERVICE_NAME,
      SERVICE_VERSION,
      requestId,
      "ACCOUNT_STORE_ERROR",
      error instanceof Error ? error.message : "Could not create or load the account",
      500
    );
  }
});

app.post("/api/v1/auth/logout", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  await deleteSession(String(req.body?.accessToken ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { loggedOut: true });
});

app.post("/api/v1/auth/refresh", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const current = await sessionByRefreshToken(String(req.body?.refreshToken ?? ""));
  if (!current) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_REFRESH", "Refresh token not found", 401);
  }

  await deleteSession(current.accessToken);
  try {
    const session = await createSession(current.username);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { session });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_STORE_ERROR", error instanceof Error ? error.message : "Could not refresh account session", 500);
  }
});

app.post("/api/v1/auth/validate", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as ValidateTokenRequest;
  const session = await sessionByAccessToken(body.accessToken);
  const isExpired = session ? new Date(session.expiresAt).getTime() <= Date.now() : true;
  if (session && isExpired) {
    await deleteSession(session.accessToken);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { valid: Boolean(session) && !isExpired, session: session && !isExpired ? session : null });
});

app.post("/api/v1/auth/validate-character-owner", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const owner = String(req.body?.accountId ?? "").startsWith("acc_") && String(req.body?.characterId ?? "").startsWith("char_");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { owner });
});

app.get("/api/v1/account/:accountId/profile", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const account = await accountById(String(req.params.accountId ?? ""));
  if (!account) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_NOT_FOUND", "Account not found", 404);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { profile: ensureProfile(account.accountId, account.username) });
});

app.patch("/api/v1/account/:accountId/profile", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const account = await accountById(String(req.params.accountId ?? ""));
  if (!account) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_NOT_FOUND", "Account not found", 404);
  }
  const profile = ensureProfile(account.accountId, account.username, req.body ?? {});
  if (profile.email) ensureSecretState(account.accountId, { emailVerified: false });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { profile });
});

app.get("/api/v1/account/:accountId/preferences", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const account = await accountById(String(req.params.accountId ?? ""));
  if (!account) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_NOT_FOUND", "Account not found", 404);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { preferences: ensurePreferences(account.accountId) });
});

app.patch("/api/v1/account/:accountId/preferences", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const account = await accountById(String(req.params.accountId ?? ""));
  if (!account) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_NOT_FOUND", "Account not found", 404);
  }
  const preferences = { ...ensurePreferences(account.accountId), ...(req.body ?? {}), updatedAt: nowIso() };
  accountPreferences.set(account.accountId, preferences);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { preferences });
});

app.get("/api/v1/account/:accountId/sessions", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const sessionsForAccount = await listSessionsForAccount(String(req.params.accountId ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { sessions: sessionsForAccount, count: sessionsForAccount.length });
});

app.delete("/api/v1/account/:accountId/sessions/:sessionId", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const sessionId = String(req.params.sessionId ?? "");
  const hit = await sessionByAccessToken(sessionId);
  if (hit && hit.accountId !== req.params.accountId) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "SESSION_ACCOUNT_MISMATCH", "Session does not belong to that account", 409);
  }
  await deleteSession(sessionId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revoked: true, sessionId });
});

app.post("/api/v1/auth/device/register", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const device = {
    deviceId: String(req.body?.deviceId ?? makeId("device")),
    label: String(req.body?.label ?? req.body?.deviceName ?? "Trusted Device"),
    platform: String(req.body?.platform ?? "unknown"),
    trustedAt: nowIso(),
    lastSeenAt: nowIso()
  };
  const devices = accountDevices.get(accountId) ?? [];
  const next = [...devices.filter((entry) => String(entry.deviceId ?? "") !== device.deviceId), device];
  accountDevices.set(accountId, next);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { registered: true, device, devices: next });
});

app.post("/api/v1/auth/device/revoke", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const deviceId = String(req.body?.deviceId ?? "");
  const devices = (accountDevices.get(accountId) ?? []).filter((entry) => String(entry.deviceId ?? "") !== deviceId);
  accountDevices.set(accountId, devices);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revoked: true, deviceId, devices });
});

app.get("/api/v1/auth/devices/:accountId", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const devices = accountDevices.get(String(req.params.accountId ?? "")) ?? [];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { devices, count: devices.length });
});

app.post("/api/v1/auth/request-password-reset", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const username = normalizeUsername(String(req.body?.username ?? ""));
  const account = username ? await accountByUsernameNormalized(username) : null;
  const token = account ? makeId("reset") : "";
  if (account) ensureSecretState(account.accountId, { resetToken: token });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { requested: true, token: token || null });
});

app.post("/api/v1/auth/reset-password", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");
  const entry = Array.from(accountSecrets.entries()).find(([, value]) => String(value.resetToken ?? "") === token) ?? null;
  if (!entry || !password) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "RESET_INVALID", "Reset token or password is invalid", 400);
  }
  ensureSecretState(entry[0], { password, resetToken: "" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { reset: true, accountId: entry[0] });
});

app.post("/api/v1/auth/change-password", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  const secret = ensureSecretState(accountId);
  if (String(secret.password ?? "dev-password") !== currentPassword) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "PASSWORD_MISMATCH", "Current password does not match", 401);
  }
  ensureSecretState(accountId, { password: newPassword });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { changed: true, passwordLastChangedAt: nowIso() });
});

app.post("/api/v1/auth/verify-email/request", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const token = makeId("verify");
  ensureSecretState(accountId, { verificationToken: token, emailVerified: false });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { requested: true, token });
});

app.post("/api/v1/auth/verify-email/confirm", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const token = String(req.body?.token ?? "");
  const entry = Array.from(accountSecrets.entries()).find(([, value]) => String(value.verificationToken ?? "") === token) ?? null;
  if (!entry) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "VERIFY_INVALID", "Verification token is invalid", 400);
  }
  ensureSecretState(entry[0], { emailVerified: true, verificationToken: "" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { verified: true, accountId: entry[0] });
});

app.post("/api/v1/account/:accountId/consent", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.params.accountId ?? "");
  const secret = ensureSecretState(accountId);
  const consent = { ...(secret.consent as Record<string, unknown>), ...(req.body ?? {}), updatedAt: nowIso() };
  ensureSecretState(accountId, { consent });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { consent });
});

app.get("/api/v1/account/:accountId/consent", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const secret = ensureSecretState(String(req.params.accountId ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { consent: secret.consent ?? {} });
});

app.post("/api/v1/account/:accountId/delete-request", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.params.accountId ?? "");
  const payload = {
    accountId,
    requestedAt: nowIso(),
    reason: String(req.body?.reason ?? ""),
    status: "pending"
  };
  deleteRequests.set(accountId, payload);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { deleteRequest: payload });
});

app.post("/api/v1/auth/mfa/setup", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const secret = makeId("mfa");
  ensureSecretState(accountId, { mfaSecret: secret, mfaEnabled: false, mfaVerifiedAt: "" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { setup: true, secret, otpauthUri: `otpauth://totp/Vibecheck:${accountId}?secret=${secret}&issuer=Vibecheck` });
});

app.post("/api/v1/auth/mfa/verify", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  const code = String(req.body?.code ?? "");
  if (!code || code.length < 4) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "MFA_CODE_INVALID", "MFA code is invalid", 400);
  }
  ensureSecretState(accountId, { mfaEnabled: true, mfaVerifiedAt: nowIso() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { verified: true, mfaEnabled: true });
});

app.post("/api/v1/auth/mfa/disable", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.body?.accountId ?? "");
  ensureSecretState(accountId, { mfaEnabled: false, mfaSecret: "", mfaVerifiedAt: "" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { disabled: true });
});

app.get("/api/v1/account/:accountId/security", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const accountId = String(req.params.accountId ?? "");
  const secret = ensureSecretState(accountId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    accountId,
    passwordLastChangedAt: String(secret.updatedAt ?? nowIso()),
    mfaEnabled: Boolean(secret.mfaEnabled ?? false),
    loginRisk: "LOW",
    emailVerified: Boolean(secret.emailVerified ?? false)
  });
});

app.get("/api/v1/auth/active-players/:regionId", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.query.worldId ?? "world_prime");
  const regionId = String(req.params.regionId ?? "starter_lowlands");

  if (airtableEnabled()) {
    try {
      await ensureAuthTables();
      const formula = `AND({worldId}='${worldId.replaceAll("'", "\\'")}',{regionId}='${regionId.replaceAll("'", "\\'")}')`;
      const result = await airtableListRecords<Record<string, unknown>>(AIRTABLE_PLAYER_PRESENCE_TABLE, { filterByFormula: formula });
      const freshnessMs = 1000 * 60 * 2;
      const players = result.records
        .map((record) => ({
          characterId: String(record.fields.characterId ?? ""),
          accountId: String(record.fields.accountId ?? ""),
          worldId: String(record.fields.worldId ?? worldId),
          regionId: String(record.fields.regionId ?? regionId),
          x: Number(record.fields.x ?? 0),
          y: Number(record.fields.y ?? 0),
          z: Number(record.fields.z ?? 0),
          updatedAt: String(record.fields.updatedAt ?? nowIso())
        }))
        .filter((entry) => Date.now() - new Date(entry.updatedAt).getTime() <= freshnessMs);

      if (players.length > 0) {
        return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
          worldId,
          regionId,
          count: players.length,
          players
        });
      }

      console.log(`[${SERVICE_NAME}] Airtable active-player query returned no fresh rows for ${worldId}/${regionId}; falling back to world-system`);
    } catch (error) {
      console.warn(
        `[${SERVICE_NAME}] Airtable active-player query failed; falling back to world-system`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  try {
    const upstream = await fetch(`${getServiceUrl("world-system")}/api/v1/world/presence/region/${regionId}?worldId=${encodeURIComponent(worldId)}`, {
      headers: {
        "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token"
      }
    });
    const payload = (await upstream.json()) as { success?: boolean; data?: { players?: Array<Record<string, unknown>> } };
    const players = (payload?.data?.players ?? []).map((entry) => ({
      characterId: String(entry.characterId ?? ""),
      accountId: String(entry.accountId ?? ""),
      worldId: String(entry.worldId ?? worldId),
      regionId: String(entry.regionId ?? regionId),
      x: Number(entry.x ?? 0),
      y: Number(entry.y ?? 0),
      z: Number(entry.z ?? 0),
      updatedAt: String(entry.updatedAt ?? nowIso())
    }));

    return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      worldId,
      regionId,
      count: players.length,
      players
    });
  } catch (error) {
    console.warn(
      `[${SERVICE_NAME}] world-system fallback failed for active players`,
      error instanceof Error ? error.message : String(error)
    );
    return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      worldId,
      regionId,
      count: 0,
      players: []
    });
  }
});

app.get("/api/v1/session/active-players/world/:worldId", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.params.worldId ?? "world_prime");
  const players = await listPresenceByWorld(worldId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { worldId, count: players.length, players });
});

app.get("/api/v1/session/active-players/chunk/:chunkId", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.query.worldId ?? "world_prime");
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const chunkId = String(req.params.chunkId ?? "0:0");
  const [rawChunkX, rawChunkY] = chunkId.split(":");
  const chunkX = Number(rawChunkX ?? 0);
  const chunkY = Number(rawChunkY ?? 0);
  const players = (await listPresenceByWorld(worldId)).filter((entry) => String(entry.regionId ?? "") === regionId && Math.floor(Number(entry.x ?? 0) / 12) === chunkX && Math.floor(Number(entry.y ?? 0) / 12) === chunkY);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { worldId, regionId, chunkId, chunkX, chunkY, count: players.length, players });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
