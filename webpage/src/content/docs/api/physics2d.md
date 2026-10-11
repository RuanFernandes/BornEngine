---
title: Physics 2D
description: Simulate falling, colliding, and character movement in 2D with a fixed-step arcade solver.
section: API
order: 41
---

Physics 2D makes objects fall, stops them at floors and walls, and tells you when they touch. It is an arcade solver: it works with axis-aligned boxes, circles, and a few static surface shapes, it never rotates a body, and it aims for predictable game feel, not realism. Three classes make up the API:

- `PhysicsWorld2D` owns the simulation and advances it in time.
- `PhysicsBody2D` is one thing inside a world: a shape with a position and a velocity. It is a component, so you attach it to a `GameObject`.
- `CharacterBody2D` moves a character that you control directly, such as a player or an enemy, and slides it along walls, floors, and slopes.

All three are exported from `@bornengine/engine` and from `@bornengine/engine/physics2d`. Both bodies are components. If scenes, game objects, and components are new to you, read [Scenes, objects, and components](../../concepts/scenes-and-objects/) first. Positions and sizes use your world units, usually pixels, and time uses seconds. Positive Y points down, so a gravity of `{ x: 0, y: 900 }` pulls objects down the screen.

Some terms appear throughout this page:

- **Static body**: never moves. Use it for floors, walls, and ramps.
- **Dynamic body**: moved by gravity, forces, and contacts. Use it for crates, balls, and projectiles.
- **Kinematic body**: not moved by the world. You move it yourself, for example for a moving platform.
- **Contact**: two bodies overlap. The world pushes them apart and reports the touch.
- **Sensor**: a body that reports overlaps but pushes nothing. Use it for trigger zones such as a coin or an exit door.

## Fixed-step world

A physics simulation is stable only when it advances in equal slices of time, but frames are not equal: one frame can take 16 milliseconds and the next 40. A fixed-step world solves this with an accumulator. Each call to `step(deltaTime)` adds the frame time to the accumulator, then runs one simulation step for every whole fixed step that the accumulator holds. The default fixed step is 1/60 of a second. Time that does not fill a step waits in the accumulator for the next call.

Create the world with `new PhysicsWorld2D(game, options)` after the game is ready, for example in `onStart()`. All options are optional:

| Option | Default | Meaning |
| --- | --- | --- |
| `gravity` | `{ x: 0, y: 980 }` | Acceleration in units per second squared. |
| `fixedTimeStep` | `1 / 60` | Seconds per simulation step. Must be greater than 0. |
| `maxSubSteps` | `5` | The most steps one `step()` call may run. A whole number of at least 1. |

If an option is invalid, or the game is not ready, the world sets `error` and `isReady` is `false`. The constructor does not throw, and bodies that you create from such a world get an error too.

`step(deltaTime)` returns the number of fixed steps it ran:

- One call accepts at most `fixedTimeStep * maxSubSteps` seconds, which is 1/12 of a second with the defaults. Time beyond that is dropped and added to `droppedTime`. A long hitch therefore slows the simulation instead of freezing the game.
- It returns 0 for a negative or non-finite `deltaTime`, and when it is called from a callback that the world is running during `step()`.
- It does not interpolate. Positions change only when a step runs, so on a given frame the world may run no step, one step, or two.

The game does not step the world for you. Call `step()` once per frame, from the active scene's `update()` after your objects have moved. Let the scene own the world with `scene.own(world)`. When the scene unloads, it disposes the world and its bodies. `own` returns `null` if the scene cannot take the world, so check the result.

The complete program below drops a crate onto the ground. It draws each body as a rectangle with a small component, because bodies have no picture of their own.

