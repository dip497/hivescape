/**
 * Seeded randomness. A scene draws every random choice from an `Rng` it was handed, so the same
 * seed gives the same world, frame for frame: tests can pin a picture, and a bug can be replayed.
 */

export interface Rng {
  /** A number in [0, 1). */
  (): number;
  /** A whole number in [0, n). */
  int(n: number): number;
  /** A number in [a, b). */
  range(a: number, b: number): number;
  /** One of `items`. */
  pick<T>(items: readonly T[]): T;
  /** An independent stream for one part of a scene: forks with different salts never correlate. */
  fork(salt: number): Rng;
  readonly seed: number;
}

/** sfc32: small, fast, and passes PractRand far beyond what a scene draws. */
export function rng(seed = 1): Rng {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0 || 1;
  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const r = next as Rng;
  r.int = (n) => Math.floor(next() * n);
  r.range = (lo, hi) => lo + next() * (hi - lo);
  r.pick = (items) => items[Math.floor(next() * items.length)]!;
  r.fork = (salt) => rng(hash32(seed, salt));
  Object.defineProperty(r, "seed", { value: seed >>> 0 });
  return r;
}

/** A 32-bit hash of up to three integers (Murmur3's finaliser over a mix of them). */
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A stable number in [0, 1) for a cell or an index: the same inputs, the same answer, with no state. */
export const hash01 = (a: number, b = 0, c = 0): number => hash32(a, b, c) / 4294967296;
