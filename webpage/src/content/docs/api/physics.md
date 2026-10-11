---
title: Physics
description: Simulate colliders, rigid bodies, joints, characters, and queries in a fixed-step Jolt 3D physics world.
section: API
order: 40
---

BornEngine's 3D physics uses the Jolt engine. A `PhysicsWorld` is one simulation. It creates and owns the colliders, bodies, joints, characters, and vehicles that you build from it, and each of them works only in its own world. For 2D games, use [Physics 2D](../physics2d/) instead.

Gravity defaults to `{ x: 0, y: -9.81, z: 0 }`, which means Y is up and one unit is one meter. Rotations are quaternions, which store a rotation as four numbers `{ x, y, z, w }`. Angles are in radians.

Where physics is available:

- **Native builds** contain Jolt only in the `3d` profile. Create a project with `bornengine new MyGame --game-type 3d`, or set `native_profile = "3d"` in `perry.toml`. See [Project commands](../../cli/project/). The `2d` and `2.5d` profiles leave Jolt out. There, `new PhysicsWorld(game)` returns a world with `isReady` set to `false` and a non-null `error`, every method returns its fallback value (`false`, `null`, `0`, or an empty array), and the engine prints one warning that names the missing `jolt` feature.
- **Web builds** run the same classes on JoltPhysics.js. The web bridge has gaps, which are listed under [Platform differences](#platform-differences). See [Web and WASM](../../platforms/web-wasm/).
- **watchOS** has no physics backend. A world is never ready there. See [Apple platforms](../../platforms/apple/).

## World stepping

Create a world with `new PhysicsWorld(game, options)`. All options are optional:

| Option | Meaning |
| --- | --- |
| `gravity` | The gravity vector. |
| `maxBodies` | The body limit. The default is 65,536. |
| `numThreads` | The number of worker threads. Leave it out for the default. |
| `sceneManager` | The object that synchronizes game objects around each step. The default is `game.scenes`. See [Physics step](../game/#physics-step). |

Call `world.step(deltaTime)` once per frame from `loop`. It runs the simulation at a **fixed rate**:

- The default rate is 60 steps per second. Change it with `setFixedTimestep(hz, maxSteps = 4)`.
- The time you pass is added to an accumulator. Each whole fixed step in the accumulator is simulated, and the remainder carries to the next frame.
- A single frame is clamped to 0.25 seconds, and at most `maxSteps` steps run per call. When the game falls behind, the simulation slows down instead of spiraling.
- `step` returns the interpolation alpha, a number between 0 and 1: how far the carried remainder sits between the last two simulated states. The `stepAlpha` property returns the alpha of the latest step.
- `setInterpolation(true)` makes the body getters `position`, `rotation`, and `transform` return values blended by that alpha, so motion looks smooth at any display rate. It is off by default. Queries always see the real simulation state.
- `stepVariable(deltaTime, collisionSteps = 1)` runs one solver step of exactly that size. Use it only if you run your own accumulator. It trades stability for exactness.
- `collisionSteps` splits each fixed step into several collision steps. The default is 1.

`step` returns `0` and does nothing when the world is not ready or `deltaTime` is negative.

Other world members:

| Member | Meaning |
| --- | --- |
| `gravity`, `setGravity(vector)` | Read or change gravity. |
| `bodyCount`, `activeBodyCount` | Total bodies and awake bodies. |
| `optimizeBroadphase()` | Rebuilds the broad phase, the structure that finds nearby bodies quickly. Call it after you add a large batch of bodies at once. |
| `isReady`, `error` | Whether the world works, and why not. |
| `dispose()` | Destroys the world and everything in it. |

```ts
import { BoxCollider, Colors, Game, MotionType, PhysicsWorld, RigidBody, SphereCollider } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 4, z: 10 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class FallingBall extends Game {
  private readonly world = new PhysicsWorld(this, { gravity: { x: 0, y: -9.81, z: 0 } });
  private ball: RigidBody | null = null;

  constructor() {
    super({ window: { title: 'Physics', width: 800, height: 450 }, renderMode: '3d' });
    this.world.setFixedTimestep(60, 4);
    this.world.setInterpolation(true);
  }

  protected override onStart(): void {
    const floorShape = new BoxCollider(this.world, { x: 10, y: 0.5, z: 10 });
    this.world.createBody(floorShape, { motionType: MotionType.STATIC, position: { x: 0, y: -0.5, z: 0 } });
    const ballShape = new SphereCollider(this.world, 0.5);
    this.ball = this.world.createBody(ballShape, { position: { x: 0, y: 4, z: 0 }, restitution: 0.5 });
  }

  protected override loop(deltaTime: number): void {
    this.world.step(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (this.ball === null) return;
    const position = this.ball.position;
    if (position === null) return;
    if (this.renderer.begin3D(camera)) {
      this.renderer.drawGrid(20, 1);
      this.renderer.drawSphere(position, 0.5, Colors.ORANGE);
      this.renderer.end3D();
    }
  }
}

new FallingBall().run();
```

If game objects in the active `Scene` carry `RigidBodyComponent`s for this world, `step` also copies poses between those objects and their bodies. See [Physics step](../game/#physics-step).

## Shapes and bodies

A **collider** is a reusable shape. A **body** is a thing in the world that has a collider, a position, and a motion type. Make a collider with its world, then ask the world for a body. Several bodies can share one collider.

| Collider | Constructor | Notes |
| --- | --- | --- |
| `BoxCollider` | `(world, halfExtents, convexRadius = 0.05)` | `halfExtents` is half the size on each axis. |
| `SphereCollider` | `(world, radius)` | |
| `CapsuleCollider` | `(world, halfHeight, radius)` | `halfHeight` is half the length of the straight middle part, not counting the round ends. |
| `CylinderCollider` | `(world, halfHeight, radius, convexRadius = 0.05)` | |
| `ConvexHullCollider` | `(world, points, convexRadius = 0.05)` | The hull of at least three points. |
| `MeshCollider` | `(world, vertices, indices)` | A triangle mesh. `indices` lists triangles, and its length is a multiple of 3. Use it for static bodies. |
| `HeightfieldCollider` | `(world, samples, sampleCount, offset, scale, blockSize = 4)` | `samples` holds `sampleCount * sampleCount` heights in row-major order. `sampleCount` is at least 2. |
| `CompoundCollider` | `(world, children)` | Each child is `{ collider, local: { position, rotation } }`. All children come from the same world. |
| `ScaledCollider` | `(world, base, scale)` | Also `base.scaled(scale)`. |
| `OffsetCollider` | `(world, base, offset)` | Also `base.offsetCenterOfMass(offset)`. It moves the center of mass. |

A collider has `isLoaded`, `error`, `bounds` (a box, or `null`), `volume`, and `dispose()`.

`world.createBody(collider, options)` returns a `RigidBody`. The options are:

| Option | Default | Meaning |
| --- | --- | --- |
| `motionType` | `MotionType.DYNAMIC` | `MotionType.STATIC` never moves. `MotionType.KINEMATIC` moves only when you move it. `MotionType.DYNAMIC` is moved by forces and collisions. |
| `position`, `rotation` | origin, identity | Initial pose. |
| `objectLayer` | `Layer.MOVING` | The collision layer. See [Queries and constraints](#queries-and-constraints). |
| `linearVelocity`, `angularVelocity` | zero | Initial velocities. |
| `friction`, `restitution` | engine values | Surface friction, and bounciness. A restitution of 0 means no bounce. |
| `linearDamping`, `angularDamping` | engine values | Slow-down factors. |
| `gravityFactor` | 1 | A multiplier for gravity on this body. |
| `useCcd` | `false` | Continuous collision detection, for fast bodies that could tunnel through thin walls. |
| `isSensor` | `false` | A sensor detects overlaps without a physical response. |
| `allowSleeping` | `true` | Whether the body may go to sleep when it rests. |
| `userData` | 0 | One number you can read back. |

When a body is not loaded, its vector getters return `null`, its number getters return 0, and every setter returns `false`. Bodies share these members:

| Group | Members |
| --- | --- |
| State | `position`, `rotation`, `transform`, `linearVelocity`, `angularVelocity`, `mass`, `friction`, `restitution`, `objectLayer`, `motionType`, `collider`, `userData`, `isLoaded`, `isActive`, `error`. |
| Moving | `setPosition(value, activate = true)`, `setRotation(value, activate = true)`, `setTransform(value, activate = true)`, `moveKinematic(target, deltaTime)` for kinematic bodies, `setLinearVelocity`, `setAngularVelocity`. |
| Forces | `addForce`, `addImpulse`, `addTorque`, `addAngularImpulse`, `addForceAt(force, worldPoint)`, `addImpulseAt(impulse, worldPoint)`. |
| Settings | `setFriction`, `setRestitution`, `setLinearDamping`, `setAngularDamping`, `setGravityFactor`, `setCcd`, `setMotionType`, `setObjectLayer`, `setSensor`, `setAllowSleeping`, `setUserData`, `setCollider(collider, updateMass = true, activate = true)`. |
| Axes | `lockRotationAxes(x, y, z)` stops rotation about the axes you pass `true` for. `lockTranslationAxes(x, y, z)` only zeroes the body's current velocity on those axes once. It does not keep the axes locked on later steps. |
| Sleep | `activate()`, `deactivate()`. |
| Lifetime | `dispose()`. |

```ts
import { BoxCollider, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';

export function populate(world: PhysicsWorld): void {
  const floorShape = new BoxCollider(world, { x: 20, y: 0.25, z: 20 });
  world.createBody(floorShape, { motionType: MotionType.STATIC, position: { x: 0, y: -0.25, z: 0 } });

  const crateShape = new BoxCollider(world, { x: 0.5, y: 0.5, z: 0.5 });
  for (let index = 0; index < 5; index++) {
    world.createBody(crateShape, { position: { x: 0, y: 0.5 + index * 1.1, z: 0 }, friction: 0.6, userData: index });
  }

  const ball = world.createBody(new SphereCollider(world, 0.4), {
    position: { x: 6, y: 1, z: 0 },
    linearVelocity: { x: -12, y: 0, z: 0 },
    useCcd: true,
    restitution: 0.3,
  });
  ball.addImpulse({ x: 0, y: 2, z: 0 });
  ball.setLinearDamping(0.05);
}
```

`populate` shares one box collider between five crates. The ball starts with a velocity, gets an upward impulse, and uses continuous collision detection so a fast ball cannot pass through a crate between two steps.

## Queries and constraints

**Layers.** Every body is on an object layer. The built-in layers are `Layer.NON_MOVING` (0), `Layer.MOVING` (1), and `Layer.SENSOR` (2). Layers 3 to 15 are free for your own use, and `MAX_OBJECT_LAYERS` is 16. `world.setLayerCollides(a, b, collides)` turns collisions between two layers on or off, and `getLayerCollides(a, b)` reads the setting. Queries take a `layerMask`, a number where bit N selects layer N. The default, `ALL_LAYERS_MASK`, selects all layers.

**Queries.** Results hold body objects, not numeric ids.

| Method | Returns |
| --- | --- |
| `raycast(origin, direction, maxDistance, layerMask)` | The closest `PhysicsRayHit`, or `null`. |
| `raycastAll(origin, direction, maxDistance, maxHits = 16, layerMask)` | Up to `maxHits` hits, nearest first. |
| `overlapSphere(center, radius, maxResults = 16, layerMask)` | Bodies near a sphere. |
| `overlapBox({ position, rotation }, halfExtents, maxResults = 16, layerMask)` | Bodies near a box. |
| `overlapPoint(point, maxResults = 16, layerMask)` | Bodies near a point. |

`direction` does not need to be normalized. A zero direction finds nothing. A `PhysicsRayHit` has `body`, `point`, `normal`, `fraction`, and `subShapeId`. `fraction` is the part of `maxDistance` that the ray travelled, from 0 to 1, so the distance is `fraction * maxDistance`.

The overlap queries are approximate. They return every body whose bounding box touches the sphere, box, or point. They do not test the exact shape. For `overlapBox`, the box is replaced by the bounding box of the rotated box. Check exact contact yourself when it matters.

**Contacts.** Each `step` call that runs at least one fixed step replaces the stored contact events with the events from its steps. `popContacts()` returns them as `PhysicsContact` objects: `event` (`ContactEvent.ADDED`, `PERSISTED`, or `REMOVED`), `bodyA`, `bodyB` (each can be `null`), `pointA`, `pointB`, `normal`, `penetrationDepth`, `combinedFriction`, and `combinedRestitution`. `popContacts()` does not remove the events. A frame in which no fixed step runs keeps the previous events. Call `clearContacts()` after you handle them so that you do not read the same events twice. `contactCount` returns how many events are stored.

**Joints.** `world.createJoint(kind, options)` connects bodies. `kind` is `'fixed'`, `'point'`, `'hinge'`, `'slider'`, or `'distance'`.

| Option | Meaning |
| --- | --- |
| `bodyA` | The first body. |
| `bodyB` | The second body. Leave it out to fix `bodyA` to the world. |
| `anchorA`, `anchorB` | Anchor points. They are local to each body's center of mass, or in world space when `worldSpace` is `true`. Without a `bodyB`, `anchorB` is a point in the world. |
| `axis` | The hinge or slider axis. The defaults are `(0, 1, 0)` for a hinge and `(1, 0, 0)` for a slider. |
| `min`, `max` | The limits. A hinge uses angles in radians, and a slider uses distances along the axis. Hinge and slider limits apply only when `min` is less than `max`. A distance joint uses them as the smallest and largest allowed distance. |
| `worldSpace` | Reads the anchors in world space. |

A joint has `isLoaded`, `error`, `setEnabled(enabled)`, and `dispose()`. Both bodies must be loaded in the same world.

```ts
import { ContactEvent, MotionType, SphereCollider } from '@bornengine/engine';
import type { PhysicsWorld } from '@bornengine/engine';

export function inspect(world: PhysicsWorld): void {
  const hit = world.raycast({ x: 0, y: 6, z: 0 }, { x: 0, y: -1, z: 0 }, 10);
  if (hit !== null) {
    console.log(`hit body ${hit.body.userData} at ${(hit.fraction * 10).toFixed(2)} meters`, hit.point, hit.normal);
  }

  const nearby = world.overlapSphere({ x: 0, y: 1, z: 0 }, 3);
  console.log(`${nearby.length} bodies near the origin`);

  for (const contact of world.popContacts()) {
    if (contact.event === ContactEvent.ADDED && contact.bodyA !== null && contact.bodyB !== null) {
      console.log('touch', contact.bodyA.userData, contact.bodyB.userData, contact.penetrationDepth);
    }
  }
  world.clearContacts();
}

export function hang(world: PhysicsWorld): void {
  const anchor = world.createBody(new SphereCollider(world, 0.2), {
    motionType: MotionType.STATIC,
    position: { x: 0, y: 5, z: 0 },
  });
  const weight = world.createBody(new SphereCollider(world, 0.5), { position: { x: 3, y: 5, z: 0 } });
  world.createJoint('distance', {
    bodyA: anchor,
    bodyB: weight,
    anchorA: { x: 0, y: 0, z: 0 },
    anchorB: { x: 0, y: 0, z: 0 },
    min: 3,
    max: 3,
  });
}
```

`hang` joins a heavy ball to a fixed point with a rope of constant length 3. The ball swings like a pendulum.

## Characters

A **character controller** moves a player-sized shape through the world with slope limits and stair stepping. It is not a rigid body in the simulation. You set its velocity, and `update` moves it. Create one from a collider in the same world with `world.createCharacter(collider, options)`.

| Option | Default | Meaning |
| --- | --- | --- |
| `up` | `(0, 1, 0)` | The up direction. |
| `maxSlopeAngleRad` | 0.872 (about 50 degrees) | The steepest slope the character can stand on. |
| `characterPadding` | 0.02 | A small gap kept around the shape. |
| `penetrationRecoverySpeed` | 1 | How fast the character leaves overlaps. |
| `predictiveContactDistance` | 0.1 | The look-ahead distance for contacts. |
| `maxStrength` | 100 | The largest force the character applies to bodies it pushes. |
| `mass` | 70 | The mass used when pushing bodies. |
| `objectLayer` | `Layer.MOVING` | The collision layer. |
| `position`, `rotation` | origin, identity | Initial pose. |

Members:

| Member | Meaning |
| --- | --- |
| `update(deltaTime, gravity?)` | Moves the character for one frame. It adds gravity multiplied by `deltaTime` to the velocity, then moves with collision, slope clamping, and stair stepping. The default gravity is the world's. |
| `setLinearVelocity(value)`, `linearVelocity` | The velocity the next `update` uses. |
| `setPosition`, `setRotation`, `position`, `rotation` | Teleport and read the pose. |
| `isGrounded` | `true` when the character stands on a walkable surface. |
| `groundState` | One of `GroundState.ON_GROUND`, `ON_STEEP`, `NOT_SUPPORTED`, or `IN_AIR`. |
| `groundNormal`, `groundPosition`, `groundBody` | What the character stands on. |
| `setCollider(collider)`, `collider` | Swap the shape, for example to crouch. |
| `isLoaded`, `error`, `dispose()` | State and lifetime. |

Because `update` adds gravity to the velocity every call, set the velocity again each frame: your horizontal movement, plus a vertical value of 0 while grounded, or the current vertical velocity while falling.

```ts
import { BoxCollider, CapsuleCollider, Colors, Game, Key, MotionType, PhysicsWorld } from '@bornengine/engine';
import type { CharacterController } from '@bornengine/engine';

const SPEED = 5;
const JUMP_SPEED = 6;

class CharacterGame extends Game {
  private readonly world = new PhysicsWorld(this);
  private character: CharacterController | null = null;

  constructor() {
    super({ window: { title: 'Character', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    const floorShape = new BoxCollider(this.world, { x: 20, y: 0.5, z: 20 });
    this.world.createBody(floorShape, { motionType: MotionType.STATIC, position: { x: 0, y: -0.5, z: 0 } });
    const capsule = new CapsuleCollider(this.world, 0.5, 0.35);
    this.character = this.world.createCharacter(capsule, { position: { x: 0, y: 2, z: 0 } });
  }

  protected override loop(deltaTime: number): void {
    const character = this.character;
    if (character === null) return;

    let moveX = 0;
    let moveZ = 0;
    if (this.input.isKeyDown(Key.A)) moveX -= 1;
    if (this.input.isKeyDown(Key.D)) moveX += 1;
    if (this.input.isKeyDown(Key.W)) moveZ -= 1;
    if (this.input.isKeyDown(Key.S)) moveZ += 1;

    const velocity = character.linearVelocity;
    let vertical = velocity === null ? 0 : velocity.y;
    if (character.isGrounded) vertical = this.input.isKeyPressed(Key.SPACE) ? JUMP_SPEED : 0;

    character.setLinearVelocity({ x: moveX * SPEED, y: vertical, z: moveZ * SPEED });
    character.update(deltaTime);
    this.world.step(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    const position = this.character === null ? null : this.character.position;
    if (position === null) return;
    this.renderer.drawText(`y ${position.y.toFixed(2)}`, { x: 16, y: 16 }, 24, Colors.BLACK);
  }
}

new CharacterGame().run();
```

## Soft bodies and vehicles

`world.createSoftBody(options)` creates cloth, rope, or an inflated body from a triangle mesh. A `SoftBody` is a body without a collider. Its options:

| Option | Meaning |
| --- | --- |
| `vertices` | At least three points. |
| `inverseMasses` | One number per vertex. `0` pins the vertex in place. |
| `indices` | Triangles, three indices each. |
| `position`, `rotation`, `objectLayer` | Placement and layer. |
| `edgeCompliance` | `0` keeps edges rigid. Cloth uses small values such as `0.0001`. |
| `gravityFactor`, `linearDamping` | Defaults 1 and 0.05. |
| `pressure` | `0` for cloth, above `0` for a body inflated like a balloon. |

Read and edit vertices with `vertexCount`, `getVertex(index)`, `setVertex(index, position)`, and `setVertexInverseMass(index, inverseMass)`.

`world.createVehicle(options)` creates a four-wheel car. `chassisShape` is a collider. The engine creates the chassis body, and `vehicle.chassis` returns it. Wheel positions are listed front left, front right, rear left, rear right, relative to the chassis center of mass. Defaults: a wheel radius of 0.35, a wheel width of 0.2, suspension lengths of 0.3 to 0.5, a steering limit of 0.611 radians, a brake torque of 1,500, a handbrake torque of 4,000, and an engine torque of 500. The forward axis defaults to `(0, 0, 1)`.

Call `vehicle.setInput(forward, steering, brake = 0, handbrake = 0)` every frame before `world.step`. `forward` and `steering` range from -1 to 1, and a negative `forward` reverses. `brake` and `handbrake` range from 0 to 1. Read `engineRpm`, `getWheelTransform(index)` (0 to 3), `getWheelAngularVelocity(index)`, `position`, and `rotation`. Lowering the center of mass of the chassis shape, for example `box.offsetCenterOfMass({ x: 0, y: -0.6, z: 0 })`, keeps a car stable.

## Ownership and disposal

- Every collider, body, joint, character, and vehicle belongs to the world that made it. Passing a collider from another world makes the body report an `error` and stay unloaded.
- `body.dispose()`, `joint.dispose()`, `character.dispose()`, and `vehicle.dispose()` remove one object.
- `collider.dispose()` also disposes the bodies, characters, and vehicles that use it, and every collider built from it, such as a compound, scaled, or offset collider.
- `world.dispose()` disposes vehicles, joints, characters, bodies, and colliders, in that order, and then destroys the world.
- When the game shuts down, everything that is still alive is disposed.
- After disposal, `isLoaded` is `false`, getters return `null`, and setters return `false`.

## Platform differences

On the web target, the Jolt bridge differs from the native build in these ways:

- `lockRotationAxes` and `lockTranslationAxes` do nothing.
- `setLayerCollides` does nothing, and `getLayerCollides` always returns `true`.
- Ray hits report the normal `{ x: 0, y: 1, z: 0 }` instead of the real surface normal, and `layerMask` is ignored by raycasts and overlap queries.

## Next steps

- [Game objects](../game/#physics-step) shows how `RigidBodyComponent` links bodies to game objects.
- [Physics gameplay guide](../../guides/physics-gameplay/) builds a complete 3D physics scene.
- [Physics 2D](../physics2d/) covers the separate 2D world.