```ts
import {
  Colors,
  Game,
  GameComponent,
  GameObject,
  PhysicsWorld2D,
  Renderer,
  Scene,
  Vector2D,
} from '@bornengine/engine';
import type { Color } from '@bornengine/engine';

class BoxView extends GameComponent {
  private readonly width: number;
  private readonly height: number;
  private readonly color: Color;

  constructor(width: number, height: number, color: Color) {
    super();
    this.width = width;
    this.height = height;
    this.color = color;
  }

  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawRectangle(
      { x: position.x - this.width / 2, y: position.y - this.height / 2, width: this.width, height: this.height },
      this.color,
    );
  }
}

class Level extends Scene {
  private readonly physics: PhysicsWorld2D | null;

  constructor(game: Game) {
    super(game, { name: 'level' });
    const world = new PhysicsWorld2D(game, {
      gravity: new Vector2D(0, 900),
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    });
    const owned = world.isReady ? this.own(world) : null;
    if (owned === null) {
      console.error(world.error ?? 'The scene could not own the physics world.');
      world.dispose();
      this.physics = null;
      return;
    }
    this.physics = owned;

    this.addBox(owned, 'Ground', 400, 420, 700, 20, 'static', Colors.DARKGRAY);
    this.addBox(owned, 'Crate', 400, 60, 40, 40, 'dynamic', Colors.ORANGE);
  }

  private addBox(
    world: PhysicsWorld2D,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    type: 'static' | 'dynamic',
    color: Color,
  ): void {
    const object = new GameObject({ name, position: { x, y, z: 0 } });
    object.addComponent(world.createBody({ type, shape: { type: 'box', width, height } }));
    object.addComponent(new BoxView(width, height, color));
    this.addNode(object);
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null) this.physics.step(deltaTime);
  }
}

class FallingCrate extends Game {
  constructor() {
    super({ window: { title: 'Falling crate', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Level(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new FallingCrate().run();
```

Run it with `bornengine run main.ts`. The crate falls, lands on the ground, and stays there. The scene's `update()` runs the objects first and then steps the world. After the step, the world has written the new position of the crate into its transform, so `BoxView` draws the crate where the simulation put it.

To see the accumulator work, step a world by hand. This function prints how many steps each call runs:

```ts
import { Game, PhysicsWorld2D } from '@bornengine/engine';

function demonstrateStepping(game: Game): void {
  const world = new PhysicsWorld2D(game, { gravity: { x: 0, y: 900 }, fixedTimeStep: 1 / 60, maxSubSteps: 5 });
  const ball = world.createBody({
    type: 'dynamic',
    shape: { type: 'circle', radius: 8 },
    position: { x: 100, y: 0 },
  });

  console.log(world.step(1 / 120));
  console.log(world.step(1 / 120));
  console.log(ball.position.y, ball.velocity.y);
  console.log(world.step(1), world.droppedTime);
  world.dispose();
}
```

The first call prints `0`: half a step is not enough. The second prints `1`, because the two halves add up to a whole step. After that one step the ball has moved 0.25 units down and has a downward speed of 15 units per second. The last call offers a full second, but the world accepts only 5/60 of a second, runs 5 steps, and records the rest in `droppedTime`.

### What one step does

Inside a step, the world always works in the same order:

1. It leaves out bodies that are disposed, disabled, or attached to an object that is inactive or not in a scene. A static or kinematic body takes its position from the transform of its object. A dynamic body does that only on its first step, or when something other than the world has moved its object.
2. Each dynamic body integrates, in creation order. Its velocity gains the sum of gravity times `gravityScale` and force divided by mass, multiplied by the step length. Then its position gains velocity multiplied by the step length. A body with `ccd` is then swept against static bodies. The Continuous collision detection section below explains how.
3. The world finds pairs of bodies that may touch with a uniform grid, drops pairs that the layer and mask filters exclude, and sorts the rest by body creation order.
4. Each pair is tested in that order. Overlapping bodies are pushed apart and exchange impulses for bounce and friction. A pair with a sensor is only reported.
5. Dynamic bodies write their X and Y position into the transforms of their objects. The Z value stays as it was.
6. Collision and trigger events are sorted by the creation order of the two bodies and delivered.

Because bodies and contacts are always processed in creation order, the same sequence of calls gives the same result.

### Change and read the world

`setGravity(vector)` and `setFixedTimeStep(step, maxSubSteps)` return `false` and change nothing if a value is invalid. `gravity`, `fixedTimeStep`, `maxSubSteps`, `bodyCount`, `droppedTime`, `isReady`, `isDisposed`, and `error` read the current state. `lastCandidatePairCount`, `lastNarrowphaseTestCount`, and `lastQueryCandidateCount` report how many pairs and bodies the latest step or query examined, which helps when you profile a crowded level. `dispose()` removes all bodies and ends the world.

## Bodies and supported shapes

`world.createBody(options)` returns a `PhysicsBody2D`. Add it to a `GameObject` with `addComponent`, and add the object to a scene.

A `dynamic` body can use a `box` or a `circle` shape. A `kinematic` body can use the same two shapes.
Only `static` bodies can use a `segment` or a `convex` shape.

