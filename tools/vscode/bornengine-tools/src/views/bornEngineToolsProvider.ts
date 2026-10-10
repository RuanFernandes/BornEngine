import path from 'node:path';
import type * as vscode from 'vscode';
import { SPRITE_ANIMATION_EDITOR_VIEW_TYPE } from '../animations/spriteAnimationEditorProvider';
import {
  BORNENGINE_TOOLS_VIEW_ID,
  CREATE_BLUEPRINT_COMMAND,
  CREATE_BLUEPRINT_TEMPLATE_COMMAND,
  CREATE_SPRITE_ANIMATION_COMMAND,
  CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND,
  CREATE_WORLD2D_COMMAND,
  RUN_BORNENGINE_CLI_COMMAND,
  WORLD2D_EDITOR_VIEW_TYPE,
} from '../shared/extensionIds';
import { BORNENGINE_CLI_SHORTCUTS } from '../cli/bornEngineCli';
import { workspaceFolderForDocument } from '../shared/workspaceAssets';
import { isBornEngineProjectManifest } from './bornEngineProject';
import { discoverBornEngineAssets, type BornEngineWorkspaceAsset } from './bornEngineAssets';
import { discoverBornEngineServers, type BornEngineServerDestination } from './bornEngineServers';

const JSON_WATCH_GLOB = '**/*.json';
const IMAGE_WATCH_GLOB = '**/*.{png,jpg,jpeg,gif,webp,bmp,tif,tiff,PNG,JPG,JPEG,GIF,WEBP,BMP,TIF,TIFF}';
const IGNORED_PATH_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'out']);

type AssetGroup = 'maps' | 'animations' | 'metadata' | 'images';

type TreeNode =
  | { kind: 'workspace'; folder: vscode.WorkspaceFolder }
  | { kind: 'message' }
  | { kind: 'createMap'; folder: vscode.WorkspaceFolder }
  | { kind: 'createAnimation'; folder: vscode.WorkspaceFolder }
  | { kind: 'createAnimationTemplate'; folder: vscode.WorkspaceFolder }
  | { kind: 'createBlueprint'; folder: vscode.WorkspaceFolder }
  | { kind: 'createTemplate'; folder: vscode.WorkspaceFolder }
  | { kind: 'servers'; servers: BornEngineServerDestination[] }
  | { kind: 'cli'; folder: vscode.WorkspaceFolder }
  | { kind: 'group'; folder: vscode.WorkspaceFolder; assets: BornEngineWorkspaceAsset[] }
  | { kind: 'asset'; asset: BornEngineWorkspaceAsset }
  | { kind: 'metadataImage' }
  | { kind: 'metadataAnimation' };

const GROUPS: Array<{ key: AssetGroup; label: string; kind: BornEngineWorkspaceAsset['kind'] }> = [
  { key: 'maps', label: 'World2D Maps', kind: 'map' },
  { key: 'animations', label: 'Sprite Animations', kind: 'animation' },
  { key: 'metadata', label: 'Sprite Metadata', kind: 'spriteMetadata' },
  { key: 'images', label: 'Graphics', kind: 'image' },
];

function isRelevantFile(uri: vscode.Uri): boolean {
  if (uri.path.split('/').some((segment) => IGNORED_PATH_SEGMENTS.has(segment))) return false;
  return uri.path.toLowerCase().endsWith('.json') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(uri.path);
}

