# Runtime GameObjects and Components

## Goal

Add a class-based runtime object layer so game authors can define their own types, such as `Player extends GameObject` or `NPC extends GameObject`, instantiate them with `new`, attach components, and add them to a runtime scene. The engine supplies the base classes and lifecycle; it does not ship concrete Player or NPC gameplay classes.

## Context

The engine currently exposes a retained 3D renderer scene graph through numeric `SceneNodeHandle`s. Serialized `WorldData` entities are loaded into renderer nodes, while physics bodies, sounds, models, and other resources use their own numeric handles. There is no runtime owner that groups these handles with user-defined gameplay behavior or provides an object lifecycle.

The fork will support a class-oriented TypeScript API for gameplay while retaining the existing native handle boundary. `GameObject`, subclasses, and `GameComponent` instances stay in Perry-compiled TypeScript. Calls into Rust continue to pass numeric handles and primitive values; class instances do not cross FFI.

## Design

### User-defined object classes

Export `GameObject` as a concrete, subclassable base class. Construction assigns a stable runtime handle and initializes the object's name, active state, and transform. Subclasses override explicit lifecycle methods; the engine never discovers methods through decorators or general reflection.

```ts
import { GameObject, GameScene } from '@bornengine/engine/game';

class Player extends GameObject {
  override onStart(): void {
    console.log(`${this.name} started`);
  }

  override update(dt: number): void {
    // Game-specific behavior.
  }
}

const scene = new GameScene();
const player = scene.add(new Player({ name: 'Player' }));
if (player !== null) {
  scene.update(getDeltaTime());
}
```

The public API uses regular constructors, `extends`, `super`, and method overrides. It does not depend on decorators, runtime metadata reflection, or dynamic prototype mutation. The local Perry executable is 0.5.1022; compatibility with the compiler version used by each supported target must be checked during implementation before making this API a published guarantee.

`GameObject` has a runtime-only numeric `id` assigned at construction. Its transform is a 3D TRS value: position and scale are `Vec3`, rotation is `Quat`. Transform values are local to the parent; a root object's local transform is its world transform. Reparenting preserves local transform. 2D games use `z = 0` and can continue to use the existing immediate 2D draw API.

### GameScene runtime owner

Add a `GameScene` runtime container in a new `game` API module. This is distinct from the existing `scene` module, which controls renderer nodes, lights, and picking. `GameScene` owns runtime `GameObject` instances and advances their lifecycle when the game calls `scene.update(dt)` from its existing `runGame` callback.

`GameScene.add(object)` attaches an unparented object and its existing child subtree, returning the same typed instance, or `null` if the object is destroyed, already attached to a scene, still parented, or otherwise invalid. To attach a child beneath an object already in a scene, use `parent.addChild(child)`. `remove(object)` detaches the selected object and its child subtree without destroying them; if the object had a parent, it becomes a root and keeps its world transform. `object.destroy()` removes it from its scene and destroys its attached components exactly once. Destroying the scene destroys all root subtrees it still owns. The scene does not introduce global scene switching or replace `runGame`.

Objects have an explicit `active` flag; components have `enabled`. An inactive object or disabled component receives no update callbacks. Updates run in scene insertion order, and each object's components run in attachment order after that object's callback. Additions made during an update become active after the current iteration; destruction prevents later callbacks in that same frame. `parent.addChild(child)` may link two unattached objects; if the parent is in a scene, an unattached child and its subtree join that scene. If both are attached, they must be in the same scene. A child's effective activity also requires every ancestor to be active. Destroying a parent recursively destroys its children. Removing an object from a scene detaches its whole subtree without destroying it; the selected object becomes a root while preserving world transform, and the subtree keeps its internal parent/child links.

### Lifecycle

The lifecycle methods on both `GameObject` and `GameComponent` are explicit overridable methods:

- `onAwake()` runs once when the object is added to a scene. Components present at that point receive `onAwake()` immediately after their owner's callback. A component attached to an already-awake object receives `onAwake()` at attachment.
- `onStart()` runs once immediately before the first regular update for each object or component. Components added after their owner has started receive `onStart()` before their first component update.
- `update(dt)` runs once per `GameScene.update(dt)` for active objects and components.
- `fixedUpdate(dt)` is called only when the game explicitly advances the scene's fixed phase; the scene does not silently step physics worlds.
- `onDestroy()` runs once during explicit destruction or scene destruction.

