import { describe, it, expect } from 'vitest'
import catcher, { ITEMS, joinNamed } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(catcher.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: catcher.strings })
  return { ...h, inst: catcher.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, catcher.size, cols)

type Rect = Extract<DrawCmd, { op: 'rect' }>
type Sprite = Extract<DrawCmd, { op: 'sprite' }>

const skyOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'outline') as Extract<DrawCmd, { op: 'outline' }> | undefined
/** The basket is the only thing drawn with plain rects: two staves and a
 *  floor, in that order, and the floor spans the whole basket. */
const staves = (c: DrawCmd[]): Rect[] => c.filter((x) => x.op === 'rect') as Rect[]
const basketX = (inst: LiveInstance, cols?: number): number => {
  const r = staves(cmds(inst, cols))
  const floor = r[r.length - 1]!
  return floor.x + floor.w / 2
}
/** Everything in the air. Each falling thing is its own small bitmap. */
const falling = (inst: LiveInstance, cols?: number): Sprite[] =>
  cmds(inst, cols).filter((x) => x.op === 'sprite') as Sprite[]

/** Every drawing command, clipped against the real pixel field. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(catcher.size, cols)
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
      x1 = cmd.x + Math.max(...cmd.rows.map((r) => r.length))
      y1 = cmd.y + cmd.rows.length
    }
    expect(x0, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(y0, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

/**
 * Plays the way a child does: look at what is falling lowest, shuffle the
 * basket under it, wait a moment, look again.
 */
const play = (inst: LiveInstance, rounds = 400): void => {
  for (let i = 0; i < rounds; i++) {
    const items = falling(inst)
    const target = [...items].sort((a, b) => b.y - a.y)[0]
    if (target) {
      const b = basketX(inst)
      const gap = target.x + 6 - b
      const key = gap > 0 ? 'ArrowRight' : 'ArrowLeft'
      for (let n = 0; n < Math.min(3, Math.ceil(Math.abs(gap) / 24)); n++) {
        press(inst, key)
      }
    }
    ticks(inst, 3)
  }
}

