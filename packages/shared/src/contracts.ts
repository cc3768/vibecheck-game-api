export type UUID = string;
export type ISODateString = string;
export type SkillKey = string;
export type ActionTypeKey = string;
export type ItemKey = string;
export type RecipeKey = string;
export type WorldId = string;
export type RegionId = string;
export type CharacterId = string;
export type AccountId = string;
export type QuestId = string;
export type NpcId = string;
export type RewardPackageId = string;
export type CombatEncounterId = string;

export type CharacterRace = "HUMAN" | "WOLFMAN" | "DWARF" | "ELF";
export type RewardSourceType = "QUEST" | "NPC" | "DISCOVERY" | "EVENT" | "ACHIEVEMENT";
export type CombatStyle = "MELEE" | "RANGED" | "MAGIC";
export type QuestStatus = "AVAILABLE" | "ACTIVE" | "COMPLETED" | "FAILED" | "LOCKED";
export type NpcRoleType = "VILLAGER" | "GUARD" | "TEACHER" | "TRADER" | "CREATURE" | "ENEMY" | "QUEST_GIVER";

export interface ServiceRequestMeta {
  requestId: string;
  correlationId: string;
  timestamp: ISODateString;
  sourceService: string;
  sourceVersion?: string;
}

export interface InternalServiceAuth {
  serviceName: string;
  serviceToken: string;
}

export interface ServiceErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  retryable: boolean;
}

export interface ServiceResponseEnvelope<T> {
  success: boolean;
  requestId: string;
  service: string;
  version: string;
  data: T | null;
  error: ServiceErrorEnvelope | null;
  timestamp: ISODateString;
}

export interface WorldPosition {
  worldId: WorldId;
  regionId?: RegionId;
  x: number;
  y: number;
  z?: number;
}

export interface UserSession {
  accountId: AccountId;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODateString;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ValidateTokenRequest {
  accessToken: string;
}

export interface HeartbeatRequest {
  accountId: AccountId;
  accessToken: string;
}

export interface ClientSession {
  authenticated: boolean;
  session: UserSession | null;
}

export interface XpActionRecord {
  actionType: ActionTypeKey;
  target?: string | null;
  duration: number;
  count: number;
  completion: number;
  context: Record<string, unknown>;
  tools: string[];
  skillsSuspected?: SkillKey[];
}

export interface CharacterRecord {
  characterId: CharacterId;
  accountId: AccountId;
  name: string;
  race: CharacterRace;
  position: WorldPosition;
  stats: Record<string, number>;
  vitals: Record<string, number>;
  inventory: Record<ItemKey, number>;
  skills: Array<{ skill: SkillKey; level: number; xp: number }>;
  knowledge: { unlockedTopics: string[]; unlockedRecipes: RecipeKey[]; discoveredWorlds?: WorldId[]; lastSavedAt?: ISODateString };
  createdAt: ISODateString;
}

export interface RewardPackage {
  rewardPackageId: RewardPackageId;
  sourceType: RewardSourceType;
  sourceId: string;
  xp?: Record<SkillKey, number>;
  items?: Array<{ itemKey: ItemKey; amount: number }>;
  knowledgeUnlocks?: string[];
  recipeUnlocks?: RecipeKey[];
  accessUnlocks?: string[];
}

export interface QuestDefinition {
  questId: QuestId;
  title: string;
  summary: string;
  status: QuestStatus;
  objectives: Array<{ key: string; description: string; targetCount: number }>;
  rewardPackageId?: RewardPackageId;
}

export interface QuestState {
  characterId: CharacterId;
  questId: QuestId;
  status: QuestStatus;
  progress: Array<{ key: string; currentCount: number; targetCount: number; completed: boolean }>;
}

export interface CombatEncounter {
  encounterId: CombatEncounterId;
  startedAt: ISODateString;
  state: "ACTIVE" | "RESOLVED" | "ENDED";
  participants: Array<{ id: string; type: "CHARACTER" | "NPC"; name: string; hp: number; style: CombatStyle; statusEffects: Array<{ key: string; turnsRemaining: number; magnitude?: number }> }>;
  log: Array<{ at: ISODateString; actorId: string; action: string; result: string }>;
}

export interface NpcRecord {
  npcId: NpcId;
  name: string;
  role: { roleType: NpcRoleType; tags: string[] };
  regionId: RegionId;
  memories: Array<{ key: string; value: string; weight: number }>;
  relationships: Array<{ characterId: CharacterId; affinity: number; trust: number }>;
}

export interface ServiceStatusSnapshot {
  service: string;
  port: number;
  healthy: boolean;
  checkedAt: ISODateString;
  details?: unknown;
}
