import assert from 'node:assert/strict';
import test from 'node:test';
import { ScriptComponentSlot } from '../src/preview/game-bridge.js';

class FakeScript {
  disposed = false;
  constructor(readonly status: 'ready' | 'error') {}
  dispose(): void { this.disposed = true; }
}

test('keepsActiveComponentWhenCandidateIsInvalid', () => {
  const slot = new ScriptComponentSlot<FakeScript>();
  const active = new FakeScript('ready');
  const invalid = new FakeScript('error');
  assert.equal(slot.replace(active, (script) => script, () => {}), true);
  assert.equal(slot.replace(invalid, (script) => script, () => {}), false);
  assert.equal(slot.current, active);
  assert.equal(active.disposed, false);
  assert.equal(invalid.disposed, true);
});

test('swapsReadyCandidateBeforeDisposingPrevious', () => {
  const slot = new ScriptComponentSlot<FakeScript>();
  const first = new FakeScript('ready');
  const second = new FakeScript('ready');
  const order: string[] = [];
  slot.replace(first, (script) => script, () => {});
  const attached = slot.replace(second, (script) => {
    order.push('attached');
    return script;
  }, (script) => {
    order.push(`detached:${script === first ? 'first' : 'second'}`);
    script.dispose();
  });
  assert.equal(attached, true);
  assert.equal(slot.current, second);
  assert.equal(first.disposed, true);
  assert.equal(second.disposed, false);
  assert.deepEqual(order, ['attached', 'detached:first']);
});

test('disposesCandidateWhenAttachmentFailsAndLeavesCurrentAlone', () => {
  const slot = new ScriptComponentSlot<FakeScript>();
  const active = new FakeScript('ready');
  const candidate = new FakeScript('ready');
  slot.replace(active, (script) => script, () => {});
  assert.equal(slot.replace(candidate, () => null, () => {}), false);
  assert.equal(slot.current, active);
  assert.equal(candidate.disposed, true);
  assert.equal(active.disposed, false);
});
