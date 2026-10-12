import assert from 'node:assert/strict';
import test from 'node:test';

import { Asset, bindAnnotations, GameComponent } from '../src/game/annotations.ts';
import { GameComponent as Component } from '../src/game/game-component.ts';

const metadata = new WeakMap();

function slotsOf(target) {
  if (!metadata.has(target)) metadata.set(target, new Map());
  return metadata.get(target);
}

Reflect.defineMetadata = (key, value, target, propertyKey) => {
  slotsOf(target).set(propertyKey === undefined ? key : `${key}:${propertyKey}`, value);
};
Reflect.getOwnMetadata = (key, target) => slotsOf(target).get(key);
Reflect.getMetadata = (key, target, propertyKey) => slotsOf(target).get(`${key}:${propertyKey}`);

function annotate(prototype, key, decorator, designType) {
  if (designType !== undefined) Reflect.defineMetadata('design:type', designType, prototype, key);
  decorator(prototype, key);
}

class FakeObject {
  addComponent(component) {
    return component._setGameObject(this) ? component : null;
  }
}

function sceneWith(loadTexture, reloadTexture = loadTexture) {
  return { _loadTexture: loadTexture, _reloadTexture: reloadTexture };
}

const loadedTexture = (path) => ({ path, isLoaded: true, error: null });
const failedTexture = (path, error) => ({ path, isLoaded: false, error });

class Health extends Component {}

class Player extends FakeObject {}
annotate(Player.prototype, 'head', Asset('assets/head.png'));
annotate(Player.prototype, 'health', GameComponent(), Health);

class Boss extends Player {}
annotate(Boss.prototype, 'sprite', Asset('assets/boss.png'));

test('bindAnnotations loads @Asset textures and attaches @GameComponent instances', () => {
  const player = new Player();
  assert.equal(bindAnnotations(player, sceneWith(loadedTexture)), null);
  assert.equal(player.head.path, 'assets/head.png');
  assert.ok(player.health instanceof Health);
  assert.equal(player.health.gameObject, player);
});

test('bindAnnotations includes annotations inherited from parent classes', () => {
  const boss = new Boss();
  bindAnnotations(boss, sceneWith(loadedTexture));
  assert.equal(boss.head.path, 'assets/head.png');
  assert.equal(boss.sprite.path, 'assets/boss.png');
  assert.ok(boss.health instanceof Health);
});

test('bindAnnotations runs each object once', () => {
  let loads = 0;
  const player = new Player();
  const scene = sceneWith((path) => {
    loads += 1;
    return loadedTexture(path);
  });
  bindAnnotations(player, scene);
  assert.equal(bindAnnotations(player, scene), null);
  assert.equal(loads, 1);
});

test('@Asset throws the texture error by default when loading fails', () => {
  const player = new Player();
  assert.throws(
    () => bindAnnotations(player, sceneWith(() => failedTexture('missing.png', 'file not found'))),
    { name: 'Error', message: 'file not found' },
  );
});

test('@Asset throws a path message by default when the texture has no error text', () => {
  const player = new Player();
  assert.throws(
    () => bindAnnotations(player, sceneWith(() => failedTexture('missing.png', null))),
    /Could not load assets\/head\.png/,
  );
});

test('@Asset throws when the scene has no asset manager', () => {
  const player = new Player();
  assert.throws(() => bindAnnotations(player, sceneWith(() => null)), /scene has no asset manager/);
});

test('errCallback receives the error, the path and retry, and its return value fills the field', () => {
  const fallback = loadedTexture('fallback.png');
  const received = [];
  class Sprite extends FakeObject {}
  annotate(
    Sprite.prototype,
    'image',
    Asset('missing.png', (error, path, retry) => {
      received.push([error, path, typeof retry]);
      return fallback;
    }),
  );
  const sprite = new Sprite();
  assert.equal(bindAnnotations(sprite, sceneWith(() => failedTexture('missing.png', 'file not found'))), null);
  assert.equal(sprite.image, fallback);
  assert.deepEqual(received, [['file not found', 'missing.png', 'function']]);
});

