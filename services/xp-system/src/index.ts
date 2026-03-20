import { SERVICE_VERSION, createServiceApp, getRequestId, sendSuccess } from "../../../packages/shared/src/index";
import type { XpActionRecord } from "../../../packages/shared/src/index";

const SERVICE_NAME = "xp-system";
const PORT = 41735;
const app = createServiceApp(SERVICE_NAME);

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
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    userId: req.body.userId,
    grants: Object.entries(req.body.directXp ?? {}).map(([skill, amount]) => ({ skill, amount }))
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

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
