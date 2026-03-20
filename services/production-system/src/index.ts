import { RECIPE_DEFINITIONS, SERVICE_VERSION, createServiceApp, getRequestId, getServiceUrl, sendError, sendSuccess } from "../../../packages/shared/src/index";

const SERVICE_NAME = "production-system";
const PORT = 41737;
const app = createServiceApp(SERVICE_NAME);
const machines: unknown[] = [];

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

app.post("/api/v1/production/evaluate", (req, res) => {
  const requestId = getRequestId(req);
  const result = evaluateRecipe(String(req.body.recipeKey ?? ""), req.body.availableItems ?? [], req.body.availableTools ?? [], req.body.nearbyObjects ?? req.body.stationContext ?? []);
  sendSuccess(res, SERVICE_NAME, SERVICE_VERSION, requestId, result);
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

app.listen(PORT, () => console.log(`[${SERVICE_NAME}] listening on http://127.0.0.1:${PORT}`));
