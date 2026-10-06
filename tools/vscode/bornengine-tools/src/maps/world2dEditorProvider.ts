import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { formatWorld2DDiagnostics, serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d/editor';
import type { World2DDiagnostic, World2DDocument } from '@bornengine/engine/world2d/editor';
import type { MapCodecRevision, MapCodecResult, World2DMapCodecCoordinator } from './mapCodecCoordinator';
import { buildMapEditorHtml } from './mapEditorHtml';
import { applyWorld2DEdit } from './world2dEdits';
import type { World2DEditOperation } from './world2dEdits';
import { parseWorld2DText } from './world2dDocument';
import {
  resolveWorkspaceAsset,
  workspaceFolderForDocument,
  workspaceRelativeAssetPath,
} from '../shared/workspaceAssets';

type VsCodeApi = typeof vscode;

interface HostMessage {
  type: string;
  [key: string]: unknown;
}

function isHostMessage(value: unknown): value is HostMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function fullDocumentRange(document: vscode.TextDocument, api: VsCodeApi): vscode.Range {
  const end = document.positionAt(document.getText().length);
  return new api.Range(0, 0, end.line, end.character);
}

function toDiagnostic(
  diagnostic: World2DDiagnostic,
  document: vscode.TextDocument,
  api: VsCodeApi,
): vscode.Diagnostic {
  const range = new api.Range(0, 0, 0, 0);
  const result = new api.Diagnostic(range, diagnostic.message, api.DiagnosticSeverity.Error);
  result.source = `BornEngine World2D (${diagnostic.code})`;
  return result;
}

function assetDiagnostics(
  model: World2DDocument,
  missingAssets: readonly string[],
): World2DDiagnostic[] {
  return missingAssets.map((asset) => ({
    path: `/assets/${model.assets.indexOf(asset)}`,
    code: 'missing_asset',
    message: `World2D asset "${asset}" could not be found in this workspace.`,
  }));
}

interface EditorSession {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
}

export class World2DTextEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly api: VsCodeApi;
  private readonly sessions = new Map<string, EditorSession>();
  private readonly generations = new Map<string, number>();
  private readonly revisions = new Map<string, MapCodecRevision>();
  private readonly optimizedSaveTexts = new Map<string, string>();
  private activeUri: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: vscode.DiagnosticCollection,
    injectedApi?: VsCodeApi,
    private readonly codec?: World2DMapCodecCoordinator,
  ) {
    this.api = injectedApi ?? require('vscode') as VsCodeApi;
  }

  private revisionFor(document: vscode.TextDocument, sourceText: string): MapCodecRevision | null {
    if (!this.codec) return null;
    const uri = document.uri.toString();
    const existing = this.revisions.get(uri);
    if (existing && existing.textVersion === document.version && existing.sourceText === sourceText) return existing;
    const generation = (this.generations.get(uri) ?? 0) + 1;
    this.generations.set(uri, generation);
    const revision = { uri, textVersion: document.version, generation, sourceText };
    this.revisions.set(uri, revision);
    this.codec.schedule(revision);
    return revision;
  }

  private revisionIsCurrent(document: vscode.TextDocument, revision: MapCodecRevision): boolean {
    return document.uri.toString() === revision.uri && document.version === revision.textVersion &&
      document.getText() === revision.sourceText && this.codec?.isCurrent(revision) === true &&
      this.revisions.get(revision.uri) === revision;
  }

  private activeSession(): EditorSession | null {
    for (const session of this.sessions.values()) if (session.panel.active) return session;
    if (this.activeUri) {
      const active = this.sessions.get(this.activeUri);
      if (active) return active;
    }
    const activeTextUri = this.api.window.activeTextEditor?.document.uri.toString();
    if (activeTextUri) return this.sessions.get(activeTextUri) ?? null;
    const sessions = [...this.sessions.values()];
    return sessions[sessions.length - 1] ?? null;
  }

  async optimizeActive(): Promise<void> {
    const session = this.activeSession();
    if (!session) {
      await this.api.window.showErrorMessage('Open a World2D map before optimizing it.');
      return;
    }
    await this.optimizeDocument(session.document);
  }

  private async optimizeDocument(document: vscode.TextDocument): Promise<void> {
    if (!this.codec) {
      await this.api.window.showErrorMessage('World2D max compaction is unavailable in this extension session.');
      return;
    }
    const sourceText = document.getText();
    const parsed = parseWorld2DText(sourceText);
    if (!parsed.editable || !parsed.document) {
      await this.api.window.showErrorMessage(parsed.formattedDiagnostics || 'This World2D map is not valid for optimization.');
      return;
    }
    const revision = this.revisionFor(document, sourceText);
    if (!revision) return;
    let result: MapCodecResult;
    try {
      result = await this.codec.requestMax(revision) as MapCodecResult;
    } catch (error) {
      await this.api.window.showErrorMessage(error instanceof Error ? error.message : 'World2D map optimization failed.');
      return;
    }
    if (!this.revisionIsCurrent(document, revision)) {
      await this.api.window.showErrorMessage('The map changed while it was being optimized. Run Optimize Map again on the current version.');
      return;
    }
    if (!result?.ok) {
      await this.api.window.showErrorMessage(result?.diagnostics || 'World2D map optimization failed.');
      return;
    }
    const edit = new this.api.WorkspaceEdit();
    edit.replace(document.uri, fullDocumentRange(document, this.api), result.json);
    const applied = await this.api.workspace.applyEdit(edit);
    if (!applied) {
      await this.api.window.showErrorMessage('VS Code could not apply the optimized World2D map.');
      return;
    }
    const uriKey = document.uri.toString();
    if (document.getText() === result.json) this.optimizedSaveTexts.set(uriKey, result.json);
    const saved = await document.save();
    if (!saved) await this.api.window.showErrorMessage('The optimized map is ready but could not be saved.');
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token?: vscode.CancellationToken,
  ): Promise<void> {
    const uriKey = document.uri.toString();
    const session = { document, panel };
    this.sessions.set(uriKey, session);
    this.activeUri = uriKey;
    const workspaceFolders = this.api.workspace.workspaceFolders ?? [];
    const workspaceOwner = workspaceFolderForDocument(document.uri, workspaceFolders);
    const extensionDist = this.api.Uri.joinPath(this.context.extensionUri, 'dist');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionDist, ...(workspaceOwner ? [workspaceOwner.uri] : [])],
    };

    const scriptUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'mapEditor.js'));
    const styleUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'mapEditor.css'));

    let editQueue = Promise.resolve();
    let applyingEditorEdit = false;
    let webviewReady = false;
    const sendCurrentDocument = async (): Promise<void> => {
      const sourceText = document.getText();
      const parsed = parseWorld2DText(sourceText);
      if (parsed.editable && parsed.document) this.revisionFor(document, sourceText);
      else {
        this.codec?.invalidate(uriKey);
        this.revisions.delete(uriKey);
      }
      const missingAssets: string[] = [];
      const assets: Record<string, string> = {};

      if (parsed.document) {
        const assetPaths = new Set([
          ...parsed.document.assets,
          ...parsed.document.tilesets.map((tileset) => tileset.image),
        ]);
        await Promise.all([...assetPaths].map(async (assetPath) => {
          const assetUri = resolveWorkspaceAsset(document.uri, assetPath, workspaceFolders);
          if (!assetUri) {
            missingAssets.push(assetPath);
            return;
          }
          try {
            await this.api.workspace.fs.stat(assetUri);
            assets[assetPath] = panel.webview.asWebviewUri(assetUri).toString();
          } catch (_error) {
            missingAssets.push(assetPath);
          }
        }));
      }

      const diagnostics = parsed.document
        ? [...parsed.diagnostics, ...assetDiagnostics(parsed.document, missingAssets)]
        : parsed.diagnostics;
      const displayDiagnostics = formatWorld2DDiagnostics(diagnostics);
      this.diagnostics.set(
        document.uri,
        diagnostics.map((item) => toDiagnostic(item, document, this.api)),
      );
      await panel.webview.postMessage({
        type: 'document',
        document: parsed.document,
        editable: parsed.editable,
        assets,
        diagnostics: displayDiagnostics,
        title: parsed.document?.name ?? document.uri.path.split('/').pop() ?? 'World2D Map',
      });
    };

    const showError = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : 'The World2D edit could not be applied.';
      await panel.webview.postMessage({ type: 'error', message });
    };

    const applyOperations = async (operations: World2DEditOperation[]): Promise<void> => {
      if (operations.length === 0) return;
      const parsed = parseWorld2DText(document.getText());
      if (!parsed.editable || !parsed.document) {
        await showError(new Error('Invalid World2D documents are read-only until their diagnostics are fixed.'));
        await sendCurrentDocument();
        return;
      }

      let edited = parsed.document;
      for (const operation of operations) edited = applyWorld2DEdit(edited, operation);
      const validation = validateWorld2D(edited);
      if (!validation.ok) {
        throw new Error(formatWorld2DDiagnostics(validation.diagnostics));
      }
      const serialized = serializeWorld2D(edited, { mode: 'compact', effort: 'fast' });
      if (!serialized.ok) throw new Error(formatWorld2DDiagnostics(serialized.diagnostics));

      const edit = new this.api.WorkspaceEdit();
      edit.replace(document.uri, fullDocumentRange(document, this.api), serialized.json);
      applyingEditorEdit = true;
      let applied: boolean;
      try {
        applied = await this.api.workspace.applyEdit(edit);
      } finally {
        applyingEditorEdit = false;
      }
      if (!applied) throw new Error('VS Code did not apply the World2D document edit.');
      await sendCurrentDocument();
    };

    const applyOperation = async (operation: World2DEditOperation): Promise<void> => {
      await applyOperations([operation]);
    };

    const selectTilesetImage = async (): Promise<void> => {
      const owner = workspaceFolderForDocument(document.uri, workspaceFolders);
      if (!owner) throw new Error('Open this World2D map inside a workspace to select an image.');
      const selected = await this.api.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: owner.uri,
        openLabel: 'Select Tileset Image',
        filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      });
      const selectedUri = selected?.[0];
      if (!selectedUri) return;

      const assetPath = workspaceRelativeAssetPath(document.uri, selectedUri, workspaceFolders);
      if (!assetPath) throw new Error('Select an image inside the workspace that contains this map.');
      const resolvedUri = resolveWorkspaceAsset(document.uri, assetPath, workspaceFolders);
      if (!resolvedUri) throw new Error('The selected image could not be resolved inside the map workspace.');
      await this.api.workspace.fs.stat(resolvedUri);
      await panel.webview.postMessage({
        type: 'assetSelected',
        assetPath,
        uri: panel.webview.asWebviewUri(resolvedUri).toString(),
      });
    };

    const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isHostMessage(message)) return;
      editQueue = editQueue.then(async () => {
        try {
          if (message.type === 'ready') {
            if (webviewReady) return;
            webviewReady = true;
            await sendCurrentDocument();
          } else if (message.type === 'edit') {
            if (!message.operation || typeof message.operation !== 'object') throw new Error('The World2D editor sent an invalid edit operation.');
            await applyOperation(message.operation as World2DEditOperation);
          } else if (message.type === 'editBatch') {
            if (!Array.isArray(message.operations) || message.operations.length === 0 ||
                !message.operations.every((operation) => typeof operation === 'object' && operation !== null)) {
              throw new Error('The World2D editor sent an invalid edit batch.');
            }
            await applyOperations(message.operations as World2DEditOperation[]);
          } else if (message.type === 'requestTilesetImage') {
            await selectTilesetImage();
          }
        } catch (error) {
          await showError(error);
          await sendCurrentDocument();
        }
      });
      return editQueue;
    });

    const changeSubscription = this.api.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (applyingEditorEdit) return;
      if (!webviewReady) return;
      this.codec?.invalidate(uriKey);
      this.revisions.delete(uriKey);
      editQueue = editQueue.then(sendCurrentDocument).catch(showError);
      return editQueue;
    });

    const saveSubscription = this.api.workspace.onWillSaveTextDocument?.((event) => {
      if (event.document.uri.toString() !== uriKey) return;
      const sourceText = event.document.getText();
      const optimizedText = this.optimizedSaveTexts.get(uriKey);
      if (optimizedText !== undefined) {
        this.optimizedSaveTexts.delete(uriKey);
        if (sourceText === optimizedText) return;
      }
      const parsed = parseWorld2DText(sourceText);
      if (!parsed.editable || !parsed.document) return;
      const fast = serializeWorld2D(parsed.document, { mode: 'compact', effort: 'fast' });
      if (!fast.ok) return;
      const revision = this.revisionFor(event.document, sourceText);
      const textEdit = (json: string): vscode.TextEdit[] => json === sourceText
        ? []
        : [this.api.TextEdit.replace(fullDocumentRange(event.document, this.api), json)];
      if (!this.codec || !revision) {
        event.waitUntil(Promise.resolve(textEdit(fast.json)));
        return;
      }
      const saveResult = this.codec.requestMax(revision, 750).then((result) => {
        if (!this.revisionIsCurrent(event.document, revision)) return [];
        return textEdit(result?.ok ? result.json : fast.json);
      }).catch(() => {
        return this.revisionIsCurrent(event.document, revision) ? textEdit(fast.json) : [];
      });
      event.waitUntil(saveResult);
    });

    const viewStateSubscription = panel.onDidChangeViewState?.((event) => {
      if (event.webviewPanel.active) this.activeUri = uriKey;
      else if (this.activeUri === uriKey) this.activeUri = null;
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      changeSubscription.dispose();
      saveSubscription?.dispose();
      viewStateSubscription?.dispose();
      if (this.sessions.get(uriKey) === session) {
        this.sessions.delete(uriKey);
        this.codec?.invalidate(uriKey);
        this.revisions.delete(uriKey);
        this.optimizedSaveTexts.delete(uriKey);
        if (this.activeUri === uriKey) this.activeUri = null;
      }
    });
    panel.webview.html = buildMapEditorHtml(panel.webview, scriptUri, styleUri, randomBytes(18).toString('base64'));
  }
}
