import { describe, it, expect } from 'vitest'
import rocket from './cartridge'
import { POINTS, PAD_POINTS, groundAt, makeGround, onPad } from './terrain'
import { makeRng } from '../../runtime/rng'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: rocket.strings })
  return { ...h, inst: rocket.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, rocket.size, cols)
type Sprite = Extract<DrawCmd, { op: 'sprite' }>
const sprites = (inst: LiveInstance): Sprite[] =>
  cmds(inst).filter((c) => c.op === 'sprite') as Sprite[]
/** The ship is drawn last, after the flame. */
const ship = (inst: LiveInstance): Sprite => sprites(inst)[sprites(inst).length - 1]!
const flame = (inst: LiveInstance): boolean => sprites(inst).length === 2
const rings = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'circle').length
/** The gauge's ink column: the last rect drawn before the sprites. */
const fuelBar = (inst: LiveInstance): Extract<DrawCmd, { op: 'rect' }> => {
  const rs = cmds(inst).filter((c) => c.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>[]
  return rs[rs.length - 1]!
}

describe('the ground', () => {
  it('always has exactly one flat run, and it is never at an edge', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = makeGround(makeRng(seed))
      expect(g.h).toHaveLength(POINTS)
      expect(g.pad, `seed ${seed}`).toBeGreaterThanOrEqual(2)
      expect(g.pad + PAD_POINTS, `seed ${seed}`).toBeLessThanOrEqual(POINTS - 2)
      // The pad's points are level with each other, and nothing else is.
      const level = g.h[g.pad]!
      for (let i = g.pad; i < g.pad + PAD_POINTS; i++) {
        expect(g.h[i], `seed ${seed} point ${i}`).toBeCloseTo(level, 10)
      }
    }
  })

  it('reads a height under any x, and knows what is over the pad', () => {
    const g = makeGround(makeRng(3))
    const step = 1 / (POINTS - 1)
    expect(groundAt(g, 0)).toBeCloseTo(g.h[0]!, 10)
    expect(groundAt(g, 1)).toBeCloseTo(g.h[POINTS - 1]!, 10)
    // Halfway between two points is halfway between two heights.
    expect(groundAt(g, step / 2)).toBeCloseTo((g.h[0]! + g.h[1]!) / 2, 10)
    expect(onPad(g, (g.pad + 1) * step)).toBe(true)
    expect(onPad(g, 0)).toBe(false)
  })
})

