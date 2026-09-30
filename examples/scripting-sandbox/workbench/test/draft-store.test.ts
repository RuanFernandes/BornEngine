import assert from 'node:assert/strict';
import test from 'node:test';
import { ClientDraftStore, exportClientDraft, importClientDraft } from '../src/editor/draft-store.js';

class MemoryStorage {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string): void { this.entries.set(key, value); }
  removeItem(key: string): void { this.entries.delete(key); }
}

test('stores browser drafts by stable model ID and enforces the source limit', () => {
  const storage = new MemoryStorage();
  const store = new ClientDraftStore(storage);
  assert.equal(store.save('client', 'export default {};'), true);
  assert.equal(store.load('client'), 'export default {};');
  assert.equal(store.load('server'), null);
  assert.equal(store.save('client', 'x'.repeat(64 * 1024 + 1)), false);
});

test('imports plain TypeScript and versioned draft files, and rejects oversized data', () => {
  assert.deepEqual(importClientDraft('export default {};'), { ok: true, source: 'export default {};' });
  const json = exportClientDraft('export default { onStart() {} };');
  assert.deepEqual(importClientDraft(json), { ok: true, source: 'export default { onStart() {} };' });
  assert.equal(importClientDraft('x'.repeat(64 * 1024 + 1)).ok, false);
});
