# Combat System

- **Service name:** `combat-system`
- **Default port:** `41738`
- **Role:** combat lifecycle, actions, status effects, resolution.

## Key Routes

- `POST /api/v1/combat/start`
- `POST /api/v1/combat/action`
- `POST /api/v1/combat/resolve`
- `GET /api/v1/combat/encounter/:encounterId`
- `POST /api/v1/combat/retreat`
- `POST /api/v1/combat/apply-status`
- `POST /api/v1/combat/end`

