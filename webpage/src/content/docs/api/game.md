---
title: Game objects
description: Reference for game objects, components, transforms, scenes, the scene manager, and field annotations.
section: API
order: 31
---

This page is the reference for the gameplay layer: `GameObject`, `GameComponent`, `Transform`, `GameScene`, `Scene`, `SceneManager`, and the two field annotations. If the terms are new, read [Scenes, objects, and components](../../concepts/scenes-and-objects/) first.

The classes come from the package root, `@bornengine/engine`. They are also exported from `@bornengine/engine/game`. The annotations `Asset` and `GameComponent` come from `@bornengine/engine/annotations`.

## Game objects and components

A **game object** is a thing in a scene, such as a player or a door. It has a name, an id, a transform, a parent and children, and a list of components. A **component** is a behavior attached to one game object. A game object has no `render` hook. Its components draw.

```ts
import { Colors, Game, GameComponent, GameObject, Renderer, Scene } from '@bornengine/engine';

class Health extends GameComponent {
  value = 100;

  damage(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }
}

class HealthBar extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const health = owner.getComponent(Health);
    if (health === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawRectangle({ x: position.x, y: position.y - 12, width: health.value / 2, height: 6 }, Colors.GREEN);
  }
}

class Enemy extends GameObject {
  private readonly speed = 40;

  constructor() {
    super({ name: 'Enemy', position: { x: 360, y: 120, z: 0 } });
    this.addComponent(new Health());
    this.addComponent(new HealthBar());
  }

  override update(deltaTime: number): void {
    this.transform.position.x -= this.speed * deltaTime;
  }

  override onDestroy(): void {
    console.log(`${this.name} destroyed`);
  }
}

class Arena extends Scene {
  constructor(game: Game) {
    super(game, { name: 'arena' });
    this.addNode(new Enemy());
  }
}

class ArenaGame extends Game {
  constructor() {
    super({ window: { title: 'Arena', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Arena(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
    super.render();
  }
}

new ArenaGame().run();
```

`Enemy` moves itself in `update`. `HealthBar` finds its sibling `Health` through the owner and draws a bar. Both components belong to the enemy and are destroyed with it.

### GameObject

`new GameObject(options)` takes an optional object:

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | `''` | A label for debugging and for lookups you write yourself. |
| `active` | `true` | When `false`, the object and its children are skipped by `onStart`, `update`, `fixedUpdate`, and rendering. |
| `position` | `{ x: 0, y: 0, z: 0 }` | Initial local position. The vector is copied. |
| `rotation` | `{ x: 0, y: 0, z: 0, w: 1 }` | Initial local rotation as a quaternion. The value is copied. |
| `scale` | `{ x: 1, y: 1, z: 1 }` | Initial local scale. The vector is copied. |

Members:

| Member | Meaning |
| --- | --- |
| `id` | A number that is unique inside the process. It identifies the TypeScript object only. |
| `transform` | The object's [`Transform`](#transforms-and-hierarchy). |
| `name`, `active` | Writable. |
| `activeInHierarchy` | `true` when the object and all its ancestors are active and the object is not destroyed. |
| `destroyed` | `true` from the moment `destroy()` starts. |
| `scene` | The `GameScene` that holds the object, or `null`. |
| `parent` | The parent object, or `null`. |
| `children` | A copy of the child list. Changing the copy does not change the hierarchy. |

Methods:

