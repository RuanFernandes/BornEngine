---
title: Physics guide
description: Build a stable 3D Jolt simulation with a fixed step, queries, contacts, characters, vehicles, soft bodies, and joints.
section: Guides
order: 60
---

3D physics in BornEngine uses the Jolt engine. You create a `PhysicsWorld`, give it shapes and bodies, step it once per frame, and read the results back. The world owns everything it creates. Disposing the world, or the `Game` that owns it, releases all of it.

Before you start, check these requirements:

- **Native games need the `3d` profile.** Jolt is compiled only there. In the `2d` and `2.5d` profiles, `new PhysicsWorld(game)` still returns an object, but its `isReady` is `false` and the console reports that the engine was built without the `jolt` feature. The object's `error` then reads `The Game must be ready to create a PhysicsWorld.`, which does not name the real cause. Set `native_profile = "3d"` in `perry.toml`.
- **The browser build loads Jolt at startup.** It uses JoltPhysics.js from `jolt-physics.mjs` next to the page, or from a CDN if that file is missing. If neither loads, the world is not ready.
- **watchOS has no physics backend.**
- **2D games use a different API.** See [Physics 2D](../../api/physics2d/).

Physics uses meters, kilograms, and seconds in a right-handed world where Y points up. The default gravity is `{ x: 0, y: -9.81, z: 0 }`. Keep dynamic bodies between about 0.1 and 10 meters in size and within about a kilometer of the origin, because precision falls off beyond that.

## Create a world and bodies

This game drops a bouncing ball on a floor. It draws the ball from the body's position each frame.

```ts
import { BoxCollider, Colors, Game, Layer, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';
import type { Camera3D, RigidBody } from '@bornengine/engine';

const CAMERA: Camera3D = {
  position: { x: 6, y: 4, z: 8 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective',
};

class PhysicsDemo extends Game {
  private world: PhysicsWorld | null = null;
  private ball: RigidBody | null = null;

  constructor() {
    super({ window: { title: 'Physics demo', width: 960, height: 540 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const world = new PhysicsWorld(this, { gravity: { x: 0, y: -9.81, z: 0 } });
    if (!world.isReady) {
      console.error(world.error === null ? 'Physics is not available.' : world.error);
      this.stop();
      return;
    }
    world.setInterpolation(true);

    const floorShape = new BoxCollider(world, { x: 10, y: 0.5, z: 10 });
    world.createBody(floorShape, {
      motionType: MotionType.STATIC,
      objectLayer: Layer.NON_MOVING,
      position: { x: 0, y: -0.5, z: 0 },
    });

    const ballShape = new SphereCollider(world, 0.5);
    this.ball = world.createBody(ballShape, {
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
    this.renderer.clear(Colors.SKYBLUE);
    if (!this.renderer.begin3D(CAMERA)) return;
    this.renderer.drawGrid(20, 1);
    const position = this.ball === null ? null : this.ball.position;
    if (position !== null) this.renderer.drawSphere(position, 0.5, Colors.ORANGE);
    this.renderer.end3D();
  }
}

new PhysicsDemo().run();
```

The pieces:

- **The world.** `new PhysicsWorld(game, options)` takes `gravity`, `maxBodies` (65,536 by default), and `numThreads` (by default, the number of hardware threads minus one, at least one). Always check `isReady` and read `error` when it is `false`.
- **Colliders.** A collider is a reusable shape. Create it once and share it between bodies of the same world. Sizes are half extents: `new BoxCollider(world, { x: 10, y: 0.5, z: 10 })` is 20 by 1 by 20 meters. The classes are `BoxCollider`, `SphereCollider`, `CapsuleCollider` (half the height of the straight section, plus a radius), `CylinderCollider`, `ConvexHullCollider`, `MeshCollider`, `HeightfieldCollider`, `CompoundCollider`, `ScaledCollider`, and `OffsetCollider`. Triangle meshes are for static bodies only.
- **Bodies.** `world.createBody(collider, options)` makes a `RigidBody`. `motionType` is `MotionType.STATIC` (never moves), `KINEMATIC` (moved by your code), or `DYNAMIC` (moved by the simulation, the default).
- **Object layers.** Every body sits in one of 16 layers. `Layer.NON_MOVING`, `MOVING`, and `SENSOR` are layers 0, 1, and 2; you can use 3 to 15 for your own. A body that you do not give a layer is in `Layer.MOVING`. Only layer 0 lands in the static part of the broad phase, so give static geometry `Layer.NON_MOVING`. All pairs of layers collide except non-moving with non-moving. Change a pair with `world.setLayerCollides(a, b, collides)`.

