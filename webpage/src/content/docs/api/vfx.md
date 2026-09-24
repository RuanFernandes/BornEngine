---
title: VFX
description: Simulate GPU-ready particles and decals with explicit budgets, materials, and frame ordering.
section: API / VFX
order: 40
---

The VFX module owns compact CPU-side pools and rewrites an instanced GPU buffer once per update. The game supplies a mesh and a material; the effect system supplies per-instance position, roll, scale, tint, and extra data. That keeps the draw cost tied to the number of visual systems rather than the number of live particles.

## Particles

`ParticleConfig` controls lifetime, speed, spread, gravity, drag, size, colors, spin, jitter, stretching, atlas frames, and optional floor bounce. Colors are normalized RGBA arrays. Create one pool per visual look so smoke, sparks, and blood can use different materials and blend buckets.

```ts
import {
  createParticleSystem,
  emitParticles,
  particleCount,
  updateParticles,
} from '@bornengine/engine/vfx';

const smoke = createParticleSystem(1024, {
  life: 1.8,
  lifeVar: 0.35,
  speed: 0.6,
  spread: 0.45,
  gravity: 0.15,
  drag: 2,
  size0: 0.25,
  size1: 1.4,
  color0: [0.55, 0.58, 0.62, 0.75],
  color1: [0.2, 0.22, 0.25, 0],
  frames: 8,
});

export function emitSmoke(x: number, y: number, z: number) {
  emitParticles(smoke, x, y, z, 0, 1, 0, 16);
}

export function updateSmoke(dt: number) {
  const live = updateParticles(smoke, dt);
  console.log('smoke budget', live, '/', particleCount(smoke));
  return live;
}
```

`emitParticles()` accepts a direction vector; `(0, 0, 0)` produces an omnidirectional burst. `updateParticles()` integrates and uploads the pool, returning the live count. Use `particleCount()` for a budget overlay and `clearParticles()` when resetting a level or changing effect ownership. Configure a pool at startup; `configureParticleSystem()` is a re-tuning call, not a per-particle update path.

To consume the pool, compile an instanced material whose vertex input includes BornEngine's instance locations, then pass the live count to `drawMeshWithMaterialInstanced()`. The instance buffer carries particle age/frame/stretch in its extra attributes, so the WGSL material decides how the atlas and billboards look.

```ts
import {
  drawMeshWithMaterialInstanced,
  loadMaterial,
  loadModel,
} from '@bornengine/engine/models';
import { particleInstanceBuffer } from '@bornengine/engine/vfx';

const smokeQuad = loadModel('assets/models/effects/billboard-quad.glb');
const smokeMaterial = loadMaterial({
  shader: 'assets/shaders/smoke.wgsl',
  bucket: 'transparent',
});

export function drawSmoke(live: number) {
  if (live === 0) return;
  drawMeshWithMaterialInstanced(
    smokeMaterial,
    smokeQuad,
    0,
    particleInstanceBuffer(smoke),
    live,
  );
}
```

## Decals

Decals share one ring and one instance buffer. Call `initDecals(capacity)` once, select the atlas frame and lifetime with `setDecalStyle()`, and spawn each mark using the hit point and surface normal from a physics query. `life <= 0` makes a mark permanent until the ring wraps; `fade` controls the trailing fade interval.

```ts
import {
  decalInstanceBuffer,
  initDecals,
  setDecalStyle,
  spawnDecal,
  updateDecals,
} from '@bornengine/engine/vfx';

initDecals(512);
setDecalStyle(3, 0.8, 0.35, 0.2, 1, 8, 1.5);

export function placeImpact(hit: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) {
  spawnDecal(
    hit.point.x, hit.point.y, hit.point.z,
    hit.normal.x, hit.normal.y, hit.normal.z,
    0.35,
    Math.random() * Math.PI * 2,
  );
}

export function updateDecalPool(dt: number) {
  return updateDecals(dt);
}

console.log('instance buffer', decalInstanceBuffer());
```

`decalInstanceBuffer()` has no system argument because the decal ring is global. Render it with the returned live count from `updateDecals()` and the same instanced draw path used for particles. `clearDecals()` removes every mark when unloading a world.

## Frame ordering

Treat VFX as a simulation-to-render handoff. Spawn from gameplay events, update each pool once, then draw from the freshly rewritten buffer. A typical frame is: step physics, read contacts and spawn decals/particles, update particle and decal pools, draw scene geometry, then draw VFX with their instanced materials. Do not call `particleInstanceBuffer()` before `updateParticles()` if you expect current positions.

Keep capacities explicit. A full pool drops new spawns rather than growing an unbounded allocation, so size smoke, decal, and spark pools against the maximum effect density your target can afford.
