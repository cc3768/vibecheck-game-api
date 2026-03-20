# Vibecheck Game API

A TypeScript monorepo scaffold generated from your service map.

## Included services

- client-server (41730)
- login-system (41731)
- chat-system (41732)
- world-system (41733)
- character-system (41734)
- xp-system (41735)
- action-system (41736)
- production-system (41737)
- combat-system (41738)
- npc-system (41739)
- rewards-system (41740)
- quest-system (41741)
- ai-system (41742)
- content-system (41743)
- creation-system (41744)

## Quick start

```bash
npm install
npm run dev:all
```

## Notes

- The gateway forwards gameplay routes plus content and creation endpoints.
- Most state is in-memory so you can test flows immediately.
- Shared contracts and helpers live in `packages/shared/src`.
- Airtable-backed persistence is enabled for accounts, sessions, player presence, world regions, world tiles, world objects, and AI-generated content.
- World storage is 3D-ready: region map uses 12x12 tiles and each region tile can resolve to a 12x12 detail grid (`z` supported, currently used as `0`).


## Install note

This package is intended to install from the public npm registry.
If you ever hit registry or timeout issues, make sure `.npmrc` contains:

```
registry=https://registry.npmjs.org/
```

Then run a fresh install:

```powershell
rmdir /s /q node_modules
del package-lock.json
npm install
```


## Browser Client

A hosted browser client now lives inside `services/client-server/public`. Once the services are running, open `http://127.0.0.1:41730/` to play through the demo loop.

Suggested flow:
1. Login with any username/password, or use `demo` / `demo`.
2. Create or load a character.
3. Enter world.
4. Load nearby NPCs and talk.
5. Accept and progress the starter quest.
6. Record actions, preview XP, and test combat.
