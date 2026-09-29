const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(root + '/src/core/game.ts', 'utf8');
const contexts = new WeakMap();
let active = null;
const events = [];
let failingDisposer = null;
class Context {
  constructor() { this.error = null; this.isReady = false; this.isDisposed = false; }
  static create() { const c = new Context(); active = c; return c; }
  static createFailed(message) { const c = new Context(); c.error = message; return c; }
  markFailed(message) { this.error = message; this.isReady = false; }
  markReady() { this.isReady = true; }
  isActiveOwner() { return active === this && !this.isDisposed; }
  register() { return true; }
  updateFrameServices() {}
  dispose() { events.push('context.dispose'); this.isDisposed = true; this.isReady = false; active = null; }
}
class Service {
  constructor() {}
  dispose() {
    events.push(this.constructor.name + '.dispose');
    if (this.constructor.name === failingDisposer) throw new Error('service disposal failed');
  }
  update() {}
  activate() {}
  render() {}
  clear() {}
  _beginFrame() {}
}
class ActionMap {
  constructor() { this.actions = []; }
  bindAction(name, bindings) { this.actions.push({ name, bindings }); }
  toData() { return { version: 1, actions: this.actions.slice(), axes: [] }; }
  clear() { this.actions.length = 0; }
}
class InputSystem extends Service {
  constructor() { super(); this.actionMaps = []; }
  createActionMap() { const map = new ActionMap(); this.actionMaps.push(map); return map; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const map of this.actionMaps) map.clear();
    this.actionMaps.length = 0;
    events.push(this.constructor.name + '.dispose');
    if (this.constructor.name === failingDisposer) throw new Error('service disposal failed');
  }
}
class SceneManager extends Service {}
class SceneGraph extends Service {}
class Window {
  constructor(owner, options = {}) {
    this.owner = owner;
    this.context = contexts.get(owner);
    this.mode = options.mode || 'windowed';
    this.open = this.mode !== 'embedded';
    if (this.open && this.context.error === null) this.context.markReady();
  }
  get isOpen() { return this.open && this.context.isReady && !this.context.isDisposed; }
  shouldClose() { return !this.isOpen; }
  close() {
    events.push('window.close'); this.open = false;
    this.owner._onWindowClosed?.();
  }
}
let platform = 1;
let webFrame;
const sandbox = {
  GameContext: Context, CONTEXT_ALREADY_ACTIVE_ERROR: 'active',
  bindGameContext: (g,c) => contexts.set(g,c), getGameContext: g => contexts.get(g),
  Window, Renderer: Service, InputSystem, AudioSystem: Service,
  SceneManager, SceneGraph, TouchControls: Service,
  Ui: Service, DebugUi: Service, GameInspector: Service, AssetManager: Service,
  beginDrawing: () => events.push('begin'), endDrawing: () => events.push('end'),
  getPlatform: () => platform, Platform: {WEB:7}, setTargetFPS: () => {},
  runGame: (frame, shouldContinue) => {
    if (platform === 7) { webFrame = frame; return; }
    let count = 0;
    while (shouldContinue() && count++ < 5) { events.push('begin'); frame(1/60); events.push('end'); }
  },
  Promise, Error, String, console,
};
let code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '');
vm.runInNewContext(code + '\nthis.Game = Game;', sandbox, { filename: 'game.ts' });
const Game = sandbox.Game;
class Probe extends Game {
  constructor() { super(); this.starts = 0; this.stops = 0; }
  onStart() { events.push('start'); this.starts++; }
  loop() { events.push('loop'); }
  render() { events.push('render'); super.render(); this.stop(); }
  onStop() { events.push('stop'); this.stops++; }
}
async function main() {
  const contextSource = fs.readFileSync(root + '/src/core/context.ts', 'utf8');
  const contextCode = stripTypeScriptTypes(contextSource, { mode: 'strip' })
    .replace(/^export /gm, '');
  const contextSandbox = { WeakMap, Map, Error, String };
  vm.runInNewContext(contextCode + '\nthis.TestContext = GameContext;', contextSandbox);
  const registeredContext = contextSandbox.TestContext.create();
  registeredContext.markReady();
  const disposalOrder = [];
  registeredContext.register({dispose() { disposalOrder.push('first'); }});
  registeredContext.register({dispose() { disposalOrder.push('failure'); throw new Error('registered resource failed'); }});
  registeredContext.register({dispose() { disposalOrder.push('last'); }});
  registeredContext.dispose();
  assert.deepEqual(disposalOrder, ['last', 'failure', 'first'], 'registered cleanup continues');
  assert.match(registeredContext.error, /registered resource failed/);
  assert.equal(registeredContext.isDisposed, true);

  class InvalidGame extends Game {
    onStart() { events.push('invalid.start'); }
    loop() { events.push('invalid.loop'); }
    render() { events.push('invalid.render'); }
    onStop() { events.push('invalid.stop'); }
  }
  const invalid = new InvalidGame({targetFps: 0});
  const initialError = invalid.error;
  failingDisposer = 'SceneManager';
  await invalid.run();
  failingDisposer = null;
  assert.match(initialError, /targetFps/);
  assert.equal(invalid.error, initialError, 'preserve pre-start error');
  assert.equal(invalid.isDisposed, true, 'failed start cleans up');
  assert.equal(contexts.get(invalid).isDisposed, true, 'failed start disposes context');
  assert.equal(events.some(value => value.startsWith('invalid.')), false, 'pre-start failure invokes no hooks');
  events.length = 0;
  const invalidEmbedded = new InvalidGame({targetFps: 0, window:{mode:'embedded'}});
  const embeddedError = invalidEmbedded.error;
  await invalidEmbedded.run();
  assert.equal(invalidEmbedded.error, embeddedError);
  assert.equal(invalidEmbedded.isDisposed, true, 'invalid embedded configuration cleans up');
  const waitingEmbedded = new Game({window:{mode:'embedded'}});
  await waitingEmbedded.run();
  assert.equal(waitingEmbedded.isDisposed, false, 'unattached embedded surface remains attachable');
  waitingEmbedded.dispose();
  events.length = 0;
  const stoppedBeforeRun = new Probe();
  stoppedBeforeRun.stop();
  await stoppedBeforeRun.run();
  assert.equal(stoppedBeforeRun.isDisposed, true, 'pre-start stop releases the context');
  assert.equal(stoppedBeforeRun.starts, 0);
  assert.equal(stoppedBeforeRun.stops, 0);
  events.length = 0;
  const game = new Probe();
  const completion = game.run();
  assert.ok(completion instanceof Promise, 'run returns completion Promise');
  await completion;
  assert.equal(game.starts, 1); assert.equal(game.stops, 1);
  assert.deepEqual(events.filter(x => ['start','loop','render','stop'].includes(x)), ['start','loop','render','stop']);
  assert.equal(game.isDisposed, true, 'completion follows disposal');
  game.stop(); game.dispose(); assert.equal(game.stops, 1);
  class SavesControls extends Game {
    constructor() {
      super();
      this.controls = this.input.createActionMap();
      this.controls.bindAction('confirm', [{kind:'key', key:13}]);
      this.controlsSnapshot = null;
    }
    onStop() { this.controlsSnapshot = this.controls.toData(); }
    render() { this.stop(); }
  }
  const savesControls = new SavesControls();
  const liveControls = savesControls.controls;
  await savesControls.run();
  assert.deepEqual(savesControls.controlsSnapshot, {
    version: 1, actions: [{name:'confirm', bindings:[{kind:'key', key:13}]}], axes: [],
  }, 'onStop captures the action map before InputSystem clears it');
  assert.deepEqual(liveControls.toData(), {version:1, actions:[], axes:[]}, 'the live map is cleared during disposal');
  events.length = 0;
  class BadStart extends Probe { onStart() { throw new Error('start failed'); } }
  const bad = new BadStart(); await bad.run();
  assert.match(bad.error, /start failed/); assert.equal(bad.stops, 1); assert.equal(bad.isDisposed, true);
  events.length = 0;
  class BadStop extends Probe { onStop() { super.onStop(); throw new Error('stop failed'); } }
  const badStop = new BadStop(); await badStop.run();
  assert.match(badStop.error, /stop failed/); assert.equal(badStop.stops, 1); assert.equal(badStop.isDisposed, true);
  events.length = 0;
  failingDisposer = 'SceneManager';
  const disposalFailure = new BadStop(); await disposalFailure.run();
  failingDisposer = null;
  assert.match(disposalFailure.error, /stop failed/, 'first lifecycle error survives cleanup failure');
  assert.equal(disposalFailure.isDisposed, true);
  assert.equal(contexts.get(disposalFailure).isDisposed, true);
  assert.ok(events.indexOf('SceneManager.dispose') >= 0);
  assert.ok(events.indexOf('SceneGraph.dispose') > events.indexOf('SceneManager.dispose'), 'cleanup continues after disposer failure');
  assert.ok(events.indexOf('context.dispose') > events.indexOf('SceneGraph.dispose'), 'context cleanup finishes before settlement');
  events.length = 0;
  failingDisposer = 'SceneManager';
  const disposalOnlyFailure = new Probe(); await disposalOnlyFailure.run();
  failingDisposer = null;
  assert.match(disposalOnlyFailure.error, /service disposal failed/, 'disposer error recorded');
  assert.equal(disposalOnlyFailure.isDisposed, true);
  events.length = 0;
  class BadRender extends Probe { render() { throw new Error('render failed'); } }
  const badRender = new BadRender(); await badRender.run();
  assert.match(badRender.error, /render failed/); assert.equal(badRender.stops, 1); assert.equal(badRender.isDisposed, true);
  events.length = 0;
  const embedded = new Game({window:{mode:'embedded'}});
  const context = contexts.get(embedded); context.markReady(); embedded.window.open = true;
  let updates=0, renders=0, stops=0;
  const callbacks = {update:()=>updates++, render:()=>renders++, onStop:()=>stops++};
  assert.equal(embedded.runFrame(1/60, callbacks), true);
  embedded.stop(); assert.equal(embedded.runFrame(1/60, callbacks), false);
  assert.deepEqual([updates,renders,stops],[1,1,1]); embedded.dispose();
  platform = 7;
  const web = new Probe();
  let settled = false; const pending = web.run().then(() => settled = true);
  assert.equal(settled, false); webFrame(1/60); await pending;
  assert.equal(settled, true); assert.equal(web.isDisposed, true);
  events.length = 0;
  class CloseDuringFrame extends Game {
    constructor() { super(); this.stops = 0; }
    loop() { this.window.close(); }
    render() {}
    onStop() { this.stops++; }
  }
  const closeDuringFrame = new CloseDuringFrame();
  let frameSettled = false;
  const frameCompletion = closeDuringFrame.run().then(() => frameSettled = true);
  webFrame(1/60); await Promise.resolve(); await Promise.resolve();
  assert.equal(frameSettled, true, 'closing during a Web frame settles run');
  await frameCompletion;
  assert.equal(closeDuringFrame.stops, 1);
  assert.equal(closeDuringFrame.isDisposed, true);
  events.length = 0;
  const closeBetweenFrames = new CloseDuringFrame();
  let betweenSettled = false;
  const betweenCompletion = closeBetweenFrames.run().then(() => betweenSettled = true);
  closeBetweenFrames.window.close(); await Promise.resolve(); await Promise.resolve();
  assert.equal(betweenSettled, true, 'closing between Web frames settles run');
  await betweenCompletion;
  assert.equal(closeBetweenFrames.stops, 1);
  assert.equal(closeBetweenFrames.isDisposed, true);
  console.log('PASS: invalid start, native, Web, hook errors, cleanup failures, idempotence, embedded callbacks');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
