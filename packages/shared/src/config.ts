import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config();

export const SERVICE_VERSION = process.env.SERVICE_VERSION ?? "0.1.0";
export const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token";

export const SERVICES = [
  { name: "client-server", port: Number(process.env.CLIENT_SERVER_PORT ?? 41730) },
  { name: "login-system", port: Number(process.env.LOGIN_SYSTEM_PORT ?? 41731) },
  { name: "chat-system", port: Number(process.env.CHAT_SYSTEM_PORT ?? 41732) },
  { name: "world-system", port: Number(process.env.WORLD_SYSTEM_PORT ?? 41733) },
  { name: "character-system", port: Number(process.env.CHARACTER_SYSTEM_PORT ?? 41734) },
  { name: "xp-system", port: Number(process.env.XP_SYSTEM_PORT ?? 41735) },
  { name: "action-system", port: Number(process.env.ACTION_SYSTEM_PORT ?? 41736) },
  { name: "production-system", port: Number(process.env.PRODUCTION_SYSTEM_PORT ?? 41737) },
  { name: "combat-system", port: Number(process.env.COMBAT_SYSTEM_PORT ?? 41738) },
  { name: "npc-system", port: Number(process.env.NPC_SYSTEM_PORT ?? 41739) },
  { name: "rewards-system", port: Number(process.env.REWARDS_SYSTEM_PORT ?? 41740) },
  { name: "quest-system", port: Number(process.env.QUEST_SYSTEM_PORT ?? 41741) },
  { name: "ai-system", port: Number(process.env.AI_SYSTEM_PORT ?? 41742) },
  { name: "content-system", port: Number(process.env.CONTENT_SYSTEM_PORT ?? 41743) },
  { name: "creation-system", port: Number(process.env.CREATION_SYSTEM_PORT ?? 41744) }
] as const;

export function getServicePort(serviceName: string): number {
  const hit = SERVICES.find((s) => s.name === serviceName);
  if (!hit) throw new Error(`Unknown service: ${serviceName}`);
  return hit.port;
}

export function getServiceUrl(serviceName: string): string {
  return `http://127.0.0.1:${getServicePort(serviceName)}`;
}
