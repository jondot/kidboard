// src/runtime/rng.test.ts
import { describe, it, expect } from 'vitest'
import { makeRng } from './rng'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const seqA = [a.int(100), a.int(100), a.int(100)]
    const seqB = [b.int(100), b.int(100), b.int(100)]
    expect(seqA).toEqual(seqB)
  })

  it('differs between seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect(a.int(1000)).not.toBe(b.int(1000))
  })

  it('int stays in range', () => {
    const r = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const n = r.int(5)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(5)
    }
  })

  it('pick returns a member of the array', () => {
    const r = makeRng(3)
    const xs = ['a', 'b', 'c'] as const
    for (let i = 0; i < 50; i++) expect(xs).toContain(r.pick(xs))
  })

  it('chance(1) is always true and chance(0) always false', () => {
    const r = makeRng(9)
    for (let i = 0; i < 20; i++) {
      expect(r.chance(1)).toBe(true)
      expect(r.chance(0)).toBe(false)
    }
  })
})
