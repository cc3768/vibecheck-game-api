import { RECIPE_DEFINITIONS, SERVICE_VERSION, createServiceApp, getRequestId, getServiceUrl, sendError, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "production-system";
const PORT = 41737;
const app = createServiceApp(SERVICE_NAME);
const machines: Array<{ machineId: string; type: string; status: string; jobs: any[]; lastStartedAt?: string | null; lastStoppedAt?: string | null }> = [];
const craftQueue = new Map<string, any[]>();
const unlockedRecipes = new Map<string, Set<string>>();

function queueFor(characterId: string) {
  let state = craftQueue.get(characterId);
  if (!state) {
    state = [];
    craftQueue.set(characterId, state);
  }
  return state;
}

function unlockedFor(characterId: string) {
  let state = unlockedRecipes.get(characterId);
  if (!state) {
    state = new Set<string>();
    unlockedRecipes.set(characterId, state);
  }
  return state;
}

function machineById(machineId: string) {
  return machines.find((machine) => machine.machineId === machineId) ?? null;
}

function normalizeText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recipeCatalog() {
  return (RECIPE_DEFINITIONS as Array<any>).map((recipe) => ({
    ...recipe,
    keywords: Array.isArray(recipe.keywords) ? recipe.keywords : []
  }));
}

function findRecipe(recipeKey: string) {
  return recipeCatalog().find((recipe) => recipe.recipeKey === recipeKey) ?? null;
}

function discoverRecipes(query: string) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  return recipeCatalog()
    .map((recipe) => {
      const hay = [recipe.recipeKey, recipe.name, ...(recipe.keywords ?? [])].map(normalizeText).join(" ");
      let score = 0;
      if (hay.includes(normalized)) score += normalized.length + 10;
      for (const token of tokens) {
        if (hay.includes(token)) score += token.length + 1;
      }
      return { recipe, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.recipe);
}

function evaluateRecipe(recipeKey: string, availableItems: Array<{ itemKey: string; amount: number }>, availableTools: string[], nearbyObjects: string[]) {
  const recipe = findRecipe(recipeKey);
  if (!recipe) {
    return { recipe: null, valid: false, missingIngredients: [], missingTools: [], contextBlocks: ["Recipe not found."] };
  }

  const items = new Map((availableItems ?? []).map((item) => [String(item.itemKey), Number(item.amount ?? 0)]));
  const tools = new Set((availableTools ?? []).map((item) => String(item)));
  const nearby = new Set((nearbyObjects ?? []).map((item) => String(item).toUpperCase()));

  const missingIngredients = (recipe.inputs ?? [])
    .filter((input: any) => Number(items.get(String(input.itemKey)) ?? 0) < Number(input.amount ?? 0))
    .map((input: any) => ({ itemKey: String(input.itemKey), amount: Number(input.amount ?? 0) - Number(items.get(String(input.itemKey)) ?? 0) }));

  const missingTools = (recipe.tools ?? [])
    .filter((tool: any) => !tools.has(String(tool.toolKey)))
    .map((tool: any) => ({ toolKey: String(tool.toolKey) }));

  const contextBlocks: string[] = [];
  if (recipe.station && recipe.station !== "FIELD" && !nearby.has(String(recipe.station).toUpperCase())) {
    contextBlocks.push(`You need ${String(recipe.station).toLowerCase().replaceAll("_", " ")} nearby for this recipe.`);
  }

  return {
    recipe,
    valid: missingIngredients.length === 0 && missingTools.length === 0 && contextBlocks.length === 0,
    missingIngredients,
    missingTools,
    contextBlocks
  };
}

function sendEvaluation(req: any, res: any) {
  const requestId = getRequestId(req);
  const result = evaluateRecipe(String(req.body.recipeKey ?? ""), req.body.availableItems ?? [], req.body.availableTools ?? [], req.body.nearbyObjects ?? req.body.stationContext ?? []);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, result);
}

app.post("/api/v1/production/evaluate", (req, res) => {
  sendEvaluation(req, res);
});

app.post("/api/v1/production/validate", (req, res) => {
  sendEvaluation(req, res);
});

app.post("/api/v1/production/craft", async (req, res) => {
  const requestId = getRequestId(req);
  const quantity = Math.max(1, Number(req.body.quantity ?? 1));
  const characterId = String(req.body.characterId ?? "");
  const recipe = findRecipe(String(req.body.recipeKey ?? ""));

  if (!characterId) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "MISSING_CHARACTER", "characterId is required for crafting", 400);
  }
  if (!recipe) {
    return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "RECIPE_NOT_FOUND", "Recipe not found", 404);
  }

  try {
    const characterResponse = await fetch(`${getServiceUrl("character-system")}/api/v1/character/${characterId}`, {
      headers: { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token" }
    });
    const characterJson = await characterResponse.json();
    const character = characterJson?.data?.character;
    if (!characterResponse.ok || !character) {
      return res.status(characterResponse.status || 404).json(characterJson);
    }

    const evaluation = evaluateRecipe(recipe.recipeKey, Object.entries(character.inventory ?? {}).map(([itemKey, amount]) => ({ itemKey, amount: Number(amount ?? 0) })), Object.keys(character.inventory ?? {}), req.body.nearbyObjects ?? []);
    if (!evaluation.valid) {
      return sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CRAFT_INVALID", "Recipe requirements are not met", 409, evaluation);
    }

    const inventoryChanges: Record<string, number> = {};
    for (const input of recipe.inputs ?? []) inventoryChanges[String(input.itemKey)] = (inventoryChanges[String(input.itemKey)] ?? 0) - Number(input.amount ?? 0) * quantity;
    for (const output of recipe.outputs ?? []) inventoryChanges[String(output.itemKey)] = (inventoryChanges[String(output.itemKey)] ?? 0) + Number(output.amount ?? 0) * quantity;

    const applyResponse = await fetch(`${getServiceUrl("character-system")}/api/v1/character/apply-action-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-token"
      },
      body: JSON.stringify({ characterId, inventoryChanges, xp: {}, vitals: {} })
    });
    const applyJson = await applyResponse.json();
    if (!applyResponse.ok) {
      return res.status(applyResponse.status).json(applyJson);
    }

    sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
      created: true,
      recipeKey: recipe.recipeKey,
      quantity,
      inventoryChanges,
      outputItems: (recipe.outputs ?? []).map((output: any) => ({ itemKey: output.itemKey, amount: Number(output.amount ?? 0) * quantity })),
      character: applyJson?.data?.character ?? null
    });
  } catch (error) {
    sendError(res, SERVICE_NAME, SERVICE_VERSION, requestId, "CRAFT_FAILED", error instanceof Error ? error.message : "Craft failed", 500);
  }
});

app.post("/api/v1/production/discover", (req, res) => {
  const requestId = getRequestId(req);
  const matches = discoverRecipes(String(req.body.query ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { matches });
});

app.get("/api/v1/production/recipe/:recipeKey", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recipe: findRecipe(req.params.recipeKey) });
});

app.get("/api/v1/production/item/:itemKey", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { item: { itemKey: req.params.itemKey, name: req.params.itemKey.replaceAll("_", " "), category: "GENERIC" } });
});

app.post("/api/v1/production/check-ingredients", (req, res) => {
  const requestId = getRequestId(req);
  const recipe = findRecipe(String(req.body.recipeKey ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { ingredients: recipe?.inputs ?? [] });
});

app.post("/api/v1/production/check-tools", (req, res) => {
  const requestId = getRequestId(req);
  const recipe = findRecipe(String(req.body.recipeKey ?? ""));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { tools: recipe?.tools ?? [] });
});

app.post("/api/v1/production/register-machine", (req, res) => {
  const requestId = getRequestId(req);
  machines.push(req.body);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { registered: true, totalMachines: machines.length });
});


app.post("/api/v1/production/queue-craft", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const entry = {
    jobId: `craft_${Date.now().toString(36)}`,
    characterId,
    recipeKey: String(req.body.recipeKey ?? ''),
    quantity: Math.max(1, Number(req.body.quantity ?? 1)),
    status: 'QUEUED',
    queuedAt: new Date().toISOString()
  };
  queueFor(characterId).push(entry);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { queued: true, entry, queue: queueFor(characterId) });
});

app.get("/api/v1/production/queue/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, queue: queueFor(req.params.characterId) });
});

app.post("/api/v1/production/cancel", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const jobId = String(req.body.jobId ?? '');
  const queue = queueFor(characterId);
  const index = queue.findIndex((job) => job.jobId === jobId);
  const removed = index >= 0 ? queue.splice(index, 1)[0] : null;
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { cancelled: Boolean(removed), removed, queue });
});

app.post("/api/v1/production/salvage", (req, res) => {
  const requestId = getRequestId(req);
  const amount = Math.max(1, Number(req.body.amount ?? 1));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    salvaged: true,
    sourceItemKey: req.body.itemKey,
    returns: [{ itemKey: `${String(req.body.itemKey ?? 'scrap')}_parts`, amount }]
  });
});

app.post("/api/v1/production/refine", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, {
    refined: true,
    sourceItemKey: req.body.itemKey,
    resultItemKey: req.body.resultItemKey ?? `refined_${String(req.body.itemKey ?? 'material')}`
  });
});

app.post("/api/v1/production/repair", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { repaired: true, itemKey: req.body.itemKey, durabilityRestored: Number(req.body.amount ?? 25) });
});

app.post("/api/v1/production/recycle", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { recycled: true, itemKey: req.body.itemKey, materials: [{ itemKey: 'scrap', amount: Math.max(1, Number(req.body.amount ?? 1)) }] });
});

app.post("/api/v1/production/learn-recipe", (req, res) => {
  const requestId = getRequestId(req);
  const characterId = String(req.body.characterId ?? 'unknown');
  const recipeKey = String(req.body.recipeKey ?? '');
  unlockedFor(characterId).add(recipeKey);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { learned: true, characterId, recipeKey, unlockedRecipes: Array.from(unlockedFor(characterId)) });
});

app.get("/api/v1/production/recipes/by-skill/:skillKey", (req, res) => {
  const requestId = getRequestId(req);
  const skillKey = String(req.params.skillKey ?? '').toUpperCase();
  const recipes = recipeCatalog().filter((recipe) => String(recipe.skillKey ?? recipe.primarySkill ?? '').toUpperCase() === skillKey || (recipe.keywords ?? []).some((keyword: string) => String(keyword).toUpperCase().includes(skillKey)));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { skillKey, recipes });
});

app.get("/api/v1/production/recipes/unlocked/:characterId", (req, res) => {
  const requestId = getRequestId(req);
  const unlocked = unlockedFor(req.params.characterId);
  const recipes = recipeCatalog().filter((recipe) => unlocked.has(recipe.recipeKey));
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { characterId: req.params.characterId, unlockedRecipeKeys: Array.from(unlocked), recipes });
});

app.post("/api/v1/production/machine/start", (req, res) => {
  const requestId = getRequestId(req);
  const machineId = String(req.body.machineId ?? `machine_${Date.now().toString(36)}`);
  let machine = machineById(machineId);
  if (!machine) {
    machine = { machineId, type: String(req.body.type ?? 'GENERIC'), status: 'IDLE', jobs: [] };
    machines.push(machine);
  }
  machine.status = 'RUNNING';
  machine.lastStartedAt = new Date().toISOString();
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { started: true, machine });
});

app.post("/api/v1/production/machine/stop", (req, res) => {
  const requestId = getRequestId(req);
  const machine = machineById(String(req.body.machineId ?? ''));
  if (machine) {
    machine.status = 'STOPPED';
    machine.lastStoppedAt = new Date().toISOString();
  }
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { stopped: Boolean(machine), machine });
});

app.get("/api/v1/production/machine/:machineId", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { machine: machineById(req.params.machineId) });
});

app.get("/api/v1/production/machine/:machineId/jobs", (req, res) => {
  const requestId = getRequestId(req);
  const machine = machineById(req.params.machineId);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { machineId: req.params.machineId, jobs: machine?.jobs ?? [] });
});

app.post("/api/v1/production/machine/:machineId/job", (req, res) => {
  const requestId = getRequestId(req);
  let machine = machineById(req.params.machineId);
  if (!machine) {
    machine = { machineId: req.params.machineId, type: 'GENERIC', status: 'RUNNING', jobs: [] };
    machines.push(machine);
  }
  const job = { jobId: `job_${Date.now().toString(36)}`, recipeKey: String(req.body.recipeKey ?? ''), quantity: Math.max(1, Number(req.body.quantity ?? 1)), status: 'QUEUED', queuedAt: new Date().toISOString() };
  machine.jobs.push(job);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { queued: true, machine, job });
});

app.post("/api/v1/production/machine/:machineId/collect", (req, res) => {
  const requestId = getRequestId(req);
  const machine = machineById(req.params.machineId);
  const completed = machine?.jobs.shift() ?? null;
  if (completed) completed.status = 'COLLECTED';
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { collected: Boolean(completed), machine, job: completed });
});

app.post("/api/v1/production/quality-roll", (req, res) => {
  const requestId = getRequestId(req);
  const seed = Math.max(1, Number(req.body.seed ?? 17));
  const roll = (seed * 13) % 100;
  const quality = roll >= 95 ? 'LEGENDARY' : roll >= 80 ? 'EPIC' : roll >= 55 ? 'FINE' : 'COMMON';
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { roll, quality });
});

app.post("/api/v1/production/byproducts", (req, res) => {
  const requestId = getRequestId(req);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, { byproducts: [{ itemKey: 'ash', amount: 1 }, { itemKey: 'scrap', amount: 1 }] });
});

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