- `box` has a `width` and a `height` and is centered on the body position.
- `circle` has a `radius` and is centered on the body position.
- `segment` is a line from `start` to `end`. It has no thickness. Use it for ramps and thin walls.
- `convex` is a polygon described by `vertices`. It needs at least three vertices that form a convex polygon, with no three vertices in a line. Either winding direction works. A polygon that is concave or degenerate is rejected.

The `start` and `end` of a segment and the `vertices` of a convex shape are relative to the body position. A body at (500, 640) with a segment from (-80, 32) to (80, -32) covers the world points (420, 672) and (580, 608).

Shapes never rotate. The world ignores the rotation and the scale of the game object, and it keeps the Z position unchanged.

These are the options of `createBody`:

| Option | Default | Meaning |
| --- | --- | --- |
| `type` | `'dynamic'` | `'static'`, `'dynamic'`, or `'kinematic'`. |
| `shape` | required | One of the shapes above. |
| `position` | `{ x: 0, y: 0 }` | Start position of a body that is not attached to an object. The position of an attached object wins. |
| `velocity` | `{ x: 0, y: 0 }` | Start velocity in units per second. |
| `mass` | `1` | Greater than 0. Used by dynamic bodies. |
| `gravityScale` | `1` | Multiplies the world gravity. Use 0 for a body that gravity should not move. |
| `friction` | `0.2` | 0 or more. |
| `restitution` | `0` | From 0 to 1. How much speed a body keeps when it bounces. |
| `isSensor` | `false` | Report overlaps without pushing. |
| `layer`, `mask` | `1`, `0x7fffffff` | Which bodies collide. See Layers and masks below. |
| `oneWay` | none | Makes a static body a one-way surface. See One-way surfaces below. |
| `ccd`, `ccdThreshold` | `false`, `0` | Swept collision for fast dynamic bodies. |

When two bodies touch, they bounce by the smaller of their two `restitution` values, and friction uses the square root of the product of their two `friction` values.

An invalid option does not throw. The body keeps an `error` message, is disabled, and takes no part in the simulation, so check `body.error` after you create a body. The type, shape, `oneWay`, and `ccd` settings are fixed when the body is created.

### Bodies and game objects

An attached body follows the transform of its object, as the list in the previous section describes. To teleport a dynamic body, call `body.setPosition(position)`, or change the position of its object. The world accepts either. Destroying the object disposes the body.

A body that you create and never attach is a standalone body. It simulates at `options.position`, and you read its result from `body.position`. It stays in the world until you call `dispose()` on it or on the world.

### Move and change a body

All setters return `false` and change nothing if a value is invalid. `position` and `velocity` return copies, so changing the returned vector does not move the body.

| Member | What it does |
| --- | --- |
| `setPosition(vector)` | Places the body, and its object, at once. |
| `setVelocity(vector)` | Replaces the velocity. |
| `applyImpulse(vector)` | Dynamic bodies only. Changes the velocity at once by the impulse divided by the mass. |
| `applyForce(vector)` | Dynamic bodies only. The force acts during the next fixed step and is then cleared, so call it every frame for a steady push. |
| `setMass(value)` | Dynamic bodies only. Greater than 0. |
| `setGravityScale(value)`, `setFriction(value)`, `setRestitution(value)` | Change the material and gravity settings. |
| `setSensor(value)` | Turns the sensor behavior on or off. |
| `setCollisionFilter(layer, mask)` | Changes the layer and mask. |

A kinematic body is not moved by gravity, forces, or its own velocity. Move it with `setPosition` or by moving its object. Dynamic bodies that touch it are pushed out of the way.

This function builds a small test level. It makes a floor, a crate and a ball that fall, a ramp from a `segment`, and a rock from a `convex` polygon.

