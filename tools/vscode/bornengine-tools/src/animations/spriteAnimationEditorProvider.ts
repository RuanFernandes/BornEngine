import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type * as vscode from 'vscode';
import type {
  SpriteAnimationDocument,
  SpriteAnimationDocumentDiagnostic,
  SpriteSheetCharacterMetadata,
} from './spriteAnimationSchema';
import {
  validateSpriteAnimationDocument,
  validateSpriteSheetCharacterMetadata,
} from './spriteAnimationSchema';
import { buildAnimationEditorHtml } from './animationEditorHtml';
import { spriteAnimationClipFrameLists } from './spriteAnimationSchema';
import { serializeSpriteAnimationJsonCompact } from './spriteAnimationJson';
import {
  resolveDocumentRelativeWorkspaceAsset,
  resolveWorkspaceAsset,
  workspaceFolderForDocument,
  workspaceRelativeAssetPath,
} from '../shared/workspaceAssets';
import {
  createSpriteAnimationAssets,
  parseFrameSize,
  readRasterImageSize,
  spriteAnimationFileStem,
} from './spriteAnimationCreation';

export const SPRITE_ANIMATION_EDITOR_VIEW_TYPE = 'bornengineTools.spriteAnimationEditor';

type VsCodeApi = typeof vscode;

interface HostMessage {
  type: string;
  [key: string]: unknown;
}

export interface SpriteAnimationCreationOptions {
  imageUri?: vscode.Uri;
  workspaceFolderUri?: vscode.Uri;
}

interface AnimationEditorState {
  document: SpriteAnimationDocument | null;
  metadata: SpriteSheetCharacterMetadata | null;
  imageUri: string | null;
  imageSize: { width: number; height: number } | null;
  sourceImagePath?: string | null;
  frameImages?: Array<{ path: string; uri: string; size: { width: number; height: number } }>;
  diagnostics: SpriteAnimationDocumentDiagnostic[];
  editable: boolean;
}

interface SelectedFrameImage {
  path: string;
  uri: string;
  size: { width: number; height: number };
}

function isHostMessage(value: unknown): value is HostMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
}

function diagnostic(pathValue: string, code: string, message: string): SpriteAnimationDocumentDiagnostic {
  return { path: pathValue, code, message };
}

function diagnosticText(diagnostics: readonly SpriteAnimationDocumentDiagnostic[]): string {
  return diagnostics.map((item) => `${item.path || '/'}: ${item.message} (${item.code})`).join('\n');
}

function toVsCodeDiagnostic(
  item: SpriteAnimationDocumentDiagnostic,
  api: VsCodeApi,
): vscode.Diagnostic {
  const result = new api.Diagnostic(new api.Range(0, 0, 0, 0), `${item.message} (${item.code})`, api.DiagnosticSeverity.Error);
  result.source = 'BornEngine Sprite Animation';
  return result;
}

function fullDocumentRange(document: vscode.TextDocument, api: VsCodeApi): vscode.Range {
  const end = document.positionAt(document.getText().length);
  return new api.Range(0, 0, end.line, end.character);
}

