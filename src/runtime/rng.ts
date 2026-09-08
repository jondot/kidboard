import type { Rng } from '../types'

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const float = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    float,
    int: (maxExclusive) => Math.floor(float() * maxExclusive),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(float() * xs.length)]!,
    chance: (p) => float() < p,
  }
}
