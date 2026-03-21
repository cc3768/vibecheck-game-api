# NPC System

- **Service name:** `npc-system`
- **Default port:** `41739`
- **Role:** npc metadata, interaction/dialogue, schedules, spawn state.

## Key Routes

- `GET /api/v1/npc/:npcId` — fetches npc profile/state.
- `POST /api/v1/npc/interact` — processes player→npc interaction.
- `POST /api/v1/npc/dialogue` — returns npc dialogue response payload.
- `POST /api/v1/npc/teach` — applies npc-driven teaching progression.
- `POST /api/v1/npc/relationship/update` — updates relationship metrics.
- `POST /api/v1/npc/schedule/tick` — advances npc schedule state.
- `POST /api/v1/npc/spawn` — spawns npc instance.
- `POST /api/v1/npc/despawn` — despawns npc instance.
- `GET /api/v1/npc/nearby` — lists npcs near a region/position.

