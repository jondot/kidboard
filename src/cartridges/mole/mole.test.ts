import { describe, it, expect } from 'vitest'
import mole, { MOLE, MOLE_FACE, TIMING } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, frameOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import { isWide } from '../../terminal/wide'
import type { DrawCmd, Locale, LiveInstance } from '../../types'
import en from './en.json'
import he from './he.json'

type Sound = { kind: 'note'; hz: number } | { kind: 'noise' } | { kind: 'blip' }

const start = (locale: Locale = 'en', seed = 1) => {
  const h = testCtx({ locale, seed, strings: mole.strings })
  const heard: Sound[] = []
  h.ctx.audio.note = (hz: number) => { heard.push({ kind: 'note', hz }) }
  h.ctx.audio.noise = () => { heard.push({ kind: 'noise' }) }
  h.ctx.audio.blip = () => { heard.push({ kind: 'blip' }) }
  return { ...h, heard, inst: mole.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, mole.size, cols)
const pixels = (inst: LiveInstance, cols?: number): string =>
  pixelsOf(inst, mole.size, cols)

type Outline = Extract<DrawCmd, { op: 'outline' }>
type Text = Extract<DrawCmd, { op: 'text' }>

const holesOf = (c: DrawCmd[]) =>
  c.filter((x) => x.op === 'circle') as Extract<DrawCmd, { op: 'circle' }>[]
const cellsOf = (c: DrawCmd[]): Outline[] => c.filter((x) => x.op === 'outline') as Outline[]
const capsOf = (c: DrawCmd[]): Text[] => c.filter((x) => x.op === 'text') as Text[]
const moleOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'sprite') as Extract<DrawCmd, { op: 'sprite' }> | undefined

/**
 * Which number key the mole on screen is asking for — read off the PICTURE,
 * not off the cartridge's state, so these tests see exactly what a child
 * sees: a mole in a hole with a key cap under it.
 */
const askedFor = (inst: LiveInstance): string | null => {
  const c = cmds(inst)
  const m = moleOf(c)
  if (!m) return null
  const mx = m.x + (Math.max(...m.rows.map((r) => r.length)) * m.scale) / 2
  const my = m.y + (m.rows.length * m.scale) / 2
  let best: Text | null = null
  let bestD = Infinity
  for (const cap of capsOf(c)) {
    // A cap is drawn in CELL coordinates; the mole in pixels.
    const cx = cap.x * PX_PER_CELL + 12
    const cy = cap.y * PX_PER_CELL
    if (cy < my) continue
    const d = Math.hypot(cx - mx, cy - my)
    if (d < bestD) { bestD = d; best = cap }
  }
  return best ? best.text[1]! : null
}

