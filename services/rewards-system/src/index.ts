import { REWARD_PACKAGES, SERVICE_VERSION, createServiceApp, getRequestId, nowIso, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "rewards-system";
const PORT = 41740;
const app = createServiceApp(SERVICE_NAME);
const history: Array<{ characterId: string; rewardPackageId: string; grantedAt: string }> = [];

app.post("/api/v1/rewards/grant", (req, res) => {
  const requestId = getRequestId(req);
  history.push({ characterId: req.body.characterId, rewardPackageId: req.body.rewardPackage.rewardPackageId, grantedAt: nowIso() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { granted: true, rewardPackage: req.body.rewardPackage });
});

app.post("/api/v1/rewards/preview", (req, res) => {
  const requestId = getRequestId(req);
  const rewardPackage = REWARD_PACKAGES.find((r) => r.sourceType === req.body.sourceType && r.sourceId === req.body.sourceId) ?? REWARD_PACKAGES[0];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { rewardPackage });
});

app.get("/api/v1/rewards/history/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { history: history.filter((h) => h.characterId === req.params.characterId) });
});

app.post("/api/v1/rewards/validate", (req, res) => {
  const requestId = getRequestId(req);
  const issues: string[] = [];
  if (!req.body.rewardPackage?.sourceId) issues.push("sourceId is required");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { valid: issues.length === 0, issues });
});

app.post("/api/v1/rewards/from-quest", (req, res) => {
  const requestId = getRequestId(req);
  const rewardPackage = REWARD_PACKAGES.find((r) => r.sourceType === "QUEST" && r.sourceId === String(req.body.questId ?? "quest_first_steps")) ?? REWARD_PACKAGES[0];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { rewardPackage });
});

app.post("/api/v1/rewards/from-npc", (req, res) => {
  const requestId = getRequestId(req);
  const rewardPackage = REWARD_PACKAGES.find((r) => r.sourceType === "NPC" && r.sourceId === String(req.body.npcId ?? "npc_elder_rowan")) ?? REWARD_PACKAGES[0];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { rewardPackage });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
