import { SERVICE_VERSION, createServiceApp, getRequestId, nowIso, sendSuccess } from "../../../packages/shared/src/index";
import type { XpActionRecord } from "../../../packages/shared/src/index";

const SERVICE_NAME = "xp-system";
const PORT = 41735;
const app = createServiceApp(SERVICE_NAME);

const xpTotals = new Map<string, Map<string, number>>();
const xpHistory = new Map<string, Array<{ at: string; skill: string; amount: number; source: string }>>();
const restedXpClaims = new Map<string, { available: number; lastClaimAt: string | null }>();

function characterXp(characterId: string) {
  let state = xpTotals.get(characterId);
  if (!state) {
    state = new Map<string, number>();
    xpTotals.set(characterId, state);
  }
  return state;
}

function historyFor(characterId: string) {
  let state = xpHistory.get(characterId);
  if (!state) {
    state = [];
    xpHistory.set(characterId, state);
  }
  return state;
}

function restedFor(characterId: string) {
  let state = restedXpClaims.get(characterId);
  if (!state) {
    state = { available: 20, lastClaimAt: null };
    restedXpClaims.set(characterId, state);
  }
  return state;
}

function applyDistribution(characterId: string, distribution: Array<{ skill: string; amount: number }>, source: string) {
  const totals = characterXp(characterId);
  const history = historyFor(characterId);
  const at = nowIso();
  for (const entry of distribution) {
    const skill = String(entry.skill ?? 'SURVIVAL').toUpperCase();
    const amount = Math.max(0, Number(entry.amount ?? 0));
    totals.set(skill, (totals.get(skill) ?? 0) + amount);
    history.push({ at, skill, amount, source });
  }
  return summarizeCharacterXp(characterId);
}

function summarizeCharacterXp(characterId: string) {
  const totals = characterXp(characterId);
  const distribution = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([skill, totalXp]) => ({
      skill,
      totalXp,
      level: Math.floor(totalXp / 100) + 1,
      masteryTier: totalXp >= 5000 ? 'LEGENDARY' : totalXp >= 2500 ? 'MASTER' : totalXp >= 1000 ? 'EXPERT' : totalXp >= 400 ? 'ADEPT' : totalXp >= 150 ? 'APPRENTICE' : 'NOVICE'
    }));
  return {
    characterId,
    skills: distribution,
    totalXp: distribution.reduce((sum, item) => sum + item.totalXp, 0)
  };
}

function levelPreview(totalXp: number) {
  return { totalXp, level: Math.floor(totalXp / 100) + 1, nextLevelAt: (Math.floor(totalXp / 100) + 1) * 100 };
}

function keywordSkills(text: string): string[] {
  const normalized = text.toUpperCase();
  const tags = new Set<string>();
  if (/(WOOD|LOG|TIMBER|CHOP)/.test(normalized)) tags.add("WOODCUTTING");
  if (/(MINE|ORE|STONE|QUARRY|ROCK|METAL)/.test(normalized)) tags.add("MINING");
  if (/(CRAFT|SMELT|FORGE|ASSEMBLE)/.test(normalized)) tags.add("CRAFTING");
  if (/(BUILD|PLACE|BLOCK|WALL|STRUCTURE|FORTIFY)/.test(normalized)) tags.add("BUILDING");
  if (/(PLANT|HARVEST|FARM|SEED)/.test(normalized)) tags.add("FARMING");
  if (/(FISH|HOOK|NET)/.test(normalized)) tags.add("FISHING");
  if (/(FORAGE|HERB|BERRY|MUSHROOM|ROOT)/.test(normalized)) tags.add("FORAGING");
  if (/(CHAT|TALK|BARTER|TRADE|GREET)/.test(normalized)) tags.add("SOCIAL");
  if (/(SCOUT|EXPLORE|TRAVEL|MAP)/.test(normalized)) tags.add("EXPLORATION");
  if (/(TRACK|TRAIL|PRINT|TRACKING)/.test(normalized)) tags.add("TRACKING");
  if (/(SNEAK|HIDE)/.test(normalized)) tags.add("STEALTH");
  if (/(FIGHT|ATTACK|SPAR|COMBAT|HUNT)/.test(normalized)) tags.add("COMBAT");
  if (/(COOK|MEAL|FIRE)/.test(normalized)) tags.add("COOKING");
  if (/(HEAL|MEDIC|BANDAGE)/.test(normalized)) tags.add("HEALING");
  if (/(MAGIC|SPELL|ARCANE|MANA|FOCUS)/.test(normalized)) tags.add("MAGIC");
  if (/(RITUAL|SIGIL|CHANT|ALTAR|BINDING|OFFERING)/.test(normalized)) tags.add("RITUALS");
  return Array.from(tags);
}

