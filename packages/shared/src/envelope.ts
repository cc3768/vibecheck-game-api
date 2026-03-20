import type { Request, Response } from "express";
import type { ServiceResponseEnvelope } from "./contracts";

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getRequestId(req: Request): string {
  const existing = req.headers["x-request-id"];
  if (typeof existing === "string" && existing.length > 0) return existing;
  return makeId("req");
}

export function successEnvelope<T>(service: string, version: string, requestId: string, data: T): ServiceResponseEnvelope<T> {
  return {
    success: true,
    requestId,
    service,
    version,
    data,
    error: null,
    timestamp: nowIso()
  };
}

export function errorEnvelope(service: string, version: string, requestId: string, code: string, message: string, statusData?: Record<string, unknown> | null, retryable = false): ServiceResponseEnvelope<null> {
  return {
    success: false,
    requestId,
    service,
    version,
    data: null,
    error: {
      code,
      message,
      details: statusData ?? null,
      retryable
    },
    timestamp: nowIso()
  };
}

export function sendSuccess<T>(res: Response, service: string, version: string, requestId: string, data: T, status = 200): void {
  res.status(status).json(successEnvelope(service, version, requestId, data));
}

export function sendError(res: Response, service: string, version: string, requestId: string, code: string, message: string, status = 400, statusData?: Record<string, unknown> | null, retryable = false): void {
  res.status(status).json(errorEnvelope(service, version, requestId, code, message, statusData, retryable));
}
