const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(root + '/src/assets/asset-manager.ts', 'utf8')
  .replace('constructor(private readonly game: Game) {', 'constructor(game: Game) { this.game = game;');
const disposed = [];

class Context {
  constructor() { this.isReady = true; this.isDisposed = false; }
  register() { return true; }
  unregister() { return true; }
}

function resourceType(name) {
  return class {
    static _create(game, ...args) { return new this(game, ...args); }
    constructor(game, ...args) {
      this.game = game;
      this.args = args;
      this.isLoaded = true;
      this.isDisposed = false;
      this.error = null;
      this.name = name;
    }
    dispose() {
      if (this.isDisposed) return;
      this.isDisposed = true;
      disposed.push(this.name);
    }
  };
}

const sandbox = {
  GameContext: Context,
  getGameContext: (game) => game.context,
  Texture: resourceType('texture'),
  Model: resourceType('model'),
  Mesh: resourceType('mesh'),
  Material: resourceType('material'),
  Animation: resourceType('animation'),
  Font: resourceType('font'),
  ImageData: resourceType('image-data'),
  ImageDataResource: resourceType('image-data'),
  RenderTexture: resourceType('render-texture'),
  Sound: resourceType('sound'),
  Music: resourceType('music'),
  AssetGroup: class {
    constructor(name, loader) { this.name = name; this.loader = loader; this.isDisposed = false; }
    dispose() { this.isDisposed = true; }
  },
};

const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '');
vm.runInNewContext(code + '\nthis.AssetManager = AssetManager;', sandbox, { filename: 'asset-manager.ts' });

async function run() {
const game = {
  context: new Context(),
  audio: {
    loadSound: (path) => Object.assign(new sandbox.Sound(game, path), { path }),
    loadMusic: (path) => Object.assign(new sandbox.Music(game, path), { path }),
    loadSoundAsync: async (path) => Object.assign(new sandbox.Sound(game, path), { path }),
    loadMusicAsync: async (path) => Object.assign(new sandbox.Music(game, path), { path }),
  },
};
const assets = new sandbox.AssetManager(game);

const texture = assets.loadTexture('player.png');
assert.equal(assets.loadTexture('player.png'), texture, 'cache repeated texture loads');
assert.equal(assets.textureCount, 1, 'count cached textures');

const model = assets.loadModel('level.glb');
assert.equal(assets.loadModel('level.glb'), model, 'cache repeated model loads');
const font = assets.loadFont('ui.ttf', 20);
assert.equal(assets.loadFont('ui.ttf', 20), font, 'cache font loads by path and size');
assert.notEqual(assets.loadFont('ui.ttf', 24), font, 'keep different font sizes independent');
const sound = assets.loadSound('step.wav');
assert.equal(assets.loadSound('step.wav'), sound, 'cache sound effects by path');
const music = assets.loadMusic('theme.ogg');
assert.equal(assets.loadMusic('theme.ogg'), music, 'cache streamed music by path');
const preload = assets.createGroup('boot');
const preloadedSound = await preload.loader.loadSound('preload.wav');
const preloadedMusic = await preload.loader.loadMusic('preload.ogg');
assert.equal(assets.loadSound('preload.wav'), preloadedSound, 'preloaded sounds join the manager cache');
assert.equal(assets.loadMusic('preload.ogg'), preloadedMusic, 'preloaded music joins the manager cache');

const mesh = assets.createMesh([0, 0, 0], [0]);
const material = assets.createMaterial('shader', 'opaque');
const animation = assets.createAnimation('character.glb');
const image = assets.createImageData('portrait.png');
const renderTexture = assets.createRenderTexture(64, 32);
const imageTexture = assets.createTexture(image);
assert.equal(mesh.args.length, 2, 'create meshes from vertex and index buffers');
assert.equal(material.args[1], 'opaque', 'create typed materials');
assert.equal(animation.args[0], 'character.glb', 'create independent animation controllers');
assert.equal(image.args[0], 'portrait.png', 'load CPU image data through the manager');
assert.deepEqual(renderTexture.args, [64, 32], 'create offscreen render targets through the manager');

assets.clear();
for (const resource of [texture, model, font, sound, music, mesh, material, animation, image, renderTexture, imageTexture]) {
  assert.equal(resource.isDisposed, true, 'clear releases every manager-owned resource');
}
assert.equal(assets.textureCount, 0, 'clear empties cached assets but keeps the manager usable');
assert.ok(assets.loadTexture('retry.png'), 'manager remains usable after clear');

const sceneAssets = new sandbox.AssetManager(game, {});
const sceneTexture = sceneAssets.loadTexture('scene.png');
sceneAssets.dispose();
assert.equal(sceneTexture.isDisposed, true, 'disposing a scene asset scope releases its resources');
assert.equal(sceneAssets.loadTexture('late.png'), null, 'disposed scene scopes reject new loads');

assets.dispose();
assert.equal(assets.loadTexture('late.png'), null, 'disposed game asset managers reject new loads');
console.log('Asset manager factory, cache, scope, and disposal contract passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
