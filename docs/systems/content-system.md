# Content System

- **Service name:** `content-system`
- **Default port:** `41743`
- **Role:** canonical content snapshot, aliases, discoveries, runtime upserts.

## Key Routes

- `GET /api/v1/content/snapshot`
- `GET /api/v1/content/items/:itemKey`
- `POST /api/v1/content/find-alias`
- `GET /api/v1/content/discoveries`
- `POST /api/v1/content/upsert-runtime`

