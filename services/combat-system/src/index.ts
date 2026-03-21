import { NPCS, SERVICE_VERSION, createServiceApp, getRequestId, makeId, nowIso, sendSuccess } from "../../../packages/shared/src/index";
import type { CombatEncounter } from "../../../packages/shared/src/index";

const SERVICE_NAME = "combat-system";
const PORT = 41738;
const app = createServiceApp(SERVICE_NAME);
const encounters = new Map<string, CombatEncounter>();
const combatLoot = new Map<string, Array<{ itemKey: string; amount: number }>>();

function encounterById(encounterId: string) {
  return encounters.get(encounterId) ?? null;
}

function participant(encounter: CombatEncounter | null, id: string) {
  return encounter?.participants.find((entry) => entry.id === id) ?? null;
}

function appendLog(encounter: CombatEncounter | null, actorId: string, action: string, result: string) {
  encounter?.log.push({ at: nowIso(), actorId, action, result });
}

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


app.post("/api/v1/combat/preview", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    preview: {
      encounterType: req.body.encounterType ?? 'SKIRMISH',
      estimatedTurns: 3,
      estimatedDamage: 10,
      estimatedRisk: 'MODERATE',
      targetId: req.body.targetId ?? req.body.targetNpcId ?? null
    }
  });
});

app.get("/api/v1/combat/log/:encounterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { encounterId: req.params.encounterId, log: encounterById(req.params.encounterId)?.log ?? [] });
});

app.post("/api/v1/combat/use-item", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  const target = participant(encounter, String(req.body.targetId ?? req.body.actorId ?? ''));
  if (target) target.hp = Math.min(100, target.hp + Math.max(1, Number(req.body.healAmount ?? 12)));
  appendLog(encounter, String(req.body.actorId ?? 'unknown'), 'USE_ITEM', `${String(req.body.itemKey ?? 'item')} used on ${target?.id ?? 'nobody'}`);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { used: true, encounter });
});

app.post("/api/v1/combat/use-skill", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  const target = participant(encounter, String(req.body.targetId ?? '')) ?? encounter?.participants.find((entry) => entry.id !== req.body.actorId) ?? null;
  if (target) target.hp = Math.max(0, target.hp - Math.max(5, Number(req.body.damage ?? 14)));
  appendLog(encounter, String(req.body.actorId ?? 'unknown'), 'USE_SKILL', `${String(req.body.skillKey ?? 'skill')} hit ${target?.id ?? 'nobody'}`);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { used: true, encounter });
});

app.post("/api/v1/combat/select-target", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { selected: true, encounterId: req.body.encounterId, actorId: req.body.actorId, targetId: req.body.targetId });
});

app.post("/api/v1/combat/inspect-target", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { target: participant(encounter, String(req.body.targetId ?? '')) });
});

app.post("/api/v1/combat/loot", (req, res) => {
  const requestId = getRequestId(req);
  const encounterId = String(req.body.encounterId ?? '');
  const loot = combatLoot.get(encounterId) ?? [{ itemKey: 'trophy_fragment', amount: 1 }];
  combatLoot.set(encounterId, []);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { looted: true, encounterId, loot });
});

app.post("/api/v1/combat/revive", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  const target = participant(encounter, String(req.body.targetId ?? req.body.characterId ?? ''));
  if (target) target.hp = Math.max(25, target.hp);
  appendLog(encounter, String(req.body.actorId ?? 'system'), 'REVIVE', `${target?.id ?? 'unknown'} was revived`);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revived: Boolean(target), encounter });
});

app.post("/api/v1/combat/auto-resolve", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  const sorted = [...(encounter?.participants ?? [])].sort((a, b) => b.hp - a.hp);
  const winner = sorted[0];
  if (encounter) {
    encounter.state = 'RESOLVED';
    appendLog(encounter, winner?.id ?? 'system', 'AUTO_RESOLVE', `${winner?.id ?? 'unknown'} won after auto resolution`);
    combatLoot.set(encounter.encounterId, [{ itemKey: 'battle_spoils', amount: 1 }]);
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { autoResolved: true, encounter });
});

app.post("/api/v1/combat/join", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  if (encounter && !encounter.participants.some((entry) => entry.id === req.body.characterId)) {
    encounter.participants.push({ id: String(req.body.characterId), type: 'CHARACTER', name: String(req.body.characterId), hp: 100, style: 'MELEE', statusEffects: [] });
    appendLog(encounter, String(req.body.characterId), 'JOIN', 'Joined the encounter');
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { joined: Boolean(encounter), encounter });
});

app.post("/api/v1/combat/leave", (req, res) => {
  const requestId = getRequestId(req);
  const encounter = encounterById(String(req.body.encounterId ?? ''));
  if (encounter) {
    encounter.participants = encounter.participants.filter((entry) => entry.id !== req.body.characterId);
    appendLog(encounter, String(req.body.characterId ?? 'unknown'), 'LEAVE', 'Left the encounter');
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { left: Boolean(encounter), encounter });
});

app.post("/api/v1/combat/environment-modifier", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    modifier: { weather: req.body.weather ?? 'clear', terrain: req.body.terrain ?? 'field', accuracyDelta: -5, staminaDelta: -3 }
  });
});

app.get("/api/v1/combat/status-catalog", (_req, res) => {
  const requestId = getRequestId(_req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { statuses: ['BURN', 'BLEED', 'POISON', 'STUN', 'CHILLED', 'WEAKENED'] });
});

app.post("/api/v1/combat/escape-preview", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { escapeChance: 0.62, encounterId: req.body.encounterId });
});

app.get("/api/v1/combat/nearby-threats", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    threats: [
      { npcId: 'npc_wolf_pack', danger: 'MEDIUM', regionId: req.query.regionId ?? 'starter_lowlands' },
      { npcId: 'npc_bandit_scout', danger: 'LOW', regionId: req.query.regionId ?? 'starter_lowlands' }
    ]
  });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
