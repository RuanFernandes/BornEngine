import { useEffect, useRef, useState } from 'react';
import { ClientScriptEditor } from './components/ClientScriptEditor.js';
import { SandboxDocs } from './components/SandboxDocs.js';
import { ServerRulesEditor } from './components/ServerRulesEditor.js';
import { ScriptingManagerConnection, type ScriptingManagerStatus } from './scripting-manager/connection.js';
import { createPreviewBridge } from './preview/frame-bridge.js';
import type { PreviewResponse } from './preview/protocol.js';

type WorkspaceTab = 'client' | 'server' | 'docs';

const initialManagerStatus: ScriptingManagerStatus = {
  state: 'disconnected',
  revision: -1,
  message: 'Room disconnected',
};

function defaultEndpoint(): string {
  return import.meta.env.VITE_SANDBOX_GAME_ENDPOINT ?? 'ws://127.0.0.1:2568';
}

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('client');
  const [managerStatus, setManagerStatus] = useState(initialManagerStatus);
  const [endpoint, setEndpoint] = useState(defaultEndpoint());
  const [previewStatus, setPreviewStatus] = useState('Starting preview…');
  const [previewMessage, setPreviewMessage] = useState('Room disconnected');
  const [previewError, setPreviewError] = useState('');
  const [previewNotice, setPreviewNotice] = useState('');
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [serverTabButton, setServerTabButton] = useState<HTMLButtonElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const managerRef = useRef<ScriptingManagerConnection | null>(null);
  const scriptRevisionRef = useRef(0);
  const bridgeRef = useRef<ReturnType<typeof createPreviewBridge> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewReadyRef = useRef(false);

  if (managerRef.current === null) managerRef.current = new ScriptingManagerConnection();
  const manager = managerRef.current;

  useEffect(() => {
    const unsubscribe = manager.onStatus(setManagerStatus);
    const frame = frameRef.current;
    if (frame !== null) {
      const bridge = createPreviewBridge(frame, window.location.origin, window, (response: PreviewResponse) => {
        if (response.type === 'preview:ready') {
          previewReadyRef.current = true;
          if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
          previewTimerRef.current = null;
          setPreviewStatus('Preview ready');
          setPreviewNotice('');
          setOverlayVisible(false);
        } else if (response.type === 'preview:status') {
          setPreviewStatus(response.message || response.status);
          if (response.status === 'connected') setPreviewMessage('Game client connected');
          if (response.status === 'disconnected') setPreviewMessage('Room disconnected');
          if (response.status === 'error') setPreviewError(response.message || 'Game client connection failed.');
        } else if (response.type === 'preview:script-result') {
          setPreviewError(response.result === 'rejected' ? response.error || 'The preview rejected the script.' : '');
        }
      });
      bridgeRef.current = bridge;
      const handleFrameLoad = (): void => {
        previewReadyRef.current = false;
        if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
        setOverlayVisible(true);
        setPreviewStatus('Waiting for game runtime…');
        setPreviewNotice('');
        previewTimerRef.current = setTimeout(() => {
          previewTimerRef.current = null;
          if (previewReadyRef.current) return;
          setPreviewStatus('Browser preview unavailable · native client supported');
          setPreviewNotice('The browser game runtime did not start. You can still edit and publish scripts here, then run the native client for gameplay.');
          setOverlayVisible(false);
        }, 8_000);
      };
      frame.addEventListener('load', handleFrameLoad);
      return () => {
        frame.removeEventListener('load', handleFrameLoad);
        if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
        bridge.dispose();
        bridgeRef.current = null;
        unsubscribe();
        manager.dispose();
      };
    }
    return () => {
      unsubscribe();
      manager.dispose();
    };
  }, [manager]);

  const isConnected = managerStatus.state !== 'disconnected' && managerStatus.state !== 'error';
  const serverRulesEnabled = import.meta.env.DEV;

  async function connectToRooms(): Promise<void> {
    setPreviewError('');
    await manager.connect(endpoint);
    if (manager.status.state === 'error') return;
    bridgeRef.current?.send({ type: 'preview:connect-room', endpoint: endpoint.trim(), roomName: 'sandbox' });
  }

  function disconnectFromRooms(): void {
    manager.dispose();
    bridgeRef.current?.send({ type: 'preview:disconnect-room' });
    setPreviewMessage('Room disconnected');
  }

  function applyLocally(javascript: string): void {
    const revision = ++scriptRevisionRef.current;
    const sent = bridgeRef.current?.send({ type: 'preview:apply-client-script', revision, javascript }) ?? false;
    if (!sent) setPreviewError('The local preview is not ready to receive scripts.');
  }

  return (
    <div className="app-shell" data-testid="workbench-app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="BornEngine Scripting Manager home">
          <span className="brand-mark">B</span><span>BornEngine <strong>Scripting Manager</strong></span>
        </a>
        <div className="topbar-status"><span className="status-dot" /><span id="preview-status">{previewStatus}</span></div>
        <a className="topbar-link" href="https://github.com/RuanFernandes/BornEngine" target="_blank" rel="noreferrer">Engine docs ↗</a>
      </header>

      <main className="workspace">
        <section className="editor-panel" aria-label="Script workspace">
          <nav className="workspace-tabs" role="tablist" aria-label="Workspace sections">
            <button className={`workspace-tab${activeTab === 'client' ? ' active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'client'} onClick={() => setActiveTab('client')}>Client script</button>
            {serverRulesEnabled && <button ref={setServerTabButton} className={`workspace-tab${activeTab === 'server' ? ' active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'server'} onClick={() => setActiveTab('server')}>Server rules</button>}
            <button className={`workspace-tab${activeTab === 'docs' ? ' active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'docs'} onClick={() => setActiveTab('docs')}>Sandbox docs</button>
          </nav>

          <ClientScriptEditor
            active={activeTab === 'client'}
            canShare={manager.canPublish}
            onApply={applyLocally}
            onShare={(source) => manager.publish(source)}
          />
          {serverRulesEnabled && <ServerRulesEditor active={activeTab === 'server'} tabButton={serverTabButton} />}
          <SandboxDocs active={activeTab === 'docs'} />
        </section>

        <section className="preview-panel" aria-label="Game preview">
          <div className="preview-heading">
            <div className="preview-title-group">
              <span className="live-indicator"><span /> LIVE GAME</span>
              <h2>Your game</h2>
            </div>
            <div className="room-controls">
              <label className="room-label" htmlFor="room-endpoint">Room</label>
              <input id="room-endpoint" aria-label="Colyseus server endpoint" value={endpoint} onChange={(event) => setEndpoint(event.currentTarget.value)} />
              <button id="room-toggle" className="button button-secondary" type="button" onClick={() => void (isConnected ? disconnectFromRooms() : connectToRooms())}>
                {isConnected ? 'Disconnect' : 'Connect to room'}
              </button>
            </div>
          </div>
          <div className="game-frame-wrap" data-testid="preview-pane">
            <iframe ref={frameRef} id="game-preview" title="BornEngine game preview" src="/preview/index.html" />
            <div id="preview-overlay" className="preview-overlay" hidden={!overlayVisible}>
              <span className="spinner" /><p>Starting the BornEngine runtime…</p>
            </div>
          </div>
          <div className="preview-footer">
            <span>Preview runs in its own game process</span>
            <span id="room-status" data-testid="room-status">{previewMessage}</span>
          </div>
          <div className="manager-status-row" aria-live="polite">
            <span className={`manager-state manager-state-${managerStatus.state}`} />
            <span data-testid="manager-status">{managerStatus.message}</span>
          </div>
          {previewError.length > 0 && <p className="preview-error" role="status">{previewError}</p>}
          {previewNotice.length > 0 && <p className="preview-notice" role="status">{previewNotice}</p>}
        </section>
      </main>

      <footer className="app-footer">
        <span>BornEngine · multiplayer scripting workspace</span>
        <span>Client scripts run in an isolated QuickJS runtime</span>
      </footer>
    </div>
  );
}
