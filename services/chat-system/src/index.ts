import { SERVICE_VERSION, createServiceApp, getRequestId, makeId, nowIso, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "chat-system";
const PORT = 41732;
const app = createServiceApp(SERVICE_NAME);
const messages = new Map<string, Array<{ id: string; channelId: string; authorId: string; authorType: string; content: string; createdAt: string; editedAt?: string | null; reactions?: Record<string, string[]>; deleted?: boolean; reported?: boolean }>>();
const channels = new Map<string, { channelId: string; name: string; type: string; createdAt: string; members: Set<string>; mutedBy: Set<string> }>();
const unreadByAccount = new Map<string, Map<string, number>>();
const blockedUsers = new Map<string, Set<string>>();
const directChannels = new Map<string, string>();
const moderationIncidents: Array<{ incidentId: string; messageId: string; reporterId: string; createdAt: string; reason: string }> = [];

function ensureChannel(channelId: string, name = channelId, type = 'PUBLIC') {
  let channel = channels.get(channelId);
  if (!channel) {
    channel = { channelId, name, type, createdAt: nowIso(), members: new Set<string>(), mutedBy: new Set<string>() };
    channels.set(channelId, channel);
  }
  return channel;
}

function unreadState(accountId: string) {
  let state = unreadByAccount.get(accountId);
  if (!state) {
    state = new Map<string, number>();
    unreadByAccount.set(accountId, state);
  }
  return state;
}

function blockState(accountId: string) {
  let state = blockedUsers.get(accountId);
  if (!state) {
    state = new Set<string>();
    blockedUsers.set(accountId, state);
  }
  return state;
}

function append(channelId: string, authorId: string, authorType: string, content: string) {
  const message = { id: makeId("msg"), channelId, authorId, authorType, content, createdAt: nowIso(), editedAt: null, reactions: {}, deleted: false, reported: false };
  const existing = messages.get(channelId) ?? [];
  existing.push(message);
  messages.set(channelId, existing);
  ensureChannel(channelId);
  for (const [accountId, state] of unreadByAccount.entries()) {
    if (accountId !== authorId) state.set(channelId, (state.get(channelId) ?? 0) + 1);
  }
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


app.post("/api/v1/chat/channel/create", (req, res) => {
  const requestId = getRequestId(req);
  const channelId = String(req.body.channelId ?? makeId('channel'));
  const channel = ensureChannel(channelId, String(req.body.name ?? channelId), String(req.body.type ?? 'PUBLIC'));
  if (req.body.ownerId) channel.members.add(String(req.body.ownerId));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { channel: { ...channel, members: Array.from(channel.members), mutedBy: Array.from(channel.mutedBy) } });
});

app.post("/api/v1/chat/channel/join", (req, res) => {
  const requestId = getRequestId(req);
  const channel = ensureChannel(String(req.body.channelId));
  channel.members.add(String(req.body.accountId ?? req.body.authorId ?? 'unknown'));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { joined: true, channelId: channel.channelId, members: Array.from(channel.members) });
});

app.post("/api/v1/chat/channel/leave", (req, res) => {
  const requestId = getRequestId(req);
  const channel = ensureChannel(String(req.body.channelId));
  channel.members.delete(String(req.body.accountId ?? req.body.authorId ?? 'unknown'));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { left: true, channelId: channel.channelId, members: Array.from(channel.members) });
});

app.get("/api/v1/chat/channel/:channelId/presence", (req, res) => {
  const requestId = getRequestId(req);
  const channel = ensureChannel(req.params.channelId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { channelId: channel.channelId, members: Array.from(channel.members) });
});

app.post("/api/v1/chat/direct-message", (req, res) => {
  const requestId = getRequestId(req);
  const members = [String(req.body.fromAccountId ?? 'unknown'), String(req.body.toAccountId ?? 'unknown')].sort();
  const dmKey = members.join(':');
  let channelId = directChannels.get(dmKey);
  if (!channelId) {
    channelId = makeId('dm');
    directChannels.set(dmKey, channelId);
    const channel = ensureChannel(channelId, `dm_${members.join('_')}`, 'DIRECT');
    members.forEach((member) => channel.members.add(member));
  }
  const message = append(channelId, members[0], 'PLAYER', String(req.body.content ?? ''));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { channelId, message });
});

