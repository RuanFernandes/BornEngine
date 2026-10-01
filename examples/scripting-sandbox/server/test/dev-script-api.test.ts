import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DevScriptApi } from '../src/sandbox/dev-script-api.js';

const BASE = '/__dev/server-scripts';

async function fixture(changes: string[] = []) {
  const scriptsDirectory = await mkdtemp(path.join(tmpdir(), 'bornengine-server-scripts-'));
  const api = new DevScriptApi({
    scriptsDirectory,
    enabled: true,
    onScriptChanged: (name) => changes.push(name),
  });
  return { api, scriptsDirectory, changes };
}

function request(api: DevScriptApi, method: string, path: string, body?: unknown) {
  return api.handle({ method, path, body });
}

test('allowsLocalDevelopmentRequestsWithoutAToken', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  const response = await request(api, 'GET', BASE);
  assert.equal(response.status, 200);
});

test('doesNotRequireAnOriginHeaderForLocalRequests', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  const response = await request(api, 'GET', BASE);
  assert.equal(response.status, 200);
});

test('rejectsNonLoopbackBinding', () => {
  assert.throws(() => new DevScriptApi({
    scriptsDirectory: '/tmp/server-scripts',
    host: '0.0.0.0',
    enabled: true,
  }), /loopback/i);
});

test('rejectsTraversalAndNonTsNames', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  const traversal = await request(api, 'GET', `${BASE}/%2e%2e/secret.ts`);
  const invalid = await request(api, 'POST', BASE, { name: '../unsafe.ts', source: '' });
  assert.equal(traversal.status, 400);
  assert.equal(invalid.status, 400);
});

test('rejectsSymlinkTargets', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  const outside = path.join(scriptsDirectory, '..', `${path.basename(scriptsDirectory)}-outside.ts`);
  await writeFile(outside, 'export const secret = true;');
  await symlink(outside, path.join(scriptsDirectory, 'linked.ts'));
  t.after(async () => {
    await rm(scriptsDirectory, { recursive: true, force: true });
    await rm(outside, { force: true });
  });

  const response = await request(api, 'PUT', `${BASE}/linked.ts`, { source: 'export const changed = true;' });

  assert.equal(response.status, 400);
  assert.equal(await readFile(outside, 'utf8'), 'export const secret = true;');
});

test('capsSourceAt64KiB', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  const response = await request(api, 'POST', BASE, { name: 'large.ts', source: 'x'.repeat(65_537) });
  assert.equal(response.status, 413);
});

test('accepts64KiBSourceThroughEscapedJsonEnvelope', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  const server = await api.listen(0);
  assert.ok(server);
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    await api.close();
    await rm(scriptsDirectory, { recursive: true, force: true });
  });

  const source = '\0'.repeat(64 * 1024);
  const body = JSON.stringify({ name: 'large.ts', source });
  assert.ok(Buffer.byteLength(body) > 68 * 1024);
  const response = await fetch(`http://127.0.0.1:${address.port}${BASE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  assert.equal(response.status, 201);
  assert.equal((await readFile(path.join(scriptsDirectory, 'large.ts'), 'utf8')).length, source.length);
});

test('listsAndMutatesOnlyServerScripts', async (t) => {
  const { api, scriptsDirectory } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  await writeFile(path.join(scriptsDirectory, 'notes.txt'), 'not a server script');

  assert.equal((await request(api, 'POST', BASE, { name: 'rules.ts', source: 'export function createRules() { return {}; }' })).status, 201);
  assert.equal((await request(api, 'POST', BASE, { name: 'helper.ts', source: 'export const speed = 200;' })).status, 201);
  assert.equal((await request(api, 'PUT', `${BASE}/helper.ts`, { source: 'export const speed = 240;' })).status, 200);
  assert.equal((await request(api, 'PATCH', `${BASE}/helper.ts`, { name: 'movement.ts' })).status, 200);

  const listed = await request(api, 'GET', BASE);
  assert.deepEqual((listed.body as { files: { name: string }[] }).files.map((file) => file.name), ['movement.ts', 'rules.ts']);
  assert.equal((await request(api, 'DELETE', `${BASE}/movement.ts`)).status, 200);
  assert.equal((await request(api, 'DELETE', `${BASE}/rules.ts`)).status, 409);
});

test('notifiesLiveReloadAfterScriptMutations', async (t) => {
  const { api, scriptsDirectory, changes } = await fixture();
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  await request(api, 'POST', BASE, { name: 'rules.ts', source: 'export function createRules() { return {}; }' });
  await request(api, 'PUT', `${BASE}/rules.ts`, { source: 'export function createRules() { return { onTick() {} }; }' });

  assert.deepEqual(changes, ['rules.ts', 'rules.ts']);
});

test('omitsRoutesOutsideDevelopment', async (t) => {
  const scriptsDirectory = await mkdtemp(path.join(tmpdir(), 'bornengine-production-scripts-'));
  t.after(() => rm(scriptsDirectory, { recursive: true, force: true }));
  const api = new DevScriptApi({ scriptsDirectory, enabled: false });
  const response = await api.handle({ method: 'GET', path: BASE });
  assert.equal(response.status, 404);
  assert.equal(await api.listen(), null);
});
