---
title: Add physics gameplay
description: Step a 3D physics world, move a ball with impulses, read contacts, and keep game objects in sync with their bodies.
section: Guides
order: 72
---

This guide adds 3D physics to a game. You create a physics world, put a floor, walls, and balls into it, and roll a ball into a small pyramid of targets. A moving bar sweeps through the arena. The game counts the targets you hit and lets you jump when the ball touches the floor.

Each section adds one piece. The last section has the complete `main.ts`. For a 2D game, use [2D physics and tilemaps](../physics2d-tilemap/).

## What you will build

- A 20 by 20 meter arena with a floor and four walls.
- A ball you steer with the arrow keys or `WASD`, jump with `Space`, and reset with `R`.
- Six target balls in a pyramid, and a bar that moves back and forth.
- A hit counter that reads the contacts from the physics world.

## Words you will see

- **Physics world**: a `PhysicsWorld`. It owns the colliders and bodies and moves them in fixed time steps.
- **Collider**: a shape, such as a box or a sphere. Colliders can be shared by many bodies.
- **Body**: a thing in the world that uses a collider and has a position and a velocity. Its **motion type** says who moves it. A **static** body never moves. A **dynamic** body is moved by the simulation. A **kinematic** body is moved by your code.
- **Contact**: a record that two bodies started to touch, kept touching, or stopped touching.

The world uses meters, kilograms, and seconds. The y axis points up. Keep dynamic bodies between about 0.1 and 10 meters in size, and within about a kilometer of the origin.

## Setup

Physics needs the `3d` project profile, which compiles the physics library into the game:

```sh
bornengine new RollingBall --game-type 3d
cd RollingBall
```

The game needs no assets. If you use the default `2d` profile or the `2.5d` profile, the physics library is not part of the build. The world then reports `isReady` as `false`, and the example below stops with a message. The physics world is also not available on watchOS. See [Project commands](../../cli/project/) for the profiles.

## Game loop

The simplest physics game has three parts. You create the world once, you step it every frame, and you read the results. This is a complete `main.ts` with a floor and a bouncing ball:

```ts
import { BoxCollider, Colors, Game, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';
import type { Camera3D, RigidBody } from '@bornengine/engine';

class DropGame extends Game {
  private world: PhysicsWorld | null = null;
  private ball: RigidBody | null = null;

  constructor() {
    super({ window: { title: 'Drop', width: 1024, height: 576 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const world = new PhysicsWorld(this, { gravity: { x: 0, y: -9.81, z: 0 } });
    if (!world.isReady) throw new Error('The physics world is not ready. Create the project with --game-type 3d.');

    const floor = new BoxCollider(world, { x: 10, y: 0.5, z: 10 });
    world.createBody(floor, { motionType: MotionType.STATIC, position: { x: 0, y: -0.5, z: 0 } });

    const sphere = new SphereCollider(world, 0.5);
    this.ball = world.createBody(sphere, {
      motionType: MotionType.DYNAMIC,
      position: { x: 0, y: 4, z: 0 },
      restitution: 0.6,
    });
    this.world = world;
  }

  protected override loop(deltaTime: number): void {
    if (this.world !== null) this.world.step(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 16, g: 20, b: 30, a: 255 });
    const camera: Camera3D = {
      position: { x: 0, y: 4, z: 9 },
      target: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective',
    };
    if (this.renderer.begin3D(camera)) {
      this.renderer.drawGrid(20, 1);
      const position = this.ball === null ? null : this.ball.position;
      if (position !== null) this.renderer.drawSphere(position, 0.5, Colors.SKYBLUE);
      this.renderer.end3D();
    }
  }
}

new DropGame().run();
```

Run it with `bornengine run main.ts`. The ball falls, bounces, and settles.

How it works:

- `new PhysicsWorld(this, { gravity })` makes a world for this game. The default gravity is `(0, -9.81, 0)`. The game releases the world and everything in it when it stops.
- `BoxCollider` takes the **half** extents, so `{ x: 10, y: 0.5, z: 10 }` makes a box 20 wide, 1 tall, and 20 deep. The floor is centered at `y: -0.5`, so its top is at `y: 0`. `SphereCollider` takes a radius.
- `world.createBody(collider, options)` makes a body. `restitution` is the bounciness, from 0 to 1.
- `step(deltaTime)` advances the simulation. The world keeps its own time accumulator and runs fixed steps of 1/60 second. It clamps a long frame to 0.25 seconds and runs at most four fixed steps in one call, so a pause cannot make it run a long catch-up. Change that with `setFixedTimestep(hz, maxSteps)`. The method returns the interpolation alpha, a number from 0 to 1. Call it once per frame.
- `setInterpolation(true)` makes `body.position` and `body.rotation` blend between the last two steps, so motion stays smooth when the frame rate is not a multiple of 60.
- Bodies report `position` and `rotation`, and both are `null` when the body is not loaded. Check for `null` before you draw.

