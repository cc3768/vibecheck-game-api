export type ItemMetaRecord = { name: string; description: string };
export type HerbCatalogEntry = { key: string; weight: number; terrain: string[] };
export type DynamicItemRecord = {
  itemKey: string;
  name: string;
  description: string;
  category?: string;
  preferredSkills?: string[];
  requiredTerrain?: string[];
  synonyms?: string[];
  discoverable?: boolean;
  status?: string;
};
export type DynamicSkillRecord = {
  skillKey: string;
  name: string;
  description: string;
  unlockHint: string;
  prereqs?: string[];
  discoverable?: boolean;
  status?: string;
};
export type RecipeRecord = {
  recipeKey: string;
  name: string;
  inputs: Array<{ itemKey: string; amount: number }>;
  outputs: Array<{ itemKey: string; amount: number }>;
  tools?: Array<{ toolKey: string }>;
  station?: string;
  keywords?: string[];
};
export type DiscoverySeedRecord = {
  discoveryKey: string;
  type: "item" | "skill" | "recipe" | "world_event" | "resource_node";
  targetKey: string;
  aliases: string[];
  reason?: string;
  terrainRules?: string[];
  intentRules?: string[];
  confidenceMin?: number;
  autoCreate?: boolean;
  status?: string;
  item?: DynamicItemRecord;
  skill?: DynamicSkillRecord | null;
  recipe?: RecipeRecord | null;
};

export const SEED_SKILL_PREREQS: Record<string, string[]> = {
  GENERAL: [],
  SURVIVAL: ["GENERAL"],
  SOCIAL: ["GENERAL"],
  EXPLORATION: ["GENERAL"],
  WOODCUTTING: ["GENERAL"],
  FORAGING: ["GENERAL"],
  MINING: ["GENERAL"],
  BUILDING: ["GENERAL"],
  FISHING: ["GENERAL"],
  FARMING: ["GENERAL"],
  COOKING: ["GENERAL"],
  CRAFTING: ["GENERAL"],
  COMBAT: ["GENERAL"],
  TRACKING: ["SURVIVAL"],
  STEALTH: ["SURVIVAL"],
  HEALING: ["SURVIVAL"],
  MAGIC: ["GENERAL"],
  RITUALS: ["MAGIC"],
  KNAPPING: ["CRAFTING"],
  LAPIDARY: ["MINING"],
  WEAVING: ["FORAGING"],
  MASONRY: ["BUILDING"],
  ALCHEMY: ["CRAFTING"]
};

export const SEED_INTENT_SKILLS: Record<string, string[]> = {
  FISH: ["FISHING", "SURVIVAL"],
  COOK_FISH: ["COOKING", "FISHING"],
  OBSERVE: ["GENERAL"],
  SCOUT: ["GENERAL", "EXPLORATION"],
  FORAGE: ["FORAGING", "SURVIVAL"],
  WATER_COLLECT: ["GENERAL", "SURVIVAL"],
  WATER_USE: ["GENERAL"],
  WOODCUT: ["WOODCUTTING", "SURVIVAL"],
  MINE: ["MINING", "SURVIVAL"],
  DROP_ITEM: ["GENERAL"],
  SPLIT_ITEM: ["GENERAL"],
  UNPACK_HERB_BUNDLE: ["GENERAL"],
  IDENTIFY_HERB: ["GENERAL", "FORAGING"],
  CRAFT_RECIPE: ["CRAFTING"],
  BREW_TEA: ["COOKING", "GENERAL"],
  BUILD: ["BUILDING", "GENERAL"],
  REST: ["GENERAL"],
  SOCIAL: ["SOCIAL", "GENERAL"],
  RITUAL: ["RITUALS", "MAGIC"],
  MAGIC: ["MAGIC", "GENERAL"],
  GENERAL: ["GENERAL"]
};

