---
title: Scenes, objects, and components
description: How scenes hold game objects, how objects hold components, and when each lifecycle hook runs.
section: Concepts
order: 11
---

BornEngine organizes a game in three layers. A **scene** is one screen or level. A **game object** is something in that scene, such as a player, a door, or a camera. A **component** is a behavior attached to a game object, such as a sprite that draws it or a script that moves it.

Objects form a tree. A parent object can have children, and moving the parent moves the children.

## Scenes

A scene is a class that extends `Scene`. Its constructor takes the `Game` and an options object with a name:

```ts
import { Game, Scene } from '@bornengine/engine';

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'level' });
  }
}
```

A game can only have one active scene at a time. `this.scenes.changeTo(scene)` makes a scene active and unloads the previous one. The game does not update or draw scenes by itself. Your `Game` subclass forwards each frame: call `this.scenes.update(deltaTime)` in `loop`. `render()` draws the active scene by default; call `super.render()` when you override it. The complete example at the end of this page shows both calls.

Scenes own their assets through `scene.assets`. Those assets are released when the scene unloads. See [Assets](../assets/).

## Game objects

A game object is an instance of `GameObject` or of a subclass you write:

```ts
import { GameObject, Vec3 } from '@bornengine/engine';

const door = new GameObject({ name: 'Door', position: new Vec3(320, 180, 0) });
```

The options are optional. `name` helps when you debug. `active` set to `false` hides the object and its children from updates and rendering. `position`, `rotation`, and `scale` set the initial transform.

Use `transform.position` to move an object. Child positions are relative to their parent. For example, `door.transform.position.x += 10` moves the door 10 units to the right.

Add an object to a scene with `scene.addNode(object)`, or attach it under an object that is already in the scene with `parent.addChild(child)`. Objects that are not attached do not run any hooks.

## Components

A component extends `GameComponent` and does one job. Attach it with `addComponent`:

```ts
import { Colors, GameComponent, Renderer } from '@bornengine/engine';

class Outline extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawRectangleOutline({ x: position.x, y: position.y, width: 32, height: 32 }, Colors.WHITE);
  }
}
```

Each component has one owner. `addComponent` returns the component, or `null` when it cannot attach. `getComponent(Type)` and `getComponents(Type)` look components up by class. `removeComponent` detaches one.

The engine's own features are components too. `CameraRig2D` moves the camera, `AudioListener2D` places the listener, and `CharacterController`, `Vehicle`, and `Joint` add physics behavior. A camera and a listener follow the object they are attached to. A camera follows another object when you give it a `target`. The [game object reference](../../api/game/#field-annotations) shows how to attach a component with `@GameComponent()`.

Three properties control a component:

- `enabled` turns the component off without removing it.
- `renderOrder` sorts drawing. Lower values draw first. Equal values keep the order in which you added them.
- `gameObject` is the owner, or `null` after the component is destroyed.

Game objects do not draw. Only components draw, through their `render(renderer)` method.

## Hierarchy

`addChild(child)` attaches a child under a parent. `removeChild(child)` detaches it. `parent` and `children` read the links. `worldPosition` is the position after applying every parent transform, and `transform.position` is the local position.

Attaching a child to a parent that is already in a scene attaches the child's whole subtree at once. A child that is detached keeps its components until it is destroyed.

## Lifecycle hooks

Each hook runs at a fixed point:

| Hook | Runs | Notes |
| --- | --- | --- |
| `onAwake()` | When the object is attached to a scene | Parent first, then its components, then its children. Asset annotations are filled before this runs. |
| `onStart()` | Once, before the first `update` | Runs for the object, then for each of its components. |
| `update(deltaTime)` | Every frame while the scene is updated | Object first, then its components. Skipped while the object or component is inactive. |
| `fixedUpdate(deltaTime)` | Only when your code calls `scenes.updateFixed(fixedDt)` | No fixed step runs automatically. |
| `render(renderer)` | Every frame for components only | Sorted by `renderOrder`. Skipped while inactive. |
| `onDestroy()` | When the object or component is destroyed | Children first. Then the object, then its components in reverse order. |

The example below uses these hooks. It builds a sun with a planet attached as a child. The planet orbits the sun by moving its own local position.

```ts
import { Colors, Game, GameComponent, GameObject, Renderer, Scene, Vec3 } from '@bornengine/engine';

class Marker extends GameComponent {
  private readonly radius: number;

  constructor(radius: number) {
    super();
    this.radius = radius;
  }

  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawCircle({ x: position.x, y: position.y }, this.radius, Colors.YELLOW);
  }
}

class Orbit extends GameComponent {
  private angle = 0;

  override update(deltaTime: number): void {
    const owner = this.gameObject;
    if (owner === null) return;
    this.angle += deltaTime * 2;
    owner.transform.position.x = Math.cos(this.angle) * 80;
    owner.transform.position.y = Math.sin(this.angle) * 80;
  }
}

class Solar extends Scene {
  constructor(game: Game) {
    super(game, { name: 'solar' });

    const sun = new GameObject({ name: 'Sun', position: new Vec3(400, 225, 0) });
    sun.addComponent(new Marker(24));
    this.addNode(sun);

    const planet = new GameObject({ name: 'Planet' });
    planet.addComponent(new Orbit());
    planet.addComponent(new Marker(8));
    sun.addChild(planet);
  }
}

class SolarGame extends Game {
  constructor() {
    super({ window: { title: 'Scenes and objects', width: 800, height: 450 } });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Solar(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    super.render();
  }
}

new SolarGame().run();
```

The sun is drawn at its position. The planet's `Orbit` moves it around the sun, and its `Marker` draws it at its world position. Because the planet is a child, its world position includes the sun's position.

## Common mistakes

- **Nothing updates.** The scene is not updated. Call `this.scenes.update(deltaTime)` in `loop`.
- **Nothing draws.** The object was never added with `addNode` or `addChild`, or its components do not implement `render`.
- **An object appears in the wrong place.** `transform.position` is local to the parent. Read `transform.worldPosition` to get the position on screen.
- **Your code runs too early.** Do not read values from annotated fields in the constructor. The fields are filled when the object is attached.
- **A decorator does nothing.** `@Asset` and `@GameComponent()` apply to fields of `GameObject` subclasses. They are not processed on component classes.

## Next steps

- [Game loop](../game-loop/) lists the order of the frame, from input to render.
- [API shape](../api-shape/) explains which classes come from the package root and which come from subpaths.
- [Game objects API](../../api/game/) lists every option, method, and hook.
