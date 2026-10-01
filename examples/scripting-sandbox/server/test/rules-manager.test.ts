import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RulesManager } from '../src/sandbox/rules-manager.js';
import type { RuleCommand, SandboxRuleContext, SandboxRules } from '../src/sandbox/server-rule-contract.js';

class TestRoom {
  readonly state = { score: 7 };
  readonly timer = { id: 'stable-timer' };
  rules: SandboxRules | null = null;
  readonly appliedCommands: unknown[][] = [];
  readonly ruleErrors: string[] = [];
  constructor(readonly ruleRoomId: string) {}
  replaceRules(rules: SandboxRules): void { this.rules = rules; }
  getRulePlayerSnapshots() { return []; }
  applyRuleCommands(commands: readonly RuleCommand[]): void { this.appliedCommands.push([...commands]); }
  reportRuleError(message: string): void { this.ruleErrors.push(message); }
}

async function fixture(activeRooms: TestRoom[] = [], log?: (message: string) => void) {
  const directory = await mkdtemp(path.join(tmpdir(), 'bornengine-rules-'));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  const manager = new RulesManager({
    scriptsDirectory: directory,
    activeRooms: () => activeRooms,
    log,
  });
  return { directory, manager, activeRooms };
}

test('rejectsDiagnosticsBeforeImport', async (t) => {
  const { directory, manager } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', 'export function createRules() { const x: string = 5; return {}; }');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostic, /not assignable|TypeScript/i);
});

test('probesFactoryAndHookShape', async (t) => {
  const { directory, manager } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `export function createRules() { return { onTick: 'not a hook' }; }`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostic, /onTick|hook/i);
});

test('importsTrustedRelativeModules', async (t) => {
  const { directory, manager } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'helper.ts'), 'export const multiplier = 2;\n');
  const result = await manager.stage('rules.ts', `
    import { multiplier } from './helper.ts';
    export function createRules() {
      return { onTick(_dt: number, context: SandboxRuleContext) { context.setMovementSpeed(180 * multiplier); } } satisfies SandboxRules;
    }
  `);
  assert.equal(result.ok, true);
});

test('reloadsChangedRelativeModulesForANewGeneration', async (t) => {
  const messages: string[] = [];
  const { directory, manager } = await fixture([], (message) => messages.push(message));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'helper.ts'), 'export const message = "first";\n');
  const source = `import { message } from './helper.ts';
    export function createRules() { return { onTick(_dt: number, context: SandboxRuleContext) { context.log(message); } } satisfies SandboxRules; }`;

  const first = await manager.stage('rules.ts', source);
  assert.equal(first.ok, true);
  if (first.ok) manager.commit(first);
  manager.createRulesForNewRoom(new TestRoom('one')).onTick?.(1 / 30, {} as SandboxRuleContext);
  await writeFile(path.join(directory, 'helper.ts'), 'export const message = "second";\n');

  const second = await manager.stage('rules.ts', source);
  assert.equal(second.ok, true);
  if (second.ok) manager.commit(second);
  manager.createRulesForNewRoom(new TestRoom('two')).onTick?.(1 / 30, {} as SandboxRuleContext);

  assert.deepEqual(messages.map((message) => message.slice(message.indexOf(': ') + 2)), ['first', 'second']);
});

test('stagesFreshRulesForEveryActiveRoom', async (t) => {
  const rooms = [new TestRoom('one'), new TestRoom('two')];
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `
    let instance = 0;
    export function createRules() {
      const ownState = ++instance;
      return { onTick(_dt: number, context: SandboxRuleContext) { context.log(String(ownState)); } } satisfies SandboxRules;
    }
  `);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.rulesByRoom.get('one'), result.rulesByRoom.get('two'));
    assert.notEqual(result.rulesByRoom.get('one')?.onTick, result.rulesByRoom.get('two')?.onTick);
  }
});

test('swapsAllRoomsOnlyAfterEveryStageSucceeds', async (t) => {
  const rooms = [new TestRoom('one'), new TestRoom('two')];
  const previous = [{ onTick() {} }, { onTick() {} }];
  rooms[0].rules = previous[0];
  rooms[1].rules = previous[1];
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `export function createRules() { return { onTick() {} } satisfies SandboxRules; }`);
  assert.equal(result.ok, true);
  assert.equal(rooms[0].rules, previous[0]);
  assert.equal(rooms[1].rules, previous[1]);
  if (result.ok) {
    assert.equal(manager.commit(result), true);
    assert.notEqual(rooms[0].rules, previous[0]);
    assert.notEqual(rooms[1].rules, previous[1]);
  }
});

test('preservesLastGoodGenerationWhenAnyRoomFails', async (t) => {
  const rooms = [new TestRoom('one'), new TestRoom('two')];
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const good = await manager.stage('rules.ts', `export function createRules() { return { onTick() {} } satisfies SandboxRules; }`);
  assert.equal(good.ok, true);
  if (good.ok) manager.commit(good);
  const before = rooms.map((room) => room.rules);
  const bad = await manager.stage('rules.ts', `
    let calls = 0;
    export function createRules() {
      if (++calls === 3) throw new Error('room staging failure');
      return { onTick() {} } satisfies SandboxRules;
    }
  `);
  assert.equal(bad.ok, false);
  assert.deepEqual(rooms.map((room) => room.rules), before);
});

test('keepsRoomStateAndTimerAcrossCommit', async (t) => {
  const rooms = [new TestRoom('stable')];
  const state = rooms[0].state;
  const timer = rooms[0].timer;
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `export function createRules() { return { onTick() {} } satisfies SandboxRules; }`);
  assert.equal(result.ok, true);
  if (result.ok) manager.commit(result);
  assert.equal(rooms[0].state, state);
  assert.equal(rooms[0].timer, timer);
});

test('discardsCommandsFromThrowingHook', async (t) => {
  const rooms = [new TestRoom('throwing')];
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `export function createRules() { return {
    onTick(_dt: number, context: SandboxRuleContext) {
      context.setMovementSpeed(180);
      throw new Error('hook failed');
    }
  } satisfies SandboxRules; }`);
  assert.equal(result.ok, true);
  if (result.ok) manager.commit(result);

  rooms[0].rules?.onTick?.(1 / 30, {} as SandboxRuleContext);

  assert.deepEqual(rooms[0].appliedCommands, []);
  assert.match(rooms[0].ruleErrors[0] ?? '', /rules\.ts.*onTick.*hook failed/);
});

test('rejectsAsyncHooksBeforeApplyingCommands', async (t) => {
  const rooms = [new TestRoom('async-hook')];
  const { directory, manager } = await fixture(rooms);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await manager.stage('rules.ts', `export function createRules() { return {
    async onTick(_dt: number, context: SandboxRuleContext) {
      context.setMovementSpeed(180);
      await Promise.resolve();
      context.broadcastJson('late', { ignored: true });
    }
  } satisfies SandboxRules; }`);
  assert.equal(result.ok, true);
  if (result.ok) manager.commit(result);

  rooms[0].rules?.onTick?.(1 / 30, {} as SandboxRuleContext);

  assert.deepEqual(rooms[0].appliedCommands, []);
  assert.match(rooms[0].ruleErrors[0] ?? '', /onTick.*synchronous/i);
});
