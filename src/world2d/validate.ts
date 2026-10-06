import { normalizeWorld2DStorage } from './storage';
import { formatWorld2DDiagnostics } from './validateNormalized';
import type { World2DDiagnostic, World2DValidationResult } from './types';

export { formatWorld2DDiagnostics };

/** Validates either a legacy expanded document or a compact v2 storage document. */
export function validateWorld2D(input: unknown): World2DValidationResult {
  const result = normalizeWorld2DStorage(input);
  return { ok: result.ok, diagnostics: result.diagnostics };
}

export type { World2DDiagnostic, World2DValidationResult };