| Method | Returns | Meaning |
| --- | --- | --- |
| `addChild(child, options?)` | the child, or `null` | Attaches `child` under this object. See [Transforms and hierarchy](#transforms-and-hierarchy). |
| `removeChild(child, options?)` | `boolean` | Detaches a direct child. The child stays in the scene as a root object. |
| `addComponent(component)` | the component, or `null` | Attaches a component. It returns `null` when this object or the component is destroyed, when the component already has an owner, or, for an object that is already in a scene, when an adapter component belongs to a different `Game`. |
| `getComponent(Type)` | the first match, or `null` | Finds a component with `instanceof`, so subclasses match. |
| `getComponents(Type)` | an array | Finds every match. |
| `removeComponent(component)` | `boolean` | Runs the component's `onDestroy` and detaches it. |
| `destroy()` | `boolean` | Destroys the object, its components, and its children. It returns `false` if destruction already started. |

A destroyed component cannot be attached again. After destruction its `gameObject` is `null`.

### GameComponent

| Member | Meaning |
| --- | --- |
| `enabled` | `true` by default. A disabled component is skipped by every hook except `onAwake` and `onDestroy`. |
| `renderOrder` | `0` by default. Components draw in ascending order. Equal values keep the attachment order of their objects, then the order of the components on each object. |
| `gameObject` | The owner, or `null` before attachment and after destruction. |
| `isActiveAndEnabled` | `true` when the component is enabled, has an owner, and the owner is active in its hierarchy. |
| `destroyed` | `true` from the moment destruction starts. |

### Hooks

Override a hook with the `override` keyword. The base implementations do nothing.

| Hook | On | Runs |
| --- | --- | --- |
| `onAwake()` | both | Once, when the object is attached to a scene. |
| `onStart()` | both | Once, before the first `update` that finds the object or component active. |
| `update(deltaTime)` | both | Every update, while active. |
| `fixedUpdate(deltaTime)` | both | Only when your code calls `scenes.updateFixed(fixedDt)`. |
| `render(renderer)` | `GameComponent` only | Every render, while active and enabled. |
| `onDestroy()` | both | Once, when destruction runs. |

[Scenes and lifecycle](#scenes-and-lifecycle) gives the exact order.

### Field annotations

Two annotations fill fields on a `GameObject` subclass when the object is attached to a scene. They run before the object's `onAwake()`, so the fields are ready there. They do not run in the constructor, so do not read the fields there.

- `@Asset(path, errCallback?)` loads the texture at `path` through the scene's `assets` and stores the `Texture` in the field.
- `@GameComponent()` creates a component from the field's class and attaches it to the object. Without options, the constructor gets no argument.
- `@GameComponent(options)` passes `options` as the single constructor argument. TypeScript does not check these options against the component's constructor, so keep them in step with it. Runtime references such as a physics world cannot go in the decorator, because decorators run when the class is defined. Pass them through the component's own options with `addComponent` instead.
- Engine components that take only options can use the decorator, for example `CameraRig2D`, `ParallaxLayer2D`, and `AudioListener2D`. Components that need a runtime object first, such as `CharacterController`, `Vehicle`, and `Joint`, take their world in the options, so attach them with `addComponent`.
- A component that holds native resources releases them in `onDestroy()`. Removing the component or destroying its object runs that hook.

Annotations apply to fields of game objects only. Components are not bound. Annotated fields of a base class are bound too, before those of the subclass. The scene must be a `Scene`. A plain `GameScene` has no asset manager, so `@Asset` fails there with `scene has no asset manager`.

Two different things are called `GameComponent`:

- The **class** `GameComponent` is the base class for components. Import it from the package root: `import { GameComponent } from '@bornengine/engine'`.
- The **decorator** `GameComponent()` is a field annotation. Import it from `@bornengine/engine/annotations`.

A file that needs both must rename one of them. The example renames the decorator to `AddComponent`.

```ts
import { GameComponent, GameObject, Scene } from '@bornengine/engine';
import type { Game, Texture } from '@bornengine/engine';
import { Asset, GameComponent as AddComponent } from '@bornengine/engine/annotations';

class Health extends GameComponent {
  value = 100;
}

class Boss extends GameObject {
  @Asset('assets/boss.png')
  readonly image!: Texture;

  @Asset('assets/boss-glow.png', (error, path) => {
    console.error(`Skipping ${path}: ${error}`);
    return null;
  })
  readonly glow!: Texture | null;

  @AddComponent()
  readonly health!: Health;
}

class Arena extends Scene {
  constructor(game: Game) {
    super(game, { name: 'arena' });
    this.addNode(new Boss());
  }
}
```

By default a failed load throws. `scene.add()` (or `addNode()`) throws an `Error` with the texture's error text, and the object is not attached. Components that `@GameComponent()` already attached stay on the failed object, so create a new object before you try again.

`errCallback(error, path, retry)` replaces the throw. `error` is the message, `path` is the asset path, and `retry()` loads the file again and returns the loaded `Texture`, or throws if it still fails. Whatever the callback returns becomes the field value. It can return a `Texture`, `null`, or a promise of either.

Use a class as the field type for `@GameComponent()`. Interfaces and unions of different types are erased to `Object` at run time, and attaching then fails with `Could not attach "health" component`.

The syntax is TypeScript's legacy decorators. Perry compiles it without extra configuration. Your editor needs `experimentalDecorators` in `tsconfig.json`, and `emitDecoratorMetadata` for `@GameComponent()`.

#### Async callbacks

A callback that returns a promise defers the attachment. `scene.add()` returns the object at once, but the object is not in the scene yet: its `scene` is `null` and its fields are empty. When the promise settles, the object is attached and `onAwake()` runs.

```ts
import { GameObject, Scene } from '@bornengine/engine';
import type { Game, Texture } from '@bornengine/engine';
import { Asset } from '@bornengine/engine/annotations';

declare function downloadFile(path: string): Promise<void>;

class Poster extends GameObject {
  @Asset('assets/poster.png', async (error, path, retry) => {
    await downloadFile(path);
    return retry();
  })
  readonly image!: Texture;
}

class Gallery extends Scene {
  private readonly poster = new Poster();

  constructor(game: Game) {
    super(game, { name: 'gallery' });
    this.add(this.poster);
  }

  cancelPoster(): boolean {
    return this.remove(this.poster);
  }
}
```

These rules apply to async callbacks:

- `scene.remove(object)` cancels a pending object and returns `true`. The object is never attached.
- `parent.addChild(child)` throws `addChild: async @Asset errCallback requires scene.add()` when the parent is already in a scene. Add such an object to the scene with `scene.add()` or `addNode()`.
- A callback that rejects leaves an unhandled rejection, and the object is never attached.
- On native Linux, `Game.run()` does not run promise continuations or timers yet, so an async callback never finishes during play. Use a synchronous callback in native games. The default throw and synchronous callbacks work everywhere.

## Transforms and hierarchy

Every game object has a `transform`. Its `position`, `rotation`, and `scale` are local: they are relative to the parent. Rotation is a quaternion, a rotation stored as four numbers `{ x, y, z, w }`. For a 2D rotation by an angle in radians, use `{ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }`.

| Member | Meaning |
| --- | --- |
| `position`, `rotation`, `scale` | The local values. Change them in place or assign new objects. |
| `localMatrix`, `worldMatrix` | 4 by 4 matrices as arrays of 16 numbers, column-major. A new array is returned on every read. |
| `worldPosition`, `worldRotation`, `worldScale` | The values after applying every parent. Each read returns a copy, so changing the copy does nothing. |
| `setWorldPosition(position)` | Moves the object to a world position by changing its local position. It returns `false` if a parent's matrix cannot be inverted. |
| `setWorldRotation(rotation)` | Rotates the object to a world rotation by changing its local rotation. |

`addChild` and `removeChild` keep the child where it is in the world by default. They change the child's local values to match. Pass `{ preserveWorldTransform: false }` to keep the local values and let the child move.

```ts
import { GameObject } from '@bornengine/engine';

const ship = new GameObject({ name: 'Ship', position: { x: 100, y: 50, z: 0 } });
const cannon = new GameObject({ name: 'Cannon', position: { x: 100, y: 40, z: 0 } });
const antenna = new GameObject({ name: 'Antenna', position: { x: 5, y: 0, z: 0 } });

ship.addChild(cannon);
ship.addChild(antenna, { preserveWorldTransform: false });

console.log(cannon.transform.position, cannon.transform.worldPosition);
console.log(antenna.transform.position, antenna.transform.worldPosition);
```

The cannon stays at world position `(100, 40, 0)`, so its local position becomes `(0, -10, 0)`. The antenna keeps its local position `(5, 0, 0)`, so its world position becomes `(105, 50, 0)`.

`addChild(child, options?)` returns the child, or `null` when it cannot attach. It returns `null` when:

- either object is destroyed, or `child` is the object itself or one of its ancestors;
- the child is in a different scene, or the child is in a scene and the parent is not;
- a component on the child belongs to a different `Game`;
- world-transform preservation is on and a matrix cannot be inverted or split into position, rotation, and scale, for example because a parent has zero scale.

Calling `addChild` for a child that is already attached to this parent returns the child and changes nothing. A child that has a parent cannot be added to a scene directly. Add the root object instead, and the whole subtree attaches with it.

`removeChild(child)` detaches a direct child. The child stays in the scene as a root object. `scene.remove(object)` takes a subtree out of the scene without destroying it. `object.destroy()` removes the object from its parent and its scene.

## Scenes and lifecycle

A `GameScene` holds game objects for one `Game`. Create it with `new GameScene(game)`. A `Scene` extends `GameScene` with a name, an asset manager, effects, cameras, owned resources, and lifecycle hooks. Use `Scene` for anything the scene manager runs. Use a bare `GameScene` when you want a plain container and call its methods yourself.

| `GameScene` member | Meaning |
| --- | --- |
| `add(object)` | Attaches a root object and its subtree. It returns the object, or `null` if the object is destroyed, already in a scene, has a parent, or holds a component from another `Game`. |
| `remove(object)` | Detaches an object and its subtree without destroying them. It returns `false` if the object is not in this scene. For an async object that is still pending, it cancels the object and returns `true`. |
| `update(deltaTime)` | Runs one update pass. |
| `updateFixed(fixedDt)` | Runs one fixed-update pass. |
| `render(renderer, camera?, viewport?)` | Draws the scene's components. With a camera or viewport, the draw is wrapped in `begin2D` and `end2D`. |
| `objects` | A copy of every attached object, in attachment order. |
| `stats` | Counts of objects and components, active and total. |
| `destroy()` | Destroys every root object. `dispose()` does the same. |

`Scene` adds these members:

| `Scene` member | Meaning |
| --- | --- |
| `name` | The name from the constructor options. |
| `state` | `'ready'`, `'active'`, `'paused'`, or `'unloaded'`. |
| `addNode(object)` | Like `add`, but it also returns `null` while the scene unloads or after it unloaded. |
| `assets` | A scene-owned asset manager. Its assets are released when the scene unloads. |
| `vfx` | Factories for 3D particle and decal pools that the scene updates and disposes. See [Visual effects](../vfx/). |
| `own(resource)` | Registers an object with `dispose()` and an optional `update(deltaTime)` so the scene updates and disposes it. It returns `null` when the scene is unloading, when the resource belongs to another `Game`, or when a scene already owns it. |
| `viewport2D` | A `Viewport2D` or `null`. See [Camera 2D](../camera2d/). |
| `camera2D` | The scene's `Camera2D`, or `null`. |
| `bindCameraRig2D(rig)` | Uses a `CameraRig2D` component as the scene camera. It returns `false` if the rig is not attached to this scene, is destroyed, or reports an error. |
| `unload()` | Runs the unload sequence. It returns `false` if the scene already unloaded or is in a hook. `destroy()` and `dispose()` call it. |

### Order of events

An object goes through these steps:

1. **Construct.** The constructor runs. No hook runs. Annotated fields are not filled yet.
2. **Attach.** `scene.add`, `scene.addNode`, or `parent.addChild` under an attached parent binds the field annotations of the whole subtree, then attaches it.
3. **Awake.** `onAwake()` runs once per object and once per component. The order is the object, then its components in the order they were added, then each child with the same rule, depth first. A component added while the pass runs is awakened before the pass ends. An object added from inside an `onAwake` is awakened after the current pass finishes.
4. **Start and update.** On each update pass the scene visits its objects in attachment order. A parent comes before its children. For each object it runs `onStart()` (the first time only), then `update(deltaTime)`. Then, for each component in the order added, it runs `onStart()` (the first time only), then `update(deltaTime)`. When a `Scene` runs through the scene manager, its owned resources update first: `vfx`, then the resources you registered with `own()`.
5. **Fixed update.** `fixedUpdate(fixedDt)` runs for each object and then each of its components. Nothing calls it automatically. Call `this.scenes.updateFixed(fixedDt)` yourself.
6. **Render.** Eligible components draw in ascending `renderOrder`, and equal values keep their attachment order. When the scene has a camera or a viewport, the draw runs between `begin2D` and `end2D`.
7. **Destroy.** Children are destroyed first, depth first. Then the object's `onDestroy()` runs, then each of its components' `onDestroy()` in reverse order. Then the object leaves its parent and its scene.

`onAwake()` and `onStart()` run once in an object's life, even if you remove it from a scene and add it again. A component added with `addComponent` to an object that is already awake receives `onAwake()` at once.

An object takes part in `onStart`, `update`, `fixedUpdate`, and rendering only while it is active in its hierarchy. A component also needs `enabled` to be `true`. A hook that is skipped is not lost: `onStart()` runs the first time the object or component is eligible. Objects attached during an update pass first run on the next pass. An object removed or destroyed during a pass is skipped for the rest of it.

```ts
import { Game, GameComponent, GameObject, Scene } from '@bornengine/engine';

class Tracer extends GameComponent {
  private readonly label: string;

  constructor(label: string) {
    super();
    this.label = label;
  }

  override onAwake(): void {
    console.log(`${this.label}.onAwake`);
  }

  override onStart(): void {
    console.log(`${this.label}.onStart`);
  }

  override update(_deltaTime: number): void {
    console.log(`${this.label}.update`);
  }

  override onDestroy(): void {
    console.log(`${this.label}.onDestroy`);
  }
}

class Actor extends GameObject {
  override onAwake(): void {
    console.log(`${this.name}.onAwake`);
  }

  override onStart(): void {
    console.log(`${this.name}.onStart`);
  }

  override update(_deltaTime: number): void {
    console.log(`${this.name}.update`);
  }

  override onDestroy(): void {
    console.log(`${this.name}.onDestroy`);
  }
}

class Demo extends Scene {
  constructor(game: Game) {
    super(game, { name: 'demo' });
    const parent = new Actor({ name: 'Parent' });
    parent.addComponent(new Tracer('ParentTracer'));
    const child = new Actor({ name: 'Child' });
    child.addComponent(new Tracer('ChildTracer'));
    parent.addChild(child);
    this.addNode(parent);
  }
}
```

When the `Demo` constructor calls `addNode(parent)`, the log reads:

```text
Parent.onAwake
ParentTracer.onAwake
Child.onAwake
ChildTracer.onAwake
```

The first update pass logs `Parent.onStart`, `Parent.update`, `ParentTracer.onStart`, `ParentTracer.update`, then the same four lines for `Child` and `ChildTracer`. Later passes log only the `update` lines. When the scene unloads, the log shows `Child.onDestroy`, `ChildTracer.onDestroy`, `Parent.onDestroy`, `ParentTracer.onDestroy`.

### Errors in hooks

An exception thrown by `onAwake` leaves the object attached and the scene usable. It propagates out of `add`, `addNode`, or `addChild`, and the remaining `onAwake` calls of that attach are skipped. An exception thrown by `onStart`, `update`, or `fixedUpdate` propagates out of the call that ran the pass, such as `scenes.update`. If it leaves your `loop`, the game stops and `game.error` holds the message.

### Fixed update

`fixedUpdate` is for work that needs a constant step, such as your own physics. Feed it from an accumulator in `loop`:

```ts
import { Colors, Game } from '@bornengine/engine';

const FIXED_STEP = 1 / 60;

class FixedStepGame extends Game {
  private accumulator = 0;

  protected override loop(deltaTime: number): void {
    this.accumulator += Math.min(deltaTime, 0.25);
    while (this.accumulator >= FIXED_STEP) {
      this.scenes.updateFixed(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    super.render();
  }
}

new FixedStepGame({ window: { title: 'Fixed step', width: 640, height: 360 } }).run();
```

Capping `deltaTime` at 0.25 seconds keeps one slow frame from queuing many steps.

### Scene hooks

A `Scene` has five hooks. Override them with `override`.

| Hook | Runs |
| --- | --- |
| `onEnter()` | After the scene becomes the active scene. |
| `onPause()` | After `scenes.pause()` set the state to `'paused'`. |
| `onResume()` | After `scenes.resume()` set the state to `'active'`. |
| `onExit()` | When the scene unloads, if it was ever entered. |
| `onUnload()` | During unload, after `onExit()`. |

`unload()` runs in this order: `onExit()` if the scene was entered, `onUnload()`, destruction of the scene's objects, disposal of `vfx`, disposal of `assets`, disposal of owned resources in reverse order of `own()`, and finally the state becomes `'unloaded'`. Objects can still use the scene's assets in `onDestroy()`.

Scene hooks cannot start a transition. Inside a hook, `changeTo`, `pause`, `resume`, and `unloadCurrent` return `false`. A scene that was never activated can still be unloaded with `scene.unload()` to release its assets early.

## Scene manager

`game.scenes` is the `SceneManager`. It holds one current scene and moves between scenes. The game does not call its `update` for you, so call `this.scenes.update(deltaTime)` from `loop`. The default `Game.render()` calls `scenes.render(renderer)`.

| Member | Meaning |
| --- | --- |
| `currentScene` | The active or paused `Scene`, or `null`. |
| `changeTo(scene)` | Unloads the current scene, then activates `scene`. It returns `true` when `scene` is current afterward. Passing the current scene returns `true` and does nothing. |
| `pause()` | Pauses the current scene. It returns `false` if there is no active scene to pause. |
| `resume()` | Resumes a paused scene. |
| `update(deltaTime)` | Updates the current scene. |
| `render(renderer)` | Draws the current scene, active or paused, with its `camera2D` and `viewport2D`. |
| `updateFixed(fixedDt)` | Runs `fixedUpdate` on an active scene. |
| `unloadCurrent()` | Unloads the current scene without loading another. It returns `true` if a scene was unloaded. |

`changeTo` returns `false` when a transition is already running, when the scene belongs to another `Game`, and when the scene is not in the `'ready'` state. A scene can be activated once. After it unloads, create a new one.

`update` runs the scene's owned resources first (`vfx`, then the resources you registered with `own()`), then the objects. A paused scene still updates its owned resources and still draws, but its objects do not update. Call `scenes.update`, not `scene.update`, so the owned resources run.

If an object calls `changeTo` during `update`, the switch happens at once. The old scene stops its pass, and the new scene starts updating on the next call.

```ts
import { Colors, Game, Key, Scene } from '@bornengine/engine';

class MenuScene extends Scene {
  constructor(game: Game) {
    super(game, { name: 'menu' });
  }

  override onEnter(): void {
    console.log('menu opened');
  }

  override onExit(): void {
    console.log('menu closed');
  }
}

class PlayScene extends Scene {
  constructor(game: Game) {
    super(game, { name: 'play' });
  }

  override onPause(): void {
    console.log('paused');
  }

  override onResume(): void {
    console.log('resumed');
  }
}

class ScenesDemo extends Game {
  constructor() {
    super({ window: { title: 'Scenes', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new MenuScene(this));
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyPressed(Key.ENTER)) this.scenes.changeTo(new PlayScene(this));
    if (this.input.isKeyPressed(Key.ESCAPE)) {
      const current = this.scenes.currentScene;
      if (current !== null && current.state === 'paused') this.scenes.resume();
      else this.scenes.pause();
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new ScenesDemo().run();
```

When the game shuts down, the manager unloads the current scene. Scenes you created but never activated are released with the game as well.

## Native adapters

Three components connect a game object to a resource that lives outside the scene. Each one takes a resource created by the same `Game`. A resource from another `Game` is refused: `addComponent` returns `null`, or `scene.add` does when the object is attached later.

| Component | Constructor | What it does |
| --- | --- | --- |
| `SceneNodeComponent` | `(node, { ownership? })` | After each update, fixed update, and physics step, it copies the object's transform to a retained [scene node](../scene/). It also forwards `setVisible`, `setColor`, `setPbr`, `setTextureSlot`, and `attachModel`. |
| `RigidBodyComponent` | `(body, { ownership? })` | Links a [physics](../physics/) body to the object's transform around `PhysicsWorld.step()`. See [Physics step](#physics-step). |
| `AudioSourceComponent` | `(sound, { looping?, refDist?, maxDist?, rolloff? })` | `play()` starts the sound at the object's position and `stop()` ends it. While the sound plays, the voice follows the object. Defaults: `looping` false, `refDist` 1, `maxDist` 0, `rolloff` 1. |

`SceneNodeComponent` sends the world matrix of the object to its node. When the parent object also has a `SceneNodeComponent`, it parents the node to the parent's node and sends the local matrix instead. The renderer combines parent and child node transforms (see [Scene graph](../scene/)), so the child node is drawn at the parent's world position plus its local offset.

`ownership` is `'borrowed'` (the default) or `'owned'`. A borrowed resource stays alive when the component is destroyed. A borrowed scene node is only detached from its parent. An owned resource is disposed with the component. An owned scene node is disposed after its child nodes are detached, so the children survive. An owned body is disposed.

```ts
import { AudioSourceComponent, GameObject, Scene, SceneNodeComponent } from '@bornengine/engine';
import type { Game } from '@bornengine/engine';

class Shrine extends Scene {
  constructor(game: Game) {
    super(game, { name: 'shrine' });

    const statue = new GameObject({ name: 'Statue', position: { x: 0, y: 0, z: -5 } });

    const model = game.assets.loadModel('assets/models/statue.glb');
    const node = game.sceneGraph.createNode({ name: 'Statue' });
    if (model !== null && model.isLoaded) node.attachModel(model);
    statue.addComponent(new SceneNodeComponent(node, { ownership: 'owned' }));

    const chime = game.assets.loadSound('assets/chime.wav');
    if (chime !== null && chime.isLoaded) {
      const source = statue.addComponent(new AudioSourceComponent(chime, { looping: true, maxDist: 30 }));
      if (source !== null) source.play();
    }

    this.addNode(statue);
  }
}
```

The node follows the statue's transform. The chime plays from the statue's position.

## OOP renderer nodes

`game.sceneGraph` creates retained renderer nodes: 3D objects that the engine draws every frame without further calls. A node is a normal class instance. Its native handle stays private. Create a node, attach a model that the same `Game` owns, and place it.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 2, z: 4 },
  target: { x: 0, y: 1, z: -5 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class StatueGame extends Game {
  private readonly statue = this.sceneGraph.createNode({ name: 'Statue' });

  constructor() {
    super({ window: { title: 'Statue', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    const model = this.assets.loadModel('assets/models/statue.glb');
    if (model === null || !model.isLoaded) {
      throw new Error(model?.error ?? 'Could not create the statue model');
    }
    this.statue.attachModel(model);
    this.statue.setTrs({ x: 0, y: 0, z: -5 }, 0, 1);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (this.renderer.begin3D(camera)) this.renderer.end3D();
  }
}

new StatueGame().run();
```

Nodes are drawn at the end of the frame with the camera of the latest `begin3D` call, so the example calls `begin3D` and `end3D` even though it draws nothing between them. Attach a node to a game object with `SceneNodeComponent` when gameplay should drive its transform. [Scene graph](../scene/) lists the node and light methods.

## Physics step

`PhysicsWorld` and the scene manager cooperate around each physics step. A world uses `game.scenes` by default. When you call `world.step(deltaTime)`, the manager first copies object transforms into bodies, the world simulates, and then the manager copies body poses back:

1. **Before the step**, for every `RigidBodyComponent` in the current active scene: a static body is moved to the object's world pose, and a kinematic body is moved toward it. A dynamic body is left alone.
2. **After the step**, for every dynamic body: the object's world position and rotation are set from the body. The object's scale is kept. Then every adapter updates (`SceneNodeComponent`, `AudioSourceComponent`).

Step each world once per frame from `loop`, after `scenes.update`, so the physics sees the poses that your `update` code just set. Stepping a world twice in one frame runs the transfers twice. Bodies from another world are ignored.

Only the scene that is the manager's current active scene is synchronized. A plain `GameScene` is not. To use another manager, pass `{ sceneManager }` to the `PhysicsWorld` constructor, or call `world.setSceneManager(hooks)`. `world.setSceneManager(null)` turns the synchronization off.

A dynamic body owns its position. Change a dynamic object's position with `body.setPosition(...)`, not with `transform.position`, because the next step overwrites the transform.

```ts
import {
  BoxCollider,
  Colors,
  Game,
  GameObject,
  MotionType,
  PhysicsWorld,
  RigidBodyComponent,
  Scene,
  SphereCollider,
} from '@bornengine/engine';

class Ball extends GameObject {
  get height(): number {
    return this.transform.worldPosition.y;
  }
}

class DropGame extends Game {
  private readonly world = new PhysicsWorld(this);
  private ball: Ball | null = null;

  constructor() {
    super({ window: { title: 'Physics step', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const scene = new Scene(this, { name: 'drop' });
    this.world.createBody(new BoxCollider(this.world, { x: 10, y: 0.5, z: 10 }), {
      motionType: MotionType.STATIC,
      position: { x: 0, y: -0.5, z: 0 },
    });
    const body = this.world.createBody(new SphereCollider(this.world, 0.5), {
      motionType: MotionType.DYNAMIC,
      position: { x: 0, y: 10, z: 0 },
    });
    const ball = new Ball({ name: 'Ball', position: { x: 0, y: 10, z: 0 } });
    ball.addComponent(new RigidBodyComponent(body));
    scene.addNode(ball);
    this.ball = ball;
    this.scenes.changeTo(scene);
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    this.world.step(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    if (this.ball !== null) {
      this.renderer.drawText(`height ${this.ball.height.toFixed(2)}`, { x: 16, y: 16 }, 24, Colors.WHITE);
    }
  }
}

new DropGame().run();
```

The ball falls onto the floor and the height on screen settles near 0.5. The floor is a static body with no game object. 3D physics needs the `3d` build profile. See [Physics](../physics/) for the requirements.

## Serialized worlds

A world file stores a level as plain JSON. `WorldData` loads, validates, and saves a document. `WorldInstance` holds the scene nodes that one `Game` created from it. See [World data](../world/) for the schema, the loading flow, and the ownership rules.

```ts
import { Game, WorldData } from '@bornengine/engine';

const game = new Game({ window: { title: 'World', width: 800, height: 450 } });
const data = new WorldData('assets/worlds/level.world.json');

if (!data.load()) {
  console.error(data.error ?? 'World load failed');
} else {
  const instance = data.instantiate(game, { getModel: (path) => game.assets.loadModel(path) });
  if (instance.error !== null) console.error(instance.error);
}
```

2D maps use a different format. [World2D API](../world2d/) loads them into a scene as game objects and components.

## Next steps

- [Scenes, objects, and components](../../concepts/scenes-and-objects/) walks through the same ideas with a complete game.
- [Game loop](../../concepts/game-loop/) lists the order of each frame.
- [Scene graph](../scene/) covers retained 3D nodes.
- [Physics](../physics/) covers the 3D physics world.
- [Assets](../assets/) covers `game.assets` and `scene.assets`.
