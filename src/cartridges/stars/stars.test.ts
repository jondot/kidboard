import { describe, it, expect } from 'vitest'
import starfield, { DRIFTERS, STAR_SIZES } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(starfield.size)

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: starfield.strings })
  return { ...h, inst: starfield.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, starfield.size, cols)

type Rect = Extract<DrawCmd, { op: 'rect' }>

/**
 * The sky is a pixel field now, so every question this spec used to ask of a
 * character grid it asks of the command buffer instead. A star is a `rect`
 * and its SIZE is its depth — there are no glyphs and no second tone left to
 * read, which is the whole point of the port.
 */
const portholeOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'outline') as Extract<DrawCmd, { op: 'outline' }> | undefined
const starsOf = (inst: LiveInstance, cols?: number): Rect[] =>
  cmds(inst, cols).filter((x) => x.op === 'rect') as Rect[]
const drifterOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'sprite') as Extract<DrawCmd, { op: 'sprite' }> | undefined

const FAR = STAR_SIZES[0]!
const NEAR = STAR_SIZES[STAR_SIZES.length - 1]!

const meanX = (inst: LiveInstance): number => {
  const s = starsOf(inst)
  return s.reduce((n, r) => n + r.x, 0) / Math.max(1, s.length)
}

/** Asserts that EVERY drawing command lands inside the pixel field. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(starfield.size, cols)
  const pw = g.w * PX_PER_CELL
  const ph = g.h * PX_PER_CELL
  for (const cmd of cmds(inst, cols)) {
    if (cmd.op === 'clear') continue
    let x1 = cmd.x
    let y1 = cmd.y
    if (cmd.op === 'rect' || cmd.op === 'outline') { x1 = cmd.x + cmd.w; y1 = cmd.y + cmd.h }
    if (cmd.op === 'sprite') {
      x1 = cmd.x + Math.max(...cmd.rows.map((r) => r.length)) * cmd.scale
      y1 = cmd.y + cmd.rows.length * cmd.scale
    }
    expect(cmd.x, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(cmd.y, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

/** Every star is inside the porthole's rail, never drawn over it. */
const assertInPorthole = (inst: LiveInstance, cols?: number): void => {
  const c = cmds(inst, cols)
  const p = portholeOf(c)!
  for (const r of (c.filter((x) => x.op === 'rect') as Rect[])) {
    expect(r.x, 'a star crossed the left rail').toBeGreaterThanOrEqual(p.x + p.t)
    expect(r.x + r.w, 'a star crossed the right rail').toBeLessThanOrEqual(p.x + p.w - p.t)
    expect(r.y, 'a star crossed the top rail').toBeGreaterThanOrEqual(p.y + p.t)
    expect(r.y + r.h, 'a star crossed the bottom rail').toBeLessThanOrEqual(p.y + p.h - p.t)
  }
}