test('errCallback can return null', () => {
  class Sprite extends FakeObject {}
  annotate(Sprite.prototype, 'image', Asset('missing.png', () => null));
  const sprite = new Sprite();
  bindAnnotations(sprite, sceneWith(() => failedTexture('missing.png', 'file not found')));
  assert.equal(sprite.image, null);
});

test('retry returns the texture once the scene can load it', () => {
  let downloaded = false;
  class Sprite extends FakeObject {}
  annotate(
    Sprite.prototype,
    'image',
    Asset('chart.png', (error, path, retry) => {
      downloaded = true;
      return retry();
    }),
  );
  const scene = sceneWith(
    (path) => failedTexture(path, 'not found'),
    (path) => (downloaded ? loadedTexture(path) : failedTexture(path, 'not found')),
  );
  const sprite = new Sprite();
  bindAnnotations(sprite, scene);
  assert.equal(sprite.image.path, 'chart.png');
  assert.equal(sprite.image.isLoaded, true);
});

test('retry throws the default error when the scene still cannot load the asset', () => {
  class Sprite extends FakeObject {}
  annotate(Sprite.prototype, 'image', Asset('chart.png', (error, path, retry) => retry()));
  assert.throws(
    () => bindAnnotations(new Sprite(), sceneWith((path) => failedTexture(path, 'not found'))),
    { name: 'Error', message: 'not found' },
  );
});

test('async errCallback defers the binding until its promise resolves', async () => {
  let downloaded = false;
  class Sprite extends FakeObject {}
  annotate(
    Sprite.prototype,
    'image',
    Asset('chart.png', async (error, path, retry) => {
      await Promise.resolve();
      downloaded = true;
      return retry();
    }),
  );
  const scene = sceneWith((path) => (downloaded ? loadedTexture(path) : failedTexture(path, 'not found')));
  const sprite = new Sprite();
  const pending = bindAnnotations(sprite, scene);
  assert.ok(pending !== null && typeof pending.then === 'function');
  assert.equal(sprite.image, undefined);
  await pending;
  assert.equal(sprite.image.path, 'chart.png');
  assert.equal(bindAnnotations(sprite, scene), null);
});

test('a rejected async errCallback rejects the binding promise', async () => {
  class Sprite extends FakeObject {}
  annotate(
    Sprite.prototype,
    'image',
    Asset('chart.png', async () => {
      throw new Error('download failed');
    }),
  );
  const pending = bindAnnotations(new Sprite(), sceneWith(() => failedTexture('chart.png', 'not found')));
  await assert.rejects(pending, /download failed/);
});

test('@GameComponent throws when the component cannot attach', () => {
  class Stuck extends FakeObject {
    addComponent() {
      return null;
    }
  }
  annotate(Stuck.prototype, 'health', GameComponent(), Health);
  assert.throws(() => bindAnnotations(new Stuck(), sceneWith(loadedTexture)), /Could not attach "health" component/);
});

test('@GameComponent rejects classes whose constructor needs runtime objects', () => {
  class NeedsWorld extends Component {
    constructor(world, options) {
      super();
      this.world = world;
      this.options = options;
    }
  }
  class Holder extends FakeObject {}
  assert.throws(() => annotate(Holder.prototype, 'body', GameComponent(), NeedsWorld), /takes runtime objects/);
});

test('@GameComponent requires a class design type', () => {
  class Untyped extends FakeObject {}
  assert.throws(() => GameComponent()(Untyped.prototype, 'health'), /needs a class type/);
});

class Tuned extends Component {
  constructor(options) {
    super();
    this.options = options;
  }
}

class Crate extends FakeObject {}
annotate(Crate.prototype, 'tuning', GameComponent({ strength: 3 }), Tuned);

test('@GameComponent passes its options object to the component constructor', () => {
  const crate = new Crate();
  bindAnnotations(crate, sceneWith(loadedTexture));
  assert.deepEqual(crate.tuning.options, { strength: 3 });
});

test('@GameComponent without options constructs the component with no argument', () => {
  class Plain extends Component {
    constructor(...args) {
      super();
      this.received = args.length;
    }
  }
  class Holder extends FakeObject {}
  annotate(Holder.prototype, 'plain', GameComponent(), Plain);
  const holder = new Holder();
  bindAnnotations(holder, sceneWith(loadedTexture));
  assert.equal(holder.plain.received, 0);
});
