# Physics

BornEngine physics uses Jolt through a game-owned `PhysicsWorld`. Collider, body, joint, and controller instances keep their native identities private and are valid only for the world that created them.

## Create a world and body

```ts
import { Game, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';

const game = new Game();
const physics = new PhysicsWorld(game, { gravity: { x: 0, y: -9.81, z: 0 } });
physics.setFixedTimestep(60, 4);
physics.setInterpolation(true);

const sphere = new SphereCollider(physics, 0.5);
const ball = physics.createBody(sphere, {
  motionType: MotionType.DYNAMIC,
  position: { x: 0, y: 3, z: 0 },
  restitution: 0.2,
});
```

Keep the world, colliders, and bodies alive for as long as they participate in the simulation. Dispose an individual body or collider when it is removed, or dispose the owning `Game` to release everything.

## Step the simulation

```ts
game.run({
  update(deltaTime) {
    physics.step(Math.min(deltaTime, 0.25));
    const hit = physics.raycast(
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -1, z: 0 },
      10,
    );
    if (hit !== null) console.log('hit body', hit.body);
  },
  render() {
    game.renderer.clear({ r: 16, g: 20, b: 28, a: 255 });
  },
  onStop: () => game.dispose(),
});
```

`PhysicsWorld.step()` owns its fixed-step accumulator and synchronizes a configured scene manager before and after simulation. Dynamic body transforms flow back into attached game objects. Call one world step per gameplay frame; use `stepVariable()` only when your application owns the accumulator.

## Queries and contacts

`raycast`, `raycastAll`, and overlap methods return body instances rather than public numeric IDs. `popContacts()` drains contact events; use `setLayerCollides()` to configure collision filtering. These operations return empty results when the world is not ready or has been disposed.

## Solver behavior

`step()` uses a fixed 60 Hz accumulator by default. It carries fractional time
between frames, clamps long frame deltas to 0.25 seconds, and runs at most four
substeps per frame. Change the rate or catch-up budget with
`world.setFixedTimestep(hz, maxSteps)`. `step()` returns interpolation alpha;
`world.setInterpolation(true)` applies it to body transforms automatically.
Physics queries always use the current simulation state. Use `stepVariable()`
only when your game already implements its own accumulator.

## Available systems

| System | API |
|---|---|
| Primitive and authored shapes | `BoxCollider`, `SphereCollider`, `CapsuleCollider`, `CylinderCollider`, `ConvexHullCollider`, `MeshCollider`, `HeightfieldCollider` |
| Reusable shape composition | `CompoundCollider`, `ScaledCollider`, `OffsetCollider` |
| Rigid bodies and joints | `world.createBody()`, `world.createJoint()` |
| Character controllers | `world.createCharacter()` |
| Soft bodies and vehicles | `world.createSoftBody()`, `world.createVehicle()` |
| Spatial queries and contacts | `raycast()`, `raycastAll()`, overlap queries, `popContacts()` |

Native targets use Jolt. Web/WASM uses JoltPhysics.js behind the same
TypeScript-facing classes. watchOS currently has no physics backend. Review the
target limitations before depending on a native-only capability.
