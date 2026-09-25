---
title: Physics
description: Use the Jolt-backed physics API for fixed-step bodies, shapes, queries, constraints, characters, soft bodies, and vehicles.
section: API / Physics
order: 40
---

The physics module exposes typed numeric handles over a Jolt world. The simulation is right-handed, Y-up, and uses meters, seconds, and kilograms. Shapes are reusable; bodies own motion state and reference a shape; worlds own the broadphase and solver.

## World stepping

`step(world, deltaTime)` owns a fixed-timestep accumulator. By default it simulates at 60 Hz, carries the remainder to the next frame, clamps a long frame, and caps catch-up work. This is the recommended loop for gameplay. Enable interpolation when rendering at a different rate from the solver.

```ts
import { runGame } from '@bornengine/engine/core';
import {
  MotionType,
  createBody,
  createWorld,
  destroyBody,
  destroyWorld,
  getBodyPosition,
  getStepAlpha,
  releaseShape,
  setFixedTimestep,
  setGravity,
  setInterpolation,
  sphereShape,
  step,
} from '@bornengine/engine/physics';

const world = createWorld({ maxBodies: 4096 });
setGravity(world, { x: 0, y: -9.81, z: 0 });
setFixedTimestep(world, 60, 4);
setInterpolation(world, true);

const ballShape = sphereShape(0.5);
const ball = createBody(world, ballShape, {
  motionType: MotionType.DYNAMIC,
  position: { x: 0, y: 4, z: 0 },
});

runGame((frameDt) => {
  const alpha = step(world, Math.min(frameDt, 0.25));
  const position = getBodyPosition(ball);
  renderBall(position, alpha || getStepAlpha(world));
});

function renderBall(position: { x: number; y: number; z: number }, alpha: number) {
  console.log('draw at', position, 'physics alpha', alpha);
}

export function shutdownPhysics() {
  destroyBody(ball);
  releaseShape(ballShape);
  destroyWorld(world);
}
```

`stepVariable()` is available when an integration deliberately wants one solver call for exactly `deltaTime`, but frame hitches then feed directly into the solver. For a manual accumulator, call `stepVariable(world, fixedDt)` once per consumed slice and cap the number of slices yourself. `step()` already provides that accumulator and returns the interpolation alpha.

Use `setLayerCollides()` once during world setup to define the object-layer matrix. `setInterpolation()` affects body transform getters, while raycasts and overlaps always query the actual simulation state.

## Shapes and bodies

Primitive constructors include `boxShape`, `sphereShape`, `capsuleShape`, and `cylinderShape`. `scaledShape`, `offsetCenterOfMassShape`, `convexHullShape`, `meshShape`, `heightfieldShape`, and `compoundShape` cover authored or generated collision geometry. Share a shape across many bodies and call `releaseShape()` only after its bodies are gone.

`BodyConfig.motionType` is `MotionType.STATIC`, `KINEMATIC`, or `MotionType.DYNAMIC`. Set position, rotation, velocity, damping, friction, restitution, gravity factor, `useCcd`, `isSensor`, sleeping, object layer, and a 32-bit `userData` value at creation or with the body setters.

```ts
import {
  Layer,
  MotionType,
  addImpulse,
  boxShape,
  createBody,
  setBodyCcd,
  setIsSensor,
  setLayerCollides,
  setMotionType,
} from '@bornengine/engine/physics';

setLayerCollides(world, Layer.MOVING, Layer.NON_MOVING, true);
setLayerCollides(world, Layer.MOVING, Layer.SENSOR, true);

const floorShape = boxShape({ x: 20, y: 0.25, z: 20 });
const floor = createBody(world, floorShape, {
  motionType: MotionType.STATIC,
  position: { x: 0, y: -0.25, z: 0 },
  objectLayer: Layer.NON_MOVING,
});

const triggerShape = boxShape({ x: 2, y: 1, z: 2 });
const trigger = createBody(world, triggerShape, {
  motionType: MotionType.STATIC,
  position: { x: 0, y: 1, z: -4 },
  objectLayer: Layer.SENSOR,
  isSensor: true,
});

setMotionType(ball, MotionType.DYNAMIC);
setBodyCcd(ball, true);
setIsSensor(trigger, true);
addImpulse(ball, { x: 0, y: 3, z: -1 });
```

