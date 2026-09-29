import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { AssetGroup } from '../../src/assets/asset-group';
import type { AssetGroupLoader } from '../../src/assets/asset-group';
import type { Texture } from '../../src/textures/texture';
import type { Sound } from '../../src/audio/sound';
import type { Music } from '../../src/audio/music';
import { Scene } from '../../src/game/scene';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

class FakeAsset {
  isLoaded: boolean;
  isDisposed = false;
  disposeCalls = 0;
  error: string | null;

  constructor(loaded: boolean) {
    this.isLoaded = loaded;
    this.error = loaded ? null : 'fixture load failure';
  }

  dispose(): void {
    this.disposeCalls++;
    this.isDisposed = true;
  }
}

async function main(): Promise<void> {
  const owner = {} as Game;
  const context = GameContext.create();
  if (context === null) {
    console.error('FAIL: test Game context is available');
    process.exit(1);
  }
  context.markReady();
  bindGameContext(owner, context);

  const cachedTexture = new FakeAsset(true);
  const failedTexture = new FakeAsset(false);
  const sharedSound = new FakeAsset(true);
  const sharedMusic = new FakeAsset(true);
  const textureLoads: string[] = [];
  const soundLoads: string[] = [];
  const musicLoads: string[] = [];
  const textureCache = new Map<string, FakeAsset>();
  const groups: AssetGroup[] = [];
  const loader: AssetGroupLoader = {
    loadTexture: (path) => {
      textureLoads.push(path);
      if (path === 'broken.png') return failedTexture as any as Texture;
      let texture = textureCache.get(path);
      if (texture === undefined) {
        texture = cachedTexture;
        textureCache.set(path, texture);
      }
      return texture as any as Texture;
    },
    loadSound: async (path) => {
      soundLoads.push(path);
      return sharedSound as any as Sound;
    },
    loadMusic: async (path) => {
      musicLoads.push(path);
      return sharedMusic as any as Music;
    },
    removeGroup: (group) => {
      const index = groups.indexOf(group);
      if (index >= 0) groups.splice(index, 1);
    },
  };

  const createGroup = (name: string): AssetGroup => {
    const group = new AssetGroup(name, loader, context);
    groups.push(group);
    return group;
  };
  const group = createGroup('boot');
  expect(group.addTexture('hero.png'), 'group accepts texture entries');
  expect(!group.addTexture('hero.png') && group.entryCount === 1,
    'duplicate kind and path entries are ignored');
  expect(group.addTexture('broken.png') && group.addSound('ui.wav') &&
    group.addMusic('theme.ogg'), 'group accepts sound and music entries');

  let lastProgress = group.progress;
  const pendingLoad = group.load();
  expect(group.state === 'loading', 'group enters loading state');
  const partialProgress = group.progress;
  expect(partialProgress >= lastProgress && partialProgress <= 1,
    'group progress stays within its monotonic range while staged entries run');
  lastProgress = partialProgress;
  await pendingLoad;
  expect(group.progress >= lastProgress, 'group progress stays monotonic through completion');
  expect(group.progress === 1 && group.state === 'failed',
    'mixed asset results finish with complete progress and a failed aggregate state');
  expect(group.entries[0].state === 'ready' && group.entries[0].result === cachedTexture as any,
    'entry exposes the cached texture result');
  expect(group.entries[1].state === 'failed' && group.entries[1].error !== null,
    'entry preserves a specific failed-load error');
  expect(textureLoads.length === 2 && soundLoads.length === 1 && musicLoads.length === 1,
    'each distinct entry loads once');

  const secondGroup = createGroup('menu');
  secondGroup.addTexture('hero.png');
  await secondGroup.load();
  expect(textureLoads.filter((path) => path === 'hero.png').length === 2,
    'groups request the same cached asset through AssetManager');
  expect(secondGroup.entries[0].result === group.entries[0].result,
    'preload groups share the AssetManager cached resource instance');

  const textureScene = new Scene(owner);
  const sceneOwned = createGroup('scene-owned');
  expect(sceneOwned !== null && textureScene.own(sceneOwned) === sceneOwned,
    'scene can own group metadata');
  if (sceneOwned !== null) {
    sceneOwned.addTexture('hero.png');
    await sceneOwned.load();
    textureScene.unload();
    expect(sceneOwned.isDisposed && cachedTexture.disposeCalls === 0,
      'scene disposal releases group references without disposing shared assets');
  }

  let finishCancelledLoad: ((asset: Sound) => void) | null = null;
  const delayedLoader: AssetGroupLoader = {
    loadTexture: loader.loadTexture,
    loadSound: (_path) => new Promise((resolve) => { finishCancelledLoad = resolve; }),
    loadMusic: loader.loadMusic,
    removeGroup: loader.removeGroup,
  };
  const cancelledGroup = new AssetGroup('cancelled', delayedLoader, context);
  groups.push(cancelledGroup);
  cancelledGroup.addSound('slow.wav');
  const cancelledLoad = cancelledGroup.load();
  cancelledGroup.cancel();
  if (finishCancelledLoad !== null) finishCancelledLoad(sharedSound as any as Sound);
  await cancelledLoad;
  expect(cancelledGroup.state === 'cancelled' &&
    cancelledGroup.entries[0].state === 'cancelled' && cancelledGroup.progress === 1,
    'cancellation settles unresolved entries without disposing their Game-owned resources');

  context.dispose();
  expect(group.isDisposed && secondGroup.isDisposed,
    'Game context disposal releases every remaining group');
  expect(sharedSound.disposeCalls === 0 && sharedMusic.disposeCalls === 0,
    'group disposal never double-disposes audio owned by AudioSystem');
  expect(groups.length === 0, 'disposed groups unregister from their manager');
  console.log('AssetGroup lifecycle fixture passed');
}

main();