Collider and body creation do not throw. If a collider or body cannot be created, it has a message in `error` and `isLoaded` is `false`.

## Bodies and game objects

Reading `body.position` is enough for a small game. A larger game keeps its things as `GameObject`s in a scene, with names, children, and components. The `RigidBodyComponent` connects the two. It copies positions between the object's transform and its body around each `world.step()`:

```ts
import { GameObject, RigidBodyComponent, Scene } from '@bornengine/engine';
import type { RigidBody } from '@bornengine/engine';

function attachBody(scene: Scene, object: GameObject, body: RigidBody): void {
  object.addComponent(new RigidBodyComponent(body, { ownership: 'owned' }));
  scene.addNode(object);
}
```

What the component does depends on the body's motion type:

- **Static**: before each step, the body is placed at the object's transform. Move the object to move the body.
- **Kinematic**: before each step, the body is moved to the object's transform, so that it pushes dynamic bodies out of its way. Change the object's position in `update()` to drive it, for example a moving platform.
- **Dynamic**: after each step, the object's transform is set from the body. The simulation moves the object. The object's scale is not changed.

The component works through the game's scene manager, which `PhysicsWorld` uses by default. The scene that holds the object must be the active scene. Update your objects before you call `step()`, so that static and kinematic bodies see this frame's transforms.

`ownership: 'owned'` means the component disposes the body when the object is destroyed. With the default, `'borrowed'`, you keep the body alive yourself. Give a dynamic body and its object the same starting position, because the first step copies the body's position into the object.

## Contacts

Gameplay often needs to know what touched what. After a step, `world.popContacts()` returns the contact records. Each has an `event`: `ContactEvent.ADDED` when two bodies start touching, `ContactEvent.PERSISTED` while they keep touching, and `ContactEvent.REMOVED` when they separate. A record also has `bodyA`, `bodyB`, a contact `normal`, and the `penetrationDepth`.

A body has a number called `userData` that you set when you create it. It is a good tag for deciding what a contact means:

```ts
import { ContactEvent, PhysicsWorld } from '@bornengine/engine';

function countNewTouches(world: PhysicsWorld, tag: number): number {
  let count = 0;
  for (const contact of world.popContacts()) {
    if (contact.event !== ContactEvent.ADDED) continue;
    const touchesTag =
      (contact.bodyA !== null && contact.bodyA.userData === tag) ||
      (contact.bodyB !== null && contact.bodyB.userData === tag);
    if (touchesTag) count += 1;
  }
  world.clearContacts();
  return count;
}
```

`popContacts()` does not remove the records. A step replaces the stored records only when it runs at least one fixed step. A frame that runs none, which is common when the screen refreshes faster than 60 times a second, would hand you the same records again. Call `clearContacts()` after you handle them, as the function above does. `bodyA` and `bodyB` can be `null` when the world does not know the body, for example after it was disposed.

## Complete example

Replace `main.ts` with this file:

