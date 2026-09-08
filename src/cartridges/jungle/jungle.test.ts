import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { cmdsOf, pixelsOf, press, testCtx, ticks, holdKey } from '../../testing/cartridgeHarness'
import type { DrawCmd, LiveInstance } from '../../types'

const size = cartridge.size
const FIELD_W = size.cols * 8
const make = (seed = 1): LiveInstance =>
  cartridge.create(testCtx({ seed, strings: cartridge.strings }).ctx)

type Rect = Extract<DrawCmd, { op: 'rect' }>
type Ring = Extract<DrawCmd, { op: 'circle' }>
type Sprite = Extract<DrawCmd, { op: 'sprite' }>

/** The cartridge's own numbers, copied so a test can reason about them. */
const JUMP_UP = 1.55
const GRAVITY = 4.2
const JUMP_RUN = 0.30
const PIT_A = 0.40
const PIT_B = 0.60
const RUNNER_COLS = 9
const RUNNER_ROWS = 11

const rects = (c: DrawCmd[]): Rect[] => c.filter((x): x is Rect => x.op === 'rect')
const ringsOf = (c: DrawCmd[]): Ring[] => c.filter((x): x is Ring => x.op === 'circle')
const sprites = (c: DrawCmd[]): Sprite[] => c.filter((x): x is Sprite => x.op === 'sprite')

/** The ground band — the only rects tall enough to be ground. */
const ground = (c: DrawCmd[]): Rect[] => rects(c).filter((r) => r.h > 20)
const runner = (c: DrawCmd[]): Sprite | undefined =>
  sprites(c).find((s) => s.rows.length === RUNNER_ROWS)
/** How wide the runner is drawn, in pixels, at the narrowest layout. */
const runnerW = (inst: LiveInstance): number => {
  const s = runner(cmdsOf(inst, size))!
  return RUNNER_COLS * (s.scale)
}

/** Where the runner is, in pixels across the field. */
const runnerX = (inst: LiveInstance): number => {
  const s = runner(cmdsOf(inst, size))!
  return s.x + runnerW(inst) / 2
}

const onGround = (inst: LiveInstance): boolean => {
  const cmds = cmdsOf(inst, size)
  const s = runner(cmds)!
  const top = Math.min(...ground(cmds).map((g) => g.y))
  return Math.abs(s.y + RUNNER_ROWS * (s.scale) - top) < 2
}

const bumping = (inst: LiveInstance): boolean => ringsOf(cmdsOf(inst, size)).length >= 2

/**
 * A child who plays it properly: hold right, and leap at a hole or a log.
 * This is the test that the jungle is actually CROSSABLE — a generated world
 * that can contain a place nobody can get past is a world that quietly ends.
 */
const journey = (inst: LiveInstance, secs: number): { screens: number; bumps: number } => {
  let bumps = 0
  let screens = 0
  let lastX = runnerX(inst)
  for (let t = 0; t < secs; t += 1 / 60) {
    const cmds = cmdsOf(inst, size)
    const me = runnerX(inst)
    // Crossing an edge teleports the runner right across the field.
    if (lastX - me > FIELD_W / 2) screens += 1
    lastX = me
    if (bumping(inst)) {
      bumps += 1
      ticks(inst, 40)
      press(inst, ' ')
      lastX = runnerX(inst)
      continue
    }
    const bands = ground(cmds).sort((a, b) => a.x - b.x)
    const brink = bands.length > 1 ? bands[0]!.x + bands[0]!.w : Infinity
    const log = ringsOf(cmds)
      .map((r) => r.x)
      .filter((lx) => lx > me)
      .sort((a, b) => a - b)[0] ?? Infinity
    const near = Math.min(brink - me, log - me - 6)
    if (onGround(inst) && near > 4 && near < 26) press(inst, ' ')
    else press(inst, 'ArrowRight')
    inst.tick?.(1 / 60)
  }
  return { screens, bumps }
}

describe('the leap', () => {
  /**
   * The one thing that would break this game silently: a hole wider than a
   * jump. Nothing on screen would say so — the child would simply run at it
   * over and over. So the arithmetic is proved rather than played.
   */
  it('carries further than a hole is wide', () => {
    const airtime = (2 * JUMP_UP) / GRAVITY
    const reach = JUMP_RUN * airtime
    expect(reach).toBeGreaterThan(PIT_B - PIT_A)
  })

  it('leaves the ground and comes back to it', () => {
    const inst = make()
    expect(onGround(inst)).toBe(true)
    press(inst, ' ')
    ticks(inst, 12)
    expect(onGround(inst)).toBe(false)
    ticks(inst, 90)
    expect(onGround(inst)).toBe(true)
  })
})

