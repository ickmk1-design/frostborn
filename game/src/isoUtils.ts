export const TILE_W = 80;
export const TILE_H = 40;

export function isoToScreen(
  ix: number,
  iy: number,
  ox: number,
  oy: number
): { x: number; y: number } {
  return {
    x: ox + (ix - iy) * TILE_W / 2,
    y: oy + (ix + iy) * TILE_H / 2,
  };
}

export function screenToIso(
  sx: number,
  sy: number,
  ox: number,
  oy: number
): { ix: number; iy: number } {
  const hw = TILE_W / 2; // 40
  const hh = TILE_H / 2; // 20
  return {
    ix: ((sx - ox) / hw + (sy - oy) / hh) / 2,
    iy: ((sy - oy) / hh - (sx - ox) / hw) / 2,
  };
}
