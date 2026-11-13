// ─────────────────────────────────────────────────────────────────────────────
// Resource system — Wave 2 scaffold.
//
// Resources are the items that flow through stations. A unit of a resource is
// identified by its `ResourceId` (compact string key) and has:
//   - a carry weight (how many fit in a single survivor/hero carry slot)
//   - a sprite key for the tiny floating icon above a worker's head when
//     carrying, and for the ground pile at the destination
//   - a short label (used in debug/log only; never player-facing)
//
// Generic carry: hero and workers get a `carry: ResourceCarry[]` list. Legacy
// `carriedLogs`/`carriedMeat` stay for back-compat with the existing L1-L15
// loop and will be migrated to this system wave by wave.
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceId =
  | 'log'
  | 'fish_raw'
  | 'fish_clean'
  | 'meat_raw'
  | 'meat_ground'
  | 'plank'
  | 'cooked';

export interface ResourceSpec {
  id: ResourceId;
  label: string;
  spriteKey: string;       // texture key loaded in BootScene
  maxStack: number;        // units per carry slot
  weight: number;          // 1 slot = 1 unit for simple start; heavier = multi-slot
}

// Canonical table. SpriteKeys map to filenames in `assets/sprites/stations_v1/`
// — these must exist in the build bundle before a level uses them (preflight
// gatekeeps this via the locale completeness + future resource existence checks).
export const RESOURCES: Record<ResourceId, ResourceSpec> = {
  log:         { id: 'log',         label: 'Log',          spriteKey: 'resource_wood_logs_01',   maxStack: 4, weight: 1 },
  fish_raw:    { id: 'fish_raw',    label: 'Raw Fish',     spriteKey: 'resource_fish_raw_01',    maxStack: 6, weight: 1 },
  fish_clean:  { id: 'fish_clean',  label: 'Clean Fish',   spriteKey: 'resource_fish_raw_01',    maxStack: 6, weight: 1 },
  meat_raw:    { id: 'meat_raw',    label: 'Raw Meat',     spriteKey: 'resource_meat_chunk_01',  maxStack: 4, weight: 1 },
  meat_ground: { id: 'meat_ground', label: 'Ground Meat',  spriteKey: 'resource_meat_ground_01', maxStack: 6, weight: 1 },
  plank:       { id: 'plank',       label: 'Plank',        spriteKey: 'resource_plank_01',       maxStack: 3, weight: 1 },
  cooked:      { id: 'cooked',      label: 'Cooked Food',  spriteKey: 'resource_fish_raw_01',    maxStack: 4, weight: 1 },
};

export interface ResourceCarry {
  id: ResourceId;
  count: number;
}

export function totalCarried(c: ResourceCarry[]): number {
  let n = 0; for (const slot of c) n += slot.count; return n;
}

export function addToCarry(
  c: ResourceCarry[],
  id: ResourceId,
  n: number,
  capacity: number,
): number {
  // Returns the amount actually stored. Rest overflow is left to caller.
  let remaining = Math.min(n, Math.max(0, capacity - totalCarried(c)));
  if (remaining <= 0) return 0;
  const existing = c.find(s => s.id === id);
  if (existing) existing.count += remaining;
  else c.push({ id, count: remaining });
  return remaining;
}

export function takeFromCarry(c: ResourceCarry[], id: ResourceId, n: number): number {
  const slot = c.find(s => s.id === id);
  if (!slot) return 0;
  const taken = Math.min(slot.count, n);
  slot.count -= taken;
  if (slot.count <= 0) c.splice(c.indexOf(slot), 1);
  return taken;
}

// Station I/O lookup — which stations produce which resource. Used by the
// worker haul planner (Wave 3+) to find a destination for a just-produced item.
import type { StationKind } from './stations';

export const STATION_PRODUCES: Partial<Record<StationKind, ResourceId>> = {
  ice_hole:       'fish_raw',
  cleaning_table: 'fish_clean',
  cook_pot:       'cooked',
  lumber_mill:    'plank',
  butcher_table:  'meat_raw',
  meat_grinder:   'meat_ground',
};

export const STATION_CONSUMES: Partial<Record<StationKind, ResourceId>> = {
  cleaning_table: 'fish_raw',
  cook_pot:       'fish_clean',   // cook_pot can also accept meat_raw — handled at runtime
  lumber_mill:    'log',
  meat_grinder:   'meat_raw',
};