If you add many bodies before the first `step()`, such as a whole level of static geometry, call `world.optimizeBroadphase()` once. Do not call it every frame.

Other body options are `rotation`, `linearVelocity`, `angularVelocity`, `friction`, `restitution`, `linearDamping`, `angularDamping`, `gravityFactor`, `useCcd` (continuous collision detection for fast bodies), `isSensor`, `allowSleeping`, and `userData`. Setting `isSensor` makes the body report contacts without any collision response.

## Step at a fixed rate

Call `world.step(deltaTime)` once per frame from `loop()`. It does not simulate `deltaTime` directly. It adds the time to an accumulator and runs as many fixed steps as fit:

- The fixed rate is 60 Hz. Change it with `world.setFixedTimestep(hz, maxSteps)`.
- A frame can run at most four steps by default. Time beyond that is dropped, and the frame's delta is capped at 0.25 seconds. A slow frame makes the simulation run slower than real time. It does not make it unstable.
- On a frame that does not fill a whole step, nothing is simulated and the leftover time carries to the next frame.
- `step()` returns an interpolation alpha between 0 and 1. The same value is in `world.stepAlpha`.

With `world.setInterpolation(true)`, body position and rotation getters return a blend between the last two simulated states. Motion then looks smooth at any display rate. Queries such as `raycast` always see the real simulation state. Interpolation is off by default. It applies to body getters, not to characters.

`world.stepVariable(deltaTime)` runs one solver step of exactly `deltaTime`. Use it only if your game already keeps its own accumulator.

A body keeps its transform in the world. Read it with `body.position`, `body.rotation`, `body.transform`, `body.linearVelocity`, and `body.angularVelocity`. Each is `null` once the body is disposed, so check for `null`. To change a body, use methods such as `setPosition`, `setLinearVelocity`, `addImpulse`, and `moveKinematic(target, deltaTime)`. `moveKinematic` works only on kinematic bodies.

A force or torque from `addForce` or `addTorque` lasts for one solver step and is then cleared. Because a frame can run zero, one, or several steps, a force added every frame is applied unevenly. For a steady push, call `addImpulse` with the force multiplied by `deltaTime`, which changes the velocity right away.

## Queries and contacts

Ray and overlap queries return body objects, not numbers. `raycast` returns the nearest hit or `null`. The direction does not have to be a unit vector. `maxDistance` is in meters, and `fraction` is the hit distance as a fraction of `maxDistance`. `raycastAll` returns hits sorted from nearest to farthest. The overlap queries are `overlapSphere`, `overlapBox`, and `overlapPoint`. Each query takes an optional `layerMask`, a bit mask where bit `n` selects layer `n`.

Contact events come from `popContacts()`. Despite its name, `popContacts()` does not remove anything. The list holds the contacts of the last frame that ran a fixed step, so a frame without a step shows the same events again. Call `clearContacts()` after you handle them. The list is shared by every world in the game.

```ts
import { ContactEvent } from '@bornengine/engine';
import type { PhysicsWorld, RigidBody } from '@bornengine/engine';

export function countNewTouches(world: PhysicsWorld, body: RigidBody): number {
  let touches = 0;
  for (const contact of world.popContacts()) {
    const involved = contact.bodyA === body || contact.bodyB === body;
    if (involved && contact.event === ContactEvent.ADDED) touches += 1;
  }
  world.clearContacts();
  return touches;
}

export function groundHeightBelow(world: PhysicsWorld, body: RigidBody): number | null {
  const position = body.position;
  if (position === null) return null;
  const hit = world.raycast(position, { x: 0, y: -1, z: 0 }, 50);
  return hit === null ? null : hit.point.y;
}
```

