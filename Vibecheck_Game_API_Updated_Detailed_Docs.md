# Vibecheck Game API - Updated Detailed Architecture and API Documentation

Prepared from the provided project bundles and the backend patches applied through the action-intelligence and unidentified-herb changes.

- Version date: March 21, 2026

- Primary backend services documented: client-server gateway, action-system, ai-system, content-system, creation-system

- Canonical content model: Airtable-backed with seed fallback and runtime upsert fallback

## Contents

- 1. Executive summary

- 2. Architecture at a glance

- 3. Data-source strategy and Airtable model

- 4. Action intelligence and discovery rules

- 5. Unidentified herb workflow

- 6. Service-by-service API reference

- 7. Integration dependencies and operational notes

- 8. Example request and response shapes

- Appendix A. Complete route inventory

## Executive summary

The current game backend is now structured around a clearer separation of responsibilities. The action-system owns gameplay resolution, the ai-system interprets player notes and proposes content, the content-system serves canonical world and item data, and the creation-system decides whether a newly inferred item, skill, or recipe should become real. Canonical content is designed to live in Airtable, while seed data and runtime-only upserts keep development usable even when Airtable is not configured.

The biggest behavioral changes in this update are: broad-search actions no longer create junk items from filler words, scouting and foraging can yield observations or opportunities instead of the same result every time, and herb-like discoveries now land as Unidentified Herb first so players can identify them later.

## Architecture at a glance

### Core service roles

| Service | Port | Primary role | Notes |

|---|---:|---|---|

| client-server | 41730 | Gateway and web client host | Serves static client files and forwards API calls to internal services. |

| action-system | 41736 | Gameplay action planner and resolver | Validates actions, builds plans, resolves scouting/foraging/mining/building/crafting, and awards downstream XP previews. |

| ai-system | 41742 | Interpretation and proposal engine | Classifies intent, understands broad search vs. targeted search, proposes items/skills/recipes, and serves prompt templates. |

| content-system | 41743 | Canonical content source | Builds snapshots from Airtable + seeds + runtime content; resolves aliases; exposes unidentified categories. |

| creation-system | 41744 | Canonicalization and persistence gate | Approves or rejects proposed items/skills/recipes and persists them to Airtable or runtime fallback. |

### Primary runtime flow

```

Client -> client-server gateway

       -> action-system builds a plan

       -> ai-system interprets the note and returns understanding + proposals

       -> creation-system decides whether proposals become canonical content

       -> content-system supplies the merged snapshot (seed + Airtable + runtime)

       -> action-system resolves outcome and downstream XP preview

```

This split keeps AI from directly writing truth into the world. AI infers and proposes; creation-system approves or rejects.

## Data-source strategy and Airtable model

### Why Airtable is the canonical content source

- Items, skills, recipes, discoveries, aliases, intent-to-skill mappings, and herb catalog entries belong in Airtable because they are content, not hot-path simulation state.

- content-system merges Airtable data with seeded defaults and runtime-created records. When Airtable is healthy, the snapshot source becomes hybrid. When Airtable is not configured, the system falls back to seed plus runtime memory.

- High-frequency runtime state such as live action queues, combat ticks, or per-frame map updates should stay out of Airtable.

### Airtable configuration

| Variable | Purpose |

|---|---|

| AIRTABLE_API_KEY | Personal access token used for Airtable API calls |

| AIRTABLE_BASE_ID | Base containing canonical content |

| AIRTABLE_TABLE_ITEMS | Items |

| AIRTABLE_TABLE_SKILLS | Skills |

| AIRTABLE_TABLE_RECIPES | Recipes |

| AIRTABLE_TABLE_DISCOVERIES | Discoveries |

| AIRTABLE_TABLE_ALIASES | Aliases |

| AIRTABLE_TABLE_INTENT_SKILLS | Intent Skills |

| AIRTABLE_TABLE_HERB_CATALOG | Herb Catalog |

