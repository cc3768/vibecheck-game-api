import { SERVICE_VERSION, createServiceApp, getRequestId, makeId, nowIso, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "chat-system";
const PORT = 41732;
const app = createServiceApp(SERVICE_NAME);
const messages = new Map<string, Array<{ id: string; channelId: string; authorId: string; authorType: string; content: string; createdAt: string }>>();

function append(channelId: string, authorId: string, authorType: string, content: string) {
  const message = { id: makeId("msg"), channelId, authorId, authorType, content, createdAt: nowIso() };
  const existing = messages.get(channelId) ?? [];
  existing.push(message);
  messages.set(channelId, existing);
  return message;
}

app.post("/api/v1/chat/send", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { message: append(req.body.channelId, req.body.authorId, "PLAYER", req.body.content) });
});

app.get("/api/v1/chat/channel/:channelId/history", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { channelId: req.params.channelId, messages: messages.get(req.params.channelId) ?? [] });
});

app.post("/api/v1/chat/system-message", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { message: append(req.body.channelId, "system", "SYSTEM", req.body.content) });
});

app.post("/api/v1/chat/npc-dialogue", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { message: append(req.body.channelId, req.body.npcId, "NPC", req.body.content) });
});

app.post("/api/v1/chat/reward-notice", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { message: append(req.body.channelId, "system", "SYSTEM", req.body.rewardText) });
});

app.post("/api/v1/chat/quest-update", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { message: append(req.body.channelId, "system", "SYSTEM", req.body.updateText) });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
