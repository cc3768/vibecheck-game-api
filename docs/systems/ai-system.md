# AI System

- **Service name:** `ai-system`
- **Default port:** `41742`
- **Role:** LLM-powered classification, recommendations, dialogue, moderation.

## Key Routes

- `POST /api/v1/ai/classify-actions` — classifies action text into intents/types.
- `POST /api/v1/ai/suggest-skill` — suggests skill impacts from context.
- `POST /api/v1/ai/analyze-action` — deep analysis of one action payload.
- `POST /api/v1/ai/discover-content` — proposes dynamic content discoveries.
- `POST /api/v1/ai/evaluate-recipe` — evaluates recipe quality/fit.
- `POST /api/v1/ai/generate-dialogue` — generates dialogue text.
- `POST /api/v1/ai/generate-quest-text` — generates quest narrative text.
- `POST /api/v1/ai/summarize-behavior` — summarizes behavior/event streams.
- `POST /api/v1/ai/moderate-chat` — moderation classification for chat.
- `GET /api/v1/ai/prompt-template/:templateKey` — fetches prompt template.

