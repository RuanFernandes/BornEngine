import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type * as vscode from 'vscode';
import {
  readSpriteAnimationTemplate,
  spriteAnimationTemplateSource,
  validateSpriteAnimationTemplateBinding,
  validateSpriteAnimationTemplate,
} from './spriteAnimationTemplateSchema';
import type {
  ResolvedSpriteAnimationTemplate,
  SpriteAnimationTemplateDiagnostic,
} from './spriteAnimationTemplateSchema';
import { serializeSpriteAnimationJsonCompact } from './spriteAnimationJson';
import { buildSpriteAnimationTemplateEditorHtml } from './spriteAnimationTemplateEditorHtml';
import { createSpriteAnimationTemplateDocument } from './spriteAnimationTemplateCreation';
import { readRasterImageSize, spriteAnimationFileStem } from './spriteAnimationCreation';
import { workspaceFolderForDocument } from '../shared/workspaceAssets';

export const SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE = 'bornengineTools.spriteAnimationTemplateEditor';

type VsCodeApi = typeof vscode;

interface HostMessage {
  type: string;
  [key: string]: unknown;
}

interface PreviewImageAsset {
  id: string;
  name: string;
  uri: string;
  size: { width: number; height: number };
}

interface TemplateEditorState {
  template: ResolvedSpriteAnimationTemplate | null;
  diagnostics: SpriteAnimationTemplateDiagnostic[];
  editable: boolean;
}

function isHostMessage(value: unknown): value is HostMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
}

function fullDocumentRange(document: vscode.TextDocument, api: VsCodeApi): vscode.Range {
  const end = document.positionAt(document.getText().length);
  return new api.Range(0, 0, end.line, end.character);
}

function diagnosticsText(diagnostics: readonly SpriteAnimationTemplateDiagnostic[]): string {
  return diagnostics.map((item) => `${item.path || '/'}: ${item.message} (${item.code})`).join('\n');
}

function toVsCodeDiagnostic(item: SpriteAnimationTemplateDiagnostic, api: VsCodeApi): vscode.Diagnostic {
  const result = new api.Diagnostic(new api.Range(0, 0, 0, 0), `${item.message} (${item.code})`, api.DiagnosticSeverity.Error);
  result.source = 'BornEngine Sprite Animation Template';
  return result;
}

function imageMimeType(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.bmp') return 'image/bmp';
  return 'image/png';
}

export class SpriteAnimationTemplateTextEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly api: VsCodeApi;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: vscode.DiagnosticCollection,
    injectedApi?: VsCodeApi,
  ) {
    this.api = injectedApi ?? require('vscode') as VsCodeApi;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token?: vscode.CancellationToken,
  ): Promise<void> {
    const workspaceFolders = this.api.workspace.workspaceFolders ?? [];
    const owner = workspaceFolderForDocument(document.uri, workspaceFolders);
    const extensionDist = this.api.Uri.joinPath(this.context.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [extensionDist] };
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'spriteAnimationTemplateEditor.js'));
    const styleUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'spriteAnimationTemplateEditor.css'));
    panel.webview.html = buildSpriteAnimationTemplateEditorHtml(panel.webview, scriptUri, styleUri, nonce);

    let editQueue = Promise.resolve();
    let webviewReady = false;
    let applyingEditorEdit = false;
    let applyingEditorText: string | null = null;
    let latestExternalTextDuringApply: string | null = null;
    let externalEditGeneration = 0;
    let nextPreviewId = 1;
    const previewImages = new Map<string, PreviewImageAsset[]>();

    const previewCropDiagnostics = (
      template: ResolvedSpriteAnimationTemplate,
      imagesByParameter: ReadonlyMap<string, readonly PreviewImageAsset[]> = previewImages,
    ): SpriteAnimationTemplateDiagnostic[] => {
      const diagnostics: SpriteAnimationTemplateDiagnostic[] = [];
      for (const [parameterId, images] of imagesByParameter) {
        for (const image of images) {
          const binding: Record<string, { width: number; height: number }> = Object.create(null);
          binding[parameterId] = image.size;
          const checked = validateSpriteAnimationTemplateBinding(spriteAnimationTemplateSource(template), binding);
          for (const item of checked.diagnostics) {
            if (item.code === 'binding.crop') diagnostics.push({ ...item, message: `${image.name}: ${item.message}` });
          }
        }
      }
      return diagnostics;
    };

    const readCurrentState = (): TemplateEditorState => {
      const read = readSpriteAnimationTemplate(document.getText());
      if (!read.result.ok) return { template: null, diagnostics: [...read.result.diagnostics], editable: false };
      const diagnostics = previewCropDiagnostics(read.result.value);
      return { template: read.result.value, diagnostics, editable: true };
    };

    const sendCurrentDocument = async (acknowledgedEditId?: number, includePreviews = false): Promise<void> => {
      if (!webviewReady) return;
      const state = readCurrentState();
      this.diagnostics.set(document.uri, state.diagnostics.map((item) => toVsCodeDiagnostic(item, this.api)));
      const imagesByParameter: Record<string, PreviewImageAsset[]> = Object.create(null);
      if (includePreviews) {
        for (const [parameterId, images] of previewImages) imagesByParameter[parameterId] = images;
      }
      await panel.webview.postMessage({
        type: 'document',
        mode: 'template',
        template: state.template === null ? null : spriteAnimationTemplateSource(state.template),
        editable: state.editable,
        dirty: document.isDirty,
        diagnostics: diagnosticsText(state.diagnostics),
        title: state.template?.name ?? path.posix.basename(document.uri.path),
        externalEditGeneration,
        ...(includePreviews ? { previewImagesByParameter: imagesByParameter } : {}),
        ...(acknowledgedEditId === undefined ? {} : { acknowledgedEditId }),
      });
    };

    const showError = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : 'The sprite animation template edit could not be applied.';
      await panel.webview.postMessage({ type: 'error', message });
    };

    const selectPreviewImages = async (parameterId: unknown): Promise<void> => {
      if (typeof parameterId !== 'string') throw new Error('Choose an image parameter before selecting its preview art.');
      const current = readSpriteAnimationTemplate(document.getText());
      if (!current.result.ok || !current.result.value.imageParameters.some((parameter) => parameter.id === parameterId)) {
        throw new Error(`Image parameter "${parameterId}" does not exist in this template.`);
      }
      const selected = await this.api.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        ...(owner ? { defaultUri: owner.uri } : {}),
        openLabel: 'Choose Preview Images',
        filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
      });
      if (!selected?.length) return;
      const unique = selected.filter((uri, index) => selected.findIndex((candidate) => sameUri(candidate, uri)) === index);
      const images: PreviewImageAsset[] = [];
      for (const uri of unique) {
        let bytes: Uint8Array;
        try {
          bytes = await this.api.workspace.fs.readFile(uri);
        } catch (_error) {
          throw new Error(`Preview image "${path.posix.basename(uri.path)}" could not be read.`);
        }
        const size = readRasterImageSize(uri.path, bytes);
        if (!size) throw new Error(`Preview image "${path.posix.basename(uri.path)}" must be a readable PNG, JPEG, GIF, WebP, or BMP image.`);
        images.push({
          id: `preview-${nextPreviewId++}`,
          name: path.posix.basename(uri.path),
          uri: `data:${imageMimeType(uri.path)};base64,${Buffer.from(bytes).toString('base64')}`,
          size,
        });
      }
      previewImages.set(parameterId, images);
      await panel.webview.postMessage({ type: 'previewImagesSelected', parameterId, images });
      await sendCurrentDocument(undefined, false);
    };

    const applyWorkspaceText = async (text: string): Promise<boolean> => {
      const edit = new this.api.WorkspaceEdit();
      edit.replace(document.uri, fullDocumentRange(document, this.api), text);
      applyingEditorText = text;
      applyingEditorEdit = true;
      try {
        return await this.api.workspace.applyEdit(edit);
      } finally {
        applyingEditorEdit = false;
        applyingEditorText = null;
      }
    };

    const restoreConcurrentText = async (text: string): Promise<void> => {
      let textToRestore = text;
      while (true) {
        const generationBeforeRestore = externalEditGeneration;
        const restored = await applyWorkspaceText(textToRestore);
        if (!restored) throw new Error('A concurrent text edit could not be restored after the visual edit was rejected.');
        if (document.getText() !== textToRestore || externalEditGeneration === generationBeforeRestore) return;
        const latestExternalText = latestExternalTextDuringApply;
        if (latestExternalText === null || latestExternalText === textToRestore) return;
        textToRestore = latestExternalText;
      }
    };

    const applyTemplate = async (input: unknown, editId: number, editGeneration: number): Promise<void> => {
      if (editGeneration !== externalEditGeneration) throw new Error('The template changed in the text editor. Review the latest version and try again.');
      const current = readCurrentState();
      if (!current.template) throw new Error('Fix the invalid template JSON before using the visual editor.');
      const result = validateSpriteAnimationTemplate(input);
      if (!result.ok) throw new Error(diagnosticsText(result.diagnostics));
      const previousTemplate = current.template;
      const nextPreviewImages = new Map(previewImages);
      let previewsChanged = false;
      if (previousTemplate) {
        for (let index = 0; index < previousTemplate.imageParameters.length; index++) {
          const previousId = previousTemplate.imageParameters[index]?.id;
          const nextId = result.value.imageParameters[index]?.id;
          if (previousId && nextId && previousId !== nextId && nextPreviewImages.has(previousId) && !nextPreviewImages.has(nextId)) {
            nextPreviewImages.set(nextId, nextPreviewImages.get(previousId)!);
            nextPreviewImages.delete(previousId);
            previewsChanged = true;
          }
        }
      }
      const cropDiagnostics = previewCropDiagnostics(result.value, nextPreviewImages);
      if (cropDiagnostics.length > 0) throw new Error(diagnosticsText(cropDiagnostics));
      const nextText = serializeSpriteAnimationJsonCompact(spriteAnimationTemplateSource(result.value));
      latestExternalTextDuringApply = null;
      const applied = await applyWorkspaceText(nextText);
      if (!applied) throw new Error('VS Code did not apply the animation template edit.');
      if (previewsChanged) {
        previewImages.clear();
        for (const [parameterId, images] of nextPreviewImages) previewImages.set(parameterId, [...images]);
      }
      if (externalEditGeneration !== editGeneration) {
        const concurrentText = latestExternalTextDuringApply;
        if (concurrentText !== null && document.getText() === nextText) await restoreConcurrentText(concurrentText);
        throw new Error('The template changed in the text editor. Review the latest version and try again.');
      }
      await sendCurrentDocument(editId, previewsChanged);
    };

    const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isHostMessage(message)) return;
      if (message.type === 'ready') {
        editQueue = editQueue.then(async () => {
          webviewReady = true;
          await sendCurrentDocument(undefined, true);
        });
        return editQueue;
      }
      if (message.type === 'selectPreviewImages') {
        editQueue = editQueue.then(() => selectPreviewImages(message.parameterId)).catch(showError);
        return editQueue;
      }
      if (message.type !== 'edit') return;
      const editId = message.editId;
      if (typeof editId !== 'number' || !Number.isSafeInteger(editId) || editId < 1) {
        editQueue = editQueue.then(async () => { await showError(new Error('The template edit did not include a valid edit ID.')); await sendCurrentDocument(); });
        return editQueue;
      }
      const editGeneration = message.externalEditGeneration;
      if (typeof editGeneration !== 'number' || !Number.isSafeInteger(editGeneration) || editGeneration < 0) {
        editQueue = editQueue.then(async () => { await showError(new Error('The template edit did not include a valid document revision.')); await sendCurrentDocument(); });
        return editQueue;
      }
      editQueue = editQueue.then(async () => {
        try {
          await applyTemplate(message.template, editId, editGeneration);
        } catch (error) {
          await showError(error);
          await sendCurrentDocument(editId);
        }
      });
      return editQueue;
    });

    const changeSubscription = this.api.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString() || !webviewReady) return;
      if (applyingEditorEdit && event.document.getText() === applyingEditorText) return;
      externalEditGeneration++;
      if (applyingEditorEdit) latestExternalTextDuringApply = event.document.getText();
      editQueue = editQueue.then(() => sendCurrentDocument(undefined, true)).catch(showError);
      return editQueue;
    });
    const saveSubscription = this.api.workspace.onDidSaveTextDocument((savedDocument) => {
      if (savedDocument.uri.toString() !== document.uri.toString() || !webviewReady) return;
      editQueue = editQueue.then(() => sendCurrentDocument()).catch(showError);
      return editQueue;
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      changeSubscription.dispose();
      saveSubscription.dispose();
    });
  }
}