Each contact has an `event` of `ContactEvent.ADDED`, `PERSISTED`, or `REMOVED`, the two bodies (either can be `null` if the body is gone), the contact points, the normal, the penetration depth, and the combined friction and restitution. `PERSISTED` repeats for every touching pair on every step, so a pile of resting bodies produces many events. A `REMOVED` contact carries no points or normal.

## Game objects and bodies

A `PhysicsWorld` created with a `Game` knows `game.scenes`. Each `world.step()` lets the active scene sync game objects with bodies before and after the simulation. A `RigidBodyComponent` marks an object as one to sync:

- A static body receives the object's world transform.
- A kinematic body is moved to follow the object.
- A dynamic body writes its position and rotation back into the object after the step.

The sync runs only while the scene is active and only for bodies of the stepped world. The component takes a body you created. By default it only borrows it. Pass `{ ownership: 'owned' }` and the body is disposed when the component is destroyed.

```ts
import {
  BoxCollider,
  Colors,
  Game,
  GameComponent,
  GameObject,
  Layer,
  MotionType,
  PhysicsWorld,
  RigidBodyComponent,
  Scene,
  SphereCollider,
} from '@bornengine/engine';
import type { Camera3D, Renderer } from '@bornengine/engine';

const CAMERA: Camera3D = {
  position: { x: 6, y: 4, z: 8 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective',
};

class BallView extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner !== null) renderer.drawSphere(owner.transform.worldPosition, 0.5, Colors.ORANGE);
  }
}

class FloorView extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner !== null) renderer.drawCube(owner.transform.worldPosition, { x: 20, y: 1, z: 20 }, Colors.DARKGREEN);
  }
}

class PhysicsLevel extends Scene {
  readonly world: PhysicsWorld | null;

  constructor(game: Game) {
    super(game, { name: 'physics' });
    const world = this.own(new PhysicsWorld(game));
    this.world = world;
    if (world === null || !world.isReady) return;
    world.setInterpolation(true);

    const floorBody = world.createBody(new BoxCollider(world, { x: 10, y: 0.5, z: 10 }), {
      motionType: MotionType.STATIC,
      objectLayer: Layer.NON_MOVING,
    });
    const floor = new GameObject({ name: 'Floor', position: { x: 0, y: -0.5, z: 0 } });
    floor.addComponent(new RigidBodyComponent(floorBody, { ownership: 'owned' }));
    floor.addComponent(new FloorView());
    this.addNode(floor);

    const ballBody = world.createBody(new SphereCollider(world, 0.5), {
      position: { x: 0, y: 4, z: 0 },
      restitution: 0.6,
    });
    const ball = new GameObject({ name: 'Ball', position: { x: 0, y: 4, z: 0 } });
    ball.addComponent(new RigidBodyComponent(ballBody, { ownership: 'owned' }));
    ball.addComponent(new BallView());
    this.addNode(ball);
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.world !== null && this.world.isReady) this.world.step(deltaTime);
  }
}

class SceneDemo extends Game {
  constructor() {
    super({ window: { title: 'Physics scene', width: 960, height: 540 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new PhysicsLevel(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (!this.renderer.begin3D(CAMERA)) return;
    this.renderer.drawGrid(20, 1);
    super.render();
    this.renderer.end3D();
  }
}

new SceneDemo().run();
```

The level creates its own world with `this.own(...)`, so the world is disposed when the scene unloads. Stepping happens inside the scene's `update()`, which the game calls through `this.scenes.update()`. A retained `SceneNode` that draws the object can follow it through a `SceneNodeComponent`, which copies the object's transform to the node after the step.

## Larger systems

Characters, vehicles, soft bodies, and joints all come from the world: `createCharacter`, `createVehicle`, `createSoftBody`, and `createJoint`. They are part of the same fixed-step world and are released with it.

### Characters

