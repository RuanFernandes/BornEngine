import { Noise2D, SeededRandom } from '../../src/procedural';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('Procedural generation failure: ' + label);
    process.exit(1);
  }
}

function expectThrows(action: () => void, label: string): void {
  let didThrow = false;
  try {
    action();
  } catch (_error) {
    didThrow = true;
  }
  expect(didThrow, label);
}

const randomA = new SeededRandom(12345);
const randomB = new SeededRandom(12345);
const randomOtherSeed = new SeededRandom(54321);
let differentSeedDiffers = false;
for (let index = 0; index < 8; index++) {
  const a = randomA.next();
  const b = randomB.next();
  const other = randomOtherSeed.next();
  expect(a === b, 'equal seeds produce the same sequence');
  expect(a >= 0 && a < 1, 'next stays in [0, 1)');
  if (a !== other) differentSeedDiffers = true;
}
expect(differentSeedDiffers, 'different seeds produce different sequences');

const ranged = new SeededRandom(7);
for (let index = 0; index < 64; index++) {
  const value = ranged.range(-3.5, 8.25);
  const integer = ranged.integer(-4, 9);
  expect(value >= -3.5 && value < 8.25, 'range stays within its half-open bounds');
  expect(integer >= -4 && integer <= 9 && Math.floor(integer) === integer,
    'integer uses inclusive integer bounds');
}
expect(new SeededRandom(9).range(4, 4) === 4, 'range supports equal bounds');
expectThrows(() => new SeededRandom(1).range(2, 1), 'range rejects reversed bounds');
expectThrows(() => new SeededRandom(1).integer(0.5, 2), 'integer rejects fractional bounds');

const noiseA = new Noise2D(6789);
const noiseB = new Noise2D(6789);
const otherNoise = new Noise2D(9876);
const samplePoints = [
  { x: 0, y: 0 },
  { x: 0.25, y: 0.75 },
  { x: -5.5, y: 11.125 },
  { x: 1000.25, y: -321.5 },
];
let otherSeedDiffers = false;
for (let index = 0; index < samplePoints.length; index++) {
  const point = samplePoints[index];
  const a = noiseA.sample(point.x, point.y);
  const b = noiseB.sample(point.x, point.y);
  const other = otherNoise.sample(point.x, point.y);
  expect(a === b, 'equal noise seeds reproduce every sample');
  expect(a >= 0 && a <= 1, 'value noise stays in [0, 1]');
  if (a !== other) otherSeedDiffers = true;
}
expect(otherSeedDiffers, 'different noise seeds change sampled terrain');

const center = noiseA.sample(4.5, 8.5);
const nearby = noiseA.sample(4.5001, 8.5);
expect(Math.abs(center - nearby) < 0.001, 'value noise interpolates smoothly between grid points');

const oneOctave = noiseA.fractal(12.375, -2.75, { octaves: 1 });
const manyOctaves = noiseA.fractal(12.375, -2.75, { octaves: 5, persistence: 0.45 });
const repeatedFractal = noiseB.fractal(12.375, -2.75, { octaves: 5, persistence: 0.45 });
expect(manyOctaves === repeatedFractal, 'fractal samples reproduce for equal seeds and options');
expect(manyOctaves >= 0 && manyOctaves <= 1, 'normalized fractal noise stays in [0, 1]');
expect(oneOctave !== manyOctaves, 'octaves add higher-frequency detail');
expectThrows(() => noiseA.fractal(0, 0, { octaves: 0 }), 'fractal rejects zero octaves');
expectThrows(() => noiseA.fractal(0, 0, { octaves: 13 }), 'fractal rejects more than twelve octaves');
expectThrows(() => noiseA.fractal(0, 0, { persistence: 1.1 }), 'fractal rejects persistence outside [0, 1]');

console.log('Seeded random and procedural noise fixtures passed');
