import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { AssetManager } from '../../src/assets/asset-manager';
import type { Texture } from '../../src/textures/texture';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

class FakeTexture {
  isDisposed = false;
  disposeCalls = 0;

  dispose(): void {
    this.disposeCalls++;
    this.isDisposed = true;
  }
}

const owner = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: test Game context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(owner, context);

const manager = new AssetManager(owner);
const managerState = manager as any;
const hero = new FakeTexture();
const background = new FakeTexture();
const heroTexture = hero as any as Texture;
const backgroundTexture = background as any as Texture;
managerState.textures.set('hero.png', heroTexture);
managerState.paths.push('hero.png');
managerState.textures.set('background.png', backgroundTexture);
managerState.paths.push('background.png');

expect(manager.getTexture('hero.png') === heroTexture,
  'getTexture returns the cached texture without loading');
expect(manager.loadTexture('hero.png') === heroTexture,
  'loadTexture preserves cached identity');
expect(manager.getTexture('missing.png') === null,
  'getTexture does not load missing entries');
expect(manager.textureCount === 2, 'textureCount reports cached live entries');
expect(manager.loadTexture('') === null && manager.getTexture('') === null &&
  !manager.releaseTexture(''), 'empty paths are rejected safely');

hero.dispose();
expect(manager.getTexture('hero.png') === null && manager.textureCount === 1,
  'externally disposed textures are evicted from the cache');
expect(manager.releaseTexture('background.png') && background.isDisposed &&
  manager.getTexture('background.png') === null,
  'releaseTexture disposes and removes a cached entry');
expect(!manager.releaseTexture('background.png'), 'releasing a missing entry is safe');

const first = new FakeTexture();
const second = new FakeTexture();
managerState.textures.set('first.png', first as any as Texture);
managerState.paths.push('first.png');
managerState.textures.set('second.png', second as any as Texture);
managerState.paths.push('second.png');
manager.clear();
expect(manager.textureCount === 0 && first.isDisposed && second.isDisposed,
  'clear disposes every cached texture and leaves the manager reusable');

const retained = new FakeTexture();
managerState.textures.set('retained.png', retained as any as Texture);
managerState.paths.push('retained.png');
manager.dispose();
manager.dispose();
expect(manager.isDisposed && retained.isDisposed && manager.textureCount === 0,
  'dispose releases cache entries and is idempotent');
expect(manager.loadTexture('after-dispose.png') === null &&
  manager.getTexture('retained.png') === null && !manager.releaseTexture('retained.png'),
  'disposed managers reject further cache operations');

context.dispose();
console.log('AssetManager cache fixture passed');