| INTERNAL_SERVICE_TOKEN | Shared token for internal service-to-service requests |

### Recommended Airtable tables

| Table | Recommended fields |

|---|---|

| Items | itemKey, name, description, category, preferredSkills, requiredTerrain, synonyms, discoverable, status |

| Skills | skillKey, name, description, unlockHint, prereqs, discoverable, status |

| Recipes | recipeKey, name, inputsJson, outputsJson, toolsJson, station, keywords |

| Discoveries | discoveryKey, type, targetKey, aliases, reason, terrainRules, intentRules, confidenceMin, autoCreate, status, skillKey, recipeKey |

| Aliases | alias, canonicalType, canonicalKey, confidenceBoost |

| Intent Skills | intentKey, skills |

| Herb Catalog | key, weight, terrain |

### Snapshot behavior

- content-system caches its assembled snapshot for roughly 30 seconds before rebuilding.

- ai-system also caches the content snapshot for roughly 30 seconds for interpretation work.

- content-system returns source values such as seed or hybrid so the client can display where content is currently coming from.

## Action intelligence and discovery rules

### Core design change

The API now separates action interpretation into intent, objective, target type, target key, broad-search flag, can-create-content flag, search tags, and observation bias. This prevents generic search wording from becoming canonical item names and gives scouting a richer result space than a flat item reward.

### Broad-search protection

- Phrases such as look around, things to collect, something useful, resources, and materials are treated as broad-search language, not item names.

- Broad-search actions set canCreateContent to false, which causes creation-system to refuse canonical creation for that action.

- Generic filler words are filtered through common-word and directive-word sets before any target can be considered valid.

### Practical examples

| Example note | Intent | Objective | Specific target? | Creation allowed? | Expected behavior |

|---|---|---|---|---|---|

| look around | SCOUT | SURVEY_AREA | No | No | Observation, signal, or occasional discovery roll |

| look around for things to collect | SCOUT | FIND_COLLECTIBLES | No | No | Collectible-biased terrain search, but no junk item creation |

| look for flint | SCOUT | FIND_SPECIFIC_RESOURCE | Yes | Yes | May link or create flint if allowed by terrain and aliases |

| forage for herbs | FORAGE | HARVEST_RESOURCE | Broad/generic | Usually no | Finds should collapse to unidentified herb rather than named herb items |

| mine quartz | MINE | FIND_SPECIFIC_RESOURCE | Yes | Yes | Targeted mineral action with possible discovery link |

### Search pools and variability

For broad scouting, action-system uses terrain-based search pools. Each pool can produce an item, a signal, an observation, or nothing. Forest, rock, water, and grass pools each have different collectible sets and flavor text.

## Unidentified herb workflow

### Behavior summary

- Herb-like common names are no longer rewarded directly as fully identified items during discovery.

- Aliases such as mint, moonmint, sunroot, silverleaf, bitterwort, and pine needles now point at the canonical item unidentified_herb first.

- The player can later use the existing IDENTIFY_HERB action flow to convert an unidentified herb into a specific herb result.

### Canonical discovery record

content-system seeds a discovery_unidentified_herb record whose aliases include both generic herb words and common herb names. creation-system also coalesces herb-like proposals into this one canonical item instead of creating a new named herb record every time the player mentions a plant.

### Why this matters

- It removes premature specificity from low-information gather results.

- It gives survival, foraging, herbalism, and future alchemy systems a natural identify loop.

- It prevents the world database from filling up with low-confidence herb variants created from notes.

## Service-by-service API reference

### client-server gateway

| Gateway area | Representative routes | Purpose |

|---|---|---|

| Session | login, logout, me, heartbeat, active players | Forwards auth and active-player queries to login-system. |

| Character | create, load-by-account, stats, skills, knowledge, apply-xp | Forwards character operations to character-system. |

| World | spawn, region, tile, chunk, tile detail, presence, environment queries | Forwards world and presence calls to world-system. |

