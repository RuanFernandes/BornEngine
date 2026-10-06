import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type * as vscode from 'vscode';
import {
  BLUEPRINT_TEMPLATE_FORMAT,
  BLUEPRINT_TEMPLATE_VERSION,
  type BlueprintDiagnostic,
} from './blueprintSchema';
import { readBlueprintTemplate } from './blueprintJson';
import { buildBlueprintTemplateEditorHtml } from './blueprintTemplateEditorHtml';
import { BLUEPRINT_TEMPLATE_EDITOR_VIEW_TYPE } from '../shared/extensionIds';
import { isBornEngineProjectManifest } from '../views/bornEngineProject';
import { workspaceFolderForDocument } from '../shared/workspaceAssets';

const TEMPLATE_SUFFIX = '.blueprint-template.json';
type VsCodeApi = typeof vscode;

type HostMessage = {
  type: string;
  editId?: unknown;
  revision?: unknown;
  template?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fullDocumentRange(document: vscode.TextDocument, api: VsCodeApi): vscode.Range {
  const end = document.positionAt(document.getText().length);
  return new api.Range(0, 0, end.line, end.character);
}

function diagnosticText(diagnostics: readonly BlueprintDiagnostic[]): string {
  return diagnostics.map((item) => `${item.path}: ${item.message} (${item.code})`).join('\n');
}

function toVsCodeDiagnostic(item: BlueprintDiagnostic, api: VsCodeApi): vscode.Diagnostic {
  const result = new api.Diagnostic(
    new api.Range(0, 0, 0, 0),
    `${item.message} (${item.code})`,
    api.DiagnosticSeverity.Error,
  );
  result.source = 'BornEngine Blueprint Template';
  return result;
}

function isCurrentTemplate(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.format === BLUEPRINT_TEMPLATE_FORMAT
    && value.version === BLUEPRINT_TEMPLATE_VERSION;
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
}

function isInsideWorkspaceFile(uri: vscode.Uri, folder: vscode.WorkspaceFolder): boolean {
  if (uri.scheme !== folder.uri.scheme || uri.authority !== folder.uri.authority) return false;
  const rootPath = path.posix.resolve(folder.uri.path);
  const targetPath = path.posix.resolve(uri.path);
  const relativePath = path.posix.relative(rootPath, targetPath);
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.posix.sep}`)
    && !path.posix.isAbsolute(relativePath);
}

function safeTemplateStem(value: string): string {
  const stem = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return stem || 'blueprint-template';
}

export class BlueprintTemplateEditorProvider implements vscode.CustomTextEditorProvider {
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
    const distUri = this.api.Uri.joinPath(this.context.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [distUri, ...(owner ? [owner.uri] : [])] };
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(distUri, 'blueprintTemplateEditor.js'));
    const styleUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(distUri, 'blueprintTemplateEditor.css'));
    panel.webview.html = buildBlueprintTemplateEditorHtml(panel.webview, scriptUri, styleUri, nonce);

    let ready = false;
    let revision = 0;
    let applyingEditorText: string | null = null;
    let applyingEditorEdit = false;
    let editQueue = Promise.resolve();

    const currentState = () => {
      const result = readBlueprintTemplate(document.getText());
      const template = isCurrentTemplate(result.value) ? result.value : null;
      return { result, template };
    };

    const sendCurrentDocument = async (acknowledgedEditId?: number): Promise<void> => {
      if (!ready) return;
      const { result, template } = currentState();
      this.diagnostics.set(document.uri, result.diagnostics.map((item) => toVsCodeDiagnostic(item, this.api)));
      await panel.webview.postMessage({
        type: 'document',
        template,
        editable: template !== null,
        diagnostics: diagnosticText(result.diagnostics),
        dirty: document.isDirty,
        title: template?.name ?? 'Blueprint Template',
        revision,
        ...(acknowledgedEditId === undefined ? {} : { acknowledgedEditId }),
      });
    };

    const showError = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : 'The blueprint template edit could not be applied.';
      await panel.webview.postMessage({ type: 'error', message });
    };

    const applyDocument = async (input: unknown, editId: number, editRevision: number): Promise<void> => {
      if (editRevision !== revision) {
        throw new Error('The template changed in the text editor. The visual edit was discarded; review the latest document and try again.');
      }
      if (!isCurrentTemplate(input)) throw new Error('The editor can only update a supported blueprint template document.');
      const current = currentState();
      if (!current.template) throw new Error('This template uses an unsupported format or version. Fix it in the text editor before editing.');

      const text = `${JSON.stringify(input, null, 2)}\n`;
      const edit = new this.api.WorkspaceEdit();
      edit.replace(document.uri, fullDocumentRange(document, this.api), text);
      applyingEditorText = text;
      applyingEditorEdit = true;
      let applied: boolean;
      try {
        applied = await this.api.workspace.applyEdit(edit);
      } finally {
        applyingEditorEdit = false;
        applyingEditorText = null;
      }
      if (!applied) throw new Error('VS Code did not apply the blueprint template document edit.');
      await sendCurrentDocument(editId);
    };

    const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isRecord(message) || typeof message.type !== 'string') return;
      const hostMessage = message as HostMessage;
      if (hostMessage.type === 'ready') {
        editQueue = editQueue.then(async () => {
          ready = true;
          await sendCurrentDocument();
        });
        return editQueue;
      }
      if (hostMessage.type !== 'edit') return;
      const editId = hostMessage.editId;
      const editRevision = hostMessage.revision;
      if (typeof editId !== 'number' || !Number.isSafeInteger(editId) || editId < 1
          || typeof editRevision !== 'number' || !Number.isSafeInteger(editRevision) || editRevision < 0) {
        editQueue = editQueue.then(async () => {
          await showError(new Error('The template edit is missing its document revision.'));
          await sendCurrentDocument();
        });
        return editQueue;
      }
      editQueue = editQueue.then(async () => {
        try {
          await applyDocument(hostMessage.template, editId, editRevision);
        } catch (error) {
          await showError(error);
          await sendCurrentDocument(editId);
        }
      });
      return editQueue;
    });

    const changeSubscription = this.api.workspace.onDidChangeTextDocument((event) => {
      if (!sameUri(event.document.uri, document.uri) || !ready) return;
      if (applyingEditorEdit && event.document.getText() === applyingEditorText) return;
      revision++;
      editQueue = editQueue.then(() => sendCurrentDocument()).catch(showError);
      return editQueue;
    });
    const saveSubscription = this.api.workspace.onDidSaveTextDocument((savedDocument) => {
      if (!sameUri(savedDocument.uri, document.uri) || !ready) return;
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

export type CreateBlueprintTemplateOptions = { workspaceFolderUri?: vscode.Uri };

export async function createBlueprintTemplate(
  api: VsCodeApi,
  options?: CreateBlueprintTemplateOptions,
): Promise<void> {
  const workspaceFolders = api.workspace.workspaceFolders ?? [];
  const activeUri = api.window.activeTextEditor?.document.uri;
  const requestedFolder = options?.workspaceFolderUri
    ? workspaceFolders.find((folder) => sameUri(folder.uri, options.workspaceFolderUri!))
    : undefined;
  if (options?.workspaceFolderUri && !requestedFolder) {
    await api.window.showErrorMessage('The selected workspace folder is no longer open.');
    return;
  }
  const folder = requestedFolder
    ?? (activeUri ? workspaceFolderForDocument(activeUri, workspaceFolders) : undefined)
    ?? workspaceFolders[0];
  if (!folder) {
    await api.window.showErrorMessage('Open a BornEngine project before creating a blueprint template.');
    return;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(await api.workspace.fs.readFile(api.Uri.joinPath(folder.uri, 'package.json')))) as unknown;
  } catch {
    await api.window.showErrorMessage('The selected workspace does not have a readable BornEngine package.json.');
    return;
  }
  if (!isBornEngineProjectManifest(manifest)) {
    await api.window.showErrorMessage('Open a project that declares @bornengine/engine before creating a blueprint template.');
    return;
  }

  const enteredName = await api.window.showInputBox({
    prompt: 'Blueprint template name',
    placeHolder: 'Spell',
    validateInput: (value) => value.trim().length > 0 ? undefined : 'Enter a name for this template.',
  });
  const name = enteredName?.trim();
  if (!name) return;
  const stem = safeTemplateStem(name);
  const defaultUri = api.Uri.joinPath(folder.uri, '.bornengine', 'blueprint-templates', `${stem}${TEMPLATE_SUFFIX}`);
  const selectedUri = await api.window.showSaveDialog({
    defaultUri,
    saveLabel: 'Create Blueprint Template',
    filters: { 'Blueprint Template': ['blueprint-template.json'] },
  });
  if (!selectedUri) return;
  if (!isInsideWorkspaceFile(selectedUri, folder)) {
    await api.window.showErrorMessage('Save blueprint templates inside the BornEngine project.');
    return;
  }
  const targetUri = selectedUri.path.endsWith(TEMPLATE_SUFFIX)
    ? selectedUri
    : selectedUri.with({ path: `${selectedUri.path}${TEMPLATE_SUFFIX}` });
  try {
    await api.workspace.fs.stat(targetUri);
    await api.window.showErrorMessage('A file already exists at the selected template path.');
    return;
  } catch {
    // A missing target is expected; other write errors are reported below.
  }

  const template = {
    format: BLUEPRINT_TEMPLATE_FORMAT,
    version: BLUEPRINT_TEMPLATE_VERSION,
    id: stem,
    revision: 1,
    name,
    description: '',
    fields: [],
    events: [],
    nodes: [],
  };
  try {
    await api.workspace.fs.createDirectory(targetUri.with({ path: path.posix.dirname(targetUri.path) }));
    const bytes = new TextEncoder().encode(`${JSON.stringify(template, null, 2)}\n`);
    await api.workspace.fs.writeFile(targetUri, bytes);
  } catch (error) {
    await api.window.showErrorMessage(error instanceof Error ? error.message : 'The blueprint template could not be created.');
    return;
  }
  await api.commands.executeCommand('vscode.openWith', targetUri, BLUEPRINT_TEMPLATE_EDITOR_VIEW_TYPE);
}
