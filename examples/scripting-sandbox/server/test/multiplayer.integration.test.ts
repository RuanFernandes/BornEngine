import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type Room as ClientRoom } from '@colyseus/sdk';
import test from 'node:test';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_SCRIPT = `export default {
  onStart(context: BornEngineScriptContext) { context.log?.('shared client behavior'); },
} satisfies BornEngineScriptBehavior;`;

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Unable to reserve a local test port.');
  const { port } = address;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(child: ChildProcess, port: number, output: string[]): Promise<void> {
  const endpoint = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Colyseus server exited with code ${child.exitCode}: ${output.join('\n')}`);
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(400) });
      if (response.ok) return;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Timed out waiting for the Colyseus server.');
}

function waitForMessage<T>(room: ClientRoom<any, any>, type: string, predicate: (payload: T) => boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${type}.`));
    }, 5_000);
    const unsubscribe = room.onMessage(type, (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(payload);
    });
  });
}

function playerState(room: ClientRoom<any, any>, sessionId = room.sessionId): { x: number; y: number } | undefined {
  const players = room.state?.players as { get?: (sessionId: string) => { x: number; y: number }; [id: string]: unknown } | undefined;
  return players?.get?.(sessionId) ?? players?.[sessionId] as { x: number; y: number } | undefined;
}

async function waitForMovement(room: ClientRoom<any, any>, sessionId: string, previousX: number): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const player = playerState(room, sessionId);
    if (player !== undefined && player.x > previousX + 2) return player;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Server-authoritative movement did not reach the client.');
}

test('gameplayAndScriptingManagerRoomsKeepSeparateResponsibilities', async (t) => {
  const port = await reservePort();
  const output: string[] = [];
  const child = spawn(process.execPath, [path.join(serverDirectory, 'node_modules/tsx/dist/cli.mjs'), 'src/index.ts'], {
    cwd: serverDirectory,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), BORNENGINE_SANDBOX_DEV: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
  const rooms: ClientRoom<any, any>[] = [];
  t.after(async () => {
    await Promise.all(rooms.map((room) => room.leave().catch(() => undefined)));
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  });

  await waitForServer(child, port, output);
  const firstClient = new Client(`ws://127.0.0.1:${port}`);
  const secondClient = new Client(`ws://127.0.0.1:${port}`);
  const firstGame = await firstClient.joinOrCreate('sandbox', { name: 'Ada' }) as ClientRoom<any, any>;
  const secondGame = await secondClient.joinOrCreate('sandbox', { name: 'Lin' }) as ClientRoom<any, any>;
  const firstManager = await firstClient.joinOrCreate('scripting-manager') as ClientRoom<any, any>;
  const secondManager = await secondClient.joinOrCreate('scripting-manager') as ClientRoom<any, any>;
  rooms.push(firstGame, secondGame, firstManager, secondManager);

  const initialSnapshot = waitForMessage<{ revision: number }>(secondManager, 'clientScriptSnapshot', (payload) => payload.revision === 0);
  secondManager.send('requestClientScriptSnapshot', {});
  await initialSnapshot;

  const reloadAtFirst = waitForMessage<{ revision: number; source: string }>(
    firstManager,
    'clientScriptReload',
    (payload) => payload.revision === 1,
  );
  const resultAtPublisher = waitForMessage<{ result: string; revision?: number; reason?: string }>(
    secondManager,
    'clientScriptResult',
    () => true,
  );
  secondManager.send('publishClientScript', { baseRevision: 0, source: SERVER_SCRIPT });
  const [accepted, reload] = await Promise.all([resultAtPublisher, reloadAtFirst]);
  assert.equal(accepted.result, 'accepted', accepted.reason);
  assert.equal(accepted.revision, 1);
  assert.equal(reload.source, SERVER_SCRIPT);

  const lateManagerClient = new Client(`ws://127.0.0.1:${port}`);
  const lateManager = await lateManagerClient.joinOrCreate('scripting-manager') as ClientRoom<any, any>;
  rooms.push(lateManager);
  const lateSnapshot = waitForMessage<{ revision: number; source: string }>(
    lateManager,
    'clientScriptSnapshot',
    (payload) => payload.revision === 1,
  );
  lateManager.send('requestClientScriptSnapshot', {});
  assert.equal((await lateSnapshot).source, SERVER_SCRIPT);

  const initialFirst = playerState(firstGame);
  const initialSecond = playerState(secondGame);
  assert.ok(initialFirst);
  assert.ok(initialSecond);
  const rejectedInput = waitForMessage<{ reason: string }>(secondGame, 'inputRejected', (payload) => payload.reason === 'malformed');
  secondGame.send('input', { sequence: 0, x: 0, y: 0, position: { x: 950, y: 500 } });
  await rejectedInput;
  assert.equal(playerState(secondGame)?.x, initialSecond.x);

  firstGame.send('input', { sequence: 0, x: 1, y: 0 });
  const movedFirst = await waitForMovement(firstGame, firstGame.sessionId, initialFirst.x);
  const movedSecond = await waitForMovement(secondGame, firstGame.sessionId, initialFirst.x);
  assert.equal(movedSecond.x, movedFirst.x);
  assert.equal(movedSecond.y, movedFirst.y);
});