function resolveSkills(action: XpActionRecord & Record<string, unknown>): string[] {
  const explicit = new Set<string>();
  if (typeof action.primarySkill === "string" && action.primarySkill) explicit.add(action.primarySkill.toUpperCase());
  if (typeof action.secondarySkill === "string" && action.secondarySkill) explicit.add(action.secondarySkill.toUpperCase());
  for (const skill of Array.isArray(action.skillsSuspected) ? action.skillsSuspected : []) {
    explicit.add(String(skill).toUpperCase());
  }
  for (const skill of keywordSkills(`${action.actionType ?? ""} ${action.context?.note ?? action.note ?? ""}`)) {
    explicit.add(skill);
  }
  if (!explicit.size) explicit.add("SURVIVAL");
  explicit.add("SURVIVAL");
  return Array.from(explicit);
}

function evaluate(actions: Array<XpActionRecord & Record<string, unknown>>, directXp?: Record<string, number>) {
  const totals = new Map<string, number>();
  const inferredSkills = actions.map((action) => ({
    actionType: String(action.actionType ?? "UNKNOWN"),
    skills: resolveSkills(action)
  }));

  for (const action of actions) {
    const skills = resolveSkills(action);
    let base = Math.max(1, Math.round((Number(action.duration ?? 0) + Number(action.count ?? 0) * 5) * Math.max(0.1, Number(action.completion ?? 1))));
    if (action.context?.comboGroup || action.comboGroup) base += 4;
    if (action.context?.note || action.note) base += 2;
    if (action.secondarySkill) base += 2;
    if (action.actionIntent === "RITUAL" || skills.includes("RITUALS")) base += 3;
    if (skills.length > 1) base += 1;

    const primary = typeof action.primarySkill === "string" ? action.primarySkill.toUpperCase() : skills[0];
    const secondary = typeof action.secondarySkill === "string" && action.secondarySkill ? action.secondarySkill.toUpperCase() : null;
    const primaryShare = Math.max(1, Math.round(base * (secondary ? 0.65 : 0.8)));
    totals.set(primary, (totals.get(primary) ?? 0) + primaryShare);

    if (secondary) {
      const secondaryShare = Math.max(1, base - primaryShare);
      totals.set(secondary, (totals.get(secondary) ?? 0) + secondaryShare);
    }

    for (const skill of skills) {
      if (skill !== primary && skill !== secondary) {
        totals.set(skill, (totals.get(skill) ?? 0) + 1);
      }
    }
  }

  for (const [skill, amount] of Object.entries(directXp ?? {})) {
    totals.set(skill, (totals.get(skill) ?? 0) + Number(amount));
  }

  const distribution = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([skill, amount]) => ({ skill, amount, reason: "Calculated from submitted skill actions" }));

  return {
    totalXp: distribution.reduce((sum, item) => sum + item.amount, 0),
    distribution,
    inferredSkills
  };
}

app.post("/api/v1/xp/evaluate", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, evaluate(req.body.actions ?? [], req.body.directXp));
});

app.post("/api/v1/xp/apply-direct", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? req.body.userId ?? "unknown");
  const grants = Object.entries(req.body.directXp ?? {}).map(([skill, amount]) => ({ skill: String(skill).toUpperCase(), amount: Number(amount ?? 0) }));
  const summary = applyDistribution(characterId, grants, "apply-direct");
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    userId: req.body.userId,
    characterId,
    grants,
    summary
  });
});

app.post("/api/v1/xp/preview", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, evaluate(req.body.actions ?? []));
});

app.post("/api/v1/xp/from-actions", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, evaluate(req.body.actions ?? [], req.body.directXp));
});

app.get("/api/v1/xp/skill/:skillKey/rules", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    skill: req.params.skillKey,
    rules: [
      "duration increases score",
      "count increases score",
      "completion scales score",
      "mixed skill actions split credit between primary and secondary skills",
      "action notes add context bonuses and can sharpen intent",
      "ritual and magic pairings add extra weighting when the notes clearly support them"
    ]
  });
});

