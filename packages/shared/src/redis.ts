import "./config";
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "";
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? "vibecheck";

let redisClient: ReturnType<typeof createClient> | null = null;
let redisConnectPromise: Promise<ReturnType<typeof createClient>> | null = null;

export function redisEnabled() {
  return Boolean(REDIS_URL);
}

export function redisKey(...parts: Array<string | number>) {
  return [REDIS_KEY_PREFIX, ...parts.map((part) => String(part))].join(":");
}

async function connectRedis() {
  if (!redisEnabled()) {
    throw new Error("Redis is not configured. Set REDIS_URL.");
  }

  const client = createClient({ url: REDIS_URL });
  client.on("error", (error) => {
    console.warn(`[shared-redis] ${error instanceof Error ? error.message : String(error)}`);
  });
  await client.connect();
  redisClient = client;
  return client;
}

export async function getRedisClient() {
  if (redisClient?.isOpen) return redisClient;
  if (!redisConnectPromise) {
    redisConnectPromise = connectRedis().finally(() => {
      redisConnectPromise = null;
    });
  }
  return redisConnectPromise;
}

export async function redisPing() {
  const client = await getRedisClient();
  return client.ping();
}
