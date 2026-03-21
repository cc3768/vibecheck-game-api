# Chat System

- **Service name:** `chat-system`
- **Default port:** `41732`
- **Role:** chat transport and system/npc/reward/quest messaging.

## Key Routes

- `POST /api/v1/chat/send` — sends a player chat message.
- `GET /api/v1/chat/channel/:channelId/history` — fetches channel history.
- `POST /api/v1/chat/system-message` — emits system-level chat notice.
- `POST /api/v1/chat/npc-dialogue` — emits npc dialogue message.
- `POST /api/v1/chat/reward-notice` — emits reward notification message.
- `POST /api/v1/chat/quest-update` — emits quest update message.