```ts
import { GameObject, PhysicsWorld2D, Scene } from '@bornengine/engine';
import type { PhysicsBody2DOptions } from '@bornengine/engine';

function addBody(scene: Scene, world: PhysicsWorld2D, name: string, x: number, y: number, options: PhysicsBody2DOptions): void {
  const object = new GameObject({ name, position: { x, y, z: 0 } });
  const body = world.createBody(options);
  if (body.error !== null) {
    console.error(name + ': ' + body.error);
    body.dispose();
    return;
  }
  object.addComponent(body);
  scene.addNode(object);
}

function buildTestLevel(scene: Scene, world: PhysicsWorld2D): void {
  addBody(scene, world, 'Floor', 400, 440, {
    type: 'static',
    shape: { type: 'box', width: 800, height: 20 },
  });
  addBody(scene, world, 'Crate', 300, 100, {
    type: 'dynamic',
    shape: { type: 'box', width: 32, height: 32 },
    mass: 2,
    friction: 0.6,
  });
  addBody(scene, world, 'Ball', 340, 40, {
    type: 'dynamic',
    shape: { type: 'circle', radius: 12 },
    restitution: 0.6,
  });
  addBody(scene, world, 'Ramp', 600, 398, {
    type: 'static',
    shape: { type: 'segment', start: { x: -80, y: 32 }, end: { x: 80, y: -32 } },
  });
  addBody(scene, world, 'Rock', 150, 430, {
    type: 'static',
    shape: { type: 'convex', vertices: [
      { x: -24, y: 0 }, { x: 24, y: 0 }, { x: 16, y: -24 }, { x: -16, y: -24 },
    ] },
  });
}
```

## One-way surfaces

A one-way surface lets a body pass through it in one direction and blocks it in the other. The classic example is a platform that a character can jump up through from below and then stand on.

Make a one-way surface by setting `oneWay` on a static body. `oneWay.normal` is the direction the surface faces, which is the side that bodies may land on. The world normalizes it, so it only has to be non-zero. `tolerance` is a distance in world units, at least 0, that defaults to 0. The body gets an error if it is not static, if the normal is a zero vector, or if the tolerance is negative or not finite.

With Y pointing down, `{ x: 0, y: -1 }` faces up, so bodies can land on the surface from above.

```ts
import { GameObject, PhysicsWorld2D, Scene } from '@bornengine/engine';

function addBridge(scene: Scene, world: PhysicsWorld2D): void {
  const bridge = new GameObject({ name: 'Bridge', position: { x: 500, y: 360, z: 0 } });
  bridge.addComponent(world.createBody({
    type: 'static',
    shape: { type: 'segment', start: { x: -80, y: 0 }, end: { x: 80, y: 0 } },
    oneWay: { normal: { x: 0, y: -1 }, tolerance: 0.01 },
  }));
  scene.addNode(bridge);
}

function addFallingCrate(scene: Scene, world: PhysicsWorld2D): void {
  const crate = new GameObject({ name: 'Crate', position: { x: 500, y: 200, z: 0 } });
  crate.addComponent(world.createBody({
    type: 'dynamic',
    shape: { type: 'box', width: 32, height: 32 },
    ccd: true,
  }));
  scene.addNode(crate);
}
```

The world blocks a body at a one-way surface only when all of these are true:

- During the step, the body moves against the normal. In other words, it moves toward the surface from the side that the surface faces. A body that moves along the normal, across it, or away from the surface passes through.
- At its previous position, the position at the start of the step, the body was on the side that the surface faces. The body may overlap the surface by up to `tolerance` at that position. A body that starts deeper inside the surface passes through.
- The contact normal, which points out of the surface, is within 60 degrees of `oneWay.normal`.

A reversed normal makes the surface block from the other side. A character that rises through a platform from below meets neither of the first two conditions, so it passes through, and it lands on the platform when it falls back from above.

`CharacterBody2D` movement and swept collision use the same rule, and the usual layer and mask filters still apply. Queries do not use it: `raycast` and the overlap methods treat a one-way surface as an ordinary solid.

A dynamic body without `ccd` needs extra care. When it lands, the solver moves it only part of the way out of the surface in that step, so the body can end the step slightly inside the surface. On the next step its previous position is inside the surface by more than a `tolerance` of 0, the contact is skipped, and the body falls through. For a dynamic body that has to stand on a one-way surface, set `ccd: true` on the body, as `addFallingCrate` does. A larger `tolerance` can also work, but the amount that the body sinks grows with its speed. `CharacterBody2D` is not affected, because it sweeps and stops exactly at the surface.

## Character movement

A character in a platformer or a top-down game does not behave like a crate. You want exact control: run at a fixed speed, jump, and stop at once. `CharacterBody2D` gives you that. It moves a box through the world and slides it along whatever it hits, and it leaves the rules of the movement to your code.

Create it with `new CharacterBody2D(world, { width, height })` and add it to a game object in a scene. The center of the box is the world position of the object. Then call `moveAndSlide(velocity, deltaTime)` once per frame:

