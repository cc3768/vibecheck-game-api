import {
  AIRTABLE_PLAYER_PRESENCE_TABLE,
  AIRTABLE_WORLD_OBJECTS_TABLE,
  AIRTABLE_WORLD_REGIONS_TABLE,
  AIRTABLE_WORLD_TILES_TABLE,
  SERVICE_VERSION,
  WORLD_NODES,
  WORLD_REGIONS,
  airtableCreateRecord,
  airtableDeleteRecord,
  airtableEnabled,
  airtableEnsureTable,
  airtableFindRecordByField,
  airtableListRecords,
  airtableUpsertByField,
  createServiceApp,
  getRequestId,
  makeId,
  nowIso,
  sendError,
  sendSuccess
} from "../../../packages/shared/src/index";

const SERVICE_NAME = "world-system";
const PORT = 41733;
const app = createServiceApp(SERVICE_NAME);

const REGION_GRID_SIZE = 12;
const TILE_DETAIL_GRID_SIZE = 12;

type WorldObject = {
  id: string;
  worldId: string;
  regionId: string;
  type: string;
  position: { worldId: string; regionId: string; x: number; y: number; z: number };
  subTile?: { x: number; y: number; z: number } | null;
  meta?: Record<string, unknown>;
  recordId?: string;
};

type PresenceSnapshot = {
  presenceKey: string;
  characterId: string;
  accountId: string;
  worldId: string;
  regionId: string;
  x: number;
  y: number;
  z: number;
  updatedAt: string;
};

const localObjects: WorldObject[] = [
  {
    id: "obj_town_board",
    worldId: "world_prime",
    regionId: "starter_lowlands",
    type: "NOTICE_BOARD",
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 },
    meta: { label: "Village Board" }
  }
];

const localPresence = new Map<string, PresenceSnapshot>();
const travelPaths = new Map<string, Record<string, unknown>>();
const discoveredPois = new Map<string, Record<string, unknown>>();
const claims = new Map<string, Record<string, unknown>>();
const shareModes = new Map<string, string>();
let worldTablesReady = false;

function escapeFormulaValue(value: string) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureWorldTables() {
  if (!airtableEnabled() || worldTablesReady) return;

  await airtableEnsureTable(AIRTABLE_WORLD_REGIONS_TABLE, [
    { name: "regionKey", type: "singleLineText" },
    { name: "worldId", type: "singleLineText" },
    { name: "regionId", type: "singleLineText" },
    { name: "name", type: "singleLineText" },
    { name: "biome", type: "singleLineText" },
    { name: "dangerLevel", type: "number", options: { precision: 0 } },
    { name: "gridSize", type: "number", options: { precision: 0 } },
    { name: "detailSize", type: "number", options: { precision: 0 } },
    { name: "seedJson", type: "multilineText" },
    { name: "updatedAt", type: "singleLineText" }
  ]);
  await airtableEnsureTable(AIRTABLE_WORLD_TILES_TABLE, [
    { name: "tileKey", type: "singleLineText" },
    { name: "worldId", type: "singleLineText" },
    { name: "regionId", type: "singleLineText" },
    { name: "layer", type: "singleLineText" },
    { name: "tileX", type: "number", options: { precision: 0 } },
    { name: "tileY", type: "number", options: { precision: 0 } },
    { name: "tileZ", type: "number", options: { precision: 0 } },
    { name: "detailX", type: "number", options: { precision: 0 } },
    { name: "detailY", type: "number", options: { precision: 0 } },
    { name: "detailZ", type: "number", options: { precision: 0 } },
    { name: "chunkX", type: "number", options: { precision: 0 } },
    { name: "chunkY", type: "number", options: { precision: 0 } },
    { name: "size", type: "number", options: { precision: 0 } },
    { name: "parentTileKey", type: "singleLineText" },
    { name: "kind", type: "singleLineText" },
    { name: "walkable", type: "checkbox" },
    { name: "resourceType", type: "singleLineText" },
    { name: "updatedAt", type: "singleLineText" }
  ]);
  await airtableEnsureTable(AIRTABLE_WORLD_OBJECTS_TABLE, [
    { name: "objectId", type: "singleLineText" },
    { name: "worldId", type: "singleLineText" },
    { name: "regionId", type: "singleLineText" },
    { name: "type", type: "singleLineText" },
    { name: "x", type: "number", options: { precision: 0 } },
    { name: "y", type: "number", options: { precision: 0 } },
    { name: "z", type: "number", options: { precision: 0 } },
    { name: "subX", type: "number", options: { precision: 0 } },
    { name: "subY", type: "number", options: { precision: 0 } },
    { name: "subZ", type: "number", options: { precision: 0 } },
    { name: "placedBy", type: "singleLineText" },
    { name: "metaJson", type: "multilineText" },
    { name: "updatedAt", type: "singleLineText" }
  ]);
  await airtableEnsureTable(AIRTABLE_PLAYER_PRESENCE_TABLE, [
    { name: "presenceKey", type: "singleLineText" },
    { name: "characterId", type: "singleLineText" },
    { name: "accountId", type: "singleLineText" },
    { name: "worldId", type: "singleLineText" },
    { name: "regionId", type: "singleLineText" },
    { name: "x", type: "number", options: { precision: 0 } },
    { name: "y", type: "number", options: { precision: 0 } },
    { name: "z", type: "number", options: { precision: 0 } },
    { name: "updatedAt", type: "singleLineText" }
  ]);

  for (const region of WORLD_REGIONS) {
    const regionKey = `${region.worldId}:${region.regionId}`;
    await airtableUpsertByField(AIRTABLE_WORLD_REGIONS_TABLE, "regionKey", regionKey, {
      regionKey,
      worldId: region.worldId,
      regionId: region.regionId,
      name: region.name,
      biome: region.biome,
      dangerLevel: Number(region.dangerLevel ?? 1),
      gridSize: REGION_GRID_SIZE,
      detailSize: TILE_DETAIL_GRID_SIZE,
      seedJson: JSON.stringify(region),
      updatedAt: nowIso()
    });
  }

  const existingBoard = await airtableFindRecordByField<Record<string, unknown>>(AIRTABLE_WORLD_OBJECTS_TABLE, "objectId", "obj_town_board");
  if (!existingBoard) {
    await airtableCreateRecord<Record<string, unknown>>(AIRTABLE_WORLD_OBJECTS_TABLE, {
      objectId: "obj_town_board",
      worldId: "world_prime",
      regionId: "starter_lowlands",
      type: "NOTICE_BOARD",
      x: 0,
      y: 0,
      z: 0,
      subX: 0,
      subY: 0,
      subZ: 0,
      placedBy: "system",
      metaJson: JSON.stringify({ label: "Village Board" }),
      updatedAt: nowIso()
    });
  }

  worldTablesReady = true;
}

