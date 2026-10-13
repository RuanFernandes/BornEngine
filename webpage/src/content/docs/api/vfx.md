---
title: VFX
description: Create scene-owned 3D particle pools and decal rings, and find where 2D particles live.
section: API
order: 42
---

VFX, short for visual effects, are small decorations that live for a moment: sparks, smoke, dust, and marks that a bullet leaves on a wall. BornEngine has two separate effect systems, and this page covers the 3D one.

- **2D effects** use the `ParticleEmitter2D` component. It draws frames from a sprite sheet and belongs to a game object. It is described in [Sprites and animation](../sprites/).
- **3D effects** use pools that a scene creates through `scene.vfx`. A pool simulates many particles, or many decals, in native code and keeps them ready for one instanced draw.

Three terms appear on this page:

- **Pool**: a fixed number of particle slots. The pool never holds more than its capacity.
- **Particle**: one short-lived point of an effect, with a position, a velocity, a size, and a color that change over its life.
- **Decal**: a flat picture that is stuck onto a surface, such as a bullet hole or a scorch mark.

Read the limitations at the end of each section before you plan a 3D effect. In this version the pools can be created, configured, and simulated, but the public API has no way to draw them with per-particle data.

## Particles

A `ParticleSystem` is a pool of particles. Create one from the scene that should own it:

```ts
import { ParticleSystem, Scene } from '@bornengine/engine';

function createSparks(scene: Scene): ParticleSystem | null {
  return scene.vfx.createParticleSystem(512, { life: 0.6, speed: 5 });
}
```

`createParticleSystem(capacity, config)` returns `null` when the scene is unloading or the capacity is not positive. Otherwise it returns a system, which can still have failed: check its `error`, which is `null` when the pool is ready. The native pool has at most 100,000 slots.

The scene owns the system. It updates the pool every frame as part of `scenes.update(deltaTime)`, including while the scene is paused, and it disposes the pool when the scene unloads. You do not call `update()` yourself. Call `dispose()` to release a pool earlier. Do not use a system after its scene has unloaded.

### Settings

`config` is an object of optional numbers. You can pass it to `createParticleSystem`, or later to `configure(config)`. Every field that you leave out gets its default, so `configure` replaces the whole configuration, not only the fields you pass.

| Field | Default | Meaning |
| --- | --- | --- |
| `life` | `1` | How long a particle lives, in seconds. At least 0.01. |
| `lifeVar` | `0` | A random amount, plus or minus, added to `life` for each particle. |
| `speed` | `1` | Starting speed along the emit direction, in units per second. |
| `speedVar` | `0` | A random amount, plus or minus, added to `speed`. |
| `spread` | `0.3` | Half the opening angle of the emission cone, in radians. About 3.14 gives a full sphere. |
| `gravity` | `-9.81` | Acceleration on the Y axis, in units per second squared. A negative value pulls particles down. |
| `drag` | `0` | Slows particles down. Each step multiplies the velocity by 1 minus `drag` times the step time, so larger values slow particles faster. |
| `size0`, `size1` | `0.2`, `0.2` | Size at birth and at the end of life. The size changes in a straight line between them. |
| `sizeVar` | `0` | Random scale for each particle. A value of 0.5 gives each particle a size multiplier between 0.5 and 1.5. |
| `color0`, `color1` | `[1, 1, 1, 1]`, `[1, 1, 1, 0]` | Color as `[red, green, blue, alpha]` at birth and at the end of life. |
| `spin`, `spinVar` | `0`, `0` | Roll speed in radians per second, plus or minus a random amount. |
| `posJitter` | `0` | Each particle starts up to this far from the emit position on every axis. |
| `stretch` | `0` | When greater than 0, the particle is stretched along its velocity by this many seconds of travel. |
| `frames` | `1` | How many atlas frames the material can show. The frame index grows with the age of the particle. |
| `floorY` | `0` | Height of a bounce plane. |
| `restitution` | `0` | When greater than 0, particles bounce off the plane at `floorY` and keep this fraction of their vertical speed. 0 turns the bounce off. |
| `inherit` | `0` | Accepted, but this version does not use it. |

Color channels run from 0 to 1 here, as the defaults show. Do not pass 0 to 255 values, like the `Color` type uses elsewhere.

### Emit particles

`emit({ position, direction, count })` creates a burst and returns `true`, or `false` if the pool is not ready or `count` is not positive.

- `position` is where the burst starts, as `{ x, y, z }`.
- `direction` is the axis of the emission cone. A zero vector means no preferred direction, and the burst goes out in a full sphere.
- `count` is capped at 4096 per call. When the pool is full, new particles replace random live ones, so a burst is not lost.

`liveCount` reports how many particles are alive. `clear()` removes all of them.

### A complete example

This program owns a pool in a scene, emits a burst every second, and prints how many particles are alive. It does not draw the particles themselves; see the limitations below. The number rises to 24 at each burst and falls back to 0 as the particles expire.

