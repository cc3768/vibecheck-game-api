import type { NpcRecord, QuestDefinition, RewardPackage } from "./contracts";

export const WORLD_REGIONS = [
  { worldId: "world_prime", regionId: "starter_lowlands", name: "Starter Lowlands", biome: "PLAINS", dangerLevel: 1 },
  { worldId: "world_prime", regionId: "whisper_woods", name: "Whisper Woods", biome: "FOREST", dangerLevel: 3 }
];

export const WORLD_TILES = [
  { worldId: "world_prime", regionId: "starter_lowlands", x: 0, y: 0, terrain: "GRASS", walkable: true },
  { worldId: "world_prime", regionId: "whisper_woods", x: 10, y: 4, terrain: "FOREST_FLOOR", walkable: true }
];

export const WORLD_NODES = [
  { id: "node_oak_1", type: "OAK_TREE", quality: "COMMON", position: { worldId: "world_prime", regionId: "whisper_woods", x: 10, y: 4 } },
  { id: "node_iron_1", type: "IRON_VEIN", quality: "UNCOMMON", position: { worldId: "world_prime", regionId: "starter_lowlands", x: 2, y: 1 } }
];

export const NPCS: NpcRecord[] = [
  {
    npcId: "npc_elder_rowan",
    name: "Elder Rowan",
    role: { roleType: "QUEST_GIVER", tags: ["mentor", "village"] },
    regionId: "starter_lowlands",
    memories: [{ key: "player_first_arrival", value: "The player looked lost but determined.", weight: 0.8 }],
    relationships: []
  },
  {
    npcId: "npc_guard_lyra",
    name: "Guard Lyra",
    role: { roleType: "GUARD", tags: ["defender", "trainer"] },
    regionId: "starter_lowlands",
    memories: [],
    relationships: []
  }
];

export const RECIPE_DEFINITIONS = [
  {
    recipeKey: "campfire_basic",
    name: "Basic Campfire",
    keywords: ["campfire", "firepit", "build fire", "place campfire"],
    inputs: [
      { itemKey: "wood_log", amount: 3 },
      { itemKey: "stone_chunk", amount: 2 }
    ],
    tools: [{ toolKey: "tinder_kit" }],
    outputs: [{ itemKey: "campfire_basic", amount: 1 }],
    station: "FIELD"
  },
  {
    recipeKey: "kindling_bundle",
    name: "Kindling Bundle",
    keywords: ["kindling", "split log", "cut log", "prepare firewood"],
    inputs: [{ itemKey: "wood_log", amount: 1 }],
    outputs: [
      { itemKey: "kindling", amount: 3 },
      { itemKey: "bark_strip", amount: 1 }
    ],
    station: "FIELD"
  },
  {
    recipeKey: "herb_poultice",
    name: "Herb Poultice",
    keywords: ["poultice", "medicine", "bandage herb", "crushed herbs"],
    inputs: [
      { itemKey: "raw_herb", amount: 2 },
      { itemKey: "fresh_water", amount: 1 }
    ],
    outputs: [{ itemKey: "herb_poultice", amount: 1 }],
    station: "FIELD"
  },
  {
    recipeKey: "simple_herbal_tea",
    name: "Simple Herbal Tea",
    keywords: ["tea", "brew herb", "steep herb", "herbal tea"],
    inputs: [
      { itemKey: "raw_herb", amount: 1 },
      { itemKey: "fresh_water", amount: 1 }
    ],
    outputs: [{ itemKey: "herbal_tea", amount: 1 }],
    station: "CAMPFIRE"
  }
];

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    questId: "quest_first_steps",
    title: "First Steps",
    summary: "Gather wood and speak with Elder Rowan.",
    status: "AVAILABLE",
    objectives: [
      { key: "gather_wood", description: "Gather 5 wood logs", targetCount: 5 },
      { key: "speak_rowan", description: "Speak to Elder Rowan", targetCount: 1 }
    ],
    rewardPackageId: "reward_first_steps"
  }
];

export const REWARD_PACKAGES: RewardPackage[] = [
  {
    rewardPackageId: "reward_first_steps",
    sourceType: "QUEST",
    sourceId: "quest_first_steps",
    xp: { SURVIVAL: 50, WOODCUTTING: 25 },
    items: [{ itemKey: "bread", amount: 2 }]
  },
  {
    rewardPackageId: "reward_rowan_greeting",
    sourceType: "NPC",
    sourceId: "npc_elder_rowan",
    xp: { SOCIAL: 10 }
  }
];
