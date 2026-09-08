import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { cmdsOf, pixelsOf, press, testCtx, ticks, holdKey } from '../../testing/cartridgeHarness'
import type { DrawCmd, LiveInstance } from '../../types'

const size = cartridge.size
const make = (seed = 1): LiveInstance =>
  cartridge.create(testCtx({ seed, strings: cartridge.strings }).ctx)

type Disc = Extract<DrawCmd, { op: 'disc' }>
type Ring = Extract<DrawCmd, { op: 'circle' }>
type Frame = Extract<DrawCmd, { op: 'outline' }>
type Sprite = Extract<DrawCmd, { op: 'sprite' }>
type Bar = Extract<DrawCmd, { op: 'rect' }>

/** Every hollow rect but the one big one, which is the arena itself. */
const bricks = (c: DrawCmd[]): Frame[] =>
  c.filter((x): x is Frame => x.op === 'outline' && x.w < 100)
const kings = (c: DrawCmd[]): Sprite[] => c.filter((x): x is Sprite => x.op === 'sprite')
/** The bats are the only rects on the board. */
const bats = (c: DrawCmd[]): Bar[] => c.filter((x): x is Bar => x.op === 'rect')
const ball = (c: DrawCmd[]): Disc => c.filter((x): x is Disc => x.op === 'disc')[0]!
const rings = (c: DrawCmd[]): Ring[] => c.filter((x): x is Ring => x.op === 'circle')

/** The round is over exactly when the held moment's rings are on screen. */
const over = (inst: LiveInstance): boolean => rings(cmdsOf(inst, size)).length > 0
/** A solid king is filled all the way across its third row. */
const solidKings = (c: DrawCmd[]): number =>
  kings(c).filter((s) => s.rows[2] === '###########').length

describe('the board', () => {
  it('sets out four castles, four walls and four kings', () => {
    const cmds = cmdsOf(make(), size)
    expect(kings(cmds)).toHaveLength(4)
    // Nine bricks apiece, two layers deep on every approach.
    expect(bricks(cmds)).toHaveLength(36)
  })

  it('fills in exactly one king, and it is the child', () => {
    expect(solidKings(cmdsOf(make(), size))).toBe(1)
  })

  it('gives the child a thicker bat than everybody else', () => {
    const bs = bats(cmdsOf(make(), size))
    const mine = bs.filter((b) => b.w === 7)
    const theirs = bs.filter((b) => b.w === 3)
    // Four bats, the same number of blocks each, one of them twice across.
    expect(mine.length).toBe(theirs.length / 3)
    expect(mine.length).toBeGreaterThan(8)
  })

  it('draws the arena the ball bounces off', () => {
    const rails = cmdsOf(make(), size).filter((x) => x.op === 'outline' && x.w > 100)
    expect(rails).toHaveLength(1)
  })

  it('puts one ball on the board and never lets it off', () => {
    const inst = make()
    for (let i = 0; i < 6000; i++) {
      inst.tick?.(1 / 60)
      const cmds = cmdsOf(inst, size)
      const b = ball(cmds)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x).toBeLessThanOrEqual(size.cols * 8)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeLessThanOrEqual(18 * 8)
      if (over(inst)) break
    }
  })
})

describe('the walls', () => {
  it('come apart brick by brick as the ball works at them', () => {
    const inst = make()
    const before = bricks(cmdsOf(inst, size)).length
    let fewest = before
    for (let i = 0; i < 6000 && !over(inst); i++) {
      inst.tick?.(1 / 60)
      fewest = Math.min(fewest, bricks(cmdsOf(inst, size)).length)
    }
    expect(fewest).toBeLessThan(before)
  })
})

describe('the round', () => {
  /**
   * The one way this game could fail silently: a ball that settles into an
   * orbit nothing can interrupt. Nobody would be told; the child would simply
   * watch it go round for ever. So a round left entirely alone must END.
   */
  it('always ends, even with nobody touching the keyboard', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const inst = make(seed)
      let ended = false
      for (let i = 0; i < 60 * 600 && !ended; i++) {
        inst.tick?.(1 / 60)
        ended = over(inst)
      }
      expect(ended, `seed ${seed} never finished`).toBe(true)
    }
  })

  it('holds the picture, and a held key does not blow through it', () => {
    const inst = make()
    for (let i = 0; i < 60 * 600 && !over(inst); i++) inst.tick?.(1 / 60)
    expect(over(inst)).toBe(true)
    holdKey(inst, 'ArrowLeft', 0.3)
    expect(over(inst)).toBe(true)
    // Past the hold, any key sets the four castles back up.
    ticks(inst, 40)
    press(inst, ' ')
    expect(over(inst)).toBe(false)
    expect(bricks(cmdsOf(inst, size))).toHaveLength(36)
  })
})

describe('the bat', () => {
  it('stays on its own diagonal however hard it is pushed', () => {
    const inst = make()
    press(inst, 'ArrowRight', 100)
    const inside = (): void => {
      for (const b of bats(cmdsOf(inst, size))) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w).toBeLessThanOrEqual(size.cols * 8)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y + b.h).toBeLessThanOrEqual(18 * 8)
      }
    }
    inside()
    press(inst, 'ArrowLeft', 200)
    inside()
  })
})

describe('the picture', () => {
  it('draws a square arena and keeps it centred on a wide screen', () => {
    const inst = make()
    const rows = pixelsOf(inst, size).split('\n')
    expect(rows).toHaveLength(18 * 8)
    expect(rows[0]).toHaveLength(size.cols * 8)
    const wide = bricks(cmdsOf(inst, size, 60))
    const xs = wide.map((b) => b.x)
    expect(Math.min(...xs)).toBeGreaterThan(50)
    expect(Math.max(...xs)).toBeLessThan(60 * 8 - 50)
  })
})

describe('the souvenir', () => {
  it('is warm and numberless before a brick has moved', () => {
    const s = make().souvenir?.() ?? ''
    expect(s).not.toMatch(/\d/)
    expect(s).toBe(cartridge.strings?.en?.['castles.souvenir.none'])
  })

  it('says what happened once a round has been played out', () => {
    const inst = make()
    for (let i = 0; i < 60 * 600 && !over(inst); i++) inst.tick?.(1 / 60)
    expect(over(inst)).toBe(true)
    const s = inst.souvenir?.() ?? ''
    expect(s).not.toBe(cartridge.strings?.en?.['castles.souvenir.none'])
    expect(s).not.toMatch(/\d/)
  })
})
