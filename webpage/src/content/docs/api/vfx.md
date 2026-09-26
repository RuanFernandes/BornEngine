---
title: VFX
description: Own and update GPU particle and decal systems through the Game runtime.
section: API / VFX
order: 42
---

Visual effect pools belong to a Game and are updated explicitly. Configure effects once, advance them during update, then submit them through Renderer with an owned material and mesh.

## Particles

```ts
import { Game, ParticleSystem } from '@bornengine/engine';
const game = new Game();
const sparks = new ParticleSystem(game, 2048, { life: 0.5, speed: 4, gravity: -2 });
sparks.emit({
  position: { x: 0, y: 1, z: 0 },
  direction: { x: 0, y: 1, z: 0 },
  count: 24,
});
```

Call `sparks.update(deltaTime)` during simulation. Pool capacity bounds the number of live particles; use `clear()` when reusing an effect pool.

## Decals

```ts
import { DecalSystem } from '@bornengine/engine';
const decals = new DecalSystem(game, 512);
decals.setStyle({ frame: 0, color: [1, 1, 1, 1], lifetime: 8, fadeDuration: 2 });
decals.spawn({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.4);
decals.update(deltaTime);
```

Both systems expose live counts and explicit disposal. The current native ABI clears and invalidates their pools at Game shutdown.
