---
title: Game objects
description: Compose gameplay behavior from objects, components, scenes, and owner-bound resources.
section: API / Game
order: 31
---

Game objects are a gameplay layer built on the same Game-owned runtime. They provide identity, transforms, hierarchy, components, and lifecycle callbacks; resources remain explicit instances owned by a Game.

## Game objects and components

```ts
import { GameComponent, GameObject } from '@bornengine/engine/game';

class Health extends GameComponent { value = 100; }
class Player extends GameObject {
  constructor() { super({ name: 'Player' }); }
  update(deltaTime: number): void { this.transform.position.x += 5 * deltaTime; }
}

const player = new Player();
player.addComponent(new Health());
const health = player.getComponent(Health);
```

Objects can be constructed without a native handle. A component belongs to one object at a time and receives the object's scene lifecycle.

## Transforms and hierarchy

Transforms expose local position, rotation, and scale plus world-space accessors and matrices. Parenting preserves the child's world transform by default; pass `preserveWorldTransform: false` when local coordinates should remain unchanged. Cycles and cross-scene links are rejected.

```ts
const weapon = new GameObject({ name: 'Weapon', position: { x: 0.5, y: 0, z: 0 } });
player.addChild(weapon, { preserveWorldTransform: false });
console.log(weapon.worldPosition);
```

## Scenes and lifecycle

A GameScene binds gameplay objects to one Game. Adding a root attaches its subtree and awakens each object once. Scene updates call `onStart` once before `update`; destruction calls object and component cleanup. Use the owning Game for scene construction and updates.

```ts
import { Game, GameObject, GameScene } from '@bornengine/engine';

const game = new Game();
const scene = new GameScene(game);
scene.add(new GameObject({ name: 'Marker' }));
game.run({
  update(deltaTime) { scene.update(deltaTime); },
  render() {},
  onStop: () => game.dispose(),
});
```

## Scene manager

`game.scenes` transitions between Scene subclasses and forwards update, pause, resume, and unload lifecycle. The application decides when gameplay updates run.

```ts
import { Game, Scene } from '@bornengine/engine';
const game = new Game();

class MenuScene extends Scene {
  constructor(game: Game) { super(game, { name: 'Menu' }); }
  onEnter(): void { console.log('menu entered'); }
}
game.scenes.changeTo(new MenuScene(game));
```

## Native adapters

Components such as `SceneNodeComponent`, `RigidBodyComponent`, and `AudioSourceComponent` connect gameplay objects to renderer, physics, or audio resources. Attach only resources created by the same Game; adapters reject mismatched ownership rather than passing stale native identity.

## OOP renderer nodes

`game.sceneGraph.createNode()` creates retained renderer nodes. Attach a Game-owned model and set node transforms or material values on the node instance; its native identity stays private.

```ts
import { Game, Model } from '@bornengine/engine';
const game = new Game();
const statue = new Model(game, 'assets/statue.glb');
const node = game.sceneGraph.createNode({ name: 'Statue' });
if (statue.isLoaded) node.attachModel(statue);
node.setTrs({ x: 0, y: 0, z: -5 }, 0, 1);
```

## Physics step

`PhysicsWorld` can use `game.scenes` to synchronize attached physics components around each step. Call one `world.step(deltaTime)` from update; do not step again from an adapter.

## Serialized worlds

`WorldData` holds versioned world data, validates and saves it, then creates an owned `WorldInstance` using a model resolver. See the [world API](../world/) for schema and loading details.
