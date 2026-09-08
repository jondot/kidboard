import { describe, it, expect } from 'vitest'
import climb from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: climb.strings })
  return { ...h, inst: climb.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, climb.size, cols)
type Sprite = Extract<DrawCmd, { op: 'sprite' }>
const sprites = (inst: LiveInstance): Sprite[] =>
  cmds(inst).filter((c) => c.op === 'sprite') as Sprite[]
/** The friend is drawn first and hollow; the climber last and solid. */
const climber = (inst: LiveInstance): Sprite => sprites(inst)[sprites(inst).length - 1]!
const friend = (inst: LiveInstance): Sprite => sprites(inst)[0]!
const girders = (inst: LiveInstance): Extract<DrawCmd, { op: 'rect' }>[] =>
  cmds(inst).filter((c) => c.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>[]
const barrels = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'circle').length
const rings = (inst: LiveInstance): number => barrels(inst)

/** Walks the climber to a position across the stage, in pixels, and stops. */
const walkTo = (inst: LiveInstance, at: number): void => {
  for (let i = 0; i < 120; i++) {
    const here = climber(inst).x + 7
    if (Math.abs(here - at) <= 4) return
    press(inst, here < at ? 'ArrowRight' : 'ArrowLeft')
  }
}
/** Where the ladder out of the bottom girder is, in stage pixels. */
const FIRST_LADDER = 0.24 * 240