```ts
import { Colors, Game, ParticleSystem, Scene } from '@bornengine/engine';

class SparkScene extends Scene {
  sparks: ParticleSystem | null = null;

  override onEnter(): void {
    const sparks = this.vfx.createParticleSystem(512, {
      life: 0.6,
      lifeVar: 0.2,
      speed: 5,
      speedVar: 2,
      spread: 0.5,
      gravity: -9.81,
      size0: 0.15,
      size1: 0.02,
      color0: [1, 0.8, 0.3, 1],
      color1: [1, 0.2, 0, 0],
    });
    if (sparks === null || sparks.error !== null) {
      console.error(sparks === null ? 'The scene cannot create effects.' : sparks.error);
      return;
    }
    this.sparks = sparks;
  }

  burst(): void {
    if (this.sparks === null) return;
    this.sparks.emit({
      position: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      count: 24,
    });
  }
}

class SparkDemo extends Game {
  private level: SparkScene | null = null;
  private timer = 0;

  constructor() {
    super({ window: { title: 'Particle pool', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.level = new SparkScene({ name: 'sparks' });
    this.scenes.changeTo(this.level);
  }

  protected override loop(deltaTime: number): void {
    this.timer += deltaTime;
    if (this.timer >= 1) {
      this.timer = 0;
      if (this.level !== null) this.level.burst();
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    super.render();
    const live = this.level !== null && this.level.sparks !== null ? this.level.sparks.liveCount : 0;
    this.renderer.drawText('live particles: ' + live, { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new SparkDemo().run();
```

The scene creates the pool in `onEnter()`, which runs when the scene becomes the active scene. The pool is created inside the scene, so unloading the scene releases it.

### Drawing and limitations

A pool writes its live particles into a GPU buffer. `draw(renderer, material, mesh, meshIndex)` submits one instanced draw of `mesh` for all live particles. The material's vertex shader has to read the per-instance data: position, roll, size, tint, normalized age, and atlas frame.

This is the limit of the current version: `assets.createMaterial` compiles a regular material, and a regular material has no vertex inputs for per-instance data. No public function compiles an instanced material, and no example in the repository draws a pool. As a result, the public API can create, configure, emit into, and measure a pool, but it cannot show individual particles. For particles that you can see today, use `ParticleEmitter2D`.

Other limits:

- A build that uses the `2d` native profile leaves out 3D model support. In that build, `configure` has no effect on a pool and instanced draws are disabled. Use the `2.5d` or `3d` profile for a game that needs these pools.
- On watchOS the 3D effect calls are stubs. `createParticleSystem` returns a system whose `error` is set.
- A pool simulates at most 0.1 seconds of time per update, so a long hitch does not make particles jump.
- The pool has no collision. The `floorY` plane is the only thing particles bounce on.

## Decals

A decal is a flat picture that you stick onto a surface. Games use decals for bullet holes, scorch marks, and blood. A `DecalSystem` keeps a ring of them: the ring holds a fixed number of decals, and when it is full, a new decal replaces an old one.

A decal is a sticker, not a projection. It is a small quad turned to face along the surface normal and placed slightly above the surface. It does not bend around corners, so use it on flat surfaces.

Create the ring from the scene that owns it:

- `createDecalSystem(capacity)` returns `null` when the scene is unloading or the capacity is not positive. Check `error` on the result. The ring holds at most 8192 decals.
- A game can have only one decal ring at a time. A second system in the same game gets the error `A Game can own only one DecalSystem.` until the first one is disposed. If you create a ring in each scene, create it in `onEnter()`: the previous scene has been unloaded by then.
- The scene updates the ring every frame and disposes it when the scene unloads.

Two calls fill the ring. `setStyle` describes the decals that you spawn after it, and `spawn` places one:

| Call | What it does |
| --- | --- |
| `setStyle({ frame, color, lifetime, fadeDuration })` | Sets the atlas frame, the color as `[red, green, blue, alpha]` from 0 to 1, how long a decal lives in seconds, and how many seconds at the end of its life it spends fading out. A lifetime of 0 or less keeps the decal until the ring replaces it. The style applies to later spawns only. |
| `spawn(position, normal, size, roll)` | Places a decal at `position`, facing along `normal`, with the given `size`. The optional `roll` turns the decal around the normal. The normal does not have to be a unit vector, and a zero normal faces up. It returns `false` when the size is not positive or the ring is not ready. |

`liveCount` is the number of decals counted by the last update. `clear()` removes all decals, and `dispose()` releases the ring.

```ts
import { DecalSystem, Scene } from '@bornengine/engine';

function createBulletHoles(scene: Scene): DecalSystem | null {
  const decals = scene.vfx.createDecalSystem(256);
  if (decals === null || decals.error !== null) {
    console.error(decals === null ? 'The scene cannot create effects.' : decals.error);
    return null;
  }
  decals.setStyle({ frame: 0, color: [1, 1, 1, 1], lifetime: 8, fadeDuration: 2 });
  decals.spawn({ x: 2, y: 1.5, z: 0 }, { x: 0, y: 0, z: 1 }, 0.4);
  return decals;
}
```

The function creates a ring of 256 decals, sets a style in which each decal lives for 8 seconds and fades during the last 2, and places a decal of size 0.4 on a wall that faces along the positive Z axis.

The decal ring has the same drawing limitation as the particle pool. `draw(renderer, material, mesh, meshIndex)` needs an instanced material that this version's public API cannot create, so the ring can be filled and measured, but not displayed. In a build with the `2d` native profile, instanced draws are disabled. On watchOS, `createDecalSystem` returns a system whose `error` is set.

## 2D effects

For a 2D game, use `ParticleEmitter2D`. It is a component that you attach to a game object, it draws frames from a loaded `SpriteSheet`, and it needs no material or mesh. The scene updates and draws it for you. See [Sprites and animation](../sprites/).

## Next steps

- [Sprites and animation](../sprites/) covers `ParticleEmitter2D` and animation markers that trigger bursts.
- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains scene lifetime and what a scene owns.
- [Models](../models/) covers meshes and materials.