app.post("/api/v1/chat/whisper", (req, res) => {
  const requestId = getRequestId(req);
  const channelId = String(req.body.channelId ?? 'whispers');
  const message = append(channelId, String(req.body.authorId ?? 'unknown'), 'PLAYER', String(req.body.content ?? ''));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { whispered: true, targetId: req.body.targetId, message });
});

app.post("/api/v1/chat/message/edit", (req, res) => {
  const requestId = getRequestId(req);
  let edited = null;
  for (const channelMessages of messages.values()) {
    const hit = channelMessages.find((message) => message.id === req.body.messageId);
    if (hit) {
      hit.content = String(req.body.content ?? hit.content);
      hit.editedAt = nowIso();
      edited = hit;
      break;
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { edited: Boolean(edited), message: edited });
});

app.post("/api/v1/chat/message/delete", (req, res) => {
  const requestId = getRequestId(req);
  let deleted = null;
  for (const channelMessages of messages.values()) {
    const hit = channelMessages.find((message) => message.id === req.body.messageId);
    if (hit) {
      hit.deleted = true;
      deleted = hit;
      break;
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { deleted: Boolean(deleted), message: deleted });
});

app.post("/api/v1/chat/message/react", (req, res) => {
  const requestId = getRequestId(req);
  let reacted = null;
  for (const channelMessages of messages.values()) {
    const hit = channelMessages.find((message) => message.id === req.body.messageId);
    if (hit) {
      const key = String(req.body.reaction ?? '👍');
      const list = hit.reactions?.[key] ?? [];
      if (!list.includes(String(req.body.accountId ?? 'unknown'))) list.push(String(req.body.accountId ?? 'unknown'));
      hit.reactions = { ...(hit.reactions ?? {}), [key]: list };
      reacted = hit;
      break;
    }
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { reacted: Boolean(reacted), message: reacted });
});

app.post("/api/v1/chat/message/report", (req, res) => {
  const requestId = getRequestId(req);
  const incident = { incidentId: makeId('incident'), messageId: String(req.body.messageId ?? ''), reporterId: String(req.body.reporterId ?? 'unknown'), createdAt: nowIso(), reason: String(req.body.reason ?? 'unspecified') };
  moderationIncidents.push(incident);
  for (const channelMessages of messages.values()) {
    const hit = channelMessages.find((message) => message.id === req.body.messageId);
    if (hit) hit.reported = true;
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { reported: true, incident });
});

app.post("/api/v1/chat/typing", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { typing: true, channelId: req.body.channelId, accountId: req.body.accountId });
});

app.get("/api/v1/chat/unread/:accountId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { accountId: req.params.accountId, unread: Object.fromEntries(unreadState(req.params.accountId).entries()) });
});

app.post("/api/v1/chat/mark-read", (req, res) => {
  const requestId = getRequestId(req);
  unreadState(String(req.body.accountId ?? 'unknown')).set(String(req.body.channelId ?? ''), 0);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { markedRead: true });
});

app.post("/api/v1/chat/mute-channel", (req, res) => {
  const requestId = getRequestId(req);
  const channel = ensureChannel(String(req.body.channelId));
  channel.mutedBy.add(String(req.body.accountId ?? 'unknown'));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { muted: true, channelId: channel.channelId, mutedBy: Array.from(channel.mutedBy) });
});

app.post("/api/v1/chat/block-user", (req, res) => {
  const requestId = getRequestId(req);
  blockState(String(req.body.accountId ?? 'unknown')).add(String(req.body.blockedAccountId ?? 'unknown'));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { blocked: true, blockedUsers: Array.from(blockState(String(req.body.accountId ?? 'unknown'))) });
});

app.get("/api/v1/chat/search", (req, res) => {
  const requestId = getRequestId(req);
  const query = String(req.query.q ?? '').toLowerCase();
  const results = Array.from(messages.values()).flat().filter((message) => message.content.toLowerCase().includes(query));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { query, results });
});

app.get("/api/v1/chat/moderation/incidents", (_req, res) => {
  const requestId = getRequestId(_req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { incidents: moderationIncidents });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