- It moves the character by `velocity * deltaTime`. It does not add gravity. Your code adds gravity to the velocity.
- It first slides along static `segment` and `convex` surfaces, such as ramps, for up to four contacts. Then it moves along X and along Y, one after the other, against every other body that is not a sensor and that the layer and mask filters allow, including dynamic bodies. The character stops at them and does not push them.
- It applies one-way rules to the surfaces that have them.
- It returns `false` and does nothing if the component is disabled or invalid, if its object is not active in a scene, or if a value is not finite or `deltaTime` is negative.

After the call, read the result:

| Member | Meaning |
| --- | --- |
| `position` | The new world position. |
| `velocity` | The velocity after the character slid. The parts that pointed into a surface are removed. If the character has no more room after four slide contacts, the velocity is zero. |
| `isOnFloor`, `isOnWall`, `isOnCeiling` | Set by the latest call. A contact normal that points up and is less than 45 degrees from vertical marks a floor. A normal that points down and is less than 45 degrees from vertical marks a ceiling. A normal that is less than 45 degrees from horizontal marks a wall. |
| `contactNormals` | The normal of every surface that blocked the move. |

All of these are copies. Normals point away from the surface, so a floor has a normal of `{ x: 0, y: -1 }`.

This `Player` class runs, jumps, and lands. It keeps the resolved velocity from one frame to the next, so the vertical speed becomes 0 when the character stands on the floor.

```ts
import { CharacterBody2D, GameObject, Key } from '@bornengine/engine';
import type { InputSystem, PhysicsWorld2D } from '@bornengine/engine';

const GRAVITY = 900;
const RUN_SPEED = 220;
const JUMP_SPEED = 430;

class Player extends GameObject {
  private readonly body: CharacterBody2D;
  private readonly input: InputSystem;

  constructor(world: PhysicsWorld2D, input: InputSystem) {
    super({ name: 'Player', position: { x: 100, y: 100, z: 0 } });
    this.input = input;
    this.body = new CharacterBody2D(world, { width: 22, height: 30 });
    if (this.body.error !== null) console.error(this.body.error);
    this.addComponent(this.body);
  }

  override update(deltaTime: number): void {
    const velocity = this.body.velocity;
    let direction = 0;
    if (this.input.isKeyDown(Key.LEFT)) direction -= 1;
    if (this.input.isKeyDown(Key.RIGHT)) direction += 1;

    velocity.x = direction * RUN_SPEED;
    velocity.y += GRAVITY * deltaTime;
    if (this.body.isOnFloor && this.input.isKeyPressed(Key.SPACE)) velocity.y = -JUMP_SPEED;

    this.body.moveAndSlide(velocity, deltaTime);
  }
}
```

Add the player to the same scene as the world, for example `this.addNode(new Player(world, game.input))`.

`moveAndSlide` accepts any non-negative `deltaTime`, and the frame time is fine for most games. For results that repeat exactly, call it from `fixedUpdate()` with a constant `deltaTime`. The game never calls `fixedUpdate()` by itself: your `loop()` has to collect time and call `this.scenes.updateFixed(fixedDeltaTime)` once for each fixed tick.

The character is not a full rigid body:

- It is a box. It has no step-up logic and does not push dynamic bodies. Dynamic bodies that overlap it are pushed away when the world steps.
- The character's body uses layer 1 and the default mask. An obstacle blocks the character only if the obstacle's `mask` includes bit 1. Call `setCollisionFilter` on an obstacle to let the character pass.
- The world holds a kinematic body for the character, and that body is not attached to your object, so its `gameObject` is `null`. Overlap queries find it, and a sensor that the character enters reports it as the other body. To react when the character touches a sensor, attach a second body to the character's object: a `kinematic` body with `isSensor: true` and a box the size of the character. The sensor then reports that body, and `contact.other.gameObject` is your object.
- A character that still has movement left after four slide contacts keeps its position at the last contact. It drops the rest of the move and returns a velocity of zero.

## Continuous collision detection

A fast body can move so far in one step that it ends on the other side of a thin wall. The world only tests where the body ends up, so it never sees the wall. This is called tunneling. Continuous collision detection, or CCD, checks the whole path of the body instead.

Set `ccd: true` on a dynamic body to turn it on. The setting is off by default, because a sweep costs more than a simple test. After the body moves in a step, the world checks how far it traveled. If the distance is at least `ccdThreshold`, which defaults to 0 world units, the world sweeps the shape along that path against static bodies, stops the body at the first hit, and continues with the time that is left along the resolved velocity. A step handles at most eight impacts per body. After the eighth, the world drops the rest of the time and sets the velocity to zero.

