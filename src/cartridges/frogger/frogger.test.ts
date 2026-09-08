import { describe, it, expect } from 'vitest'
import frogger from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: frogger.strings })
  return { ...h, inst: frogger.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, frogger.size, cols)
const op = (inst: LiveInstance, o: DrawCmd['op']): DrawCmd[] =>
  cmds(inst).filter((c) => c.op === o)
const frog = (inst: LiveInstance): Extract<DrawCmd, { op: 'sprite' }> => {
  const s = cmds(inst).filter((c) => c.op === 'sprite') as Extract<DrawCmd, { op: 'sprite' }>[]
  // The frog is drawn last, after any burrow that is already filled.
  return s[s.length - 1]!
}

/** Hops straight up until something stops the frog. */
const climb = (inst: LiveInstance, n = 6): void => {
  for (let i = 0; i < n; i++) press(inst, 'ArrowUp')
}

describe('frogger', () => {
  it('opens with the frog on the kerb and traffic on the road', () => {
    const { inst } = start()
    // Five lanes of hollow cars, plus three hollow burrows.
    expect(op(inst, 'outline').length).toBeGreaterThan(5)
    expect(op(inst, 'sprite').length).toBe(1)
  })

  it('hops a whole band at a time, and slides within one', () => {
    const { inst } = start()
    const home = frog(inst)
    press(inst, 'ArrowUp')
    const up = frog(inst)
    expect(up.y).toBeLessThan(home.y)
    expect(up.x).toBeCloseTo(home.x, 5)
    press(inst, 'ArrowRight')
    expect(frog(inst).x).toBeGreaterThan(up.x)
    expect(frog(inst).y).toBeCloseTo(up.y, 5)
  })

  it('will not hop off the bottom of the kerb', () => {
    const { inst } = start()
    const home = frog(inst)
    press(inst, 'ArrowDown', 4)
    expect(frog(inst).y).toBeCloseTo(home.y, 5)
  })

  it('will not slide off either edge', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 30)
    const left = frog(inst).x
    press(inst, 'ArrowLeft', 5)
    expect(frog(inst).x).toBeCloseTo(left, 5)
    press(inst, 'ArrowRight', 60)
    const right = frog(inst).x
    press(inst, 'ArrowRight', 5)
    expect(frog(inst).x).toBeCloseTo(right, 5)
  })

  it('fills a burrow when the frog reaches one, and starts again', () => {
    const { inst } = start()
    // The middle burrow is straight above the opening position.
    climb(inst)
    // Two frogs drawn now: the one parked in the burrow and the live one.
    expect(op(inst, 'sprite').length).toBe(2)
    // And the live frog is back on the kerb.
    expect(inst.souvenir?.()).toMatch(/burrow/)
  })

  it('takes the frog anywhere on the bank — there is no dead strip to miss', () => {
    // A child who timed five lanes correctly must never be sent back for
    // landing two pixels wide.
    for (const slide of [0, 1, 2, 3, 4]) {
      const { inst } = start()
      press(inst, 'ArrowLeft', slide)
      climb(inst)
      expect(op(inst, 'sprite').length, `slid ${slide} left`).toBe(2)
    }
  })

  it('sends the frog back when the burrow it aimed at is already full', () => {
    const { inst } = start()
    climb(inst)                       // fills the middle burrow
    expect(op(inst, 'sprite').length).toBe(2)
    climb(inst)                       // straight at the same one again
    // Still just the one parked frog: the second was turned away, not lost.
    expect(op(inst, 'sprite').length).toBe(2)
    // And going somewhere else works.
    press(inst, 'ArrowLeft', 4)
    climb(inst)
    expect(op(inst, 'sprite').length).toBe(3)
  })

  it('squashes the frog when a car reaches it, and holds the picture', () => {
    const { inst } = start()
    press(inst, 'ArrowUp')
    // Run the road until traffic finds it. The lanes are slow on purpose, so
    // this is several seconds of game time.
    for (let i = 0; i < 60 * 30 && op(inst, 'circle').length === 0; i++) ticks(inst, 1)
    expect(op(inst, 'circle').length).toBe(2)
  })

  it('protects the beat after a squash from a held arrow', () => {
    const { inst } = start()
    press(inst, 'ArrowUp')
    for (let i = 0; i < 60 * 30 && op(inst, 'circle').length === 0; i++) ticks(inst, 1)
    const dead = JSON.stringify(cmds(inst).filter((c) => c.op === 'circle'))
    press(inst, 'ArrowUp', 20)
    expect(JSON.stringify(cmds(inst).filter((c) => c.op === 'circle'))).toBe(dead)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, 'ArrowUp')
    expect(op(inst, 'circle').length).toBe(0)
  })

  it('keeps the traffic moving without ever emptying a lane', () => {
    const { inst } = start()
    for (let t = 0; t < 20; t++) {
      ticks(inst, 60)
      // Cars wrap rather than drive off, so there is always traffic to time.
      expect(op(inst, 'outline').length).toBeGreaterThan(5)
    }
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, 'ArrowUp')
    ticks(inst, 120)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('frogger.souvenir.none'))
    press(inst, 'ArrowUp')
    expect(inst.souvenir?.()).not.toMatch(/\d/)
    climb(inst)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  /**
   * THE DIFFICULTY TEST, and it is the only one on this file about whether
   * the game is any GOOD rather than whether it works.
   *
   * "Too hard for a six-year-old" is not a number, so this pins the nearest
   * honest thing: how much of each lane is car, and how big the gap between
   * them is measured in frogs. At five lanes of three fat cars the answer
   * was "half the lane, and a gap you have to hit"; the only strategy left
   * was luck. A gap several frogs wide is one you can walk into, and three
   * lanes of that is a road a child can plan a way across.
   */
  it('leaves gaps a frog can walk into, in every lane', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { inst } = start(seed)
      const cars = op(inst, 'outline') as Extract<DrawCmd, { op: 'outline' }>[]
      // The burrows are outlines too; they are the widest things drawn and
      // they sit on the top band, so the cars are everything below them.
      const top = Math.min(...cars.map((c) => c.y))
      const traffic = cars.filter((c) => c.y > top + 1)
      const lanes = [...new Set(traffic.map((c) => Math.round(c.y)))]
      expect(lanes.length, `seed ${seed}`).toBe(3)

      const frogW = frog(inst).rows[0]!.length * frog(inst).scale
      for (const y of lanes) {
        const inLane = traffic.filter((c) => Math.round(c.y) === y)
        // Cars are drawn at three wrap phases; the ones actually on screen
        // are what a child is looking at.
        const onScreen = inLane.filter((c) => c.x + c.w > 0 && c.x < 240)
        const covered = onScreen.reduce((n, c) => n + c.w, 0)
        expect(covered / 240, `seed ${seed} lane ${y} is mostly car`)
          .toBeLessThan(0.35)
        // And the room between two of them, in frogs.
        const xs = onScreen.map((c) => c.x).sort((a, b) => a - b)
        let widest = 0
        for (let i = 1; i < xs.length; i++) {
          widest = Math.max(widest, xs[i]! - (xs[i - 1]! + onScreen[0]!.w))
        }
        if (xs.length > 1) {
          expect(widest / frogW, `seed ${seed} lane ${y} gap in frogs`)
            .toBeGreaterThan(2.5)
        }
      }
    }
  })

  it('never speeds up so much that finishing is harder than starting', () => {
    // The ramp used to make the third crossing half again as quick as the
    // first, so the game got hardest exactly when a child was closest to
    // winning it. Two burrows in, the traffic must still be walkable.
    const { inst } = start()
    for (let i = 0; i < 2; i++) {
      for (let f = 0; f < 60 * 10 && op(inst, 'sprite').length <= i + 1; f++) {
        press(inst, 'ArrowUp')
        ticks(inst, 8)
      }
    }
    const cars = op(inst, 'outline') as Extract<DrawCmd, { op: 'outline' }>[]
    const top = Math.min(...cars.map((c) => c.y))
    const traffic = cars.filter((c) => c.y > top + 1)
    for (const y of new Set(traffic.map((c) => Math.round(c.y)))) {
      const onScreen = traffic.filter(
        (c) => Math.round(c.y) === y && c.x + c.w > 0 && c.x < 240)
      expect(onScreen.reduce((n, c) => n + c.w, 0) / 240).toBeLessThan(0.35)
    }
  })

  it('draws the same road on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, frogger.size)).toMatchSnapshot()
    expect(pixelsOf(inst, frogger.size, 60)).toMatchSnapshot()
  })
})