```ts
import {
  BoxCollider,
  Colors,
  ContactEvent,
  Game,
  GameObject,
  Key,
  MotionType,
  PhysicsWorld,
  RigidBodyComponent,
  Scene,
  SphereCollider,
} from '@bornengine/engine';
import type { Collider, Color, InputActionMap, Renderer, RigidBody, RigidBodyOptions } from '@bornengine/engine';
import type { Vec3 } from '@bornengine/engine/physics';

const PUSH = 10;
const JUMP_SPEED = 5;
const START: Vec3 = { x: 0, y: 1, z: 6 };
const Tag = { PLAYER: 1, TARGET: 2, GROUND: 3 } as const;

const WALLS: Array<[Vec3, Vec3]> = [
  [{ x: 0, y: 1, z: -10 }, { x: 10, y: 1, z: 0.25 }],
  [{ x: 0, y: 1, z: 10 }, { x: 10, y: 1, z: 0.25 }],
  [{ x: -10, y: 1, z: 0 }, { x: 0.25, y: 1, z: 10 }],
  [{ x: 10, y: 1, z: 0 }, { x: 0.25, y: 1, z: 10 }],
];

type Shape = { kind: 'sphere'; radius: number } | { kind: 'box'; halfExtents: Vec3 };

class Prop extends GameObject {
  private readonly shape: Shape;
  private readonly color: Color;

  constructor(name: string, position: Vec3, shape: Shape, color: Color) {
    super({ name, position });
    this.shape = shape;
    this.color = color;
  }

  draw(renderer: Renderer): void {
    const position = this.transform.worldPosition;
    if (this.shape.kind === 'sphere') {
      renderer.drawSphere(position, this.shape.radius, this.color);
    } else {
      const half = this.shape.halfExtents;
      renderer.drawCube(position, { x: half.x * 2, y: half.y * 2, z: half.z * 2 }, this.color);
    }
  }
}

class Bar extends Prop {
  private time = 0;

  override update(deltaTime: number): void {
    this.time += deltaTime;
    this.transform.position.z = Math.sin(this.time * 0.8) * 3;
  }
}

class Arena extends Scene {
  hits = 0;
  private grounded = false;
  private readonly world: PhysicsWorld;
  private readonly controls: InputActionMap;
  private readonly props: Prop[] = [];
  private readonly player: RigidBody;

  constructor(game: Game, controls: InputActionMap) {
    super({ name: 'arena' });
    this.controls = controls;

    const world = this.own(new PhysicsWorld(game, { gravity: { x: 0, y: -9.81, z: 0 } }));
    if (world === null || !world.isReady) {
      throw new Error('The physics world is not ready. Create the project with --game-type 3d.');
    }
    world.setInterpolation(true);
    this.world = world;

    const floorHalf = { x: 10, y: 0.5, z: 10 };
    this.addProp(
      new Prop('Floor', { x: 0, y: -0.5, z: 0 }, { kind: 'box', halfExtents: floorHalf }, Colors.DARKGRAY),
      new BoxCollider(world, floorHalf),
      { motionType: MotionType.STATIC, userData: Tag.GROUND },
    );
    for (const [position, half] of WALLS) {
      this.addProp(
        new Prop('Wall', position, { kind: 'box', halfExtents: half }, Colors.GRAY),
        new BoxCollider(world, half),
        { motionType: MotionType.STATIC },
      );
    }

    const barHalf = { x: 4, y: 0.3, z: 0.3 };
    this.addProp(
      new Bar('Bar', { x: 0, y: 0.3, z: 0 }, { kind: 'box', halfExtents: barHalf }, Colors.GOLD),
      new BoxCollider(world, barHalf),
      { motionType: MotionType.KINEMATIC },
    );

    const targetShape = new SphereCollider(world, 0.5);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column <= row; column++) {
        const position = { x: (column - row / 2) * 1.1, y: 0.5, z: -6 - row };
        this.addProp(new Prop('Target', position, { kind: 'sphere', radius: 0.5 }, Colors.ORANGE), targetShape, {
          motionType: MotionType.DYNAMIC,
          restitution: 0.3,
          linearDamping: 0.5,
          angularDamping: 0.5,
          userData: Tag.TARGET,
        });
      }
    }

    this.player = this.addProp(
      new Prop('Player', START, { kind: 'sphere', radius: 0.5 }, Colors.SKYBLUE),
      new SphereCollider(world, 0.5),
      {
        motionType: MotionType.DYNAMIC,
        restitution: 0.2,
        linearDamping: 1,
        angularDamping: 1,
        useCcd: true,
        userData: Tag.PLAYER,
      },
    );
  }

  override update(deltaTime: number): void {
    this.steer(deltaTime);
    super.update(deltaTime);
    this.world.step(deltaTime);
    this.readContacts();
  }

  draw(renderer: Renderer): void {
    for (const prop of this.props) prop.draw(renderer);
  }

  private addProp(prop: Prop, collider: Collider, options: RigidBodyOptions): RigidBody {
    const body = this.world.createBody(collider, { ...options, position: prop.transform.position });
    prop.addComponent(new RigidBodyComponent(body, { ownership: 'owned' }));
    this.addNode(prop);
    this.props.push(prop);
    return body;
  }

  private steer(deltaTime: number): void {
    const push = this.controls.readVector2('move-x', 'move-y').clampedMagnitude(1);
    const mass = this.player.mass;
    this.player.addImpulse({ x: push.x * PUSH * mass * deltaTime, y: 0, z: push.y * PUSH * mass * deltaTime });
    if (this.controls.wasPressed('jump') && this.grounded) {
      this.player.addImpulse({ x: 0, y: JUMP_SPEED * mass, z: 0 });
    }
    if (this.controls.wasPressed('reset')) {
      this.player.setPosition(START);
      this.player.setLinearVelocity({ x: 0, y: 0, z: 0 });
      this.player.setAngularVelocity({ x: 0, y: 0, z: 0 });
    }
  }

  private readContacts(): void {
    for (const contact of this.world.popContacts()) {
      const a = contact.bodyA;
      const b = contact.bodyB;
      if (a === null || b === null) continue;
      const other = a === this.player ? b : b === this.player ? a : null;
      if (other === null) continue;

      if (other.userData === Tag.TARGET && contact.event === ContactEvent.ADDED) this.hits += 1;
      if (other.userData === Tag.GROUND) {
        if (contact.event === ContactEvent.ADDED) this.grounded = true;
        if (contact.event === ContactEvent.REMOVED) this.grounded = false;
      }
    }
    this.world.clearContacts();
  }
}

class RollGame extends Game {
  private arena: Arena | null = null;

  constructor() {
    super({ window: { title: 'Rolling ball', width: 1024, height: 576 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    controls.bindAxis('move-y', {
      negative: [{ kind: 'key', key: Key.UP }, { kind: 'key', key: Key.W }],
      positive: [{ kind: 'key', key: Key.DOWN }, { kind: 'key', key: Key.S }],
    });
    controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
    controls.bindAction('reset', { kind: 'key', key: Key.R });

    const arena = new Arena(this, controls);
    if (!this.scenes.changeTo(arena)) throw new Error('Could not activate the arena.');
    this.arena = arena;
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 16, g: 20, b: 30, a: 255 });
    this.sceneGraph.setAmbientLight({ r: 255, g: 255, b: 255, a: 255 }, 0.3);
    this.sceneGraph.addDirectionalLight({ x: 0.3, y: 1, z: 0.5 }, { r: 255, g: 244, b: 224, a: 255 }, 0.9);

    const camera = {
      position: { x: 0, y: 13, z: 15 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective' as const,
    };
    if (this.renderer.begin3D(camera)) {
      if (this.arena !== null) this.arena.draw(this.renderer);
      this.renderer.end3D();
    }

    const hits = this.arena === null ? 0 : this.arena.hits;
    this.renderer.drawText('Arrows/WASD: roll   Space: jump   R: reset   Hits: ' + hits, { x: 16, y: 16 }, 18, Colors.WHITE);
  }
}

const game = new RollGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Run it with `bornengine run main.ts`. Roll the ball into the pyramid. The bar sweeps back and forth and can push the ball.

What each part does:

- `Prop` is a game object that knows its shape and color, and draws that shape in 3D. A game object has no draw method of its own that the engine calls. The game calls `Prop.draw()` between `begin3D` and `end3D`, and the object's transform supplies the position. Because the physics sync writes the transform, the sphere is drawn where its body is.
- `addProp()` creates a body, wraps it in a `RigidBodyComponent`, and adds the object to the scene. The six targets share one `SphereCollider`. Share a collider between bodies when the shape is the same.
- The floor and walls are static. `Bar` is kinematic: its `update()` moves the transform, and the component moves the body to match before each step.
- `steer()` runs before the step. It applies an **impulse**, a sudden change of momentum, and scales it by `mass * deltaTime`. The speed gained per second then does not depend on the frame rate. A jump is one impulse upward, and it only happens when the ball touches the floor. `linearDamping` slows the ball when you let go of the keys.
- `useCcd: true` turns on continuous collision detection for the ball, so a fast ball cannot pass through a thin wall between two steps.
- `readContacts()` runs after the step. The `userData` tags tell the code what the other body is. A new touch with a target adds a hit. The ball counts as on the ground from the moment it touches the floor until the contact is removed. Then the code clears the stored contacts.
- The `Arena` owns the world with `own()`. When the arena scene unloads, it destroys the objects, which dispose their bodies, and then it disposes the world.
- The lights are set in `render()` on every frame, because the renderer clears lights at the start of each frame.

## Limits to know

- The physics library must be part of the build, so use the `3d` profile. On the web, the same classes run on JoltPhysics.js. watchOS has no physics.
- `drawCube` cannot rotate. This guide draws spheres, which look the same when they spin, and boxes that never rotate. To show a tumbling box, draw it with a scene node or a model and add a `SceneNodeComponent` to its object, so that the node follows the object's transform. See [Build a 3D scene](../3d-scene/).
- Use `addImpulse` for a push that you apply once per frame, as this guide does. It changes the velocity at once, so the result does not depend on how many fixed steps the frame runs. A force from `addForce` is read by the next fixed step, so a frame with several steps applies it to the first one only.
- Do not move a dynamic body by changing its object's transform. Use `setPosition`, `setLinearVelocity`, or impulses, because the simulation writes the transform after every step.

## Next steps

- [Physics API](../../api/physics/) lists the colliders, joints, character controllers, queries such as `raycast`, and layers.
- [Physics guide](../physics/) covers fixed stepping, shapes, and tuning in more depth.
- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the lifecycle of the objects used here.
- [Build a 3D scene](../3d-scene/) covers cameras, scene nodes, and lights.
- [Physics 2D and tilemaps](../physics2d-tilemap/) is the 2D counterpart of this guide.
