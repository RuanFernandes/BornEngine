import ignore, { type Ignore } from 'ignore';
import * as path from 'node:path';
import type * as vscode from 'vscode';

/** Reads the root `.gitignore` of a workspace folder. A missing or unreadable file ignores nothing. */
export async function loadGitignore(folder: vscode.WorkspaceFolder, api: typeof vscode): Promise<Ignore> {
  const matcher = ignore();
  try {
    const bytes = await api.workspace.fs.readFile(api.Uri.joinPath(folder.uri, '.gitignore'));
    matcher.add(new TextDecoder().decode(bytes));
  } catch {
    // No root .gitignore: nothing to ignore.
  }
  return matcher;
}

/** Returns whether a file inside the folder matches the folder's `.gitignore` rules. */
export function isGitignored(matcher: Ignore, folder: vscode.WorkspaceFolder, uri: vscode.Uri): boolean {
  if (uri.scheme !== folder.uri.scheme || uri.authority !== folder.uri.authority) return false;
  const relative = path.posix.relative(folder.uri.path, uri.path);
  if (relative === '' || relative.startsWith('..') || path.posix.isAbsolute(relative)) return false;
  return matcher.ignores(relative);
}
