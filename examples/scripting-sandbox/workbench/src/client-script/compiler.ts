import * as ts from 'typescript';

const MAX_SOURCE_BYTES = 64 * 1024;

export type ClientScriptCompileResult =
  | { readonly ok: true; readonly javascript: string }
  | { readonly ok: false; readonly diagnostics: readonly string[] };

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes++;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
             value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

function describe(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const start = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : null;
  return start === null
    ? `TypeScript error: ${message}`
    : `TypeScript error (${start.line + 1}:${start.character + 1}): ${message}`;
}

function usesModuleLoading(node: ts.Node): boolean {
  if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return true;
  if (ts.isExportDeclaration(node)) return true;
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(node.expression) && node.expression.text === 'require') return true;
  }
  return node.forEachChild(usesModuleLoading) === true;
}

/** Compiles one closed TypeScript guest module for the isolated QuickJS runtime. */
export function compileClientScript(source: string): ClientScriptCompileResult {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, diagnostics: ['Script source cannot be empty.'] };
  }
  if (utf8Length(source) > MAX_SOURCE_BYTES) {
    return { ok: false, diagnostics: ['Script source exceeds the 64 KiB limit.'] };
  }

  const sourceFile = ts.createSourceFile('client-script.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (usesModuleLoading(sourceFile)) {
    return { ok: false, diagnostics: ['Imports and module loading are disabled in shared client scripts.'] };
  }

  const defaultExport = sourceFile.statements.find((statement): statement is ts.ExportAssignment =>
    ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (defaultExport === undefined || !ts.isObjectLiteralExpression(defaultExport.expression)) {
    return { ok: false, diagnostics: ['Export one default behavior object, such as `export default { update(dt, ctx) {} }`.'] };
  }
  if (sourceFile.statements.some((statement) => ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      statement !== defaultExport)) {
    return { ok: false, diagnostics: ['Shared client scripts may export only their default behavior object.'] };
  }

  const result = ts.transpileModule(source, {
    fileName: 'client-script.ts',
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
      strict: true,
      isolatedModules: true,
    },
  });
  const diagnostics = (result.diagnostics || []).map(describe);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, javascript: result.outputText };
}
