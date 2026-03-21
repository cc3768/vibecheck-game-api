# Quest System

- **Service name:** `quest-system`
- **Default port:** `41741`
- **Role:** quest offer/accept/progress/complete/fail state transitions.

## Key Routes

- `GET /api/v1/quest/:questId` — returns quest definition/state.
- `POST /api/v1/quest/accept` — accepts quest for character.
- `POST /api/v1/quest/progress` — updates objective progress.
- `POST /api/v1/quest/complete` — marks quest complete.
- `POST /api/v1/quest/fail` — marks quest failed.
- `GET /api/v1/quest/active/:characterId` — returns active quests.
- `POST /api/v1/quest/check-objective` — validates objective completion status.
- `POST /api/v1/quest/offer-from-npc` — returns/creates npc quest offers.

