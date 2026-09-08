import { describe, it, expect } from 'vitest'
import pad, {
  BRUSHES, DOT_H, DOT_W, currentDrawing, emptyDrawing, marksOf, type Drawing,
} from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(pad.size)

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: pad.strings })
  return { ...h, inst: pad.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, pad.size, cols)

/**
 * The pad is a pixel field now, and the drawing order is fixed and documented
 * in `draw`: the paper, then every mark, then the two guides, then the NIB
 * last so nothing can ever bury it. So the nib is simply the last command —
 * a `rect` for a solid brush, an `outline` for the rubber.
 */
const nibOf = (c: DrawCmd[]): Extract<DrawCmd, { op: 'rect' | 'outline' }> => {
  const last = c[c.length - 1]!
  if (last.op !== 'rect' && last.op !== 'outline') throw new Error('no nib drawn')
  return last
}
const nib = (inst: LiveInstance, cols?: number) => nibOf(cmds(inst, cols))
const paperOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'outline') as Extract<DrawCmd, { op: 'outline' }>

/** Every mark the pad actually PAINTED this frame, of the pad's own dot size. */
const painted = (inst: LiveInstance, cols?: number): { x: number; y: number }[] =>
  (cmds(inst, cols).filter((x) => x.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>[])
    .filter((r) => r.w === DOT_W && r.h === DOT_H)
    // The horizontal guide is one dot tall but twice the wall wide; the
    // vertical one is one dot wide. Neither is on the lattice.
    .map((r) => ({ x: r.x, y: r.y }))

/** The picture itself, which is the save file — not what happens to be lit. */
const marks = (): { x: number; y: number }[] => marksOf(currentDrawing()!)

const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(pad.size, cols)
  const pw = g.w * PX_PER_CELL
  const ph = g.h * PX_PER_CELL
  for (const cmd of cmds(inst, cols)) {
    if (cmd.op === 'clear') continue
    let x1 = cmd.x
    let y1 = cmd.y
    if (cmd.op === 'rect' || cmd.op === 'outline') { x1 = cmd.x + cmd.w; y1 = cmd.y + cmd.h }
    expect(cmd.x, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(cmd.y, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

/** Draws a line by holding a key the way a browser repeats it. */
const stroke = (inst: LiveInstance, key: string, dots = 6): void => {
  for (let i = 0; i < dots * 8; i++) {
    press(inst, key)
    ticks(inst, 1)
  }
}

describe('draw', () => {
  it('declares a live cartridge in both locales', () => {
    expect(pad.kind).toBe('live')
    expect(pad.apiVersion).toBe(1)
    expect(pad.locales).toEqual(['en', 'he'])
    expect(pad.size.cols).toBeGreaterThan(0)
    expect(pad.size.aspect).toBeGreaterThan(0)
  })

  it('opens on a blank, bordered page with a nib in the middle of it', () => {
    const { inst } = start()
    const c = cmds(inst)
    const paper = paperOf(c)
    expect(paper, 'no paper').toBeDefined()
    expect(paper.t).toBeGreaterThanOrEqual(3)
    expect(marks()).toHaveLength(0)
    const n = nib(inst)
    expect(n.x).toBeGreaterThan(paper.x + paper.w * 0.3)
    expect(n.x).toBeLessThan(paper.x + paper.w * 0.7)
    assertInside(inst)
  })

  it('draws the pad in ONE ink, and with no characters at all', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 4)
    press(inst, ' ')
    for (const cmd of cmds(inst)) {
      if (cmd.op === 'clear') continue
      expect(cmd.op).not.toBe('text')
      expect(cmd.op).not.toBe('put')
      expect(cmd.op).not.toBe('emoji')
      expect('tone' in cmd ? cmd.tone : 'plain', `${cmd.op} used a second tone`)
        .toBe('plain')
    }
  })

  it('is a FIELD, not a slot: the page pillarboxes on a wide screen', () => {
    const { inst } = start()
    const narrow = paperOf(cmds(inst))
    const wide = paperOf(cmds(inst, 80))
    expect(wide.w).toBeGreaterThan(narrow.w)
    expect(seen(wide.w, wide.h), 'the page became a letterbox')
      .toBeLessThanOrEqual(4 / 3 + 0.02)
    expect(wide.x * 2 + wide.w).toBeCloseTo(80 * PX_PER_CELL, 0)
    assertInside(inst, 80)
  })

  it('moves the pen screen-left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const before = nib(inst).x
      stroke(inst, 'ArrowLeft', 4)
      const left = nib(inst).x
      expect(left, `ArrowLeft did not go left under ${locale}`).toBeLessThan(before)
      stroke(inst, 'ArrowRight', 4)
      expect(nib(inst).x, `ArrowRight did not go right under ${locale}`)
        .toBeGreaterThan(left)
    }
  })

  it('moves the pen screen-up on ArrowUp in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const before = nib(inst).y
      stroke(inst, 'ArrowUp', 3)
      const up = nib(inst).y
      expect(up, `ArrowUp did not go up under ${locale}`).toBeLessThan(before)
      stroke(inst, 'ArrowDown', 3)
      expect(nib(inst).y, `ArrowDown did not go down under ${locale}`)
        .toBeGreaterThan(up)
    }
  })

  it('leaves a trail behind the pen', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 5)
    const line = marks()
    expect(line.length).toBeGreaterThan(3)
    // A horizontal stroke is a horizontal line.
    expect(new Set(line.map((p) => p.y)).size).toBe(1)
    // And the trail is on the screen, not only in the save file.
    expect(painted(inst).length).toBeGreaterThan(3)
  })

  it('glides continuously, a fraction of a dot at a time', () => {
    const { inst } = start()
    // A held key, the way a browser repeats it: a press per frame.
    press(inst, 'ArrowRight')
    const seenX: number[] = [nib(inst).x]
    for (let i = 0; i < 5; i++) {
      press(inst, 'ArrowRight')
      ticks(inst, 1)
      seenX.push(nib(inst).x)
    }
    for (let i = 1; i < seenX.length; i++) {
      const d = seenX[i]! - seenX[i - 1]!
      expect(d, `frame ${i} did not move`).toBeGreaterThan(0)
      expect(d, `frame ${i} snapped a whole dot`).toBeLessThan(DOT_W)
      expect(Number.isInteger(seenX[i]!), `frame ${i} landed on a whole pixel`)
        .toBe(false)
    }
  })

  it('stops soon after the child lets go', () => {
    const { inst } = start()
    press(inst, 'ArrowRight')
    ticks(inst, 240)
    const resting = nib(inst).x
    ticks(inst, 240)
    expect(nib(inst).x).toBe(resting)
  })

  it('cycles the BRUSH on SPACE and comes back around', () => {
    // SPACE used to cycle five COLOURS. Under one ink it cycles what a child
    // can see the difference between: a small nib, a fat one, and the rubber
    // — which is the same size as the fat nib but HOLLOW.
    const { inst } = start()
    const shapes: string[] = []
    for (let i = 0; i < BRUSHES.length + 1; i++) {
      const n = nib(inst)
      shapes.push(`${n.op}:${n.w}x${n.h}`)
      press(inst, ' ')
    }
    expect(new Set(shapes.slice(0, BRUSHES.length)).size).toBe(BRUSHES.length)
    expect(shapes[BRUSHES.length]).toBe(shapes[0])
    // The rubber is the hollow one, and nothing else is.
    expect(shapes.filter((s) => s.startsWith('outline'))).toHaveLength(1)
  })

  it('draws fatter after one SPACE, and rubs out after two', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 6)
    const fine = marks().length
    expect(fine).toBeGreaterThan(3)

    press(inst, ' ')                       // the fat brush
    stroke(inst, 'ArrowDown', 6)
    const fat = marks().length - fine
    expect(fat, 'the fat brush drew no more than the fine one')
      .toBeGreaterThan(fine)

    press(inst, ' ')                       // the rubber
    stroke(inst, 'ArrowUp', 6)
    expect(marks().length, 'the rubber did not take anything away')
      .toBeLessThan(fine + fat)
    // And it never empties the page by itself: rubbing is local, unlike C.
    expect(marks().length).toBeGreaterThan(0)
  })

  it('clears the page on c, on ב, and on backspace — never saying anything about it', () => {
    for (const key of ['c', 'C', 'ב', 'Backspace', 'Delete']) {
      const { inst, said } = start()
      stroke(inst, 'ArrowRight', 5)
      expect(marks().length, `${key}: nothing was drawn`).toBeGreaterThan(0)
      press(inst, key)
      expect(marks(), `${key} did not clear`).toHaveLength(0)
      expect(said, `${key} said something`).toHaveLength(0)
    }
  })

  it('keeps the pen and the picture on the paper, however hard a child mashes', () => {
    const { inst } = start()
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      for (let i = 0; i < 400; i++) { press(inst, key); ticks(inst, 1) }
      assertInside(inst)
    }
    const paper = paperOf(cmds(inst))
    for (const p of painted(inst)) {
      expect(p.x).toBeGreaterThanOrEqual(paper.x + paper.t)
      expect(p.x + DOT_W).toBeLessThanOrEqual(paper.x + paper.w - paper.t)
      expect(p.y).toBeGreaterThanOrEqual(paper.y + paper.t)
      expect(p.y + DOT_H).toBeLessThanOrEqual(paper.y + paper.h - paper.t)
    }
  })

  it('keeps a drawing on the paper across a mid-play resize', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 12)
    const wide90 = painted(inst, 90).length
    assertInside(inst, 90)
    // Shrink: whatever no longer fits is simply not painted…
    assertInside(inst, 30)
    expect(painted(inst, 30).length).toBeLessThanOrEqual(wide90)
    // …and widening again brings the child's line back untouched.
    expect(painted(inst, 90).length).toBe(wide90)
    assertInside(inst, 90)
  })

  it('paints no number anywhere on the page', () => {
    const { inst } = start()
    for (const key of ['ArrowRight', 'ArrowDown', ' ', 'ArrowLeft']) {
      stroke(inst, key, 4)
      for (const cmd of cmds(inst)) {
        const payload = cmd.op === 'text' ? cmd.text
          : cmd.op === 'put' ? cmd.ch
            : cmd.op === 'emoji' ? cmd.emoji : ''
        expect(/\d/.test(payload), `painted "${payload}"`).toBe(false)
      }
    }
  })

  it('has a warm souvenir at zero progress, in both languages', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const s = inst.souvenir?.() ?? ''
      expect(s.length, `${locale} fresh souvenir was empty`).toBeGreaterThan(0)
      expect(/\d/.test(s), `${locale} fresh souvenir had a digit: ${s}`).toBe(false)
    }
    expect(start(1, 'en').inst.souvenir?.())
      .toBe('the paper is still blank — come back and draw!')
    expect(start(1, 'he').inst.souvenir?.())
      .toBe('הדף עדיין ריק — בואו לצייר!')
  })

  it('names what happened, and remembers it through a clear', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 3)
    expect(inst.souvenir?.()).toBe('you drew something!')
    press(inst, ' ')                       // the fat brush
    for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) {
      stroke(inst, key, 24)
    }
    expect(inst.souvenir?.()).toBe('you filled the whole page!')
    // Shaking the page clean does not un-draw what the child did.
    press(inst, 'c')
    expect(inst.souvenir?.()).toBe('you filled the whole page!')
  })

  it('never counts, whatever the child does', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      for (let i = 0; i < 30; i++) {
        stroke(inst, i % 2 === 0 ? 'ArrowRight' : 'ArrowUp', 2)
        press(inst, ' ')
        const s = inst.souvenir?.() ?? ''
        expect(/\d/.test(s), `${locale} souvenir counted: ${s}`).toBe(false)
      }
    }
  })

  it('never says a child lost, in either language', () => {
    const BAD = /lose|lost|fail|wrong|game over|mistake|no!/i
    const BAD_HE = /הפסד|נכשל|טעות|לא נכון|סוף המשחק/
    for (const locale of ['en', 'he'] as Locale[]) {
      const strings = pad.strings?.[locale] ?? {}
      for (const [key, value] of Object.entries(strings)) {
        expect(BAD.test(value), `${locale} ${key}: ${value}`).toBe(false)
        expect(BAD_HE.test(value), `${locale} ${key}: ${value}`).toBe(false)
      }
    }
  })

  it('has no ESC hint of its own — the shell owns that', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { ctx } = testCtx({ locale, strings: pad.strings })
      const hints = pad.hints(ctx.t)
      expect(hints.length).toBe(3)
      for (const h of hints) {
        expect(h.keys.includes('ESC')).toBe(false)
        expect(h.label.length).toBeGreaterThan(0)
        expect(h.label).not.toContain('draw.')
      }
    }
  })

  it('draws the same page twice, and a drawn page differently', () => {
    const blank = pixelsOf(start(1).inst, pad.size)
    expect(pixelsOf(start(1).inst, pad.size)).toBe(blank)
    const drawn = start(1)
    stroke(drawn.inst, 'ArrowRight', 6)
    expect(pixelsOf(drawn.inst, pad.size)).not.toBe(blank)
    expect(blank.split('\n')).toHaveLength(G.h * PX_PER_CELL)
    expect(blank.split('\n')[0]).toHaveLength(G.w * PX_PER_CELL)
  })
})

