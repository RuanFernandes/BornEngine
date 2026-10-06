import { normalizeWorld2DStorage } from './storage';
import type { World2DMigrationResult } from './types';

/** Expands supported v1/v2 documents without mutating the caller's input. */
export function migrateWorld2D(input: unknown): World2DMigrationResult {
  return normalizeWorld2DStorage(input);
}
