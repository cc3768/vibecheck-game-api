# Character System

- **Service name:** `character-system`
- **Default port:** `41734`
- **Role:** character lifecycle, stats, skills, inventory/rewards/xp application.

## Key Routes

- `POST /api/v1/character/create` — creates a new character profile.
- `GET /api/v1/character/:characterId` — fetches one character snapshot.
- `POST /api/v1/character/load-by-account` — lists characters owned by account.
- `POST /api/v1/character/validate-auth` — validates character/account auth relation.
- `POST /api/v1/character/apply-xp` — applies xp deltas and recalculates skill levels.
- `POST /api/v1/character/apply-action-result` — applies action outputs to character.
- `POST /api/v1/character/apply-reward` — applies reward payload to inventory/stats.
- `POST /api/v1/character/apply-combat-result` — applies combat outcome effects.
- `POST /api/v1/character/update-knowledge` — updates unlocked topics/recipes/worlds.
- `GET /api/v1/character/:characterId/skills` — returns skill progression snapshot.
- `GET /api/v1/character/:characterId/knowledge` — returns knowledge state.
- `GET /api/v1/character/:characterId/stats` — returns derived/base stats.

