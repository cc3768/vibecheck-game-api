# World System

- **Service name:** `world-system`
- **Default port:** `41733`
- **Role:** world map/chunk/tile generation, object placement, player presence.

## Key Routes

- `POST /api/v1/world/presence/update`
- `GET /api/v1/world/presence/region/:regionId`
- `GET /api/v1/world/:worldId/region/:regionId`
- `GET /api/v1/world/:worldId/tile`
- `GET /api/v1/world/:worldId/chunk`
- `GET /api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail`
- `POST /api/v1/world/query-position`
- `POST /api/v1/world/query-resource`
- `POST /api/v1/world/place-structure`
- `POST /api/v1/world/remove-structure`
- `POST /api/v1/world/update-object`
- `GET /api/v1/world/spawn/:characterId`
- `POST /api/v1/world/environment/context`