/** Supplies a workspace-scoped BornEngine tools tree for the Activity Bar view. */
export class BornEngineToolsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly api: typeof vscode;
  private readonly emitter: vscode.EventEmitter<vscode.TreeItem | undefined>;
  private readonly nodes = new WeakMap<vscode.TreeItem, TreeNode>();

  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined>;

  constructor(context: vscode.ExtensionContext, injectedApi?: typeof vscode) {
    this.api = injectedApi ?? require('vscode') as typeof vscode;
    this.emitter = new this.api.EventEmitter<vscode.TreeItem | undefined>();
    this.onDidChangeTreeData = this.emitter.event;
    context.subscriptions.push(this.emitter);

    context.subscriptions.push(this.api.workspace.onDidChangeWorkspaceFolders(() => this.refresh()));
    for (const pattern of [JSON_WATCH_GLOB, IMAGE_WATCH_GLOB]) {
      const watcher = this.api.workspace.createFileSystemWatcher(pattern);
      context.subscriptions.push(watcher);
      context.subscriptions.push(
        watcher.onDidCreate((uri) => this.refreshIfRelevant(uri)),
        watcher.onDidChange((uri) => this.refreshIfRelevant(uri)),
        watcher.onDidDelete((uri) => this.refreshIfRelevant(uri)),
      );
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      const folders = this.api.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        return [this.createItem('Open a workspace folder to use BornEngine Tools.', { kind: 'message' })];
      }
      return folders.map((folder) => this.createItem(folder.name, { kind: 'workspace', folder }, {
        collapsibleState: this.api.TreeItemCollapsibleState.Collapsed,
        description: 'Workspace',
        resourceUri: folder.uri,
      }));
    }

    const node = this.nodes.get(element);
    if (!node) return [];
    if (node.kind === 'workspace') return this.getWorkspaceChildren(node.folder);
    if (node.kind === 'servers') return this.getServerChildren(node.servers);
    if (node.kind === 'cli') return this.getCliChildren(node.folder);
    if (node.kind === 'group') return node.assets.map((asset) => this.createAssetItem(asset));
    if (node.kind === 'asset' && node.asset.kind === 'spriteMetadata') {
      return this.getSpriteMetadataChildren(node.asset);
    }
    return [];
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  private refreshIfRelevant(uri: vscode.Uri): void {
    if (isRelevantFile(uri)) this.refresh();
  }

  private async getWorkspaceChildren(folder: vscode.WorkspaceFolder): Promise<vscode.TreeItem[]> {
    const manifestUri = this.api.Uri.joinPath(folder.uri, 'package.json');
    let manifest: unknown;
    try {
      const bytes = await this.api.workspace.fs.readFile(manifestUri);
      manifest = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return [this.createItem('Not a BornEngine project', { kind: 'message' }, {
        description: 'Root package.json is missing or invalid',
      })];
    }

    if (!isBornEngineProjectManifest(manifest)) {
      return [this.createItem('Not a BornEngine project', { kind: 'message' }, {
        description: 'package.json does not declare @bornengine/engine',
      })];
    }

    let assets: BornEngineWorkspaceAsset[];
    let servers: BornEngineServerDestination[];
    const workspaceFolders = this.api.workspace.workspaceFolders ?? [folder];
    try {
      [assets, servers] = await Promise.all([
        discoverBornEngineAssets(folder, this.api, workspaceFolders),
        discoverBornEngineServers(folder, this.api, workspaceFolders),
      ]);
    } catch {
      return [
        this.createItem('Create World2D Map', { kind: 'createMap', folder }, { resourceUri: folder.uri }),
        this.createItem('Create Sprite Animation', { kind: 'createAnimation', folder }, { resourceUri: folder.uri }),
        this.createItem('Create Sprite Animation Template', { kind: 'createAnimationTemplate', folder }, { resourceUri: folder.uri }),
        this.createItem('Unable to scan BornEngine assets', { kind: 'message' }),
        this.createItem('Unable to scan linked servers', { kind: 'message' }),
      ];
    }

    assets = assets.filter((asset) => {
      if (workspaceFolderForDocument(asset.uri, workspaceFolders) !== folder) return false;
      if (asset.kind === 'spriteMetadata' && workspaceFolderForDocument(asset.imageUri, workspaceFolders) !== folder) return false;
      if (asset.kind === 'spriteMetadata' && asset.companionUri &&
          workspaceFolderForDocument(asset.companionUri, workspaceFolders) !== folder) return false;
      return true;
    });

    const items: vscode.TreeItem[] = [
      this.createItem('BornEngine CLI', { kind: 'cli', folder }, {
        collapsibleState: this.api.TreeItemCollapsibleState.Expanded,
        description: 'run, build, upgrade…',
        iconPath: new this.api.ThemeIcon('terminal'),
        tooltip: 'Run BornEngine CLI commands in an integrated terminal for this project',
      }),
      this.createItem('Create World2D Map', { kind: 'createMap', folder }, { resourceUri: folder.uri }),
      this.createItem('Create Sprite Animation', { kind: 'createAnimation', folder }, { resourceUri: folder.uri }),
      this.createItem('Create Sprite Animation Template', { kind: 'createAnimationTemplate', folder }, { resourceUri: folder.uri }),
      this.createItem('Create Blueprint', { kind: 'createBlueprint', folder }, {
        command: {
          command: CREATE_BLUEPRINT_COMMAND,
          title: 'Create Blueprint',
          arguments: [folder.uri],
        },
        resourceUri: folder.uri,
      }),
      this.createItem('Create Blueprint Template', { kind: 'createTemplate', folder }, { resourceUri: folder.uri }),
      this.createItem('Servers', { kind: 'servers', servers }, {
        collapsibleState: this.api.TreeItemCollapsibleState.Collapsed,
        description: servers.length === 0 ? 'not linked' : `${servers.length} linked`,
        resourceUri: folder.uri,
      }),
    ];
    for (const group of GROUPS) {
      const groupAssets = assets.filter((asset) => asset.kind === group.kind);
      if (groupAssets.length === 0) continue;
      items.push(this.createItem(group.label, { kind: 'group', folder, assets: groupAssets }, {
        collapsibleState: this.api.TreeItemCollapsibleState.Collapsed,
      }));
    }
    if (assets.length === 0) items.push(this.createItem('No BornEngine assets found yet', { kind: 'message' }));
    return items;
  }

  private getCliChildren(folder: vscode.WorkspaceFolder): vscode.TreeItem[] {
    return BORNENGINE_CLI_SHORTCUTS.map((shortcut) => this.createItem(shortcut.label, { kind: 'message' }, {
      command: {
        command: RUN_BORNENGINE_CLI_COMMAND,
        title: shortcut.label,
        arguments: [folder.uri, shortcut.id],
      },
      description: shortcut.description,
      iconPath: new this.api.ThemeIcon(shortcut.icon),
      tooltip: `Run \`${shortcut.description}\` in ${folder.name}`,
    }));
  }

  private getServerChildren(servers: BornEngineServerDestination[]): vscode.TreeItem[] {
    if (servers.length === 0) {
      return [this.createItem('No linked server', { kind: 'message' }, {
        description: 'Run `bornengine create server` in this project',
      })];
    }
    return servers.map((server) => this.createItem(server.name, { kind: 'message' }, {
      command: {
        command: 'vscode.open',
        title: 'Open BornEngine Server Marker',
        arguments: [server.markerUri],
      },
      contextValue: 'bornengineTools.server',
      description: server.relativePath,
      resourceUri: server.serverUri,
    }));
  }

  private getSpriteMetadataChildren(
    asset: Extract<BornEngineWorkspaceAsset, { kind: 'spriteMetadata' }>,
  ): vscode.TreeItem[] {
    const items = [this.createItem(`Sprite sheet: ${path.posix.basename(asset.imageUri.path)}`, {
      kind: 'metadataImage',
    }, {
      command: { command: 'vscode.open', title: 'Open Sprite Sheet', arguments: [asset.imageUri] },
      resourceUri: asset.imageUri,
    })];

    if (asset.companionUri) {
      items.push(this.createItem('Open Animation', { kind: 'metadataAnimation' }, {
        command: {
          command: 'vscode.openWith',
          title: 'Open Animation',
          arguments: [asset.companionUri, SPRITE_ANIMATION_EDITOR_VIEW_TYPE],
        },
        resourceUri: asset.companionUri,
      }));
    } else {
      items.push(this.createItem('Create Animation', { kind: 'metadataAnimation' }, {
        command: {
          command: CREATE_SPRITE_ANIMATION_COMMAND,
          title: 'Create Animation',
          arguments: [{ imageUri: asset.imageUri }],
        },
        resourceUri: asset.uri,
      }));
    }
    return items;
  }

  private createAssetItem(asset: BornEngineWorkspaceAsset): vscode.TreeItem {
    const collapsibleState = asset.kind === 'spriteMetadata'
      ? this.api.TreeItemCollapsibleState.Collapsed
      : this.api.TreeItemCollapsibleState.None;
    const command = asset.kind === 'map'
      ? { command: 'vscode.openWith', title: 'Open Map', arguments: [asset.uri, WORLD2D_EDITOR_VIEW_TYPE] }
      : asset.kind === 'animation'
        ? { command: 'vscode.openWith', title: 'Open Animation', arguments: [asset.uri, SPRITE_ANIMATION_EDITOR_VIEW_TYPE] }
        : asset.kind === 'spriteMetadata'
          ? { command: 'vscode.open', title: 'Open Metadata', arguments: [asset.uri] }
          : { command: 'vscode.open', title: 'Open Image', arguments: [asset.uri] };
    const workspaceFolder = this.api.workspace.getWorkspaceFolder(asset.uri);
    const relativePath = workspaceFolder ? path.posix.relative(workspaceFolder.uri.path, asset.uri.path) : asset.uri.path;
    const kind = asset.kind === 'spriteMetadata' ? 'spriteMetadata' : asset.kind;
    return this.createItem(asset.name, { kind: 'asset', asset }, {
      collapsibleState,
      command,
      contextValue: `bornengineTools.${kind}`,
      description: relativePath,
      resourceUri: asset.uri,
    });
  }

  private createItem(
    label: string,
    node: TreeNode,
    options: Partial<vscode.TreeItem> = {},
  ): vscode.TreeItem {
    const item = new this.api.TreeItem(
      label,
      options.collapsibleState ?? this.api.TreeItemCollapsibleState.None,
    );
    Object.assign(item, options);
    if (node.kind === 'createMap') {
      item.command = {
        command: CREATE_WORLD2D_COMMAND,
        title: 'Create World2D Map',
        arguments: [node.folder.uri],
      };
    } else if (node.kind === 'createAnimation') {
      item.command = {
        command: CREATE_SPRITE_ANIMATION_COMMAND,
        title: 'Create Sprite Animation',
        arguments: [{ workspaceFolderUri: node.folder.uri }],
      };
    } else if (node.kind === 'createAnimationTemplate') {
      item.command = {
        command: CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND,
        title: 'Create Sprite Animation Template',
        arguments: [{ workspaceFolderUri: node.folder.uri }],
      };
    } else if (node.kind === 'createTemplate') {
      item.command = {
        command: CREATE_BLUEPRINT_TEMPLATE_COMMAND,
        title: 'Create Blueprint Template',
        arguments: [node.folder.uri],
      };
    }
    this.nodes.set(item, node);
    return item;
  }
}
