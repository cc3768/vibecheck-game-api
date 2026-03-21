import { QUEST_DEFINITIONS, SERVICE_VERSION, createServiceApp, getRequestId, sendSuccess } from "../../../packages/shared/src/index";
import type { QuestState } from "../../../packages/shared/src/index";

const SERVICE_NAME = "quest-system";
const PORT = 41741;
const app = createServiceApp(SERVICE_NAME);
const questStates = new Map<string, QuestState[]>();
const questHistory = new Map<string, Array<{ questId: string; status: string; at: string }>>();
const pinnedQuests = new Map<string, Set<string>>();

function historyFor(characterId: string) {
  let state = questHistory.get(characterId);
  if (!state) {
    state = [];
    questHistory.set(characterId, state);
  }
  return state;
}

function pinnedFor(characterId: string) {
  let state = pinnedQuests.get(characterId);
  if (!state) {
    state = new Set<string>();
    pinnedQuests.set(characterId, state);
  }
  return state;
}

function definition(questId: string) {
  return QUEST_DEFINITIONS.find((q) => q.questId === questId) ?? QUEST_DEFINITIONS[0];
}

function states(characterId: string): QuestState[] {
  return questStates.get(characterId) ?? [];
}

app.get("/api/v1/quest/:questId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { quest: definition(req.params.questId) });
});

app.post("/api/v1/quest/accept", (req, res) => {
  const requestId = getRequestId(req);
  const def = definition(req.body.questId);
  const quest: QuestState = {
    characterId: req.body.characterId,
    questId: req.body.questId,
    status: "ACTIVE",
    progress: def.objectives.map((o) => ({ key: o.key, currentCount: 0, targetCount: o.targetCount, completed: false }))
  };
  const existing = states(req.body.characterId);
  existing.push(quest);
  questStates.set(req.body.characterId, existing);
  historyFor(req.body.characterId).push({ questId: req.body.questId, status: "ACCEPTED", at: new Date().toISOString() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { quest }, 201);
});

app.post("/api/v1/quest/progress", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((q) => q.questId === req.body.questId);
  const objective = quest?.progress.find((o) => o.key === req.body.objectiveKey);
  if (objective) {
    objective.currentCount = Math.min(objective.targetCount, objective.currentCount + Number(req.body.increment ?? 1));
    objective.completed = objective.currentCount >= objective.targetCount;
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { quest: quest ?? null });
});

app.post("/api/v1/quest/complete", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((q) => q.questId === req.body.questId);
  if (quest) { quest.status = "COMPLETED"; historyFor(req.body.characterId).push({ questId: req.body.questId, status: "COMPLETED", at: new Date().toISOString() }); }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { completed: Boolean(quest), quest: quest ?? null });
});

app.post("/api/v1/quest/fail", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((q) => q.questId === req.body.questId);
  if (quest) { quest.status = "FAILED"; historyFor(req.body.characterId).push({ questId: req.body.questId, status: "FAILED", at: new Date().toISOString() }); }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { failed: Boolean(quest), quest: quest ?? null, reason: req.body.reason ?? null });
});

app.get("/api/v1/quest/active/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, active: states(req.params.characterId).filter((q) => q.status === "ACTIVE") });
});

app.post("/api/v1/quest/check-objective", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((q) => q.questId === req.body.questId);
  const objective = quest?.progress.find((o) => o.key === req.body.objectiveKey) ?? null;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { objective });
});

app.post("/api/v1/quest/offer-from-npc", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { offered: QUEST_DEFINITIONS[0], npcId: req.body.npcId ?? null });
});


app.get("/api/v1/quest/history/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, history: historyFor(req.params.characterId) });
});

app.post("/api/v1/quest/abandon", (req, res) => {
  const requestId = getRequestId(req);
  const list = states(req.body.characterId);
  const quest = list.find((entry) => entry.questId === req.body.questId) ?? null;
  if (quest) quest.status = 'ABANDONED' as any;
  historyFor(req.body.characterId).push({ questId: String(req.body.questId ?? 'unknown'), status: 'ABANDONED', at: new Date().toISOString() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { abandoned: Boolean(quest), quest });
});

app.post("/api/v1/quest/pin", (req, res) => {
  const requestId = getRequestId(req);
  pinnedFor(String(req.body.characterId ?? 'unknown')).add(String(req.body.questId ?? ''));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { pinned: true, pinned: Array.from(pinnedFor(String(req.body.characterId ?? 'unknown'))) });
});

app.post("/api/v1/quest/unpin", (req, res) => {
  const requestId = getRequestId(req);
  pinnedFor(String(req.body.characterId ?? 'unknown')).delete(String(req.body.questId ?? ''));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { unpinned: true, pinned: Array.from(pinnedFor(String(req.body.characterId ?? 'unknown'))) });
});

app.get("/api/v1/quest/recommendations/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, recommendations: QUEST_DEFINITIONS.slice(0, 3) });
});

app.post("/api/v1/quest/generate", (req, res) => {
  const requestId = getRequestId(req);
  const template = definition(String(req.body.questId ?? 'quest_first_steps'));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { generated: true, quest: { ...template, questId: `${template.questId}_generated`, theme: req.body.theme ?? 'frontier' } });
});

app.post("/api/v1/quest/turn-in", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((entry) => entry.questId === req.body.questId) ?? null;
  if (quest) quest.status = 'COMPLETED';
  historyFor(req.body.characterId).push({ questId: String(req.body.questId ?? 'unknown'), status: 'TURNED_IN', at: new Date().toISOString() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { turnedIn: Boolean(quest), rewardPreview: [{ itemKey: 'ration_pack', amount: 1 }], quest });
});

app.post("/api/v1/quest/reward-preview", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { questId: req.body.questId, rewards: [{ type: 'item', itemKey: 'ration_pack', amount: 1 }, { type: 'xp', skill: 'SURVIVAL', amount: 25 }] });
});

app.get("/api/v1/quest/templates", (_req, res) => {
  const requestId = getRequestId(_req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { templates: QUEST_DEFINITIONS });
});

app.get("/api/v1/quest/faction/:factionId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { factionId: req.params.factionId, quests: QUEST_DEFINITIONS.slice(0, 2) });
});

app.post("/api/v1/quest/share", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { shared: true, questId: req.body.questId, partyId: req.body.partyId ?? null });
});

app.post("/api/v1/quest/objective/reveal", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revealed: true, objectiveKey: req.body.objectiveKey, note: 'Map marker revealed.' });
});

app.post("/api/v1/quest/objective/hint", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { objectiveKey: req.body.objectiveKey, hint: 'Search the nearest rocky ground and speak to the first settler you meet.' });
});

app.post("/api/v1/quest/branch/select", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { selected: true, questId: req.body.questId, branchKey: req.body.branchKey });
});

app.get("/api/v1/quest/storyline/:storylineKey", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { storylineKey: req.params.storylineKey, quests: QUEST_DEFINITIONS.map((quest) => quest.questId) });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
