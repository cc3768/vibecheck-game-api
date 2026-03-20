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

async function ensureAccount(username: string) {
  const normalized = normalizeUsername(username);
  const fallbackAccountId = normalized === "demo" ? "acc_demo" : `acc_${normalized.replace(/[^a-z0-9_]/g, "_")}`;

  if (!airtableEnabled()) {
    return { accountId: fallbackAccountId, username };
  }

  await ensureAuthTables();
  const hit = await airtableFindRecordByField<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, "usernameNormalized", normalized);

  if (hit) {
    await airtableUpdateRecord<AccountFields>(AIRTABLE_ACCOUNTS_TABLE, hit.id, {
      lastLoginAt: nowIso(),
      username
    });
    return {
      accountId: String(hit.fields.accountId ?? fallbackAccountId),
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

app.post("/api/v1/auth/login", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as LoginRequest;
  if (!body.username || !body.password) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_LOGIN", "username and password are required", 400);
  }
  try {
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

app.get("/api/v1/account/:accountId/security", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    accountId: req.params.accountId,
    passwordLastChangedAt: nowIso(),
    mfaEnabled: false,
    loginRisk: "LOW"
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

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
