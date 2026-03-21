# Quest System

- **Service name:** `quest-system`
- **Default port:** `41741`
- **Role:** quest offer/accept/progress/complete/fail state transitions.

## Key Routes

- `GET /api/v1/quest/:questId`
- `POST /api/v1/quest/accept`
- `POST /api/v1/quest/progress`
- `POST /api/v1/quest/complete`
- `POST /api/v1/quest/fail`
- `GET /api/v1/quest/active/:characterId`
- `POST /api/v1/quest/check-objective`
- `POST /api/v1/quest/offer-from-npc`

