# Client Server (Gateway)

- **Service name:** `client-server`
- **Default port:** `41730`
- **Role:** API gateway, route orchestration, browser client hosting.

## Responsibilities

- Hosts static web client pages/assets.
- Proxies player-facing API calls to domain systems.
- Exposes consolidated routes for session, world, character, action, production, combat, AI, content, creation.

## Key Routes

- `/api/v1/session/*`
- `/api/v1/character/*`
- `/api/v1/world/*`
- `/api/v1/npc/*`
- `/api/v1/quest/*`
- `/api/v1/rewards/*`
- `/api/v1/actions/*`
- `/api/v1/xp/*`
- `/api/v1/production/*`
- `/api/v1/combat/*`
- `/api/v1/ai/*`
- `/api/v1/content/*`
- `/api/v1/creation/*`
- `/api/v1/services/status`

