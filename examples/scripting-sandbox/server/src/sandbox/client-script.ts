import path from 'node:path';
import ts from 'typescript';

const MAX_SOURCE_BYTES = 64 * 1024;
const VIRTUAL_ROOT = path.resolve('/__bornengine_guest__');
const SCRIPT_FILE = path.join(VIRTUAL_ROOT, 'client-script.ts');
const API_FILE = path.join(VIRTUAL_ROOT, 'client-api.d.ts');

const CLIENT_API = `
interface BornEngineScriptContext {
  readonly self: {
    readonly id?: string;
    readonly position?: Readonly<{ x: number; y: number; z: number }>;
  };
  readonly particles?: { emitBurst(count: number, directionX?: number, directionY?: number): void };
  log?(message: string): void;
}
interface BornEngineScriptBehavior {
  onStart?(context: BornEngineScriptContext): void;
  update?(context: BornEngineScriptContext, deltaTime: number): void;
  onDestroy?(context: BornEngineScriptContext): void;
}
`;

export type ClientScriptCompileResult =
  | { readonly ok: true; readonly javascript: string }
  | { readonly ok: false; readonly diagnostics: readonly string[] };

function utf8Length(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function hasForbiddenModuleLoading(node: ts.Node): boolean {
  if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)) return true;
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(node.expression) && node.expression.text === 'require') return true;
  }
  return node.forEachChild((child) => hasForbiddenModuleLoading(child)) === true;
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `(${location.line + 1}:${location.character + 1}) ${message}`;
}

function typeDiagnostics(source: string): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const virtualFiles = new Map<string, string>([[SCRIPT_FILE, source], [API_FILE, CLIENT_API]]);
  const normalize = (fileName: string): string => path.resolve(fileName);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => virtualFiles.has(normalize(fileName)) || originalFileExists(fileName);
  host.readFile = (fileName) => virtualFiles.get(normalize(fileName)) ?? originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const contents = virtualFiles.get(normalize(fileName));
    if (contents !== undefined) return ts.createSourceFile(fileName, contents, languageVersion, true);
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([SCRIPT_FILE, API_FILE], options, host);
  return ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file !== undefined && normalize(diagnostic.file.fileName) === SCRIPT_FILE)
    .map(diagnosticMessage);
}

/** Validates a closed guest module and emits JavaScript for the QuickJS runtime. */
export function validateAndCompileClientScript(source: string): ClientScriptCompileResult {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, diagnostics: ['Script source cannot be empty.'] };
  }
  if (utf8Length(source) > MAX_SOURCE_BYTES) {
    return { ok: false, diagnostics: ['Script source exceeds the 64 KiB limit.'] };
  }

  const sourceFile = ts.createSourceFile(SCRIPT_FILE, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (hasForbiddenModuleLoading(sourceFile)) {
    return { ok: false, diagnostics: ['Imports and module loading are disabled in shared client scripts.'] };
  }

  const defaultExport = sourceFile.statements.find((statement): statement is ts.ExportAssignment =>
    ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (defaultExport === undefined || !ts.isObjectLiteralExpression(unwrapExpression(defaultExport.expression))) {
    return { ok: false, diagnostics: ['Export one default behavior object implementing BornEngineScriptBehavior.'] };
  }
  if (sourceFile.statements.some((statement) => ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      statement !== defaultExport)) {
    return { ok: false, diagnostics: ['Shared client scripts may export only their default behavior object.'] };
  }

  const diagnostics = typeDiagnostics(source);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const result = ts.transpileModule(source, {
    fileName: SCRIPT_FILE,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
      strict: true,
      isolatedModules: true,
    },
  });
  const transpileDiagnostics = (result.diagnostics || []).map(diagnosticMessage);
  if (transpileDiagnostics.length > 0) return { ok: false, diagnostics: transpileDiagnostics };
  return { ok: true, javascript: result.outputText };
}