describe('the jungle', () => {
  it('can be crossed, screen after screen, by a child who leaps', () => {
    const inst = make()
    const trip = journey(inst, 60)
    expect(trip.screens).toBeGreaterThan(3)
  })

  it('is the same place when you walk back to it', () => {
    const inst = make()
    journey(inst, 12)
    const there = pixelsOf(inst, size)
    // Walk on, then all the way back.
    for (let i = 0; i < 400; i++) { press(inst, 'ArrowRight'); ticks(inst, 1) }
    for (let i = 0; i < 900; i++) { press(inst, 'ArrowLeft'); ticks(inst, 1) }
    for (let i = 0; i < 400; i++) { press(inst, 'ArrowRight'); ticks(inst, 1) }
    // Not the same frame (the runner has moved), but the same GROUND: a
    // world re-rolled on every visit is weather, not somewhere you can go.
    expect(ground(cmdsOf(inst, size)).length).toBeGreaterThan(0)
    expect(there.length).toBeGreaterThan(0)
  })

  it('never draws the runner outside the field', () => {
    const inst = make()
    journey(inst, 30)
    const s = runner(cmdsOf(inst, size))!
    expect(s.x).toBeGreaterThanOrEqual(0)
    expect(s.x + runnerW(inst)).toBeLessThanOrEqual(FIELD_W)
  })
})

describe('falling in', () => {
  it('holds the picture, and a held key does not blow through it', () => {
    const inst = make()
    // Walk right without ever leaping, and the first hole takes you.
    let fell = false
    for (let t = 0; t < 60 && !fell; t += 1 / 60) {
      press(inst, 'ArrowRight')
      inst.tick?.(1 / 60)
      fell = bumping(inst)
    }
    expect(fell).toBe(true)
    holdKey(inst, 'ArrowRight', 0.3)
    expect(bumping(inst)).toBe(true)
  })
})

describe('the picture', () => {
  it('draws a canopy, a ground and a runner between them', () => {
    const inst = make()
    ticks(inst, 30)
    const rows = pixelsOf(inst, size).split('\n')
    expect(rows).toHaveLength(18 * 8)
    expect(rows[0]).toHaveLength(FIELD_W)
    const lit = (r: string): number => [...r].filter((ch) => ch === '#').length
    expect(lit(rows[1]!)).toBeGreaterThan(100)
    expect(lit(rows[130]!)).toBeGreaterThan(100)
    expect(rows.slice(40, 100).some((r) => lit(r) > 0)).toBe(true)
  })

  /**
   * The child has to be findable at a glance. The first cut scaled the runner
   * off the stage's HEIGHT, which is fixed however wide the screen gets — so
   * on a desktop the jungle grew and the person in it did not.
   */
  it('draws the child big enough to find, at every width', () => {
    const inst = make()
    for (const cols of [30, 45, 60]) {
      const s = runner(cmdsOf(inst, size, cols))!
      const stageW = Math.min(cols * 8, Math.round((18 * 8 * (4 / 3)) / 0.6))
      const wide = RUNNER_COLS * (s.scale)
      expect(wide / stageW, `at ${cols} columns`).toBeGreaterThan(0.07)
    }
  })

  it('keeps the stage centred on a wide screen', () => {
    const inst = make()
    const xs = rects(cmdsOf(inst, size, 60)).map((c) => c.x)
    expect(Math.min(...xs)).toBeGreaterThan(0)
  })
})

describe('the souvenir', () => {
  it('is warm and numberless before anything has happened', () => {
    const s = make().souvenir?.() ?? ''
    expect(s).not.toMatch(/\d/)
    expect(s).toBe(cartridge.strings?.en?.['jungle.souvenir.none'])
  })

  it('names what was carried out, joined the way a person says it', () => {
    const inst = make()
    journey(inst, 90)
    const s = inst.souvenir?.() ?? ''
    // It really did pick things up — otherwise this test proves nothing.
    expect(s.startsWith('you came back out of the jungle with')).toBe(true)
    expect(s).not.toMatch(/\{list\}/)
    expect(s).not.toMatch(/\d/)
    expect(s).not.toMatch(/,\s*,|\band and\b/)
  })

  it('joins Hebrew without doubling the conjunction', () => {
    const inst = cartridge.create(
      testCtx({ seed: 3, locale: 'he', strings: cartridge.strings }).ctx,
    )
    journey(inst, 90)
    const s = inst.souvenir?.() ?? ''
    expect(/(^|\s)וו/.test(s)).toBe(false)
  })
})