| NPC / Quest / Rewards | nearby NPCs, interact, quest offers, active quest, reward grant | Gateway fan-out to npc-system, quest-system, and rewards-system. |

| Actions / XP / Production / Combat / Router | action history, intake, grouping, summarize, check, resolve, xp preview, production, combat, router endpoints | Lets the client work through one surface even though the backend is split. |

| AI / Content / Creation | prompt template, discovery, content snapshot, alias lookup, resolve proposals | Exposes backend intelligence and content state to the client. |

| Chat / Services | chat send, channel history, system messages, service status | Utility endpoints and service health pass-through. |

### action-system

| Method | Path | Purpose |

|---|---|---|

| POST | /api/v1/actions/check | Builds an action plan without resolving it. Useful for previews and validation. |

| POST | /api/v1/actions/explain | Returns the interpreted understanding of a note: intent, category, objective, broadSearch, canCreateContent, searchTags, and reasons. |

| POST | /api/v1/actions/resolve-queue | Resolves one or more actions for a character, updates aggregate rewards and vitals, and prepares XP submission data. |

| POST | /api/v1/actions/intake | Normalizes/records action intake information. |

| POST | /api/v1/actions/group-window | Groups actions within a time window. |

| POST | /api/v1/actions/summarize | Creates action summary output for grouped notes. |

| GET | /api/v1/actions/history/:characterId | Returns action history for the character. |

| POST | /api/v1/actions/infer-skills | Infers skill usage from action records. |

| POST | /api/v1/actions/submit-to-xp | Submits action-derived XP information downstream. |

### ai-system

| Method | Path | Purpose |

|---|---|---|

| POST | /api/v1/ai/classify-actions | Classifies actions into higher-level intent groupings. |

| POST | /api/v1/ai/suggest-skill | Suggests likely skills from a note or action payload. |

| POST | /api/v1/ai/understand-action | Returns the structured action-understanding object used to separate broad search from targeted creation. |

| POST | /api/v1/ai/analyze-action | Returns target, confidence, proposals, message, and understanding. This is the main interpretation endpoint used by action-system. |

| POST | /api/v1/ai/discover-content | Returns the first item/skill/recipe content suggestion plus the full proposal list. |

| POST | /api/v1/ai/evaluate-recipe | Rule-based recipe viability feedback. |

| POST | /api/v1/ai/generate-dialogue | NPC dialogue generation with the project prompt rules. |

| POST | /api/v1/ai/generate-quest-text | Quest text generation. |

| POST | /api/v1/ai/summarize-behavior | Behavior summary endpoint. |

| POST | /api/v1/ai/moderate-chat | Light moderation rule pass. |

| GET | /api/v1/ai/prompt-template/:templateKey | Returns prompt templates and in-world guidance text. |

### content-system

| Method | Path | Purpose |

|---|---|---|

| GET | /api/v1/content/snapshot | Returns the merged snapshot of items, dynamicItems, skills, skillPrereqs, intentSkills, herbCatalog, discoveries, aliases, recipes, and source. |

| GET | /api/v1/content/items/:itemKey | Returns canonical item metadata or a fallback label/description for the requested item key. |

| POST | /api/v1/content/find-alias | Finds direct or fuzzy alias matches against the snapshot alias map. |

| GET | /api/v1/content/discoveries | Returns discovery records and alias map. |

| GET | /api/v1/content/unidentified-categories | Returns intentionally unidentified categories, such as the herb-first workflow. |

| POST | /api/v1/content/upsert-runtime | Stores runtime-only item/skill/recipe/discovery/alias additions when Airtable is not the durable path. |

### creation-system

| Method | Path | Purpose |

|---|---|---|

| POST | /api/v1/creation/resolve-proposals | Accepts AI proposals plus intent/context, rejects broad-search creation, links existing canonical records, or persists new ones to Airtable/runtime. |

## Integration dependencies and operational notes

### Expected external services

| Referenced service | Why it matters |

|---|---|

| login-system | Auth login, logout, validate, active players |

