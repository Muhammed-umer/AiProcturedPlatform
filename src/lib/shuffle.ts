/**
 * Seeded shuffling. Each student gets a different question and option order
 * from the same paper, and because the order is derived from a stored seed
 * the exact paper a student saw can be reproduced later for an audit.
 */

/** Small, fast, deterministic pseudo random number generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a new array. The input is never modified. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Seeds derived from one attempt seed, so each list shuffles independently. */
export function deriveSeed(base: number, salt: string): number {
  let h = base >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = (Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0) + 1;
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
