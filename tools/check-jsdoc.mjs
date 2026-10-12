import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = join(REPO_ROOT, 'src');

function collectSources(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectSources(path, files);
    else if (path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.endsWith('internal.ts')) files.push(path);
  }
  return files;
}

function leadingText(node, sourceFile) {
  return node.getFullText(sourceFile).slice(0, node.getStart(sourceFile) - node.getFullStart());
}

function hasDoc(node, sourceFile) {
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(leadingText(node, sourceFile));
}

function isInternal(node, sourceFile) {
  return /@internal/.test(leadingText(node, sourceFile));
}

function hasModifier(node, kind) {
  return node.modifiers !== undefined && node.modifiers.some((modifier) => modifier.kind === kind);
}

function isPublicMember(member, sourceFile) {
  if (isInternal(member, sourceFile)) return false;
  if (hasModifier(member, ts.SyntaxKind.PrivateKeyword) || hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) {
    return false;
  }
  if (hasModifier(member, ts.SyntaxKind.DeclareKeyword)) return false;
  if (ts.isConstructorDeclaration(member)) return true;
  if (!member.name) return false;
  return !member.name.getText(sourceFile).startsWith('_');
}

function memberName(member, sourceFile) {
  return ts.isConstructorDeclaration(member) ? 'constructor' : member.name.getText(sourceFile);
}

function undocumentedIn(sourceFile) {
  const missing = [];
  const check = (node, name) => {
    if (!hasDoc(node, sourceFile)) missing.push(name);
  };
  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword) || isInternal(statement, sourceFile)) continue;
    if (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
      if (!statement.name) continue;
      check(statement, statement.name.getText(sourceFile));
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      check(statement, statement.name.getText(sourceFile));
    } else {
      continue;
    }
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!isPublicMember(member, sourceFile)) continue;
      if (ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member) ||
          ts.isConstructorDeclaration(member) || ts.isPropertyDeclaration(member)) {
        check(member, `${statement.name.getText(sourceFile)}.${memberName(member, sourceFile)}`);
      }
    }
  }
  return missing;
}

const failures = [];
let checked = 0;
for (const file of collectSources(SOURCE_ROOT)) {
  const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const missing = undocumentedIn(sourceFile);
  checked++;
  for (const name of missing) failures.push(`${relative(REPO_ROOT, file)}: ${name}`);
}

if (failures.length > 0) {
  console.error(`Missing JSDoc on ${failures.length} public declaration(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`PASS: JSDoc present on public declarations in ${checked} source files`);