| character-system | Character create/load/stats/skills/knowledge/apply XP |

| world-system | Spawn, region/tile/chunk fetches, presence, environment context, structures |

| xp-system | XP preview used by action-system |

| npc-system | Nearby NPCs and interactions |

| quest-system | Quest offers and active quest state |

| rewards-system | Quest and NPC reward grants |

| production-system | Craft, validate, discover recipes |

| combat-system | Combat encounter access |

| router-system | Route fan-out for action/dialogue/quest/combat |

| chat-system | Chat send and history |

### Operational notes

- The provided backend patch set does not by itself make registration, persistent survival stats, or map presence durable; those still depend on login-system, character-system, and world-system support.

- content-system can still be used locally without Airtable, but runtime creations only persist in memory until restart.

- Because client-server forwards many internal services, one slow or unavailable upstream service can affect perceived page-load time unless the client hydrates data progressively.

### Recommended next backend additions

- Persist food, water, sleep, and other survival vitals in character-system rather than only in client state.

- Add a dedicated submit endpoint for immediate single-action execution so the route name matches the gameplay behavior.

- Add more unidentified-category workflows over time: roots, mushrooms, berries, minerals, and artifacts can all follow the same identify-later pattern.

- Expand content-system with first-class endpoints for skills, recipes, and discoveries by key if the client or admin tools need more targeted reads.

## Example request and response shapes

### 1) Understand a broad-search action

```json
{
  "note": "look around for things to collect",
  "intent": "SCOUT",
  "nearbyTerrain": ["forest", "grass"],
  "knownItems": [],
  "knownSkills": []
}
```

Representative outcome:

```json
{
  "intent": "SCOUT",
  "understanding": {
    "objective": "FIND_COLLECTIBLES",
    "targetType": "NONE",
    "targetKey": null,
    "broadSearch": true,
    "canCreateContent": false,
    "searchTags": ["collectible", "plant"],
    "observationBias": "collectibles"
  }
}
```

### 2) Resolve a specific-target proposal

```json
{
  "intent": "MINE",
  "primarySkill": "MINING",
  "nearbyTerrain": ["rock"],
  "note": "look for flint",
  "proposals": [
    {
      "type": "item",
      "key": "flint",
      "confidence": 0.95,
      "aliases": ["flint", "flint stone"]
    }
  ]
}
```

Representative outcome:

```json
{
  "content": {
    "item": { "itemKey": "flint", "name": "Flint" },
    "skill": null,
    "recipe": null,
    "message": "Resolved content for Flint."
  },
  "resolutions": [
    { "type": "item", "key": "flint", "status": "linked_existing" }
  ],
  "source": "airtable"
}
```

### 3) Read the merged content snapshot

```json
{
  "items": { ... },
  "dynamicItems": { ... },
  "skills": { ... },
  "skillPrereqs": { ... },
  "intentSkills": { ... },
  "herbCatalog": [ ... ],
  "discoveries": [ ... ],
  "aliases": { ... },
  "recipes": { ... },
  "source": "hybrid"
}
```

## Appendix A. Complete route inventory

The tables below list routes detected directly from the provided source files. They are useful as a route inventory, while the main body above is the curated reference for behavior.

### action-system

| Method | Path |

|---|---|

| POST | /api/v1/actions/check |

| POST | /api/v1/actions/explain |

| POST | /api/v1/actions/resolve-queue |

| POST | /api/v1/actions/intake |

| POST | /api/v1/actions/group-window |

| POST | /api/v1/actions/summarize |

| GET | /api/v1/actions/history/:characterId |

| POST | /api/v1/actions/infer-skills |

| POST | /api/v1/actions/submit-to-xp |

### ai-system

| Method | Path |

|---|---|

| POST | /api/v1/ai/classify-actions |

| POST | /api/v1/ai/suggest-skill |

| POST | /api/v1/ai/understand-action |

| POST | /api/v1/ai/analyze-action |

| POST | /api/v1/ai/discover-content |