describe('climb', () => {
  it('opens with four girders, a climber at the bottom and a friend at the top', () => {
    const { inst } = start()
    // Four full-width bars are the girders; the ladders are narrow ones.
    const full = girders(inst).filter((r) => r.w > 200)
    expect(full).toHaveLength(4)
    expect(sprites(inst)).toHaveLength(2)
    // The climber starts below the friend and to the left of them.
    expect(climber(inst).y).toBeGreaterThan(friend(inst).y)
    expect(climber(inst).x).toBeLessThan(friend(inst).x)
  })

  it('draws the friend hollow and the climber solid — the same person, twice', () => {
    const { inst } = start()
    const solidCells = (s: Sprite): number =>
      s.rows.join('').split('').filter((ch) => ch !== ' ').length
    expect(solidCells(climber(inst))).toBeGreaterThan(solidCells(friend(inst)))
    expect(climber(inst).rows).toHaveLength(friend(inst).rows.length)
  })

  it('runs left and right, and stops at the edges', () => {
    const { inst } = start()
    const home = climber(inst).x
    press(inst, 'ArrowRight')
    expect(climber(inst).x).toBeGreaterThan(home)
    press(inst, 'ArrowLeft', 40)
    const left = climber(inst).x
    press(inst, 'ArrowLeft', 5)
    expect(climber(inst).x).toBeCloseTo(left, 5)
  })

  it('jumps, and comes back down on its own', () => {
    const { inst } = start()
    const ground = climber(inst).y
    press(inst, ' ')
    ticks(inst, 6)
    expect(climber(inst).y).toBeLessThan(ground)
    ticks(inst, 90)
    expect(climber(inst).y).toBeCloseTo(ground, 5)
  })

  it('will not jump again while already in the air', () => {
    // Two runs, one hammering the jump key all the way through, and they must
    // trace the same arc: a jump you can extend in mid-air is a jump with no
    // timing in it, and the timing is the only thing this game asks for.
    const arc = (hammer: boolean): number[] => {
      const { inst } = start()
      press(inst, ' ')
      const ys: number[] = []
      // Forty frames is the whole arc: the jump lands at about frame 44, and
      // past that a hammered key legitimately starts the NEXT jump.
      for (let i = 0; i < 40; i++) {
        if (hammer) press(inst, ' ')
        ticks(inst, 1)
        ys.push(Math.round(climber(inst).y))
      }
      return ys
    }
    expect(arc(true)).toEqual(arc(false))
  })

  it('steps off a ladder when a child presses left or right', () => {
    // A ladder that swallows two of the four arrows is a ladder that reads as
    // a broken keyboard. Partway up, LEFT puts you back on a girder.
    const { inst } = start()
    const ground = climber(inst).y
    walkTo(inst, FIRST_LADDER)
    press(inst, 'ArrowUp', 2)                 // partway up, not all the way
    expect(climber(inst).y).toBeLessThan(ground)
    press(inst, 'ArrowLeft')
    // Off the ladder and walking again: the next left actually moves them.
    const x1 = climber(inst).x
    press(inst, 'ArrowLeft')
    expect(climber(inst).x).toBeLessThan(x1)
  })

  it('does not throw a child off a ladder for tapping the jump key', () => {
    const { inst } = start()
    walkTo(inst, FIRST_LADDER)
    press(inst, 'ArrowUp', 2)
    const mid = climber(inst).y
    press(inst, ' ', 5)
    expect(climber(inst).y).toBeCloseTo(mid, 5)
  })

  it('climbs a ladder only where there is one, and arrives on the next girder', () => {
    const { inst } = start()
    const ground = climber(inst).y
    // Nowhere near the ladder: up does nothing.
    press(inst, 'ArrowUp', 8)
    expect(climber(inst).y).toBeCloseTo(ground, 5)
    // Walk to the ladder out of the bottom girder and go all the way up it.
    walkTo(inst, FIRST_LADDER)
    press(inst, 'ArrowUp', 8)
    expect(climber(inst).y).toBeLessThan(ground - 20)
  })

  it('sends barrels across the girders and off the bottom', () => {
    const { inst } = start()
    expect(barrels(inst)).toBe(0)
    ticks(inst, 60 * 4)
    expect(barrels(inst)).toBeGreaterThan(0)
    // They leave rather than piling up forever.
    let most = 0
    for (let i = 0; i < 60 * 120; i++) {
      ticks(inst, 1)
      most = Math.max(most, barrels(inst))
      if (rings(inst) > 6) break
    }
    expect(most).toBeLessThan(14)
  })

  /** The two rings a concluded round wears. Barrels are much smaller. */
  const bumpRings = (inst: LiveInstance): number =>
    cmds(inst).filter((c) => c.op === 'circle' && c.r > 10).length

  it('holds the picture when a barrel reaches the climber, and protects the beat', () => {
    const { inst } = start()
    // Stand still on the bottom girder and let the traffic come down.
    for (let i = 0; i < 60 * 200 && bumpRings(inst) === 0; i++) ticks(inst, 1)
    expect(bumpRings(inst)).toBe(2)
    press(inst, 'ArrowRight', 20)
    expect(bumpRings(inst)).toBe(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(bumpRings(inst)).toBe(0)
  })

  it('can actually be finished — a careful climber reaches the friend', () => {
    // The assertion that matters, and the only one here that can fail because
    // the GAME is wrong rather than the code: the way up exists, the ladders
    // line up with the girders, and the barrels are dodgeable. If this cannot
    // get to the top, no six-year-old will.
    //
    // WHICH GIRDER AM I ON: the nearest one AT OR BELOW my feet. A jump only
    // ever lifts the climber, so the girder under them is still theirs the
    // whole time they are in the air — which is the fact an earlier version of
    // this test did not use, and it spent two simulated minutes convinced it
    // was on the floor above.
    const { inst, ctx } = start()
    const bars = girders(inst).filter((r) => r.w > 200).map((r) => r.y)
      .sort((a, b) => b - a)                       // bottom girder first
    const ROUTE = [0.24, 0.76, 0.24]               // the ladder out of each

    for (let i = 0; i < 60 * 400; i++) {
      const me = climber(inst)
      const feet = me.y + me.rows.length * me.scale
      let flr = 0
      for (let f = 0; f < bars.length; f++) if (bars[f]! >= feet - 2) flr = f
      const at = (me.x + 7) / 240

      const near = cmds(inst).some((c) =>
        c.op === 'circle' && c.r < 10
        && Math.abs(c.x - (me.x + 7)) < 24 && Math.abs(c.y - me.y) < 26)
      if (near) press(inst, ' ')

      // Mid-ladder — the feet are between two girders — means keep going up,
      // which is exactly what a child looking at the screen would do.
      const onGirder = bars.some((b) => Math.abs(b - feet) < 2)
      const want = ROUTE[flr]
      if (!onGirder) press(inst, 'ArrowUp')
      else if (want === undefined) press(inst, 'ArrowRight')   // top girder
      else if (Math.abs(at - want) > 0.02) {
        press(inst, at < want ? 'ArrowRight' : 'ArrowLeft')
      } else press(inst, 'ArrowUp')
      ticks(inst, 1)

      // Bumped: start again from the bottom, exactly as a child would. This
      // is what makes it a fair test — the route has to survive the traffic,
      // not merely exist on an empty screen.
      if (cmds(inst).some((c) => c.op === 'circle' && c.r > 10)) {
        ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
        press(inst, ' ')
      }
      if (String(inst.souvenir?.()) === ctx.t('climb.souvenir.home')) break
    }
    expect(inst.souvenir?.()).toBe(ctx.t('climb.souvenir.home'))
  })

  it('is monochrome', () => {
    const { inst } = start()
    ticks(inst, 300)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('climb.souvenir.none'))
    ticks(inst, 600)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same climb on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, climb.size)).toMatchSnapshot()
    expect(pixelsOf(inst, climb.size, 60)).toMatchSnapshot()
  })
})
