import {
  AIRTABLE_ACCOUNTS_TABLE,
  SERVICE_VERSION,
  airtableCreateRecord,
  airtableEnabled,
  airtableFindRecordByField,
  airtableUpdateRecord,
  createServiceApp,
  getRequestId,
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

type AccountFields = {
  accountId: string;
  username: string;
  usernameNormalized: string;
  createdAt: string;
  lastLoginAt: string;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function ensureAccount(username: string) {
  const normalized = normalizeUsername(username);
  const fallbackAccountId = normalized === "demo" ? "acc_demo" : `acc_${normalized.replace(/[^a-z0-9_]/g, "_")}`;

  if (!airtableEnabled()) {
    return { accountId: fallbackAccountId, username };
  }

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

app.post("/api/v1/auth/logout", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  sessions.delete(String(req.body?.accessToken ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { loggedOut: true });
});

app.post("/api/v1/auth/refresh", internalAuthRequired(SERVICE_NAME), async (req, res) => {
  const requestId = getRequestId(req);
  const current = Array.from(sessions.values()).find((s) => s.refreshToken === req.body?.refreshToken);
  if (!current) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_REFRESH", "Refresh token not found", 401);
  }
  sessions.delete(current.accessToken);
  try {
    const session = await createSession(current.username);
    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { session });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "ACCOUNT_STORE_ERROR", error instanceof Error ? error.message : "Could not refresh account session", 500);
  }
});

app.post("/api/v1/auth/validate", internalAuthRequired(SERVICE_NAME), (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as ValidateTokenRequest;
  const session = sessions.get(body.accessToken);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { valid: Boolean(session), session: session ?? null });
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

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
