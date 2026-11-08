export interface AnimalSpec {
  hp: number; speed: number; attackRange: number; attackIntervalMs: number;
  meatDrop: number; respawnDelaySec: number;
}
export interface AnimalSpawn {
  type: string; iso: [number,number];
  roamCenter: [number,number]; roamRadius?: number;
}
export interface GoalStage {
  type: 'rescueSurvivors' | 'buildStructure' | 'huntAnimals';
  target: number | string;
  hintText: string;
  completedText?: string;
}
export interface CookingConfig {
  cookTimeMs: number; meatToCoins: number;
}
export interface LevelConfig {
  name: string; tileW: number; tileH: number; originX: number; originY: number;
  player: { startIso:[number,number]; speedPx:number; carryCapacity:number; collectRangePx:number; dropRangePx:number; collectIntervalMs:number; };
  fire: { iso:[number,number]; fuelMax:number; fuelDrainPerSec:number; fuelPerLog:number; coinsPerLog:number; freezeRatePerSec:number; freezeMax:number; };
  trees: Array<{iso:[number,number]}>;
  treeLogCooldownMs: number;
  buildPads: Array<{id:string; iso:[number,number]; asset:string; costCoins:number; payRateCoinsPerSec:number; standRangePx:number;}>;
  frozenSurvivors: Array<{iso:[number,number]}>;
  survivorFollowRangePx:number; survivorThawRangePx:number; survivorThawTimeSec:number;
  workerChopIntervalMs:number; workerWalkSpeed:number;
  walls:[number,number][]; gate:[number,number][];
  goal: { survivorsToRescue:number };
  stages?: GoalStage[];
  hintDurationSec:number;
  decor?: Array<{key:string; iso:[number,number]}>;
  animals?: AnimalSpawn[];
  animalConfig?: Record<string,AnimalSpec>;
  cookingConfig?: CookingConfig;
}