/** Ticks until a mole is up, or gives up after a generous while. */
const untilUp = (inst: LiveInstance): string => {
  for (let i = 0; i < 2000; i++) {
    inst.tick?.(1 / 120)
    const k = askedFor(inst)
    if (k) return k
  }
  throw new Error('no mole ever popped up')
}

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
    if (cmd.op === 'circle' || cmd.op === 'disc') {
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

describe('mole', () => {
  it('draws nine holes, each wearing its own key cap', () => {
    const { inst } = start()
    const c = cmds(inst)
    // A hole is a RING: hollow, so it reads as a hole and never as a thing.
    expect(holesOf(c)).toHaveLength(9)
    // The key caps stay CHARACTERS. They are a keyboard diagram, which is the
    // one thing shapes are wrong for — and they are the content of the game:
    // a child reads the number and finds it under their finger.
    const f = frameOf(inst, mole.size)
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(f).toContain(`[${n}]`)
    }
  })

  it('draws the board in ONE ink', () => {
    const { inst } = start()
    untilUp(inst)
    for (const cmd of cmds(inst)) {
      if (cmd.op === 'clear') continue
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('pops a mole up on its own, out of one of the nine holes', () => {
    const { inst } = start()
    expect(askedFor(inst)).toBeNull()
    expect('123456789').toContain(untilUp(inst))
    // Somebody is home: a SOLID creature where a hollow ring was.
    const c = cmds(inst)
    expect(moleOf(c)).toBeDefined()
    expect(holesOf(c).length, 'the busy hole is still empty').toBe(8)
  })

  it('marks the busy cell by thickening its frame, and draws it LAST', () => {
    // Neighbouring cells share walls. In one ink nothing can clip anything —
    // ink over ink is ink — but the busy cell is still painted again at the
    // end, because the moment a wall is painted in a second tone the last
    // writer wins and the highlight comes out half-finished.
    const { inst } = start()
    untilUp(inst)
    const cells = cellsOf(cmds(inst))
    expect(cells, 'the busy cell was not repainted last').toHaveLength(10)
    const last = cells[cells.length - 1]!
    const thick = cells.filter((o) => o.t === last.t)
    const quiet = cells.filter((o) => o.t !== last.t)
    expect(quiet, 'more than one cell was highlighted').toHaveLength(8)
    expect(last.t).toBeGreaterThan(quiet[0]!.t)
    // Exactly one cell is thick, and it is the one drawn twice.
    expect(thick).toHaveLength(2)
    expect(thick[0]!.x).toBe(last.x)
    expect(thick[0]!.y).toBe(last.y)
  })

  it('chirps when the child presses the number the mole is asking for', () => {
    const { inst, heard } = start()
    const key = untilUp(inst)
    heard.length = 0
    press(inst, key)
    expect(heard.filter((s) => s.kind === 'note').length).toBeGreaterThan(1)
    // The hello is rings thrown around the mole — hollow, never a piece of
    // the board, and the mole is still there to see.
    const c = cmds(inst)
    expect(moleOf(c)).toBeDefined()
    expect(holesOf(c).length, 'no rings were thrown').toBeGreaterThan(9)
  })

  it('takes any other number kindly and keeps the mole waiting', () => {
    const { inst, heard, said } = start()
    const key = untilUp(inst)
    const other = key === '5' ? '6' : '5'
    heard.length = 0
    press(inst, other)
    // A soft blip, nothing said, and the mole is exactly where it was.
    expect(heard).toEqual([{ kind: 'blip' }])
    expect(said).toHaveLength(0)
    expect(askedFor(inst)).toBe(key)
    expect(inst.souvenir!()).toBe('the moles are still napping in their holes!')
  })

  it('ignores keys that are not numbers without erroring', () => {
    const { inst, heard } = start()
    untilUp(inst)
    heard.length = 0
    expect(() => { press(inst, 'z'); press(inst, 'ArrowUp'); press(inst, '0') })
      .not.toThrow()
    expect(heard).toHaveLength(0)
  })

  it('runs on accumulated seconds, not on frames', () => {
    const slow = start(); ticks(slow.inst, 60, 1 / 60)
    const fast = start(); ticks(fast.inst, 120, 1 / 120)
    expect(pixels(fast.inst)).toBe(pixels(slow.inst))
    expect(fast.heard).toEqual(slow.heard)
  })

  it('keeps everything inside the field across a mid-play resize', () => {
    const { inst } = start()
    untilUp(inst)
    for (const cols of [mole.size.cols, 31, 40, 64, 120]) {
      ticks(inst, 40, 1 / 60)
      const g = gridFor(mole.size, cols)
      expect(outOfField(cmds(inst, cols), g.w, g.h), `at ${cols} columns`).toEqual([])
      expect(pixels(inst, cols).split('\n')[0]).toHaveLength(g.w * PX_PER_CELL)
    }
  })

  it('is a FIELD, not a slot: the board pillarboxes on a wide screen', () => {
    const { inst } = start()
    const span = (cols?: number): number => {
      const cs = cellsOf(cmds(inst, cols))
      return Math.max(...cs.map((o) => o.x + o.w)) - Math.min(...cs.map((o) => o.x))
    }
    expect(span(64)).toBeGreaterThan(span())
    expect(span(64)).toBeLessThan(64 * PX_PER_CELL * 0.75)
  })

  it('never pops out of the same hole twice running', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { inst } = start('en', seed)
      let last = ''
      for (let i = 0; i < 12; i++) {
        const key = untilUp(inst)
        expect(key).not.toBe(last)
        last = key
        press(inst, key)
        ticks(inst, Math.ceil((TIMING.greet + 0.05) * 120), 1 / 120)
      }
    }
  })

  it('says hello with moles, never with a number', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(locale)
      for (let i = 0; i < 5; i++) {
        press(inst, untilUp(inst))
        ticks(inst, Math.ceil((TIMING.greet + 0.05) * 120), 1 / 120)
      }
      const s = inst.souvenir!()
      expect(s).toContain(MOLE_FACE)
      expect(s).not.toMatch(/\d/)
    }
  })

  it('caps the hellos so the souvenir stays a picture, not a tally', () => {
    const { inst } = start()
    for (let i = 0; i < 12; i++) {
      press(inst, untilUp(inst))
      ticks(inst, Math.ceil((TIMING.greet + 0.05) * 120), 1 / 120)
    }
    const s = inst.souvenir!()
    expect(s).not.toMatch(/\d/)
    expect([...s].filter((ch) => ch === MOLE_FACE[0]).length).toBeLessThan(5)
  })

  it('reads warmly, never as a zero, before a single hello', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, ctx } = start(locale)
      const s = inst.souvenir!()
      expect(s).toBe(ctx.t('mole.souvenir.none'))
      expect(s).not.toMatch(/\d/)
      expect(s.length).toBeGreaterThan(0)
    }
  })

  it('never paints a bare number on the canvas', () => {
    // A key cap is `[7]`, which is a LABEL — never a bare number, and never
    // a score. The distinction is the whole reason mole keeps its characters.
    const { inst } = start()
    for (let i = 0; i < 4; i++) {
      press(inst, untilUp(inst))
      ticks(inst, 40, 1 / 60)
      for (const cmd of cmds(inst)) {
        const s = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
        expect(/^\d+$/.test(s.trim())).toBe(false)
      }
    }
  })

  it('never tells a child they lost, in either language', () => {
    const banned = [
      /lose/i, /lost/i, /fail/i, /wrong/i, /game over/i, /oops/i, /miss/i,
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

  it('draws the same picture in both languages', () => {
    expect(pixels(start('he').inst)).toBe(pixels(start('en').inst))
    expect(frameOf(start('he').inst, mole.size))
      .toBe(frameOf(start('en').inst, mole.size))
  })

  it('draws a mole big enough to fill its hole', () => {
    const { inst } = start()
    untilUp(inst)
    const m = moleOf(cmds(inst))!
    expect(m.rows).toEqual([...MOLE])
    expect(m.scale, 'a shrunken bitmap, not pixel art').toBeGreaterThanOrEqual(2)
    const hole = holesOf(cmds(inst))[0]!
    const w = Math.max(...m.rows.map((r) => r.length)) * m.scale
    expect(w).toBeGreaterThan(hole.r)
    expect(w).toBeLessThanOrEqual(hole.r * 2)
  })
})
