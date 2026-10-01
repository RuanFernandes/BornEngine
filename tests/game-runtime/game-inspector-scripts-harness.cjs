const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const inspectorPath = path.join(root, 'src/debug-ui/game-inspector.ts');

class FakeDebugUi {
  windows = [];
  windowRects = [];
  labels = [];

  isAvailable() { return true; }
  beginWindow(_id, title, x, y, width, height) {
    this.windows.push(title);
    this.windowRects.push({ title, x, y, width, height });
  }
  label(_id, text) { this.labels.push(text); }
  endWindow() {}
  beginTreeNode() { return false; }
  endTreeNode() {}
}

const source = fs.readFileSync(inspectorPath, 'utf8').replace(
  'constructor(private readonly game: Game, options?: boolean | GameDebugOptions) {',
  'constructor(game: Game, options?: boolean | GameDebugOptions) {\n    this.game = game;',
);
const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '') + '\nthis.GameInspector = GameInspector;';
const sandbox = { GameComponent: class GameComponent {}, getFPS: () => 60 };
vm.runInNewContext(code, sandbox, { filename: inspectorPath });
const GameInspector = sandbox.GameInspector;

const script = {
  status: 'error',
  error: 'invalid guest module',
  memoryUsed: 10 * 1024,
  lastCallbackMs: 1.25,
  gameObject: { id: 7, name: 'Actor' },
};
const debugUi = new FakeDebugUi();
const game = {
  isReady: true,
  window: { width: 800, height: 450 },
  debugUi,
  renderer: {
    stats: {
      fps: 60,
      frameIntervalMs: 16.67,
      drawSubmissions2D: 0,
      spritesDrawn: 0,
      spritesCulled: 0,
    },
  },
  stats: {
    updateTimeMs: 2.5,
    renderTimeMs: 3.75,
    objectCount: 5,
    activeObjectCount: 3,
    componentCount: 8,
    activeComponentCount: 6,
  },
  scenes: { currentScene: null },
  assets: { textureCount: 0 },
  scripting: {
    isSupported: true,
    _componentsSnapshot() { return [script]; },
  },
};

const inspector = new GameInspector(game, {
  enabled: true,
  metrics: false,
  sceneHierarchy: false,
  assets: false,
  scripts: true,
});
inspector.render(1 / 60);

assert.ok(debugUi.windows.includes('BornEngine | Scripts'),
  'Game.debug can show a dedicated scripting diagnostics panel');
const scriptsRect = debugUi.windowRects.find(({ title }) => title === 'BornEngine | Scripts');
assert.ok(scriptsRect.x >= 0 && scriptsRect.y >= 0 &&
  scriptsRect.x + scriptsRect.width <= game.window.width &&
  scriptsRect.y + scriptsRect.height <= game.window.height,
  'the scripting diagnostics panel starts fully inside the game window');
assert.ok(debugUi.labels.some((label) => label.includes('Actor #7')),
  'script diagnostics identify the owning GameObject');
assert.ok(debugUi.labels.some((label) => label.includes('error')),
  'script diagnostics show the current status');
assert.ok(debugUi.labels.some((label) => label.includes('KiB')),
  'script diagnostics show guest memory use');
assert.ok(debugUi.labels.some((label) => label.includes('1.25') && label.includes('ms')),
  'script diagnostics show the last callback cost');
assert.ok(debugUi.labels.some((label) => label.includes('invalid guest module')),
  'script diagnostics show the current guest error');

const hiddenUi = new FakeDebugUi();
const hiddenInspector = new GameInspector({ ...game, debugUi: hiddenUi }, {
  enabled: true,
  metrics: false,
  sceneHierarchy: false,
  assets: false,
  scripts: false,
});
hiddenInspector.render(1 / 60);
assert.ok(!hiddenUi.windows.includes('BornEngine | Scripts'),
  'Game.debug can hide scripting diagnostics independently');

const metricsUi = new FakeDebugUi();
const metricsInspector = new GameInspector({ ...game, debugUi: metricsUi }, {
  enabled: true,
  metrics: true,
  sceneHierarchy: false,
  assets: false,
  scripts: false,
});
metricsInspector.render(1 / 60);
assert.ok(metricsUi.labels.some((label) => label === 'Update: 2.5 ms'),
  'performance diagnostics show update cost');
assert.ok(metricsUi.labels.some((label) => label === 'Render: 3.75 ms'),
  'performance diagnostics show render cost');
assert.ok(metricsUi.labels.some((label) => label === 'Objects: 3 active / 5 total'),
  'performance diagnostics show active and total scene objects');
assert.ok(metricsUi.labels.some((label) => label === 'Components: 6 active / 8 total'),
  'performance diagnostics show active and total scene components');

console.log('GameInspector scripting contract fixture passed');