describe('lander', () => {
  it('starts the ship in the sky, not on the ground', () => {
    const { inst } = start()
    const g = makeGround(makeRng(1))
    expect(ship(inst).y).toBeLessThan(groundAt(g, 0.5) * 144)
    expect(rings(inst)).toBe(0)
  })

  it('falls on its own — gravity is the thing you are arguing with', () => {
    const { inst } = start()
    const a = ship(inst).y
    ticks(inst, 20)
    expect(ship(inst).y).toBeGreaterThan(a)
  })

  it('thrusts up against gravity, and shows a flame while it does', () => {
    const { inst } = start()
    expect(flame(inst)).toBe(false)
    ticks(inst, 30)
    const falling = ship(inst).y
    for (let i = 0; i < 40; i++) { press(inst, 'ArrowUp'); ticks(inst, 1) }
    expect(flame(inst)).toBe(true)
    // Rising, or at least no longer falling as fast as it was.
    const climbing = ship(inst).y
    ticks(inst, 20)
    expect(ship(inst).y - climbing).toBeLessThan(climbing - falling)
  })

  it('thrusts sideways with left and right', () => {
    const { inst } = start()
    const home = ship(inst).x
    for (let i = 0; i < 30; i++) { press(inst, 'ArrowRight'); ticks(inst, 1) }
    expect(ship(inst).x).toBeGreaterThan(home)
  })

  it('empties the fuel bar while an engine is lit, and not otherwise', () => {
    const { inst } = start()
    const full = fuelBar(inst).h
    ticks(inst, 120)
    expect(fuelBar(inst).h).toBeCloseTo(full, 5)
    for (let i = 0; i < 120; i++) { press(inst, 'ArrowUp'); ticks(inst, 1) }
    expect(fuelBar(inst).h).toBeLessThan(full)
  })

  it('stops lighting the engine when the tank is empty', () => {
    const { inst } = start()
    for (let i = 0; i < 60 * 20; i++) { press(inst, 'ArrowUp'); ticks(inst, 1); if (rings(inst)) break }
    if (rings(inst) === 0) {
      expect(fuelBar(inst).h).toBeLessThan(1)
      expect(flame(inst)).toBe(false)
    }
  })

  it('keeps the ship between the walls rather than wrapping it round', () => {
    const { inst } = start()
    for (let i = 0; i < 60 * 6; i++) { press(inst, 'ArrowLeft'); ticks(inst, 1); if (rings(inst)) break }
    expect(ship(inst).x).toBeGreaterThan(-1)
  })

  it('lands gently on the pad, and says so', () => {
    // A child who is being careful, written down: steer towards the flat bit,
    // damp the drift as you get over it, and feather the descent so the ship
    // never picks up speed. If this cannot land the thing, no six-year-old
    // ever will — which is the actual assertion.
    const { inst, ctx } = start(5)
    const g = makeGround(makeRng(5))
    const target = (g.pad + (PAD_POINTS - 1) / 2) / (POINTS - 1)
    let prevX = ship(inst).x
    let prevY = ship(inst).y
    for (let i = 0; i < 60 * 90 && rings(inst) === 0; i++) {
      const s = ship(inst)
      const vxPx = s.x - prevX
      const vyPx = s.y - prevY
      prevX = s.x
      prevY = s.y
      const at = (s.x + 9) / 240
      const dx = target - at
      if (Math.abs(dx) > 0.02) {
        if (dx > 0 && vxPx < 0.35) press(inst, 'ArrowRight')
        if (dx < 0 && vxPx > -0.35) press(inst, 'ArrowLeft')
      } else {
        if (vxPx > 0.1) press(inst, 'ArrowLeft')
        if (vxPx < -0.1) press(inst, 'ArrowRight')
      }
      if (vyPx > 0.35) press(inst, 'ArrowUp')
      ticks(inst, 1)
    }
    expect(rings(inst)).toBe(2)
    expect(inst.souvenir?.()).toBe(ctx.t('rocket.souvenir.landed'))
  })

  it('bumps when it comes down too fast, and does not call it a landing', () => {
    const { inst, ctx } = start(5)
    for (let i = 0; i < 60 * 60 && rings(inst) === 0; i++) ticks(inst, 1)
    expect(rings(inst)).toBe(2)
    expect(inst.souvenir?.()).not.toBe(ctx.t('rocket.souvenir.landed'))
  })

  it('holds the picture after a touchdown, and protects the beat', () => {
    const { inst } = start(5)
    for (let i = 0; i < 60 * 60 && rings(inst) === 0; i++) ticks(inst, 1)
    expect(rings(inst)).toBe(2)
    press(inst, 'ArrowUp', 20)
    expect(rings(inst)).toBe(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, 'ArrowUp')
    expect(rings(inst)).toBe(0)
  })

  it('lays fresh ground for the next go', () => {
    const { inst } = start(5)
    const opening = JSON.stringify(cmds(inst).filter((c) => c.op === 'line'))
    for (let i = 0; i < 60 * 60 && rings(inst) === 0; i++) ticks(inst, 1)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(JSON.stringify(cmds(inst).filter((c) => c.op === 'line'))).not.toBe(opening)
  })

  it('never reshuffles the sky under a child who is looking at it', () => {
    const { inst } = start()
    const stars = (): string => JSON.stringify(
      cmds(inst).filter((c) => c.op === 'rect' && c.w === 1 && c.h === 1))
    const a = stars()
    cmds(inst); cmds(inst)
    expect(stars()).toBe(a)
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, 'ArrowUp')
    ticks(inst, 60)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, flown or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('rocket.souvenir.none'))
    press(inst, 'ArrowUp')
    ticks(inst, 300)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same landing on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, rocket.size)).toMatchSnapshot()
    expect(pixelsOf(inst, rocket.size, 60)).toMatchSnapshot()
  })
})
