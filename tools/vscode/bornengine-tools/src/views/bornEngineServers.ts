import path from 'node:path';
import type * as vscode from 'vscode';
import { workspaceFolderForDocument } from '../shared/workspaceAssets';

const SERVER_MARKER_FILE = 'bornengine.server.json';
const EXCLUDED_DIRECTORIES = '**/{.git,node_modules,dist,build,out}/**';

export type BornEngineServerDestination = {
  markerUri: vscode.Uri;
  serverUri: vscode.Uri;
  name: string;
  relativePath: string;
};

function normalizeUriPath(value: string): string {
  const normalized = path.posix.normalize(value || '/');
  if (normalized === '/') return '/';
  return normalized.replace(/\/+$/, '');
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const relative = path.posix.relative(rootPath, candidatePath);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.posix.sep}`)
    && !path.posix.isAbsolute(relative);
}

function sameProjectPath(left: vscode.Uri, right: vscode.Uri): boolean {
  if (left.scheme !== right.scheme || left.authority !== right.authority) return false;
  let leftPath = normalizeUriPath(left.path);
  let rightPath = normalizeUriPath(right.path);
  if (left.scheme === 'file' && process.platform === 'win32') {
    leftPath = leftPath.toLowerCase();
    rightPath = rightPath.toLowerCase();
  }
  return leftPath === rightPath;
}

function isSafeClientRootReference(value: unknown): value is string {
  if (typeof value !== 'string'
      || value.length === 0
      || value !== value.trim()
      || value.startsWith('/')
      || value.includes('\\')
      || value.includes(':')
      || path.posix.normalize(value) !== value) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  const segments = value.split('/');
  return segments.length > 0 && segments.every((segment) => segment === '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveMarker(
  marker: unknown,
  markerUri: vscode.Uri,
  projectUri: vscode.Uri,
): BornEngineServerDestination | null {
  if (!isRecord(marker)
      || marker.format !== 'bornengine.server'
      || marker.version !== 1
      || marker.provider !== 'colyseus'
      || !isSafeClientRootReference(marker.clientProjectRoot)
      || path.posix.basename(markerUri.path) !== SERVER_MARKER_FILE) {
    return null;
  }

  if (markerUri.scheme !== projectUri.scheme || markerUri.authority !== projectUri.authority) return null;
  const projectPath = normalizeUriPath(projectUri.path);
  const serverPath = normalizeUriPath(path.posix.dirname(markerUri.path));
  if (!isPathWithin(projectPath, serverPath)) return null;

  const resolvedClientRoot = path.posix.resolve(serverPath, marker.clientProjectRoot);
  const expectedRelativeClientRoot = path.posix.relative(serverPath, projectPath);
  if (!sameProjectPath(projectUri, projectUri.with({ path: resolvedClientRoot }) as vscode.Uri)
      || marker.clientProjectRoot !== expectedRelativeClientRoot) {
    return null;
  }

  const relativePath = path.posix.relative(projectPath, serverPath);
  return {
    markerUri,
    serverUri: markerUri.with({ path: serverPath }),
    name: path.posix.basename(serverPath),
    relativePath,
  };
}

async function isFreeOfSymbolicLinks(
  projectUri: vscode.Uri,
  markerUri: vscode.Uri,
  api: typeof vscode,
): Promise<boolean> {
  const serverPath = path.posix.dirname(markerUri.path);
  const relative = path.posix.relative(normalizeUriPath(projectUri.path), serverPath);
  let currentPath = normalizeUriPath(projectUri.path);
  const pathsToCheck = relative.split('/').filter(Boolean).map((part) => {
    currentPath = path.posix.join(currentPath, part);
    return currentPath;
  });
  pathsToCheck.push(markerUri.path);

  for (const candidatePath of pathsToCheck) {
    try {
      const stat = await api.workspace.fs.stat(markerUri.with({ path: candidatePath }));
      if ((stat.type & api.FileType.SymbolicLink) !== 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Finds versioned server markers that point back to this BornEngine workspace folder. */
export async function discoverBornEngineServers(
  folder: vscode.WorkspaceFolder,
  api: typeof vscode,
  workspaceFolders: readonly vscode.WorkspaceFolder[] = [folder],
): Promise<BornEngineServerDestination[]> {
  const roots = workspaceFolders.includes(folder) ? workspaceFolders : [...workspaceFolders, folder];
  const markerUris = await api.workspace.findFiles(
    new api.RelativePattern(folder, `**/${SERVER_MARKER_FILE}`),
    EXCLUDED_DIRECTORIES,
  );
  const seen = new Set<string>();
  const destinations: BornEngineServerDestination[] = [];

  for (const markerUri of markerUris) {
    if (workspaceFolderForDocument(markerUri, roots) !== folder) continue;
    if (!(await isFreeOfSymbolicLinks(folder.uri, markerUri, api))) continue;

    let marker: unknown;
    try {
      const bytes = await api.workspace.fs.readFile(markerUri);
      marker = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      continue;
    }

    const destination = resolveMarker(marker, markerUri, folder.uri);
    if (!destination) continue;
    const identity = destination.serverUri.toString();
    if (seen.has(identity)) continue;
    seen.add(identity);
    destinations.push(destination);
  }

  return destinations.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

/** Selects one server when the project has multiple valid server markers. */
export async function pickBornEngineServer(
  api: typeof vscode,
  servers: readonly BornEngineServerDestination[],
): Promise<BornEngineServerDestination | undefined> {
  if (servers.length === 0) return undefined;
  if (servers.length === 1) return servers[0];

  const choices = servers.map((server) => ({
    label: server.name,
    description: server.relativePath,
    server,
  }));
  const selected = await api.window.showQuickPick(choices, {
    placeHolder: 'Choose which BornEngine server to use',
  });
  return selected?.server;
}
