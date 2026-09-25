# Game Objects and Components

The `@bornengine/engine/game` module provides an optional object-oriented
runtime for gameplay code. `GameObject`, `GameComponent`, `Transform`,
`GameScene`, and your subclasses stay in Perry-compiled TypeScript. Renderer,
physics, and audio adapters pass only existing numeric handles and primitive
values to native code.

The function-based modules remain available for direct control. Both APIs use
the same engine resources.

## Create game objects

Extend `GameObject` to define the objects used by your game:

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

`GameObjectOptions` accepts `name`, `active`, `position`, `rotation`, and
`scale`. Transform values passed to the constructor are copied. Each object gets
a runtime `id`; it is not a renderer or physics handle.

## Add components

Components hold behavior or adapt an existing engine resource. Pass a component
instance to `addComponent`, then look it up by its class:

```ts
import { GameComponent } from '@bornengine/engine/game';

class Health extends GameComponent {
  value = 100;
}

const health = player.addComponent(new Health());
const currentHealth = player.getComponent(Health);
```

An object can have multiple components of the same type. `getComponent` returns
the first match in attachment order; `getComponents` returns all matching
components in that order. A component belongs to one object at a time. Removing
it calls `onDestroy`, clears `gameObject`, and ends that component's lifetime.

## Transforms and parenting

`transform.position`, `rotation`, and `scale` are local values. The transform
also exposes `worldPosition`, `worldRotation`, `worldScale`, `localMatrix`, and
`worldMatrix`. `setWorldPosition` and `setWorldRotation` convert world values
through the parent transform.

Parenting preserves world transform by default:

```ts
const child = new GameObject({ position: { x: 2, y: 0, z: 0 } });
const attached = parent.addChild(child);
```

Pass `{ preserveWorldTransform: false }` to keep the child's local transform.
Parenting rejects cycles and cross-scene relationships. Preserve-world changes
return `null` or `false` without changing the hierarchy when a singular parent
or shear-producing result cannot be represented as position, rotation, and
scale. `removeChild` detaches a child but keeps it alive.

`children` and `GameScene.objects` are snapshots. `GameScene.objects` follows
scene insertion order and includes descendants.

## Activation and lifecycle

`active` is the object's local flag. `activeInHierarchy` is false when the
object or any ancestor is inactive. Components have their own `enabled` flag;
`isActiveAndEnabled` also requires a live owner.

Adding an object to a scene calls `onAwake` once, even if the object is
inactive. A subtree awakens parent first: each object's `onAwake`, its
components in attachment order, then its children in child order. A component
added to an awake object receives `onAwake` immediately when no awake traversal
is in progress. Components and child subtrees added by an `onAwake` callback are
picked up by that traversal before the outer scene attachment returns. Removing
and re-adding an object does not repeat `onAwake` or `onStart`.

`GameScene.update(dt)` runs in scene insertion order. For each eligible object,
it calls `onStart` before the first `update`, then calls the object update and
each eligible component's `onStart` and `update` in attachment order.
`GameScene.updateFixed(dt)` calls fixed callbacks without starting instances.
Both phases recheck activation and component state before each callback.

Each phase uses a stable snapshot. Objects and components attached during an
update or fixed-update callback receive required `onAwake` immediately, then
wait until the next matching phase for update callbacks. Additions during an
awake traversal are incorporated in attachment order before scene attachment
completes. Removing or destroying an object suppresses its later callbacks in
the current snapshot. Removing and re-adding an object also invalidates its old
snapshot entry.

Destruction is synchronous and idempotent. Children are destroyed in child
order before their parent. Each object's `onDestroy` runs before its components
in reverse attachment order. Parent and scene links remain available through
the object's callbacks; components remain queryable during the object's
`onDestroy` and keep `gameObject` during their own `onDestroy`. Links and
components are cleared after their callbacks finish. `GameScene.remove` detaches
a live subtree; `GameScene.destroy` destroys all remaining roots and rejects
future additions.

## Renderer, physics, and audio adapters

Adapters wrap existing resources; constructors do not create renderer nodes,
bodies, worlds, shapes, or sounds.

- `SceneNodeComponent` wraps a `SceneNodeHandle`. Ownership defaults to
  `borrowed`. A parent with a renderer adapter supplies the child node's local
  transform; otherwise the adapter supplies its world transform. Removing the
  component unparents the node. Borrowed nodes remain alive at the object's
  world transform; owned nodes are destroyed.
- `RigidBodyComponent` wraps an existing `WorldHandle` and `BodyHandle` and
  requires a `MotionType`. Ownership defaults to `borrowed`. Static and
  kinematic bodies receive transforms before the caller's physics step;
  dynamic bodies write position and rotation back after it. The world and shape
  remain caller-owned.
- `AudioSourceComponent` references a shared `Sound` and owns only its live
  voice. Playback defaults to non-looping with `refDist: 1`, `maxDist: 0`, and
  `rolloff: 1`. `play()` returns false when the component has no live owner or
  the sound cannot start. `stop()` is idempotent. The shared sound is never
  unloaded by the component.

Physics stepping remains in the game loop:

```ts
scene.updateFixed(fixedDt);
scene.syncPhysicsBeforeStep(world, fixedDt);
step(world, fixedDt);
scene.syncPhysicsAfterStep(world);
```

`GameScene` never steps physics itself. Renderer nodes and active audio voices
follow their objects after regular/fixed updates and after physics read-back.
Adapter synchronization continues for attached adapters even when their object
or component is inactive or disabled.

## Serialized worlds

`GameScene` owns runtime-created TypeScript objects. `WorldData`, its schema, and
`instantiateWorld` continue to work with renderer handles. Loading a serialized
world does not select or construct user subclasses.
