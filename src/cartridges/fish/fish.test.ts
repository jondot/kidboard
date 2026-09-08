import { describe, it, expect } from 'vitest'
import aquarium, { FISH, SWIMMERS } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(aquarium.size)

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: aquarium.strings })
  return { ...h, inst: aquarium.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, aquarium.size, cols)

type Sprite = Extract<DrawCmd, { op: 'sprite' }>
type Rect = Extract<DrawCmd, { op: 'rect' }>

/**
 * The tank is a pixel field now, so every question this spec used to ask of a
 * character grid it asks of the command buffer instead — which is FINER, not
 * coarser: it knows where a fish is to the pixel, and it can see the eye.
 *
 * The drawing order is fixed and documented in `draw`: glass, gravel, weeds,
 * bubbles, the shoal, food, and the feeder LAST.
 */
const spritesOf = (c: DrawCmd[]): Sprite[] => c.filter((x) => x.op === 'sprite') as Sprite[]
/** The canvas copies a sprite's rows, so a fish is known by its bitmap. */
const isFish = (s: Sprite): boolean =>
  s.rows.length === FISH.length && s.rows[0] === FISH[0]
const fishOf = (c: DrawCmd[]): Sprite[] => spritesOf(c).filter(isFish)
/** The feeder is the last sprite drawn, always. */
const feederOf = (c: DrawCmd[]): Sprite => spritesOf(c)[spritesOf(c).length - 1]!
const glassOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'outline') as Extract<DrawCmd, { op: 'outline' }> | undefined
/** A crumb is the only 3 x 2 rectangle on the field; the gravel is the wide one. */
const crumbsOf = (c: DrawCmd[]): Rect[] =>
  (c.filter((x) => x.op === 'rect') as Rect[]).filter((r) => r.w === 3 && r.h === 2)
const bubblesOf = (c: DrawCmd[]) =>
  c.filter((x) => x.op === 'circle') as Extract<DrawCmd, { op: 'circle' }>[]

const fish = (inst: LiveInstance, cols?: number): Sprite[] => fishOf(cmds(inst, cols))
const crumbs = (inst: LiveInstance, cols?: number): Rect[] => crumbsOf(cmds(inst, cols))
const feederX = (inst: LiveInstance, cols?: number): number => feederOf(cmds(inst, cols)).x

