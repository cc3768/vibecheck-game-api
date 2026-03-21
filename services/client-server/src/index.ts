import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICES, SERVICE_VERSION, createServiceApp, errorEnvelope, getRequestId, getServiceUrl, sendError, sendSuccess } from "../../../packages/shared/src/index";
import type { HeartbeatRequest, LoginRequest, ServiceStatusSnapshot } from "../../../packages/shared/src/index";

const SERVICE_NAME = "client-server";
const PORT = 41730;
const app = createServiceApp(SERVICE_NAME);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);

async function forward(targetService: string, routePath: string, method: string, requestId: string, body?: unknown, auth?: string) {
  const url = `${getServiceUrl(targetService)}${routePath}`;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token",
          ...(auth ? { Authorization: auth } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });

      const raw = await response.text();
      let json: unknown;

      if (!raw.trim()) {
        json = response.ok
          ? { success: true, requestId, service: targetService, version: SERVICE_VERSION, data: null, error: null, timestamp: new Date().toISOString() }
          : errorEnvelope(targetService, SERVICE_VERSION, requestId, "UPSTREAM_EMPTY_RESPONSE", `Upstream service ${targetService} returned an empty response body`, { url, method }, true);
      } else {
        try {
          json = JSON.parse(raw);
        } catch {
          json = response.ok
            ? { success: true, requestId, service: targetService, version: SERVICE_VERSION, data: { raw }, error: null, timestamp: new Date().toISOString() }
            : errorEnvelope(targetService, SERVICE_VERSION, requestId, "UPSTREAM_INVALID_JSON", `Upstream service ${targetService} returned invalid JSON`, { url, method, raw }, true);
        }
      }

      return { status: response.status, json };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(200 * attempt);
        continue;
      }
    }
  }

  return {
    status: 502,
    json: errorEnvelope(
      SERVICE_NAME,
      SERVICE_VERSION,
      requestId,
      "UPSTREAM_UNAVAILABLE",
      `Could not reach ${targetService}`,
      {
        targetService,
        routePath,
        method,
        reason: lastError instanceof Error ? lastError.message : String(lastError)
      },
      true
    )
  };
}

app.use(express.static(publicDir));

app.post("/api/v1/session/login", asyncRoute(async (req, res) => {
  const result = await forward("login-system", "/api/v1/auth/login", "POST", getRequestId(req), req.body as LoginRequest);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/session/register", asyncRoute(async (req, res) => {
  const requestId = getRequestId(req);
  let result = await forward("login-system", "/api/v1/auth/register", "POST", requestId, req.body as LoginRequest);
  const errorCode = (result.json as { error?: { code?: string } })?.error?.code;
  if (result.status === 404 || errorCode === "UPSTREAM_EMPTY_RESPONSE" || errorCode === "UPSTREAM_INVALID_JSON") {
    result = await forward("login-system", "/api/v1/auth/login", "POST", requestId, req.body as LoginRequest);
  }
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/session/logout", asyncRoute(async (req, res) => {
  const result = await forward("login-system", "/api/v1/auth/logout", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/session/heartbeat", (req, res) => {
  const requestId = getRequestId(req);
  const body = req.body as HeartbeatRequest;
  if (!body.accountId || !body.accessToken) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_HEARTBEAT", "accountId and accessToken are required", 400);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    alive: true,
    checkedAt: new Date().toISOString(),
    accountId: body.accountId
  });
});

