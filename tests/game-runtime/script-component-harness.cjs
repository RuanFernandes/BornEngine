const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const componentPath = path.join(root, 'src/scripting/script-component.ts');
const runtimePath = path.join(root, 'src/scripting/script-runtime.ts');
assert.ok(fs.existsSync(componentPath), 'ScriptComponent must be provided by the scripting API');
assert.ok(fs.existsSync(runtimePath), 'Game-owned ScriptRuntime must be provided by the scripting API');

const calls = [];
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scriptingEntry = packageManifest.exports['./scripting'];
assert.equal(scriptingEntry, './src/scripting/index.ts', 'the scripting subpath resolves to its public barrel');
assert.ok(fs.existsSync(path.join(root, scriptingEntry)), 'the scripting public entry exists in the package');
let currentStatus = 1;
let currentError = '';
let commands = [];
class GameComponent {
  constructor() { this.enabled = true; this.owner = null; this.wasDestroyed = false; }
  get gameObject() { return this.owner; }
  get destroyed() { return this.wasDestroyed; }
  get isActiveAndEnabled() { return this.owner !== null && this.enabled && !this.wasDestroyed; }
  _setGameObject(owner) { this.owner = owner; return true; }
}
class ParticleEmitter2D {
  emitBurst(count, options) { calls.push(['particles.emitBurst', count, options]); return true; }
}
const context = {};
const runtime = {
  context,
  isSupported: true,
  _ownsContext(candidate) { return candidate === context; },
  _register(component) { calls.push(['runtime.register', component]); return true; },
  _unregister(component) { calls.push(['runtime.unregister', component]); },
};
const operations = {
  scriptRuntimeSupported: () => true,
  createScriptVm(permissionMask, limits) { calls.push(['create', permissionMask, limits]); return 41; },
  loadScriptVm(handle, source) { calls.push(['load', handle, source]); return true; },
  startScriptVm(handle, id, position) { calls.push(['start', handle, id, position]); return 1; },
  updateScriptVm(handle, id, position, deltaTime) { calls.push(['update', handle, id, position, deltaTime]); return currentStatus; },
  disposeScriptVm(handle, id, position) { calls.push(['dispose', handle, id, position]); return currentStatus; },
  scriptCommandCount() { return commands.length; },
  scriptCommandKind(_handle, index) { return commands[index].kind; },
  scriptCommandNumber(_handle, index, slot) { return commands[index].values[slot] ?? 0; },
  scriptCommandText(_handle, index) { return commands[index].text ?? ''; },
  clearScriptCommands() { calls.push(['clearCommands']); commands = []; },
  scriptVmStatus() { return currentStatus; },
  scriptVmError() { return currentError; },
  scriptVmMemoryUsed() { return 8192; },
  destroyScriptVm(handle) { calls.push(['destroy', handle]); },
};

const source = fs.readFileSync(componentPath, 'utf8');
const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '') + '\nthis.ScriptComponent = ScriptComponent;';
const sandbox = {
  GameComponent,
  ParticleEmitter2D,
  runtime,
  operations,
  scriptOperations: operations,
  console,
  Date,
  Math,
  Error,
};
vm.runInNewContext(code, sandbox, { filename: componentPath });
const ScriptComponent = sandbox.ScriptComponent;

function owner() {
  return {
    id: 23,
    transform: {
      worldPosition: { x: 2, y: 3, z: 4 },
      setWorldPosition(position) {
        this.worldPosition = { x: position.x, y: position.y, z: position.z };
        calls.push(['transform.setWorldPosition', this.worldPosition]);
        return true;
      },
    },
    emitter: new ParticleEmitter2D(),
    getComponent(type) { return type === ParticleEmitter2D ? this.emitter : null; },
  };
}

const actor = owner();
const component = new ScriptComponent(runtime, 'export default { update(ctx) {} }', {
  permissions: ['log', 'self.read', 'self.transform.write', 'self.particles.emit'],
  limits: { maxMemoryBytes: 2 * 1024 * 1024, maxStackBytes: 65536, maxInterruptChecks: 500 },
});
assert.equal(component.status, 'ready', 'valid modules load without throwing');
assert.equal(component._canAttachTo(context), true, 'script component accepts its owning GameContext');
assert.equal(component._canAttachTo({}), false, 'script component rejects another GameContext');
component._setGameObject(actor);
const create = calls.find((entry) => entry[0] === 'create');
assert.equal(create[1], 15, 'only explicitly granted capabilities enter the FFI mask');
assert.deepEqual(JSON.parse(JSON.stringify(create[2])), {
  maxMemoryBytes: 2 * 1024 * 1024,
  maxStackBytes: 65536,
  maxInterruptChecks: 500,
});
component.onStart();

commands = [
  { kind: 2, values: [10, 20, 30] },
  { kind: 3, values: [1, -2, 0.5] },
  { kind: 4, values: [5, 0.25, -0.5] },
];
const clearsBeforeUpdate = calls.filter((entry) => entry[0] === 'clearCommands').length;
component.update(0.016);
assert.deepEqual(actor.transform.worldPosition, { x: 11, y: 18, z: 30.5 }, 'transform commands apply in guest order');
assert.ok(calls.some((entry) => entry[0] === 'particles.emitBurst' && entry[1] === 5),
  'particle capability emits through the ParticleEmitter2D attached to the same GameObject');
assert.equal(calls.filter((entry) => entry[0] === 'clearCommands').length, clearsBeforeUpdate + 1,
  'the update callback drains its command queue exactly once');

