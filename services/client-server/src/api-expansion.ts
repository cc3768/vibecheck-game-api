export type ExpandedMethod = "get" | "post" | "patch" | "delete";

export type ExpandedRouteDefinition = {
  method: ExpandedMethod;
  path: string;
};

function define(method: ExpandedMethod, paths: string[]): ExpandedRouteDefinition[] {
  return paths.map((path) => ({ method, path }));
}

function dedupe(definitions: ExpandedRouteDefinition[]): ExpandedRouteDefinition[] {
  const seen = new Set<string>();
  const out: ExpandedRouteDefinition[] = [];
  for (const definition of definitions) {
    const key = `${definition.method.toUpperCase()} ${definition.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(definition);
  }
  return out;
}

export const EXPANDED_ROUTE_DEFINITIONS = dedupe([
  ...define("get", [
    "/api/v1/data-sources",
    "/api/v1/data-sources/active",
    "/api/v1/data-sources/entity/:entityType/:entityKey",
    "/api/v1/data-sources/health",
    "/api/v1/data-sources/cache",
    "/api/v1/data-sources/fallbacks",
    "/api/v1/data-sources/contracts",
    "/api/v1/data-sources/schema",
    "/api/v1/data-sources/schema/diff",
    "/api/v1/services/routes",
    "/api/v1/services/versions",
    "/api/v1/services/dependencies",
    "/api/v1/services/status/deep",
    "/api/v1/services/latency",
    "/api/v1/services/manifest",
    "/api/v1/client/build-info"
  ]),
  ...define("post", [
    "/api/v1/data-sources/cache/reload",
    "/api/v1/data-sources/cache/flush"
  ]),

  ...define("post", [
    "/api/v1/auth/register",
    "/api/v1/auth/check-username",
    "/api/v1/auth/check-email",
    "/api/v1/auth/check-display-name",
    "/api/v1/auth/device/register",
    "/api/v1/auth/device/revoke",
    "/api/v1/auth/request-password-reset",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/change-password",
    "/api/v1/auth/verify-email/request",
    "/api/v1/auth/verify-email/confirm",
    "/api/v1/auth/mfa/setup",
    "/api/v1/auth/mfa/verify",
    "/api/v1/auth/mfa/disable",
    "/api/v1/account/:accountId/consent",
    "/api/v1/account/:accountId/delete-request"
  ]),
  ...define("get", [
    "/api/v1/account/:accountId/profile",
    "/api/v1/account/:accountId/preferences",
    "/api/v1/account/:accountId/sessions",
    "/api/v1/auth/devices/:accountId",
    "/api/v1/account/:accountId/consent"
  ]),
  ...define("patch", [
    "/api/v1/account/:accountId/profile",
    "/api/v1/account/:accountId/preferences"
  ]),
  ...define("delete", [
    "/api/v1/account/:accountId/sessions/:sessionId"
  ]),

  ...define("get", [
    "/api/v1/character/:characterId/vitals",
    "/api/v1/character/:characterId/vitals/history",
    "/api/v1/character/:characterId/inventory",
    "/api/v1/character/:characterId/equipment",
    "/api/v1/character/:characterId/status-effects",
    "/api/v1/character/:characterId/encumbrance",
    "/api/v1/character/:characterId/reputation",
    "/api/v1/character/:characterId/factions",
    "/api/v1/character/:characterId/death-history",
    "/api/v1/character/:characterId/title-history"
  ]),
  ...define("patch", [
    "/api/v1/character/:characterId/vitals",
    "/api/v1/character/:characterId/appearance"
  ]),
  ...define("post", [
    "/api/v1/character/:characterId/inventory/move",
    "/api/v1/character/:characterId/inventory/split",
    "/api/v1/character/:characterId/inventory/merge",
    "/api/v1/character/:characterId/inventory/drop",
    "/api/v1/character/:characterId/inventory/pickup",
    "/api/v1/character/:characterId/equip",
    "/api/v1/character/:characterId/unequip",
    "/api/v1/character/:characterId/status-effects/clear",
    "/api/v1/character/:characterId/reputation/update",
    "/api/v1/character/:characterId/rename",
    "/api/v1/character/:characterId/set-home",
    "/api/v1/character/:characterId/respawn",
    "/api/v1/character/:characterId/eat",
    "/api/v1/character/:characterId/drink",
    "/api/v1/character/:characterId/sleep"
  ]),

  ...define("post", [
    "/api/v1/world/travel/validate",
    "/api/v1/world/travel/move",
    "/api/v1/world/travel/path",
    "/api/v1/world/fog-of-war/reveal",
    "/api/v1/world/fog-of-war/update",
    "/api/v1/world/scout",
    "/api/v1/world/discover-poi",
    "/api/v1/world/claim",
    "/api/v1/world/unclaim"
  ]),
  ...define("get", [
    "/api/v1/world/travel/path/:pathId",
    "/api/v1/world/:worldId/region/:regionId/summary",
    "/api/v1/world/:worldId/region/:regionId/players",
    "/api/v1/world/:worldId/region/:regionId/resources",
    "/api/v1/world/:worldId/region/:regionId/events",
    "/api/v1/world/:worldId/region/:regionId/weather",
    "/api/v1/world/:worldId/region/:regionId/weather/forecast",
    "/api/v1/world/:worldId/region/:regionId/legend",
    "/api/v1/world/:worldId/region/:regionId/adjacent",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/summary",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/occupants",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/resources",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/structures",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/visibility",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/projection",
    "/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/minimap",
    "/api/v1/world/poi/:poiId",
    "/api/v1/world/poi/nearby"
  ]),

  ...define("post", [
    "/api/v1/world/presence/batch",
    "/api/v1/world/presence/share-mode",
    "/api/v1/world/presence/heartbeat"
  ]),
  ...define("get", [
    "/api/v1/world/presence/world/:worldId",
    "/api/v1/world/presence/character/:characterId",
    "/api/v1/world/presence/nearby/:characterId",
    "/api/v1/session/active-players/world/:worldId",
    "/api/v1/session/active-players/chunk/:chunkId"
  ]),

  ...define("get", [
    "/api/v1/actions/queue/:characterId",
    "/api/v1/actions/current/:characterId",
    "/api/v1/actions/templates",
    "/api/v1/actions/cooldowns/:characterId",
    "/api/v1/actions/metrics/:characterId"
  ]),
  ...define("post", [
    "/api/v1/actions/cancel",
    "/api/v1/actions/cancel-all",
    "/api/v1/actions/retry",
    "/api/v1/actions/reorder-queue",
    "/api/v1/actions/batch-intake",
    "/api/v1/actions/resolve-one",
    "/api/v1/actions/simulate",
    "/api/v1/actions/plan",
    "/api/v1/actions/templates/create",
    "/api/v1/actions/interrupt",
    "/api/v1/actions/preview-cost",
    "/api/v1/actions/validate-context",
    "/api/v1/actions/explain-failure"
  ]),

  ...define("get", [
    "/api/v1/xp/history/:characterId",
    "/api/v1/xp/mastery/:characterId",
    "/api/v1/xp/leaderboard/:skillKey",
    "/api/v1/xp/bonuses/:characterId",
    "/api/v1/xp/rested/:characterId",
    "/api/v1/xp/skill/:skillKey/caps",
    "/api/v1/xp/skill/:skillKey/mastery-rewards"
  ]),
  ...define("post", [
    "/api/v1/xp/recalculate/:characterId",
    "/api/v1/xp/apply-batch",
    "/api/v1/xp/preview-levels",
    "/api/v1/xp/claim-rested"
  ]),

  ...define("post", [
    "/api/v1/production/queue-craft",
    "/api/v1/production/cancel",
    "/api/v1/production/salvage",
    "/api/v1/production/refine",
    "/api/v1/production/repair",
    "/api/v1/production/recycle",
    "/api/v1/production/learn-recipe",
    "/api/v1/production/machine/start",
    "/api/v1/production/machine/stop",
    "/api/v1/production/machine/:machineId/job",
    "/api/v1/production/machine/:machineId/collect",
    "/api/v1/production/quality-roll",
    "/api/v1/production/byproducts"
  ]),
  ...define("get", [
    "/api/v1/production/queue/:characterId",
    "/api/v1/production/recipes/by-skill/:skillKey",
    "/api/v1/production/recipes/unlocked/:characterId",
    "/api/v1/production/machine/:machineId",
    "/api/v1/production/machine/:machineId/jobs"
  ]),

  ...define("post", [
    "/api/v1/combat/preview",
    "/api/v1/combat/use-item",
    "/api/v1/combat/use-skill",
    "/api/v1/combat/select-target",
    "/api/v1/combat/inspect-target",
    "/api/v1/combat/loot",
    "/api/v1/combat/revive",
    "/api/v1/combat/auto-resolve",
    "/api/v1/combat/join",
    "/api/v1/combat/leave",
    "/api/v1/combat/environment-modifier",
    "/api/v1/combat/escape-preview"
  ]),
  ...define("get", [
    "/api/v1/combat/log/:encounterId",
    "/api/v1/combat/status-catalog",
    "/api/v1/combat/nearby-threats"
  ]),

  ...define("get", [
    "/api/v1/npc/:npcId/quests",
    "/api/v1/npc/:npcId/inventory",
    "/api/v1/npc/:npcId/vendor",
    "/api/v1/npc/:npcId/gossip",
    "/api/v1/npc/:npcId/faction",
    "/api/v1/npc/:npcId/schedule",
    "/api/v1/npc/:npcId/relationship/:characterId"
  ]),
  ...define("post", [
    "/api/v1/npc/:npcId/buy",
    "/api/v1/npc/:npcId/sell",
    "/api/v1/npc/:npcId/gift",
    "/api/v1/npc/:npcId/recruit",
    "/api/v1/npc/:npcId/dismiss",
    "/api/v1/npc/:npcId/teach-skill",
    "/api/v1/npc/:npcId/teach-recipe",
    "/api/v1/npc/:npcId/offer-service",
    "/api/v1/npc/:npcId/report-crime"
  ]),

  ...define("get", [
    "/api/v1/quest/history/:characterId",
    "/api/v1/quest/recommendations/:characterId",
    "/api/v1/quest/templates",
    "/api/v1/quest/faction/:factionId",
    "/api/v1/quest/storyline/:storylineKey"
  ]),
  ...define("post", [
    "/api/v1/quest/abandon",
    "/api/v1/quest/pin",
    "/api/v1/quest/unpin",
    "/api/v1/quest/generate",
    "/api/v1/quest/turn-in",
    "/api/v1/quest/reward-preview",
    "/api/v1/quest/share",
    "/api/v1/quest/objective/reveal",
    "/api/v1/quest/objective/hint",
    "/api/v1/quest/branch/select"
  ]),

  ...define("get", [
    "/api/v1/rewards/unclaimed/:characterId",
    "/api/v1/rewards/tables/:tableKey"
  ]),
  ...define("post", [
    "/api/v1/rewards/claim/:rewardId",
    "/api/v1/rewards/revoke",
    "/api/v1/rewards/mail",
    "/api/v1/rewards/bundle/preview",
    "/api/v1/rewards/bundle/grant",
    "/api/v1/rewards/roll-table",
    "/api/v1/rewards/compensate",
    "/api/v1/rewards/daily",
    "/api/v1/rewards/first-discovery",
    "/api/v1/rewards/party-share"
  ]),

  ...define("post", [
    "/api/v1/chat/channel/create",
    "/api/v1/chat/channel/join",
    "/api/v1/chat/channel/leave",
    "/api/v1/chat/direct-message",
    "/api/v1/chat/whisper",
    "/api/v1/chat/message/edit",
    "/api/v1/chat/message/delete",
    "/api/v1/chat/message/react",
    "/api/v1/chat/message/report",
    "/api/v1/chat/typing",
    "/api/v1/chat/mark-read",
    "/api/v1/chat/mute-channel",
    "/api/v1/chat/block-user"
  ]),
  ...define("get", [
    "/api/v1/chat/channel/:channelId/presence",
    "/api/v1/chat/unread/:accountId",
    "/api/v1/chat/search",
    "/api/v1/chat/moderation/incidents"
  ]),

  ...define("post", [
    "/api/v1/ai/extract-targets",
    "/api/v1/ai/explain-action",
    "/api/v1/ai/explain-failure",
    "/api/v1/ai/hint",
    "/api/v1/ai/tutorial",
    "/api/v1/ai/analyze-region",
    "/api/v1/ai/analyze-character",
    "/api/v1/ai/propose-items",
    "/api/v1/ai/propose-skills",
    "/api/v1/ai/propose-recipes",
    "/api/v1/ai/propose-world-events",
    "/api/v1/ai/propose-npc-reaction",
    "/api/v1/ai/generate-lore",
    "/api/v1/ai/generate-book",
    "/api/v1/ai/generate-place-name",
    "/api/v1/ai/rename-entity",
    "/api/v1/ai/moderate-profile",
    "/api/v1/ai/feedback"
  ]),
  ...define("get", [
    "/api/v1/ai/models",
    "/api/v1/ai/usage"
  ]),

  ...define("get", [
    "/api/v1/content/items",
    "/api/v1/content/skills",
    "/api/v1/content/recipes",
    "/api/v1/content/world/regions",
    "/api/v1/content/world/tilesets",
    "/api/v1/content/world/biomes",
    "/api/v1/content/world/weather",
    "/api/v1/content/npcs",
    "/api/v1/content/quests",
    "/api/v1/content/search",
    "/api/v1/content/source/:entityType/:entityKey",
    "/api/v1/content/revisions/:entityType/:entityKey",
    "/api/v1/content/changelog"
  ]),
  ...define("post", [
    "/api/v1/content/validate-entity",
    "/api/v1/content/import",
    "/api/v1/content/export",
    "/api/v1/content/publish",
    "/api/v1/content/archive",
    "/api/v1/content/cache/rebuild"
  ]),

  ...define("get", [
    "/api/v1/creation/proposals",
    "/api/v1/creation/proposals/:proposalId",
    "/api/v1/creation/audit-log"
  ]),
  ...define("post", [
    "/api/v1/creation/create-item",
    "/api/v1/creation/create-skill",
    "/api/v1/creation/create-recipe",
    "/api/v1/creation/create-resource-node",
    "/api/v1/creation/create-world-event",
    "/api/v1/creation/create-poi",
    "/api/v1/creation/create-npc",
    "/api/v1/creation/link-alias",
    "/api/v1/creation/dedupe",
    "/api/v1/creation/review/:proposalId/approve",
    "/api/v1/creation/review/:proposalId/reject",
    "/api/v1/creation/review/:proposalId/request-changes",
    "/api/v1/creation/promote-runtime",
    "/api/v1/creation/rollback"
  ]),

  ...define("get", [
    "/api/v1/survival/:characterId",
    "/api/v1/survival/history/:characterId",
    "/api/v1/survival/thresholds",
    "/api/v1/survival/buffs/:characterId"
  ]),
  ...define("post", [
    "/api/v1/survival/tick",
    "/api/v1/survival/eat",
    "/api/v1/survival/drink",
    "/api/v1/survival/sleep",
    "/api/v1/survival/wake",
    "/api/v1/survival/apply-environment",
    "/api/v1/survival/apply-disease",
    "/api/v1/survival/apply-weather",
    "/api/v1/survival/preview",
    "/api/v1/survival/recover"
  ]),

  ...define("post", [
    "/api/v1/party/create",
    "/api/v1/party/invite",
    "/api/v1/party/join",
    "/api/v1/party/leave",
    "/api/v1/party/share-position",
    "/api/v1/party/ping-location",
    "/api/v1/friends/add",
    "/api/v1/friends/remove",
    "/api/v1/friends/request",
    "/api/v1/friends/respond"
  ]),
  ...define("get", [
    "/api/v1/party/:partyId",
    "/api/v1/friends/:accountId"
  ]),

  ...define("get", [
    "/api/v1/market/listings",
    "/api/v1/trade/history/:characterId",
    "/api/v1/economy/prices",
    "/api/v1/economy/item/:itemKey/price-history"
  ]),
  ...define("post", [
    "/api/v1/market/listings",
    "/api/v1/market/buy",
    "/api/v1/trade/player-to-player",
    "/api/v1/trade/respond",
    "/api/v1/economy/tax/preview"
  ]),
  ...define("delete", [
    "/api/v1/market/listings/:listingId"
  ]),

  ...define("get", [
    "/api/v1/admin/players/online",
    "/api/v1/admin/actions/failures",
    "/api/v1/admin/content/proposals/pending",
    "/api/v1/admin/world/hot-regions",
    "/api/v1/admin/moderation/incidents"
  ]),
  ...define("post", [
    "/api/v1/admin/player/:characterId/teleport",
    "/api/v1/admin/player/:characterId/heal",
    "/api/v1/admin/player/:characterId/set-stat",
    "/api/v1/admin/player/:characterId/set-vitals",
    "/api/v1/admin/world/reseed-region",
    "/api/v1/admin/world/spawn-npc",
    "/api/v1/admin/content/publish",
    "/api/v1/admin/content/reject",
    "/api/v1/admin/cache/flush",
    "/api/v1/admin/chat/delete-message",
    "/api/v1/admin/account/ban",
    "/api/v1/admin/account/unban"
  ]),

  ...define("get", [
    "/api/v1/stream/world/presence",
    "/api/v1/stream/chat/:channelId",
    "/api/v1/stream/combat/:encounterId",
    "/api/v1/stream/quest/:characterId",
    "/api/v1/stream/rewards/:characterId",
    "/api/v1/stream/survival/:characterId",
    "/api/v1/stream/system/status",
    "/ws/world",
    "/ws/chat",
    "/ws/combat",
    "/ws/party"
  ])
]);

export function inferTargetService(path: string): string | null {
  const prefixMap: Array<{ prefix: string; service: string }> = [
    { prefix: "/api/v1/content", service: "content-system" },
    { prefix: "/api/v1/data-sources", service: "content-system" },
    { prefix: "/api/v1/creation", service: "creation-system" },
    { prefix: "/api/v1/ai", service: "ai-system" },
    { prefix: "/api/v1/chat", service: "chat-system" },
    { prefix: "/api/v1/rewards", service: "rewards-system" },
    { prefix: "/api/v1/quest", service: "quest-system" },
    { prefix: "/api/v1/npc", service: "npc-system" },
    { prefix: "/api/v1/combat", service: "combat-system" },
    { prefix: "/api/v1/production", service: "production-system" },
    { prefix: "/api/v1/xp", service: "xp-system" },
    { prefix: "/api/v1/actions", service: "action-system" },
    { prefix: "/api/v1/world", service: "world-system" },
    { prefix: "/api/v1/survival", service: "character-system" },
    { prefix: "/api/v1/character", service: "character-system" },
    { prefix: "/api/v1/auth", service: "login-system" },
    { prefix: "/api/v1/account", service: "login-system" },
    { prefix: "/api/v1/session", service: "login-system" },
    { prefix: "/api/v1/party", service: "login-system" },
    { prefix: "/api/v1/friends", service: "login-system" },
    { prefix: "/api/v1/admin", service: "login-system" },
    { prefix: "/api/v1/market", service: "production-system" },
    { prefix: "/api/v1/trade", service: "production-system" },
    { prefix: "/api/v1/economy", service: "production-system" },
    { prefix: "/api/v1/stream/world", service: "world-system" },
    { prefix: "/api/v1/stream/chat", service: "chat-system" },
    { prefix: "/api/v1/stream/combat", service: "combat-system" },
    { prefix: "/api/v1/stream/quest", service: "quest-system" },
    { prefix: "/api/v1/stream/rewards", service: "rewards-system" },
    { prefix: "/api/v1/stream/survival", service: "character-system" },
    { prefix: "/api/v1/stream/system", service: "client-server" },
    { prefix: "/api/v1/services", service: "client-server" },
    { prefix: "/api/v1/client", service: "client-server" },
    { prefix: "/ws/world", service: "world-system" },
    { prefix: "/ws/chat", service: "chat-system" },
    { prefix: "/ws/combat", service: "combat-system" },
    { prefix: "/ws/party", service: "login-system" }
  ];

  const hit = prefixMap.find((entry) => path.startsWith(entry.prefix));
  return hit?.service ?? null;
}
