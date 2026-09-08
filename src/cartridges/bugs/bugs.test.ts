import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { cmdsOf, pixelsOf, press, testCtx, ticks, holdKey } from '../../testing/cartridgeHarness'
import type { DrawCmd, LiveInstance } from '../../types'

const size = cartridge.size
const FIELD_W = size.cols * 8
const make = (seed = 1): LiveInstance =>
  cartridge.create(testCtx({ seed, strings: cartridge.strings }).ctx)

type Ring = Extract<DrawCmd, { op: 'circle' }>
type Frame = Extract<DrawCmd, { op: 'outline' }>
type Sprite = Extract<DrawCmd, { op: 'sprite' }>

const ringsOf = (c: DrawCmd[]): Ring[] => c.filter((x): x is Ring => x.op === 'circle')
/** Segment rings are small; the two rings a bump paints are much bigger. */
const segRings = (c: DrawCmd[]): Ring[] => ringsOf(c).filter((r) => r.r < 10)
const mushrooms = (c: DrawCmd[]): Frame[] => c.filter((x): x is Frame => x.op === 'outline')
const blasterOf = (c: DrawCmd[]): Sprite | undefined =>
  c.filter((x): x is Sprite => x.op === 'sprite')[0]

/** One entry per cell a segment stands in, and how many rings it wears. */
const cells = (inst: LiveInstance): Map<string, number> => {
  const m = new Map<string, number>()
  for (const r of segRings(cmdsOf(inst, size))) {
    const k = `${Math.round(r.x)},${Math.round(r.y)}`
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const segments = (inst: LiveInstance): number => cells(inst).size
/** A head wears a second, tighter ring — so the heads are the doubled cells. */
const heads = (inst: LiveInstance): number =>
  [...cells(inst).values()].filter((n) => n > 1).length

const bumping = (inst: LiveInstance): boolean =>
  ringsOf(cmdsOf(inst, size)).some((r) => r.r > 10)

/** Where the blaster is, in pixels across the field. */
const blasterX = (inst: LiveInstance): number => {
  const s = blasterOf(cmdsOf(inst, size))!
  return s.x + (13 * 2) / 2
}

/**
 * A child who actually plays: line the blaster up under the lowest segment,
 * and shoot whenever it is lined up. Everything interesting about this game
 * happens downstream of a shot landing, so nothing can be asserted without
 * one.
 */
const play = (inst: LiveInstance, secs: number, seen?: (i: LiveInstance) => void): void => {
  for (let t = 0; t < secs; t += 1 / 60) {
    if (bumping(inst)) {
      ticks(inst, 40)
      press(inst, ' ')
      continue
    }
    const targets = segRings(cmdsOf(inst, size)).sort((a, b) => b.y - a.y)
    const target = targets[0]
    if (target) {
      const here = blasterX(inst)
      if (target.x < here - 3) press(inst, 'ArrowLeft')
      else if (target.x > here + 3) press(inst, 'ArrowRight')
      else press(inst, ' ')
    }
    inst.tick?.(1 / 60)
    seen?.(inst)
  }
}

describe('the centipede', () => {
  it('crawls onto the board a segment at a time', () => {
    const inst = make()
    expect(segments(inst)).toBe(1)
    ticks(inst, 60 * 3)
    expect(segments(inst)).toBe(8)
    expect(heads(inst)).toBe(1)
  })

  it('turns down when something is in the way, and never stalls', () => {
    const inst = make()
    // Left alone, it always reaches the blaster's line. A centipede that can
    // get stuck is a game that quietly stops without saying so.
    let reached = false
    for (let t = 0; t < 40 && !reached; t += 1 / 60) {
      inst.tick?.(1 / 60)
      reached = bumping(inst)
    }
    expect(reached).toBe(true)
  })

  it('comes apart into two when it is hit in the middle', () => {
    const inst = make()
    ticks(inst, 60 * 3)
    let most = 1
    play(inst, 30, (i) => { most = Math.max(most, heads(i)) })
    expect(most).toBeGreaterThan(1)
  })
})

describe('the mushrooms', () => {
  it('start scattered, and a shot clears one away', () => {
    const inst = make()
    const before = mushrooms(cmdsOf(inst, size)).length
    expect(before).toBeGreaterThan(8)
    let fewest = before
    play(inst, 40, (i) => {
      fewest = Math.min(fewest, mushrooms(cmdsOf(i, size)).length)
    })
    expect(fewest).toBeLessThan(before)
  })

  it('never grows one on the line the blaster owns', () => {
    const inst = make()
    play(inst, 30)
    const floor = 144 - (144 / 12) * 2
    for (const m of mushrooms(cmdsOf(inst, size))) {
      expect(m.y).toBeLessThan(floor)
    }
  })
})

describe('the held moment', () => {
  it('marks it with a ring, and a held key does not blow through it', () => {
    const inst = make()
    let hit = false
    for (let t = 0; t < 40 && !hit; t += 1 / 60) {
      inst.tick?.(1 / 60)
      hit = bumping(inst)
    }
    expect(hit).toBe(true)
    holdKey(inst, 'ArrowLeft', 0.3)
    expect(bumping(inst)).toBe(true)
  })
})

describe('the picture', () => {
  it('fills the field and keeps the blaster inside it', () => {
    const inst = make()
    ticks(inst, 120)
    const rows = pixelsOf(inst, size).split('\n')
    expect(rows).toHaveLength(18 * 8)
    expect(rows[0]).toHaveLength(FIELD_W)
    press(inst, 'ArrowRight', 60)
    const s = blasterOf(cmdsOf(inst, size))!
    expect(s.x).toBeGreaterThanOrEqual(0)
    expect(s.x + 13 * 2).toBeLessThanOrEqual(FIELD_W)
  })

  it('keeps the stage centred on a wide screen', () => {
    const inst = make()
    ticks(inst, 120)
    const xs = mushrooms(cmdsOf(inst, size, 60)).map((c) => c.x)
    expect(Math.min(...xs)).toBeGreaterThan(0)
  })
})

describe('the souvenir', () => {
  it('is warm and numberless before anything has been hit', () => {
    const s = make().souvenir?.() ?? ''
    expect(s).not.toMatch(/\d/)
    expect(s).toBe(cartridge.strings?.en?.['bugs.souvenir.none'])
  })

  it('names the split once one has happened', () => {
    const inst = make()
    ticks(inst, 60 * 3)
    play(inst, 30)
    expect(inst.souvenir?.()).not.toBe(cartridge.strings?.en?.['bugs.souvenir.none'])
  })
})
