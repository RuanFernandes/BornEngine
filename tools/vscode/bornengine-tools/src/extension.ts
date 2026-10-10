import type * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { serializeWorld2D } from '@bornengine/engine/world2d/editor';
import {
  BlueprintTemplateEditorProvider,
  createBlueprintTemplate,
} from './blueprints/blueprintTemplateEditorProvider';
import { BlueprintTextEditorProvider } from './blueprints/blueprintEditorProvider';
import { createBlueprint } from './blueprints/blueprintWorkspace';
import {
  createSpriteAnimationCompanion,
  SPRITE_ANIMATION_EDITOR_VIEW_TYPE,
  type SpriteAnimationCreationOptions,
  SpriteAnimationTextEditorProvider,
} from './animations/spriteAnimationEditorProvider';
import {
  createSpriteAnimationTemplate,
  SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE,
  SpriteAnimationTemplateTextEditorProvider,
} from './animations/spriteAnimationTemplateEditorProvider';
import { World2DTextEditorProvider } from './maps/world2dEditorProvider';
import {
  BORNENGINE_TOOLS_VIEW_ID,
  BLUEPRINT_EDITOR_VIEW_TYPE,
  BLUEPRINT_TEMPLATE_EDITOR_VIEW_TYPE,
  CREATE_BLUEPRINT_COMMAND,
  CREATE_BLUEPRINT_TEMPLATE_COMMAND,
  CREATE_SPRITE_ANIMATION_COMMAND,
  CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND,
  CREATE_WORLD2D_COMMAND,
  OPTIMIZE_WORLD2D_COMMAND,
  RUN_BORNENGINE_CLI_COMMAND,
  WORLD2D_EDITOR_VIEW_TYPE,
} from './shared/extensionIds';
import { runBornEngineCli } from './cli/bornEngineCli';
import { BornEngineToolsTreeProvider } from './views/bornEngineToolsProvider';
import { World2DMapCodecCoordinator } from './maps/mapCodecCoordinator';

export {
  BLUEPRINT_EDITOR_VIEW_TYPE,
  CREATE_BLUEPRINT_COMMAND,
  CREATE_BLUEPRINT_TEMPLATE_COMMAND,
  CREATE_SPRITE_ANIMATION_COMMAND,
  CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND,
  CREATE_WORLD2D_COMMAND,
  OPTIMIZE_WORLD2D_COMMAND,
  SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE,
  WORLD2D_EDITOR_VIEW_TYPE,
} from './shared/extensionIds';

