import { NPCS, SERVICE_VERSION, createServiceApp, getRequestId, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "npc-system";
const PORT = 41739;
const app = createServiceApp(SERVICE_NAME);
const npcs = [...NPCS];

app.get("/api/v1/npc/:npcId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npc: npcs.find((n) => n.npcId === req.params.npcId) ?? null });
});

app.post("/api/v1/npc/interact", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { interaction: { npcId: req.body?.npcId, characterId: req.body?.characterId, summary: "The NPC acknowledges the player and waits for a prompt." } });
});

app.post("/api/v1/npc/dialogue", (req, res) => {
  const requestId = getRequestId(req);
  const npc = npcs.find((n) => n.npcId === req.body?.npcId);
  const reply = npc?.name === "Elder Rowan"
    ? "Welcome, traveler. The woods remember every step. Bring me wood and I will help you begin."
    : `${npc?.name ?? "The NPC"} says: I hear you.`;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.body?.npcId, reply });
});

app.post("/api/v1/npc/teach", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { taught: true, skill: req.body?.skill });
});

app.post("/api/v1/npc/relationship/update", (req, res) => {
  const requestId = getRequestId(req);
  const npc = npcs.find((n) => n.npcId === req.body?.npcId);
  if (npc) {
    const hit = npc.relationships.find((r) => r.characterId === req.body?.characterId);
    if (hit) {
      hit.affinity += Number(req.body?.affinityDelta ?? 0);
      hit.trust += Number(req.body?.trustDelta ?? 0);
    } else {
      npc.relationships.push({ characterId: req.body?.characterId, affinity: Number(req.body?.affinityDelta ?? 0), trust: Number(req.body?.trustDelta ?? 0) });
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { updated: Boolean(npc), relationships: npc?.relationships ?? [] });
});

app.post("/api/v1/npc/schedule/tick", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { processed: npcs.length, worldId: req.body?.worldId, tickAt: req.body?.tickAt });
});

app.post("/api/v1/npc/spawn", (req, res) => {
  const requestId = getRequestId(req);
  const npc = npcs.find((n) => n.npcId === req.body?.npcId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { spawned: Boolean(npc), npc: npc ?? null, position: req.body?.position ?? null });
});

app.post("/api/v1/npc/despawn", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { despawned: true, npcId: req.body?.npcId ?? null });
});

app.get("/api/v1/npc/nearby", (req, res) => {
  const requestId = getRequestId(req);
  const regionId = String(req.query.regionId ?? "starter_lowlands");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcs: npcs.filter((n) => n.regionId === regionId) });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