A `CharacterController` is a kinematic, slope-aware controller for a player or an enemy. It slides along walls and stands on slopes up to a limit. It is not a rigid body of the world, and it is not tied to a game object. Copy `character.position` to your object yourself.

Call `update(deltaTime)` once per frame. Each call adds gravity to the character's velocity, then moves and collides it. The velocity stays between calls, so set the horizontal velocity you want each frame and keep or reset the vertical part:

```ts
import { CapsuleCollider, Key } from '@bornengine/engine';
import type { CharacterController, InputSystem, PhysicsWorld } from '@bornengine/engine';

const WALK_SPEED = 4;
const JUMP_SPEED = 6;

export function createPlayer(world: PhysicsWorld): CharacterController | null {
  const shape = new CapsuleCollider(world, 0.5, 0.35);
  const player = world.createCharacter(shape, { position: { x: 0, y: 2, z: 0 } });
  return player.isLoaded ? player : null;
}

export function movePlayer(player: CharacterController, input: InputSystem, deltaTime: number): void {
  let x = 0;
  let z = 0;
  if (input.isKeyDown(Key.A)) x -= 1;
  if (input.isKeyDown(Key.D)) x += 1;
  if (input.isKeyDown(Key.W)) z -= 1;
  if (input.isKeyDown(Key.S)) z += 1;
  const length = Math.sqrt(x * x + z * z);
  if (length > 0) {
    x /= length;
    z /= length;
  }

  const velocity = player.linearVelocity;
  let vertical = velocity === null ? 0 : velocity.y;
  if (player.isGrounded) vertical = input.isKeyPressed(Key.SPACE) ? JUMP_SPEED : 0;
  player.setLinearVelocity({ x: x * WALK_SPEED, y: vertical, z: z * WALK_SPEED });
  player.update(deltaTime);
}
```

`isGrounded` is `true` only when the character stands on walkable ground. `groundState` also reports `GroundState.ON_STEEP`, `NOT_SUPPORTED`, and `IN_AIR`, and `groundNormal`, `groundPosition`, and `groundBody` describe what it stands on. The options and their defaults are `up` (0, 1, 0), `maxSlopeAngleRad` (about 50 degrees), `characterPadding` (0.02), `penetrationRecoverySpeed` (1), `predictiveContactDistance` (0.1), `maxStrength` (100), `mass` (70), and `objectLayer` (`Layer.MOVING`).

### Vehicles

A `Vehicle` is a four-wheel car with front-wheel steering. The engine creates and owns its chassis body, available as `car.chassis`. Give it a box shape whose center of mass is moved down, so the wheels hang below the box and the car stays upright:

```ts
import { BoxCollider } from '@bornengine/engine';
import type { PhysicsWorld, Vehicle } from '@bornengine/engine';

export function createCar(world: PhysicsWorld): Vehicle | null {
  const chassis = new BoxCollider(world, { x: 0.9, y: 0.4, z: 2 }).offsetCenterOfMass({ x: 0, y: -0.6, z: 0 });
  const car = world.createVehicle({ chassisShape: chassis, position: { x: 0, y: 2, z: 0 } });
  return car.isLoaded ? car : null;
}

export function driveCar(car: Vehicle, throttle: number, steering: number, braking: boolean): void {
  car.setInput(throttle, steering, braking ? 1 : 0, 0);
}
```

Call `setInput(forward, steering, brake, handbrake)` every frame before `world.step()`. `forward` and `steering` run from -1 to 1, and `brake` and `handbrake` from 0 to 1. Read `car.position` and `car.rotation` for the chassis, and `car.getWheelTransform(index)` for each wheel. The wheel order is front left, front right, rear left, rear right. `engineRpm` reports the engine speed. By default the wheels sit 1.6 meters apart, 1.3 meters in front of and behind the center of mass, and 0.4 meters below it. Override `wheelPositions` and the other options (`wheelRadius`, `suspensionMinLength`, `maxSteerAngleRad`, `engineMaxTorque`, and more) to match your model.

### Soft bodies

