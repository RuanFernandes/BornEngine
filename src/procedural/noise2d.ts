const HASH_MODULUS_A = 65521;
const HASH_MODULUS_B = 65519;
const MAX_OCTAVES = 12;

/** Options for normalized fractal Brownian motion samples. */
export interface FractalNoiseOptions {
  /** Number of layers to combine, from 1 through 12. Defaults to 4. */
  octaves?: number;
  /** Frequency multiplier between layers. Must be in [1, 4]. Defaults to 2. */
  lacunarity?: number;
  /** Amplitude multiplier between layers. Must be in [0, 1]. Defaults to 0.5. */
  persistence?: number;
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function positiveModulo(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function smooth(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

/** Seeded smooth value noise for terrain heights and other 2D fields. */
export class Noise2D {
  private readonly seedA: number;
  private readonly seedB: number;

  constructor(seed: number) {
    if (!isFiniteNumber(seed)) throw new Error('Noise2D seed must be finite');
    const integerSeed = Math.floor(seed);
    this.seedA = positiveModulo(integerSeed, HASH_MODULUS_A);
    this.seedB = positiveModulo(integerSeed, HASH_MODULUS_B);
  }

  /** Samples smooth value noise in the normalized range [0, 1]. */
  sample(x: number, y: number): number {
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      throw new Error('Noise2D coordinates must be finite');
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const v00 = this.lattice(x0, y0);
    const v10 = this.lattice(x0 + 1, y0);
    const v01 = this.lattice(x0, y0 + 1);
    const v11 = this.lattice(x0 + 1, y0 + 1);
    const top = v00 + (v10 - v00) * tx;
    const bottom = v01 + (v11 - v01) * tx;
    return top + (bottom - top) * ty;
  }

  /**
   * Combines smooth noise layers and normalizes their weighted average to [0, 1].
   * Defaults to four octaves, lacunarity 2, and persistence 0.5.
   */
  fractal(x: number, y: number, options: FractalNoiseOptions = {}): number {
    const octaves = options.octaves === undefined ? 4 : options.octaves;
    const lacunarity = options.lacunarity === undefined ? 2 : options.lacunarity;
    const persistence = options.persistence === undefined ? 0.5 : options.persistence;
    if (!isFiniteNumber(octaves) || Math.floor(octaves) !== octaves || octaves < 1 || octaves > MAX_OCTAVES) {
      throw new Error('Noise2D octaves must be an integer from 1 through 12');
    }
    if (!isFiniteNumber(lacunarity) || lacunarity < 1 || lacunarity > 4) {
      throw new Error('Noise2D lacunarity must be in [1, 4]');
    }
    if (!isFiniteNumber(persistence) || persistence < 0 || persistence > 1) {
      throw new Error('Noise2D persistence must be in [0, 1]');
    }

    let frequency = 1;
    let amplitude = 1;
    let total = 0;
    let amplitudeTotal = 0;
    for (let octave = 0; octave < octaves; octave++) {
      total += this.sample(x * frequency, y * frequency) * amplitude;
      amplitudeTotal += amplitude;
      frequency *= lacunarity;
      amplitude *= persistence;
    }
    return total / amplitudeTotal;
  }

  private lattice(x: number, y: number): number {
    const wrappedXA = positiveModulo(x, HASH_MODULUS_A);
    const wrappedYA = positiveModulo(y, HASH_MODULUS_A);
    let hashA = positiveModulo(this.seedA + wrappedXA * 25173 + wrappedYA * 13849, HASH_MODULUS_A);
    hashA = positiveModulo(hashA * hashA + 12345, HASH_MODULUS_A);
    hashA = positiveModulo(hashA + wrappedXA * 3123 + wrappedYA * 19249, HASH_MODULUS_A);
    hashA = positiveModulo(hashA * hashA + 6789, HASH_MODULUS_A);

    const wrappedXB = positiveModulo(x, HASH_MODULUS_B);
    const wrappedYB = positiveModulo(y, HASH_MODULUS_B);
    let hashB = positiveModulo(this.seedB + wrappedXB * 25173 + wrappedYB * 13849, HASH_MODULUS_B);
    hashB = positiveModulo(hashB * hashB + 12345, HASH_MODULUS_B);
    hashB = positiveModulo(hashB + wrappedXB * 3123 + wrappedYB * 19249, HASH_MODULUS_B);
    hashB = positiveModulo(hashB * hashB + 6789, HASH_MODULUS_B);

    return (hashA * HASH_MODULUS_B + hashB) / (HASH_MODULUS_A * HASH_MODULUS_B);
  }
}
