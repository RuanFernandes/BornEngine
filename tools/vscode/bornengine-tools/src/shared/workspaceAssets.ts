import path from 'node:path';
import type * as vscode from 'vscode';

function normalizedUriPath(value: string): string {
  const leadingSlash = value.startsWith('/') ? value : `/${value}`;
  const trimmed = leadingSlash.replace(/\/+$/, '');
  return trimmed || '/';
}

function isNormalizedProjectPath(value: string): boolean {
  if (!value || value !== value.trim() || value.startsWith('/') || value.includes('\\') || value.includes(':')) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isRelativeAssetReference(value: string): boolean {
  if (!value || value !== value.trim() || value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return value.split('/').every((segment) => segment.length > 0);
}

function containsUri(folderUri: vscode.Uri, documentUri: vscode.Uri): boolean {
  if (folderUri.scheme !== documentUri.scheme || folderUri.authority !== documentUri.authority) return false;

  let rootPath = normalizedUriPath(folderUri.path);
  let documentPath = normalizedUriPath(documentUri.path);
  if (folderUri.scheme === 'file' && process.platform === 'win32') {
    rootPath = rootPath.toLowerCase();
    documentPath = documentPath.toLowerCase();
  }

  return rootPath === '/'
    ? documentPath.startsWith('/')
    : documentPath === rootPath || documentPath.startsWith(`${rootPath}/`);
}

function owningWorkspaceFolder(
  documentUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): vscode.WorkspaceFolder | null {
  let owner: vscode.WorkspaceFolder | null = null;
  for (const folder of workspaceFolders) {
    if (!containsUri(folder.uri, documentUri)) continue;
    if (owner === null || folder.uri.path.length > owner.uri.path.length) owner = folder;
  }
  return owner;
}

export function workspaceFolderForDocument(
  documentUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): vscode.WorkspaceFolder | null {
  return owningWorkspaceFolder(documentUri, workspaceFolders);
}

export function resolveWorkspaceAsset(
  documentUri: vscode.Uri,
  projectRelativeAssetPath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): vscode.Uri | null {
  if (!isNormalizedProjectPath(projectRelativeAssetPath)) return null;

  const owner = owningWorkspaceFolder(documentUri, workspaceFolders);
  if (!owner) return null;

  const rootPath = normalizedUriPath(owner.uri.path);
  const targetPath = rootPath === '/'
    ? `/${projectRelativeAssetPath}`
    : `${rootPath}/${projectRelativeAssetPath}`;
  return owner.uri.with({ path: targetPath });
}

export function resolveDocumentRelativeWorkspaceAsset(
  documentUri: vscode.Uri,
  relativeAssetPath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): vscode.Uri | null {
  const owner = owningWorkspaceFolder(documentUri, workspaceFolders);
  if (!owner || !isRelativeAssetReference(relativeAssetPath)) return null;

  const targetPath = path.posix.normalize(path.posix.join(path.posix.dirname(documentUri.path), relativeAssetPath));
  const targetUri = owner.uri.with({ path: targetPath });
  if (targetPath === normalizedUriPath(owner.uri.path) || !containsUri(owner.uri, targetUri)) return null;
  return targetUri;
}

export function workspaceRelativeAssetPath(
  documentUri: vscode.Uri,
  assetUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): string | null {
  const owner = owningWorkspaceFolder(documentUri, workspaceFolders);
  if (!owner || assetUri.scheme !== owner.uri.scheme || assetUri.authority !== owner.uri.authority) return null;

  let rootPath = normalizedUriPath(owner.uri.path);
  let assetPath = normalizedUriPath(assetUri.path);
  if (owner.uri.scheme === 'file' && process.platform === 'win32') {
    rootPath = rootPath.toLowerCase();
    assetPath = assetPath.toLowerCase();
  }

  if (rootPath !== '/' && assetPath !== rootPath && !assetPath.startsWith(`${rootPath}/`)) return null;
  const relativePath = rootPath === '/' ? assetUri.path.slice(1) : assetUri.path.slice(owner.uri.path.replace(/\/+$/, '').length + 1);
  return isNormalizedProjectPath(relativePath) ? relativePath : null;
}
