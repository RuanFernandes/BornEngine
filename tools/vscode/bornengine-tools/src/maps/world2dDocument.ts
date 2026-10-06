import {
  formatWorld2DDiagnostics,
  migrateWorld2D,
  validateWorld2D,
} from '@bornengine/engine/world2d/editor';
import type { World2DDiagnostic, World2DDocument } from '@bornengine/engine/world2d/editor';

export interface ParsedWorld2D {
  document: World2DDocument | null;
  diagnostics: World2DDiagnostic[];
  formattedDiagnostics: string;
  editable: boolean;
}

export function parseWorld2DText(_text: string): ParsedWorld2D {
  let input: unknown;
  try {
    input = JSON.parse(_text) as unknown;
  } catch (_error) {
    const diagnostics: World2DDiagnostic[] = [
      { path: '', code: 'invalid_json', message: 'World2D source is not valid JSON.' },
    ];
    return { document: null, diagnostics, formattedDiagnostics: formatWorld2DDiagnostics(diagnostics), editable: false };
  }

  const validation = validateWorld2D(input);
  const migration = migrateWorld2D(input);
  const diagnostics = validation.ok
    ? migration.diagnostics
    : validation.diagnostics;
  const document: World2DDocument | null = validation.ok && migration.ok ? migration.document : null;
  return {
    document,
    diagnostics,
    formattedDiagnostics: formatWorld2DDiagnostics(diagnostics),
    editable: document !== null,
  };
}