| POST | /api/v1/ai/evaluate-recipe |

| POST | /api/v1/ai/generate-dialogue |

| POST | /api/v1/ai/generate-quest-text |

| POST | /api/v1/ai/summarize-behavior |

| POST | /api/v1/ai/moderate-chat |

| GET | /api/v1/ai/prompt-template/:templateKey |

### content-system

| Method | Path |

|---|---|

| GET | /api/v1/content/snapshot |

| GET | /api/v1/content/items/:itemKey |

| POST | /api/v1/content/find-alias |

| GET | /api/v1/content/discoveries |

| GET | /api/v1/content/unidentified-categories |

| POST | /api/v1/content/upsert-runtime |

### creation-system

| Method | Path |

|---|---|

| POST | /api/v1/creation/resolve-proposals |

### client-server

| Method | Path |

|---|---|

| POST | /api/v1/session/login |

| POST | /api/v1/session/logout |

| POST | /api/v1/session/heartbeat |

| GET | /api/v1/session/me |

| GET | /api/v1/session/active-players/:regionId |

| POST | /api/v1/character/create |

| POST | /api/v1/character/load-by-account |

| POST | /api/v1/character/apply-xp |

| GET | /api/v1/character/:characterId |

| GET | /api/v1/character/:characterId/stats |

| GET | /api/v1/character/:characterId/skills |

| GET | /api/v1/character/:characterId/knowledge |

| GET | /api/v1/world/spawn/:characterId |

| POST | /api/v1/world/presence/update |

| GET | /api/v1/world/presence/region/:regionId |

| GET | /api/v1/world/:worldId/region/:regionId |

| GET | /api/v1/world/:worldId/tile |

| GET | /api/v1/world/:worldId/chunk |

| GET | /api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail |

| POST | /api/v1/world/query-position |

| POST | /api/v1/world/query-resource |

| POST | /api/v1/world/place-structure |

| POST | /api/v1/world/remove-structure |

| POST | /api/v1/world/environment/context |

| GET | /api/v1/npc/nearby |

| GET | /api/v1/npc/:npcId |

| POST | /api/v1/npc/interact |

| POST | /api/v1/quest/offer-from-npc |

| GET | /api/v1/quest/:questId |

| GET | /api/v1/quest/active/:characterId |

| POST | /api/v1/rewards/from-quest |

| POST | /api/v1/rewards/from-npc |

| POST | /api/v1/rewards/grant |

| GET | /api/v1/actions/history/:characterId |

| POST | /api/v1/actions/intake |

| POST | /api/v1/actions/group-window |

| POST | /api/v1/actions/summarize |

| POST | /api/v1/actions/infer-skills |

| POST | /api/v1/actions/check |

| POST | /api/v1/actions/resolve-queue |

| POST | /api/v1/actions/submit-to-xp |

| POST | /api/v1/xp/preview |

| POST | /api/v1/production/craft |

| POST | /api/v1/production/validate |

| POST | /api/v1/production/discover |

| GET | /api/v1/production/recipe/:recipeKey |

| GET | /api/v1/combat/encounter/:encounterId |

| POST | /api/v1/router/action |

| POST | /api/v1/router/dialogue |

| POST | /api/v1/router/quest |

| POST | /api/v1/router/combat |

| POST | /api/v1/ai/generate-dialogue |

| POST | /api/v1/ai/classify-actions |

| POST | /api/v1/ai/suggest-skill |

| POST | /api/v1/ai/discover-content |

| GET | /api/v1/ai/prompt-template/:templateKey |

| GET | /api/v1/content/snapshot |

| GET | /api/v1/content/discoveries |

| GET | /api/v1/content/items/:itemKey |

| POST | /api/v1/content/find-alias |

| POST | /api/v1/creation/resolve-proposals |

| POST | /api/v1/chat/send |

| GET | /api/v1/chat/channel/:channelId/history |

| POST | /api/v1/chat/system-message |

| GET | /api/v1/services/status |
