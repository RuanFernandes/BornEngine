import * as monaco from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState } from 'react';
import { mountServerWorkspace } from '../editor/server-workspace.js';

interface ServerRulesEditorProps {
  readonly active: boolean;
  readonly tabButton: HTMLButtonElement | null;
}

export function ServerRulesEditor({ active, tabButton }: ServerRulesEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const saveStatus = useRef<HTMLSpanElement>(null);
  const [diagnostics, setDiagnostics] = useState('Loading server rules…');
  const [workspaceStatus, setWorkspaceStatus] = useState('Connecting to the local server…');

  useEffect(() => {
    const element = host.current;
    const tab = tabButton;
    const saveNode = saveStatus.current;
    if (element === null || tab === null || saveNode === null) return;

    const editor = monaco.editor.create(element, {
      model: null,
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
    const showDiagnostics = (model: monaco.editor.ITextModel): void => {
      if (model !== editor.getModel()) return;
      const errors = monaco.editor.getModelMarkers({ resource: model.uri })
        .filter((marker) => marker.severity === monaco.MarkerSeverity.Error);
      setDiagnostics(errors.length === 0
        ? 'No TypeScript errors'
        : `${errors.length} TypeScript error${errors.length === 1 ? '' : 's'} — fix before saving`);
    };
    const markerListener = monaco.editor.onDidChangeMarkers((resources) => {
      const model = editor.getModel();
      if (model !== null && resources.some((resource) => resource.toString() === model.uri.toString())) {
        showDiagnostics(model);
      }
    });
    const workspaceDisposer = mountServerWorkspace({
      editor,
      tab,
      saveStatus: saveNode,
      activate: (model) => {
        editor.setModel(model);
        showDiagnostics(model);
      },
      showDiagnostics,
      onStatus: setWorkspaceStatus,
    });

    return () => {
      workspaceDisposer();
      markerListener.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, [tabButton]);

  useEffect(() => {
    if (active) requestAnimationFrame(() => editorRef.current?.layout());
  }, [active]);

  return (
    <section className="editor-view" aria-label="Server rules editor" hidden={!active}>
      <div className="panel-heading">
        <div><p className="eyebrow">AUTHORITATIVE SERVER RULES</p><h1>Shape the rules of the world.</h1></div>
        <span className="language-badge">TypeScript</span>
      </div>
      <div className="editor-toolbar server-toolbar">
        <div id="server-script-controls" className="server-script-controls">
          <label htmlFor="server-script-select">Server file</label>
          <select id="server-script-select" aria-label="Server script file" defaultValue="rules.ts" />
          <button id="server-script-new" className="button button-secondary" type="button">New file</button>
          <button id="server-script-rename" className="button button-secondary" type="button">Rename</button>
          <button id="server-script-delete" className="button button-secondary" type="button">Delete</button>
        </div>
        <span id="server-save-status" ref={saveStatus} className="save-status" data-testid="server-save-status">Local server scripts</span>
      </div>
      <div ref={host} className="editor-host server-editor-host" data-testid="server-editor-host" />
      <div className="editor-footer">
        <div className="diagnostics" role="status" data-testid="server-diagnostics">{diagnostics}</div>
        <span className="workspace-status" data-testid="server-workspace-status">{workspaceStatus}</span>
      </div>
    </section>
  );
}