app.get("/api/v1/xp/skill/:skillKey/curve", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    skill: req.params.skillKey,
    formula: "level = floor(totalXp / 100) + 1",
    maxLevel: 100
  });
});


app.get("/api/v1/xp/history/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, history: historyFor(req.params.characterId) });
});

app.get("/api/v1/xp/mastery/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  const summary = summarizeCharacterXp(req.params.characterId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    characterId: req.params.characterId,
    mastery: summary.skills.map((skill) => ({
      skill: skill.skill,
      level: skill.level,
      totalXp: skill.totalXp,
      masteryTier: skill.masteryTier,
      rewardPreview: skill.masteryTier === 'LEGENDARY' ? ['title_unlock', 'passive_aura'] : skill.masteryTier === 'MASTER' ? ['special_recipe'] : ['minor_bonus']
    }))
  });
});

app.post("/api/v1/xp/recalculate/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  const totals = new Map<string, number>();
  for (const entry of historyFor(req.params.characterId)) {
    totals.set(entry.skill, (totals.get(entry.skill) ?? 0) + Number(entry.amount ?? 0));
  }
  xpTotals.set(req.params.characterId, totals);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recalculated: true, summary: summarizeCharacterXp(req.params.characterId) });
});

app.post("/api/v1/xp/apply-batch", (req, res) => {
  const requestId = getRequestId(req);
  const records = Array.isArray(req.body.records) ? req.body.records : [];
  const applied = records.map((record: any) => {
    const characterId = String(record.characterId ?? 'unknown');
    const summary = applyDistribution(characterId, Object.entries(record.directXp ?? {}).map(([skill, amount]) => ({ skill: String(skill).toUpperCase(), amount: Number(amount ?? 0) })), String(record.source ?? 'apply-batch'));
    return { characterId, summary };
  });
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { appliedCount: applied.length, applied });
});

app.post("/api/v1/xp/preview-levels", (req, res) => {
  const requestId = getRequestId(req);
  const items = Array.isArray(req.body.entries) ? req.body.entries : [];
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    previews: items.map((entry: any) => ({ skill: String(entry.skill ?? 'SURVIVAL').toUpperCase(), ...levelPreview(Number(entry.totalXp ?? entry.amount ?? 0)) }))
  });
});

app.get("/api/v1/xp/leaderboard/:skillKey", (req, res) => {
  const requestId = getRequestId(req);
  const skillKey = String(req.params.skillKey ?? 'SURVIVAL').toUpperCase();
  const leaderboard = Array.from(xpTotals.entries())
    .map(([characterId, totals]) => ({ characterId, totalXp: totals.get(skillKey) ?? 0, level: Math.floor((totals.get(skillKey) ?? 0) / 100) + 1 }))
    .sort((a, b) => b.totalXp - a.totalXp)
    .slice(0, 25);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { skillKey, leaderboard });
});

app.get("/api/v1/xp/bonuses/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  const rested = restedFor(req.params.characterId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    characterId: req.params.characterId,
    bonuses: [
      { key: 'rested_xp', multiplier: rested.available > 0 ? 1.25 : 1, remaining: rested.available },
      { key: 'frontier_learning', multiplier: 1.05, remaining: null }
    ]
  });
});

app.post("/api/v1/xp/claim-rested", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const rested = restedFor(characterId);
  const claimed = rested.available;
  rested.available = 0;
  rested.lastClaimAt = nowIso();
  if (claimed > 0) applyDistribution(characterId, [{ skill: 'SURVIVAL', amount: claimed }], 'rested-xp');
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId, claimed, rested });
});

app.get("/api/v1/xp/rested/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, rested: restedFor(req.params.characterId) });
});

app.get("/api/v1/xp/skill/:skillKey/caps", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { skill: req.params.skillKey, softCapXp: 10000, hardCapLevel: 100 });
});

app.get("/api/v1/xp/skill/:skillKey/mastery-rewards", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    skill: req.params.skillKey,
    rewards: [
      { masteryTier: 'APPRENTICE', reward: 'minor_efficiency_bonus' },
      { masteryTier: 'ADEPT', reward: 'recipe_unlock' },
      { masteryTier: 'EXPERT', reward: 'rare_action_option' },
      { masteryTier: 'MASTER', reward: 'title_unlock' },
      { masteryTier: 'LEGENDARY', reward: 'signature_perk' }
    ]
  });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
