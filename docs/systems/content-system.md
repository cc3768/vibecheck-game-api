# Content System

- **Service name:** `content-system`
- **Default port:** `41743`
- **Role:** canonical content snapshot, aliases, discoveries, runtime upserts.

## Key Routes

- `GET /api/v1/content/snapshot` — returns full merged content snapshot.
- `GET /api/v1/content/items/:itemKey` — returns one item + metadata.
- `POST /api/v1/content/find-alias` — resolves alias to canonical content key.
- `GET /api/v1/content/discoveries` — returns discovery and alias catalogs.
- `POST /api/v1/content/upsert-runtime` — upserts runtime item/skill/recipe/discovery data.