describe('stars', () => {
  it('declares a live cartridge in both locales', () => {
    expect(starfield.kind).toBe('live')
    expect(starfield.apiVersion).toBe(1)
    expect(starfield.locales).toEqual(['en', 'he'])
    expect(starfield.size.cols).toBeGreaterThan(0)
    expect(starfield.size.aspect).toBeGreaterThan(0)
  })

  it('draws a sky full of stars inside a porthole', () => {
    // The old sky ran edge to edge because "space has no walls". On a wide
    // screen that is a 3:1 horizon, so the sky is a FIELD now: a hollow rail
    // holds it to 4:3 and the cut at its edge reads as a window rather than
    // as a bug.
    const { inst } = start()
    const c = cmds(inst)
    const p = portholeOf(c)
    expect(p, 'no porthole').toBeDefined()
    expect(p!.t).toBeGreaterThanOrEqual(3)
    expect(starsOf(inst).length).toBeGreaterThan(30)
    assertInside(inst)
    assertInPorthole(inst)
  })

  it('draws the sky in ONE ink, and with no characters at all', () => {
    const { inst } = start(4)
    ticks(inst, 60 * 12)
    for (const cmd of cmds(inst)) {
      if (cmd.op === 'clear') continue
      expect(cmd.op).not.toBe('text')
      expect(cmd.op).not.toBe('put')
      expect(cmd.op).not.toBe('emoji')
      expect('tone' in cmd ? cmd.tone : 'plain', `${cmd.op} used a second tone`)
        .toBe('plain')
    }
  })

  it('is a FIELD, not a slot: the sky pillarboxes on a wide screen', () => {
    const { inst } = start()
    const narrow = portholeOf(cmds(inst))!
    const wide = portholeOf(cmds(inst, 72))!
    expect(wide.w).toBeGreaterThan(narrow.w)
    expect(seen(wide.w, wide.h), 'the sky became a horizon')
      .toBeLessThanOrEqual(4 / 3 + 0.02)
    expect(wide.x * 2 + wide.w).toBeCloseTo(72 * PX_PER_CELL, 0)
  })

  it('fills a wider window with more sky, not bigger stars', () => {
    const { inst } = start()
    const narrow = starsOf(inst).length
    starsOf(inst, 72)
    expect(starsOf(inst, 72).length).toBeGreaterThan(narrow)
    // The star sizes are a fixed table: a wider window never inflates them.
    for (const r of starsOf(inst, 72)) {
      expect(STAR_SIZES.some((s) => s.w === r.w && s.h === r.h),
        `a star was ${r.w}x${r.h}`).toBe(true)
    }
    assertInside(inst, 72)
  })

  it('sweeps the sky screen-left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const left = start(4, locale)
      const right = start(4, locale)
      // Same seed, same sky: only the steering differs.
      ticks(left.inst, 30)
      ticks(right.inst, 30)
      press(left.inst, 'ArrowLeft', 4)
      press(right.inst, 'ArrowRight', 4)
      ticks(left.inst, 60)
      ticks(right.inst, 60)
      expect(meanX(left.inst), `ArrowLeft did not sweep left under ${locale}`)
        .toBeLessThan(meanX(right.inst))
    }
  })

  it('steers up and down without ever leaving the sky', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      const { inst } = start(6)
      for (let i = 0; i < 40; i++) {
        press(inst, key, 3)
        ticks(inst, 20)
        assertInside(inst)
        assertInPorthole(inst)
      }
    }
  })

  it('flies continuously — stars move a fraction of a cell per frame', () => {
    const { inst } = start(2)
    ticks(inst, 60)
    let sawSubCellMotion = 0
    let frames = 0
    let prev = starsOf(inst)
    for (let i = 0; i < 20; i++) {
      ticks(inst, 1)
      const now = starsOf(inst)
      expect(now.length).toBe(prev.length)
      const moved = now
        .map((p, n) => Math.abs(p.x - prev[n]!.x))
        // A star that reached the edge and was recycled jumps; ignore those.
        .filter((d) => d < PX_PER_CELL * 3)
      expect(moved.length, 'the whole sky was recycled at once').toBeGreaterThan(5)
      expect(Math.max(...moved), 'nothing moved at all').toBeGreaterThan(0)
      sawSubCellMotion += moved.filter((d) => d > 0 && d < 4 && d % 1 !== 0).length
      frames += 1
      prev = now
    }
    // Motion is genuinely fractional, not a whole pixel at a time on a timer.
    expect(sawSubCellMotion / frames).toBeGreaterThan(3)
  })

  it('sells depth in SIZE: a near star is bigger than a far one', () => {
    // Depth used to be three tones. One ink, so it is three sizes — which is
    // what distance actually looks like, and it survives any theme.
    expect(NEAR.w).toBeGreaterThan(FAR.w)
    expect(NEAR.h).toBeGreaterThan(FAR.h)
    const { inst } = start(8)
    ticks(inst, 120)
    const sizes = new Set(starsOf(inst).map((r) => `${r.w}x${r.h}`))
    expect(sizes.size, 'every star was the same size').toBeGreaterThan(1)
    // Far specks outnumber near ones, or the field reads as confetti.
    const far = starsOf(inst).filter((r) => r.w === FAR.w).length
    const near = starsOf(inst).filter((r) => r.w === NEAR.w).length
    expect(far).toBeGreaterThan(near)
  })

  it('sells depth: near stars move faster than far ones', () => {
    const { inst } = start(8)
    ticks(inst, 120)
    const near: number[] = []
    const far: number[] = []
    let prev = starsOf(inst)
    for (let i = 0; i < 60; i++) {
      ticks(inst, 1)
      const now = starsOf(inst)
      for (let n = 0; n < now.length; n++) {
        const d = Math.abs(now[n]!.x - prev[n]!.x)
        if (d >= PX_PER_CELL * 3) continue
        if (now[n]!.w === FAR.w) far.push(d)
        if (now[n]!.w === NEAR.w) near.push(d)
      }
      prev = now
    }
    expect(near.length, 'no near stars were drawn').toBeGreaterThan(10)
    expect(far.length, 'no far stars were drawn').toBeGreaterThan(10)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(near), 'near stars were not faster than far ones')
      .toBeGreaterThan(avg(far) * 2)
  })

  it('keeps the whole sky inside the field across a mid-play resize', () => {
    const { inst } = start(10)
    for (const cols of [30, 80, 30, 110, 48]) {
      press(inst, 'ArrowLeft', 6)
      press(inst, 'ArrowUp', 6)
      ticks(inst, 90)
      assertInside(inst, cols)
      assertInside(inst, cols)
      assertInPorthole(inst, cols)
    }
  })

  it('draws whatever floats past as a picture, never as an emoji', () => {
    // An emoji is a full-colour image no tone can re-tint: on a one-ink field
    // it would be the only colour on screen. Each drifter is a bitmap, and
    // each has to look like the thing its souvenir sentence names.
    expect(DRIFTERS).toHaveLength(4)
    for (const d of DRIFTERS) {
      expect(d.art.length, `${d.id} is too small to read`).toBeGreaterThanOrEqual(5)
      expect(Math.max(...d.art.map((r) => r.length)),
        `${d.id} is too narrow to read`).toBeGreaterThanOrEqual(11)
    }
    let sprite: Extract<DrawCmd, { op: 'sprite' }> | undefined
    const { inst } = start(3)
    for (let i = 0; i < 60 * 20 && !sprite; i++) {
      ticks(inst, 1)
      sprite = drifterOf(cmds(inst))
    }
    expect(sprite, 'nothing floated past in 20 seconds').toBeDefined()
    expect(sprite!.tone).toBe('plain')
  })

  it('has a warm souvenir at zero progress, in both languages', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const s = inst.souvenir?.() ?? ''
      expect(s.length, `${locale} fresh souvenir was empty`).toBeGreaterThan(0)
      expect(/\d/.test(s), `${locale} fresh souvenir had a digit: ${s}`).toBe(false)
    }
    expect(start(1, 'en').inst.souvenir?.()).toBe('you drifted among the stars')
    expect(start(1, 'he').inst.souvenir?.()).toBe('ריחפתם בין הכוכבים')
  })

  it('remembers steering, and names whatever floated past', () => {
    const flown = start(5)
    press(flown.inst, 'ArrowLeft')
    expect(flown.inst.souvenir?.()).toBe('you flew through the stars!')

    const named = new Set<string>()
    for (const seed of [1, 2, 3, 4]) {
      const { inst } = start(seed)
      ticks(inst, 60 * 25)
      const s = inst.souvenir?.() ?? ''
      expect(/\d/.test(s), `souvenir counted: ${s}`).toBe(false)
      if (s.startsWith('you flew right past')) named.add(s)
    }
    expect(named.size, 'nothing ever floated past in 25 seconds')
      .toBeGreaterThan(0)
    expect(DRIFTERS.length).toBeGreaterThan(1)
  })

  it('never counts, whatever the child does', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(3, locale)
      for (let i = 0; i < 25; i++) {
        press(inst, 'ArrowLeft')
        press(inst, 'ArrowDown')
        ticks(inst, 45)
        const s = inst.souvenir?.() ?? ''
        expect(/\d/.test(s), `${locale} souvenir counted: ${s}`).toBe(false)
      }
    }
  })

  it('never says a child lost, in either language', () => {
    const BAD = /lose|lost|fail|wrong|game over|crash|no!/i
    const BAD_HE = /הפסד|נכשל|טעות|לא נכון|סוף המשחק|התרסק/
    for (const locale of ['en', 'he'] as Locale[]) {
      const strings = starfield.strings?.[locale] ?? {}
      for (const [key, value] of Object.entries(strings)) {
        expect(BAD.test(value), `${locale} ${key}: ${value}`).toBe(false)
        expect(BAD_HE.test(value), `${locale} ${key}: ${value}`).toBe(false)
      }
    }
  })

  it('has no ESC hint of its own — the shell owns that', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { ctx } = testCtx({ locale, strings: starfield.strings })
      const hints = starfield.hints(ctx.t)
      expect(hints.length).toBeGreaterThan(0)
      for (const h of hints) {
        expect(h.keys.includes('ESC')).toBe(false)
        expect(h.label.length).toBeGreaterThan(0)
        expect(h.label).not.toContain('stars.')
      }
    }
  })

  it('draws the same sky twice for the same seed, and a different one for another', () => {
    const a = pixelsOf(start(1).inst, starfield.size)
    const b = pixelsOf(start(1).inst, starfield.size)
    const c = pixelsOf(start(77).inst, starfield.size)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.split('\n')).toHaveLength(G.h * PX_PER_CELL)
    expect(a.split('\n')[0]).toHaveLength(G.w * PX_PER_CELL)
  })
})
