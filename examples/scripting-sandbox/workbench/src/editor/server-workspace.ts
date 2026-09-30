import * as monaco from 'monaco-editor/editor/editor.api';
import { typescriptDefaults } from 'monaco-editor/languages/features/typescript/register';
import { SERVER_STARTER, createServerModel } from './server-model.js';
import serverRuleApi from '../types/server-rule-api.d.ts?raw';

typescriptDefaults.addExtraLib(serverRuleApi, 'file:///bornengine/types/server-rule-api.d.ts');

interface ServerScriptFile {
  readonly name: string;
  readonly source: string;
}

interface ServerReloadStatus {
  readonly state: 'ready' | 'pending' | 'error';
  readonly revision: number;
  readonly diagnostic?: string;
  readonly updatedAt: string;
}

export interface ServerWorkspaceOptions {
  readonly editor: monaco.editor.IStandaloneCodeEditor;
  readonly tab: HTMLButtonElement;
  readonly saveStatus: HTMLElement;
  readonly activate: (model: monaco.editor.ITextModel) => void;
  readonly showDiagnostics: (model: monaco.editor.ITextModel) => void;
}

async function serverApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/__dev/server-scripts${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json() as unknown;
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error
      : `Server script request failed (${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}

function fileUri(name: string): string {
  return encodeURIComponent(name);
}

function modelFilename(model: monaco.editor.ITextModel): string | null {
  const marker = 'inmemory://bornengine/server/';
  if (!model.uri.toString().startsWith(marker)) return null;
  try {
    return decodeURIComponent(model.uri.path.slice('/server/'.length));
  } catch (_error) {
    return null;
  }
}

export function mountServerWorkspace(options: ServerWorkspaceOptions): void {
  const { editor, tab, saveStatus, activate, showDiagnostics } = options;
  const select = document.querySelector<HTMLSelectElement>('#server-script-select');
  const newButton = document.querySelector<HTMLButtonElement>('#server-script-new');
  const renameButton = document.querySelector<HTMLButtonElement>('#server-script-rename');
  const deleteButton = document.querySelector<HTMLButtonElement>('#server-script-delete');
  if (!select || !newButton || !renameButton || !deleteButton) return;
  const scriptSelect = select;

  const models = new Map<string, monaco.editor.ITextModel>();
  const fallback = createServerModel('rules.ts', SERVER_STARTER);
  models.set('rules.ts', fallback);
  let activeFile = 'rules.ts';
  let available = false;
  let suppressSave = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveSequence = 0;

  const currentModel = (): monaco.editor.ITextModel => models.get(activeFile) ?? fallback;
  const updateControls = (): void => {
    scriptSelect.disabled = !available;
    newButton.disabled = !available;
    renameButton.disabled = !available || activeFile === 'rules.ts';
    deleteButton.disabled = !available || activeFile === 'rules.ts';
  };
  const activateFile = (name: string): void => {
    if (!models.has(name)) return;
    activeFile = name;
    scriptSelect.value = name;
    activate(currentModel());
    updateControls();
    showDiagnostics(currentModel());
  };

  async function waitForReload(previousUpdatedAt: string, model: monaco.editor.ITextModel, version: number, sequence: number): Promise<void> {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && model.getVersionId() === version && sequence === saveSequence) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const status = await serverApi<ServerReloadStatus>('/status');
      if (status.updatedAt === previousUpdatedAt || status.state === 'pending') continue;
      if (status.state === 'error') throw new Error(status.diagnostic ?? 'The previous server rules are still active.');
      if (status.state === 'ready') {
        saveStatus.textContent = `Applied · revision ${status.revision}`;
        return;
      }
    }
    if (model.getVersionId() === version && sequence === saveSequence) {
      saveStatus.textContent = 'Saved · waiting for server reload';
    }
  }

  async function saveFile(name: string, model: monaco.editor.ITextModel): Promise<void> {
    const version = model.getVersionId();
    const sequence = ++saveSequence;
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    if (markers.some((marker) => marker.severity === monaco.MarkerSeverity.Error)) {
      saveStatus.textContent = 'Fix TypeScript errors before saving';
      return;
    }
    try {
      const previous = await serverApi<ServerReloadStatus>('/status');
      await serverApi(`/${fileUri(name)}`, 'PUT', { source: model.getValue() });
      if (model.getVersionId() !== version || sequence !== saveSequence) return;
      saveStatus.textContent = 'Saved · applying server rules…';
      await waitForReload(previous.updatedAt, model, version, sequence);
    } catch (error) {
      if (model.getVersionId() === version && sequence === saveSequence) {
        saveStatus.textContent = error instanceof Error ? error.message : 'Server script was not applied';
      }
    }
  }

  async function loadFiles(): Promise<void> {
    try {
      const result = await serverApi<{ files: ServerScriptFile[] }>('');
      if (!Array.isArray(result.files)) throw new Error('The local server returned an invalid script list.');
      available = true;
      for (const file of result.files) {
        const existing = models.get(file.name);
        if (existing === undefined) models.set(file.name, createServerModel(file.name, file.source));
        else {
          suppressSave = true;
          existing.setValue(file.source);
          suppressSave = false;
        }
      }
      scriptSelect.replaceChildren(...result.files.map((file) => {
        const option = document.createElement('option');
        option.value = file.name;
        option.textContent = file.name;
        return option;
      }));
      if (!models.has('rules.ts')) {
        const option = document.createElement('option');
        option.value = 'rules.ts';
        option.textContent = 'rules.ts';
        scriptSelect.prepend(option);
      }
      if (!models.has(activeFile)) activeFile = 'rules.ts';
      scriptSelect.value = activeFile;
      updateControls();
      showDiagnostics(currentModel());
    } catch (error) {
      available = false;
      updateControls();
      saveStatus.textContent = error instanceof Error ? 'Local server editor unavailable' : 'Server scripts unavailable';
    }
  }

  tab.addEventListener('click', () => activate(currentModel()));
  scriptSelect.addEventListener('change', () => activateFile(scriptSelect.value));
  editor.onDidChangeModelContent(() => {
    const model = editor.getModel();
    const name = model === null ? null : modelFilename(model);
    if (model === null || name === null || name !== activeFile || suppressSave || !available) return;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveStatus.textContent = 'Saving server script…';
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveFile(name, model);
    }, 500);
  });

  newButton.addEventListener('click', async () => {
    const enteredName = window.prompt('New server TypeScript file name', 'helpers.ts');
    if (enteredName === null) return;
    const name = enteredName.endsWith('.ts') ? enteredName : `${enteredName}.ts`;
    const source = name === 'rules.ts' ? SERVER_STARTER : 'export const exampleValue = 1;\n';
    try {
      await serverApi('', 'POST', { name, source });
      const model = createServerModel(name, source);
      models.set(name, model);
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      scriptSelect.append(option);
      activateFile(name);
      saveStatus.textContent = `Created ${name}`;
    } catch (error) {
      saveStatus.textContent = error instanceof Error ? error.message : 'Unable to create server script.';
    }
  });

  renameButton.addEventListener('click', async () => {
    const enteredName = window.prompt('Rename server file', activeFile);
    if (enteredName === null) return;
    const name = enteredName.endsWith('.ts') ? enteredName : `${enteredName}.ts`;
    try {
      await serverApi(`/${fileUri(activeFile)}`, 'PATCH', { name });
      const oldName = activeFile;
      const oldModel = models.get(oldName);
      const source = oldModel?.getValue() ?? '';
      oldModel?.dispose();
      models.delete(oldName);
      models.set(name, createServerModel(name, source));
      const option = [...scriptSelect.options].find((entry) => entry.value === oldName);
      if (option) { option.value = name; option.textContent = name; }
      activateFile(name);
      saveStatus.textContent = `Renamed to ${name}`;
    } catch (error) {
      saveStatus.textContent = error instanceof Error ? error.message : 'Unable to rename server script.';
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Delete ${activeFile}?`)) return;
    const deletedName = activeFile;
    try {
      await serverApi(`/${fileUri(deletedName)}`, 'DELETE');
      models.get(deletedName)?.dispose();
      models.delete(deletedName);
      scriptSelect.querySelector(`option[value="${CSS.escape(deletedName)}"]`)?.remove();
      activateFile('rules.ts');
      saveStatus.textContent = `Deleted ${deletedName}`;
    } catch (error) {
      saveStatus.textContent = error instanceof Error ? error.message : 'Unable to delete server script.';
    }
  });

  window.addEventListener('beforeunload', () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    for (const model of models.values()) model.dispose();
  });
  void loadFiles();
}
