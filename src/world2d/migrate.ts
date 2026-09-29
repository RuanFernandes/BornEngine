import { validateWorld2D } from './validate';
import type { World2DDocument, World2DMigrationResult } from './types';

/** Version 1 is current and therefore migrates by identity. Other versions fail validation. */
export function migrateWorld2D(input: unknown): World2DMigrationResult {
  const result = validateWorld2D(input);
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics, document: null };
  return {
    ok: true,
    diagnostics: [],
    document: input as World2DDocument,
  };
}
