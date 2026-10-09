// Guards the `"sideEffects": false` contract in package.json: engine modules must not
// run observable code at top level, or Perry's re-export pruning silently drops it.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Reviewed top-level effects that only touch state owned by their own module.
// `match` is a prefix of the flagged construct's source text.
const ALLOWLIST = [
  { file: 'gui/profile.ts', kind: 'static-init', match: 'private static profiles = new Map', reason: 'module-owned registry storage' },
  { file: 'gui/profile.ts', kind: 'statement', match: 'GUIProfiles.register(', reason: 'default profiles written into the module-owned registry' },
  { file: 'core/context.ts', kind: 'var-init', match: 'gameContexts = new WeakMap', reason: 'module-owned state' },
  { file: 'gui/types.ts', kind: 'var-init', match: 'processGUIIds = new GUIIdAllocator', reason: 'module-owned state; constructor only assigns fields' },
  { file: 'world2d/tileCodes.ts', kind: 'var-init', match: 'MAX_TOTAL_TILES = Math.floor(', reason: 'pure arithmetic' },
  { file: 'world2d/tileGridBits.ts', kind: 'var-init', match: 'MAX_WORLD2D_TILE_COMPRESSED_BYTES = ', reason: 'pure arithmetic' },
];

const PURE_KEYWORDS = new Set([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.UndefinedKeyword,
]);

function isPure(node) {
  if (!node) return true;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return isPure(node.expression);
  }
  if (ts.isLiteralExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || PURE_KEYWORDS.has(node.kind)) return true;
  if (ts.isIdentifier(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) return isPure(node.operand);
  if (ts.isBinaryExpression(node)) {
    return node.operatorToken.kind !== ts.SyntaxKind.EqualsToken && isPure(node.left) && isPure(node.right);
  }
  if (ts.isConditionalExpression(node)) return isPure(node.condition) && isPure(node.whenTrue) && isPure(node.whenFalse);
  if (ts.isTemplateExpression(node)) return node.templateSpans.every((span) => isPure(span.expression));
  if (ts.isPropertyAccessExpression(node)) return isPure(node.expression);
  if (ts.isElementAccessExpression(node)) return isPure(node.expression) && isPure(node.argumentExpression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isPure);
  if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return isPure(node.expression);
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((property) => {
      if (ts.isPropertyAssignment(property)) {
        const computed = ts.isComputedPropertyName(property.name) ? property.name.expression : undefined;
        return isPure(computed) && isPure(property.initializer);
      }
      if (ts.isSpreadAssignment(property)) return isPure(property.expression);
      return (
        ts.isShorthandPropertyAssignment(property) ||
        ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property)
      );
    });
  }
  return false;
}

function classFindings(declaration) {
  const findings = [];
  for (const member of declaration.members) {
    if (ts.isClassStaticBlockDeclaration(member)) {
      findings.push(['static-block', member]);
      continue;
    }
    const isStatic = ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
    if (isStatic && ts.isPropertyDeclaration(member) && !isPure(member.initializer)) findings.push(['static-init', member]);
  }
  for (const clause of declaration.heritageClauses ?? []) {
    for (const type of clause.types) if (!isPure(type.expression)) findings.push(['extends-expr', type]);
  }
  if (ts.getDecorators(declaration)?.length) findings.push(['decorator', declaration]);
  return findings;
}

function topLevelFindings(sourceFile) {
  const findings = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.importClause) findings.push(['bare-import', statement]);
    } else if (ts.isClassDeclaration(statement)) {
      findings.push(...classFindings(statement));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!isPure(declaration.initializer)) findings.push(['var-init', declaration]);
      }
    } else if (ts.isExportAssignment(statement)) {
      if (!isPure(statement.expression)) findings.push(['export-default-expr', statement]);
    } else if (
      !ts.isExportDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isFunctionDeclaration(statement) &&
      !ts.isModuleDeclaration(statement) &&
      !ts.isImportEqualsDeclaration(statement) &&
      !ts.isEnumDeclaration(statement) &&
      !ts.isEmptyStatement(statement)
    ) {
      findings.push(['statement', statement]);
    }
  }
  return findings;
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(path);
  }
  return files.sort();
}

export function checkSideEffects(root, allowlist = ALLOWLIST) {
  const violations = [];
  for (const path of sourceFiles(root)) {
    const file = relative(root, path).split(sep).join('/');
    const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const [kind, node] of topLevelFindings(sourceFile)) {
      const text = node.getText(sourceFile);
      const allowed = allowlist.some((entry) => entry.file === file && entry.kind === kind && text.startsWith(entry.match));
      if (allowed) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file, line: line + 1, kind, text: text.split('\n')[0].slice(0, 120) });
    }
  }
  return violations;
}

function main(args) {
  const rootIndex = args.indexOf('--root');
  const root = rootIndex === -1 ? join(repoRoot, 'src') : resolve(args[rootIndex + 1]);
  const violations = checkSideEffects(root);
  if (violations.length === 0) return 0;
  for (const { file, line, kind, text } of violations) console.error(`${file}:${line}\t${kind}\t${text}`);
  console.error(
    `\n${violations.length} top-level side effect(s) found. package.json declares "sideEffects": false, so Perry may prune these modules.\n` +
      'Move the code into a function, constructor or lazy initializer, or add a reviewed entry to ALLOWLIST in tools/check-side-effects.mjs.',
  );
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
