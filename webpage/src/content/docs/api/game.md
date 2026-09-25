---
title: Game objects
description: Build class-based gameplay entities with GameObject, components, transforms, scenes, and native-resource adapters.
section: API / Game
order: 31
---

The `@bornengine/engine/game` module adds an optional object-oriented runtime for gameplay code. Extend `GameObject` for entities such as players and NPCs, attach reusable `GameComponent` classes, and add objects to a `GameScene` to receive lifecycle callbacks.

The runtime stays in TypeScript and wraps existing engine handles. You can keep using the direct function-based modules for rendering, physics, audio, and resource management. The package root also re-exports the Game API, but the subpath makes this dependency explicit.

## Game objects and components

Subclass `GameObject` and add an instance to a scene:

```ts
import { GameObject, GameScene } from '@bornengine/engine/game';

class Player extends GameObject {
  constructor() {
    super({ name: 'Player' });
  }

  update(dt: number): void {
    this.transform.position.x += dt * 5;
  }
}

const scene = new GameScene();
const player = new Player();
scene.add(player);
```

`GameObject` can also be constructed directly. Its options include `name`, `active`, `position`, `rotation`, and `scale`; transform values are copied. The runtime `id` is for identifying the TypeScript object and is not a renderer or physics handle.

Components package behavior that can be attached to an object. Look them up by class:

```ts
import { GameComponent, GameObject } from '@bornengine/engine/game';

class Health extends GameComponent {
  value = 100;
}

const player = new GameObject({ name: 'Player' });
player.addComponent(new Health());
const health = player.getComponent(Health);
```

An object may have multiple components of one type. `getComponent` returns the first match; `getComponents` returns all matches in attachment order. A component can belong to one object at a time. Removing it calls `onDestroy`, clears its `gameObject`, and ends its lifetime.

## Transforms and hierarchy

`transform.position`, `rotation`, and `scale` describe local space. Use `worldPosition`, `worldRotation`, `worldScale`, `localMatrix`, or `worldMatrix` when you need world-space values. `setWorldPosition` and `setWorldRotation` convert through the parent transform.

Parenting preserves the child's world transform by default. Pass `{ preserveWorldTransform: false }` to keep its local transform instead. With world preservation enabled, `addChild` returns `null` and leaves the hierarchy unchanged if the parent transform is singular or the resulting local transform would require shear, which cannot be represented by position, rotation, and scale:

```ts
const weapon = new GameObject({ name: 'Weapon', position: { x: 0.5, y: 0, z: 0 } });
player.addChild(weapon, { preserveWorldTransform: false });
```

`addChild` rejects cycles and cross-scene links. `removeChild` detaches a child and preserves its world transform by default; it does not destroy it. `children` and `GameScene.objects` return snapshots, and the scene list includes descendants.

## Scenes and lifecycle

`GameScene.add(root)` attaches a detached root and its subtree. The scene awakens each object once; `onAwake` runs when the object enters a scene, even when it is inactive. An object's callback runs before its components and child objects. Components and children are awakened in their owner's attachment order. A component added to an awake object receives `onAwake` immediately when no awake traversal is in progress. Components and child subtrees added from an `onAwake` callback are picked up by that traversal before the outer scene attachment returns.

`active` is the object's local activation flag; `activeInHierarchy` also checks its ancestors. `scene.update(dt)` runs active objects in scene insertion order. The first eligible update calls `onStart` and then `update`; each enabled component follows the same start/update sequence. `scene.updateFixed(fixedDt)` dispatches `fixedUpdate` callbacks and does not start objects by itself. Activation and component state are checked before each callback.

Each update phase uses a stable snapshot. Objects or components added during an update or fixed-update callback receive `onAwake` immediately and wait until the next matching phase for update callbacks. Additions during an awake traversal follow the ordering described above. Removing or destroying an instance suppresses later callbacks from its old snapshot. Removing and re-adding an object also invalidates that snapshot entry.

Destruction is synchronous and idempotent. Children are destroyed before their parent; an object's `onDestroy` runs before its components in reverse attachment order. `scene.remove(object)` detaches a live subtree. `scene.destroy()` destroys remaining roots and prevents future additions.

## Native adapters

Adapters connect runtime objects to resources created through existing engine modules. Their constructors do not create renderer nodes, physics worlds, bodies, shapes, sounds, or assets.

Adapter synchronization follows attached objects even when gameplay callbacks are disabled by an inactive object or disabled component.

- `SceneNodeComponent` wraps an existing `SceneNodeHandle`. A renderer adapter on the parent supplies the child's local transform; without one, the child adapter supplies its world transform. Ownership defaults to `borrowed`. Removing the component unparents the node; an owned node is destroyed.
- `RigidBodyComponent` wraps an existing world and body and requires a `motionType`. Static and kinematic bodies receive the object's transform before the physics step. Dynamic bodies write position and rotation back after the step. Ownership defaults to `borrowed`; the world and shape remain caller-owned.
- `AudioSourceComponent` references a shared `Sound` and owns only its playback voice. Playback defaults to non-looping with `refDist: 1`, `maxDist: 0`, and `rolloff: 1`. `play()` returns `false` if the component has no live owner or the sound cannot start; `stop()` is safe to call more than once. The component does not unload the shared sound.

For example, create a renderer node with the scene module, then attach an adapter to an object:

```ts
import { createSceneNode } from '@bornengine/engine/scene';
import { SceneNodeComponent } from '@bornengine/engine/game';

const node = createSceneNode();
player.addComponent(new SceneNodeComponent(node, { ownership: 'owned' }));
```

## Physics step

Physics remains caller-owned. Run gameplay fixed updates, synchronize kinematic/static transforms, step the existing physics world, then copy dynamic body transforms back into the object hierarchy:

```ts
import { step } from '@bornengine/engine/physics';

scene.updateFixed(fixedDt);
scene.syncPhysicsBeforeStep(world, fixedDt);
step(world, fixedDt);
scene.syncPhysicsAfterStep(world);
```

`GameScene` does not create or step a physics world. Call this sequence from the fixed-step part of your game loop.

## Serialized worlds

`GameScene` owns runtime-created TypeScript objects. `WorldData` and `instantiateWorld` continue to load the existing serialized world format and create renderer handles; they do not choose or construct your `GameObject` subclasses. Create your gameplay objects in TypeScript and connect them to engine resources explicitly.