export const SEED_ITEMS: Record<string, ItemMetaRecord> = {
  unidentified_herb: { name: "Unidentified Herb", description: "A fresh plant you have not classified yet." },
  raw_herb: { name: "Raw Herb", description: "A loose herb fit for simple medicine or tea." },
  stem_fiber: { name: "Stem Fiber", description: "Tough plant fibers useful in primitive craft." },
  bitter_root: { name: "Bitter Root", description: "Edible, but unpleasant and sharp on the tongue." },
  wild_berry: { name: "Wild Berry", description: "Small tart berries picked from a bush. Edible, though some are more sour than sweet." },
  strange_seed: { name: "Strange Seed", description: "A seed of unknown origin that may sprout later." },
  fresh_water: { name: "Fresh Water", description: "Clear water collected from a nearby source." },
  bark_strip: { name: "Bark Strip", description: "Rough bark stripped from green wood." },
  wood_log: { name: "Wood Log", description: "A sturdy section of usable wood." },
  iron_ore: { name: "Iron Ore", description: "Ore that could be smelted with proper heat and tools." },
  stone_chunk: { name: "Stone Chunk", description: "A workable chunk of hard stone." },
  shale_fragment: { name: "Shale Fragment", description: "A brittle shard split from poor stone." },
  splintered_bark: { name: "Splintered Bark", description: "Shredded bark left from a bad cut." },
  scrap: { name: "Scrap", description: "A ruined or low-value leftover from a failed attempt." },
  kindling: { name: "Kindling", description: "Small pieces of split wood useful for fire-starting." },
  charred_slurry: { name: "Charred Slurry", description: "A blackened ruined mixture from a failed brew." },
  ritual_ash: { name: "Ritual Ash", description: "A faintly charged ash left after unstable magic." },
  wooden_frame: { name: "Wooden Frame", description: "A simple wooden structure base." },
  stone_marker: { name: "Stone Marker", description: "A carved stone used to mark a place." },
  herb_moonmint: { name: "Moonmint", description: "A cool minty herb often steeped into tea." },
  herb_sunroot: { name: "Sunroot", description: "A bright root with warming properties." },
  herb_silverleaf: { name: "Silverleaf", description: "A calming leaf with a silvery underside." },
  herb_bitterwort: { name: "Bitterwort", description: "Sharp and medicinal in very small doses." },
  herb_pine_needles: { name: "Pine Needles", description: "Needles with a clean resin scent." },
  tea_moonmint: { name: "Moonmint Tea", description: "A cool, soothing herbal tea." },
  tea_sunroot: { name: "Sunroot Tea", description: "A bright warming tea with a sharp finish." },
  tea_silverleaf: { name: "Silverleaf Tea", description: "A calming silverleaf infusion." },
  tea_bitterwort: { name: "Bitterwort Tea", description: "A harsh but medicinal brew." },
  tea_pine_needles: { name: "Pine Needle Tea", description: "A clear forest-scented tea." },
  herbal_tea: { name: "Herbal Tea", description: "A basic brewed herb drink." },
  raw_fish: { name: "Raw Fish", description: "A freshly caught fish, still wet from the water." },
  cooked_fish: { name: "Cooked Fish", description: "A fish roasted over a fire until it flakes apart." },
  cooked_perch: { name: "Cooked Perch", description: "A river perch roasted over coals — firm and fragrant." },
  cooked_catfish: { name: "Cooked Catfish", description: "Catfish roasted whole, smoky and rich." },
  charred_fish: { name: "Charred Fish", description: "A fish badly burnt over an uncontrolled fire. Still edible, barely." },
  small_fish: { name: "Small Fish", description: "A small catch — bony but edible." },
  river_perch: { name: "River Perch", description: "A firm-fleshed river fish with striped sides." },
  catfish: { name: "Catfish", description: "A whiskered bottom-dweller, good eating if you gut it right." },
  mudfish: { name: "Mudfish", description: "A murky-water fish. Edible but unpleasant." },
  fishing_line: { name: "Fishing Line", description: "A length of twisted fiber line, usable for a basic fishing rig." },
  fishing_hook: { name: "Fishing Hook", description: "A simple bent-bone or stone hook for catching fish." },
  fishing_rod: { name: "Fishing Rod", description: "A sturdy rod with line attached, ready for casting." },
  bait: { name: "Bait", description: "Grubs, worms, or scraps suitable for baiting a hook." },
  flint: { name: "Flint", description: "A hard dark stone that breaks into sharp edges, useful for primitive tools and sparks." },
  quartz: { name: "Quartz", description: "A pale crystal vein with glassy fracture lines and a faint inner gleam." },
  clay_lump: { name: "Clay Lump", description: "Wet dense clay scooped from the earth, ready for shaping or drying." },
  reeds: { name: "Reeds", description: "Flexible wetland stalks that can be dried and woven into simple work." },
  plant_fiber: { name: "Plant Fiber", description: "Long stripped fibers that can be twisted into lashings or cord." },
  obsidian_shard: { name: "Obsidian Shard", description: "A volcanic black glass shard with an edge far sharper than common stone." }
};

