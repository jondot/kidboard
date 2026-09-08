import { describe, it, expect } from 'vitest'
import asteroids from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: asteroids.strings })
  return { ...h, inst: asteroids.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, asteroids.size, cols)
const lines = (inst: LiveInstance): Extract<DrawCmd, { op: 'line' }>[] =>
  cmds(inst).filter((c) => c.op === 'line') as Extract<DrawCmd, { op: 'line' }>[]
const bolts = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'disc').length
const rings = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'circle').length

/**
 * A polygon is drawn once per visible wrap offset, so counting strokes is not
 * counting rocks. Distinct STARTING POINTS of the closed loops is: every
 * polygon's first stroke starts somewhere no other stroke starts.
 */
const shapes = (inst: LiveInstance): number => {
  const seen = new Set<string>()
  const ls = lines(inst)
  // The ship is four strokes; a rock is eight. Both close, so a shape's
  // stroke count divides its own loop — count loops by walking them.
  let i = 0
  while (i < ls.length) {
    const first = ls[i]!
    let n = 1
    while (i + n < ls.length && !(ls[i + n]!.x2 === first.x && ls[i + n]!.y2 === first.y)) n++
    seen.add(`${first.x},${first.y},${i}`)
    i += n + 1
  }
  return seen.size
}

describe('asteroids', () => {
  it('draws everything in strokes, the way a vector monitor did', () => {
    const { inst } = start()
    // No fills at all until something is fired: rocks and ship are outlines.
    expect(lines(inst).length).toBeGreaterThan(0)
    expect(cmds(inst).some((c) => c.op === 'rect')).toBe(false)
    expect(bolts(inst)).toBe(0)
  })

  it('opens with rocks that are not already touching the ship', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { inst } = start(seed)
      // A field that opens with a hit is a field you lost before you looked.
      expect(rings(inst), `seed ${seed}`).toBe(0)
    }
  })

  it('turns the ship without moving it', () => {
    const { inst } = start()
    const before = JSON.stringify(lines(inst))
    press(inst, 'ArrowLeft')
    ticks(inst, 1)
    expect(JSON.stringify(lines(inst))).not.toBe(before)
  })

  it('coasts to a stop rather than drifting forever', () => {
    const { inst } = start()
    press(inst, 'ArrowUp')
    ticks(inst, 12)
    const moving = shapes(inst)
    expect(moving).toBeGreaterThan(0)
    // Two seconds after the last thrust the ship must be still: the drag is
    // the whole of the "for a six-year-old" change.
    ticks(inst, 120)
    const a = JSON.stringify(lines(inst))
    ticks(inst, 30)
    // Rocks keep moving, so compare only the ship's own strokes: they are the
    // last four in the buffer, drawn after every rock.
    const shipOf = (s: string): string => JSON.parse(s).slice(-4).map(
      (l: { x: number; y: number }) => `${Math.round(l.x)},${Math.round(l.y)}`).join()
    expect(shipOf(JSON.stringify(lines(inst)))).toBe(shipOf(a))
  })

  it('fires a bolt, and no more than a handful at once', () => {
    const { inst } = start()
    press(inst, ' ')
    expect(bolts(inst)).toBe(1)
    press(inst, ' ', 20)
    expect(bolts(inst)).toBeLessThanOrEqual(5)
  })

  it('lets a bolt expire rather than circling forever', () => {
    const { inst } = start()
    press(inst, ' ')
    expect(bolts(inst)).toBe(1)
    ticks(inst, 120)
    expect(bolts(inst)).toBe(0)
  })

  it('splits a big rock into two smaller ones', () => {
    const { inst } = start()
    const before = shapes(inst)
    // Turn and fire until something breaks. The field is small and the bolts
    // wrap, so this finds a rock quickly.
    let split = false
    for (let i = 0; i < 400 && !split; i++) {
      press(inst, ' ')
      press(inst, 'ArrowRight')
      ticks(inst, 6)
      if (/smaller/.test(String(inst.souvenir?.()))) split = true
    }
    expect(split).toBe(true)
    expect(shapes(inst)).toBeGreaterThanOrEqual(before)
  })

  it('turns fast enough to be a turn rather than a wait', () => {
    // Aiming is the whole verb. A child who has seen the rock they want and
    // pressed the key should be pointing at it now — a full turn in half a
    // second, not in a second and a quarter.
    const { inst } = start()
    const nose = (): { x: number; y: number } => {
      const ls = lines(inst)
      const ship = ls.slice(-4)
      return { x: ship[0]!.x, y: ship[0]!.y }
    }
    const a = nose()
    // A quarter of a second of holding left.
    for (let i = 0; i < 15; i++) { press(inst, 'ArrowLeft'); ticks(inst, 1) }
    const b = nose()
    // A quarter turn or more has moved the nose a long way round the hull.
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(10)
  })

  it('holds the picture when a rock reaches the ship, and protects the beat', () => {
    const { inst } = start(7)
    for (let i = 0; i < 60 * 400 && rings(inst) === 0; i++) ticks(inst, 1)
    expect(rings(inst)).toBe(2)
    press(inst, ' ', 20)
    expect(rings(inst)).toBe(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(rings(inst)).toBe(0)
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, ' ')
    ticks(inst, 60)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('asteroids.souvenir.none'))
    press(inst, ' ')
    ticks(inst, 600)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same field on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, asteroids.size)).toMatchSnapshot()
    expect(pixelsOf(inst, asteroids.size, 60)).toMatchSnapshot()
  })
})