A `SoftBody` is cloth, rope, or a deformable mesh made of vertices and triangles. Each vertex has an inverse mass. A value of 0 pins the vertex in place, and 1 lets it move freely. `edgeCompliance` sets how stretchy the edges are: 0 is rigid, and about 0.0001 suits cloth. A `pressure` above 0 makes an inflated body.

```ts
import type { PhysicsWorld, SoftBody, Vec3 } from '@bornengine/engine/physics';

export function createCloth(world: PhysicsWorld, size: number): SoftBody | null {
  const vertices: Vec3[] = [];
  const inverseMasses: number[] = [];
  const stride = size + 1;
  for (let row = 0; row <= size; row++) {
    for (let column = 0; column <= size; column++) {
      vertices.push({ x: column * 0.25, y: 0, z: row * 0.25 });
      inverseMasses.push(row === 0 ? 0 : 1);
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const corner = row * stride + column;
      indices.push(corner, corner + 1, corner + stride, corner + 1, corner + stride + 1, corner + stride);
    }
  }

  const cloth = world.createSoftBody({
    vertices,
    inverseMasses,
    indices,
    position: { x: 0, y: 3, z: 0 },
    edgeCompliance: 0.0001,
  });
  return cloth.isLoaded ? cloth : null;
}
```

The creation call needs at least three vertices, one inverse mass per vertex, and indices in groups of three. Otherwise `cloth.error` explains what is wrong. Read the simulated shape with `vertexCount` and `getVertex(index)`, and copy it into your own mesh each frame.

### Joints and compound shapes

`world.createJoint(kind, options)` joins two bodies. The kinds are `'fixed'`, `'point'`, `'hinge'`, `'slider'`, and `'distance'`. Anchors are relative to each body's center of mass unless you set `worldSpace` to `true`. A hinge and a slider take an `axis`. Their `min` and `max` limits apply only when `min` is less than `max`, and a hinge measures them in radians. A distance joint uses `min` and `max` as the allowed distances. Leave `bodyB` out to attach `bodyA` to the world.

A `CompoundCollider` combines several colliders, each placed with a local position and rotation:

```ts
import { BoxCollider, CompoundCollider, SphereCollider } from '@bornengine/engine';
import type { Joint, PhysicsWorld, RigidBody } from '@bornengine/engine';

export function createLamp(world: PhysicsWorld): CompoundCollider {
  const post = new BoxCollider(world, { x: 0.05, y: 1, z: 0.05 });
  const shade = new SphereCollider(world, 0.3);
  const noRotation = { x: 0, y: 0, z: 0, w: 1 };
  return new CompoundCollider(world, [
    { collider: post, local: { position: { x: 0, y: 1, z: 0 }, rotation: noRotation } },
    { collider: shade, local: { position: { x: 0, y: 2.2, z: 0 }, rotation: noRotation } },
  ]);
}

export function hingeDoor(world: PhysicsWorld, frame: RigidBody, door: RigidBody): Joint | null {
  const hinge = { x: 1, y: 1, z: 0 };
  const joint = world.createJoint('hinge', {
    bodyA: frame,
    bodyB: door,
    anchorA: hinge,
    anchorB: hinge,
    worldSpace: true,
    axis: { x: 0, y: 1, z: 0 },
    min: -1.5,
    max: 1.5,
  });
  return joint.isLoaded ? joint : null;
}
```

## Ownership and cleanup

- Disposing a collider also disposes every body, character, and vehicle that uses it, and every compound, scaled, or offset collider built from it.
- Disposing a `Vehicle` invalidates its chassis body.
- `world.dispose()` releases its vehicles, joints, characters, bodies, and colliders, then the world itself. The `Game` disposes a world you do not dispose yourself.
- Anything made by one world is valid only in that world. Passing a collider or body from another world gives an object whose `error` says so.

## Next steps

- [Physics API](../../api/physics/) lists the world, shape, and body members.
- [Add physics gameplay](../physics-gameplay/) puts a world, input, and contacts into a small game loop.
- [Build a 3D scene](../3d-scene/) covers the camera and the 3D pass used above.
- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the lifecycle hooks the scene example uses.
