import {
  validateBlueprint,
  validateBlueprintTemplate,
  type BlueprintDiagnostic,
} from './blueprintSchema';

export type BlueprintReadResult = {
  sourceText: string;
  value: unknown | undefined;
  diagnostics: BlueprintDiagnostic[];
};

function parseSource(sourceText: string): { value: unknown | undefined; diagnostics: BlueprintDiagnostic[] } {
  try {
    return { value: JSON.parse(sourceText) as unknown, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    return {
      value: undefined,
      diagnostics: [{ path: '$', code: 'json.parse', message }],
    };
  }
}

/** Reads and validates a template while retaining the exact original source text. */
export function readBlueprintTemplate(sourceText: string): BlueprintReadResult {
  const parsed = parseSource(sourceText);
  return {
    sourceText,
    value: parsed.value,
    diagnostics: parsed.value === undefined ? parsed.diagnostics : validateBlueprintTemplate(parsed.value),
  };
}

/** Reads and validates a blueprint without rewriting malformed or newer source. */
export function readBlueprint(sourceText: string, template: unknown): BlueprintReadResult {
  const parsed = parseSource(sourceText);
  return {
    sourceText,
    value: parsed.value,
    diagnostics: parsed.value === undefined ? parsed.diagnostics : validateBlueprint(parsed.value, template),
  };
}
