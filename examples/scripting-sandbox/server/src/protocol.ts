export const ROOM_WIDTH = 960;
export const ROOM_HEIGHT = 540;
export const PLAYER_RADIUS = 20;
export const PLAYER_SPEED = 220;
export const SIMULATION_STEP_SECONDS = 1 / 30;
export const INPUT_MIN_INTERVAL_MS = 30;
export const MAX_INPUT_SEQUENCE = 2_147_483_647;

export interface ValidatedMoveInput {
  readonly sequence: number;
  readonly x: number;
  readonly y: number;
}

export type MoveInputResult =
  | { readonly ok: true; readonly input: ValidatedMoveInput }
  | { readonly ok: false; readonly reason: 'malformed' | 'stale' | 'out-of-range' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeMoveInput(payload: unknown, previousSequence: number): MoveInputResult {
  if (!isRecord(payload) || Object.keys(payload).length !== 3 ||
      !Object.hasOwn(payload, 'sequence') || !Object.hasOwn(payload, 'x') || !Object.hasOwn(payload, 'y')) {
    return { ok: false, reason: 'malformed' };
  }
  const { sequence, x, y } = payload;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > MAX_INPUT_SEQUENCE ||
      typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    return { ok: false, reason: 'malformed' };
  }
  if (sequence <= previousSequence) return { ok: false, reason: 'stale' };
  if (x < -1 || x > 1 || y < -1 || y > 1) return { ok: false, reason: 'out-of-range' };
  const magnitude = Math.hypot(x, y);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  return { ok: true, input: { sequence, x: x * scale, y: y * scale } };
}

export function clampPlayerPosition(x: number, y: number): { readonly x: number; readonly y: number } {
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(ROOM_WIDTH - PLAYER_RADIUS, x)),
    y: Math.max(PLAYER_RADIUS, Math.min(ROOM_HEIGHT - PLAYER_RADIUS, y)),
  };
}
