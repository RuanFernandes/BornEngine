import { getTypeScriptWorker } from 'monaco-editor/languages/features/typescript/register';
import type { Diagnostic } from 'monaco-editor/languages/features/typescript/register';
import type * as monaco from 'monaco-editor/editor/editor.api';
import { waitForTypeScriptWorker } from './worker-readiness.js';

const MAX_SOURCE_BYTES = 64 * 1024;

export type MonacoCompileResult =
  | { readonly ok: true; readonly javascript: string }
  | { readonly ok: false; readonly diagnostics: readonly string[] };

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function diagnosticText(diagnostic: Diagnostic): string {
  const start = diagnostic.start === undefined ? null : diagnostic.start;
  const messageParts: string[] = [];
  let message = diagnostic.messageText;
  while (typeof message === 'object') {
    messageParts.push(message.messageText);
    message = message.next?.[0]?.messageText || '';
  }
  messageParts.push(message);
  const location = start === null ? '' : ` (${start})`;
  return `TypeScript error${location}: ${messageParts.filter(Boolean).join('\n')}`;
}

function policyDiagnostic(source: string): string | null {
  if (!/\bexport\s+default\b/.test(source)) return 'Export one default BornEngineScriptBehavior object.';
  if (/^\s*import\b/m.test(source) || /\bimport\s*\(/.test(source) ||
      /^\s*export\s+(?!default\b)/m.test(source) || /\brequire\s*\(/.test(source)) {
    return 'Imports and module loading are disabled in shared client scripts.';
  }
  return null;
}

/** Type-checks and emits the open Monaco model using its existing TypeScript worker. */
export async function compileMonacoModel(model: monaco.editor.ITextModel): Promise<MonacoCompileResult> {
  const source = model.getValue();
  if (utf8Length(source) > MAX_SOURCE_BYTES) {
    return { ok: false, diagnostics: ['Script source exceeds the 64 KiB limit.'] };
  }
  const policyError = policyDiagnostic(source);
  if (policyError !== null) return { ok: false, diagnostics: [policyError] };

  const workerFactory = await waitForTypeScriptWorker(getTypeScriptWorker);
  const worker = await workerFactory(model.uri);
  const fileName = model.uri.toString();
  const [syntactic, semantic] = await Promise.all([
    worker.getSyntacticDiagnostics(fileName),
    worker.getSemanticDiagnostics(fileName),
  ]);
  const diagnostics = [...syntactic, ...semantic].filter((item) => item.category === 1)
    .map(diagnosticText);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const output = await worker.getEmitOutput(fileName);
  if (output.emitSkipped) {
    return { ok: false, diagnostics: output.diagnostics?.map(diagnosticText) ?? ['TypeScript could not emit this script.'] };
  }
  const javascript = output.outputFiles.find((file) => file.name.endsWith('.js'))?.text;
  if (javascript === undefined || javascript.length === 0) {
    return { ok: false, diagnostics: ['TypeScript emitted no JavaScript for the behavior module.'] };
  }
  return { ok: true, javascript };
}
