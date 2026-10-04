const PARK_MILLER_MODULUS = 2147483647;
const PARK_MILLER_MULTIPLIER = 16807;
const MAX_SAFE_INTEGER = 9007199254740991;

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isInteger(value: number): boolean {
  return isFiniteNumber(value) && Math.floor(value) === value;
}

/** A reproducible pseudo-random number generator with no runtime dependencies. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!isFiniteNumber(seed)) throw new Error('SeededRandom seed must be finite');
    let state = Math.floor(seed) % PARK_MILLER_MODULUS;
    if (state < 0) state += PARK_MILLER_MODULUS;
    if (state === 0) state = 1;
    this.state = state;
  }

  /** Returns the next deterministic value in the half-open range [0, 1). */
  next(): number {
    this.state = (this.state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return (this.state - 1) / (PARK_MILLER_MODULUS - 1);
  }

  /**
   * Returns a deterministic float in [min, max). In very narrow intervals,
   * rounding to max falls back to min; if min and max are adjacent floats,
   * every result is min because no representable value lies between them.
   */
  range(min: number, max: number): number {
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || max < min ||
      !isFiniteNumber(max - min)) {
      throw new Error('SeededRandom range requires finite, ordered bounds');
    }
    if (min === max) return min;
    const value = min + this.next() * (max - min);
    return value < min || value >= max ? min : value;
  }

  /** Returns a deterministic integer in the inclusive range [min, max]. */
  integer(min: number, max: number): number {
    if (!isInteger(min) || !isInteger(max) || max < min ||
      max - min > MAX_SAFE_INTEGER || Math.abs(min) > MAX_SAFE_INTEGER ||
      Math.abs(max) > MAX_SAFE_INTEGER) {
      throw new Error('SeededRandom integer requires ordered safe-integer bounds');
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
