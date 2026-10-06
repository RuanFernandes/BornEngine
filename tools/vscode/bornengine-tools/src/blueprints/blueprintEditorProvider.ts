import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import {
  BLUEPRINT_FORMAT,
  BLUEPRINT_VERSION,
  type BlueprintDiagnostic,
} from './blueprintSchema';
import { readBlueprint } from './blueprintJson';
import { validateBlueprint } from './blueprintSchema';
import { buildBlueprintEditorHtml } from './blueprintEditorHtml';
import { findBornEngineProjectRoot, resolveBlueprintTemplate } from './blueprintWorkspace';
import { BLUEPRINT_EDITOR_VIEW_TYPE } from '../shared/extensionIds';

type VsCodeApi = typeof vscode;
type HostMessage = { type: string; editId?: unknown; revision?: unknown; blueprint?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
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
  result.source = 'BornEngine Blueprint';
  return result;
}

function isSupportedBlueprint(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.format === BLUEPRINT_FORMAT && value.version === BLUEPRINT_VERSION;
}

function mergeDiagnostics(...groups: readonly BlueprintDiagnostic[][]): BlueprintDiagnostic[] {
  const result: BlueprintDiagnostic[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.path}\0${item.code}\0${item.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/** Provides a VS Code custom editor for blueprint form and execution graph documents. */
export class BlueprintTextEditorProvider implements vscode.CustomTextEditorProvider {
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
    const root = await findBornEngineProjectRoot(this.api, document.uri);
    const distUri = this.api.Uri.joinPath(this.context.extensionUri, 'dist');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [distUri, ...(root ? [root.uri] : [])],
    };
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(distUri, 'blueprintEditor.js'));
    const styleUri = panel.webview.asWebviewUri(this.api.Uri.joinPath(distUri, 'blueprintEditor.css'));
    panel.webview.html = buildBlueprintEditorHtml(panel.webview, scriptUri, styleUri, nonce);

    let ready = false;
    let revision = 0;
    let applyingEditorText: string | null = null;
    let applyingEditorEdit = false;
    let editQueue = Promise.resolve();

    const currentState = async () => {
      const sourceText = document.getText();
      const parsed = readBlueprint(sourceText, null);
      const resolution = await resolveBlueprintTemplate(sourceText, document.uri, this.api, workspaceFolders);
      const resolved = readBlueprint(sourceText, resolution.template);
      const diagnostics = mergeDiagnostics(resolution.diagnostics, resolved.diagnostics);
      const blueprint = isSupportedBlueprint(parsed.value) ? parsed.value : null;
      const template = resolution.template;
      const editable = blueprint !== null && template !== null;
      if (!editable && diagnostics.length === 0) {
        diagnostics.push({ path: '$', code: 'document.invalid', message: 'This blueprint cannot be edited visually until its format and template are valid.' });
      }
      return { sourceText, blueprint, template, editable, diagnostics };
    };

    const sendCurrentDocument = async (acknowledgedEditId?: number): Promise<void> => {
      if (!ready) return;
      const state = await currentState();
      this.diagnostics.set(document.uri, state.diagnostics.map((item) => toVsCodeDiagnostic(item, this.api)));
      await panel.webview.postMessage({
        type: 'document',
        blueprint: state.blueprint,
        template: state.template,
        editable: state.editable,
        sourceText: state.sourceText,
        diagnostics: diagnosticText(state.diagnostics),
        dirty: document.isDirty,
        title: state.blueprint?.name ?? 'Blueprint',
        revision,
        ...(acknowledgedEditId === undefined ? {} : { acknowledgedEditId }),
      });
    };

    const showError = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : 'The blueprint edit could not be applied.';
      await panel.webview.postMessage({ type: 'error', message });
    };

    const applyDocument = async (input: unknown, editId: number, editRevision: number): Promise<void> => {
      if (editRevision !== revision) {
        throw new Error('The blueprint changed in the text editor. The visual edit was discarded; review the latest document and try again.');
      }
      if (!isSupportedBlueprint(input)) throw new Error('The editor can only update a supported blueprint document.');
      const current = await currentState();
      if (!current.editable || !current.template) {
        throw new Error('This blueprint or its template is unavailable. Fix the JSON or template before editing visually.');
      }
      if (!isRecord(input.template)
          || input.template.id !== current.template.id
          || input.template.revision !== current.template.revision) {
        throw new Error('A blueprint visual edit cannot change the referenced template.');
      }

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
      if (!applied) throw new Error('VS Code did not apply the blueprint document edit.');
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
      if (hostMessage.type === 'open-as-text') {
        return this.api.commands.executeCommand('vscode.openWith', document.uri, 'default');
      }
      if (hostMessage.type !== 'edit') return;
      if (typeof hostMessage.editId !== 'number' || !Number.isSafeInteger(hostMessage.editId) || hostMessage.editId < 1
          || typeof hostMessage.revision !== 'number' || !Number.isSafeInteger(hostMessage.revision) || hostMessage.revision < 0) {
        editQueue = editQueue.then(async () => {
          await showError(new Error('The blueprint edit is missing its document revision.'));
          await sendCurrentDocument();
        });
        return editQueue;
      }
      editQueue = editQueue.then(async () => {
        try {
          await applyDocument(hostMessage.blueprint, hostMessage.editId as number, hostMessage.revision as number);
        } catch (error) {
          await showError(error);
          await sendCurrentDocument(hostMessage.editId as number);
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
      this.diagnostics.delete(document.uri);
    });
  }
}
