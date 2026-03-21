import { REWARD_PACKAGES, SERVICE_VERSION, createServiceApp, getRequestId, nowIso, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "rewards-system";
const PORT = 41740;
const app = createServiceApp(SERVICE_NAME);
const history: Array<{ characterId: string; rewardPackageId: string; grantedAt: string }> = [];
const unclaimed = new Map<string, Array<{ rewardId: string; rewardPackageId: string; contents: any[]; createdAt: string }>>();

function unclaimedFor(characterId: string) {
  let state = unclaimed.get(characterId);
  if (!state) {
    state = [];
    unclaimed.set(characterId, state);
  }
  return state;
}

app.post("/api/v1/rewards/grant", (req, res) => {
  const requestId = getRequestId(req);
  history.push({ characterId: req.body.characterId, rewardPackageId: req.body.rewardPackage.rewardPackageId, grantedAt: nowIso() });
  unclaimedFor(String(req.body.characterId ?? "unknown")).push({ rewardId: `reward_${Date.now().toString(36)}`, rewardPackageId: req.body.rewardPackage.rewardPackageId, contents: req.body.rewardPackage.contents ?? [], createdAt: nowIso() });
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


app.get("/api/v1/rewards/unclaimed/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, rewards: unclaimedFor(req.params.characterId) });
});

app.post("/api/v1/rewards/claim/:rewardId", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const list = unclaimedFor(characterId);
  const index = list.findIndex((entry) => entry.rewardId === req.params.rewardId);
  const reward = index >= 0 ? list.splice(index, 1)[0] : null;
  if (reward) history.push({ characterId, rewardPackageId: reward.rewardPackageId, grantedAt: nowIso() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { claimed: Boolean(reward), reward });
});

app.post("/api/v1/rewards/revoke", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const list = unclaimedFor(characterId);
  const index = list.findIndex((entry) => entry.rewardId === req.body.rewardId);
  const reward = index >= 0 ? list.splice(index, 1)[0] : null;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { revoked: Boolean(reward), reward });
});

app.post("/api/v1/rewards/mail", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { mailed: true, toCharacterId: req.body.characterId, subject: req.body.subject ?? 'Reward Delivery' });
});

app.post("/api/v1/rewards/bundle/preview", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { bundle: req.body.bundle ?? [], estimatedValue: (req.body.bundle ?? []).length * 10 });
});

app.post("/api/v1/rewards/bundle/grant", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const rewardId = `reward_${Date.now().toString(36)}`;
  const bundle = Array.isArray(req.body.bundle) ? req.body.bundle : [];
  unclaimedFor(characterId).push({ rewardId, rewardPackageId: req.body.rewardPackageId ?? 'bundle_reward', contents: bundle, createdAt: nowIso() });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { granted: true, rewardId, bundle });
});

app.get("/api/v1/rewards/tables/:tableKey", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tableKey: req.params.tableKey, entries: [{ rewardPackageId: 'reward_first_steps', weight: 100 }] });
});

app.post("/api/v1/rewards/roll-table", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tableKey: req.body.tableKey, rewardPackageId: 'reward_first_steps' });
});

app.post("/api/v1/rewards/compensate", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { compensated: true, reason: req.body.reason ?? null, amount: req.body.amount ?? 0 });
});

app.post("/api/v1/rewards/daily", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { granted: true, rewards: [{ itemKey: 'daily_token', amount: 1 }] });
});

app.post("/api/v1/rewards/first-discovery", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { granted: true, discoveryKey: req.body.discoveryKey, rewards: [{ itemKey: 'discovery_mark', amount: 1 }] });
});

app.post("/api/v1/rewards/party-share", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { shared: true, partyId: req.body.partyId, members: req.body.members ?? [] });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
