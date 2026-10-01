---
title: VFX
description: Create scene-owned 3D particle and decal pools, plus automatic 2D sprite particles.
section: API / VFX
order: 42
---

Effects belong to their Scene. Use `scene.vfx` for 3D particle/decal pools; use `ParticleEmitter2D` as a GameObject component for sprite-based 2D particles.

## Particles

```ts
import { ParticleSystem, Scene } from '@bornengine/engine';

class CombatScene extends Scene {
  private sparks: ParticleSystem | null = null;

  override onEnter(): void {
    this.sparks = this.vfx.createParticleSystem(2048, {
      life: 0.5,
      speed: 4,
      gravity: -2,
    });
    this.sparks?.emit({
      position: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      count: 24,
    });
  }
}
```

The scene updates the pool each frame and releases its native pool and GPU buffer on unload. Call `dispose()` to release either one earlier; freed pool slots are reused. Pool capacity bounds the number of live particles. Draw an active pool through `ParticleSystem.draw(renderer, material, mesh)`; you can also drive the existing 3D particle system from a `SpriteAnimator` marker or other gameplay hook.

## Decals

```ts
const decals = this.vfx.createDecalSystem(512);
if (decals !== null) {
  decals.setStyle({ frame: 0, color: [1, 1, 1, 1], lifetime: 8, fadeDuration: 2 });
  decals.spawn({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.4);
}
```

Scene VFX handles simulation and lifetime. Submit decal instances through their draw method with the scene's renderer, material, and mesh.

## 2D sprite particles

Create a `ParticleEmitter2D` component with frames from one loaded `SpriteSheet`, then attach it to a `GameObject`. The Scene updates and draws it automatically while the object is active. Configure bursts or continuous emission on the component. See the [Sprites API](../sprites/) for setup and examples.