app.get("/api/v1/session/me", asyncRoute(async (req, res) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? String(req.query.accessToken ?? "");
  const result = await forward("login-system", "/api/v1/auth/validate", "POST", getRequestId(req), { accessToken: token }, req.header("authorization") ?? undefined);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/session/active-players/:regionId", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({ worldId: String(req.query.worldId ?? "world_prime") });
  const result = await forward("login-system", `/api/v1/auth/active-players/${req.params.regionId}?${query.toString()}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/character/create", asyncRoute(async (req, res) => {
  const result = await forward("character-system", "/api/v1/character/create", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/character/load-by-account", asyncRoute(async (req, res) => {
  const result = await forward("character-system", "/api/v1/character/load-by-account", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/character/apply-xp", asyncRoute(async (req, res) => {
  const result = await forward("character-system", "/api/v1/character/apply-xp", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/character/:characterId", asyncRoute(async (req, res) => {
  const result = await forward("character-system", `/api/v1/character/${req.params.characterId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/character/:characterId/stats", asyncRoute(async (req, res) => {
  const result = await forward("character-system", `/api/v1/character/${req.params.characterId}/stats`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/character/:characterId/skills", asyncRoute(async (req, res) => {
  const result = await forward("character-system", `/api/v1/character/${req.params.characterId}/skills`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/character/:characterId/knowledge", asyncRoute(async (req, res) => {
  const result = await forward("character-system", `/api/v1/character/${req.params.characterId}/knowledge`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));


app.post("/api/v1/world/bootstrap", asyncRoute(async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.body?.worldId ?? "world_prime");
  const regionId = String(req.body?.regionId ?? "starter_lowlands");
  const characterId = String(req.body?.characterId ?? "");
  const size = Number(req.body?.size ?? 12);
  const x = Number(req.body?.x ?? 0);
  const y = Number(req.body?.y ?? 0);

  if (!characterId) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "INVALID_BOOTSTRAP", "characterId is required", 400);
  }

  const chunkX = Math.floor(x / size);
  const chunkY = Math.floor(y / size);

  const [characterResult, statsResult, regionResult, chunkResult] = await Promise.all([
    forward("character-system", `/api/v1/character/${characterId}`, "GET", requestId, undefined, req.header("authorization") ?? undefined),
    forward("character-system", `/api/v1/character/${characterId}/stats`, "GET", requestId, undefined, req.header("authorization") ?? undefined),
    forward("world-system", `/api/v1/world/${worldId}/region/${regionId}`, "GET", requestId, undefined, req.header("authorization") ?? undefined),
    forward("world-system", `/api/v1/world/${worldId}/chunk?regionId=${encodeURIComponent(regionId)}&chunkX=${chunkX}&chunkY=${chunkY}&size=${size}`, "GET", requestId, undefined, req.header("authorization") ?? undefined)
  ]);

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    character: (characterResult.json as any)?.data?.character || null,
    stats: (statsResult.json as any)?.data?.stats || {
      vitals: (statsResult.json as any)?.data?.vitals || null,
      inventory: (statsResult.json as any)?.data?.inventory || null
    },
    region: (regionResult.json as any)?.data?.region || (regionResult.json as any)?.data || null,
    chunk: (chunkResult.json as any)?.data?.chunk || (chunkResult.json as any)?.data || null,
    source: {
      character: characterResult.status,
      stats: statsResult.status,
      region: regionResult.status,
      chunk: chunkResult.status
    }
  });
}));

