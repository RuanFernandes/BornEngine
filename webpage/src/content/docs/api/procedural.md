---
title: Procedural generation
description: Make repeatable random numbers and smooth noise for levels, loot, and terrain.
section: API
order: 41
---

Procedural generation means building game content from rules and numbers instead of placing everything by hand: the rooms of a dungeon, the items a chest drops, the hills of a landscape. BornEngine has two small classes for this. `SeededRandom` produces random numbers that you can repeat exactly. `Noise2D` produces smooth values from coordinates, which suits terrain and other natural-looking fields.

Neither class uses `Math.random()` or any global state, and neither needs a running `Game`. You can use them in your game code, in tools, and in tests. Import them from `@bornengine/engine` or from the subpath `@bornengine/engine/procedural`.

## Seeded random values

A random number generator makes a sequence of numbers that looks random. A **seed** is the number that sets where the sequence starts. Two generators created with the same seed produce the same sequence, so a level built from a seed looks the same every time, and a bug that depends on a random roll can be reproduced.

`SeededRandom` has three methods:

| Call | Result | Throws an `Error` when |
| --- | --- | --- |
| `next()` | A float from 0 up to, but not including, 1. | Never. |
| `range(min, max)` | A float from `min` up to, but not including, `max`. | A bound is not finite, `max` is less than `min`, or `max - min` is not finite. |
| `integer(min, max)` | A whole number from `min` to `max`, both included. | A bound is not a finite whole number, `max` is less than `min`, or a bound is beyond `Number.MAX_SAFE_INTEGER`. |

`range(min, max)` returns `min` when the two bounds are equal. The constructor `new SeededRandom(seed)` throws an `Error` if `seed` is not a finite number.

```ts
import { SeededRandom } from '@bornengine/engine';

const random = new SeededRandom(2026);
random.next();

const roomWidth = random.integer(6, 12);
const lootRoll = random.next();
const spawnOffset = random.range(-2, 2);
const drop = lootRoll < 0.1 ? 'rare' : 'common';

console.log(roomWidth, spawnOffset, drop);
```

The call to `next()` before the other calls discards the first value. See the note on small seeds below.

### What the seed does

The generator is a Park-Miller linear congruential generator. It is fast and repeatable, and it is meant for game content, not for secrets: do not use it for passwords, tokens, or anything an attacker should not predict.

The constructor cuts the seed to a whole number and wraps it into the range 1 to 2147483646. As a result, 0 and 1 give the same sequence, and so do 2 and 2.5. The first value of a sequence depends almost directly on the seed, so seeds that are close together start with almost the same value: seed 100 and seed 101 both start near 0.0008. Two habits avoid this:

- Call `next()` once and ignore the result, as the example above does.
- Derive a new seed from another generator instead of adding one to a counter.

### Keep separate streams

A generator has one sequence. If level layout and loot share a generator, adding one loot roll changes every room that is generated after it. Give each system its own generator, and derive their seeds from one level seed:

```ts
import { SeededRandom } from '@bornengine/engine';

const MAX_SEED = 2147483646;

interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
}

class LevelRandom {
  readonly layout: SeededRandom;
  readonly loot: SeededRandom;

  constructor(levelSeed: number) {
    const root = new SeededRandom(levelSeed);
    this.layout = new SeededRandom(root.integer(1, MAX_SEED));
    this.loot = new SeededRandom(root.integer(1, MAX_SEED));
  }
}

function generateRooms(streams: LevelRandom, count: number): Room[] {
  const rooms: Room[] = [];
  for (let index = 0; index < count; index++) {
    rooms.push({
      x: streams.layout.integer(0, 60),
      y: streams.layout.integer(0, 40),
      width: streams.layout.integer(6, 12),
      height: streams.layout.integer(5, 9),
    });
  }
  return rooms;
}

const first = generateRooms(new LevelRandom(2026), 4);
const second = generateRooms(new LevelRandom(2026), 4);
console.log(JSON.stringify(first) === JSON.stringify(second));
```

