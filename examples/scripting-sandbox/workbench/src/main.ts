import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/language/typescript/monaco.contribution';
import { ModuleKind, ScriptTarget, typescriptDefaults } from 'monaco-editor/languages/features/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { CLIENT_STARTER, createClientModel } from './editor/client-model.js';
import { ClientDraftStore, exportClientDraft, importClientDraft } from './editor/draft-store.js';
import { compileMonacoModel } from './client-script/monaco-compiler.js';
import { createPreviewBridge } from './preview/frame-bridge.js';
import type { PreviewResponse } from './preview/protocol.js';
import clientScriptApi from './types/client-script-api.d.ts?raw';
import './styles.css';

type MonacoEnvironment = typeof globalThis & {
  MonacoEnvironment: { getWorker(workerId: string, label: string): Worker };
};

(globalThis as MonacoEnvironment).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker();
    return new EditorWorker();
  },
};

typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  allowImportingTsExtensions: true,
  module: ModuleKind.ESNext,
  noEmit: true,
  target: ScriptTarget.ES2020,
  strict: true,
});
typescriptDefaults.addExtraLib(
  clientScriptApi,
  'file:///bornengine/types/client-script-api.d.ts',
);

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The scripting workbench is missing ${selector}.`);
  return element;
}

const host = requireElement<HTMLElement>('#editor-host');
const diagnostics = requireElement<HTMLElement>('#diagnostics');
const cursorPosition = requireElement<HTMLElement>('#cursor-position');
const previewStatus = requireElement<HTMLElement>('#preview-status');
const previewOverlay = requireElement<HTMLElement>('#preview-overlay');
const roomStatus = requireElement<HTMLElement>('#room-status');
const roomEndpoint = requireElement<HTMLInputElement>('#room-endpoint');
const applyButton = requireElement<HTMLButtonElement>('#apply-script');
const publishButton = requireElement<HTMLButtonElement>('#publish-script');
const importButton = requireElement<HTMLButtonElement>('#import-script');
const exportButton = requireElement<HTMLButtonElement>('#export-script');
const scriptFile = requireElement<HTMLInputElement>('#script-file');
const saveStatus = requireElement<HTMLElement>('#save-status');
const roomToggle = requireElement<HTMLButtonElement>('#room-toggle');
const frame = requireElement<HTMLIFrameElement>('#game-preview');
const clientTab = requireElement<HTMLButtonElement>('#tab-client');
const serverTab = document.querySelector<HTMLButtonElement>('#tab-server');
const serverScriptControls = document.querySelector<HTMLElement>('#server-script-controls');

const draftStore = new ClientDraftStore();
const clientModel = createClientModel(draftStore.load('client') ?? CLIENT_STARTER);
let activeModel: 'client' | 'server' = 'client';
let roomCanPublish = false;

const editor = monaco.editor.create(host, {
  model: clientModel,
  automaticLayout: true,
  minimap: { enabled: false },
  fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: 14,
  lineHeight: 22,
  tabSize: 2,
  scrollBeyondLastLine: false,
  roundedSelection: false,
  renderLineHighlight: 'gutter',
  padding: { top: 14, bottom: 18 },
  overviewRulerBorder: false,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  theme: 'vs-dark',
});

let clientValidationTimer: ReturnType<typeof setTimeout> | null = null;
let clientValidationGeneration = 0;

function showDiagnostics(model: monaco.editor.ITextModel): void {
  if (model !== editor.getModel()) return;

  if (activeModel === 'client' && model === clientModel) {
    if (clientValidationTimer !== null) clearTimeout(clientValidationTimer);
    const generation = ++clientValidationGeneration;
    const modelVersion = model.getVersionId();
    diagnostics.textContent = 'Checking TypeScript…';
    diagnostics.classList.remove('has-errors');
    applyButton.disabled = true;
    publishButton.disabled = true;
    clientValidationTimer = setTimeout(() => {
      clientValidationTimer = null;
      void compileMonacoModel(model).then((result) => {
        if (generation !== clientValidationGeneration || model !== editor.getModel() ||
            modelVersion !== model.getVersionId() || activeModel !== 'client') return;
        const errors = result.ok ? [] : result.diagnostics;
        diagnostics.textContent = errors.length === 0
          ? 'No TypeScript errors'
          : `${errors.length} TypeScript error${errors.length === 1 ? '' : 's'} — fix before applying`;
        diagnostics.classList.toggle('has-errors', errors.length > 0);
        applyButton.disabled = errors.length > 0;
        publishButton.disabled = !roomCanPublish || errors.length > 0;
      }).catch((error: unknown) => {
        if (generation !== clientValidationGeneration || model !== editor.getModel() ||
            modelVersion !== model.getVersionId() || activeModel !== 'client') return;
        diagnostics.textContent = error instanceof Error ? error.message : `TypeScript validation failed: ${String(error)}`;
        diagnostics.classList.add('has-errors');
        applyButton.disabled = true;
        publishButton.disabled = true;
      });
    }, 120);
    return;
  }

  clientValidationGeneration++;
  if (clientValidationTimer !== null) {
    clearTimeout(clientValidationTimer);
    clientValidationTimer = null;
  }
  const errors = monaco.editor.getModelMarkers({ resource: model.uri })
    .filter((marker) => marker.severity === monaco.MarkerSeverity.Error);
  diagnostics.textContent = errors.length === 0
    ? 'No TypeScript errors'
    : `${errors.length} TypeScript error${errors.length === 1 ? '' : 's'} — fix before saving`;
  diagnostics.classList.toggle('has-errors', errors.length > 0);
  applyButton.disabled = activeModel !== 'client' || errors.length > 0;
  publishButton.disabled = activeModel !== 'client' || !roomCanPublish || errors.length > 0;
}

monaco.editor.onDidChangeMarkers((resources) => {
  const model = editor.getModel();
  if (model && resources.some((resource) => resource.toString() === model.uri.toString())) showDiagnostics(model);
});

editor.onDidChangeModelDecorations(() => {
  const model = editor.getModel();
  if (model) showDiagnostics(model);
});

editor.onDidChangeCursorPosition(({ position }) => {
  cursorPosition.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
});

function activateModel(kind: 'client' | 'server', model: monaco.editor.ITextModel): void {
  activeModel = kind;
  editor.setModel(model);
  clientTab.classList.toggle('active', kind === 'client');
  clientTab.setAttribute('aria-selected', String(kind === 'client'));
  serverTab?.classList.toggle('active', kind === 'server');
  serverTab?.setAttribute('aria-selected', String(kind === 'server'));
  applyButton.disabled = kind !== 'client';
  publishButton.disabled = kind !== 'client' || !roomCanPublish;
  importButton.disabled = kind !== 'client';
  exportButton.disabled = kind !== 'client';
  if (serverScriptControls) serverScriptControls.hidden = kind !== 'server';
  showDiagnostics(model);
}

clientTab.addEventListener('click', () => activateModel('client', clientModel));

let saveDraftTimer: ReturnType<typeof setTimeout> | null = null;
editor.onDidChangeModelContent(() => {
  const model = editor.getModel();
  if (model !== clientModel) return;
  if (saveDraftTimer !== null) clearTimeout(saveDraftTimer);
  saveStatus.textContent = 'Saving draft…';
  saveDraftTimer = setTimeout(() => {
    saveStatus.textContent = draftStore.save('client', clientModel.getValue()) ? 'Draft saved' : 'Draft not saved';
    saveDraftTimer = null;
  }, 250);
});

exportButton.addEventListener('click', () => {
  try {
    const contents = exportClientDraft(clientModel.getValue());
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bornengine-client-script.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (error) {
    saveStatus.textContent = error instanceof Error ? error.message : 'Unable to export this script.';
  }
});

importButton.addEventListener('click', () => scriptFile.click());
scriptFile.addEventListener('change', async () => {
  const file = scriptFile.files?.[0];
  scriptFile.value = '';
  if (file === undefined) return;
  if (file.size > 68 * 1024) {
    saveStatus.textContent = 'Import file exceeds the 64 KiB script limit';
    return;
  }
  let contents: string;
  try {
    contents = await file.text();
  } catch (_error) {
    saveStatus.textContent = 'Unable to read this file';
    return;
  }
  const imported = importClientDraft(contents);
  if (!imported.ok) {
    saveStatus.textContent = imported.error;
    return;
  }
  activateModel('client', clientModel);
  clientModel.setValue(imported.source);
  draftStore.save('client', imported.source);
  saveStatus.textContent = 'Draft imported';
});

const bridge = createPreviewBridge(frame, window.location.origin, window, (response: PreviewResponse) => {
  if (response.type === 'preview:ready') {
    previewStatus.textContent = 'Preview ready';
    previewOverlay.hidden = true;
    return;
  }
  if (response.type === 'preview:status') {
    previewStatus.textContent = response.message || response.status;
    if (response.status === 'connected') roomStatus.textContent = 'Room connected';
    if (response.status === 'disconnected') {
      roomStatus.textContent = 'Room disconnected';
      roomCanPublish = false;
      publishButton.disabled = true;
    }
    if (response.status === 'error') {
      roomStatus.textContent = response.message || 'Room error';
      roomCanPublish = false;
      publishButton.disabled = true;
    }
    return;
  }
  if (response.type === 'preview:publisher') {
    roomCanPublish = response.canPublish;
    publishButton.disabled = activeModel !== 'client' || !roomCanPublish;
    roomStatus.textContent = roomCanPublish ? 'You are publishing' : 'Room connected';
    return;
  }
  if (response.type === 'preview:script-result') {
    if (response.result === 'rejected') {
      diagnostics.textContent = response.error || 'The preview rejected the script.';
      diagnostics.classList.add('has-errors');
    } else {
      diagnostics.textContent = response.result === 'published' ? 'Script shared with the room' : 'Script running locally';
      diagnostics.classList.remove('has-errors');
    }
  }
});

let scriptRevision = 0;
applyButton.addEventListener('click', async () => {
  const model = editor.getModel();
  if (!model || activeModel !== 'client') return;
  const modelVersion = model.getVersionId();
  applyButton.disabled = true;
  diagnostics.textContent = 'Checking and compiling…';
  const compilation = await compileMonacoModel(model);
  if (model !== editor.getModel() || modelVersion !== model.getVersionId()) {
    showDiagnostics(editor.getModel() || clientModel);
    return;
  }
  if (!compilation.ok) {
    diagnostics.textContent = compilation.diagnostics.join('\n');
    diagnostics.classList.add('has-errors');
    applyButton.disabled = true;
    return;
  }
  scriptRevision += 1;
  bridge.send({ type: 'preview:apply-client-script', revision: scriptRevision, javascript: compilation.javascript });
  showDiagnostics(model);
});

let publishRevision = 0;
publishButton.addEventListener('click', async () => {
  const model = editor.getModel();
  if (!model || activeModel !== 'client' || !roomCanPublish) return;
  const modelVersion = model.getVersionId();
  publishButton.disabled = true;
  const compilation = await compileMonacoModel(model);
  if (model !== editor.getModel() || modelVersion !== model.getVersionId()) {
    publishButton.disabled = activeModel !== 'client' || !roomCanPublish;
    return;
  }
  if (!compilation.ok) {
    diagnostics.textContent = compilation.diagnostics.join('\n');
    diagnostics.classList.add('has-errors');
    return;
  }
  publishRevision += 1;
  const sent = bridge.send({
    type: 'preview:publish-client-script',
    revision: publishRevision,
    source: model.getValue(),
  });
  if (!sent) publishButton.disabled = activeModel !== 'client' || !roomCanPublish;
});

roomToggle.addEventListener('click', () => {
  const connected = roomToggle.dataset.connected === 'true';
  if (connected) {
    bridge.send({ type: 'preview:disconnect-room' });
    roomToggle.dataset.connected = 'false';
    roomToggle.textContent = 'Connect';
    roomStatus.textContent = 'Room disconnected';
    return;
  }
  bridge.send({
    type: 'preview:connect-room',
    endpoint: roomEndpoint.value.trim(),
    roomName: 'sandbox',
  });
  roomToggle.dataset.connected = 'true';
  roomToggle.textContent = 'Disconnect';
  roomStatus.textContent = 'Connecting…';
});

frame.addEventListener('load', () => {
  previewOverlay.hidden = false;
  previewStatus.textContent = 'Waiting for game runtime…';
});
window.addEventListener('beforeunload', () => {
  bridge.dispose();
  editor.dispose();
  clientModel.dispose();
});

showDiagnostics(clientModel);

if (import.meta.env.DEV && serverTab !== null && serverScriptControls !== null) {
  void import('./editor/server-workspace.js').then(({ mountServerWorkspace }) => {
    mountServerWorkspace({
      editor,
      tab: serverTab,
      saveStatus,
      activate: (model) => activateModel('server', model),
      showDiagnostics,
    });
  });
}