app.get("/api/v1/world/spawn/:characterId", asyncRoute(async (req, res) => {
  const result = await forward("world-system", `/api/v1/world/spawn/${req.params.characterId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/presence/update", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/presence/update", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/world/presence/region/:regionId", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({ worldId: String(req.query.worldId ?? "world_prime") });
  const result = await forward("world-system", `/api/v1/world/presence/region/${req.params.regionId}?${query.toString()}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/world/:worldId/region/:regionId", asyncRoute(async (req, res) => {
  const result = await forward("world-system", `/api/v1/world/${req.params.worldId}/region/${req.params.regionId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/world/:worldId/tile", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({
    x: String(req.query.x ?? 0),
    y: String(req.query.y ?? 0),
    regionId: String(req.query.regionId ?? "starter_lowlands")
  });
  const result = await forward("world-system", `/api/v1/world/${req.params.worldId}/tile?${query.toString()}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/world/:worldId/chunk", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({
    regionId: String(req.query.regionId ?? "starter_lowlands"),
    chunkX: String(req.query.chunkX ?? 0),
    chunkY: String(req.query.chunkY ?? 0),
    size: String(req.query.size ?? 12)
  });
  const result = await forward("world-system", `/api/v1/world/${req.params.worldId}/chunk?${query.toString()}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({
    size: String(req.query.size ?? 12),
    z: String(req.query.z ?? 0)
  });
  const result = await forward(
    "world-system",
    `/api/v1/world/${req.params.worldId}/region/${req.params.regionId}/tile/${req.params.tileX}/${req.params.tileY}/detail?${query.toString()}`,
    "GET",
    getRequestId(req)
  );
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/query-position", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/query-position", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/query-resource", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/query-resource", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/place-structure", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/place-structure", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/remove-structure", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/remove-structure", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/world/environment/context", asyncRoute(async (req, res) => {
  const result = await forward("world-system", "/api/v1/world/environment/context", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/npc/nearby", asyncRoute(async (req, res) => {
  const query = new URLSearchParams({ regionId: String(req.query.regionId ?? "starter_lowlands") });
  const result = await forward("npc-system", `/api/v1/npc/nearby?${query.toString()}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/npc/:npcId", asyncRoute(async (req, res) => {
  const result = await forward("npc-system", `/api/v1/npc/${req.params.npcId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/npc/interact", asyncRoute(async (req, res) => {
  const result = await forward("npc-system", "/api/v1/npc/interact", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/quest/offer-from-npc", asyncRoute(async (req, res) => {
  const result = await forward("quest-system", "/api/v1/quest/offer-from-npc", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/quest/:questId", asyncRoute(async (req, res) => {
  const result = await forward("quest-system", `/api/v1/quest/${req.params.questId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/quest/active/:characterId", asyncRoute(async (req, res) => {
  const result = await forward("quest-system", `/api/v1/quest/active/${req.params.characterId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/rewards/from-quest", asyncRoute(async (req, res) => {
  const result = await forward("rewards-system", "/api/v1/rewards/from-quest", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/rewards/from-npc", asyncRoute(async (req, res) => {
  const result = await forward("rewards-system", "/api/v1/rewards/from-npc", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/rewards/grant", asyncRoute(async (req, res) => {
  const result = await forward("rewards-system", "/api/v1/rewards/grant", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/actions/history/:characterId", asyncRoute(async (req, res) => {
  const result = await forward("action-system", `/api/v1/actions/history/${req.params.characterId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/intake", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/intake", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/group-window", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/group-window", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/summarize", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/summarize", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/infer-skills", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/infer-skills", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/check", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/check", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/resolve-queue", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/resolve-queue", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/actions/submit-to-xp", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/submit-to-xp", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/xp/preview", asyncRoute(async (req, res) => {
  const result = await forward("xp-system", "/api/v1/xp/preview", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/production/craft", asyncRoute(async (req, res) => {
  const result = await forward("production-system", "/api/v1/production/craft", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/production/validate", asyncRoute(async (req, res) => {
  const result = await forward("production-system", "/api/v1/production/validate", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/production/discover", asyncRoute(async (req, res) => {
  const result = await forward("production-system", "/api/v1/production/discover", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/production/recipe/:recipeKey", asyncRoute(async (req, res) => {
  const result = await forward("production-system", `/api/v1/production/recipe/${req.params.recipeKey}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/combat/encounter/:encounterId", asyncRoute(async (req, res) => {
  const result = await forward("combat-system", `/api/v1/combat/encounter/${req.params.encounterId}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/router/action", asyncRoute(async (req, res) => {
  const result = await forward("action-system", "/api/v1/actions/intake", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/router/dialogue", asyncRoute(async (req, res) => {
  const result = await forward("npc-system", "/api/v1/npc/dialogue", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/router/quest", asyncRoute(async (req, res) => {
  const event = String(req.body?.event ?? "PROGRESS").toUpperCase();
  const routePath = event === "ACCEPT" ? "/api/v1/quest/accept" : event === "COMPLETE" ? "/api/v1/quest/complete" : "/api/v1/quest/progress";
  const payload = event === "PROGRESS"
    ? { characterId: req.body?.characterId, questId: req.body?.questId, objectiveKey: req.body?.payload?.objectiveKey ?? "gather_wood", increment: Number(req.body?.payload?.increment ?? 1) }
    : { characterId: req.body?.characterId, questId: req.body?.questId };
  const result = await forward("quest-system", routePath, "POST", getRequestId(req), payload);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/router/combat", asyncRoute(async (req, res) => {
  const action = String(req.body?.action ?? "START").toUpperCase();
  const routePath = action === "START" ? "/api/v1/combat/start" : action === "RESOLVE" ? "/api/v1/combat/resolve" : action === "RETREAT" ? "/api/v1/combat/retreat" : "/api/v1/combat/action";
  const payload = action === "START"
    ? { characterId: req.body?.characterId, targetNpcId: req.body?.targetNpcId ?? "npc_guard_lyra" }
    : action === "RESOLVE"
      ? { encounterId: req.body?.encounterId }
      : action === "RETREAT"
        ? { encounterId: req.body?.encounterId, actorId: req.body?.characterId }
        : { encounterId: req.body?.encounterId, actorId: req.body?.characterId, action: "ATTACK", targetId: req.body?.targetNpcId };
  const result = await forward("combat-system", routePath, "POST", getRequestId(req), payload);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/ai/generate-dialogue", asyncRoute(async (req, res) => {
  const result = await forward("ai-system", "/api/v1/ai/generate-dialogue", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/ai/classify-actions", asyncRoute(async (req, res) => {
  const result = await forward("ai-system", "/api/v1/ai/classify-actions", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/ai/suggest-skill", asyncRoute(async (req, res) => {
  const result = await forward("ai-system", "/api/v1/ai/suggest-skill", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/ai/discover-content", asyncRoute(async (req, res) => {
  const result = await forward("ai-system", "/api/v1/ai/discover-content", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/ai/prompt-template/:templateKey", asyncRoute(async (req, res) => {
  const result = await forward("ai-system", `/api/v1/ai/prompt-template/${req.params.templateKey}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/content/snapshot", asyncRoute(async (req, res) => {
  const force = String(req.query.force ?? "") === "1" ? "?force=1" : "";
  const result = await forward("content-system", `/api/v1/content/snapshot${force}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/content/discoveries", asyncRoute(async (req, res) => {
  const result = await forward("content-system", "/api/v1/content/discoveries", "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/content/items/:itemKey", asyncRoute(async (req, res) => {
  const result = await forward("content-system", `/api/v1/content/items/${req.params.itemKey}`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/content/find-alias", asyncRoute(async (req, res) => {
  const result = await forward("content-system", "/api/v1/content/find-alias", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/creation/resolve-proposals", asyncRoute(async (req, res) => {
  const result = await forward("creation-system", "/api/v1/creation/resolve-proposals", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/chat/send", asyncRoute(async (req, res) => {
  const result = await forward("chat-system", "/api/v1/chat/send", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/chat/channel/:channelId/history", asyncRoute(async (req, res) => {
  const result = await forward("chat-system", `/api/v1/chat/channel/${req.params.channelId}/history`, "GET", getRequestId(req));
  res.status(result.status).json(result.json);
}));

app.post("/api/v1/chat/system-message", asyncRoute(async (req, res) => {
  const result = await forward("chat-system", "/api/v1/chat/system-message", "POST", getRequestId(req), req.body);
  res.status(result.status).json(result.json);
}));

app.get("/api/v1/services/status", asyncRoute(async (req, res) => {
  const requestId = getRequestId(req);
  const statuses: ServiceStatusSnapshot[] = await Promise.all(
    SERVICES.filter((service) => service.name !== SERVICE_NAME).map(async (service) => {
      try {
        const response = await fetch(`${getServiceUrl(service.name)}/health`);
        const json = await response.json();
        return {
          service: service.name,
          port: service.port,
          healthy: response.ok,
          checkedAt: new Date().toISOString(),
          details: json.data
        };
      } catch (error) {
        return {
          service: service.name,
          port: service.port,
          healthy: false,
          checkedAt: new Date().toISOString(),
          details: { message: error instanceof Error ? error.message : "Health check failed" }
        };
      }
    })
  );
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { services: statuses });
}));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = getRequestId(req);
  const message = error instanceof Error ? error.message : "Unhandled gateway error";
  sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CLIENT_GATEWAY_ERROR", message, 500, null, false);
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
