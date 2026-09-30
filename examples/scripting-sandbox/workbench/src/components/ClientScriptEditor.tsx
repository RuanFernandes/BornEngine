import * as monaco from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState } from 'react';
import { compileMonacoModel } from '../client-script/monaco-compiler.js';
import { CLIENT_STARTER, createClientModel } from '../editor/client-model.js';
import { ClientDraftStore, exportClientDraft, importClientDraft } from '../editor/draft-store.js';

const drafts = new ClientDraftStore();

interface ClientScriptEditorProps {
  readonly active: boolean;
  readonly canShare: boolean;
  readonly onApply: (javascript: string) => void;
  readonly onShare: (source: string) => void;
}

export function ClientScriptEditor({ active, canShare, onApply, onShare }: ClientScriptEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const [diagnostics, setDiagnostics] = useState('Checking the script…');
  const [hasErrors, setHasErrors] = useState(false);
  const [cursor, setCursor] = useState('Ln 1, Col 1');
  const [saveStatus, setSaveStatus] = useState('Local draft');
  const [busy, setBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const model = createClientModel(drafts.load('client') ?? CLIENT_STARTER);
    const editor = monaco.editor.create(element, {
      model,
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
    editorRef.current = editor;
    modelRef.current = model;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let draftTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let disposed = false;

    const validate = (): void => {
      if (timer !== null) clearTimeout(timer);
      const currentGeneration = ++generation;
      const version = model.getVersionId();
      setDiagnostics('Checking TypeScript…');
      setHasErrors(false);
      timer = setTimeout(() => {
        timer = null;
        void compileMonacoModel(model).then((result) => {
          if (disposed || generation !== currentGeneration || model.getVersionId() !== version) return;
          setHasErrors(!result.ok);
          setDiagnostics(result.ok ? 'No TypeScript errors' : result.diagnostics.join('\n'));
        }).catch((error: unknown) => {
          if (disposed || generation !== currentGeneration || model.getVersionId() !== version) return;
          setHasErrors(true);
          setDiagnostics(error instanceof Error ? error.message : 'TypeScript validation failed.');
        });
      }, 120);
    };

    const contentSubscription = editor.onDidChangeModelContent(() => {
      if (draftTimer !== null) clearTimeout(draftTimer);
      setSaveStatus('Saving draft…');
      draftTimer = setTimeout(() => {
        draftTimer = null;
        setSaveStatus(drafts.save('client', model.getValue()) ? 'Draft saved' : 'Draft not saved');
      }, 250);
      validate();
    });
    const cursorSubscription = editor.onDidChangeCursorPosition(({ position }) => {
      setCursor(`Ln ${position.lineNumber}, Col ${position.column}`);
    });
    validate();
    return () => {
      disposed = true;
      generation++;
      if (timer !== null) clearTimeout(timer);
      if (draftTimer !== null) clearTimeout(draftTimer);
      contentSubscription.dispose();
      cursorSubscription.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active) requestAnimationFrame(() => editorRef.current?.layout());
  }, [active]);

  async function compileCurrent(): Promise<{ javascript: string; source: string } | null> {
    const model = modelRef.current;
    if (model === null) return null;
    setBusy(true);
    try {
      const version = model.getVersionId();
      const result = await compileMonacoModel(model);
      if (version !== model.getVersionId()) {
        setDiagnostics('The script changed during validation. Try again.');
        setHasErrors(true);
        return null;
      }
      if (!result.ok) {
        setDiagnostics(result.diagnostics.join('\n'));
        setHasErrors(true);
        return null;
      }
      setDiagnostics('No TypeScript errors');
      setHasErrors(false);
      return { javascript: result.javascript, source: model.getValue() };
    } catch (error) {
      setDiagnostics(error instanceof Error ? error.message : 'TypeScript validation failed.');
      setHasErrors(true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runLocally(): Promise<void> {
    const result = await compileCurrent();
    if (result !== null) onApply(result.javascript);
  }

  async function shareScript(): Promise<void> {
    const result = await compileCurrent();
    if (result !== null) onShare(result.source);
  }

  function exportDraft(): void {
    const model = modelRef.current;
    if (model === null) return;
    try {
      const url = URL.createObjectURL(new Blob([exportClientDraft(model.getValue())], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bornengine-client-script.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setSaveStatus('Draft exported');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Unable to export this script.');
    }
  }

  async function importDraft(file: File | undefined): Promise<void> {
    setFileInputKey((value) => value + 1);
    if (file === undefined) return;
    if (file.size > 68 * 1024) {
      setSaveStatus('Import file exceeds the 64 KiB script limit');
      return;
    }
    try {
      const imported = importClientDraft(await file.text());
      if (!imported.ok) {
        setSaveStatus(imported.error);
        return;
      }
      modelRef.current?.setValue(imported.source);
      drafts.save('client', imported.source);
      setSaveStatus('Draft imported');
    } catch (_error) {
      setSaveStatus('Unable to read this file');
    }
  }

  return (
    <section className="editor-view" aria-label="Client script editor" hidden={!active}>
      <div className="panel-heading">
        <div><p className="eyebrow">CLIENT SCRIPT</p><h1>Shape the game with code.</h1></div>
        <span className="language-badge">TypeScript</span>
      </div>
      <div className="editor-toolbar">
        <span className="view-caption">Runs in the isolated game client</span>
        <div className="editor-actions">
          <span id="client-save-status" className="save-status">{saveStatus}</span>
          <label className="button button-secondary file-button" htmlFor="script-file">Import</label>
          <input key={fileInputKey} id="script-file" className="visually-hidden" type="file" accept=".ts,.txt,.json,text/plain,application/json" onChange={(event) => void importDraft(event.currentTarget.files?.[0])} />
          <button id="export-script" className="button button-secondary" type="button" onClick={exportDraft}>Export</button>
          <button id="apply-script" className="button button-primary" type="button" disabled={hasErrors || busy} onClick={() => void runLocally()}>Run</button>
          <button id="publish-script" className="button button-secondary" type="button" disabled={!canShare || hasErrors || busy} title="Validate and publish this script to every connected client" onClick={() => void shareScript()}>Share script</button>
        </div>
      </div>
      <div ref={host} id="editor-host" className="editor-host" data-testid="editor-host" />
      <div className="editor-footer">
        <div id="diagnostics" className={`diagnostics${hasErrors ? ' has-errors' : ''}`} role="status" data-testid="diagnostics">{diagnostics}</div>
        <span id="cursor-position" className="cursor-position">{cursor}</span>
      </div>
    </section>
  );
}
