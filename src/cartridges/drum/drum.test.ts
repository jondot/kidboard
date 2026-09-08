import { describe, it, expect } from 'vitest'
import drum, { PADS, STEPS, STEP } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, frameOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import { isWide } from '../../terminal/wide'
import type { DrawCmd, Locale, LiveInstance } from '../../types'
import en from './en.json'
import he from './he.json'

type Sound =
  | { kind: 'note'; hz: number; ms: number }
  | { kind: 'noise'; ms: number }
  | { kind: 'blip' }
  | { kind: 'hit'; voice: string }

/**
 * `drum.strings` is wired into the ctx exactly as `session.ts` wires a
 * cartridge's own catalog in production, and `ctx.audio` is stubbed so every
 * assertion about "what a pad sounds like" is about a real call, not a hope.
 */
const start = (locale: Locale = 'en', seed = 1) => {
  const h = testCtx({ locale, seed, strings: drum.strings })
  const heard: Sound[] = []
  h.ctx.audio.note = (hz: number, ms: number) => { heard.push({ kind: 'note', hz, ms }) }
  h.ctx.audio.noise = (ms: number) => { heard.push({ kind: 'noise', ms }) }
  h.ctx.audio.blip = () => { heard.push({ kind: 'blip' }) }
  h.ctx.audio.hit = (voice: string) => { heard.push({ kind: 'hit', voice }) }
  return { ...h, heard, inst: drum.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, drum.size, cols)
const pixels = (inst: LiveInstance, cols?: number): string =>
  pixelsOf(inst, drum.size, cols)

type Outline = Extract<DrawCmd, { op: 'outline' }>
type Rect = Extract<DrawCmd, { op: 'rect' }>

/**
 * The kit is a pixel field now. A pad is a hollow rectangle, a struck one has
 * a DOUBLE rim and two solid bands slammed across its skin, and the loop
 * strip's rests are the only 4 x 3 blocks on the field.
 */
const padsOf = (c: DrawCmd[]): Outline[] =>
  (c.filter((x) => x.op === 'outline') as Outline[])
    .filter((o) => o.h > 20)
const restsOf = (c: DrawCmd[]): Rect[] =>
  (c.filter((x) => x.op === 'rect') as Rect[]).filter((r) => r.w === 4 && r.h === 3)

/** The pad rectangles, left to right, which is the order `PADS` is in. */
const pads = (inst: LiveInstance, cols?: number): Outline[] => padsOf(cmds(inst, cols))

/**
 * Every command inside the field, characters measured on the CELL grid and
 * shapes on the pixel field — this cartridge draws both, on purpose: the key
 * caps are a keyboard diagram, and a keyboard diagram is made of characters.
 */
const outOfField = (c: DrawCmd[], w: number, h: number): string[] => {
  const bad: string[] = []
  const pw = w * PX_PER_CELL
  const ph = h * PX_PER_CELL
  for (const cmd of c) {
    if (cmd.op === 'text') {
      let x = Math.round(cmd.x)
      for (const g of [...cmd.text]) {
        if (x < 0 || cmd.y < 0 || cmd.y > h - 1 || x + (isWide(g) ? 1 : 0) > w - 1) {
          bad.push(`${g} at ${x},${cmd.y}`)
        }
        x += isWide(g) ? 2 : 1
      }
    }
    if (cmd.op === 'rect' || cmd.op === 'outline') {
      if (cmd.x < 0 || cmd.y < 0 || cmd.x + cmd.w > pw || cmd.y + cmd.h > ph) {
        bad.push(`${cmd.op} at ${cmd.x},${cmd.y}`)
      }
    }
    if (cmd.op === 'disc' || cmd.op === 'circle') {
      if (cmd.x - cmd.r < 0 || cmd.x + cmd.r > pw
        || cmd.y - cmd.r * PIXEL_ASPECT < 0 || cmd.y + cmd.r * PIXEL_ASPECT > ph) {
        bad.push(`${cmd.op} at ${cmd.x},${cmd.y}`)
      }
    }
    if (cmd.op === 'sprite') {
      const sw = Math.max(...cmd.rows.map((r) => r.length)) * cmd.scale
      if (cmd.x < 0 || cmd.y < 0 || cmd.x + sw > pw
        || cmd.y + cmd.rows.length * cmd.scale > ph) {
        bad.push(`sprite at ${cmd.x},${cmd.y}`)
      }
    }
  }
  return bad
}

describe('drum', () => {
  it('draws four hollow pads, four key caps and an eight-step loop strip', () => {
    const { inst } = start()
    const c = cmds(inst)
    expect(padsOf(c)).toHaveLength(PADS.length)
    // Hollow until struck: a pad is the world, a hit is the thing.
    for (const p of padsOf(c)) expect(p.t).toBeGreaterThanOrEqual(3)
    // Eight rests, one per loop step, before anything is recorded.
    expect(restsOf(c)).toHaveLength(STEPS)
    // The key caps are characters, because a key cap IS a character.
    const f = frameOf(inst, drum.size)
    for (const p of PADS) expect(f).toContain(p.cap)
  })

  it('gives every pad a shape of its own instead of a colour of its own', () => {
    // Four colours used to say which pad was which. One ink, so four
    // silhouettes do: a disc, three bars, a cross and a wedge.
    expect(new Set(PADS.map((p) => p.icon)).size).toBe(PADS.length)
    const { inst } = start()
    const c = cmds(inst)
    expect(c.some((x) => x.op === 'disc'), 'no kick drum head').toBe(true)
    expect(c.some((x) => x.op === 'line'), 'no crossed hat').toBe(true)
    // And every one of them is in the same ink.
    for (const cmd of c) {
      if (cmd.op === 'clear') continue
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('gives each pad its own drum, in the order they are drawn', () => {
    const { inst, heard } = start()
    press(inst, 'a')
    expect(heard).toEqual([{ kind: 'hit', voice: 'kick' }])

    heard.length = 0
    press(inst, 's'); press(inst, 'd'); press(inst, 'f')
    expect(heard).toEqual([
      { kind: 'hit', voice: 'snare' },
      { kind: 'hit', voice: 'hat' },
      { kind: 'hit', voice: 'clap' },
    ])
    // Four pads, four DIFFERENT drums — not one sound struck four times. What
    // each drum is built from is `runtime/audio`'s business and is judged by
    // ear; all this file can hold is that the mapping is one-to-one.
  })

  it('ignores keys that are not pads without erroring', () => {
    const { inst, heard } = start()
    expect(() => { press(inst, 'z'); press(inst, 'ArrowUp') }).not.toThrow()
    expect(heard).toHaveLength(0)
  })

  it('shakes the struck pad, and lets the shake fade on real seconds', () => {
    // The pad used to shiver bands of `=` across its skin, which was a fix
    // made after LOOKING at it: a hit on a rhythm toy has to be unmissable
    // from across a room. This is that same fix in shapes — the rim doubles
    // and two solid bands slam across the skin.
    const { inst } = start()
    const idle = pixels(inst)
    const quietRim = pads(inst)[0]!.t
    const quietRects = (cmds(inst).filter((x) => x.op === 'rect')).length

    press(inst, 'a')
    expect(pixels(inst)).not.toBe(idle)
    expect(pads(inst)[0]!.t, 'the struck rim did not thicken')
      .toBeGreaterThan(quietRim)
    expect((cmds(inst).filter((x) => x.op === 'rect')).length,
      'no bands slammed across the skin').toBe(quietRects + 2)
    // Only the pad that was struck.
    expect(pads(inst)[1]!.t).toBe(quietRim)

    ticks(inst, 60, 1 / 60)                   // a whole second later
    expect(pixels(inst)).toBe(idle)
  })

  it('records an eight-step loop on p and plays the pattern back by itself', () => {
    const { inst, heard } = start()
    press(inst, 'p')
    press(inst, 'a')                          // one kick, on step 0
    const afterRecording = heard.length
    // Past the eighth step: the loop turns itself around and replays.
    ticks(inst, Math.ceil((STEPS * STEP + 0.2) * 120), 1 / 120)
    const replayed = heard.slice(afterRecording).filter((s) => s.kind === 'hit')
    expect(replayed.length).toBeGreaterThan(0)
    // The strip now stands one bar up where a rest used to be, so only seven
    // rests are left where there were eight.
    expect(restsOf(cmds(inst))).toHaveLength(STEPS - 1)
  })

  it('draws a heavy pad heavier than a light one in the loop', () => {
    // Which pad a step holds is not a colour and not a letter: it is how tall
    // that step stands. A kick is heavy, a hat is light, and a recorded bar
    // is a picture of its own rhythm.
    const bar = (key: string): number => {
      const { inst } = start()
      press(inst, 'p')
      press(inst, key)
      const before = restsOf(cmds(inst)).length
      expect(before).toBe(STEPS - 1)
      const tall = (cmds(inst).filter((x) => x.op === 'rect') as Rect[])
        .filter((r) => r.h > 3 && r.w > 4)
      return Math.max(...tall.map((r) => r.h))
    }
    expect(bar('a'), 'the kick did not stand taller than the hat')
      .toBeGreaterThan(bar('d'))
  })

  it('runs on accumulated seconds, not on frames', () => {
    const script = (inst: LiveInstance): void => {
      press(inst, 'p'); press(inst, 'a')
      press(inst, 's')
    }
    const slow = start(); script(slow.inst); ticks(slow.inst, 144, 1 / 60)
    const fast = start(); script(fast.inst); ticks(fast.inst, 288, 1 / 120)
    expect(pixels(fast.inst)).toBe(pixels(slow.inst))
    expect(fast.heard).toEqual(slow.heard)
  })

  it('is a FIELD, not a slot: the kit pillarboxes on a wide screen', () => {
    const { inst } = start()
    const narrow = pads(inst)
    const wide = pads(inst, 64)
    expect(wide[0]!.w, 'a wider screen left the pads stranded')
      .toBeGreaterThan(narrow[0]!.w)
    // The kit never spreads past 4:3: the pads sit inside a CENTRED stage
    // with the theme's own ground either side, rather than running to the
    // edges of a wide terminal.
    const right = wide[wide.length - 1]!
    const field = 64 * PX_PER_CELL
    const stageW = Math.round((gridFor(drum.size, 64).h * PX_PER_CELL * (4 / 3)) / PIXEL_ASPECT)
    expect(stageW).toBeLessThan(field)
    expect(wide[0]!.x, 'no margin on the left').toBeGreaterThan((field - stageW) / 2 - 1)
    expect(right.x + right.w, 'no margin on the right')
      .toBeLessThan(field - (field - stageW) / 2 + 1)
    const f = frameOf(inst, drum.size, 64)
    for (const p of PADS) expect(f).toContain(p.cap)
  })

  it('keeps everything inside the field across a mid-play resize', () => {
    const { inst } = start()
    press(inst, 'p'); press(inst, 'a'); press(inst, 'd')
    for (const cols of [drum.size.cols, 31, 40, 64, 120]) {
      ticks(inst, 40, 1 / 60)
      const g = gridFor(drum.size, cols)
      expect(outOfField(cmds(inst, cols), g.w, g.h), `at ${cols} columns`).toEqual([])
    }
  })

  it('names the beat rather than counting it', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, ctx } = start(locale)
      press(inst, 'a'); press(inst, 'd'); press(inst, 'a')
      const s = inst.souvenir!()
      expect(s).toContain(ctx.t('drum.sound.kick'))
      expect(s).toContain(ctx.t('drum.sound.hat'))
      expect(s).not.toMatch(/\d/)
    }
  })

  it('reads warmly, never as a zero, before a single pad is struck', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, ctx } = start(locale)
      const s = inst.souvenir!()
      expect(s).toBe(ctx.t('drum.souvenir.none'))
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\d/)
    }
  })

  it('caps a long jam instead of spelling out every hit', () => {
    const { inst } = start()
    for (let i = 0; i < 40; i++) press(inst, ['a', 's', 'd', 'f'][i % 4]!)
    expect(inst.souvenir!().split(' ').length).toBeLessThan(20)
  })

  it('never paints a bare number on the canvas', () => {
    const { inst } = start()
    press(inst, 'p'); press(inst, 'a')
    ticks(inst, 400, 1 / 60)
    for (const cmd of cmds(inst)) {
      const s = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
      expect(/^\d+$/.test(s.trim())).toBe(false)
    }
  })

  it('never tells a child they lost, in either language', () => {
    const banned = [
      /lose/i, /lost/i, /fail/i, /wrong/i, /game over/i, /try again/i, /oops/i,
      'הפסד', 'הפסדת', 'נכשל', 'טעות', 'לא נכון', 'סוף המשחק',
    ]
    for (const cat of [en, he]) {
      for (const v of Object.values(cat as Record<string, string>)) {
        for (const b of banned) {
          expect(typeof b === 'string' ? v.includes(b) : b.test(v), `"${v}"`).toBe(false)
        }
      }
    }
  })

  it('draws the same picture in both languages, since the canvas is language-neutral', () => {
    const a = start('he')
    const b = start('en')
    expect(pixels(a.inst)).toBe(pixels(b.inst))
    const g = gridFor(drum.size)
    expect(pixels(b.inst).split('\n')).toHaveLength(g.h * PX_PER_CELL)
  })
})