function parseJson(text: string): { value: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

function sourceReferenceDiagnostics(
  document: SpriteAnimationDocument,
  metadata: SpriteSheetCharacterMetadata,
): SpriteAnimationDocumentDiagnostic[] {
  const diagnostics: SpriteAnimationDocumentDiagnostic[] = [];
  for (let clipIndex = 0; clipIndex < document.clips.length; clipIndex++) {
    const clip = document.clips[clipIndex];
    if (!clip || clip.frames !== undefined || clip.directions !== undefined) continue;
    const matchingRows = metadata.rows.filter((row) => row.animation_group_id === clip.animationGroupId);
    if (matchingRows.length === 0) {
      diagnostics.push(diagnostic(`/clips/${clipIndex}/animationGroupId`, 'missing_animation_group',
        `Animation group "${clip.animationGroupId}" does not exist in the source metadata.`));
    }
  }

  const referencedGroups = document.clips.filter((clip) => clip.frames === undefined && clip.directions === undefined).map((clip) => clip.animationGroupId);
  const seenGroups: string[] = [];
  const seenDirections: string[] = [];
  for (let rowIndex = 0; rowIndex < metadata.rows.length; rowIndex++) {
    const row = metadata.rows[rowIndex];
    if (!row) continue;
    if (!row.animation_group_id) {
      diagnostics.push(diagnostic(`/source/rows/${rowIndex}/animation_group_id`, 'missing_animation_group_id',
        'Source animation rows require animation_group_id.'));
    }
    if (!row.direction) {
      diagnostics.push(diagnostic(`/source/rows/${rowIndex}/direction`, 'missing_direction',
        'Source animation rows require direction.'));
    }
    if (!row.animation_group_id || !row.direction || referencedGroups.indexOf(row.animation_group_id) < 0) continue;
    const duplicateIndex = seenGroups.findIndex((group, index) => group === row.animation_group_id && seenDirections[index] === row.direction);
    if (duplicateIndex >= 0) {
      diagnostics.push(diagnostic(`/source/rows/${rowIndex}/direction`, 'duplicate_group_direction',
        `Animation group "${row.animation_group_id}" has direction "${row.direction}" more than once.`));
    } else {
      seenGroups.push(row.animation_group_id);
      seenDirections.push(row.direction);
    }
  }
  return diagnostics;
}

export class SpriteAnimationTextEditorProvider implements vscode.CustomTextEditorProvider {
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
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionDist, ...(owner ? [owner.uri] : [])],
    };
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'animationEditor.js'));
    const styleUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(extensionDist, 'animationEditor.css'));
    panel.webview.html = buildAnimationEditorHtml(panel.webview, scriptUri, styleUri, nonce);

    let editQueue = Promise.resolve();
    let webviewReady = false;
    let applyingEditorEdit = false;
    let decodedImageSize: { width: number; height: number } | null = null;
    let imageLoadFailed = false;
    let externalEditGeneration = 0;
    let applyingEditorText: string | null = null;
    let latestExternalTextDuringApply: string | null = null;

    const readCurrentState = async (): Promise<AnimationEditorState> => {
      const parsedDocument = parseJson(document.getText());
      if (parsedDocument.error !== undefined) {
        return {
          document: null,
          metadata: null,
          imageUri: null,
          imageSize: null,
          diagnostics: [diagnostic('', 'invalid_json', `Animation companion is not valid JSON: ${parsedDocument.error}`)],
          editable: false,
        };
      }

      const documentResult = validateSpriteAnimationDocument(parsedDocument.value);
      if (!documentResult.ok) {
        return { document: null, metadata: null, imageUri: null, imageSize: null, diagnostics: documentResult.diagnostics, editable: false };
      }

      const nextDiagnostics: SpriteAnimationDocumentDiagnostic[] = [];
      const sourceUri = resolveWorkspaceAsset(document.uri, documentResult.value.source, workspaceFolders);
      if (!sourceUri) {
        nextDiagnostics.push(diagnostic('/source', 'source_outside_workspace', 'Source metadata must resolve inside the workspace that contains this companion.'));
        return { document: documentResult.value, metadata: null, imageUri: null, imageSize: null, diagnostics: nextDiagnostics, editable: false };
      }

      let sourceText: string;
      try {
        sourceText = new TextDecoder().decode(await this.api.workspace.fs.readFile(sourceUri));
      } catch (_error) {
        nextDiagnostics.push(diagnostic('/source', 'missing_source_metadata', `Source metadata "${documentResult.value.source}" could not be read.`));
        return { document: documentResult.value, metadata: null, imageUri: null, imageSize: null, diagnostics: nextDiagnostics, editable: false };
      }

      const parsedMetadata = parseJson(sourceText);
      if (parsedMetadata.error !== undefined) {
        nextDiagnostics.push(diagnostic('/source', 'invalid_source_json', `Source metadata is not valid JSON: ${parsedMetadata.error}`));
        return { document: documentResult.value, metadata: null, imageUri: null, imageSize: null, diagnostics: nextDiagnostics, editable: false };
      }
      const metadataResult = validateSpriteSheetCharacterMetadata(parsedMetadata.value);
      if (!metadataResult.ok) {
        nextDiagnostics.push(...metadataResult.diagnostics.map((item) => ({
          ...item,
          path: `/source${item.path}`,
          code: `source_${item.code}`,
          message: `Source metadata: ${item.message}`,
        })));
        return { document: documentResult.value, metadata: null, imageUri: null, imageSize: null, diagnostics: nextDiagnostics, editable: false };
      }

      nextDiagnostics.push(...sourceReferenceDiagnostics(documentResult.value, metadataResult.value));
      const imageAsset = resolveDocumentRelativeWorkspaceAsset(sourceUri, metadataResult.value.spritesheet.path, workspaceFolders);
      let imageUri: string | null = null;
      let sourceImagePath: string | null = null;
      let imageExists = false;
      if (!imageAsset) {
        nextDiagnostics.push(diagnostic('/source/spritesheet/path', 'spritesheet_outside_workspace',
          'spritesheet.path must resolve inside the workspace that contains the source metadata.'));
      } else {
        try {
          await this.api.workspace.fs.stat(imageAsset);
          imageExists = true;
          imageUri = panel.webview.asWebviewUri(imageAsset).toString();
          sourceImagePath = workspaceRelativeAssetPath(document.uri, imageAsset, workspaceFolders);
        } catch (_error) {
          nextDiagnostics.push(diagnostic('/source/spritesheet/path', 'missing_spritesheet_image',
            `Sprite sheet image "${metadataResult.value.spritesheet.path}" could not be found.`));
        }
      }

      if (imageExists && decodedImageSize) {
        const dimensionsResult = validateSpriteSheetCharacterMetadata(parsedMetadata.value, decodedImageSize);
        if (!dimensionsResult.ok) {
          nextDiagnostics.push(...dimensionsResult.diagnostics.map((item) => ({
            ...item,
            path: `/source${item.path}`,
            code: `source_${item.code}`,
            message: `Source metadata: ${item.message}`,
          })));
        }
      }
      if (imageExists && imageLoadFailed) {
        nextDiagnostics.push(diagnostic('/source/spritesheet/path', 'unreadable_spritesheet_image',
          'The sprite sheet image could not be decoded by the animation editor.'));
      }

      const frameImageAssets = new Map<string, SelectedFrameImage>();
      if (sourceImagePath && imageUri) {
        frameImageAssets.set(sourceImagePath, {
          path: sourceImagePath,
          uri: imageUri,
          size: metadataResult.value.sheet_size,
        });
      }
      for (let clipIndex = 0; clipIndex < documentResult.value.clips.length; clipIndex++) {
        const clip = documentResult.value.clips[clipIndex];
        if (!clip) continue;
        for (const frameList of spriteAnimationClipFrameLists(clip, `/clips/${clipIndex}`)) {
          for (let frameIndex = 0; frameIndex < frameList.frames.length; frameIndex++) {
            const frame = frameList.frames[frameIndex];
            if (!frame) continue;
            const framePath = `${frameList.path}/${frameIndex}`;
            let asset = frameImageAssets.get(frame.image);
            if (!asset) {
              const frameUri = resolveWorkspaceAsset(document.uri, frame.image, workspaceFolders);
              if (!frameUri) {
                nextDiagnostics.push(diagnostic(`${framePath}/image`, 'frame_image_outside_workspace',
                  'Frame images must resolve inside the workspace that contains the animation companion.'));
                continue;
              }
              try {
                await this.api.workspace.fs.stat(frameUri);
                const bytes = await this.api.workspace.fs.readFile(frameUri);
                const size = readRasterImageSize(frameUri.path, bytes);
                if (!size) {
                  nextDiagnostics.push(diagnostic(`${framePath}/image`, 'invalid_frame_image',
                    `Frame image "${frame.image}" must be a readable PNG, JPEG, GIF, WebP, or BMP image.`));
                  continue;
                }
                asset = {
                  path: frame.image,
                  uri: panel.webview.asWebviewUri(frameUri).toString(),
                  size,
                };
                frameImageAssets.set(frame.image, asset);
              } catch (_error) {
                nextDiagnostics.push(diagnostic(`${framePath}/image`, 'missing_frame_image',
                  `Frame image "${frame.image}" could not be read.`));
                continue;
              }
            }
            if (frame.x + frame.width > asset.size.width || frame.y + frame.height > asset.size.height) {
              nextDiagnostics.push(diagnostic(framePath, 'frame_outside_image',
                'Frame crop rectangle must fit inside its source image.'));
            }
          }
        }
      }

      return {
        document: documentResult.value,
        metadata: metadataResult.value,
        imageUri,
        imageSize: imageExists ? decodedImageSize : null,
        sourceImagePath,
        frameImages: [...frameImageAssets.values()],
        diagnostics: nextDiagnostics,
        editable: nextDiagnostics.length === 0 && imageExists && decodedImageSize !== null && !imageLoadFailed,
      };
    };

    const sendCurrentDocument = async (acknowledgedEditId?: number): Promise<void> => {
      if (!webviewReady) return;
      const state = await readCurrentState();
      this.diagnostics.set(document.uri, state.diagnostics.map((item) => toVsCodeDiagnostic(item, this.api)));
      await panel.webview.postMessage({
        type: 'document',
        document: state.document,
        metadata: state.metadata,
        imageUri: state.imageUri,
        imageSize: state.imageSize,
        sourceImagePath: state.sourceImagePath ?? null,
        frameImages: state.frameImages ?? [],
        editable: state.editable,
        dirty: document.isDirty,
        diagnostics: diagnosticText(state.diagnostics),
        title: state.document?.source ? path.posix.basename(state.document.source, '.json') : 'Sprite Animation',
        externalEditGeneration,
        ...(acknowledgedEditId === undefined ? {} : { acknowledgedEditId }),
      });
    };

    const showError = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : 'The sprite animation edit could not be applied.';
      await panel.webview.postMessage({ type: 'error', message });
    };

    const selectFrameImages = async (): Promise<void> => {
      const selected = await this.api.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        ...(owner ? { defaultUri: owner.uri } : {}),
        openLabel: 'Add Animation Frames',
        filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
      });
      if (!selected?.length) return;
      const uniqueSelected = selected.filter((uri, index) =>
        selected.findIndex((candidate) => sameUri(candidate, uri)) === index);
      const sources: Array<{ uri: vscode.Uri; bytes: Uint8Array; size: { width: number; height: number } }> = [];
      for (const uri of uniqueSelected) {
        let bytes: Uint8Array;
        try {
          bytes = await this.api.workspace.fs.readFile(uri);
        } catch (_error) {
          throw new Error(`Frame image "${path.posix.basename(uri.path)}" could not be read.`);
        }
        const size = readRasterImageSize(uri.path, bytes);
        if (!size) throw new Error(`Frame image "${path.posix.basename(uri.path)}" must be a readable PNG, JPEG, GIF, WebP, or BMP image.`);
        sources.push({ uri, bytes, size });
      }

      const images: SelectedFrameImage[] = [];
      const imported: vscode.Uri[] = [];
      const externalSources = sources.filter(({ uri }) => !workspaceRelativeAssetPath(document.uri, uri, workspaceFolders));
      let importDirectory: vscode.Uri | null = null;
      if (externalSources.length > 0) {
        if (!owner) throw new Error('Open this animation from a workspace before importing images from outside it.');
        const animationStem = path.posix.basename(document.uri.path, '.spriteanim.json');
        const directoryPath = path.posix.join(path.posix.dirname(document.uri.path), `${animationStem}-frames`);
        importDirectory = owner.uri.with({ path: directoryPath });
        try {
          await this.api.workspace.fs.createDirectory(importDirectory);
        } catch (_error) {
          try { await this.api.workspace.fs.stat(importDirectory); }
          catch { throw new Error('The animation frame import folder could not be created.'); }
        }
      }

      try {
        for (const source of sources) {
          let imageUri = source.uri;
          let imagePath = workspaceRelativeAssetPath(document.uri, imageUri, workspaceFolders);
          if (!imagePath) {
            if (!owner || !importDirectory) throw new Error('The selected image cannot be imported into this workspace.');
            const extension = path.posix.extname(source.uri.path);
            const requestedName = path.posix.basename(source.uri.path, extension);
            let suffix = 1;
            while (true) {
              const fileName = `${requestedName}${suffix === 1 ? '' : `-${suffix}`}${extension}`;
              const target = owner.uri.with({ path: path.posix.join(importDirectory.path, fileName) });
              let exists = false;
              try { await this.api.workspace.fs.stat(target); exists = true; } catch { exists = false; }
              if (exists) {
                suffix++;
                continue;
              }
              await this.api.workspace.fs.writeFile(target, source.bytes);
              imported.push(target);
              imageUri = target;
              imagePath = workspaceRelativeAssetPath(document.uri, target, workspaceFolders);
              break;
            }
          }
          if (!imagePath) throw new Error('The selected image could not be referenced from this workspace.');
          images.push({ path: imagePath, uri: panel.webview.asWebviewUri(imageUri).toString(), size: source.size });
        }
      } catch (error) {
        await Promise.all(imported.map(async (uri) => {
          try { await this.api.workspace.fs.delete(uri); } catch { /* Keep the original import error. */ }
        }));
        throw error;
      }

      if (images.length === 0) return;
      await panel.webview.postMessage({ type: 'frameImagesSelected', images });
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

    const applyDocument = async (input: unknown, editId: number, editGeneration: number): Promise<void> => {
      if (editGeneration !== externalEditGeneration) {
        throw new Error('The animation changed in the text editor. The visual edit was discarded; review the latest document and try again.');
      }
      const current = await readCurrentState();
      if (editGeneration !== externalEditGeneration) {
        throw new Error('The animation changed in the text editor. The visual edit was discarded; review the latest document and try again.');
      }
      if (!current.editable || !current.document) {
        throw new Error('Invalid companion or source metadata must be fixed before editing.');
      }
      const result = validateSpriteAnimationDocument(input);
      if (!result.ok) throw new Error(diagnosticText(result.diagnostics));
      if (result.value.source !== current.document.source) {
        throw new Error('The source metadata reference cannot be changed in the animation editor.');
      }

      const json = serializeSpriteAnimationJsonCompact(input);
      latestExternalTextDuringApply = null;
      const applied = await applyWorkspaceText(json);
      if (!applied) throw new Error('VS Code did not apply the sprite animation document edit.');
      if (externalEditGeneration !== editGeneration) {
        const concurrentText = latestExternalTextDuringApply;
        if (concurrentText !== null && document.getText() === json) await restoreConcurrentText(concurrentText);
        throw new Error('The animation changed in the text editor. The visual edit was discarded; review the latest document and try again.');
      }
      await sendCurrentDocument(editId);
    };

    const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isHostMessage(message)) return;
      if (message.type === 'ready') {
        editQueue = editQueue.then(async () => {
          webviewReady = true;
          await sendCurrentDocument();
        });
        return editQueue;
      }
      if (message.type === 'selectFrameImages') {
        editQueue = editQueue.then(selectFrameImages).catch(showError);
        return editQueue;
      }
      if (message.type === 'imageSize' || message.type === 'imageLoadError') {
        editQueue = editQueue.then(async () => {
          if (message.type === 'imageLoadError') {
            imageLoadFailed = true;
            decodedImageSize = null;
          } else {
            const width = message.width;
            const height = message.height;
            if (typeof width === 'number' && Number.isInteger(width) && width > 0 &&
                typeof height === 'number' && Number.isInteger(height) && height > 0) {
              imageLoadFailed = false;
              decodedImageSize = { width, height };
            } else {
              imageLoadFailed = true;
              decodedImageSize = null;
            }
          }
          await sendCurrentDocument();
        });
        return editQueue;
      }
      if (message.type !== 'edit') return;
      const editId = message.editId;
      if (typeof editId !== 'number' || !Number.isSafeInteger(editId) || editId < 1) {
        editQueue = editQueue.then(async () => {
          await showError(new Error('The sprite animation edit did not include a valid edit ID.'));
          await sendCurrentDocument();
        });
        return editQueue;
      }
      const editGeneration = message.externalEditGeneration;
      if (typeof editGeneration !== 'number' || !Number.isSafeInteger(editGeneration) || editGeneration < 0) {
        editQueue = editQueue.then(async () => {
          await showError(new Error('The sprite animation edit did not include a valid document revision.'));
          await sendCurrentDocument();
        });
        return editQueue;
      }
      editQueue = editQueue.then(async () => {
        try {
          await applyDocument(message.document, editId, editGeneration);
        } catch (error) {
          await showError(error);
          await sendCurrentDocument(editId);
        }
      });
      return editQueue;
    });

    const changeSubscription = this.api.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (!webviewReady) return;
      if (applyingEditorEdit && event.document.getText() === applyingEditorText) return;
      externalEditGeneration += 1;
      if (applyingEditorEdit) latestExternalTextDuringApply = event.document.getText();
      editQueue = editQueue.then(() => sendCurrentDocument()).catch(showError);
      return editQueue;
    });
    const saveSubscription = this.api.workspace.onDidSaveTextDocument((savedDocument) => {
      if (savedDocument.uri.toString() !== document.uri.toString()) return;
      if (!webviewReady) return;
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

export async function createSpriteAnimationCompanion(
  api: VsCodeApi,
  options?: SpriteAnimationCreationOptions,
): Promise<void> {
  const nameInput = await api.window.showInputBox({
    prompt: 'Animation name',
    placeHolder: 'walk',
    validateInput: (value) => value.trim().length > 0 ? undefined : 'Enter a name for this animation.',
  });
  const animationName = nameInput?.trim();
  if (!animationName) return;

  const workflowChoice = await api.window.showQuickPick([
    { label: 'Sprite sheet', description: 'One image arranged in a regular grid', value: 'sheet' as const },
    { label: 'Image sequence', description: 'Several image files, one frame per file', value: 'sequence' as const },
  ], { placeHolder: 'Choose how the animation frames are organized' });
  const workflow = workflowChoice?.value;
  if (workflow !== 'sheet' && workflow !== 'sequence') return;

  const activeUri = api.window.activeTextEditor?.document.uri;
  const imageFolder = options?.imageUri
    ? api.workspace.getWorkspaceFolder(options.imageUri)
    : undefined;
  if (options?.imageUri && !imageFolder) {
    await api.window.showErrorMessage('Select a sprite sheet inside an active workspace folder.');
    return;
  }
  const requestedFolder = options?.workspaceFolderUri
    ? api.workspace.workspaceFolders?.find((folder) => sameUri(folder.uri, options.workspaceFolderUri!))
    : undefined;
  if (options?.workspaceFolderUri && !requestedFolder) {
    await api.window.showErrorMessage('The selected workspace folder is no longer open.');
    return;
  }
  const activeFolder = imageFolder ?? requestedFolder
    ?? (activeUri ? api.workspace.getWorkspaceFolder(activeUri) : undefined)
    ?? api.workspace.workspaceFolders?.[0];
  if (!activeFolder) {
    await api.window.showErrorMessage('Open a workspace folder before creating a sprite animation.');
    return;
  }

  const selected = workflow === 'sheet' && options?.imageUri ? undefined : await api.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: workflow === 'sequence',
      defaultUri: activeFolder.uri,
      openLabel: workflow === 'sheet' ? 'Select Sprite Sheet' : 'Select Animation Frames',
      filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    });
  const selectedImages = workflow === 'sequence'
    ? [...(options?.imageUri ? [options.imageUri] : []), ...(selected ?? [])]
      .filter((uri, index, all) => all.findIndex((candidate) => sameUri(candidate, uri)) === index)
    : [options?.imageUri ?? selected?.[0]].filter((uri): uri is vscode.Uri => uri !== undefined);
  const imageUri = selectedImages[0];
  if (!imageUri) return;

  const selectedFolder = api.workspace.getWorkspaceFolder(imageUri);
  if (!selectedFolder) {
    await api.window.showErrorMessage('Select animation images inside an active workspace folder.');
    return;
  }

  const roots = [selectedFolder];
  const sourceImages: Array<{ uri: vscode.Uri; path: string; size: { width: number; height: number } }> = [];
  for (const selectedImage of selectedImages) {
    const projectPath = workspaceRelativeAssetPath(imageUri, selectedImage, roots);
    if (!projectPath) {
      await api.window.showErrorMessage('Select all animation images inside the same workspace folder.');
      return;
    }
    let imageBytes: Uint8Array;
    try {
      imageBytes = await api.workspace.fs.readFile(selectedImage);
    } catch (_error) {
      await api.window.showErrorMessage(`The selected image "${projectPath}" could not be read.`);
      return;
    }
    const size = readRasterImageSize(selectedImage.path, imageBytes);
    if (!size) {
      await api.window.showErrorMessage(`Could not read the dimensions of "${projectPath}". Choose a PNG, JPEG, GIF, WebP, or BMP image.`);
      return;
    }
    sourceImages.push({ uri: selectedImage, path: projectPath, size });
  }

  const firstImage = sourceImages[0];
  if (!firstImage) return;
  const imageSize = firstImage.size;

  let frameSize = imageSize;
  if (workflow === 'sheet') {
    const defaultFrameSize = `${Math.min(32, imageSize.width)}x${Math.min(32, imageSize.height)}`;
    const frameSizeInput = await api.window.showInputBox({
      prompt: 'Sprite frame size (width x height, in pixels)',
      placeHolder: '32x32',
      value: defaultFrameSize,
      validateInput: (value) => parseFrameSize(value, imageSize)
        ? undefined
        : `Enter a positive frame size that fits in ${imageSize.width}×${imageSize.height}.`,
    });
    if (!frameSizeInput) return;
    const parsedFrameSize = parseFrameSize(frameSizeInput, imageSize);
    if (!parsedFrameSize) {
      await api.window.showErrorMessage('The sprite frame size must fit inside the selected image.');
      return;
    }
    frameSize = parsedFrameSize;
  }

  const directory = path.posix.dirname(imageUri.path);
  const requestedStem = spriteAnimationFileStem(animationName);
  let stem = requestedStem;
  let outputFiles: { metadataUri: vscode.Uri; targetUri: vscode.Uri; sourcePath: string } | null = null;
  for (let suffix = 2; ; suffix++) {
    const metadataUri = imageUri.with({ path: path.posix.join(directory, `${stem}.spritesheet.json`) });
    const targetUri = imageUri.with({ path: path.posix.join(directory, `${stem}.spriteanim.json`) });
    const sourcePath = workspaceRelativeAssetPath(imageUri, metadataUri, roots);
    if (!sourcePath || !workspaceRelativeAssetPath(imageUri, targetUri, roots)) {
      await api.window.showErrorMessage('The generated animation files must stay inside the workspace folder.');
      return;
    }
    let filenameExists = false;
    try {
      await api.workspace.fs.stat(metadataUri);
      filenameExists = true;
    } catch (_error) {
      // No source metadata file exists at this path.
    }
    if (!filenameExists) {
      try {
        await api.workspace.fs.stat(targetUri);
        filenameExists = true;
      } catch (_error) {
        // No animation file exists at this path.
      }
    }
    if (filenameExists) {
      stem = `${requestedStem}-${suffix}`;
      continue;
    }
    outputFiles = { metadataUri, targetUri, sourcePath };
    break;
  }

  if (!outputFiles) {
    await api.window.showErrorMessage('Could not find an available filename for the sprite animation.');
    return;
  }
  const { metadataUri, targetUri, sourcePath } = outputFiles;

  const generated = createSpriteAnimationAssets({
    name: animationName,
    imageRelativePath: path.posix.basename(firstImage.uri.path),
    metadataPath: sourcePath,
    imageSize,
    frameSize,
    ...(workflow === 'sequence' ? {
      frames: sourceImages.map((image) => ({
        image: image.path,
        x: 0,
        y: 0,
        width: image.size.width,
        height: image.size.height,
        name: path.posix.basename(image.uri.path, path.posix.extname(image.uri.path)),
      })),
    } : {}),
  });
  let metadataWritten = false;
  try {
    await api.workspace.fs.writeFile(metadataUri, new TextEncoder().encode(`${JSON.stringify(generated.metadata, null, 2)}\n`));
    metadataWritten = true;
    await api.workspace.fs.writeFile(targetUri, new TextEncoder().encode(serializeSpriteAnimationJsonCompact(generated.animation)));
  } catch (_error) {
    if (metadataWritten) {
      try { await api.workspace.fs.delete(metadataUri); } catch { /* Keep the original file error for the user. */ }
    }
    await api.window.showErrorMessage('The sprite animation files could not be written beside the selected image.');
    return;
  }
  await api.commands.executeCommand('vscode.openWith', targetUri, SPRITE_ANIMATION_EDITOR_VIEW_TYPE);
}