```ts
import { GameObject, PhysicsWorld2D, Scene } from '@bornengine/engine';

function fireBullet(scene: Scene, world: PhysicsWorld2D, x: number, y: number): void {
  const bullet = new GameObject({ name: 'Bullet', position: { x, y, z: 0 } });
  bullet.addComponent(world.createBody({
    type: 'dynamic',
    shape: { type: 'circle', radius: 4 },
    velocity: { x: 3600, y: 0 },
    gravityScale: 0,
    friction: 0,
    ccd: true,
    ccdThreshold: 4,
  }));
  scene.addNode(bullet);
}
```

This bullet travels 60 units in each 1/60 second step. With `ccd: true`, it stops at a thin wall. Without `ccd`, it can end a step on the far side of any wall that is thinner than the distance it travels.

Keep these limits in mind:

- CCD applies to dynamic bodies. It sweeps against static bodies only. A fast dynamic body can still pass through a thin dynamic or kinematic body.
- The sweep respects the layer and mask filters and the one-way rules.
- A dynamic sensor with `ccd` is not stopped. It reports a trigger contact with each static body that it crosses and keeps moving.
- Use it for small, fast bodies such as bullets. A body that moves less than its own size per step does not need it.

## Collision events and queries

Bodies tell you about touches in two ways: callbacks on the body, and a queue on the world. The world also answers questions about the space around a point.

### Callbacks

A `PhysicsBody2D` has six callbacks, all `null` by default:

- `onCollisionEnter`, `onCollisionStay`, and `onCollisionExit` for pairs of solid bodies.
- `onTriggerEnter`, `onTriggerStay`, and `onTriggerExit` for pairs in which at least one body is a sensor.

Enter runs on the step in which two bodies start to touch. Stay runs on every following step while they touch. Exit runs on the first step in which they no longer touch, and also on the step after one of them is disposed. A callback gets a `PhysicsBodyContact2D` with these fields:

| Field | Meaning |
| --- | --- |
| `phase` | `'enter'`, `'stay'`, or `'exit'`. |
| `self`, `other` | The body that received the callback and the body it touched. |
| `normal` | A unit vector that points from `self` toward `other`. |
| `point` | A point on the contact. |
| `penetration` | How far the bodies overlap. It is 0 for exits and for swept contacts. |
| `isTrigger` | `true` when either body is a sensor. |

Callbacks run inside `step()`. For each contact, the body that was created first is notified first. Do not call `step()` from a callback; it returns 0. An object that is inactive or not in a scene receives no callbacks. Use `contact.other.gameObject` to find the object that a body belongs to. It is `null` for a standalone body.

```ts
import { PhysicsBody2D } from '@bornengine/engine';

function watchCrate(crate: PhysicsBody2D): void {
  crate.onCollisionEnter = (contact) => {
    const other = contact.other.gameObject;
    const name = other === null ? 'a loose body' : other.name;
    console.log('hit ' + name + ' with normal ' + contact.normal.x + ', ' + contact.normal.y);
  };
  crate.onTriggerEnter = (contact) => {
    console.log('entered a sensor, body ' + contact.other.id);
  };
}
```

### The contact queue

The world also stores a pair-oriented record for every contact in a queue. `popContacts()` returns all records since the last call and empties the queue. Each `PhysicsContact2D` has `phase`, `bodyA`, `bodyB`, `normal`, `point`, `penetration`, and `isTrigger`. `bodyA` is the body that was created first, `bodyB` is the other one, and `normal` points from `bodyA` toward `bodyB`. The records come in creation order.

The world keeps every record until you read it, and it records a `stay` for each touching pair on each step. Call `popContacts()` once per frame, even if you only use callbacks and discard the result. Otherwise the queue grows for as long as bodies touch. `contactCount` tells you how many records are waiting. `clearContacts()` also empties the queue, but it forgets which pairs are touching, so the next step reports `enter` again for pairs that still touch. Use `popContacts()` to drain the queue.

```ts
import { PhysicsWorld2D } from '@bornengine/engine';

function drainContacts(world: PhysicsWorld2D): void {
  const contacts = world.popContacts();
  for (let index = 0; index < contacts.length; index++) {
    const contact = contacts[index];
    if (contact.phase === 'enter' && !contact.isTrigger) {
      console.log('bodies ' + contact.bodyA.id + ' and ' + contact.bodyB.id + ' started to touch');
    }
  }
}
```

