import { NPCS, SERVICE_VERSION, createServiceApp, getRequestId, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "npc-system";
const PORT = 41739;
const app = createServiceApp(SERVICE_NAME);
const npcs = [...NPCS];
const vendorStock = new Map<string, Array<{ itemKey: string; price: number; stock: number }>>();
const recruitments = new Map<string, Array<{ npcId: string; recruitedAt: string }>>();

function inventoryFor(npcId: string) {
  let stock = vendorStock.get(npcId);
  if (!stock) {
    stock = [
      { itemKey: 'ration_pack', price: 5, stock: 8 },
      { itemKey: 'bandage', price: 3, stock: 12 },
      { itemKey: 'torch', price: 4, stock: 6 }
    ];
    vendorStock.set(npcId, stock);
  }
  return stock;
}

function relationshipWith(npcId: string, characterId: string) {
  const npc = npcs.find((n) => n.npcId === npcId);
  return npc?.relationships.find((entry) => entry.characterId === characterId) ?? { characterId, affinity: 0, trust: 0 };
}

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


app.get("/api/v1/npc/:npcId/quests", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, quests: [{ questId: 'quest_first_steps', title: 'First Steps', recommended: true }] });
});

app.get("/api/v1/npc/:npcId/inventory", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, inventory: inventoryFor(req.params.npcId) });
});

app.get("/api/v1/npc/:npcId/vendor", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, listings: inventoryFor(req.params.npcId) });
});

app.post("/api/v1/npc/:npcId/buy", (req, res) => {
  const requestId = getRequestId(req);
  const stock = inventoryFor(req.params.npcId);
  const item = stock.find((entry) => entry.itemKey === req.body.itemKey) ?? null;
  if (item) item.stock = Math.max(0, item.stock - Math.max(1, Number(req.body.amount ?? 1)));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { purchased: Boolean(item), item, stock });
});

app.post("/api/v1/npc/:npcId/sell", (req, res) => {
  const requestId = getRequestId(req);
  const stock = inventoryFor(req.params.npcId);
  const itemKey = String(req.body.itemKey ?? 'unknown_item');
  const existing = stock.find((entry) => entry.itemKey === itemKey);
  if (existing) existing.stock += Math.max(1, Number(req.body.amount ?? 1));
  else stock.push({ itemKey, price: Math.max(1, Number(req.body.price ?? 1)), stock: Math.max(1, Number(req.body.amount ?? 1)) });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { sold: true, stock });
});

app.post("/api/v1/npc/:npcId/gift", (req, res) => {
  const requestId = getRequestId(req);
  const npc = npcs.find((n) => n.npcId === req.params.npcId);
  if (npc) {
    const hit = npc.relationships.find((entry) => entry.characterId === req.body.characterId);
    if (hit) hit.affinity += 5;
    else npc.relationships.push({ characterId: req.body.characterId, affinity: 5, trust: 1 });
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { gifted: true, relationship: relationshipWith(req.params.npcId, String(req.body.characterId ?? 'unknown')) });
});

app.get("/api/v1/npc/:npcId/gossip", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, gossip: [`${req.params.npcId} heard there is good stone to the east.`, 'The weather has made the roads slower this week.'] });
});

app.post("/api/v1/npc/:npcId/recruit", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const list = recruitments.get(characterId) ?? [];
  if (!list.some((entry) => entry.npcId === req.params.npcId)) list.push({ npcId: req.params.npcId, recruitedAt: new Date().toISOString() });
  recruitments.set(characterId, list);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recruited: true, characterId, roster: list });
});

app.post("/api/v1/npc/:npcId/dismiss", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const list = (recruitments.get(characterId) ?? []).filter((entry) => entry.npcId !== req.params.npcId);
  recruitments.set(characterId, list);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { dismissed: true, characterId, roster: list });
});

app.get("/api/v1/npc/:npcId/faction", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, factionId: 'settlers_guild', standing: 'NEUTRAL' });
});

app.get("/api/v1/npc/:npcId/schedule", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, schedule: ['dawn: patrol', 'midday: trade', 'evening: rest'] });
});

app.get("/api/v1/npc/:npcId/relationship/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { npcId: req.params.npcId, relationship: relationshipWith(req.params.npcId, req.params.characterId) });
});

app.post("/api/v1/npc/:npcId/teach-skill", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { taught: true, npcId: req.params.npcId, skillKey: req.body.skillKey ?? 'SURVIVAL' });
});

app.post("/api/v1/npc/:npcId/teach-recipe", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { taught: true, npcId: req.params.npcId, recipeKey: req.body.recipeKey ?? 'recipe_campfire' });
});

app.post("/api/v1/npc/:npcId/offer-service", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { offered: true, npcId: req.params.npcId, service: req.body.service ?? 'repair' });
});

app.post("/api/v1/npc/:npcId/report-crime", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recorded: true, npcId: req.params.npcId, report: req.body.report ?? null });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
