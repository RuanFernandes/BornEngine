export const ARENA_WIDTH = 640;
export const ARENA_HEIGHT = 480;
export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 180;
export const SIMULATION_STEP_SECONDS = 1 / 20;

export interface MovementInput {
  x: number;
  y: number;
  sequence: number;
}

export type MovementInputResult =
  | { ok: true; input: MovementInput }
  | { ok: false; reason: "invalid-input" | "invalid-sequence" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate client intent and cap its vector length without accepting positions. */
export function normalizeMoveInput(payload: unknown, lastSequence: number): MovementInputResult {
  if (!isRecord(payload) || typeof payload.x !== "number" || typeof payload.y !== "number" ||
      !Number.isFinite(payload.x) || !Number.isFinite(payload.y) ||
      typeof payload.sequence !== "number" || !Number.isSafeInteger(payload.sequence)) {
    return { ok: false, reason: "invalid-input" };
  }
  if (payload.sequence <= lastSequence) return { ok: false, reason: "invalid-sequence" };

  let x = Math.max(-1, Math.min(1, payload.x));
  let y = Math.max(-1, Math.min(1, payload.y));
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
  }
  return { ok: true, input: { x, y, sequence: payload.sequence } };
}

export function clampPlayerPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, x)),
    y: Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, y)),
  };
}
