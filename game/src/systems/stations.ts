// ─────────────────────────────────────────────────────────────────────────────
// Stations module — Wave 1 scaffold.
//
// A Station is any worker-manned production spot in a level. Workers pick the
// highest-priority unmanned station and walk to it. When "manned", the station
// consumes inputs and produces outputs on a cycle.
//
// Legacy trees stay on their own path for now — they will be ported over in
// Wave 2 once the resource system lands. Levels with NO cfg.stations[] run the
// old tree/log loop unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export type StationKind =
  | 'fire'            // the campfire — always priority 0 (top)
  | 'ice_hole'        // fishing
  | 'cleaning_table'  // raw fish → clean fish
  | 'cook_pot'        // clean fish | raw meat → cooked food
  | 'lumber_mill'     // logs → planks
  | 'butcher_table'   // carcass → raw meat
  | 'meat_grinder'    // raw meat → ground meat
  | 'supply_sled'     // ground meat + planks → coins
  | 'watchtower';     // lookout fires arrows + applies slow

// Priority classes — lower number = higher priority. Matches
// "fire > food > production > export" from the approved design doc.
export const STATION_PRIORITY: Record<StationKind, number> = {
  fire:            0,  // feeding the fire is always top priority
  cook_pot:        1,  // food
  cleaning_table:  1,  // food
  butcher_table:   2,  // production
  meat_grinder:    2,  // production
  lumber_mill:     2,  // production
  ice_hole:        2,  // production (gathering)
  watchtower:      2,  // production (defence)
  supply_sled:     3,  // export (payout)
};

// Config entry read straight from level JSON (`cfg.stations[]`).
export interface StationConfig {
  id: string;                       // unique within a level
  kind: StationKind;
  iso: [number, number];            // tile coords
  cycleMs?: number;                 // ms per production cycle (default per-kind)
  input?: string;                   // resource id required (null = gathering)
  output?: string;                  // resource id produced
  priorityBump?: number;            // -1 (bump up) via player tap; reset each level
}

// Runtime station instance — created in create(), updated each tick.
export interface StationInstance {
  cfg: StationConfig;
  sx: number;                       // screen x
  sy: number;                       // screen y
  sprite: unknown;                  // Phaser.GameObjects.Image | null — avoid Phaser import in this module
  outputPile: unknown;              // small text showing buffered count, or null
  pileText: unknown;                // Phaser.GameObjects.Text showing N
  workerId: number;                 // survivor index (-1 = unmanned)
  cycleMs: number;                  // ms remaining in current cycle; 0 = idle (worker needed to start)
  priorityBump: number;             // user-adjustable; lower = higher priority
  outputCount: number;              // resource units sitting at the station waiting to be hauled
  inputCount: number;               // resource units in local hopper (for consumer stations)
}

export const DEFAULT_CYCLE_MS: Record<StationKind, number> = {
  fire:            0,
  ice_hole:        6000,
  cleaning_table:  3500,
  cook_pot:        3500,
  lumber_mill:     5000,
  butcher_table:   4000,
  meat_grinder:    4500,
  supply_sled:     10000,
  watchtower:      1200,
};

export function effectivePriority(s: StationInstance): number {
  return STATION_PRIORITY[s.cfg.kind] + s.priorityBump;
}

export function pickStationForWorker(
  stations: StationInstance[],
  workerLx: number,
  workerLy: number,
): StationInstance | null {
  const unmanned = stations.filter(s => s.workerId < 0 && s.cfg.kind !== 'fire');
  if (unmanned.length === 0) return null;

  // Sort by (priority asc, distance asc). Workers go to the highest-priority
  // unmanned station; ties break by proximity.
  unmanned.sort((a, b) => {
    const pa = effectivePriority(a); const pb = effectivePriority(b);
    if (pa !== pb) return pa - pb;
    const da2 = (a.sx - workerLx) ** 2 + (a.sy - workerLy) ** 2;
    const db2 = (b.sx - workerLx) ** 2 + (b.sy - workerLy) ** 2;
    return da2 - db2;
  });
  return unmanned[0];
}

// Resources hauled by workers: which station kind (or 'fire') consumes it?
// Returned value is a StationKind OR the sentinel 'fire' meaning "drop at fire".
import type { ResourceId } from './resources';
export const HAUL_DESTINATION: Record<ResourceId, StationKind | 'fire'> = {
  log:         'fire',            // L1-L15 legacy — logs go to the campfire
  fish_raw:    'cleaning_table',  // L5+ — otherwise falls back to 'fire' when no cleaning exists
  fish_clean:  'cook_pot',
  cooked:      'fire',            // cooked food goes to the fire for consumption
  meat_raw:    'meat_grinder',
  meat_ground: 'supply_sled',
  plank:       'fire',            // planks pile at the fire (temp) until cabins are built
};

// Legacy-safe: a level with no stations[] key returns [] and the old loop runs.
export function readStationsFromCfg(cfg: unknown): StationConfig[] {
  const raw = (cfg as { stations?: unknown }).stations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is StationConfig =>
    !!r && typeof (r as StationConfig).id === 'string'
        && typeof (r as StationConfig).kind === 'string'
        && Array.isArray((r as StationConfig).iso),
  );
}
