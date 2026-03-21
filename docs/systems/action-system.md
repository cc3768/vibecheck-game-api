# Action System

- **Service name:** `action-system`
- **Default port:** `41736`
- **Role:** action intake, grouping, inference, queue resolution, xp submission.

## Key Routes

- `POST /api/v1/actions/intake`
- `POST /api/v1/actions/group-window`
- `POST /api/v1/actions/summarize`
- `GET /api/v1/actions/history/:characterId`
- `POST /api/v1/actions/infer-skills`
- `POST /api/v1/actions/check`
- `POST /api/v1/actions/resolve-queue`
- `POST /api/v1/actions/submit-to-xp`

