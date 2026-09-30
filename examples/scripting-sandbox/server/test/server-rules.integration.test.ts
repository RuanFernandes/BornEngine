import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type Room as ClientRoom } from '@colyseus/sdk';
import test from 'node:test';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_ORIGIN = 'http://127.0.0.1:5173';
const initialRules = 'export function createRules(): SandboxRules { return {}; }';
const invalidRules = 'export function createRules(): SandboxRules { return { onTick( { }; }';
const updatedRules = `export function createRules(): SandboxRules {
  return {
    onTick(_deltaTime, context) {
      context.setMovementSpeed(300);
    },
  };
}`;

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
  throw new Error(`Timed out waiting for the Colyseus server: ${output.join('\n')}`);
}

function playerPosition(room: ClientRoom<any, any>, sessionId: string): { x: number; y: number } | undefined {
  const players = room.state?.players as { get?: (id: string) => { x: number; y: number } } | undefined;
  return players?.get?.(sessionId);
}

async function waitForPlayerMovement(
  room: ClientRoom<any, any>,
  sessionId: string,
  previousX: number,
): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const player = playerPosition(room, sessionId);
    if (player !== undefined && player.x > previousX + 2) return player;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Existing players stopped receiving server-authoritative movement.');
}

async function waitForPlayerCount(rooms: readonly ClientRoom<any, any>[], expected: number): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (rooms.every((room) => (room.state?.players as { size: number } | undefined)?.size === expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Expected every client to observe ${expected} room players.`);
}

function developmentHeaders(token: string): HeadersInit {
  return { origin: DEV_ORIGIN, 'x-bornengine-dev-token': token };
}

async function readReloadStatus(token: string, apiPort: number): Promise<{ state: string; revision: number; diagnostic?: string }> {
  const response = await fetch(`http://127.0.0.1:${apiPort}/__dev/server-scripts/status`, {
    headers: developmentHeaders(token),
  });
  if (!response.ok) throw new Error(`Server rule status request failed (${response.status}).`);
  return await response.json() as { state: string; revision: number; diagnostic?: string };
}

async function waitForReloadStatus(
  token: string,
  apiPort: number,
  predicate: (status: { state: string; revision: number; diagnostic?: string }) => boolean,
): Promise<{ state: string; revision: number; diagnostic?: string }> {
  const deadline = Date.now() + 8_000;
  let status = await readReloadStatus(token, apiPort);
  while (Date.now() < deadline) {
    if (predicate(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
    status = await readReloadStatus(token, apiPort);
  }
  throw new Error(`Timed out waiting for server rule reload (${status.state}, revision ${status.revision}).`);
}

async function saveRules(token: string, apiPort: number, source: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${apiPort}/__dev/server-scripts/rules.ts`, {
    method: 'PUT',
    headers: { ...developmentHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  assert.equal(response.status, 200, await response.text());
}

test('keepsActiveMultiplayerRoomWhenServerRulesReloadOrFail', async (t) => {
  const port = await reservePort();
  const apiPort = await reservePort();
  const token = randomBytes(32).toString('hex');
  const projectDirectory = await mkdtemp(path.join(os.tmpdir(), 'bornengine-server-rules-'));
  await cp(path.join(serverDirectory, 'src'), path.join(projectDirectory, 'src'), { recursive: true });
  await cp(path.join(serverDirectory, 'package.json'), path.join(projectDirectory, 'package.json'));
  await cp(path.join(serverDirectory, 'tsconfig.json'), path.join(projectDirectory, 'tsconfig.json'));
  await symlink(path.join(serverDirectory, 'node_modules'), path.join(projectDirectory, 'node_modules'), 'dir');
  await mkdir(path.join(projectDirectory, 'scripts'), { recursive: true });
  await writeFile(path.join(projectDirectory, 'scripts/rules.ts'), initialRules, { encoding: 'utf8', mode: 0o600 });
  const output: string[] = [];
  const child = spawn(process.execPath, [path.join(serverDirectory, 'node_modules/tsx/dist/cli.mjs'), 'src/index.ts'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      BORNENGINE_SANDBOX_DEV: '1',
      BORNENGINE_SANDBOX_DEV_TOKEN: token,
      BORNENGINE_SANDBOX_DEV_PORT: String(apiPort),
    },
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
    await rm(projectDirectory, { recursive: true, force: true });
  });

  await waitForServer(child, port, output);
  const initialStatus = await waitForReloadStatus(token, apiPort, (status) => status.state === 'ready' && status.revision === 1);
  assert.equal(initialStatus.revision, 1);

  const firstClient = new Client(`ws://127.0.0.1:${port}`);
  const secondClient = new Client(`ws://127.0.0.1:${port}`);
  const first = await firstClient.joinOrCreate('sandbox', { name: 'Ada' }) as ClientRoom<any, any>;
  const second = await secondClient.joinOrCreate('sandbox', { name: 'Lin' }) as ClientRoom<any, any>;
  rooms.push(first, second);
  await waitForPlayerCount(rooms, 2);
  assert.equal((first.state.players as { size: number }).size, 2);
  assert.equal((second.state.players as { size: number }).size, 2);

  await saveRules(token, apiPort, invalidRules);
  const rejected = await waitForReloadStatus(token, apiPort, (status) => status.state === 'error');
  assert.equal(rejected.revision, 1);
  assert.match(rejected.diagnostic ?? '', /error|expected|'}'/i);
  assert.equal((first.state.players as { size: number }).size, 2);
  assert.equal((second.state.players as { size: number }).size, 2);

  const beforeInvalidMovement = playerPosition(first, first.sessionId);
  assert.ok(beforeInvalidMovement);
  first.send('input', { sequence: 0, x: 1, y: 0 });
  await waitForPlayerMovement(first, first.sessionId, beforeInvalidMovement.x);
  assert.equal(playerPosition(second, first.sessionId)?.x, playerPosition(first, first.sessionId)?.x);

  await saveRules(token, apiPort, updatedRules);
  const accepted = await waitForReloadStatus(token, apiPort, (status) => status.state === 'ready' && status.revision === 2);
  assert.equal(accepted.revision, 2);
  assert.equal((first.state.players as { size: number }).size, 2);
  assert.equal((second.state.players as { size: number }).size, 2);

  const beforeValidMovement = playerPosition(first, first.sessionId);
  assert.ok(beforeValidMovement);
  first.send('input', { sequence: 1, x: 1, y: 0 });
  const moved = await waitForPlayerMovement(first, first.sessionId, beforeValidMovement.x);
  assert.equal(playerPosition(second, first.sessionId)?.x, moved.x);
  assert.equal(playerPosition(second, first.sessionId)?.y, moved.y);
});
