---
title: VFX
description: Create GPU particle systems and decals without pulling a separate effects framework into the game.
section: API / VFX
order: 40
---

Import from `@bornengine/engine/vfx`:

```ts
import { createParticleSystem, emitParticles, updateParticles, particleInstanceBuffer } from '@bornengine/engine/vfx';

const smoke = createParticleSystem(1024, {
  life: 1.5,
  size0: 0.4,
  size1: 1.2,
  color0: [0.75, 0.8, 0.84, 0.8],
  color1: [0.75, 0.8, 0.84, 0],
});

emitParticles(smoke, 0, 1, 0, 0, 1, 0, 12);
updateParticles(smoke, dt);
const instances = particleInstanceBuffer(smoke);
```

`ParticleConfig` describes the emission and appearance values. `particleCount` and `clearParticles` help a game budget or reset a system. Decals use `initDecals`, `setDecalStyle`, `spawnDecal`, `updateDecals`, and `decalInstanceBuffer`.

Keep effects in the frame order that owns them: emit or update state first, then issue the model/material draw work that consumes the instance buffer.
