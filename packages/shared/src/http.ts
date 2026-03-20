import express, { type RequestHandler } from "express";
import cors from "cors";
import { SERVICE_VERSION, INTERNAL_SERVICE_TOKEN } from "./config";
import { getRequestId, nowIso, sendError, sendSuccess } from "./envelope";
import { AIRTABLE_SERVICE_EVENTS_TABLE, airtableCreateRecord, airtableEnabled, airtableEnsureTable } from "./airtable";

let serviceEventTableReady = false;

function safeJson(value: unknown, maxLength = 50000) {
  try {
    const text = JSON.stringify(value ?? null);
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  } catch {
    return "null";
  }
}

async function ensureServiceEventTable() {
  if (!airtableEnabled() || serviceEventTableReady) return;
  await airtableEnsureTable(AIRTABLE_SERVICE_EVENTS_TABLE, [
    { name: "eventKey", type: "singleLineText" },
    { name: "serviceName", type: "singleLineText" },
    { name: "requestId", type: "singleLineText" },
    { name: "method", type: "singleLineText" },
    { name: "path", type: "singleLineText" },
    { name: "queryJson", type: "multilineText" },
    { name: "statusCode", type: "number", options: { precision: 0 } },
    { name: "requestBodyJson", type: "multilineText" },
    { name: "responseJson", type: "multilineText" },
    { name: "createdAt", type: "singleLineText" }
  ]);
  serviceEventTableReady = true;
}

async function persistServiceEvent(serviceName: string, req: express.Request, statusCode: number, responseBody: unknown) {
  if (!airtableEnabled()) return;
  try {
    await ensureServiceEventTable();
    await airtableCreateRecord<Record<string, unknown>>(AIRTABLE_SERVICE_EVENTS_TABLE, {
      eventKey: `${serviceName}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      serviceName,
      requestId: getRequestId(req),
      method: req.method,
      path: req.path,
      queryJson: safeJson(req.query),
      statusCode,
      requestBodyJson: safeJson(req.body),
      responseJson: safeJson(responseBody),
      createdAt: nowIso()
    });
  } catch {
    // Logging is best-effort. Do not block service responses if Airtable persistence fails.
  }
}

export function createServiceApp(serviceName: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(((req, _res, next) => {
    req.headers["x-request-id"] = req.headers["x-request-id"] ?? getRequestId(req);
    next();
  }) as RequestHandler);

  app.use(((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const statusCode = Number(res.statusCode ?? 200);
      void persistServiceEvent(serviceName, req, statusCode, body);
      return originalJson(body);
    }) as typeof res.json;
    next();
  }) as RequestHandler);

  app.get("/health", (req, res) => {
    sendSuccess(res, serviceName, SERVICE_VERSION, getRequestId(req), {
      status: "ok",
      service: serviceName
    });
  });

  app.get("/version", (req, res) => {
    sendSuccess(res, serviceName, SERVICE_VERSION, getRequestId(req), {
      service: serviceName,
      version: SERVICE_VERSION
    });
  });

  return app;
}

export function internalAuthRequired(serviceName: string): RequestHandler {
  return (req, res, next) => {
    const token = req.header("x-internal-service-token");
    if (token !== INTERNAL_SERVICE_TOKEN) {
      return sendError(res, serviceName, SERVICE_VERSION, getRequestId(req), "UNAUTHORIZED_INTERNAL", "Missing or invalid internal service token", 401);
    }
    next();
  };
}
