import { Noise2D, SeededRandom } from '@bornengine/engine';
import { Noise2D as ProceduralNoise2D, SeededRandom as ProceduralRandom } from '@bornengine/engine/procedural';
import type { FractalNoiseOptions } from '@bornengine/engine/procedural';

const rootRandom: SeededRandom = new SeededRandom(123);
const subpathRandom: ProceduralRandom = new ProceduralRandom(123);
const rootNoise: Noise2D = new Noise2D(123);
const subpathNoise: ProceduralNoise2D = new ProceduralNoise2D(123);
const terrainOptions: FractalNoiseOptions = { octaves: 5, lacunarity: 2, persistence: 0.45 };

rootRandom.next();
subpathRandom.integer(0, 3);
rootNoise.sample(0.25, 0.75);
subpathNoise.fractal(2, 3, terrainOptions);
