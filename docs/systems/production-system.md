# Production System

- **Service name:** `production-system`
- **Default port:** `41737`
- **Role:** crafting evaluation/execution and production validation helpers.

## Key Routes

- `POST /api/v1/production/evaluate`
- `POST /api/v1/production/craft`
- `POST /api/v1/production/discover`
- `GET /api/v1/production/recipe/:recipeKey`
- `GET /api/v1/production/item/:itemKey`
- `POST /api/v1/production/check-ingredients`
- `POST /api/v1/production/check-tools`
- `POST /api/v1/production/register-machine`

