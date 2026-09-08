import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { cmdsOf, pixelsOf, press, testCtx, ticks, holdKey } from '../../testing/cartridgeHarness'
import type { DrawCmd, LiveInstance } from '../../types'

type Rect = Extract<DrawCmd, { op: 'rect' }>
type Round = Extract<DrawCmd, { op: 'disc' }>

const rectsOf = (cmds: DrawCmd[]): Rect[] => cmds.filter((c): c is Rect => c.op === 'rect')

const size = cartridge.size
const make = (seed = 1): LiveInstance =>
  cartridge.create(testCtx({ seed, strings: cartridge.strings }).ctx)

/**
 * How many buckets are in the stack, read off the picture rather than off a
 * variable — every bucket paints exactly one wide rect (its floor); the two
 * walls are three pixels across.
 */
const bucketsOn = (inst: LiveInstance, cols?: number): number =>
  rectsOf(cmdsOf(inst, size, cols)).filter((c) => c.w > 10).length

const discs = (cmds: DrawCmd[]): Round[] => cmds.filter((c): c is Round => c.op === 'disc')
const rings = (cmds: DrawCmd[]): DrawCmd[] => cmds.filter((c) => c.op === 'circle')

/**
 * A child who FOLLOWS the bomb: every frame, one step towards the lowest one
 * on screen. This is the only honest way to test catching — the bomber walks
 * away from the middle before he lets go of anything, so a player who never
 * moves is a player who never catches, which is the game working.
 */
const follow = (inst: LiveInstance, secs: number): void => {
  for (let t = 0; t < secs; t += 1 / 60) {
    const cmds = cmdsOf(inst, size)
    const bomb = discs(cmds).sort((a, b) => b.y - a.y)[0]
    const floor = rectsOf(cmds).filter((c) => c.w > 10)[0]
    if (bomb && floor) {
      const here = floor.x + floor.w / 2
      if (bomb.x < here - 2) press(inst, 'ArrowLeft')
      else if (bomb.x > here + 2) press(inst, 'ArrowRight')
    }
    inst.tick?.(1 / 60)
  }
}

/** Runs until the predicate holds, or gives up. Bombs arrive on their own. */
const until = (inst: LiveInstance, ok: () => boolean, secs = 20): boolean => {
  for (let t = 0; t < secs; t += 1 / 60) {
    inst.tick?.(1 / 60)
    if (ok()) return true
  }
  return false
}

describe('the stack', () => {
  it('starts with three buckets', () => {
    expect(bucketsOn(make())).toBe(3)
  })

  it('loses one when a bomb gets past it, and the catch line drops with it', () => {
    const inst = make()
    // Park the buckets in the far corner so the bomber cannot help but miss.
    press(inst, 'ArrowLeft', 20)
    const highest = (): number => {
      const floors = rectsOf(cmdsOf(inst, size)).filter((c) => c.w > 10)
      return Math.min(...floors.map((c) => c.y))
    }
    const rimBefore = highest()
    expect(until(inst, () => bucketsOn(inst) === 2)).toBe(true)
    // A shorter stack means the top rim sits LOWER on the screen, which is
    // the whole of what the picture has to say about a lost bucket.
    expect(highest()).toBeGreaterThan(rimBefore)
  })

  it('runs out, and comes back whole when a key asks for it', () => {
    const inst = make()
    press(inst, 'ArrowLeft', 20)
    for (let i = 0; i < 3; i++) {
      expect(until(inst, () => bucketsOn(inst) === 2 - i)).toBe(true)
      // Each miss is its own held moment; a key past the hold resumes.
      ticks(inst, 40)
      press(inst, ' ')
    }
    expect(bucketsOn(inst)).toBe(3)
  })
})

describe('catching', () => {
  it('costs no bucket when the child follows the bomb', () => {
    const inst = make()
    follow(inst, 12)
    expect(bucketsOn(inst)).toBe(3)
    expect(rings(cmdsOf(inst, size))).toHaveLength(0)
  })

  it('never lets a bucket leave the stage', () => {
    const inst = make()
    press(inst, 'ArrowRight', 60)
    for (const c of rectsOf(cmdsOf(inst, size))) {
      if (c.w <= 10) continue
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(size.cols * 8)
    }
  })
})

describe('the held moment', () => {
  it('marks the miss with a ring, and a held key does not blow through it', () => {
    const inst = make()
    press(inst, 'ArrowLeft', 20)
    expect(until(inst, () => bucketsOn(inst) === 2)).toBe(true)
    expect(rings(cmdsOf(inst, size)).length).toBeGreaterThan(0)
    // A six-year-old plays with the arrow held down. Half a second of that
    // must not restart the bombing before the ring has been seen.
    holdKey(inst, 'ArrowLeft', 0.3)
    expect(rings(cmdsOf(inst, size)).length).toBeGreaterThan(0)
    expect(discs(cmdsOf(inst, size))).toHaveLength(0)
  })
})

describe('the picture', () => {
  it('draws the bomber, the stack and nothing outside the field', () => {
    const inst = make()
    ticks(inst, 90)
    const rows = pixelsOf(inst, size).split('\n')
    expect(rows).toHaveLength(18 * 8)
    expect(rows[0]).toHaveLength(30 * 8)
    // Someone at the top, buckets at the bottom, ink in both halves.
    const lit = (r: string): number => [...r].filter((ch) => ch === '#').length
    const top = rows.slice(0, 30).reduce((n, r) => n + lit(r), 0)
    const bottom = rows.slice(100).reduce((n, r) => n + lit(r), 0)
    expect(top).toBeGreaterThan(0)
    expect(bottom).toBeGreaterThan(0)
  })

  it('keeps the stage centred on a wide screen', () => {
    const inst = make()
    const wide = cmdsOf(inst, size, 60)
    const xs = rectsOf(wide).map((c) => c.x)
    expect(Math.min(...xs)).toBeGreaterThan(0)
  })
})

describe('the souvenir', () => {
  it('is warm and numberless before anything has been caught', () => {
    const inst = make()
    const s = inst.souvenir?.() ?? ''
    expect(s).not.toMatch(/\d/)
    expect(s.length).toBeGreaterThan(10)
  })

  it('names catching once a bomb has landed in a bucket', () => {
    const inst = make()
    follow(inst, 12)
    expect(inst.souvenir?.()).not.toBe(cartridge.strings?.en?.['kaboom.souvenir.none'])
  })

  it('names a whole load once one has been caught end to end', () => {
    const inst = make()
    follow(inst, 45)
    expect(inst.souvenir?.()).toBe(cartridge.strings?.en?.['kaboom.souvenir.loads'])
  })
})