For ongoing control, use `setLinearVelocity`, `setAngularVelocity`, `addForce`, `addTorque`, `addForceAt`, or `addImpulseAt`. Kinematic bodies should move through `moveKinematic(body, target, deltaTime)` so the solver can compute contacts. `setBodyPosition` and `setBodyTransform` are useful for teleports and editor operations; their `activate` flag controls whether sleeping bodies wake.

## Queries and constraints

Queries accept a world, a layer mask, and a bounded result budget. `raycast()` returns the closest `RayHit | null`; `raycastAll()` returns up to `maxHits`. `overlapSphere`, `overlapBox`, and `overlapPoint` return body handles, which you can map back to gameplay entities with `getBodyUserData()`.

```ts
import {
  ALL_LAYERS_MASK,
  overlapSphere,
  popContacts,
  raycast,
  clearContacts,
  step,
} from '@bornengine/engine/physics';

step(world, dt);

const hit = raycast(
  world,
  { x: playerX, y: playerY, z: playerZ },
  { x: 0, y: -1, z: 0 },
  3,
  ALL_LAYERS_MASK,
);
if (hit) console.log('ground body', hit.body, 'normal', hit.normal);

const nearby = overlapSphere(world, { x: playerX, y: playerY, z: playerZ }, 5, 32);
for (const body of nearby) console.log('nearby body', body);

for (const contact of popContacts()) {
  if (contact.event === 0) console.log('contact began', contact.bodyA, contact.bodyB);
}
clearContacts(world);
```

Constraints use `ConstraintAnchors` with optional `bodyB`, two anchors, and an optional `worldSpace` flag. Choose `fixedConstraint`, `pointConstraint`, `hingeConstraint`, `sliderConstraint`, or `distanceConstraint`; retain the returned handle and call `setConstraintEnabled()` or `destroyConstraint()` as gameplay changes. Contact events are drained with `popContacts()` after a step and contain event type, bodies, points, normal, penetration depth, and combined material values.

## Characters

`createCharacter()` is a controller-oriented capsule wrapper. It reports `GroundState` and exposes position, rotation, linear velocity, ground normal, ground position, and the body supporting the character. Feed desired movement into its velocity, update it with the same fixed-step cadence as the world, then read the result for scene-node placement.

```ts
import {
  GroundState,
  createCharacter,
  capsuleShape,
  getCharacterGroundNormal,
  getCharacterPosition,
  getCharacterGroundState,
  isCharacterGrounded,
  setCharacterLinearVelocity,
  updateCharacter,
} from '@bornengine/engine/physics';

const characterShape = capsuleShape(0.8, 0.35);
const character = createCharacter(world, characterShape, {
  position: { x: 0, y: 2, z: 0 },
  maxSlopeAngleRad: 0.87,
});

function updatePlayer(dt: number, moveX: number, moveZ: number) {
  setCharacterLinearVelocity(character, { x: moveX * 5, y: 0, z: moveZ * 5 });
  updateCharacter(character, dt, { x: 0, y: -9.81, z: 0 });
  const state = getCharacterGroundState(character);
  if (state === GroundState.ON_GROUND || isCharacterGrounded(character)) {
    console.log('ground normal', getCharacterGroundNormal(character));
  }
  return getCharacterPosition(character);
}
```

Soft bodies use `createSoftBody()` with vertices, inverse masses (`0` pins a vertex), triangle indices, compliance, damping, gravity, and optional pressure. Read or edit vertices with `getSoftBodyVertex()` and `setSoftBodyVertex()`. Vehicles use `createVehicle()` with a chassis shape and four wheel mounts; call `setVehicleInput()` before each `step()` and read wheel transforms with `getWheelTransform()` for rendering. Destroy vehicles and characters before their shared shapes, then destroy constraints, rigid bodies, shapes, and finally the world.

## Native build time

The first native build compiles Jolt from C++ sources and can take about a minute; later local builds reuse the CMake output. BornEngine's CI also caches that output by platform, architecture, toolchain, Jolt revision, and shim sources so unchanged jobs can skip the expensive compile.

For a complete body-to-render example, continue with the [physics gameplay recipe](../../guides/physics-gameplay/).
