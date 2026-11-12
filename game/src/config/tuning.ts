// Central tuning knobs — edit here, never in per-level JSON.

/** Player walk speed multiplier applied on top of cfg.player.speedPx. */
export const PLAYER_SPEED_MULT = 1.35;

/** Worker walk/follow speed multiplier applied on top of cfg.workerWalkSpeed. */
export const WORKER_SPEED_MULT = 1.20;

/** Original animation design speed (px/s). Walk anim timeScale is normalised to this. */
export const BASE_WALK_SPEED = 130;

/** Time constant (ms) to ramp from 0 to full speed on input start. */
export const PLAYER_ACCEL_MS = 80;

/** Time constant (ms) to brake to 0 when input is released. */
export const PLAYER_DECEL_MS = 40;