currentStatus = 2;
currentError = 'guest failure';
assert.doesNotThrow(() => component.update(0.016), 'guest exceptions stay inside the script component');
assert.equal(component.status, 'error');
assert.equal(component.error, 'guest failure');
currentStatus = 1;
currentError = '';
commands = [{ kind: 1, text: 'destroyed cleanly' }];
component.onDestroy();
assert.ok(calls.some((entry) => entry[0] === 'dispose'), 'onDestroy is dispatched before the runtime handle is released');
assert.ok(calls.some((entry) => entry[0] === 'destroy' && entry[1] === 41), 'native handle is released');
assert.equal(component.status, 'disposed');

const denied = new ScriptComponent(runtime, 'export default {}');
assert.equal(calls.findLast((entry) => entry[0] === 'create')[1], 0,
  'scripts receive no capabilities unless the game explicitly grants them');
denied.onDestroy();

const createsBeforeExcessiveStack = calls.filter((entry) => entry[0] === 'create').length;
const excessiveStack = new ScriptComponent(runtime, 'export default {}', {
  limits: { maxStackBytes: 256 * 1024 + 1 },
});
assert.equal(excessiveStack.status, 'error', 'stack values above 256 KiB are rejected');
assert.equal(calls.filter((entry) => entry[0] === 'create').length, createsBeforeExcessiveStack,
  'invalid stack limit never reaches the native runtime');
excessiveStack.dispose();

const unmounted = new ScriptComponent(runtime, 'export default {}');
assert.equal(typeof unmounted.dispose, 'function',
  'an unattached component can release its owned JavaScript runtime');
unmounted.dispose();
assert.equal(unmounted.status, 'disposed', 'explicit disposal releases an unattached script');
const unmountedDestroyCount = calls.filter((entry) => entry[0] === 'destroy').length;
unmounted.dispose();
assert.equal(calls.filter((entry) => entry[0] === 'destroy').length, unmountedDestroyCount,
  'explicit disposal is idempotent');

const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const runtimeCode = stripTypeScriptTypes(runtimeSource, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '') + '\nthis.ScriptRuntime = ScriptRuntime;';
const owningContext = { isDisposed: false, error: null };
sandbox.getGameContext = (game) => game.context;
vm.runInNewContext(runtimeCode, sandbox, { filename: runtimePath });
const ScriptRuntime = sandbox.ScriptRuntime;
const scriptRuntime = new ScriptRuntime({ context: owningContext });
const detached = new ScriptComponent(scriptRuntime, 'export default {}');
assert.equal(scriptRuntime.scriptCount, 1, 'Game runtime tracks scripts even before scene attachment');
assert.equal(detached._canAttachTo(owningContext), true, 'script accepts its own GameContext');
assert.equal(detached._canAttachTo(context), false, 'script rejects another GameContext');

const originalLoad = operations.loadScriptVm;
operations.loadScriptVm = () => false;
currentError = 'invalid guest module';
const failed = new ScriptComponent(scriptRuntime, 'export default { broken( {');
assert.equal(failed.status, 'error');
assert.equal(failed.error, 'invalid guest module');
assert.equal(scriptRuntime.scriptCount, 2,
  'failed load remains owned so it can appear in diagnostics and be disposed');
assert.ok(scriptRuntime._componentsSnapshot().includes(failed));
const failedLimits = new ScriptComponent(scriptRuntime, 'export default {}', {
  limits: { maxMemoryBytes: 1 },
});
assert.equal(failedLimits.status, 'error');
assert.equal(scriptRuntime.scriptCount, 3,
  'invalid limits remain visible and disposable');

const inspectorPath = path.join(root, 'src/debug-ui/game-inspector.ts');
const inspectorSource = fs.readFileSync(inspectorPath, 'utf8').replace(
  'constructor(private readonly game: Game, options?: boolean | GameDebugOptions) {',
  'constructor(game: Game, options?: boolean | GameDebugOptions) {\n    this.game = game;',
);
const inspectorCode = stripTypeScriptTypes(inspectorSource, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '') + '\nthis.GameInspector = GameInspector;';
sandbox.getFPS = () => 60;
vm.runInNewContext(inspectorCode, sandbox, { filename: inspectorPath });
const labels = [];
const debugUi = {
  isAvailable: () => true,
  beginWindow() {},
  label(_id, label) { labels.push(label); },
  endWindow() {},
};
const inspector = new sandbox.GameInspector({
  isReady: true,
  window: { width: 800, height: 450 },
  debugUi,
  scripting: scriptRuntime,
}, { enabled: true, metrics: false, sceneHierarchy: false, assets: false, scripts: true });
inspector.render(1 / 60);
assert.ok(labels.some((label) => label.includes('invalid guest module')),
  'Inspector renders the load failure from the real ScriptComponent registry');
assert.ok(labels.some((label) => label.includes('outside the supported')),
  'Inspector renders the limits failure from the real ScriptComponent registry');
operations.loadScriptVm = originalLoad;

scriptRuntime.dispose();
assert.equal(detached.status, 'disposed', 'Game disposal releases scripts detached from a scene');
assert.equal(failed.status, 'disposed', 'Game disposal releases failed script components');
assert.equal(failedLimits.status, 'disposed', 'Game disposal releases invalid-limit components');
assert.equal(scriptRuntime.scriptCount, 0, 'runtime disposal clears its component registry');

console.log('ScriptComponent contract fixture passed');
