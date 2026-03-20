import { QUEST_DEFINITIONS, SERVICE_VERSION, createServiceApp, getRequestId, sendSuccess } from "../../../packages/shared/src/index";
import type { QuestState } from "../../../packages/shared/src/index";

const SERVICE_NAME = "quest-system";
const PORT = 41741;
const app = createServiceApp(SERVICE_NAME);
const questStates = new Map<string, QuestState[]>();

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
  if (quest) quest.status = "COMPLETED";
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { completed: Boolean(quest), quest: quest ?? null });
});

app.post("/api/v1/quest/fail", (req, res) => {
  const requestId = getRequestId(req);
  const quest = states(req.body.characterId).find((q) => q.questId === req.body.questId);
  if (quest) quest.status = "FAILED";
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

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