function regionFor(worldId: string, regionId: string) {
  return WORLD_REGIONS.find((r) => r.worldId === worldId && r.regionId === regionId) ?? WORLD_REGIONS[0];
}

function seededNoise(regionId: string, x: number, y: number, z = 0) {
  const source = `${regionId}:${x}:${y}:${z}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function terrainFor(regionId: string, x: number, y: number, z = 0) {
  const n = seededNoise(regionId, x, y, z);
  const w = seededNoise(`${regionId}:water`, x, y, z);
  const r = seededNoise(`${regionId}:rock`, x, y, z);

  if (regionId === "whisper_woods") {
    if (w > 0.83 || Math.abs((x % 7) - 3) + Math.abs((y % 9) - 4) < 2) {
      return { kind: "water", walkable: false, resourceType: null };
    }
    if (r > 0.84) {
      return { kind: "rock", walkable: true, resourceType: "IRON_VEIN" };
    }
    if (n > 0.18) {
      return { kind: "forest", walkable: true, resourceType: "TREE" };
    }
    return { kind: "grass", walkable: true, resourceType: null };
  }

  if (w > 0.9 || (Math.abs((x % 11) - 5) === 0 && Math.abs((y % 11) - 5) < 2)) {
    return { kind: "water", walkable: false, resourceType: null };
  }
  if (r > 0.78 || (x + y) % 13 === 0) {
    return { kind: "rock", walkable: true, resourceType: "STONE" };
  }
  if (n > 0.88) {
    return { kind: "forest", walkable: true, resourceType: "TREE" };
  }
  return { kind: "grass", walkable: true, resourceType: null };
}

type PersistedTile = {
  worldId: string;
  regionId: string;
  layer: "REGION" | "DETAIL";
  x: number;
  y: number;
  z: number;
  kind: string;
  walkable: boolean;
  resourceType: string | null;
  chunkX: number;
  chunkY: number;
  size: number;
  detailX: number;
  detailY: number;
  detailZ: number;
  parentTileKey: string;
};

function tileFor(worldId: string, regionId: string, x: number, y: number, z = 0): PersistedTile {
  const terrain = terrainFor(regionId, x, y, z);
  return {
    worldId,
    regionId,
    layer: "REGION",
    x,
    y,
    z,
    kind: terrain.kind,
    walkable: terrain.walkable,
    resourceType: terrain.resourceType,
    chunkX: Math.floor(x / REGION_GRID_SIZE),
    chunkY: Math.floor(y / REGION_GRID_SIZE),
    size: REGION_GRID_SIZE,
    detailX: 0,
    detailY: 0,
    detailZ: 0,
    parentTileKey: ""
  };
}

function tileKey(tile: PersistedTile) {
  return `${tile.worldId}:${tile.regionId}:${tile.layer}:${tile.x}:${tile.y}:${tile.z}:${tile.detailX}:${tile.detailY}:${tile.detailZ}:${tile.parentTileKey || "root"}`;
}

async function persistTile(tile: PersistedTile) {
  if (!airtableEnabled()) return;
  await ensureWorldTables();
  await airtableUpsertByField(AIRTABLE_WORLD_TILES_TABLE, "tileKey", tileKey(tile), {
    tileKey: tileKey(tile),
    worldId: tile.worldId,
    regionId: tile.regionId,
    layer: tile.layer,
    tileX: tile.x,
    tileY: tile.y,
    tileZ: tile.z,
    detailX: tile.detailX,
    detailY: tile.detailY,
    detailZ: tile.detailZ,
    chunkX: tile.chunkX,
    chunkY: tile.chunkY,
    size: tile.size,
    parentTileKey: tile.parentTileKey,
    kind: tile.kind,
    walkable: tile.walkable,
    resourceType: tile.resourceType ?? "",
    updatedAt: nowIso()
  });
}

async function loadRegionObjects(worldId: string, regionId: string): Promise<WorldObject[]> {
  if (!airtableEnabled()) {
    return localObjects.filter((item) => item.worldId === worldId && item.regionId === regionId);
  }

  await ensureWorldTables();
  const formula = `AND({worldId}='${escapeFormulaValue(worldId)}',{regionId}='${escapeFormulaValue(regionId)}')`;
  const result = await airtableListRecords<Record<string, unknown>>(AIRTABLE_WORLD_OBJECTS_TABLE, { filterByFormula: formula });
  return result.records.map((record) => ({
    id: String(record.fields.objectId ?? record.id),
    worldId: String(record.fields.worldId ?? worldId),
    regionId: String(record.fields.regionId ?? regionId),
    type: String(record.fields.type ?? "MARKER"),
    position: {
      worldId: String(record.fields.worldId ?? worldId),
      regionId: String(record.fields.regionId ?? regionId),
      x: Number(record.fields.x ?? 0),
      y: Number(record.fields.y ?? 0),
      z: Number(record.fields.z ?? 0)
    },
    subTile: {
      x: Number(record.fields.subX ?? 0),
      y: Number(record.fields.subY ?? 0),
      z: Number(record.fields.subZ ?? 0)
    },
    meta: parseJson<Record<string, unknown>>(record.fields.metaJson, {}),
    recordId: record.id
  }));
}

async function listPresence(worldId: string, regionId: string) {
  const freshnessMs = 1000 * 60 * 2;
  const cutoff = Date.now() - freshnessMs;

  if (!airtableEnabled()) {
    return Array.from(localPresence.values()).filter((entry) => entry.worldId === worldId && entry.regionId === regionId && new Date(entry.updatedAt).getTime() >= cutoff);
  }

  await ensureWorldTables();
  const formula = `AND({worldId}='${escapeFormulaValue(worldId)}',{regionId}='${escapeFormulaValue(regionId)}')`;
  const result = await airtableListRecords<Record<string, unknown>>(AIRTABLE_PLAYER_PRESENCE_TABLE, { filterByFormula: formula });
  return result.records
    .map((record) => ({
      presenceKey: String(record.fields.presenceKey ?? record.fields.characterId ?? record.id),
      characterId: String(record.fields.characterId ?? ""),
      accountId: String(record.fields.accountId ?? ""),
      worldId: String(record.fields.worldId ?? worldId),
      regionId: String(record.fields.regionId ?? regionId),
      x: Number(record.fields.x ?? 0),
      y: Number(record.fields.y ?? 0),
      z: Number(record.fields.z ?? 0),
      updatedAt: String(record.fields.updatedAt ?? nowIso())
    }))
    .filter((entry) => new Date(entry.updatedAt).getTime() >= cutoff);
}

async function upsertPresence(snapshot: PresenceSnapshot) {
  if (!airtableEnabled()) {
    localPresence.set(snapshot.presenceKey, snapshot);
    return;
  }

  await ensureWorldTables();
  await airtableUpsertByField(AIRTABLE_PLAYER_PRESENCE_TABLE, "presenceKey", snapshot.presenceKey, {
    ...snapshot,
    updatedAt: nowIso()
  });
}

async function chunkFor(worldId: string, regionId: string, chunkX: number, chunkY: number, size: number, z = 0) {
  const minX = chunkX * size;
  const minY = chunkY * size;
  const maxX = minX + size - 1;
  const maxY = minY + size - 1;
  const tiles: PersistedTile[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push(tileFor(worldId, regionId, x, y, z));
    }
  }

  if (airtableEnabled()) {
    await Promise.all(tiles.map((tile) => persistTile(tile).catch(() => null)));
  }

  const allObjects = await loadRegionObjects(worldId, regionId);
  const chunkObjects = allObjects.filter(
    (object) =>
      object.position.x >= minX &&
      object.position.x <= maxX &&
      object.position.y >= minY &&
      object.position.y <= maxY &&
      object.position.z === z
  );

  return {
    worldId,
    regionId,
    chunkX,
    chunkY,
    z,
    size,
    bounds: { minX, minY, maxX, maxY },
    tiles,
    objects: chunkObjects
  };
}

app.post("/api/v1/world/presence/update", async (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body.position ?? {};
  const snapshot: PresenceSnapshot = {
    presenceKey: String(req.body.presenceKey ?? req.body.characterId ?? ""),
    characterId: String(req.body.characterId ?? ""),
    accountId: String(req.body.accountId ?? ""),
    worldId: String(position.worldId ?? req.body.worldId ?? "world_prime"),
    regionId: String(position.regionId ?? req.body.regionId ?? "starter_lowlands"),
    x: Number(position.x ?? req.body.x ?? 0),
    y: Number(position.y ?? req.body.y ?? 0),
    z: Number(position.z ?? req.body.z ?? 0),
    updatedAt: nowIso()
  };

  await upsertPresence(snapshot);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: true, presence: snapshot });
});

app.get("/api/v1/world/presence/region/:regionId", async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.query.worldId ?? "world_prime");
  const regionId = String(req.params.regionId ?? "starter_lowlands");
  const players = await listPresence(worldId, regionId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { worldId, regionId, players, count: players.length });
});

app.get("/api/v1/world/:worldId/region/:regionId", async (req, res) => {
  const requestId = getRequestId(req);
  const region = regionFor(req.params.worldId, req.params.regionId) ?? null;
  if (airtableEnabled()) {
    await ensureWorldTables().catch(() => null);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    region,
    mapModel: {
      regionGridSize: REGION_GRID_SIZE,
      tileDetailGridSize: TILE_DETAIL_GRID_SIZE,
      axis: { x: "east-west", y: "north-south", z: "vertical" }
    }
  });
});

app.get("/api/v1/world/:worldId/tile", async (req, res) => {
  const requestId = getRequestId(req);
  const x = Number(req.query.x ?? 0);
  const y = Number(req.query.y ?? 0);
  const z = Number(req.query.z ?? 0);
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const tile = tileFor(req.params.worldId, regionId, x, y, z);
  await persistTile(tile).catch(() => null);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tile });
});

app.get("/api/v1/world/:worldId/chunk", async (req, res) => {
  const requestId = getRequestId(req);
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const chunkX = Number(req.query.chunkX ?? 0);
  const chunkY = Number(req.query.chunkY ?? 0);
  const z = Number(req.query.z ?? 0);
  const size = Math.max(8, Math.min(20, Number(req.query.size ?? REGION_GRID_SIZE)));
  const chunk = await chunkFor(req.params.worldId, regionId, chunkX, chunkY, size, z);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { chunk });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/detail", async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = req.params.worldId;
  const regionId = req.params.regionId;
  const tileX = Number(req.params.tileX);
  const tileY = Number(req.params.tileY);
  const tileZ = Number(req.query.z ?? 0);
  const requestedSize = Math.max(6, Math.min(24, Number(req.query.size ?? TILE_DETAIL_GRID_SIZE)));
  const size = Math.min(requestedSize, TILE_DETAIL_GRID_SIZE);
  if (requestedSize !== size) {
    console.warn(
      `[${SERVICE_NAME}] requested detail size ${requestedSize} exceeds canonical ${TILE_DETAIL_GRID_SIZE}; clamping to ${size}`
    );
  }
  const parentTile = tileFor(worldId, regionId, tileX, tileY, tileZ);
  const parentTileKey = tileKey(parentTile);
  const detailTiles: PersistedTile[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const globalX = tileX * TILE_DETAIL_GRID_SIZE + x;
      const globalY = tileY * TILE_DETAIL_GRID_SIZE + y;
      const terrain = terrainFor(regionId, globalX, globalY, tileZ);
      detailTiles.push({
        worldId,
        regionId,
        layer: "DETAIL",
        x: globalX,
        y: globalY,
        z: tileZ,
        kind: terrain.kind,
        walkable: terrain.walkable,
        resourceType: terrain.resourceType,
        chunkX: tileX,
        chunkY: tileY,
        size,
        detailX: x,
        detailY: y,
        detailZ: 0,
        parentTileKey
      });
    }
  }

  if (airtableEnabled()) {
    await persistTile(parentTile).catch(() => null);
    await Promise.all(detailTiles.map((tile) => persistTile(tile).catch(() => null)));
  }

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    parentTile,
    model: { detailSize: size, zAxisEnabled: true },
    detail: {
      tileX,
      tileY,
      tileZ,
      size,
      tiles: detailTiles
    }
  });
});

app.post("/api/v1/world/query-position", async (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 };
  const region = regionFor(String(position.worldId), String(position.regionId));
  const tile = tileFor(String(position.worldId), String(position.regionId), Number(position.x ?? 0), Number(position.y ?? 0), Number(position.z ?? 0));
  await persistTile(tile).catch(() => null);

  const regionObjects = await loadRegionObjects(String(position.worldId), String(position.regionId));
  const nearbyObjects = regionObjects.filter(
    (object) =>
      Math.abs(object.position.x - Number(position.x ?? 0)) <= 2 &&
      Math.abs(object.position.y - Number(position.y ?? 0)) <= 2 &&
      Math.abs(object.position.z - Number(position.z ?? 0)) <= 1
  );

  const nearbyPlayers = (await listPresence(String(position.worldId), String(position.regionId))).filter(
    (player) =>
      Math.abs(player.x - Number(position.x ?? 0)) <= 4 &&
      Math.abs(player.y - Number(position.y ?? 0)) <= 4 &&
      Math.abs(player.z - Number(position.z ?? 0)) <= 1
  );

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { region, tile, nearbyObjects, nearbyPlayers });
});

app.post("/api/v1/world/query-resource", (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.body.worldId ?? "world_prime");
  const regionId = String(req.body.regionId ?? "starter_lowlands");
  const x = Number(req.body.x ?? 0);
  const y = Number(req.body.y ?? 0);
  const z = Number(req.body.z ?? 0);
  const generated = [] as Array<{ nodeId: string; type: string; position: { worldId: string; regionId: string; x: number; y: number; z: number } }>;

  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      const tile = tileFor(worldId, regionId, x + offsetX, y + offsetY, z);
      if (tile.resourceType) {
        generated.push({
          nodeId: `gen_${tile.resourceType.toLowerCase()}_${tile.x}_${tile.y}_${tile.z}`,
          type: tile.resourceType,
          position: { worldId, regionId, x: tile.x, y: tile.y, z: tile.z }
        });
      }
    }
  }

  const staticNodes = WORLD_NODES.filter(
    (node) =>
      node.position.worldId === worldId &&
      node.position.regionId === regionId &&
      (!req.body.resourceType || node.type === req.body.resourceType)
  );

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { nodes: [...staticNodes, ...generated] });
});

app.post("/api/v1/world/place-structure", async (req, res) => {
  const requestId = getRequestId(req);
  const structureId = makeId("structure");
  const position = {
    worldId: String(req.body.position?.worldId ?? req.body.worldId ?? "world_prime"),
    regionId: String(req.body.position?.regionId ?? req.body.regionId ?? "starter_lowlands"),
    x: Number(req.body.position?.x ?? 0),
    y: Number(req.body.position?.y ?? 0),
    z: Number(req.body.position?.z ?? 0)
  };
  const subTile = req.body.subTile
    ? {
        x: Number(req.body.subTile.x ?? 0),
        y: Number(req.body.subTile.y ?? 0),
        z: Number(req.body.subTile.z ?? 0)
      }
    : null;

  const payload: WorldObject = {
    id: structureId,
    worldId: String(req.body.worldId ?? position.worldId),
    regionId: String(req.body.regionId ?? position.regionId),
    type: String(req.body.structureType ?? "MARKER"),
    position,
    subTile,
    meta: {
      note: req.body.note ?? null,
      placedBy: req.body.characterId ?? null,
      actionText: req.body.actionText ?? null
    }
  };

  if (!airtableEnabled()) {
    localObjects.push(payload);
  } else {
    await ensureWorldTables();
    await airtableUpsertByField(AIRTABLE_WORLD_OBJECTS_TABLE, "objectId", structureId, {
      objectId: structureId,
      worldId: payload.worldId,
      regionId: payload.regionId,
      type: payload.type,
      x: payload.position.x,
      y: payload.position.y,
      z: payload.position.z,
      subX: payload.subTile?.x ?? 0,
      subY: payload.subTile?.y ?? 0,
      subZ: payload.subTile?.z ?? 0,
      placedBy: String(req.body.characterId ?? ""),
      metaJson: JSON.stringify(payload.meta ?? {}),
      updatedAt: nowIso()
    });
  }

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { created: true, structureId, position, subTile });
});

app.post("/api/v1/world/remove-structure", async (req, res) => {
  const requestId = getRequestId(req);
  const x = Number(req.body.position?.x ?? Number.NaN);
  const y = Number(req.body.position?.y ?? Number.NaN);
  const z = Number(req.body.position?.z ?? 0);
  const regionId = String(req.body.position?.regionId ?? req.body.regionId ?? "starter_lowlands");
  const worldId = String(req.body.position?.worldId ?? req.body.worldId ?? "world_prime");

  if (!airtableEnabled()) {
    const idx = localObjects.findIndex(
      (object) =>
        object.id === req.body.structureId ||
        (object.worldId === worldId && object.regionId === regionId && object.position.x === x && object.position.y === y && object.position.z === z)
    );
    if (idx >= 0) localObjects.splice(idx, 1);
    return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { removed: idx >= 0 });
  }

  await ensureWorldTables();
  let recordId = "";
  if (req.body.structureId) {
    const hit = await airtableFindRecordByField<Record<string, unknown>>(AIRTABLE_WORLD_OBJECTS_TABLE, "objectId", String(req.body.structureId));
    recordId = hit?.id ?? "";
  } else if (!Number.isNaN(x) && !Number.isNaN(y)) {
    const formula = `AND({worldId}='${escapeFormulaValue(worldId)}',{regionId}='${escapeFormulaValue(regionId)}',{x}=${x},{y}=${y},{z}=${z})`;
    const result = await airtableListRecords<Record<string, unknown>>(AIRTABLE_WORLD_OBJECTS_TABLE, { filterByFormula: formula, maxRecords: "1" });
    recordId = result.records[0]?.id ?? "";
  }

  if (recordId) {
    await airtableDeleteRecord(AIRTABLE_WORLD_OBJECTS_TABLE, recordId);
  }

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { removed: Boolean(recordId) });
});

app.post("/api/v1/world/update-object", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: true, object: req.body });
});

app.get("/api/v1/world/spawn/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    characterId: req.params.characterId,
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 1, y: 1, z: 0 },
    mapModel: {
      regionGridSize: REGION_GRID_SIZE,
      tileDetailGridSize: TILE_DETAIL_GRID_SIZE,
      zAxisEnabled: true
    }
  });
});

app.post("/api/v1/world/environment/context", (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body.position ?? { worldId: "world_prime", regionId: "starter_lowlands" };
  const region = regionFor(String(position.worldId ?? "world_prime"), String(position.regionId ?? "starter_lowlands"));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    biome: region.biome,
    weather: region.regionId === "whisper_woods" ? "MIST" : "CLEAR",
    dangerLevel: region.dangerLevel,
    mapModel: { regionGridSize: REGION_GRID_SIZE, tileDetailGridSize: TILE_DETAIL_GRID_SIZE, zAxisEnabled: true }
  });
});


function allActivePresence() {
  return Array.from(localPresence.values()).filter((entry) => Date.now() - new Date(entry.updatedAt).getTime() <= 1000 * 60 * 2);
}

function findPresenceByCharacter(characterId: string) {
  return allActivePresence().find((entry) => entry.characterId === characterId) ?? null;
}

function listPresenceForWorld(worldId: string) {
  return allActivePresence().filter((entry) => entry.worldId === worldId);
}

function regionWeather(regionId: string) {
  if (regionId === "whisper_woods") return { current: "MIST", forecast: ["MIST", "LIGHT_RAIN", "CLEAR"] };
  return { current: "CLEAR", forecast: ["CLEAR", "BREEZY", "CLEAR"] };
}

function adjacentRegions(worldId: string, regionId: string) {
  const regions = WORLD_REGIONS.filter((entry) => entry.worldId === worldId);
  const index = Math.max(0, regions.findIndex((entry) => entry.regionId === regionId));
  return [regions[index - 1], regions[index + 1]].filter(Boolean);
}

function simplePath(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), Math.abs(to.z - from.z), 1);
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    points.push({
      x: Math.round(from.x + (to.x - from.x) * ratio),
      y: Math.round(from.y + (to.y - from.y) * ratio),
      z: Math.round(from.z + (to.z - from.z) * ratio)
    });
  }
  return points;
}

function tileProjectionPayload(worldId: string, regionId: string, tileX: number, tileY: number, tileZ = 0) {
  const tile = tileFor(worldId, regionId, tileX, tileY, tileZ);
  return {
    tile,
    zoomedFrom: { regionTileX: tileX, regionTileY: tileY },
    detailOrigin: { x: tileX * TILE_DETAIL_GRID_SIZE, y: tileY * TILE_DETAIL_GRID_SIZE, z: tileZ },
    detailSize: TILE_DETAIL_GRID_SIZE,
    terrainKind: tile.kind,
    resourceType: tile.resourceType,
    walkable: tile.walkable
  };
}

function minimapPayload(worldId: string, regionId: string, tileX: number, tileY: number, tileZ = 0) {
  const rows: Array<Array<Record<string, unknown>>> = [];
  for (let y = tileY - 1; y <= tileY + 1; y += 1) {
    const row: Array<Record<string, unknown>> = [];
    for (let x = tileX - 1; x <= tileX + 1; x += 1) {
      const tile = tileFor(worldId, regionId, x, y, tileZ);
      row.push({ x, y, kind: tile.kind, walkable: tile.walkable, resourceType: tile.resourceType, focus: x === tileX && y === tileY });
    }
    rows.push(row);
  }
  return { rows, focus: { x: tileX, y: tileY, z: tileZ } };
}

async function occupantsForTile(worldId: string, regionId: string, tileX: number, tileY: number, tileZ = 0) {
  const players = (await listPresence(worldId, regionId)).filter((entry) => Number(entry.x) === tileX && Number(entry.y) === tileY && Number(entry.z) === tileZ);
  const objects = (await loadRegionObjects(worldId, regionId)).filter((entry) => entry.position.x === tileX && entry.position.y === tileY && entry.position.z === tileZ);
  return { players, objects };
}

async function nearbyPoi(worldId: string, regionId: string, x: number, y: number) {
  return Array.from(discoveredPois.values()).filter((entry) => String(entry.worldId ?? "") === worldId && String(entry.regionId ?? "") === regionId && Math.abs(Number(entry.x ?? 0) - x) <= 6 && Math.abs(Number(entry.y ?? 0) - y) <= 6);
}


app.post("/api/v1/world/travel/validate", async (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body?.to ?? req.body?.position ?? req.body ?? {};
  const worldId = String(position.worldId ?? "world_prime");
  const regionId = String(position.regionId ?? "starter_lowlands");
  const x = Number(position.x ?? 0);
  const y = Number(position.y ?? 0);
  const z = Number(position.z ?? 0);
  const tile = tileFor(worldId, regionId, x, y, z);
  if (!tile.walkable) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "TRAVEL_BLOCKED", "Target tile is not walkable", 409, { tile });
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { valid: true, tile, cost: 1, warnings: [] });
});

app.post("/api/v1/world/travel/move", async (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body?.characterId ?? "");
  const accountId = String(req.body?.accountId ?? "");
  const position = req.body?.to ?? req.body?.position ?? req.body ?? {};
  const worldId = String(position.worldId ?? "world_prime");
  const regionId = String(position.regionId ?? "starter_lowlands");
  const x = Number(position.x ?? 0);
  const y = Number(position.y ?? 0);
  const z = Number(position.z ?? 0);
  const tile = tileFor(worldId, regionId, x, y, z);
  if (!tile.walkable) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "TRAVEL_BLOCKED", "Target tile is not walkable", 409, { tile });
  }
  const snapshot: PresenceSnapshot = { presenceKey: characterId || makeId("presence"), characterId, accountId, worldId, regionId, x, y, z, updatedAt: nowIso() };
  await upsertPresence(snapshot);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { moved: true, presence: snapshot, tile });
});

app.post("/api/v1/world/travel/path", async (req, res) => {
  const requestId = getRequestId(req);
  const from = req.body?.from ?? { x: 0, y: 0, z: 0 };
  const to = req.body?.to ?? { x: 0, y: 0, z: 0 };
  const worldId = String(req.body?.worldId ?? from.worldId ?? to.worldId ?? "world_prime");
  const regionId = String(req.body?.regionId ?? from.regionId ?? to.regionId ?? "starter_lowlands");
  const pathId = makeId("path");
  const points = simplePath({ x: Number(from.x ?? 0), y: Number(from.y ?? 0), z: Number(from.z ?? 0) }, { x: Number(to.x ?? 0), y: Number(to.y ?? 0), z: Number(to.z ?? 0) });
  const payload = { pathId, worldId, regionId, from, to, points, createdAt: nowIso() };
  travelPaths.set(pathId, payload);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, payload, 201);
});

app.get("/api/v1/world/travel/path/:pathId", async (req, res) => {
  const requestId = getRequestId(req);
  const path = travelPaths.get(String(req.params.pathId ?? "")) ?? null;
  if (!path) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "PATH_NOT_FOUND", "Travel path not found", 404);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { path });
});

app.get("/api/v1/world/:worldId/region/:regionId/summary", async (req, res) => {
  const requestId = getRequestId(req);
  const region = regionFor(req.params.worldId, req.params.regionId);
  const players = await listPresence(req.params.worldId, req.params.regionId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { region, playerCount: players.length, weather: regionWeather(region.regionId), adjacent: adjacentRegions(region.worldId, region.regionId) });
});

app.get("/api/v1/world/:worldId/region/:regionId/players", async (req, res) => {
  const requestId = getRequestId(req);
  const players = await listPresence(req.params.worldId, req.params.regionId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { players, count: players.length });
});

app.get("/api/v1/world/:worldId/region/:regionId/resources", async (req, res) => {
  const requestId = getRequestId(req);
  const resources: Array<Record<string, unknown>> = [];
  for (let y = 0; y < REGION_GRID_SIZE; y += 1) {
    for (let x = 0; x < REGION_GRID_SIZE; x += 1) {
      const tile = tileFor(req.params.worldId, req.params.regionId, x, y, 0);
      if (tile.resourceType) resources.push({ x, y, z: 0, resourceType: tile.resourceType, kind: tile.kind });
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { resources });
});

app.get("/api/v1/world/:worldId/region/:regionId/events", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { events: [{ eventKey: `ambient_${req.params.regionId}`, type: "AMBIENT", note: `Ambient activity in ${req.params.regionId}` }] });
});

app.get("/api/v1/world/:worldId/region/:regionId/weather", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { weather: regionWeather(req.params.regionId).current });
});

app.get("/api/v1/world/:worldId/region/:regionId/weather/forecast", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { forecast: regionWeather(req.params.regionId).forecast });
});

app.get("/api/v1/world/:worldId/region/:regionId/legend", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { legend: [{ kind: "grass", walkable: true }, { kind: "forest", walkable: true }, { kind: "rock", walkable: true }, { kind: "water", walkable: false }] });
});

app.get("/api/v1/world/:worldId/region/:regionId/adjacent", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { adjacent: adjacentRegions(req.params.worldId, req.params.regionId) });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/summary", async (req, res) => {
  const requestId = getRequestId(req);
  const tileX = Number(req.params.tileX);
  const tileY = Number(req.params.tileY);
  const tileZ = Number(req.query.z ?? 0);
  const tile = tileFor(req.params.worldId, req.params.regionId, tileX, tileY, tileZ);
  const occupants = await occupantsForTile(req.params.worldId, req.params.regionId, tileX, tileY, tileZ);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tile, occupants });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/occupants", async (req, res) => {
  const requestId = getRequestId(req);
  const payload = await occupantsForTile(req.params.worldId, req.params.regionId, Number(req.params.tileX), Number(req.params.tileY), Number(req.query.z ?? 0));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, payload);
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/resources", async (req, res) => {
  const requestId = getRequestId(req);
  const tile = tileFor(req.params.worldId, req.params.regionId, Number(req.params.tileX), Number(req.params.tileY), Number(req.query.z ?? 0));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { resources: tile.resourceType ? [{ resourceType: tile.resourceType, x: tile.x, y: tile.y, z: tile.z }] : [] });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/structures", async (req, res) => {
  const requestId = getRequestId(req);
  const objects = (await loadRegionObjects(req.params.worldId, req.params.regionId)).filter((entry) => entry.position.x === Number(req.params.tileX) && entry.position.y === Number(req.params.tileY) && entry.position.z === Number(req.query.z ?? 0));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { structures: objects });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/visibility", async (req, res) => {
  const requestId = getRequestId(req);
  const tile = tileFor(req.params.worldId, req.params.regionId, Number(req.params.tileX), Number(req.params.tileY), Number(req.query.z ?? 0));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { visible: tile.walkable, fogged: false, tile });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/projection", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { projection: tileProjectionPayload(req.params.worldId, req.params.regionId, Number(req.params.tileX), Number(req.params.tileY), Number(req.query.z ?? 0)) });
});

app.get("/api/v1/world/:worldId/region/:regionId/tile/:tileX/:tileY/minimap", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { minimap: minimapPayload(req.params.worldId, req.params.regionId, Number(req.params.tileX), Number(req.params.tileY), Number(req.query.z ?? 0)) });
});

app.post("/api/v1/world/fog-of-war/reveal", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revealed: true, tiles: req.body?.tiles ?? [] });
});

app.post("/api/v1/world/fog-of-war/update", async (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: true, payload: req.body ?? {} });
});

app.post("/api/v1/world/scout", async (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body?.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 };
  const resources = [] as Array<Record<string, unknown>>;
  for (let y = Number(position.y ?? 0) - 2; y <= Number(position.y ?? 0) + 2; y += 1) {
    for (let x = Number(position.x ?? 0) - 2; x <= Number(position.x ?? 0) + 2; x += 1) {
      const tile = tileFor(String(position.worldId), String(position.regionId), x, y, Number(position.z ?? 0));
      if (tile.resourceType) resources.push({ x, y, resourceType: tile.resourceType, kind: tile.kind });
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { scouted: true, resources, weather: regionWeather(String(position.regionId)).current });
});

app.post("/api/v1/world/discover-poi", async (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body?.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, z: 0 };
  const poiId = makeId("poi");
  const poi = { poiId, worldId: String(position.worldId), regionId: String(position.regionId), x: Number(position.x ?? 0), y: Number(position.y ?? 0), z: Number(position.z ?? 0), label: String(req.body?.label ?? `POI ${poiId}`), discoveredAt: nowIso() };
  discoveredPois.set(poiId, poi);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { poi }, 201);
});

app.get("/api/v1/world/poi/:poiId", async (req, res) => {
  const requestId = getRequestId(req);
  const poi = discoveredPois.get(String(req.params.poiId ?? "")) ?? null;
  if (!poi) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "POI_NOT_FOUND", "Point of interest not found", 404);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { poi });
});

app.get("/api/v1/world/poi/nearby", async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.query.worldId ?? "world_prime");
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const x = Number(req.query.x ?? 0);
  const y = Number(req.query.y ?? 0);
  const pois = await nearbyPoi(worldId, regionId, x, y);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { pois, count: pois.length });
});

app.post("/api/v1/world/claim", async (req, res) => {
  const requestId = getRequestId(req);
  const claimKey = `${String(req.body?.worldId ?? "world_prime")}:${String(req.body?.regionId ?? "starter_lowlands")}:${Number(req.body?.x ?? 0)}:${Number(req.body?.y ?? 0)}:${Number(req.body?.z ?? 0)}`;
  const claim = { claimKey, ownerCharacterId: String(req.body?.characterId ?? ""), worldId: String(req.body?.worldId ?? "world_prime"), regionId: String(req.body?.regionId ?? "starter_lowlands"), x: Number(req.body?.x ?? 0), y: Number(req.body?.y ?? 0), z: Number(req.body?.z ?? 0), claimedAt: nowIso() };
  claims.set(claimKey, claim);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { claimed: true, claim });
});

app.post("/api/v1/world/unclaim", async (req, res) => {
  const requestId = getRequestId(req);
  const claimKey = `${String(req.body?.worldId ?? "world_prime")}:${String(req.body?.regionId ?? "starter_lowlands")}:${Number(req.body?.x ?? 0)}:${Number(req.body?.y ?? 0)}:${Number(req.body?.z ?? 0)}`;
  claims.delete(claimKey);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { unclaimed: true, claimKey });
});

app.post("/api/v1/world/presence/batch", async (req, res) => {
  const requestId = getRequestId(req);
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const applied: PresenceSnapshot[] = [];
  for (const entry of entries) {
    const snapshot: PresenceSnapshot = {
      presenceKey: String(entry.presenceKey ?? entry.characterId ?? makeId("presence")),
      characterId: String(entry.characterId ?? ""),
      accountId: String(entry.accountId ?? ""),
      worldId: String(entry.worldId ?? entry.position?.worldId ?? "world_prime"),
      regionId: String(entry.regionId ?? entry.position?.regionId ?? "starter_lowlands"),
      x: Number(entry.x ?? entry.position?.x ?? 0),
      y: Number(entry.y ?? entry.position?.y ?? 0),
      z: Number(entry.z ?? entry.position?.z ?? 0),
      updatedAt: nowIso()
    };
    await upsertPresence(snapshot);
    applied.push(snapshot);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: applied.length, entries: applied });
});

app.get("/api/v1/world/presence/world/:worldId", async (req, res) => {
  const requestId = getRequestId(req);
  const players = listPresenceForWorld(String(req.params.worldId ?? "world_prime"));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { worldId: req.params.worldId, players, count: players.length });
});

app.get("/api/v1/world/presence/character/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  const presence = findPresenceByCharacter(String(req.params.characterId ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { presence, shareMode: shareModes.get(String(req.params.characterId ?? "")) ?? "world" });
});

app.post("/api/v1/world/presence/share-mode", async (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body?.characterId ?? "");
  const mode = String(req.body?.mode ?? "world");
  shareModes.set(characterId, mode);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId, mode });
});

app.post("/api/v1/world/presence/heartbeat", async (req, res) => {
  const requestId = getRequestId(req);
  const current = findPresenceByCharacter(String(req.body?.characterId ?? ""));
  if (!current) return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "PRESENCE_NOT_FOUND", "Presence not found for heartbeat", 404);
  const next = { ...current, updatedAt: nowIso() };
  await upsertPresence(next);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { alive: true, presence: next });
});

app.get("/api/v1/world/presence/nearby/:characterId", async (req, res) => {
  const requestId = getRequestId(req);
  const focus = findPresenceByCharacter(String(req.params.characterId ?? ""));
  if (!focus) return sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { players: [], count: 0 });
  const players = (await listPresence(focus.worldId, focus.regionId)).filter((entry) => entry.characterId !== focus.characterId && Math.abs(entry.x - focus.x) <= 6 && Math.abs(entry.y - focus.y) <= 6 && Math.abs(entry.z - focus.z) <= 1);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { players, count: players.length, focus });
});

app.get("/api/v1/stream/world/presence", async (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.query.worldId ?? "world_prime");
  const players = listPresenceForWorld(worldId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { stream: "world-presence", transport: "http-polling-compatible", worldId, players, count: players.length });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
