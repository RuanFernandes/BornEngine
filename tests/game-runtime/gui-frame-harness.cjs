const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/core/game.ts'), 'utf8');
const contexts = new WeakMap();
const events = [];
let activeContext = null;

class Context {
  constructor() { this.error = null; this.isReady = false; this.isDisposed = false; this.resources = []; this.frameServices = []; }
  static create() { const context = new Context(); activeContext = context; return context; }
  static createFailed(message) { const context = new Context(); context.error = message; return context; }
  markFailed(message) { this.error = message; this.isReady = false; }
  markReady() { if (activeContext === this) this.isReady = true; }
  isActiveOwner() { return activeContext === this && !this.isDisposed; }
  register(resource) { if (!this.isReady || this.isDisposed) return false; if (!this.resources.includes(resource)) this.resources.push(resource); return true; }
  registerFrameService(service) {
    if (!this.register(service)) return false;
    if (!this.frameServices.includes(service)) this.frameServices.push(service);
    events.push('context.register.gui');
    return true;
  }
  unregisterFrameService(service) { this.frameServices = this.frameServices.filter((entry) => entry !== service); this.resources = this.resources.filter((entry) => entry !== service); }
  updateFrameServices(deltaTime) { for (const service of [...this.frameServices]) service.updateFrame(deltaTime); }
  disposeResources() { for (const resource of this.resources.splice(0).reverse()) resource.dispose(); }
  dispose() { this.disposeResources(); this.isReady = false; this.isDisposed = true; this.frameServices.length = 0; if (activeContext === this) activeContext = null; }
}

class Service {
  constructor() {}
  dispose() { events.push(`${this.constructor.name}.dispose`); }
  update() {}
  activate() {}
  render() {}
  clear() {}
  _beginFrame() {}
}

class Ui extends Service {
  button() { events.push('game.ui.button'); return false; }
}

class GUIManager extends Service {
  constructor(owner) { super(); this.owner = owner; this.disposed = false; events.push('gui.construct'); }
  updateFrame() { events.push('gui.update'); }
  _setViewportSize(width, height) { events.push(`gui.viewport:${width}x${height}`); }
  renderFrame() { events.push('gui.render'); }
  dispose() { if (this.disposed) return; this.disposed = true; events.push('gui.dispose'); }
}

class Window extends Service {
  constructor(owner, options = {}) {
    super(); this.owner = owner; this.context = contexts.get(owner); this.mode = options.mode || 'windowed';
    this.width = options.width || 640; this.height = options.height || 360; this.open = this.mode !== 'embedded';
    if (this.open && this.context.error === null) this.context.markReady();
  }
  get isOpen() { return this.open && this.context.isReady && !this.context.isDisposed; }
  shouldClose() { return !this.isOpen; }
  attachNativeSurface() { this.context.markReady(); this.open = true; this.owner.activateServices(); return true; }
  close() { this.open = false; events.push('window.close'); this.owner._onWindowClosed?.(); }
}

const sandbox = {
  GameContext: Context,
  CONTEXT_ALREADY_ACTIVE_ERROR: 'active',
  bindGameContext: (game, context) => contexts.set(game, context),
  getGameContext: (game) => contexts.get(game),
  Window, Renderer: Service, InputSystem: Service, AudioSystem: Service,
  SceneManager: class SceneManager extends Service { constructor() { super(); this.currentScene = null; } },
  SceneGraph: Service, TouchControls: Service, Ui, GUIManager,
  DebugUi: Service,
  GameInspector: class GameInspector extends Service { render() { events.push('inspector.render'); } },
  AssetManager: Service, ScriptRuntime: Service,
  beginDrawing: () => events.push('begin'), endDrawing: () => events.push('end'),
  getPlatform: () => 1, Platform: { WEB: 7 }, setTargetFPS: () => {}, setDirect2DMode: () => {},
  getTime: () => 0, runGame: (frame, shouldContinue) => { if (shouldContinue()) frame(1 / 60); },
  Promise, Error, String, console,
};

const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '');
vm.runInNewContext(code + '\nthis.Game = Game;', sandbox, { filename: 'game.ts' });
const Game = sandbox.Game;

async function main() {
  class Probe extends Game {
    loop() { events.push('game.loop'); this.ui.button(1, 'Confirm'); }
    render() { events.push('game.render'); }
  }
  const game = new Probe({ window: { width: 640, height: 360 } });
  assert.ok(game.gui instanceof GUIManager, 'Game exposes its retained GUI manager');
  await game.run();
  const order = ['gui.update', 'game.loop', 'game.ui.button', 'game.render', 'gui.viewport:640x360', 'gui.render', 'inspector.render'];
  let previous = -1;
  for (const event of order) {
    const current = events.indexOf(event);
    assert.ok(current > previous, `${event} should occur in frame order: ${events.join(', ')}`);
    previous = current;
  }
  assert.ok(events.includes('context.register.gui'), 'the GUI joins the active context frame services');
  assert.ok(events.includes('gui.dispose'), 'Game disposal releases the GUI manager');
  assert.equal(game.gui.disposed, true);

  events.length = 0;
  const embedded = new Game({ window: { mode: 'embedded' } });
  assert.equal(events.includes('context.register.gui'), false, 'an unattached embedded Game does not activate GUI frame work');
  embedded.window.attachNativeSurface(1, 320, 200);
  assert.equal(events.includes('context.register.gui'), true, 'embedded attachment activates GUI frame work');
  embedded.dispose();
  console.log('GUI frame lifecycle, render ordering, embedded activation, and disposal passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