### Layers and masks

Every body has a `layer` and a `mask`. Both are bit sets, which store several on/off choices in one whole number: the layers are the numbers 1, 2, 4, 8, and so on, and you combine them with `|`. Two bodies are tested for a collision only if each body's `layer` shares a bit with the other body's `mask`. The default layer is 1 and the default mask is `0x7fffffff`, which includes every layer. Both must be whole numbers from 0 to `0x7fffffff`, and the layer cannot be 0.

```ts
import { PhysicsBody2D, PhysicsWorld2D } from '@bornengine/engine';

const PLAYER = 1;
const ENEMY = 2;
const PLAYER_SHOT = 4;
const SCENERY = 8;

function createEnemyBody(world: PhysicsWorld2D): PhysicsBody2D {
  return world.createBody({
    type: 'dynamic',
    shape: { type: 'box', width: 24, height: 24 },
    layer: ENEMY,
    mask: PLAYER | PLAYER_SHOT | SCENERY,
  });
}
```

### Queries

The world can answer spatial questions without moving anything. All of them use the current positions of the bodies and return nothing for a world that is not ready.

| Method | Result |
| --- | --- |
| `raycast(origin, direction, maxDistance, options)` | The nearest hit, as `{ body, point, normal, distance }`, or `null`. The direction does not need to be a unit vector, but it cannot be zero. |
| `overlapPoint(point, options)` | The bodies that contain the point. |
| `overlapCircle(center, radius, options)` | The bodies that overlap the circle. |
| `overlapBox(center, size, options)` | The bodies that overlap the box. `size` is the full width and height, centered on `center`. |

The overlap methods return bodies in creation order. `options.layerMask` limits the result to bodies whose layer shares a bit with the mask, and defaults to every layer. `options.includeSensors` defaults to `true`. Queries ignore one-way settings.

A ray that starts inside a shape can hit that shape. A character's own body counts, so do not cast a ray from the center of a character unless you filter with `layerMask`. The next function checks whether a wall blocks the view between two points. The walls are created with the layer `SCENERY`, and the ray looks only at that layer.

```ts
import { PhysicsWorld2D, Vector2D } from '@bornengine/engine';

const SCENERY = 8;

function hasLineOfSight(world: PhysicsWorld2D, from: Vector2D, to: Vector2D): boolean {
  const direction = to.subtract(from);
  const wall = world.raycast(from, direction, direction.magnitude, { layerMask: SCENERY });
  return wall === null;
}
```

An overlap query is the simplest way to find what a character touches. This function collects the coins that overlap a character. A coin is an object named `Coin` with a sensor body. The query also returns the body of the character itself, so the function skips every body that is not a sensor on an object named `Coin`.

```ts
import { CharacterBody2D, PhysicsWorld2D, Vector2D } from '@bornengine/engine';

function collectCoins(world: PhysicsWorld2D, player: CharacterBody2D): number {
  const touching = world.overlapBox(player.position, new Vector2D(player.width, player.height));
  let collected = 0;
  for (let index = 0; index < touching.length; index++) {
    const body = touching[index];
    const owner = body.gameObject;
    if (!body.isSensor || owner === null || owner.name !== 'Coin') continue;
    owner.destroy();
    collected++;
  }
  return collected;
}
```

Destroying the object disposes its sensor body, so the coin cannot be collected twice.

## Limits

- Moving bodies are boxes and circles. Segments and convex polygons are static only, and there are no joints or springs.
- Nothing rotates. Shapes keep their orientation, and the world ignores the rotation and scale of the game object.
- The world does not interpolate between fixed steps.
- Sweeps cover dynamic bodies against static bodies. Kinematic bodies are not swept and do not move on their own.
- The contact queue keeps growing until you call `popContacts()`.

## Next steps

- [Tilemaps](../tilemap/) lists the solid cells of a map so that you can create static bodies for them.
- [Camera 2D](../camera2d/) follows the character you move.
- [2D pathfinding](../pathfinding2d/) plans a route for an enemy to walk.
- [Physics 2D and tilemaps](../../guides/physics2d-tilemap/) builds a level with collision step by step.
- [2D game](../../guides/2d-game/) puts sprites, a tile map, and physics together. The repository example `examples/2d-platformer` uses slopes, a one-way bridge, a fast projectile with `ccd`, and a character.