If an object is removed and then added to another scene without being destroyed, its one-time initialization callbacks do not run again. A component instance may be attached to only one object at a time. Removing a component is destructive: it calls `onDestroy()` once and releases resources the component owns. Duplicate attachment and invalid ownership return a failure result rather than relying on exceptions from engine TypeScript. Destroying an object destroys children first, calls the object's `onDestroy()`, then destroys its components in reverse attachment order. `GameScene.destroy()` is idempotent and rejects later additions.

### Components and ownership

Add a subclassable `GameComponent` base class. A component receives its owning `GameObject` on attachment and has the same active and lifecycle rules as its owner. Provide typed `addComponent`, `getComponent`, `getComponents`, and `removeComponent` methods. Component lookup uses explicit class constructors and `instanceof`; it does not require a reflection registry.

`GameObject` owns its transform and parent/child relationship. The first engine-provided adapters connect this object state to existing resource APIs:

- `SceneNodeComponent` associates a renderer node with the object and synchronizes transforms and parenting.
- `RigidBodyComponent` associates an existing physics world/body handle and exposes explicit synchronization before and after the caller's physics step. The component does not create or step a physics world implicitly.
- `AudioSourceComponent` owns its live voice, follows the object's world position, and stops the voice when removed or destroyed. Loaded `Sound` assets remain shared resources and are not unloaded by the component.

`GameScene.syncPhysicsBeforeStep(world)` pushes object transforms into attached kinematic/static bodies belonging to that physics world. `GameScene.syncPhysicsAfterStep(world)` reads dynamic body transforms back into their objects and attached renderer nodes. The game remains responsible for calling the physics step between these two calls. Each adapter ignores bodies from other worlds.

Ownership is explicit: components own per-instance resources they create. When wrapping an existing renderer node or body, ownership defaults to borrowed and can be transferred with an explicit option. Shared model, sound, shape, and material assets remain owned by the game's asset-loading code. The audio component always owns its live voice. Destroying a component must not invalidate a shared resource handle.

### Relationship to serialized worlds

Keep `WorldData`, its schema version, and `instantiateWorld()` behavior backward-compatible in this feature. Existing world entities remain serialized model/prefab placements and continue to produce renderer handles. `GameScene` initially manages runtime-created class instances such as the user's Player and NPC. It does not serialize class instances or infer a TypeScript subclass from JSON. A future explicit type-to-factory registry can connect authored world data to custom subclasses without runtime code generation or reflection.

### Public exports and documentation

Expose the runtime classes from `@bornengine/engine/game` and from the package root. Update the API-shape documentation to explain that this fork supports class-based gameplay objects while native resources and FFI remain handle-based. Add a focused guide showing a user-defined subclass added to a `GameScene`; do not add sample Player/NPC classes to the engine API itself.

## Error handling

The engine API returns `null` or `false` for invalid attachment, duplicate ownership, and use-after-destroy cases. It does not depend on throwing from Perry-compiled engine code. Lifecycle callbacks are dispatched in deterministic insertion order. A callback that destroys its own object prevents later component callbacks for that object in the same phase.

## Out of scope

- A global scene manager, scene transitions, or automatic integration into `runGame`.
- Replacing the existing renderer scene graph or changing `WorldData` serialization.
- Loading a custom subclass from a world JSON file.
- A generic reflection/decorator-based component factory.
- Network replication, editor integration, or a built-in Player/NPC implementation.

## Acceptance criteria

1. A game can define `class Player extends GameObject`, instantiate it with `new Player()`, override lifecycle methods, and add it to `GameScene`.
2. `GameScene.update(dt)` dispatches the documented lifecycle once and in deterministic order; removal and destruction follow the ownership rules above.
3. Parent/child transforms synchronize to attached renderer nodes, and physics/audio adapters use the existing engine handles without passing class instances through FFI.
4. Existing `WorldData` files and `instantiateWorld()` callers retain their current serialized format and behavior.
5. The class syntax used by the public API is supported by the Perry compiler version required by the project's targets; unsupported reflection and prototype behavior are not part of the contract.
