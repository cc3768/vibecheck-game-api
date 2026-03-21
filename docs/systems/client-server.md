# Client Server (Gateway)

- **Service name:** `client-server`
- **Default port:** `41730`
- **Role:** API gateway, route orchestration, browser client hosting.

## Responsibilities

- Hosts static web client pages/assets.
- Proxies player-facing API calls to domain systems.
- Exposes consolidated routes for session, world, character, action, production, combat, AI, content, creation.

## Key Routes (Gateway Behavior)

### Session / Auth

- `POST /api/v1/session/login` — proxies login request to `login-system`.
- `POST /api/v1/session/register` — creates account then login session flow.
- `POST /api/v1/session/logout` — proxies logout/invalidate token.
- `POST /api/v1/session/heartbeat` — lightweight heartbeat response.
- `GET /api/v1/session/me` — validates bearer token and returns session.
- `GET /api/v1/session/active-players/:regionId` — proxies active-player lookup.

### Character

- `POST /api/v1/character/create` — proxies character create.
- `POST /api/v1/character/load-by-account` — proxies account character list.
- `POST /api/v1/character/apply-xp` — proxies xp application.
- `GET /api/v1/character/:characterId` — proxies character fetch.
- `GET /api/v1/character/:characterId/stats` — proxies stats snapshot.
- `GET /api/v1/character/:characterId/skills` — proxies skills snapshot.
- `GET /api/v1/character/:characterId/knowledge` — proxies knowledge snapshot.

### World

- `GET /api/v1/world/spawn/:characterId` — proxies spawn resolution.
- `POST /api/v1/world/presence/update` — proxies presence upsert.
- `GET /api/v1/world/presence/region/:regionId` — proxies regional presence list.
- `GET /api/v1/world/:worldId/region/:regionId` — proxies region metadata.
- `GET /api/v1/world/:worldId/tile` — proxies single tile lookup.
- `GET /api/v1/world/:worldId/chunk` — proxies chunk payload.
- `GET /api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail` — proxies detail-grid payload.
- `POST /api/v1/world/query-position` — proxies nearby context query.
- `POST /api/v1/world/query-resource` — proxies resource node query.
- `POST /api/v1/world/place-structure` — proxies structure placement.
- `POST /api/v1/world/remove-structure` — proxies structure removal.
- `POST /api/v1/world/environment/context` — proxies environment context lookup.

### NPC / Quest / Rewards

- `GET /api/v1/npc/nearby` — proxies nearby npc list.
- `GET /api/v1/npc/:npcId` — proxies npc detail fetch.
- `POST /api/v1/npc/interact` — proxies npc interaction.
- `POST /api/v1/quest/offer-from-npc` — proxies npc quest offer generation.
- `GET /api/v1/quest/:questId` — proxies quest fetch.
- `GET /api/v1/quest/active/:characterId` — proxies active quest list.
- `POST /api/v1/rewards/from-quest` — proxies quest reward flow.
- `POST /api/v1/rewards/from-npc` — proxies npc reward flow.
- `POST /api/v1/rewards/grant` — proxies generic reward grant.

### Actions / XP / Production / Combat

- `GET /api/v1/actions/history/:characterId` — proxies action history.
- `POST /api/v1/actions/intake` — proxies action intake.
- `POST /api/v1/actions/group-window` — proxies action grouping.
- `POST /api/v1/actions/summarize` — proxies action summary.
- `POST /api/v1/actions/infer-skills` — proxies skill inference.
- `POST /api/v1/actions/check` — proxies action validation.
- `POST /api/v1/actions/resolve-queue` — proxies queue resolution.
- `POST /api/v1/actions/submit-to-xp` — proxies xp submission.
- `POST /api/v1/xp/preview` — proxies xp preview.
- `POST /api/v1/production/craft` — proxies craft execution.
- `POST /api/v1/production/validate` — proxies production validation.
- `POST /api/v1/production/discover` — proxies production discovery.
- `GET /api/v1/production/recipe/:recipeKey` — proxies recipe lookup.
- `GET /api/v1/combat/encounter/:encounterId` — proxies encounter fetch.

### Router Composite Endpoints

- `POST /api/v1/router/action` — routes to action intake pipeline.
- `POST /api/v1/router/dialogue` — routes to npc dialogue pipeline.
- `POST /api/v1/router/quest` — routes quest events to quest-system.
- `POST /api/v1/router/combat` — routes combat event to start/action/resolve.

### AI / Content / Creation / Chat

- `POST /api/v1/ai/generate-dialogue` — proxies ai dialogue generation.
- `POST /api/v1/ai/classify-actions` — proxies ai action classification.
- `POST /api/v1/ai/suggest-skill` — proxies ai skill suggestion.
- `POST /api/v1/ai/discover-content` — proxies ai content discovery.
- `GET /api/v1/ai/prompt-template/:templateKey` — proxies prompt template fetch.
- `GET /api/v1/content/snapshot` — proxies content snapshot.
- `GET /api/v1/content/discoveries` — proxies discovery list.
- `GET /api/v1/content/items/:itemKey` — proxies item lookup.
- `POST /api/v1/content/find-alias` — proxies alias resolution.
- `POST /api/v1/creation/resolve-proposals` — proxies proposal resolution.
- `POST /api/v1/chat/send` — proxies chat send.
- `GET /api/v1/chat/channel/:channelId/history` — proxies chat history.
- `POST /api/v1/chat/system-message` — proxies system chat message.

### Service Health

- `GET /api/v1/services/status` — pings all configured services and returns health matrix.

