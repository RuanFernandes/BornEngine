import path from 'node:path';
import type * as vscode from 'vscode';
import { validateSpriteSheetCharacterMetadata } from '../animations/spriteAnimationSchema';
import {
  resolveDocumentRelativeWorkspaceAsset,
  resolveWorkspaceAsset,
  workspaceFolderForDocument,
} from '../shared/workspaceAssets';

const EXCLUDED_DIRECTORIES = '**/{.git,node_modules,dist,build,out}/**';
const IMAGE_GLOB = '**/*.{png,jpg,jpeg,gif,webp,bmp,tif,tiff,PNG,JPG,JPEG,GIF,WEBP,BMP,TIF,TIFF}';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);

export type BornEngineWorkspaceAsset =
  | { kind: 'map'; uri: vscode.Uri; name: string }
  | { kind: 'animation'; uri: vscode.Uri; name: string }
  | {
      kind: 'spriteMetadata';
      uri: vscode.Uri;
      name: string;
      imageUri: vscode.Uri;
      companionUri?: vscode.Uri;
    }
  | { kind: 'image'; uri: vscode.Uri; name: string };

function isMap(uri: vscode.Uri): boolean {
  return uri.path.endsWith('.world2d.json');
}

function isAnimation(uri: vscode.Uri): boolean {
  return uri.path.endsWith('.spriteanim.json');
}

function isRasterImage(uri: vscode.Uri): boolean {
  return IMAGE_EXTENSIONS.has(path.posix.extname(uri.path).toLowerCase());
}

function displayName(uri: vscode.Uri, suffix: string): string {
  return path.posix.basename(uri.path, suffix);
}

async function readJson(api: typeof vscode, uri: vscode.Uri): Promise<unknown | null> {
  try {
    const contents = await api.workspace.fs.readFile(uri);
    return JSON.parse(new TextDecoder().decode(contents)) as unknown;
  } catch {
    return null;
  }
}

/** Finds BornEngine authoring assets that belong to a single workspace folder. */
export async function discoverBornEngineAssets(
  folder: vscode.WorkspaceFolder,
  api: typeof vscode,
  workspaceFolders: readonly vscode.WorkspaceFolder[] = [folder],
): Promise<BornEngineWorkspaceAsset[]> {
  const roots = workspaceFolders.includes(folder) ? workspaceFolders : [...workspaceFolders, folder];
  const belongsToFolder = (uri: vscode.Uri): boolean => workspaceFolderForDocument(uri, roots) === folder;
  const findFiles = async (pattern: string): Promise<vscode.Uri[]> => api.workspace.findFiles(
    new api.RelativePattern(folder, pattern),
    EXCLUDED_DIRECTORIES,
  );

  const [foundMapUris, foundAnimationUris, foundJsonUris, foundImageUris] = await Promise.all([
    findFiles('**/*.world2d.json'),
    findFiles('**/*.spriteanim.json'),
    findFiles('**/*.json'),
    findFiles(IMAGE_GLOB),
  ]);
  const mapUris = foundMapUris.filter(belongsToFolder);
  const animationUris = foundAnimationUris.filter(belongsToFolder);
  const jsonUris = foundJsonUris.filter(belongsToFolder);
  const imageUris = foundImageUris.filter(belongsToFolder);

  const assets: BornEngineWorkspaceAsset[] = [];
  for (const uri of mapUris) {
    assets.push({ kind: 'map', uri, name: displayName(uri, '.world2d.json') });
  }
  for (const uri of animationUris) {
    assets.push({ kind: 'animation', uri, name: displayName(uri, '.spriteanim.json') });
  }

  const animationSources = new Map<string, vscode.Uri>();
  for (const uri of animationUris) {
    const document = await readJson(api, uri);
    if (typeof document !== 'object' || document === null || Array.isArray(document)) continue;
    const source = (document as { source?: unknown }).source;
    if (typeof source !== 'string') continue;
    const sourceUri = resolveWorkspaceAsset(folder.uri, source, roots);
    if (sourceUri && belongsToFolder(sourceUri)) animationSources.set(sourceUri.toString(), uri);
  }

  const referencedImages: vscode.Uri[] = [];
  for (const uri of jsonUris) {
    if (isMap(uri) || isAnimation(uri)) continue;
    const document = await readJson(api, uri);
    if (document === null) continue;

    const validation = validateSpriteSheetCharacterMetadata(document);
    if (!validation.ok) continue;
    const imageUri = resolveDocumentRelativeWorkspaceAsset(
      uri,
      validation.value.spritesheet.path,
      roots,
    );
    if (!imageUri || !belongsToFolder(imageUri)) continue;

    try {
      await api.workspace.fs.stat(imageUri);
    } catch {
      continue;
    }

    referencedImages.push(imageUri);
    assets.push({
      kind: 'spriteMetadata',
      uri,
      name: displayName(uri, '.json'),
      imageUri,
      companionUri: animationSources.get(uri.toString()),
    });
  }

  const uniqueImages = new Map<string, vscode.Uri>();
  for (const uri of [...imageUris, ...referencedImages]) {
    if (isRasterImage(uri)) uniqueImages.set(uri.toString(), uri);
  }
  for (const uri of uniqueImages.values()) {
    assets.push({ kind: 'image', uri, name: displayName(uri, path.posix.extname(uri.path)) });
  }

  return assets.sort((left, right) => left.uri.path.localeCompare(right.uri.path));
}
