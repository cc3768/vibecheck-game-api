import { NPCS, SERVICE_VERSION, createServiceApp, getRequestId, makeId, nowIso, sendSuccess } from "../../../packages/shared/src/index";
import type { CombatEncounter } from "../../../packages/shared/src/index";

const SERVICE_NAME = "combat-system";
const PORT = 41738;
const app = createServiceApp(SERVICE_NAME);
const encounters = new Map<string, CombatEncounter>();

app.post("/api/v1/combat/start", (req, res) => {
  const requestId = getRequestId(req);
  const npc = NPCS.find((n) => n.npcId === req.body.targetNpcId);
  const encounterId = makeId("enc");
  const encounter: CombatEncounter = {
    encounterId,
    startedAt: nowIso(),
    state: "ACTIVE",
    participants: [
      { id: req.body.characterId, type: "CHARACTER", name: req.body.characterId, hp: 100, style: "MELEE", statusEffects: [] },
      { id: req.body.targetNpcId, type: "NPC", name: npc?.name ?? req.body.targetNpcId, hp: 55, style: "MELEE", statusEffects: [] }
    ],
    log: [{ at: nowIso(), actorId: req.body.characterId, action: "START", result: `Encounter started with ${npc?.name ?? req.body.targetNpcId}` }]
  };
  encounters.set(encounterId, encounter);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { encounter }, 201);
});

app.post("/api/v1/combat/action", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounters.get(String(req.body.encounterId ?? ""));
  const target = encounter?.participants.find((p) => p.id === req.body.targetId) ?? encounter?.participants.find((p) => p.id !== req.body.actorId);
  if (target) target.hp = Math.max(0, target.hp - 10);
  encounter?.log.push({ at: nowIso(), actorId: req.body.actorId, action: String(req.body.action ?? "ATTACK"), result: target ? `${target.id} takes 10 damage` : "No target" });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { encounter: encounter ?? null });
});

app.post("/api/v1/combat/resolve", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounters.get(String(req.body.encounterId ?? ""));
  const sorted = [...(encounter?.participants ?? [])].sort((a, b) => b.hp - a.hp);
  const winner = sorted[0];
  const loser = sorted[1];
  if (encounter) {
    encounter.state = "RESOLVED";
    encounter.log.push({ at: nowIso(), actorId: winner?.id ?? "system", action: "RESOLVE", result: `${winner?.id ?? "unknown"} wins` });
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { outcome: { winnerId: winner?.id ?? "unknown", loserId: loser?.id ?? "unknown", rewardsGranted: [] }, encounter: encounter ?? null });
});

app.get("/api/v1/combat/encounter/:encounterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { encounter: encounters.get(req.params.encounterId) ?? null });
});

app.post("/api/v1/combat/retreat", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounters.get(String(req.body.encounterId ?? ""));
  if (encounter) {
    encounter.state = "ENDED";
    encounter.log.push({ at: nowIso(), actorId: String(req.body.actorId ?? "unknown"), action: "RETREAT", result: "Actor retreated" });
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { retreated: true, encounter: encounter ?? null });
});

app.post("/api/v1/combat/apply-status", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounters.get(String(req.body.encounterId ?? ""));
  const participant = encounter?.participants.find((p) => p.id === req.body.targetId);
  if (participant) participant.statusEffects.push({ key: String(req.body.statusKey ?? "BURN"), turnsRemaining: Number(req.body.turnsRemaining ?? 2), magnitude: Number(req.body.magnitude ?? 1) });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { applied: Boolean(participant), encounter: encounter ?? null });
});

app.post("/api/v1/combat/end", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounters.get(String(req.body.encounterId ?? ""));
  if (encounter) encounter.state = "ENDED";
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ended: Boolean(encounter), encounter: encounter ?? null });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
