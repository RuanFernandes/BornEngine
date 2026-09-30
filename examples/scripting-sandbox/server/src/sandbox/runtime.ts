import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActiveRuleRoom } from './server-rule-contract.js';
import { RulesManager } from './rules-manager.js';
import { DevScriptApi } from './dev-script-api.js';

const activeRooms = new Set<ActiveRuleRoom>();
const scriptsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts');

export const rulesManager = new RulesManager({
  scriptsDirectory,
  activeRooms: () => [...activeRooms],
});

export interface ServerRulesReloadStatus {
  readonly state: 'ready' | 'pending' | 'error';
  readonly revision: number;
  readonly diagnostic?: string;
  readonly updatedAt: string;
}

let reloadStatus: ServerRulesReloadStatus = {
  state: 'ready',
  revision: 0,
  updatedAt: new Date().toISOString(),
};

export function registerRuleRoom(room: ActiveRuleRoom): void {
  activeRooms.add(room);
  room.replaceRules(rulesManager.createRulesForNewRoom(room));
}

export function unregisterRuleRoom(room: ActiveRuleRoom): void {
  activeRooms.delete(room);
}

export function activeRuleRoomCount(): number {
  return activeRooms.size;
}

export function getServerRulesReloadStatus(): ServerRulesReloadStatus {
  return reloadStatus;
}

export function shouldEnableSandboxDevRuntime(environment: {
  readonly NODE_ENV?: string;
  readonly BORNENGINE_SANDBOX_DEV?: string;
}): boolean {
  return environment.NODE_ENV !== 'production' && environment.BORNENGINE_SANDBOX_DEV === '1';
}

export async function startSandboxDevRuntime(token: string | undefined): Promise<{ close(): Promise<void> } | null> {
  if (!shouldEnableSandboxDevRuntime(process.env)) return null;
  if (token === undefined || token.length < 16) {
    throw new Error('BORNENGINE_SANDBOX_DEV_TOKEN must contain at least 16 characters for local server editing.');
  }

  await mkdir(scriptsDirectory, { recursive: true });
  await loadInitialRules();
  let requestReload = (): void => undefined;
  const api = new DevScriptApi({
    scriptsDirectory,
    token,
    enabled: true,
    reloadStatus: getServerRulesReloadStatus,
    onScriptChanged: () => requestReload(),
  });
  await api.listen(2569);
  const watcher = watch(scriptsDirectory, { persistent: true });
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let revisionToken = 0;

  const scheduleReload = (): void => {
    revisionToken += 1;
    const expectedToken = revisionToken;
    reloadStatus = {
      state: 'pending',
      revision: rulesManager.currentRevision,
      updatedAt: new Date().toISOString(),
    };
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(() => { void reloadRules(expectedToken); }, 500);
  };
  requestReload = scheduleReload;

  const reloadRules = async (expectedToken: number): Promise<void> => {
    let source: string;
    try {
      source = await readFile(path.join(scriptsDirectory, 'rules.ts'), 'utf8');
    } catch (error) {
      if (expectedToken !== revisionToken) return;
      setReloadError(error instanceof Error ? error.message : String(error));
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const staged = await rulesManager.stage('rules.ts', source);
      if (expectedToken !== revisionToken) return;
      if (!staged.ok) {
        setReloadError(staged.diagnostic);
        return;
      }
      if (rulesManager.commit(staged)) {
        reloadStatus = {
          state: 'ready',
          revision: staged.revision,
          updatedAt: new Date().toISOString(),
        };
        console.info(`[sandbox rules] Applied revision ${staged.revision} to ${activeRooms.size} active room(s).`);
        return;
      }
    }
    if (expectedToken === revisionToken) setReloadError('Active rooms changed during reload; save the rules again.');
  };

  const onFileChange = (filename: string | Buffer | null): void => {
    const name = filename?.toString() ?? '';
    if (name.startsWith('.') || !name.endsWith('.ts')) return;
    scheduleReload();
  };
  watcher.on('change', onFileChange);
  watcher.on('rename', onFileChange);
  watcher.on('error', (error) => {
    setReloadError(error.message);
    console.error(`[sandbox rules] Watcher error: ${error.message}`);
  });

  return {
    async close() {
      if (debounce !== null) clearTimeout(debounce);
      watcher.close();
      await api.close();
    },
  };
}

async function loadInitialRules(): Promise<void> {
  try {
    const source = await readFile(path.join(scriptsDirectory, 'rules.ts'), 'utf8');
    const staged = await rulesManager.stage('rules.ts', source);
    if (!staged.ok) {
      setReloadError(staged.diagnostic);
      console.error(`[sandbox rules] Initial rules rejected: ${staged.diagnostic}`);
      return;
    }
    if (!rulesManager.commit(staged)) {
      setReloadError('Initial rules could not be committed.');
      return;
    }
    reloadStatus = { state: 'ready', revision: staged.revision, updatedAt: new Date().toISOString() };
  } catch (error) {
    setReloadError(error instanceof Error ? error.message : String(error));
  }
}

function setReloadError(diagnostic: string): void {
  reloadStatus = {
    state: 'error',
    revision: rulesManager.currentRevision,
    diagnostic,
    updatedAt: new Date().toISOString(),
  };
  console.error(`[sandbox rules] Reload rejected: ${diagnostic}`);
}
