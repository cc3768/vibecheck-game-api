# Production System

- **Service name:** `production-system`
- **Default port:** `41737`
- **Role:** crafting evaluation/execution and production validation helpers.

## Key Routes

- `POST /api/v1/production/evaluate` — evaluates whether crafting can proceed.
- `POST /api/v1/production/craft` — executes craft flow and returns outputs.
- `POST /api/v1/production/discover` — attempts production-based discovery.
- `GET /api/v1/production/recipe/:recipeKey` — returns recipe definition.
- `GET /api/v1/production/item/:itemKey` — returns item production metadata.
- `POST /api/v1/production/check-ingredients` — validates ingredient sufficiency.
- `POST /api/v1/production/check-tools` — validates tool requirements.
- `POST /api/v1/production/register-machine` — registers/updates machine context.

