import assert from 'node:assert/strict';
import test from 'node:test';
import { ScriptComponentSlot, ScriptRevisionReceiver } from '../src/preview/game-bridge.js';

interface ScriptRevision {
  readonly revision: number;
  readonly source: string;
  readonly javascript: string;
}

class FakeScript {
  disposed = false;
  constructor(readonly status: 'ready' | 'error') {}
  dispose(): void { this.disposed = true; }
}

const revision = (value: number): ScriptRevision => ({
  revision: value,
  source: 'export default {};',
  javascript: 'export default {};',
});

test('a late joiner applies the newest accepted script snapshot', () => {
  const receiver = new ScriptRevisionReceiver();
  const applied: number[] = [];

  const result = receiver.receive(revision(8), (script) => {
    applied.push(script.revision);
    return true;
  });

  assert.equal(result, 'applied');
  assert.deepEqual(applied, [8]);
  assert.equal(receiver.revision, 8);
});

test('ignores stale and duplicate room packets', () => {
  const receiver = new ScriptRevisionReceiver();
  let applyCount = 0;

  assert.equal(receiver.receive(revision(5), () => { applyCount++; return true; }), 'applied');
  assert.equal(receiver.receive(revision(4), () => { applyCount++; return true; }), 'stale');
  assert.equal(receiver.receive(revision(5), () => { applyCount++; return true; }), 'stale');

  assert.equal(applyCount, 1);
  assert.equal(receiver.revision, 5);
});

test('keeps the previous script active when applying a newer server revision fails', () => {
  const receiver = new ScriptRevisionReceiver();
  const slot = new ScriptComponentSlot<FakeScript>();
  const active = new FakeScript('ready');
  const invalid = new FakeScript('error');
  assert.equal(slot.replace(active, (script) => script, () => {}), true);

  const result = receiver.receive(revision(6), () =>
    slot.replace(invalid, (script) => script, () => {}),
  );

  assert.equal(result, 'failed');
  assert.equal(receiver.revision, 6);
  assert.equal(slot.current, active);
  assert.equal(active.disposed, false);
  assert.equal(invalid.disposed, true);
});
