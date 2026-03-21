# Combat System

- **Service name:** `combat-system`
- **Default port:** `41738`
- **Role:** combat lifecycle, actions, status effects, resolution.

## Key Routes

- `POST /api/v1/combat/start` — initializes a combat encounter state.
- `POST /api/v1/combat/action` — records one combat turn/action.
- `POST /api/v1/combat/resolve` — resolves encounter state progression.
- `GET /api/v1/combat/encounter/:encounterId` — fetches encounter details.
- `POST /api/v1/combat/retreat` — attempts encounter retreat flow.
- `POST /api/v1/combat/apply-status` — applies combat status effect updates.
- `POST /api/v1/combat/end` — finalizes and closes encounter.