export const SEED_HERB_CATALOG: HerbCatalogEntry[] = [
  { key: "moonmint", weight: 2, terrain: ["forest", "grass"] },
  { key: "sunroot", weight: 1, terrain: ["grass", "sand"] },
  { key: "silverleaf", weight: 2, terrain: ["forest", "grass"] },
  { key: "bitterwort", weight: 1, terrain: ["rock", "grass"] },
  { key: "pine_needles", weight: 2, terrain: ["forest"] }
];

export const SEED_SKILLS: Record<string, DynamicSkillRecord> = {
  FISHING: { skillKey: "FISHING", name: "Fishing", description: "The patience and technique to draw fish from water with line, hook, or net.", unlockHint: "Try fishing at a water tile — bare-handed or with a line.", prereqs: ["GENERAL"], status: "active", discoverable: true },
  KNAPPING: { skillKey: "KNAPPING", name: "Knapping", description: "The shaping of flint and similar stone into sharp, useful forms.", unlockHint: "Chip, shape, or craft simple flint tools to discover Knapping.", prereqs: ["CRAFTING"], status: "active", discoverable: true },
  LAPIDARY: { skillKey: "LAPIDARY", name: "Lapidary", description: "The cutting, shaping, and finishing of crystal and stone.", unlockHint: "Cut, polish, or mount quartz and other crystals to discover Lapidary.", prereqs: ["MINING"], status: "active", discoverable: true },
  WEAVING: { skillKey: "WEAVING", name: "Weaving", description: "The twisting and interlocking of fibers into stronger forms.", unlockHint: "Twist reeds or plant fiber into bindings and simple goods to discover Weaving.", prereqs: ["FORAGING"], status: "active", discoverable: true },
  MASONRY: { skillKey: "MASONRY", name: "Masonry", description: "The careful shaping and fitting of stone into lasting structures.", unlockHint: "Build with stone and shaped blocks to discover Masonry.", prereqs: ["BUILDING"], status: "active", discoverable: true },
  ALCHEMY: { skillKey: "ALCHEMY", name: "Alchemy", description: "The combining of volatile ingredients into concentrated effects.", unlockHint: "Experiment with herbs, ash, and crystal reagents to discover Alchemy.", prereqs: ["CRAFTING"], status: "active", discoverable: true }
};

