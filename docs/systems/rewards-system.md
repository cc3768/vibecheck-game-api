# Rewards System

- **Service name:** `rewards-system`
- **Default port:** `41740`
- **Role:** reward granting, validation, previews, history sources.

## Key Routes

- `POST /api/v1/rewards/grant` — grants a reward payload to a character/account context.
- `POST /api/v1/rewards/preview` — returns a non-persistent reward preview.
- `GET /api/v1/rewards/history/:characterId` — returns reward history for a character.
- `POST /api/v1/rewards/validate` — validates whether a reward payload is acceptable.
- `POST /api/v1/rewards/from-quest` — builds and grants quest-derived rewards.
- `POST /api/v1/rewards/from-npc` — builds and grants npc-interaction rewards.

