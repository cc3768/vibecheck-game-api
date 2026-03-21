# Login System

- **Service name:** `login-system`
- **Default port:** `41731`
- **Role:** account/session auth, token validation, active player lookup.

## Key Routes

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/validate`
- `POST /api/v1/auth/validate-character-owner`
- `GET /api/v1/account/:accountId/security`
- `GET /api/v1/auth/active-players/:regionId`

