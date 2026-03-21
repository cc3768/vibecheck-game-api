# Launch & Core Operations

## Overview

This repository is a TypeScript monorepo with multiple gameplay microservices and one gateway (`client-server`).

## Prerequisites

- Node.js 20+
- npm 10+
- Redis server reachable from this machine

## Environment

Primary environment file: `.env`

Important variables:

- `INTERNAL_SERVICE_TOKEN` (service-to-service auth)
- `REDIS_URL` (Redis connection string)
- `REDIS_KEY_PREFIX` (namespace)
- `REDIS_SCHEMA_LOCK_TTL_MS`, `REDIS_SCHEMA_LOCK_RETRY_MS`, `REDIS_SCHEMA_LOCK_MAX_WAIT_MS`

Logical table names are still configured with `AIRTABLE_*` keys, but storage is Redis-backed.

## Install

```bash
npm install
```

## Launch

### Start all systems

```bash
npm run dev:all
```

### Start one system

Examples:

```bash
npm run dev:client-server
npm run dev:world-system
```

## Health / Smoke

- Gateway service status: `GET /api/v1/services/status`
- World spawn smoke: `GET /api/v1/world/spawn/:characterId`

## Redis Validation

The shared DB layer auto-creates schema metadata and checks for existing structures before adding missing fields.

Concurrency-safe schema setup uses a Redis lock to prevent races between active clients.

## Core Architecture

- `client-server`: API gateway + static web client host.
- `packages/shared`: contracts, env/config, HTTP envelope, Redis-backed persistence helpers.
- domain systems: login, character, world, action, xp, production, combat, npc, quest, rewards, chat, ai, content, creation.

