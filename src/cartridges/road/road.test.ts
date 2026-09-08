import { describe, it, expect } from 'vitest'
import road from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: road.strings })
  return { ...h, inst: road.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, road.size, cols)
const posts = (inst: LiveInstance): Extract<DrawCmd, { op: 'rect' }>[] =>
  cmds(inst).filter((c) => c.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>[]
const car = (inst: LiveInstance): Extract<DrawCmd, { op: 'sprite' }> =>
  cmds(inst).find((c) => c.op === 'sprite') as Extract<DrawCmd, { op: 'sprite' }>
const rings = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'circle').length

describe('road', () => {
  it('is nothing but posts and a car — there is no road drawn at all', () => {
    const { inst } = start()
    expect(posts(inst).length).toBeGreaterThan(10)
    expect(cmds(inst).filter((c) => c.op === 'sprite')).toHaveLength(1)
    expect(cmds(inst).some((c) => c.op === 'line' || c.op === 'outline')).toBe(false)
  })

  it('draws posts smaller and closer together the further away they are', () => {
    const { inst } = start()
    const byY = [...posts(inst)].sort((a, b) => a.y - b.y)
    const far = byY[0]!
    const near = byY[byY.length - 1]!
    // Nearer means lower on the screen, bigger, and further from the middle.
    expect(near.h).toBeGreaterThan(far.h)
    expect(near.w).toBeGreaterThan(far.w)
  })

  it('brings the posts towards the car', () => {
    const { inst } = start()
    // The NEAREST post, over ONE frame. Any longer and the nearest post has
    // arrived and been sent back to the horizon, which is the whole point of
    // the wrap and would read here as the posts going backwards.
    const nearest = (): number => Math.max(...posts(inst).map((p) => p.y))
    const a = nearest()
    ticks(inst, 1)
    expect(nearest()).toBeGreaterThan(a)
  })

  it('never runs out of posts, however long you drive', () => {
    const { inst } = start()
    for (let i = 0; i < 60; i++) {
      ticks(inst, 30)
      if (rings(inst) > 0) { press(inst, ' '); ticks(inst, 40); press(inst, ' ') }
      expect(posts(inst).length).toBeGreaterThan(8)
    }
  })

  it('steers, and keeps the car on the screen', () => {
    const { inst } = start()
    const home = car(inst).x
    press(inst, 'ArrowLeft')
    expect(car(inst).x).toBeLessThan(home)
    press(inst, 'ArrowLeft', 60)
    const left = car(inst).x
    press(inst, 'ArrowLeft', 5)
    expect(car(inst).x).toBeCloseTo(left, 5)
    press(inst, 'ArrowRight', 120)
    const right = car(inst).x
    press(inst, 'ArrowRight', 5)
    expect(car(inst).x).toBeCloseTo(right, 5)
  })

  it('stops when the car leaves the posts, and holds the picture', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 40)
    ticks(inst, 5)
    expect(rings(inst)).toBe(2)
    // The beat is protected from a finger still on the key.
    press(inst, 'ArrowRight', 20)
    expect(rings(inst)).toBe(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(rings(inst)).toBe(0)
  })

  it('puts the car back in the middle of the road, not where it left it', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 40)
    ticks(inst, 5)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    // Back on the road: driving on must not immediately end again.
    ticks(inst, 30)
    expect(rings(inst)).toBe(0)
  })

  it('bends the road as you drive, rather than running dead straight', () => {
    const { inst } = start()
    const middle = (): number => {
      // The nearest pair of posts brackets the road at the bumper.
      const byY = [...posts(inst)].sort((a, b) => b.y - a.y).slice(0, 2)
      return (byY[0]!.x + byY[1]!.x) / 2
    }
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) {
      ticks(inst, 10)
      if (rings(inst) > 0) break
      seen.add(Math.round(middle()))
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  it('is monochrome', () => {
    const { inst } = start()
    ticks(inst, 120)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, driven or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('road.souvenir.none'))
    ticks(inst, 600)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same road on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, road.size)).toMatchSnapshot()
    expect(pixelsOf(inst, road.size, 60)).toMatchSnapshot()
  })
})