describe('catch', () => {
  it('declares a live cartridge in both locales', () => {
    expect(catcher.kind).toBe('live')
    expect(catcher.apiVersion).toBe(1)
    expect(catcher.locales).toEqual(['en', 'he'])
    expect(catcher.size.cols).toBeGreaterThan(0)
    expect(catcher.size.aspect).toBeGreaterThan(0)
  })

  // v2: the sky is drawn in the PIXEL field, not with characters.
  it('draws a bordered sky with a basket, and things start falling', () => {
    const { inst } = start()
    expect(skyOf(cmds(inst))).toBeDefined()
    expect(staves(cmds(inst))).toHaveLength(3)      // two staves and a floor
    ticks(inst, 120)
    expect(falling(inst).length).toBeGreaterThan(0)
    const rows = pixelsOf(inst, catcher.size).split('\n')
    expect(rows).toHaveLength(PH)
    expect(rows.join('')).toContain('#')
    for (const cmd of cmds(inst)) {
      expect(['clear', 'outline', 'rect', 'sprite', 'circle'], `unexpected op ${cmd.op}`)
        .toContain(cmd.op)
    }
  })

  // THE CONVENTION: monochrome, and told apart by shape.
  it('is monochrome: the theme ground plus exactly one ink', () => {
    const { inst } = start()
    play(inst, 120)
    const tones = new Set(
      cmds(inst).filter((c) => c.op !== 'clear').map((c) => (c as { tone: string }).tone),
    )
    expect(tones.size).toBe(1)
    expect([...tones][0]).toBe('plain')
  })

  // WHY SHAPES AND NOT EMOJI: an emoji is a full-colour image no tone can
  // re-tint, so on a one-ink field it would be the only colour on screen. And
  // a bare disc for everything was not an option either, because the souvenir
  // NAMES what was caught — so every falling thing is its own small bitmap.
  it('gives every falling thing its own picture, so the souvenir names what was seen', () => {
    expect(ITEMS.length).toBeGreaterThan(1)
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
    const shapes = new Set(ITEMS.map((i) => i.art.join('|')))
    expect(shapes.size, 'two things fall as the same picture').toBe(ITEMS.length)
    for (const i of ITEMS) {
      expect(i.art.length).toBeGreaterThanOrEqual(6)
      expect(i.art.some((r) => r.includes('#'))).toBe(true)
    }
  })

  it('lays the sky out field-shaped, and centres it on a wide screen', () => {
    const narrow = skyOf(cmds(start().inst))!
    expect([narrow.x, narrow.y]).toEqual([0, 0])
    expect(narrow.w).toBe(PW)
    const widePW = 75 * PX_PER_CELL
    const wide = skyOf(cmds(start().inst, 75))!
    expect(wide.w).toBeLessThan(widePW)
    expect(seen(wide.w, wide.h)).toBeCloseTo(4 / 3, 1)
    expect(wide.x).toBeCloseTo(widePW - (wide.x + wide.w), 0)
  })

  it('moves the basket screen-left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const before = basketX(inst)
      press(inst, 'ArrowLeft', 3)
      const left = basketX(inst)
      expect(left, `ArrowLeft did not go left under ${locale}`).toBeLessThan(before)
      press(inst, 'ArrowRight', 3)
      expect(basketX(inst), `ArrowRight did not go right under ${locale}`)
        .toBeGreaterThan(left)
    }
  })

  it('keeps the basket inside the sky however hard a child mashes', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 300)
    assertInside(inst)
    expect(basketX(inst)).toBeGreaterThan(0)
    press(inst, 'ArrowRight', 600)
    assertInside(inst)
    expect(basketX(inst)).toBeLessThan(PW)
  })

  it('lets things fall over time, smoothly rather than row by row', () => {
    const { inst } = start(2)
    ticks(inst, 120)
    const first = falling(inst)[0]!
    expect(first).toBeDefined()
    const ys: number[] = []
    for (let i = 0; i < 12; i++) { ticks(inst, 1); ys.push(falling(inst)[0]?.y ?? -1) }
    const real = ys.filter((y) => y >= 0)
    expect(new Set(real).size).toBeGreaterThan(1)
    expect(real.some((y) => !Number.isInteger(y))).toBe(true)
    if (real.length > 0) expect(Math.max(...real)).toBeGreaterThan(first.y)
    assertInside(inst)
  })

  // HUMANE PACING. Nothing here restarts, but the sky must not be a firehose:
  // a thing arrives every couple of seconds and at most two are ever in the
  // air, so a child always has time to walk under one.
  it('drops at a rhythm a 6-year-old can walk under, never a stream', () => {
    const { inst } = start(3)
    // Nothing at all for the first beat: the child meets an empty sky.
    expect(falling(inst)).toHaveLength(0)
    let most = 0
    for (let i = 0; i < 1200; i++) {
      ticks(inst, 1)
      most = Math.max(most, falling(inst).length)
    }
    expect(most).toBeLessThanOrEqual(2)
  })

  it('names what was caught, and never how much of it', () => {
    const { inst } = start(5)
    play(inst)
    const s = inst.souvenir!()
    expect(s.startsWith('you caught ')).toBe(true)
    expect(s.endsWith('!')).toBe(true)
    expect(s).not.toMatch(/\d/)
    expect(s).not.toMatch(/\{|\}/)
  })

  it('names what was caught in Hebrew, with one glued ו and no doubled one', () => {
    const { inst } = start(5, 'he')
    play(inst)
    const s = inst.souvenir!()
    expect(s.startsWith('תפסתם ')).toBe(true)
    expect(s).not.toContain('וו')
    expect(s).not.toMatch(/\d/)
    expect(s).not.toMatch(/\{|\}/)
  })

  it('joins names the way a person says them, in both languages', () => {
    expect(joinNamed(['a star'], 'en')).toBe('a star')
    expect(joinNamed(['a star', 'a cake'], 'en')).toBe('a star and a cake')
    expect(joinNamed(['a star', 'a cake', 'a fish'], 'en'))
      .toBe('a star, a cake, and a fish')
    // Hebrew's "and" is the prefix ו glued to the next word, never its own
    // token and never after a comma of its own — and the overflow marker is
    // the bare word, so a capped list can never double the letter.
    expect(joinNamed(['כוכב', 'עוגה'], 'he')).toBe('כוכב ועוגה')
    expect(joinNamed(['כוכב', 'עוגה', 'עוד'], 'he')).toBe('כוכב, עוגה ועוד')
    expect(joinNamed(['כוכב', 'עוגה', 'עוד'], 'he')).not.toContain('וו')
  })

  it('caps a long catch list with a warm "and more" instead of a tally', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(8, locale)
      play(inst, 1800)
      const s = inst.souvenir!()
      expect(s).not.toMatch(/\d/)
      expect(s.split(',').length).toBeLessThanOrEqual(4)
    }
  })

  // A miss is a bonk and the thing is gone. Nothing ends, nothing is counted,
  // and no word anywhere says otherwise. (The zero-progress line itself is
  // covered by "reads warmly at zero progress" — a basket left in the middle
  // of the sky legitimately catches whatever falls into it, so this test is
  // about what a miss COSTS, which is nothing.)
  it('treats a miss as a soft bonk: nothing ends and nothing is counted', () => {
    const { inst, exited } = start(4)
    ticks(inst, 1800)          // never touch a key: most things are missed
    expect(exited()).toBe(false)
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
    expect(s).not.toMatch(/\{|\}/)
    expect(s.toLowerCase()).not.toMatch(/lose|lost|fail|game over|wrong|miss/)
    assertInside(inst)
  })

  it('never stacks two things down one lane', () => {
    const { inst } = start(4)
    for (let i = 0; i < 2400; i++) {
      ticks(inst, 1)
      const xs = falling(inst).map((s) => s.x)
      expect(new Set(xs).size, 'two things are falling down the same lane')
        .toBe(xs.length)
    }
  })

  it('survives a resize mid-play with everything still inside the field', () => {
    const { inst } = start(6)
    ticks(inst, 240)
    cmds(inst)                         // playing narrow...
    assertInside(inst, 60)             // ...then the window is dragged wide
    ticks(inst, 240)
    assertInside(inst, 60)
    const wide60 = pixelsOf(inst, catcher.size, 60).split('\n')
    expect(wide60[0]!).toHaveLength(60 * PX_PER_CELL)
    expect(wide60).toHaveLength(PH)
    press(inst, 'ArrowRight', 40)
    assertInside(inst, 60)
    assertInside(inst)                 // ...and dragged back to its narrowest
    ticks(inst, 240)
    assertInside(inst)
  })

  it('is deterministic for a seed, and different across seeds', () => {
    const a = start(9); const b = start(9)
    ticks(a.inst, 180); ticks(b.inst, 180)
    expect(pixelsOf(a.inst, catcher.size)).toBe(pixelsOf(b.inst, catcher.size))
    const frames = [1, 2, 3, 4, 5].map((s) => {
      const { inst } = start(s)
      ticks(inst, 180)
      return pixelsOf(inst, catcher.size)
    })
    expect(new Set(frames).size).toBeGreaterThan(1)
  })

  it('reads warmly at zero progress, in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const s = inst.souvenir!()
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\d/)
      expect(s).not.toMatch(/\{|\}/)
    }
  })

  it('never says the child lost, in either language', () => {
    const all = [
      ...Object.values(catcher.strings!.en!),
      ...Object.values(catcher.strings!.he!),
    ]
    for (const s of all) {
      expect(s.toLowerCase()).not.toMatch(/lose|lost|fail|game over|wrong|miss/)
      expect(s).not.toMatch(/הפסד|נכשל|טעות|טעית|החמצת|סוף המשחק/)
    }
  })

  it('paints no character at all on the sky, let alone a number', () => {
    const { inst } = start(7)
    play(inst, 60)
    for (const cmd of cmds(inst)) {
      expect(cmd.op === 'text' || cmd.op === 'put' || cmd.op === 'emoji').toBe(false)
    }
  })

  it('offers a movement hint and no ESC hint', () => {
    const { ctx } = start()
    const hints = catcher.hints(ctx.t)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys.toLowerCase()).not.toContain('esc')
  })
})