describe("draw's picture is a save file", () => {
  it('is plain JSON, and survives a round trip unchanged', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 4)
    press(inst, ' ')
    stroke(inst, 'ArrowDown', 4)

    const d = currentDrawing()!
    expect(d).not.toBeNull()
    const copy = JSON.parse(JSON.stringify(d)) as Drawing
    expect(copy).toEqual(d)
    expect(copy.w).toBeGreaterThan(0)
    expect(copy.h).toBeGreaterThan(0)
    // The lattice's own proportions travel with the picture, so an exporter
    // knows a dot is 5 x 3 logical pixels and not a square.
    expect(copy.dot).toEqual({ w: DOT_W, h: DOT_H })
    expect(Object.keys(copy.marks).length).toBeGreaterThan(4)
    // One ink, and it is the theme's own foreground.
    for (const v of Object.values(copy.marks)) expect(v).toBe('plain')
  })

  it('lists every mark at a real dot of the lattice', () => {
    const { inst } = start()
    stroke(inst, 'ArrowRight', 5)
    const d = currentDrawing()!
    const list = marksOf(d)
    expect(list.length).toBeGreaterThan(3)
    for (const m of list) {
      expect(m.ink).toBe('plain')
      expect(Number.isInteger(m.x)).toBe(true)
      expect(Number.isInteger(m.y)).toBe(true)
      expect(m.x).toBeGreaterThanOrEqual(0)
      expect(m.x).toBeLessThan(d.w)
      expect(m.y).toBeGreaterThanOrEqual(0)
      expect(m.y).toBeLessThan(d.h)
    }
  })

  it('starts empty and clears back to empty', () => {
    expect(emptyDrawing(4, 4).marks).toEqual({})
    const { inst } = start()
    stroke(inst, 'ArrowUp', 4)
    expect(Object.keys(currentDrawing()!.marks).length).toBeGreaterThan(0)
    press(inst, 'c')
    expect(currentDrawing()!.marks).toEqual({})
  })
})
