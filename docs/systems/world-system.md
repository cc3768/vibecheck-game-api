# World System

- **Service name:** `world-system`
- **Default port:** `41733`
- **Role:** world map/chunk/tile generation, object placement, player presence.

## Key Routes

- `POST /api/v1/world/presence/update` — upserts current player position presence.
- `GET /api/v1/world/presence/region/:regionId` — lists fresh players in region.
- `GET /api/v1/world/:worldId/region/:regionId` — returns region metadata + map model.
- `GET /api/v1/world/:worldId/tile` — returns one generated/persisted region tile.
- `GET /api/v1/world/:worldId/chunk` — returns chunk tiles plus local objects.
- `GET /api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail` — returns detail-grid tiles under a parent tile.
- `POST /api/v1/world/query-position` — resolves terrain + nearby objects/players.
- `POST /api/v1/world/query-resource` — returns static/generated resource nodes nearby.
- `POST /api/v1/world/place-structure` — places a world object/structure.
- `POST /api/v1/world/remove-structure` — removes structure by id or coordinates.
- `POST /api/v1/world/update-object` — placeholder object update endpoint.
- `GET /api/v1/world/spawn/:characterId` — returns spawn position + map model.
- `POST /api/v1/world/environment/context` — returns biome/weather/danger context.

