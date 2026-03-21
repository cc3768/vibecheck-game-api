# NPC System

- **Service name:** `npc-system`
- **Default port:** `41739`
- **Role:** npc metadata, interaction/dialogue, schedules, spawn state.

## Key Routes

- `GET /api/v1/npc/:npcId`
- `POST /api/v1/npc/interact`
- `POST /api/v1/npc/dialogue`
- `POST /api/v1/npc/teach`
- `POST /api/v1/npc/relationship/update`
- `POST /api/v1/npc/schedule/tick`
- `POST /api/v1/npc/spawn`
- `POST /api/v1/npc/despawn`
- `GET /api/v1/npc/nearby`