The last line prints `true`: the same level seed always builds the same rooms. The loot generator is never used while the rooms are built, so rolling loot cannot change the layout.

## Smooth noise

Random numbers jump from one value to the next. For hills, caves, or moisture maps you want values that change gradually: two points that are close together should get similar values. That is what **noise** gives you. `Noise2D` is value noise. It assigns a pseudo-random value to every whole-number grid point and blends smoothly between neighboring points.

`Noise2D` has two methods, and both return a number from 0 to 1:

- `sample(x, y)` returns one layer of noise. Features are about one unit wide.
- `fractal(x, y, options)` adds several layers, each with finer detail and less weight, and divides by the total weight so the result stays between 0 and 1.

The constructor `new Noise2D(seed)` takes a finite seed and cuts it to a whole number. `sample` and `fractal` throw an `Error` if a coordinate is not finite.

`fractal` accepts three options:

| Option | Default | Allowed values |
| --- | --- | --- |
| `octaves` | 4 | A whole number from 1 to 12. The number of layers. |
| `lacunarity` | 2 | From 1 to 4. How much the frequency grows from one layer to the next. |
| `persistence` | 0.5 | From 0 to 1. How much the weight shrinks from one layer to the next. |

A value outside these ranges makes `fractal` throw an `Error`.

Scale your coordinates before you sample. At whole-number coordinates `sample` returns the raw grid values, which are unrelated to each other. If you divide tile coordinates by 24, features become about 24 tiles wide.

The next function builds the tile IDs for a hilly strip of ground. It samples one row of noise, once per column, and fills every cell below the surface with tile ID 1. Tile ID 0 means an empty cell in a `Tilemap`.

```ts
import { Noise2D } from '@bornengine/engine';

const COLUMNS = 64;
const ROWS = 32;

function createTerrainTiles(seed: number): number[] {
  const noise = new Noise2D(seed);
  const tiles: number[] = [];
  for (let index = 0; index < COLUMNS * ROWS; index++) tiles.push(0);

  for (let column = 0; column < COLUMNS; column++) {
    const height = noise.fractal(column / 24, 0, { octaves: 4, persistence: 0.5 });
    const surfaceRow = Math.floor(ROWS * 0.4 + height * ROWS * 0.4);
    for (let row = surfaceRow; row < ROWS; row++) tiles[row * COLUMNS + column] = 1;
  }
  return tiles;
}

const tiles = createTerrainTiles(2026);
console.log(tiles.length);
```

The array has `COLUMNS * ROWS` entries in row-major order, which is the layout the `data` option of a `Tilemap` expects. Pass it as `data` together with `columns: COLUMNS` and `rows: ROWS`. See [Tilemaps](../tilemap/).

To look at a noise field before you use it, print it as text:

```ts
import { Noise2D } from '@bornengine/engine';

const noise = new Noise2D(2026);
const shades = ' .:-=+*#%@';

for (let row = 0; row < 12; row++) {
  let line = '';
  for (let column = 0; column < 48; column++) {
    const value = noise.fractal(column / 12, row / 6);
    const shade = Math.min(shades.length - 1, Math.floor(value * shades.length));
    line += shades.charAt(shade);
  }
  console.log(line);
}
```

Each call to `fractal` runs `sample` once per octave, so cost grows with the octave count. Generate a large map once while a level loads rather than every frame.

## Limitations

- Both classes are synchronous.
- `SeededRandom` has no method to save or restore its state. To repeat a sequence, create a new generator with the same seed and make the same calls in the same order.
- `Noise2D` is value noise on a square grid. It has no third dimension and no option to make the result tile.

## Next steps

- [Tilemaps](../tilemap/) draws a grid of tile IDs, like the terrain above.
- [2D pathfinding](../pathfinding2d/) finds routes across a generated map once you mark its blocked cells.
- [Math](../math/) covers `Vector2D` and the other vector types.