/** Asserts that EVERY drawing command lands inside the pixel field. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(aquarium.size, cols)
  const pw = g.w * PX_PER_CELL
  const ph = g.h * PX_PER_CELL
  for (const cmd of cmds(inst, cols)) {
    if (cmd.op === 'clear') continue
    let x0 = cmd.x
    let y0 = cmd.y
    let x1 = cmd.x
    let y1 = cmd.y
    if (cmd.op === 'rect' || cmd.op === 'outline') { x1 = cmd.x + cmd.w; y1 = cmd.y + cmd.h }
    if (cmd.op === 'disc' || cmd.op === 'circle') {
      x0 = cmd.x - cmd.r; x1 = cmd.x + cmd.r
      y0 = cmd.y - cmd.r * PIXEL_ASPECT; y1 = cmd.y + cmd.r * PIXEL_ASPECT
    }
    if (cmd.op === 'sprite') {
      x1 = cmd.x + Math.max(...cmd.rows.map((r) => r.length)) * cmd.scale
      y1 = cmd.y + cmd.rows.length * cmd.scale
    }
    expect(x0, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(y0, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

describe('fish', () => {
  it('declares a live cartridge in both locales', () => {
    expect(aquarium.kind).toBe('live')
    expect(aquarium.apiVersion).toBe(1)
    expect(aquarium.locales).toEqual(['en', 'he'])
    expect(aquarium.size.cols).toBeGreaterThan(0)
    expect(aquarium.size.aspect).toBeGreaterThan(0)
  })

  it('leaves the plain nouns to the animals cartridge', () => {
    // `animals` owns "fish", "דג" and 🐟 — a duplicate trigger fails the
    // build, so the tank answers to its own words.
    expect(aquarium.triggers.en).not.toContain('fish')
    expect(aquarium.triggers.he).not.toContain('דג')
    expect(aquarium.triggers.emoji).not.toContain('🐟')
  })

  it('draws a glass tank with fish already swimming in it', () => {
    const { inst } = start()
    const c = cmds(inst)
    const glass = glassOf(c)
    expect(glass, 'no glass').toBeDefined()
    expect(glass!.t).toBeGreaterThanOrEqual(3)     // never a hairline
    expect(fishOf(c).length).toBeGreaterThan(2)
    expect(bubblesOf(c).length).toBeGreaterThan(0)
    // The gravel: one wide solid bar along the bottom, inside the glass.
    const gravel = (c.filter((x) => x.op === 'rect') as Rect[])
      .find((r) => r.w > glass!.w / 2)
    expect(gravel, 'no gravel bed').toBeDefined()
    expect(gravel!.y + gravel!.h).toBeLessThanOrEqual(glass!.y + glass!.h)
    assertInside(inst)
  })

  it('draws the tank in ONE ink, and with no characters at all', () => {
    const { inst } = start(4)
    ticks(inst, 120)
    press(inst, 'ArrowUp')
    for (const cmd of cmds(inst)) {
      if (cmd.op === 'clear') continue
      expect(cmd.op, 'a character op on a pixel field')
        .not.toBe('text')
      expect(cmd.op).not.toBe('put')
      expect(cmd.op).not.toBe('emoji')
      expect('tone' in cmd ? cmd.tone : 'plain', `${cmd.op} used a second tone`)
        .toBe('plain')
    }
  })

  it('is a FIELD, not a slot: the tank pillarboxes on a wide screen', () => {
    const { inst } = start()
    const narrow = glassOf(cmds(inst))!
    expect(seen(narrow.w, narrow.h)).toBeLessThanOrEqual(4 / 3 + 0.02)
    const wide = glassOf(cmds(inst, 64))!
    expect(wide.w, 'a wider screen gave no more tank').toBeGreaterThan(narrow.w)
    expect(seen(wide.w, wide.h), 'the tank became a horizon')
      .toBeLessThanOrEqual(4 / 3 + 0.02)
    // Centred, with the theme's own ground either side.
    expect(wide.x).toBeGreaterThan(0)
    expect(wide.x * 2 + wide.w).toBeCloseTo(64 * PX_PER_CELL, 0)
  })

  it('gives a wider tank more fish', () => {
    const { inst } = start()
    const narrow = fish(inst).length
    fish(inst, 64)                          // re-fit to the wide stage
    expect(fish(inst, 64).length).toBeGreaterThan(narrow)
    assertInside(inst, 64)
  })

  it('draws a near fish bigger than a far one', () => {
    // Depth in one ink is SIZE, never a second tone. Both are in the tank.
    const scales = new Set(SWIMMERS.map((s) => s.scale))
    expect(scales.size).toBeGreaterThan(1)
    const { inst } = start(2)
    const seenScales = new Set(fish(inst).map((f) => f.scale))
    expect(seenScales.size, 'every fish was the same size').toBeGreaterThan(1)
  })

  it('moves the feeder screen-left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const before = feederX(inst)
      press(inst, 'ArrowLeft', 3)
      const left = feederX(inst)
      expect(left, `ArrowLeft did not go left under ${locale}`).toBeLessThan(before)
      press(inst, 'ArrowRight', 3)
      expect(feederX(inst), `ArrowRight did not go right under ${locale}`)
        .toBeGreaterThan(left)
    }
  })

  it('sprinkles food on any arrow, in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const { inst } = start(1, locale)
        expect(crumbs(inst), `${key} under ${locale} started with food`).toHaveLength(0)
        press(inst, key)
        expect(crumbs(inst).length, `${key} under ${locale} sprinkled nothing`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('lets the food sink, and the fish notice it', () => {
    const { inst } = start(3)
    press(inst, 'ArrowUp')
    const surface = crumbs(inst)[0]!.y
    // Food falls. Any one crumb may be eaten on the way down — that is the
    // point of the tank — so keep sprinkling and watch for one that gets
    // below the height it was dropped at.
    let fell = false
    for (let i = 0; i < 60 && !fell; i++) {
      press(inst, i % 8 < 4 ? 'ArrowLeft' : 'ArrowRight')
      ticks(inst, 4)
      fell = crumbs(inst).some((p) => p.y > surface)
    }
    expect(fell, 'nothing ever sank').toBe(true)

    // Left alone for a while, every crumb is found — the tank empties itself.
    for (let i = 0; i < 40; i++) {
      press(inst, 'ArrowUp')
      ticks(inst, 90)
    }
    expect(inst.souvenir?.()).toBe('the fish were happy!')
  })

  it('does not let the shoal end up living on the tank floor', () => {
    // A settled crumb used to be a permanent attractor. Crumbs dissolve, so a
    // tank left alone goes back to drifting rather than crowding the gravel.
    const { inst } = start(6)
    press(inst, 'ArrowUp', 4)
    ticks(inst, 60 * 30)
    expect(crumbs(inst), 'a crumb outlived the tank').toHaveLength(0)
    const glass = glassOf(cmds(inst))!
    const low = fish(inst).filter((f) => f.y > glass.y + glass.h * 0.75).length
    expect(low, 'the whole shoal is on the floor').toBeLessThan(fish(inst).length)
  })

  it('changes a fish HEADING toward food, not its speed', () => {
    // The tuning that matters: a fish that has seen a crumb turns toward it.
    // At 1.5x speed the tank read as a feeding frenzy and a flake was gone
    // before a child could watch it fall.
    const { inst } = start(8)
    const before = fish(inst).map((f) => f.flipX)
    ticks(inst, 30)
    press(inst, 'ArrowLeft', 6)              // a pile of crumbs, all to one side
    ticks(inst, 120)
    const after = fish(inst).map((f) => f.flipX)
    expect(after.some((d, i) => d !== before[i]), 'nobody turned').toBe(true)
    // And nobody sprinted: the fastest fish is still the fastest fish.
    const a = fish(inst).map((f) => f.x)
    ticks(inst, 1)
    const b = fish(inst).map((f) => f.x)
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(b[i]! - a[i]!), 'a fish bolted').toBeLessThan(2)
    }
  })

  it('swims continuously, never snapping a whole cell at a time', () => {
    const { inst } = start(5)
    const seenX: number[][] = []
    for (let i = 0; i < 12; i++) {
      ticks(inst, 1)
      seenX.push(fish(inst).map((f) => f.x))
    }
    for (let i = 1; i < seenX.length; i++) {
      const a = seenX[i - 1]!
      const b = seenX[i]!
      expect(b.length).toBe(a.length)
      const moved = a.map((x, n) => Math.abs(b[n]! - x))
      expect(Math.max(...moved), `frame ${i} did not move`).toBeGreaterThan(0)
      expect(Math.max(...moved), `frame ${i} jumped a whole cell`)
        .toBeLessThan(PX_PER_CELL)
      expect(moved.some((d) => d !== moved[0]), 'every fish moved at the same speed')
        .toBe(true)
    }
  })

  it('never lets a fish touch the glass, however long it swims', () => {
    const { inst } = start(7)
    for (let i = 0; i < 60; i++) {
      ticks(inst, 20)
      assertInside(inst)
      const glass = glassOf(cmds(inst))!
      for (const f of fish(inst)) {
        const w = Math.max(...f.rows.map((r) => r.length)) * f.scale
        expect(f.x, 'a fish swam into the left glass')
          .toBeGreaterThanOrEqual(glass.x + glass.t)
        expect(f.x + w, 'a fish swam into the right glass')
          .toBeLessThanOrEqual(glass.x + glass.w - glass.t)
      }
    }
  })

  it('keeps everything inside the tank across a mid-play resize', () => {
    const { inst } = start(9)
    for (const cols of [30, 70, 30, 96, 40]) {
      press(inst, 'ArrowLeft', 4)
      press(inst, 'ArrowRight', 9)
      ticks(inst, 45)
      assertInside(inst, cols)
      // Draw once more at the same width: the re-fit must be stable, not
      // shuffle everything a second time.
      assertInside(inst, cols)
    }
  })

  it('keeps the feeder inside the tank however hard a child mashes', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 400)
    assertInside(inst)
    press(inst, 'ArrowRight', 800)
    assertInside(inst)
  })

  it('has a warm souvenir at zero progress, in both languages', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const s = inst.souvenir?.() ?? ''
      expect(s.length, `${locale} fresh souvenir was empty`).toBeGreaterThan(0)
      expect(/\d/.test(s), `${locale} fresh souvenir had a digit: ${s}`).toBe(false)
    }
    expect(start(1, 'en').inst.souvenir?.())
      .toBe('the fish swam quietly, round and round')
    expect(start(1, 'he').inst.souvenir?.())
      .toBe('הדגים שחו בשקט, סיבוב אחרי סיבוב')
  })

  it('never counts, whatever the child does', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(2, locale)
      for (let i = 0; i < 30; i++) {
        press(inst, 'ArrowLeft')
        press(inst, 'ArrowRight')
        ticks(inst, 30)
        const s = inst.souvenir?.() ?? ''
        expect(/\d/.test(s), `${locale} souvenir counted: ${s}`).toBe(false)
      }
    }
  })

  it('never says a child lost, in either language', () => {
    const BAD = /lose|lost|fail|wrong|game over|no!/i
    const BAD_HE = /הפסד|נכשל|טעות|לא נכון|סוף המשחק/
    for (const locale of ['en', 'he'] as Locale[]) {
      const strings = aquarium.strings?.[locale] ?? {}
      for (const [key, value] of Object.entries(strings)) {
        expect(BAD.test(value), `${locale} ${key}: ${value}`).toBe(false)
        expect(BAD_HE.test(value), `${locale} ${key}: ${value}`).toBe(false)
      }
    }
  })

  it('has no ESC hint of its own — the shell owns that', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { ctx } = testCtx({ locale, strings: aquarium.strings })
      const hints = aquarium.hints(ctx.t)
      expect(hints.length).toBeGreaterThan(0)
      for (const h of hints) {
        expect(h.keys.includes('ESC')).toBe(false)
        expect(h.label.length).toBeGreaterThan(0)
        expect(h.label).not.toContain('fish.')
      }
    }
  })

  it('draws the same tank twice for the same seed, and a different one for another', () => {
    const a = pixelsOf(start(1).inst, aquarium.size)
    const b = pixelsOf(start(1).inst, aquarium.size)
    const c = pixelsOf(start(99).inst, aquarium.size)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    // The pixel model is the full field, one character per logical pixel.
    expect(a.split('\n')).toHaveLength(G.h * PX_PER_CELL)
    expect(a.split('\n')[0]).toHaveLength(G.w * PX_PER_CELL)
  })

  it('is a picture, not a blank field', () => {
    // The whole reason `pixelsOf` exists: a shape game that stopped drawing
    // looks exactly like a passing character-grid snapshot.
    const lit = [...pixelsOf(start(1).inst, aquarium.size)].filter((ch) => ch === '#').length
    expect(lit).toBeGreaterThan(400)
  })
})
