// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * Counter-based deterministic randomness. Every draw is a pure function of its
 * inputs, so the same instrument on the same day and minute produces the same
 * shock on every machine and after every reload.
 */

/** 32-bit string hash (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes up to three integers into a well-distributed 32-bit value. */
export function mix(a: number, b = 0, c = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform in (0, 1). */
export function uniform(a: number, b = 0, c = 0): number {
  return (mix(a, b, c) + 0.5) / 4294967296;
}

/** Standard normal via Box-Muller on two independent uniforms. */
export function normal(a: number, b = 0, c = 0): number {
  const u1 = uniform(a, b, c);
  const u2 = uniform(a ^ 0x5bd1e995, b + 7919, c + 104729);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Small sequential PRNG (mulberry32) for one-off generation tasks. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal draws from a sequential PRNG. */
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}
