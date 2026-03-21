# Login System

- **Service name:** `login-system`
- **Default port:** `41731`
- **Role:** account/session auth, token validation, active player lookup.

## Key Routes

- `POST /api/v1/auth/login` — creates/loads account and issues access/refresh tokens.
- `POST /api/v1/auth/logout` — invalidates an access token session.
- `POST /api/v1/auth/refresh` — rotates session using refresh token.
- `POST /api/v1/auth/validate` — validates access token and expiry.
- `POST /api/v1/auth/validate-character-owner` — lightweight ownership guard check.
- `GET /api/v1/account/:accountId/security` — returns account security metadata.
- `GET /api/v1/auth/active-players/:regionId` — returns fresh players in region.

