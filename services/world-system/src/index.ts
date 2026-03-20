import { SERVICE_VERSION, WORLD_NODES, WORLD_REGIONS, createServiceApp, getRequestId, makeId, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "world-system";
const PORT = 41733;
const app = createServiceApp(SERVICE_NAME);

const objects: Array<{
  id: string;
  worldId: string;
  regionId: string;
  type: string;
  position: { worldId: string; regionId: string; x: number; y: number };
  meta?: Record<string, unknown>;
}> = [
  {
    id: "obj_town_board",
    worldId: "world_prime",
    regionId: "starter_lowlands",
    type: "NOTICE_BOARD",
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 },
    meta: { label: "Village Board" }
  }
];

function regionFor(worldId: string, regionId: string) {
  return WORLD_REGIONS.find((r) => r.worldId === worldId && r.regionId === regionId) ?? WORLD_REGIONS[0];
}

function seededNoise(regionId: string, x: number, y: number) {
  const source = `${regionId}:${x}:${y}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function terrainFor(regionId: string, x: number, y: number) {
  const n = seededNoise(regionId, x, y);
  const w = seededNoise(`${regionId}:water`, x, y);
  const r = seededNoise(`${regionId}:rock`, x, y);

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

  if (w > 0.9 || Math.abs((x % 11) - 5) === 0 && Math.abs((y % 11) - 5) < 2) {
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

function tileFor(worldId: string, regionId: string, x: number, y: number) {
  const terrain = terrainFor(regionId, x, y);
  return {
    worldId,
    regionId,
    x,
    y,
    kind: terrain.kind,
    walkable: terrain.walkable,
    resourceType: terrain.resourceType
  };
}

function chunkFor(worldId: string, regionId: string, chunkX: number, chunkY: number, size: number) {
  const minX = chunkX * size;
  const minY = chunkY * size;
  const maxX = minX + size - 1;
  const maxY = minY + size - 1;
  const tiles = [] as Array<ReturnType<typeof tileFor>>;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push(tileFor(worldId, regionId, x, y));
    }
  }

  const chunkObjects = objects.filter(
    (object) =>
      object.worldId === worldId &&
      object.regionId === regionId &&
      object.position.x >= minX &&
      object.position.x <= maxX &&
      object.position.y >= minY &&
      object.position.y <= maxY
  );

  return {
    worldId,
    regionId,
    chunkX,
    chunkY,
    size,
    bounds: { minX, minY, maxX, maxY },
    tiles,
    objects: chunkObjects
  };
}

app.get("/api/v1/world/:worldId/region/:regionId", (req, res) => {
  const requestId = getRequestId(req);
  const region = regionFor(req.params.worldId, req.params.regionId) ?? null;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { region });
});

app.get("/api/v1/world/:worldId/tile", (req, res) => {
  const requestId = getRequestId(req);
  const x = Number(req.query.x ?? 0);
  const y = Number(req.query.y ?? 0);
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const tile = tileFor(req.params.worldId, regionId, x, y);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tile });
});

app.get("/api/v1/world/:worldId/chunk", (req, res) => {
  const requestId = getRequestId(req);
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  const chunkX = Number(req.query.chunkX ?? 0);
  const chunkY = Number(req.query.chunkY ?? 0);
  const size = Math.max(8, Math.min(20, Number(req.query.size ?? 12)));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { chunk: chunkFor(req.params.worldId, regionId, chunkX, chunkY, size) });
});

app.post("/api/v1/world/query-position", (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body.position ?? { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0 };
  const region = regionFor(position.worldId, position.regionId);
  const tile = tileFor(position.worldId, position.regionId, Number(position.x ?? 0), Number(position.y ?? 0));
  const nearbyObjects = objects.filter(
    (object) =>
      object.worldId === position.worldId &&
      object.regionId === region.regionId &&
      Math.abs(object.position.x - Number(position.x ?? 0)) <= 2 &&
      Math.abs(object.position.y - Number(position.y ?? 0)) <= 2
  );
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { region, tile, nearbyObjects });
});

app.post("/api/v1/world/query-resource", (req, res) => {
  const requestId = getRequestId(req);
  const worldId = String(req.body.worldId ?? "world_prime");
  const regionId = String(req.body.regionId ?? "starter_lowlands");
  const x = Number(req.body.x ?? 0);
  const y = Number(req.body.y ?? 0);
  const generated = [] as Array<{ nodeId: string; type: string; position: { worldId: string; regionId: string; x: number; y: number } }>;

  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      const tile = tileFor(worldId, regionId, x + offsetX, y + offsetY);
      if (tile.resourceType) {
        generated.push({
          nodeId: `gen_${tile.resourceType.toLowerCase()}_${tile.x}_${tile.y}`,
          type: tile.resourceType,
          position: { worldId, regionId, x: tile.x, y: tile.y }
        });
      }
    }
  }

  const staticNodes = WORLD_NODES.filter(
    (node) => node.position.worldId === worldId && node.position.regionId === regionId && (!req.body.resourceType || node.type === req.body.resourceType)
  );

  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { nodes: [...staticNodes, ...generated] });
});

app.post("/api/v1/world/place-structure", (req, res) => {
  const requestId = getRequestId(req);
  const structureId = makeId("structure");
  objects.push({
    id: structureId,
    worldId: String(req.body.worldId ?? "world_prime"),
    regionId: String(req.body.regionId ?? "starter_lowlands"),
    type: String(req.body.structureType ?? "MARKER"),
    position: {
      worldId: String(req.body.position?.worldId ?? req.body.worldId ?? "world_prime"),
      regionId: String(req.body.position?.regionId ?? req.body.regionId ?? "starter_lowlands"),
      x: Number(req.body.position?.x ?? 0),
      y: Number(req.body.position?.y ?? 0)
    },
    meta: {
      note: req.body.note ?? null,
      placedBy: req.body.characterId ?? null,
      actionText: req.body.actionText ?? null,
      subTile: req.body.subTile ?? null
    }
  });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { created: true, structureId });
});

app.post("/api/v1/world/remove-structure", (req, res) => {
  const requestId = getRequestId(req);
  const x = Number(req.body.position?.x ?? Number.NaN);
  const y = Number(req.body.position?.y ?? Number.NaN);
  const regionId = String(req.body.position?.regionId ?? req.body.regionId ?? "starter_lowlands");
  const idx = objects.findIndex(
    (object) =>
      object.id === req.body.structureId ||
      (object.regionId === regionId && object.position.x === x && object.position.y === y)
  );
  if (idx >= 0) objects.splice(idx, 1);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { removed: idx >= 0 });
});

app.post("/api/v1/world/update-object", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: true, object: req.body });
});

app.get("/api/v1/world/spawn/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    characterId: req.params.characterId,
    position: { worldId: "world_prime", regionId: "starter_lowlands", x: 1, y: 1 }
  });
});

app.post("/api/v1/world/environment/context", (req, res) => {
  const requestId = getRequestId(req);
  const position = req.body.position ?? { worldId: "world_prime", regionId: "starter_lowlands" };
  const region = regionFor(String(position.worldId ?? "world_prime"), String(position.regionId ?? "starter_lowlands"));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    biome: region.biome,
    weather: region.regionId === "whisper_woods" ? "MIST" : "CLEAR",
    dangerLevel: region.dangerLevel
  });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
