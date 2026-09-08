import { describe, it, expect } from 'vitest'
import invaders from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: invaders.strings })
  return { ...h, inst: invaders.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, invaders.size, cols)
type Sprite = Extract<DrawCmd, { op: 'sprite' }>
const sprites = (inst: LiveInstance): Sprite[] =>
  cmds(inst).filter((c) => c.op === 'sprite') as Sprite[]
/** The ship is drawn last, after every living invader. */
const ship = (inst: LiveInstance): Sprite => sprites(inst)[sprites(inst).length - 1]!
const army = (inst: LiveInstance): Sprite[] => sprites(inst).slice(0, -1)
const bolt = (inst: LiveInstance): DrawCmd | undefined =>
  // Two rects are always drawn: the line they march towards, then a bolt.
  cmds(inst).filter((c) => c.op === 'rect')[1]

/** Runs the clock until the formation has taken `n` steps. */
const steps = (inst: LiveInstance, n: number): void => {
  let seen = 0
  let was = JSON.stringify(army(inst).map((s) => [s.x, s.y]))
  for (let i = 0; i < 60 * 60 && seen < n; i++) {
    ticks(inst, 1)
    const now = JSON.stringify(army(inst).map((s) => [s.x, s.y]))
    if (now !== was) { seen++; was = now }
  }
}

describe('invaders', () => {
  it('opens with a full formation and one ship', () => {
    const { inst } = start()
    expect(sprites(inst)).toHaveLength(3 * 6 + 1)
  })

  it('steps sideways rather than sliding', () => {
    const { inst } = start()
    const before = army(inst).map((s) => s.x)
    // Between steps the formation does not move at all — that stillness is
    // most of what makes the step land.
    ticks(inst, 3)
    expect(army(inst).map((s) => s.x)).toEqual(before)
    steps(inst, 1)
    expect(army(inst).map((s) => s.x)).not.toEqual(before)
  })

  it('changes shape on every step, so the march and the animation are one', () => {
    const { inst } = start()
    const a = JSON.stringify(army(inst)[0]!.rows)
    steps(inst, 1)
    const b = JSON.stringify(army(inst)[0]!.rows)
    expect(b).not.toBe(a)
    steps(inst, 1)
    expect(JSON.stringify(army(inst)[0]!.rows)).toBe(a)
  })

  it('turns round and drops when it reaches an edge', () => {
    const { inst } = start()
    const top = army(inst)[0]!.y
    // Long enough to have hit a wall at least once.
    steps(inst, 30)
    expect(army(inst)[0]!.y).toBeGreaterThan(top)
  })

  it('keeps the whole formation inside the court', () => {
    // Forty steps is several full traverses at the opening speed, which is
    // every turn the formation makes before it lands.
    const { inst } = start()
    for (let i = 0; i < 40; i++) {
      steps(inst, 1)
      if (army(inst).length === 0) break
      for (const s of army(inst)) expect(s.x).toBeGreaterThanOrEqual(0)
    }
  })

  it('steers the ship and keeps it in the court', () => {
    const { inst } = start()
    const home = ship(inst).x
    press(inst, 'ArrowLeft')
    expect(ship(inst).x).toBeLessThan(home)
    press(inst, 'ArrowLeft', 40)
    const left = ship(inst).x
    press(inst, 'ArrowLeft', 5)
    expect(ship(inst).x).toBeCloseTo(left, 5)
    press(inst, 'ArrowRight', 80)
    const right = ship(inst).x
    press(inst, 'ArrowRight', 5)
    expect(ship(inst).x).toBeCloseTo(right, 5)
  })

  it('fires one bolt at a time', () => {
    const { inst } = start()
    expect(bolt(inst)).toBeUndefined()
    press(inst, ' ')
    expect(bolt(inst)).toBeDefined()
    const first = JSON.stringify(bolt(inst))
    press(inst, ' ')
    expect(JSON.stringify(bolt(inst))).toBe(first)
  })

  it('takes an invader out of the formation when a bolt reaches it', () => {
    const { inst } = start()
    const before = army(inst).length
    // Line the ship up under the file the bolt will reach, then keep firing.
    for (let shot = 0; shot < 60 && army(inst).length === before; shot++) {
      press(inst, ' ')
      ticks(inst, 60)
    }
    expect(army(inst).length).toBeLessThan(before)
  })

  it('marches faster the emptier it gets', () => {
    const { inst } = start()
    const time = (): number => {
      const was = JSON.stringify(army(inst).map((s) => [s.x, s.y]))
      let t = 0
      for (; t < 60 * 5; t++) {
        ticks(inst, 1)
        if (JSON.stringify(army(inst).map((s) => [s.x, s.y])) !== was) break
      }
      return t
    }
    const full = time()
    for (let shot = 0; shot < 40 && army(inst).length > 8; shot++) {
      press(inst, ' ')
      ticks(inst, 60)
    }
    expect(time()).toBeLessThan(full)
  })

  it('holds the picture when the formation lands, and protects the beat', () => {
    const { inst } = start()
    for (let i = 0; i < 60 * 120 && cmds(inst).every((c) => c.op !== 'circle'); i++) {
      ticks(inst, 1)
    }
    const done = cmds(inst).filter((c) => c.op === 'circle')
    expect(done).toHaveLength(2)
    press(inst, 'ArrowLeft', 20)
    expect(cmds(inst).filter((c) => c.op === 'circle')).toHaveLength(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(cmds(inst).filter((c) => c.op === 'circle')).toHaveLength(0)
    expect(sprites(inst)).toHaveLength(3 * 6 + 1)
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
    expect(inst.souvenir?.()).toBe(ctx.t('invaders.souvenir.none'))
    press(inst, ' ')
    ticks(inst, 300)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same formation on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, invaders.size)).toMatchSnapshot()
    expect(pixelsOf(inst, invaders.size, 60)).toMatchSnapshot()
  })
})
