# Character System

- **Service name:** `character-system`
- **Default port:** `41734`
- **Role:** character lifecycle, stats, skills, inventory/rewards/xp application.

## Key Routes

- `POST /api/v1/character/create`
- `GET /api/v1/character/:characterId`
- `POST /api/v1/character/load-by-account`
- `POST /api/v1/character/validate-auth`
- `POST /api/v1/character/apply-xp`
- `POST /api/v1/character/apply-action-result`
- `POST /api/v1/character/apply-reward`
- `POST /api/v1/character/apply-combat-result`
- `POST /api/v1/character/update-knowledge`
- `GET /api/v1/character/:characterId/skills`
- `GET /api/v1/character/:characterId/knowledge`
- `GET /api/v1/character/:characterId/stats`

