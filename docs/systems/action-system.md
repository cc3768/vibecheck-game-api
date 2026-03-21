# Action System

- **Service name:** `action-system`
- **Default port:** `41736`
- **Role:** action intake, grouping, inference, queue resolution, xp submission.

## Key Routes

- `POST /api/v1/actions/intake` — ingests raw action events into action pipeline.
- `POST /api/v1/actions/group-window` — groups action events in a time window.
- `POST /api/v1/actions/summarize` — summarizes grouped actions for downstream systems.
- `GET /api/v1/actions/history/:characterId` — returns stored action history.
- `POST /api/v1/actions/infer-skills` — infers likely skill domains from action text.
- `POST /api/v1/actions/check` — validates/normalizes action payload.
- `POST /api/v1/actions/resolve-queue` — resolves pending queued actions.
- `POST /api/v1/actions/submit-to-xp` — transforms action resolution into xp intents.

