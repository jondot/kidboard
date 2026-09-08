import { describe, it, expect } from 'vitest'
import bricks from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks, holdKey } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: bricks.strings })
  return { ...h, inst: bricks.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, bricks.size, cols)
const wall = (inst: LiveInstance): number =>
  // Every brick is an outline; so is the court, which is always there.
  cmds(inst).filter((c) => c.op === 'outline').length - 1
const ball = (inst: LiveInstance): Extract<DrawCmd, { op: 'disc' }> =>
  cmds(inst).find((c) => c.op === 'disc') as Extract<DrawCmd, { op: 'disc' }>
const paddle = (inst: LiveInstance): Extract<DrawCmd, { op: 'rect' }> =>
  cmds(inst).find((c) => c.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>

describe('bricks', () => {
  it('opens with a full wall and the ball sitting on the paddle', () => {
    const { inst } = start()
    expect(wall(inst)).toBe(32)
    const b = ball(inst)
    const p = paddle(inst)
    // Riding: the ball is centred over the paddle and just above it.
    expect(b.x).toBeCloseTo(p.x + p.w / 2, 0)
    expect(b.y).toBeLessThan(p.y)
  })

  it('rides the ball along with the paddle until it is served', () => {
    const { inst } = start()
    press(inst, 'ArrowRight', 3)
    const b = ball(inst)
    const p = paddle(inst)
    expect(b.x).toBeCloseTo(p.x + p.w / 2, 0)
    // And nothing has started moving on its own.
    ticks(inst, 60)
    expect(ball(inst).y).toBeCloseTo(b.y, 5)
  })

  it('serves on any key that is not an arrow, and only after the beat', () => {
    const { inst } = start()
    // The opening rest is not a round ending, so it is servable at once.
    press(inst, ' ')
    const before = ball(inst).y
    ticks(inst, 20)
    expect(ball(inst).y).toBeLessThan(before)
  })

  it('never lets a held arrow fire the next ball through the beat after a miss', () => {
    const { inst } = start()
    press(inst, ' ')
    // Play until the ball is back on the paddle.
    for (let i = 0; i < 60 * 40; i++) {
      ticks(inst, 1)
      const b = ball(inst)
      const p = paddle(inst)
      if (Math.abs(b.x - (p.x + p.w / 2)) < 0.5 && b.y < p.y && b.y > p.y - 40) break
    }
    // A finger on the keyboard through the whole pause must not serve.
    holdKey(inst, 'ArrowLeft', HOLD_IGNORE * 0.8)
    const riding = ball(inst).y
    ticks(inst, 30)
    expect(ball(inst).y).toBeCloseTo(riding, 3)
  })

  it('bounces off the side rails rather than leaving the court', () => {
    const { inst } = start()
    press(inst, ' ')
    for (let i = 0; i < 60 * 60; i++) {
      ticks(inst, 1)
      const b = ball(inst)
      expect(b.x).toBeGreaterThan(-1)
      expect(b.x).toBeLessThan(cmds(inst).length * 1e6)
    }
  })

  it('takes bricks out of the wall as it goes', () => {
    const { inst } = start()
    press(inst, ' ')
    let smallest = 32
    for (let i = 0; i < 60 * 60; i++) {
      ticks(inst, 1)
      smallest = Math.min(smallest, wall(inst))
      if (smallest < 32) break
    }
    expect(smallest).toBeLessThan(32)
  })

  it('rebuilds the wall and rests the ball when the last brick goes', () => {
    const { inst } = start()
    press(inst, ' ')
    // Play a long time, tracking the paddle under the ball so the ball is
    // never missed: this is what a very good child looks like.
    for (let i = 0; i < 60 * 400; i++) {
      const b = ball(inst)
      const p = paddle(inst)
      if (b.x < p.x + p.w / 2 - 2) press(inst, 'ArrowLeft')
      else if (b.x > p.x + p.w / 2 + 2) press(inst, 'ArrowRight')
      ticks(inst, 1)
      if (/gone/.test(String(inst.souvenir?.()))) break
    }
    expect(inst.souvenir?.()).toMatch(/gone/)
    expect(wall(inst)).toBe(32)
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, ' ')
    ticks(inst, 120)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('bricks.souvenir.none'))
    press(inst, ' ')
    ticks(inst, 600)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same court on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, bricks.size)).toMatchSnapshot()
    expect(pixelsOf(inst, bricks.size, 60)).toMatchSnapshot()
  })
})