export const SEED_DISCOVERIES: DiscoverySeedRecord[] = [
  {
    discoveryKey: "discovery_flint",
    type: "item",
    targetKey: "flint",
    aliases: ["flint", "flint stone", "flint shard"],
    terrainRules: ["rock", "grass"],
    intentRules: ["MINE", "SCOUT", "FORAGE"],
    confidenceMin: 0.6,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "flint",
      name: "Flint",
      description: "A hard dark stone that breaks into sharp edges, useful for primitive tools and sparks.",
      category: "MINERAL",
      preferredSkills: ["MINING", "SURVIVAL"],
      requiredTerrain: ["rock", "grass"],
      synonyms: ["flint", "flint stone", "flint shard"],
      discoverable: true,
      status: "active"
    },
    skill: SEED_SKILLS.KNAPPING,
    reason: "Rocky terrain often exposes flint suitable for primitive tools."
  },
  {
    discoveryKey: "discovery_quartz",
    type: "item",
    targetKey: "quartz",
    aliases: ["quartz", "quarz", "quartz crystal", "crystal quartz"],
    terrainRules: ["rock"],
    intentRules: ["MINE", "SCOUT"],
    confidenceMin: 0.6,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "quartz",
      name: "Quartz",
      description: "A pale crystal vein with glassy fracture lines and a faint inner gleam.",
      category: "MINERAL",
      preferredSkills: ["MINING"],
      requiredTerrain: ["rock"],
      synonyms: ["quartz", "quarz", "quartz crystal", "crystal quartz"],
      discoverable: true,
      status: "active"
    },
    skill: SEED_SKILLS.LAPIDARY,
    reason: "Quartz is a mineable crystal that can open lapidary work."
  },
  {
    discoveryKey: "discovery_clay",
    type: "item",
    targetKey: "clay_lump",
    aliases: ["clay", "mud clay", "potter clay"],
    terrainRules: ["water", "grass"],
    intentRules: ["FORAGE", "SCOUT"],
    confidenceMin: 0.65,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "clay_lump",
      name: "Clay Lump",
      description: "Wet dense clay scooped from the earth, ready for shaping or drying.",
      category: "EARTH",
      preferredSkills: ["SURVIVAL", "CRAFTING"],
      requiredTerrain: ["water", "grass"],
      synonyms: ["clay", "mud clay", "potter clay"],
      discoverable: true,
      status: "active"
    },
    reason: "Wet terrain can expose workable clay."
  },
  {
    discoveryKey: "discovery_reeds",
    type: "item",
    targetKey: "reeds",
    aliases: ["reed", "reeds", "rushes"],
    terrainRules: ["water", "grass"],
    intentRules: ["FORAGE", "SCOUT"],
    confidenceMin: 0.65,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "reeds",
      name: "Reeds",
      description: "Flexible wetland stalks that can be dried and woven into simple work.",
      category: "PLANT",
      preferredSkills: ["FORAGING", "SURVIVAL"],
      requiredTerrain: ["water", "grass"],
      synonyms: ["reed", "reeds", "rushes"],
      discoverable: true,
      status: "active"
    },
    skill: SEED_SKILLS.WEAVING,
    reason: "Wetland reeds support early weaving and cordage."
  },
  {
    discoveryKey: "discovery_plant_fiber",
    type: "item",
    targetKey: "plant_fiber",
    aliases: ["fiber", "plant fiber", "fibers"],
    terrainRules: ["forest", "grass"],
    intentRules: ["FORAGE", "SCOUT"],
    confidenceMin: 0.65,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "plant_fiber",
      name: "Plant Fiber",
      description: "Long stripped fibers that can be twisted into lashings or cord.",
      category: "PLANT",
      preferredSkills: ["FORAGING", "CRAFTING"],
      requiredTerrain: ["forest", "grass"],
      synonyms: ["fiber", "plant fiber", "fibers"],
      discoverable: true,
      status: "active"
    },
    skill: SEED_SKILLS.WEAVING,
    reason: "Common plant fibers are a natural weaving precursor."
  },
  {
    discoveryKey: "discovery_fishing_skill",
    type: "skill",
    targetKey: "FISHING",
    aliases: ["fish", "fishing", "cast line", "hook fish", "catch fish"],
    terrainRules: ["water"],
    intentRules: ["FISH", "SCOUT", "FORAGE"],
    confidenceMin: 0.55,
    autoCreate: true,
    status: "active",
    item: null,
    skill: { skillKey: "FISHING", name: "Fishing", description: "The patience and technique to draw fish from water with line, hook, or net.", unlockHint: "Try fishing at a water tile — bare-handed or with a line.", prereqs: ["GENERAL"], discoverable: true, status: "active" },
    recipe: null,
    reason: "Attempting to fish near water reveals the Fishing skill."
  },
  {
    discoveryKey: "discovery_fishing_rod",
    type: "item",
    targetKey: "fishing_rod",
    aliases: ["fishing rod", "rod", "fish pole", "pole"],
    terrainRules: ["water", "forest"],
    intentRules: ["FISH", "CRAFT_RECIPE", "BUILD"],
    confidenceMin: 0.60,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "fishing_rod",
      name: "Fishing Rod",
      description: "A sturdy rod with line attached, ready for casting.",
      category: "TOOL",
      preferredSkills: ["FISHING", "CRAFTING"],
      requiredTerrain: ["water"],
      synonyms: ["fishing rod", "rod", "fish pole", "pole"],
      discoverable: true,
      status: "active"
    },
    skill: null,
    recipe: {
      recipeKey: "craft_fishing_rod",
      name: "Fishing Rod",
      inputs: [{ itemKey: "wood_log", amount: 1 }, { itemKey: "fishing_line", amount: 1 }],
      outputs: [{ itemKey: "fishing_rod", amount: 1 }],
      tools: [],
      station: "FIELD",
      keywords: ["fishing", "rod", "craft", "line"]
    },
    reason: "A rod and line can be assembled from basic materials."
  },
  {
    discoveryKey: "discovery_fishing_line",
    type: "item",
    targetKey: "fishing_line",
    aliases: ["fishing line", "line", "string", "cord"],
    terrainRules: ["water", "forest", "grass"],
    intentRules: ["FISH", "CRAFT_RECIPE", "FORAGE"],
    confidenceMin: 0.60,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "fishing_line",
      name: "Fishing Line",
      description: "A length of twisted fiber line, usable for a basic fishing rig.",
      category: "MATERIAL",
      preferredSkills: ["FISHING", "CRAFTING"],
      requiredTerrain: [],
      synonyms: ["fishing line", "line", "string", "cord"],
      discoverable: true,
      status: "active"
    },
    skill: null,
    recipe: {
      recipeKey: "craft_fishing_line",
      name: "Fishing Line",
      inputs: [{ itemKey: "plant_fiber", amount: 2 }],
      outputs: [{ itemKey: "fishing_line", amount: 1 }],
      tools: [],
      station: "FIELD",
      keywords: ["fishing", "line", "craft", "fiber", "cord"]
    },
    reason: "Twisted plant fiber makes a workable fishing line."
  },
  {
    discoveryKey: "discovery_bait",
    type: "item",
    targetKey: "bait",
    aliases: ["bait", "worm", "grub", "lure"],
    terrainRules: ["water", "grass", "forest"],
    intentRules: ["FISH", "FORAGE", "SCOUT"],
    confidenceMin: 0.55,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "bait",
      name: "Bait",
      description: "Grubs, worms, or scraps suitable for baiting a hook.",
      category: "CONSUMABLE",
      preferredSkills: ["FISHING", "SURVIVAL"],
      requiredTerrain: ["water", "grass"],
      synonyms: ["bait", "worm", "grub", "lure"],
      discoverable: true,
      status: "active"
    },
    skill: null,
    recipe: null,
    reason: "Digging near water or damp grass can turn up usable bait."
  },
  {
    discoveryKey: "discovery_river_perch",
    type: "item",
    targetKey: "river_perch",
    aliases: ["perch", "river perch", "striped fish"],
    terrainRules: ["water"],
    intentRules: ["FISH"],
    confidenceMin: 0.62,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "river_perch",
      name: "River Perch",
      description: "A firm-fleshed river fish with striped sides.",
      category: "FOOD",
      preferredSkills: ["FISHING"],
      requiredTerrain: ["water"],
      synonyms: ["perch", "river perch", "striped fish"],
      discoverable: true,
      status: "active"
    },
    skill: null,
    recipe: null,
    reason: "Perch are common in flowing water and rivers."
  },
  {
    discoveryKey: "discovery_obsidian",
    type: "item",
    targetKey: "obsidian_shard",
    aliases: ["obsidian", "volcanic glass"],
    terrainRules: ["rock"],
    intentRules: ["MINE", "SCOUT"],
    confidenceMin: 0.72,
    autoCreate: true,
    status: "active",
    item: {
      itemKey: "obsidian_shard",
      name: "Obsidian Shard",
      description: "A volcanic black glass shard with an edge far sharper than common stone.",
      category: "MINERAL",
      preferredSkills: ["MINING", "SURVIVAL"],
      requiredTerrain: ["rock"],
      synonyms: ["obsidian", "volcanic glass"],
      discoverable: true,
      status: "active"
    },
    skill: SEED_SKILLS.KNAPPING,
    reason: "Sharp volcanic glass implies stone shaping possibilities."
  }
];