export function activate(
  context: vscode.ExtensionContext,
  injectedApi?: typeof vscode,
): void {
  const api = injectedApi ?? require('vscode') as typeof vscode;
  const diagnostics = api.languages.createDiagnosticCollection('bornengine-world2d');
  const workerUri = api.Uri.joinPath(context.extensionUri, 'dist', 'mapCodecWorker.js');
  const codec = new World2DMapCodecCoordinator(() => new Worker(workerUri.fsPath));
  const provider = new World2DTextEditorProvider(context, diagnostics, api, codec);
  const animationDiagnostics = api.languages.createDiagnosticCollection('bornengine-sprite-animation');
  const animationProvider = new SpriteAnimationTextEditorProvider(context, animationDiagnostics, api);
  const animationTemplateDiagnostics = api.languages.createDiagnosticCollection('bornengine-sprite-animation-template');
  const animationTemplateProvider = new SpriteAnimationTemplateTextEditorProvider(context, animationTemplateDiagnostics, api);
  const blueprintTemplateDiagnostics = api.languages.createDiagnosticCollection('bornengine-blueprint-template');
  const blueprintTemplateProvider = new BlueprintTemplateEditorProvider(context, blueprintTemplateDiagnostics, api);
  const blueprintDiagnostics = api.languages.createDiagnosticCollection('bornengine-blueprint');
  const blueprintProvider = new BlueprintTextEditorProvider(context, blueprintDiagnostics, api);
  const toolsProvider = new BornEngineToolsTreeProvider(context, api);

  context.subscriptions.push(
    diagnostics,
    codec,
    animationDiagnostics,
    animationTemplateDiagnostics,
    blueprintTemplateDiagnostics,
    blueprintDiagnostics,
    api.window.registerCustomEditorProvider(WORLD2D_EDITOR_VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    api.window.registerCustomEditorProvider(SPRITE_ANIMATION_EDITOR_VIEW_TYPE, animationProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    api.window.registerCustomEditorProvider(SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE, animationTemplateProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    api.window.registerCustomEditorProvider(BLUEPRINT_TEMPLATE_EDITOR_VIEW_TYPE, blueprintTemplateProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    api.window.registerCustomEditorProvider(BLUEPRINT_EDITOR_VIEW_TYPE, blueprintProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    api.window.registerTreeDataProvider(BORNENGINE_TOOLS_VIEW_ID, toolsProvider),
  );
  context.subscriptions.push(
    api.commands.registerCommand(CREATE_WORLD2D_COMMAND, (workspaceFolderUri?: vscode.Uri) =>
      createWorld2DMap(api, workspaceFolderUri)),
    api.commands.registerCommand(OPTIMIZE_WORLD2D_COMMAND, () => provider.optimizeActive()),
    api.commands.registerCommand(CREATE_SPRITE_ANIMATION_COMMAND, (options?: SpriteAnimationCreationOptions) =>
      createSpriteAnimationCompanion(api, options)),
    api.commands.registerCommand(CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND, (options?: { workspaceFolderUri?: vscode.Uri }) =>
      createSpriteAnimationTemplate(api, options)),
    api.commands.registerCommand(CREATE_BLUEPRINT_TEMPLATE_COMMAND, (workspaceFolderUri?: vscode.Uri) =>
      createBlueprintTemplate(api, { workspaceFolderUri })),
    api.commands.registerCommand(CREATE_BLUEPRINT_COMMAND, (workspaceFolderUri?: vscode.Uri) =>
      createBlueprint(api, workspaceFolderUri)),
    api.commands.registerCommand(RUN_BORNENGINE_CLI_COMMAND, (folderUri?: vscode.Uri, shortcutId?: string) =>
      runBornEngineCli(api, folderUri instanceof api.Uri ? folderUri : undefined, typeof shortcutId === 'string' ? shortcutId : undefined)),
  );
}

async function createWorld2DMap(api: typeof vscode, workspaceFolderUri?: vscode.Uri): Promise<void> {
  const activeDocumentUri = api.window.activeTextEditor?.document.uri;
  const requestedFolder = workspaceFolderUri
    ? api.workspace.workspaceFolders?.find((folder) => sameUri(folder.uri, workspaceFolderUri))
    : undefined;
  if (workspaceFolderUri && !requestedFolder) {
    await api.window.showErrorMessage('The selected workspace folder is no longer open.');
    return;
  }
  const root = requestedFolder?.uri
    ?? (activeDocumentUri ? api.workspace.getWorkspaceFolder(activeDocumentUri)?.uri : undefined)
    ?? api.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    await api.window.showErrorMessage('Open a workspace folder before creating a World2D map.');
    return;
  }

  const defaultUri = api.Uri.joinPath(root, 'new-map.world2d.json');
  const targetUri = await api.window.showSaveDialog({
    defaultUri,
    saveLabel: 'Create World2D Map',
    filters: { 'BornEngine World2D Map': ['world2d.json'] },
  });
  if (!targetUri) return;

  const targetFolder = api.workspace.getWorkspaceFolder(targetUri);
  if (!targetFolder || targetFolder.uri.toString() !== root.toString()) {
    await api.window.showErrorMessage('Save the World2D map inside the active workspace folder.');
    return;
  }

  let targetExists = false;
  try {
    await api.workspace.fs.stat(targetUri);
    targetExists = true;
  } catch (_error) {
    targetExists = false;
  }

  if (!targetExists) {
    const fileName = targetUri.path.split('/').pop() || 'new-map.world2d.json';
    const id = fileName.replace(/\.world2d\.json$/i, '') || 'new-map';
    const document = {
      format: 'bornengine.world2d',
      version: 2,
      id,
      name: id.replace(/[-_]+/g, ' '),
      assets: [],
      tilesets: [],
      layers: [],
      metadata: {},
    };
    const serialized = serializeWorld2D(document, { mode: 'compact', effort: 'fast' });
    if (!serialized.ok) {
      await api.window.showErrorMessage('A valid empty World2D map could not be created.');
      return;
    }
    const content = new TextEncoder().encode(`${serialized.json}\n`);
    await api.workspace.fs.writeFile(targetUri, content);
  }

  await api.commands.executeCommand('vscode.openWith', targetUri, WORLD2D_EDITOR_VIEW_TYPE);
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
}
