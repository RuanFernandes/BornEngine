---
title: Procedural generation
description: Build repeatable random choices and smooth seeded 2D noise.
section: API / Procedural generation
order: 41
---

BornEngine provides small deterministic building blocks for level layouts, loot, and terrain. They have no runtime dependency or global random state. Import them from the root package or `@bornengine/engine/procedural`.

## Seeded random values

Create a `SeededRandom` with a finite seed. Reusing the same seed and making the same calls produces the same sequence, which makes a generated level reproducible.

```ts
import { SeededRandom } from '@bornengine/engine/procedural';

const random = new SeededRandom(2026);
const roomWidth = random.integer(6, 12); // inclusive bounds
const lootRoll = random.next();          // [0, 1)
const spawnOffset = random.range(-2, 2);  // [-2, 2)
```

`integer(min, max)` includes both integer bounds. `range(min, max)` includes the lower bound and excludes the upper bound. Use separate instances for systems that should not change one another's random sequence. This generator is for game content, not cryptographic secrets.

## Smooth noise

`Noise2D` produces deterministic smooth value noise in the normalized range `[0, 1]`. Sample it at scaled coordinates for broad terrain features, or call `fractal` to combine several layers of detail.

```ts
import { Noise2D } from '@bornengine/engine/procedural';

const terrain = new Noise2D(2026);
const worldX = 16;
const worldY = 32;
const broadHeight = terrain.sample(worldX / 24, worldY / 24);
const detailedHeight = terrain.fractal(worldX / 24, worldY / 24, {
  octaves: 5,
  lacunarity: 2,
  persistence: 0.5,
});
```

The default fractal settings use four octaves, lacunarity 2, and persistence 0.5. Octaves must be an integer from 1 to 12, lacunarity must be in `[1, 4]`, and persistence must be in `[0, 1]`. Noise does not allocate a map or modify engine state; sample only the coordinates your game needs.
