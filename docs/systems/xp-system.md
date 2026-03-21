# XP System

- **Service name:** `xp-system`
- **Default port:** `41735`
- **Role:** xp evaluation, previewing, skill curves/rules.

## Key Routes

- `POST /api/v1/xp/evaluate` — computes awarded xp from context.
- `POST /api/v1/xp/apply-direct` — applies a direct xp payload.
- `POST /api/v1/xp/preview` — returns projected xp gains without applying.
- `POST /api/v1/xp/from-actions` — computes xp from action-derived signals.
- `GET /api/v1/xp/skill/:skillKey/rules` — returns rule metadata for one skill.
- `GET /api/v1/xp/skill/:skillKey/curve` — returns level progression curve.

