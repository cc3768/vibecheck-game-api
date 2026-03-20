import express, { type RequestHandler } from "express";
import cors from "cors";
import { SERVICE_VERSION, INTERNAL_SERVICE_TOKEN } from "./config";
import { getRequestId, sendError, sendSuccess } from "./envelope";

export function createServiceApp(serviceName: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(((req, _res, next) => {
    req.headers["x-request-id"] = req.headers["x-request-id"] ?? getRequestId(req);
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