export interface SpriteAnimationTemplateCreationOptions {
  workspaceFolderUri?: vscode.Uri;
}

export async function createSpriteAnimationTemplate(
  api: VsCodeApi,
  options?: SpriteAnimationTemplateCreationOptions,
): Promise<void> {
  const nameInput = await api.window.showInputBox({
    prompt: 'Animation template name',
    placeHolder: 'layered-character',
    validateInput: (value) => value.trim().length > 0 ? undefined : 'Enter a name for this animation template.',
  });
  const name = nameInput?.trim();
  if (!name) return;

  const activeUri = api.window.activeTextEditor?.document.uri;
  const requestedFolder = options?.workspaceFolderUri
    ? api.workspace.workspaceFolders?.find((folder) => sameUri(folder.uri, options.workspaceFolderUri!))
    : undefined;
  if (options?.workspaceFolderUri && !requestedFolder) {
    await api.window.showErrorMessage('The selected workspace folder is no longer open.');
    return;
  }
  const owner = requestedFolder
    ?? (activeUri ? api.workspace.getWorkspaceFolder(activeUri) : undefined)
    ?? api.workspace.workspaceFolders?.[0];
  if (!owner) {
    await api.window.showErrorMessage('Open a workspace folder before creating an animation template.');
    return;
  }

  const stem = spriteAnimationFileStem(name);
  const defaultUri = api.Uri.joinPath(owner.uri, 'assets', 'animations', `${stem}.spriteanim-template.json`);
  const target = await api.window.showSaveDialog({
    defaultUri,
    saveLabel: 'Create Animation Template',
    filters: { 'BornEngine Sprite Animation Template': ['spriteanim-template.json'] },
  });
  if (!target) return;
  const targetOwner = api.workspace.getWorkspaceFolder(target);
  if (!targetOwner || !sameUri(targetOwner.uri, owner.uri)) {
    await api.window.showErrorMessage('Save the animation template inside the selected workspace folder.');
    return;
  }
  try {
    await api.workspace.fs.stat(target);
    await api.window.showErrorMessage('A file already exists at the selected path. Choose another name.');
    return;
  } catch (_error) {
    // The output path is available.
  }
  const document = createSpriteAnimationTemplateDocument(name);
  const targetDirectory = target.with({ path: path.posix.dirname(target.path) });
  await api.workspace.fs.createDirectory(targetDirectory);
  await api.workspace.fs.writeFile(target, new TextEncoder().encode(serializeSpriteAnimationJsonCompact(document)));
  await api.commands.executeCommand('vscode.openWith', target, SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE);
}
