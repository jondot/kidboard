import { describe, it, expect, vi } from 'vitest'
import type { DrawCmd, Frame } from '../types'
import { Canvas, rasterize } from './Canvas'
import { PX_PER_CELL } from './shapes'
import {
  CELL_ASPECT, MAX_CELL, MIN_CELL, TONE_FALLBACK,
  atlasKey, createGridRenderer, gridFor, layout, layoutGrid,
  rowsFor, themeKey, tonesFrom,
  type Ctx2D, type Surface,
} from './GridCanvas'

// ---- a 2D context that records everything -------------------------------

type Call = { fn: string; args: unknown[]; style?: string }

function stubCtx(): Ctx2D & { calls: Call[]; of(fn: string): Call[] } {
  const calls: Call[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
  const ctx = {
    calls,
    of(fn: string) { return calls.filter((c) => c.fn === fn) },
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    clearRect: rec('clearRect'),
    fillText: rec('fillText'),
    drawImage: rec('drawImage'),
    // Records the live `fillStyle` alongside the geometry, because for a
    // shape that colour IS the drawing.
    fillRect: (...args: unknown[]) => {
      calls.push({ fn: 'fillRect', args, style: ctx.fillStyle })
    },
    save: rec('save'),
    restore: rec('restore'),
  }
  return ctx as unknown as Ctx2D & { calls: Call[]; of(fn: string): Call[] }
}

const stubSurface = (): Surface & { ctx: ReturnType<typeof stubCtx> } => {
  const ctx = stubCtx()
  return { width: 0, height: 0, getContext: () => ctx, ctx }
}

const frameOfCmds = (cmds: DrawCmd[], w = 10, h = 4): Frame => ({ cmds, w, h })

// ---- geometry ------------------------------------------------------------

describe('rowsFor', () => {
  it('derives rows from the declared columns and aspect', () => {
    // ball: 30 cols at 9/7 is the 30x14 court it has always drawn.
    expect(rowsFor({ cols: 30, aspect: 9 / 7 })).toBe(14)
    // piano: 30 cols at 9/4 is 30x8.
    expect(rowsFor({ cols: 30, aspect: 9 / 4 })).toBe(8)
  })

  it('never returns zero or a fraction, whatever it is handed', () => {
    for (const size of [
      { cols: 1, aspect: 100 }, { cols: 0, aspect: 1 },
      { cols: 30, aspect: 0 }, { cols: 30, aspect: -3 },
    ]) {
      const r = rowsFor(size)
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('gridFor', () => {
  it('is the declared grid when no wider column count is offered', () => {
    expect(gridFor({ cols: 30, aspect: 9 / 7 })).toEqual({ w: 30, h: 14 })
  })

  it('widens to the offered column count but never narrows below the declared one', () => {
    expect(gridFor({ cols: 30, aspect: 9 / 7 }, 46).w).toBe(46)
    expect(gridFor({ cols: 30, aspect: 9 / 7 }, 4).w).toBe(30)
    expect(gridFor({ cols: 30, aspect: 9 / 7 }, NaN).w).toBe(30)
  })
})

describe('layout', () => {
  it('fills the container width exactly at the declared column count', () => {
    const l = layout(360, 30, 9 / 7)
    expect(l.cols).toBe(30)
    expect(l.rows).toBe(14)
    expect(l.cellW).toBeCloseTo(12, 6)
    expect(l.cssW).toBeCloseTo(360, 6)
  })

  it('hands a wide container extra columns rather than giant cells', () => {
    const l = layout(1400, 30, 9 / 7)
    expect(l.cellW).toBeLessThanOrEqual(MAX_CELL)
    expect(l.cols).toBeGreaterThan(30)
    expect(l.cssW).toBeLessThanOrEqual(1400)
    // Rows are a property of the game, so a wider window must not make it taller.
    expect(l.rows).toBe(14)
  })

  it('keeps the cell aspect whatever the width', () => {
    for (const w of [200, 380, 600, 1024, 2560]) {
      const l = layout(w, 30, 9 / 7)
      expect(l.cellW / l.cellH).toBeCloseTo(CELL_ASPECT, 6)
    }
  })

  it('never divides by zero on a container that has not been measured yet', () => {
    for (const w of [0, -50, NaN, Infinity]) {
      const l = layout(w, 30, 9 / 7)
      expect(l.cols).toBe(30)
      expect(l.cellW).toBe(MIN_CELL)
      expect(Number.isFinite(l.pixelW)).toBe(true)
      expect(l.pixelW).toBeGreaterThan(0)
    }
  })

  it('scales the backing store by device pixel ratio', () => {
    const one = layout(360, 30, 9 / 7, 1)
    const two = layout(360, 30, 9 / 7, 2)
    expect(two.cssW).toBeCloseTo(one.cssW, 6)
    expect(two.pixelW).toBe(one.pixelW * 2)
    // Height rounds independently at each dpr, so allow the rounding pixel.
    expect(Math.abs(two.pixelH - one.pixelH * 2)).toBeLessThanOrEqual(2)
  })

  it('treats a nonsense dpr as 1 rather than producing a zero-sized canvas', () => {
    for (const d of [0, -2, NaN]) {
      expect(layout(360, 30, 9 / 7, d).dpr).toBe(1)
    }
  })
})

describe('layoutGrid', () => {
  it('divides the measured width by the column count the session already chose', () => {
    const l = layoutGrid(460, 46, 14, 1)
    expect(l.cols).toBe(46)
    expect(l.rows).toBe(14)
    expect(l.cellW).toBeCloseTo(10, 6)
  })

  it('agrees with layout() on cell size for the grid layout() picked', () => {
    const a = layout(1400, 30, 9 / 7, 2)
    const b = layoutGrid(1400, a.cols, a.rows, 2)
    expect(b.cellW).toBeCloseTo(a.cellW, 9)
    expect(b.pixelW).toBe(a.pixelW)
  })
})

// ---- atlas keying --------------------------------------------------------

describe('atlasKey', () => {
  it('is stable for the same geometry and theme', () => {
    expect(atlasKey(20, 33.3, 2, 'dark')).toBe(atlasKey(20, 33.3, 2, 'dark'))
  })

  it('changes with cell size, dpr or theme — and with nothing else', () => {
    const base = atlasKey(20, 33.3, 2, 'dark')
    expect(atlasKey(21, 33.3, 2, 'dark')).not.toBe(base)
    expect(atlasKey(20, 35, 2, 'dark')).not.toBe(base)
    expect(atlasKey(20, 33.3, 1, 'dark')).not.toBe(base)
    expect(atlasKey(20, 33.3, 2, 'light')).not.toBe(base)
  })

  it('absorbs sub-pixel resize jitter so a good atlas is not thrown away', () => {
    expect(atlasKey(20.01, 33.34, 2, 'dark')).toBe(atlasKey(20.02, 33.31, 2, 'dark'))
  })
})

describe('themeKey', () => {
  it('changes when any tone changes', () => {
    const a = themeKey(TONE_FALLBACK)
    expect(themeKey({ ...TONE_FALLBACK, warm: '#000000' })).not.toBe(a)
  })
})

describe('tonesFrom', () => {
  it('falls back to the shipped palette when nothing can be computed', () => {
    expect(tonesFrom(null)).toEqual(TONE_FALLBACK)
  })

  it('reads live custom properties when they exist', () => {
    const el = document.createElement('div')
    el.style.setProperty('--kb-warm', '#123456')
    document.body.appendChild(el)
    expect(tonesFrom(el).warm).toBe('#123456')
    // Untouched tones keep their shipped value rather than going blank.
    expect(tonesFrom(el).plain).toBe(TONE_FALLBACK.plain)
    el.remove()
  })

  it('never throws on something that is not an element', () => {
    expect(() => tonesFrom({} as unknown)).not.toThrow()
  })
})

// ---- the paint pass ------------------------------------------------------

// A 10px cell whatever the grid, so every expectation below is exact.
const renderer = (w = 10, h = 4, dpr = 1) => {
  const ctx = stubCtx()
  const sheet = stubSurface()
  const lay = layoutGrid(w * 10, w, h, dpr)
  const r = createGridRenderer({
    ctx, layout: lay, colors: TONE_FALLBACK, createSurface: () => sheet,
  })
  return { r, ctx, sheet, lay }
}

describe('createGridRenderer', () => {
  it('clears the whole backing store before every frame', () => {
    const { r, ctx, lay } = renderer()
    r.paint(frameOfCmds([]))
    expect(ctx.of('clearRect')[0]!.args).toEqual([0, 0, lay.pixelW, lay.pixelH])
  })

  it('blits one cached glyph per drawn character', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([{ op: 'text', x: 1, y: 1, text: 'abc', tone: 'plain' }]))
    expect(ctx.of('drawImage')).toHaveLength(3)
  })

  it('rasterizes each distinct (char, tone) exactly once, then reuses it', () => {
    const { r, sheet } = renderer()
    const cmds: DrawCmd[] = [
      { op: 'text', x: 0, y: 0, text: 'aaaa', tone: 'plain' },
      { op: 'text', x: 0, y: 1, text: 'aaaa', tone: 'warm' },
    ]
    r.paint(frameOfCmds(cmds))
    r.paint(frameOfCmds(cmds))
    // 'a' in two tones = two atlas entries, across eight blits and two frames.
    expect(sheet.ctx.of('fillText')).toHaveLength(2)
  })

  it('skips blanks, so an empty grid costs nothing', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([{ op: 'text', x: 0, y: 0, text: '   ', tone: 'plain' }]))
    expect(ctx.of('drawImage')).toHaveLength(0)
  })

  const destOf = (x: number, dpr = 2) => {
    const { r, ctx } = renderer(10, 4, dpr)
    r.paint(frameOfCmds([{ op: 'put', x, y: 1, ch: 'o', tone: 'warm' }]))
    return ctx.of('drawImage')[0]!.args.slice(5) as number[]
  }

  it('places an INTEGER coordinate on a whole device pixel, so scenery stays crisp', () => {
    const [dx, dy] = destOf(3)
    expect(Number.isInteger(dx!)).toBe(true)
    expect(Number.isInteger(dy!)).toBe(true)
  })

  it('places a FRACTIONAL coordinate at its exact sub-pixel offset', () => {
    const { lay } = renderer(10, 4, 2)
    const at3 = destOf(3)[0]!
    const at34 = destOf(3.4)[0]!
    expect(at34 - at3).toBeCloseTo(0.4 * lay.cellW * lay.dpr, 9)
    // …and a coordinate whose sub-cell part is not a whole pixel is not
    // silently snapped to one.
    expect(Number.isInteger(destOf(3.07)[0]!)).toBe(false)
  })

  it('moves a sprite by a different amount on every frame at 0.58 cells/frame', () => {
    const { r, ctx, lay } = renderer(30, 14, 1)
    const xs: number[] = []
    for (let i = 0; i < 6; i++) {
      ctx.calls.length = 0
      r.paint(frameOfCmds([{ op: 'put', x: 3 + i * 0.58, y: 1, ch: 'o', tone: 'warm' }]))
      xs.push(ctx.of('drawImage')[0]!.args[5] as number)
    }
    // The defect this whole renderer exists to fix: consecutive positions must
    // differ, and by the SAME amount each time. Rounding gave 0,0,1,1,0,1.
    const steps = xs.slice(1).map((x, i) => x - xs[i]!)
    for (const s of steps) expect(s).toBeCloseTo(0.58 * lay.cellW, 6)
    expect(new Set(xs).size).toBe(6)
  })

  it('gives an emoji exactly two cells of advance, with no CSS involved', () => {
    const { r, ctx, lay } = renderer()
    r.paint(frameOfCmds([{ op: 'emoji', x: 2, y: 0, emoji: '🐟' }]))
    const args = ctx.of('drawImage')[0]!.args as number[]
    // The blit is wide enough for two cells: the grid is square by construction.
    expect(args[3]!).toBeGreaterThanOrEqual(2 * lay.cellW * lay.dpr)
  })

  it('draws a box with the same geometry rasterize uses', () => {
    const c = new Canvas(6, 3)
    c.box(0, 0, 6, 3, 'cool')
    const { r, ctx } = renderer(6, 3)
    r.paint(frameOfCmds(c.cmds(), 6, 3))
    // 4 corners + 8 horizontal edge cells + 2 vertical: same 14 glyphs the
    // integer model produces for a 6x3 box.
    expect(ctx.of('drawImage')).toHaveLength(14)
  })

  // FINDING 1: a fractional box EXTENT used to be drawn raw, so the walls
  // sheared away from where `rasterize` puts them. c.box(0, 0, 10.6, 4)
  // rounds w to 11 in the model, so the right wall belongs at column 10 —
  // not at the raw 9.6 the unfixed painter drew it at. Cross-checked against
  // a `put` at column 10 rather than a hardcoded pixel, so the comparison
  // does not need to know about the atlas's internal padding offset.
  it("rounds a box's fractional extent to the same whole cell rasterize uses, so the walls do not shear", () => {
    const { r, ctx } = renderer(12, 4, 1)

    r.paint(frameOfCmds([{ op: 'put', x: 10, y: 0, ch: '+', tone: 'plain' }], 12, 4))
    const modelWallDx = ctx.of('drawImage')[0]!.args[5] as number

    ctx.calls.length = 0
    r.paint(frameOfCmds([{ op: 'box', x: 0, y: 0, w: 10.6, h: 4, tone: 'plain' }], 12, 4))
    const boxWallDx = Math.max(...ctx.of('drawImage').map((c) => (c.args as number[])[5]!))
    expect(boxWallDx).toBe(modelWallDx)
  })

  // FINDING 1, position half: only the box's EXTENT rounds. A fractional
  // ORIGIN must still glide smoothly, exactly like a `put` sprite does — a
  // sliding frame is a real thing a game will want. Cross-checked against a
  // `put` at the same fractional x for the same offset-invariance reason.
  it('does NOT round a fractional box position, only its extent', () => {
    const { r, ctx } = renderer(12, 4, 1)

    r.paint(frameOfCmds([{ op: 'put', x: 3.4, y: 0, ch: '+', tone: 'plain' }], 12, 4))
    const putDx = ctx.of('drawImage')[0]!.args[5] as number

    ctx.calls.length = 0
    r.paint(frameOfCmds([{ op: 'box', x: 3.4, y: 0, w: 4, h: 4, tone: 'plain' }], 12, 4))
    const boxDx = Math.min(...ctx.of('drawImage').map((c) => (c.args as number[])[5]!))
    expect(boxDx).toBe(putDx)
  })

  // FINDING 2, cross-check: a `put` emoji reserves its continuation cell in
  // the model (see Canvas.test.ts), and — because the painter already gives
  // every wide glyph a two-cell advance regardless of which op drew it — two
  // sprites spaced two cells apart paint exactly where the model reserved
  // them, with no overlap.
  it('paints two put-drawn emoji spaced two cells apart exactly where rasterize reserved them', () => {
    const cmds: DrawCmd[] = [
      { op: 'put', x: 0, y: 0, ch: '🐱', tone: 'plain' },
      { op: 'put', x: 2, y: 0, ch: '🐶', tone: 'plain' },
    ]
    expect(rasterize(cmds, 4, 1)[0]!.map((c) => c.ch)).toEqual(['🐱', '', '🐶', ''])

    const { r, ctx, lay } = renderer(4, 1, 1)
    r.paint(frameOfCmds(cmds, 4, 1))
    const xs = ctx.of('drawImage').map((c) => (c.args as number[])[5] as number)
    // Exactly the two cells rasterize reserved apart — no overlap.
    expect(xs[1]! - xs[0]!).toBe(2 * lay.cellW)
  })

  // THE RESIDUAL CAVEAT FROM A8, NOW CLOSED. The painter used to advance a
  // `text` run one cell per JS-string index (`cmd.x + i`) regardless of
  // glyph width, so consecutive wide graphemes overlapped on screen even
  // after the model started reserving their continuation cells correctly.
  // Both consumers now advance by the SAME rule — two cells per wide
  // grapheme, one per narrow one — so they agree column for column.
  it('text advances two cells per wide grapheme on the canvas too, so three consecutive emoji never overlap', () => {
    const cmds: DrawCmd[] = [{ op: 'text', x: 0, y: 0, text: '🐟🐟🐟', tone: 'plain' }]
    expect(rasterize(cmds, 6, 1)[0]!.map((c) => c.ch)).toEqual(['🐟', '', '🐟', '', '🐟', ''])

    const { r, ctx, lay } = renderer(6, 1, 1)
    r.paint(frameOfCmds(cmds, 6, 1))
    const xs = ctx.of('drawImage').map((c) => (c.args as number[])[5] as number)
    expect(xs).toHaveLength(3)
    expect(xs[1]! - xs[0]!).toBe(2 * lay.cellW)
    expect(xs[2]! - xs[1]!).toBe(2 * lay.cellW)
  })

  it('text advances a narrow grapheme by one cell and a wide one by two on the canvas, matching the model', () => {
    const cmds: DrawCmd[] = [{ op: 'text', x: 0, y: 0, text: 'a🐱b', tone: 'plain' }]
    expect(rasterize(cmds, 4, 1)[0]!.map((c) => c.ch)).toEqual(['a', '🐱', '', 'b'])

    const { r, ctx, lay } = renderer(4, 1, 1)
    r.paint(frameOfCmds(cmds, 4, 1))
    const xs = ctx.of('drawImage').map((c) => (c.args as number[])[5] as number)
    // 'a' -> cat is a one-cell advance (narrow); cat -> 'b' is two cells
    // (wide) — 'b' lands past the cat's tail instead of on top of it.
    // Compared as differences, not absolute pixels: the atlas offsets every
    // destination x by its internal padding constant (see A8's finding 1).
    expect(xs[1]! - xs[0]!).toBe(1 * lay.cellW)
    expect(xs[2]! - xs[1]!).toBe(2 * lay.cellW)
  })

  it('paints a ZWJ emoji sequence as one wide glyph at its own two-cell advance', () => {
    const family = '👨‍👩‍👧‍👦'
    const cmds: DrawCmd[] = [{ op: 'text', x: 0, y: 0, text: family + 'x', tone: 'plain' }]
    const { r, ctx, lay } = renderer(6, 1, 1)
    r.paint(frameOfCmds(cmds, 6, 1))
    const xs = ctx.of('drawImage').map((c) => (c.args as number[])[5] as number)
    expect(xs).toHaveLength(2)
    expect(xs[1]! - xs[0]!).toBe(2 * lay.cellW)
  })

  it('clips a glyph drawn far outside the grid instead of blitting it', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'put', x: -99, y: 0, ch: 'x', tone: 'plain' },
      { op: 'put', x: 0, y: 999, ch: 'x', tone: 'plain' },
    ]))
    expect(ctx.of('drawImage')).toHaveLength(0)
  })

  it('honours a clear command that actually has something to erase', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'put', x: 0, y: 0, ch: 'x', tone: 'plain' },
      { op: 'clear' },
    ]))
    expect(ctx.of('clearRect')).toHaveLength(2)
  })

  // Every cartridge's draw() opens with c.clear(), and the painter has already
  // wiped the surface — a second full-surface clear per frame is pure waste.
  it('skips a leading clear, because the frame started clean', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'clear' },
      { op: 'put', x: 0, y: 0, ch: 'x', tone: 'plain' },
    ]))
    expect(ctx.of('clearRect')).toHaveLength(1)
  })

  it('falls back to fillText when no offscreen sheet can be made', () => {
    const ctx = stubCtx()
    const r = createGridRenderer({
      ctx, layout: layoutGrid(100, 10, 4, 1), createSurface: () => null,
    })
    r.paint(frameOfCmds([{ op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' }]))
    expect(ctx.of('drawImage')).toHaveLength(0)
    expect(ctx.of('fillText')).toHaveLength(1)
  })

  it('never throws when the context misbehaves mid-frame', () => {
    const ctx = stubCtx()
    ctx.drawImage = () => { throw new Error('context lost') }
    const r = createGridRenderer({
      ctx, layout: layoutGrid(100, 10, 4, 1), createSurface: stubSurface,
    })
    expect(() => r.paint(frameOfCmds([
      { op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' },
    ]))).not.toThrow()
  })

  it('never throws when the offscreen sheet has no context of its own', () => {
    const ctx = stubCtx()
    const blind: Surface = { width: 0, height: 0, getContext: () => null }
    const r = createGridRenderer({
      ctx, layout: layoutGrid(100, 10, 4, 1), createSurface: () => blind,
    })
    expect(() => r.paint(frameOfCmds([
      { op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' },
    ]))).not.toThrow()
    expect(ctx.of('fillText')).toHaveLength(1)
  })

  it('rebuilds the atlas on a cell-size change and on nothing else', () => {
    const made = vi.fn(stubSurface)
    const ctx = stubCtx()
    const r = createGridRenderer({
      ctx, layout: layoutGrid(60, 10, 4, 1), colors: TONE_FALLBACK,
      createSurface: made,
    })
    r.paint(frameOfCmds([]))
    expect(made).toHaveBeenCalledTimes(1)

    r.paint(frameOfCmds([]))                       // same geometry: no rebuild
    expect(made).toHaveBeenCalledTimes(1)

    r.setLayout(layoutGrid(120, 10, 4, 1))         // cells got bigger
    r.paint(frameOfCmds([]))
    expect(made).toHaveBeenCalledTimes(2)

    r.setColors({ ...TONE_FALLBACK, warm: '#ff0000' })
    r.paint(frameOfCmds([]))
    expect(made).toHaveBeenCalledTimes(3)
  })

  it('repaints the last frame after a resize without being handed it again', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([{ op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' }]))
    ctx.calls.length = 0
    r.setLayout(layoutGrid(60, 10, 4, 1))
    r.repaint()
    expect(ctx.of('drawImage')).toHaveLength(1)
  })

  it('stops painting once destroyed, so an unmounted block cannot draw', () => {
    const { r, ctx } = renderer()
    r.destroy()
    ctx.calls.length = 0
    r.paint(frameOfCmds([{ op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' }]))
    r.repaint()
    expect(ctx.calls).toHaveLength(0)
  })
})

// ---- shapes --------------------------------------------------------------

describe('createGridRenderer: the pixel field', () => {
  // renderer() gives a 10px cell, so one logical pixel is 10/8 = 1.25 device
  // pixels across and (10 / 0.6) / 8 = 2.083 down at dpr 1.
  const SX = 10 / PX_PER_CELL
  const SY = (10 / CELL_ASPECT) / PX_PER_CELL

  it('paints a filled rectangle as one flat fill', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([{ op: 'rect', x: 0, y: 0, w: 8, h: 8, tone: 'warm' }]))
    const fills = ctx.of('fillRect')
    expect(fills).toHaveLength(1)
    expect(fills[0]!.args).toEqual([
      0, 0, Math.round(8 * SX), Math.round(8 * SY),
    ])
    expect(fills[0]!.style).toBe(TONE_FALLBACK.warm)
  })

  // FLAT FILLS ONLY. No gradient, no shadow, no alpha: a shape frame touches
  // exactly two members of the 2D context, and this is what says so.
  it('uses nothing but clearRect and fillRect for a frame of shapes', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'rect', x: 1, y: 1, w: 4, h: 4, tone: 'warm' },
      { op: 'outline', x: 0, y: 0, w: 40, h: 20, t: 2, tone: 'cool' },
      { op: 'disc', x: 10, y: 10, r: 4, tone: 'win' },
      { op: 'line', x: 0, y: 0, x2: 20, y2: 9, tone: 'art' },
      { op: 'sprite', x: 2, y: 2, rows: ['##', ' #'], tone: 'magic', flipX: false, flipY: false, scale: 1 },
    ]))
    expect([...new Set(ctx.calls.map((c) => c.fn))].sort())
      .toEqual(['clearRect', 'fillRect'])
  })

  // HARD EDGES. Every painted edge lands on a whole DEVICE pixel however
  // fractional the shape's position — that is what keeps a 1977 edge crisp
  // on a 2026 display.
  it('snaps every edge to a whole device pixel, whatever the fraction', () => {
    const { r, ctx } = renderer(10, 4, 2)
    r.paint(frameOfCmds([
      { op: 'rect', x: 3.37, y: 2.91, w: 5, h: 3, tone: 'warm' },
      { op: 'disc', x: 12.4, y: 6.6, r: 3, tone: 'cool' },
    ]))
    expect(ctx.of('fillRect').length).toBeGreaterThan(1)
    for (const call of ctx.of('fillRect')) {
      for (const n of call.args as number[]) {
        expect(Number.isInteger(n), `edge at ${String(n)} is not a whole device pixel`).toBe(true)
      }
    }
  })

  // …AND SMOOTH MOTION. Snapping to a *logical* pixel would quantize a slow
  // sprite back into the lurch this project already paid to remove. Device
  // snapping is far finer, so a tenth-of-a-pixel step still moves the paint.
  it('moves a sprite by less than one logical pixel without freezing it', () => {
    const { r, ctx } = renderer(10, 4, 2)
    const device = new Set<number>()
    const logical = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const x = 4 + i * 0.1
      ctx.calls.length = 0
      r.paint(frameOfCmds([{ op: 'rect', x, y: 1, w: 4, h: 4, tone: 'warm' }]))
      device.add(ctx.of('fillRect')[0]!.args[0] as number)
      logical.add(Math.round(x))
    }
    expect(device.size).toBeGreaterThan(logical.size)
    expect(device.size).toBeGreaterThan(3)
  })

  // A rectangle never loses its last device pixel to rounding, so a one-pixel
  // line stays visible instead of blinking out at some cell sizes.
  it('never paints a shape away to nothing', () => {
    const { r, ctx } = renderer(10, 4, 1)
    r.paint(frameOfCmds([{ op: 'rect', x: 5, y: 5, w: 1, h: 1, tone: 'warm' }]))
    const [, , w, h] = ctx.of('fillRect')[0]!.args as number[]
    expect(w).toBeGreaterThanOrEqual(1)
    expect(h).toBeGreaterThanOrEqual(1)
  })

  it('paints shapes and characters into the same picture, in command order', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'clear' },
      { op: 'rect', x: 0, y: 0, w: 8, h: 8, tone: 'cool' },
      { op: 'put', x: 1, y: 1, ch: 'x', tone: 'plain' },
    ]))
    expect(ctx.of('fillRect')).toHaveLength(1)
    expect(ctx.of('drawImage')).toHaveLength(1)
    const order = ctx.calls.map((c) => c.fn)
    expect(order.indexOf('fillRect')).toBeLessThan(order.indexOf('drawImage'))
  })

  it('clears a frame that drew shapes, so nothing smears across frames', () => {
    const { r, ctx, lay } = renderer()
    r.paint(frameOfCmds([{ op: 'rect', x: 0, y: 0, w: 4, h: 4, tone: 'warm' }]))
    ctx.calls.length = 0
    r.paint(frameOfCmds([{ op: 'clear' }, { op: 'rect', x: 0, y: 0, w: 4, h: 4, tone: 'warm' }]))
    expect(ctx.of('clearRect')[0]!.args).toEqual([0, 0, lay.pixelW, lay.pixelH])
  })

  it('draws nothing at all for a shape that is entirely off the field', () => {
    const { r, ctx } = renderer()
    r.paint(frameOfCmds([
      { op: 'rect', x: -900, y: -900, w: 4, h: 4, tone: 'warm' },
      { op: 'rect', x: 9000, y: 9000, w: 4, h: 4, tone: 'warm' },
    ]))
    expect(ctx.of('fillRect')).toHaveLength(0)
  })

  it('never throws when the context dies mid-shape', () => {
    const ctx = stubCtx()
    ctx.fillRect = () => { throw new Error('context lost') }
    const r = createGridRenderer({
      ctx, layout: layoutGrid(100, 10, 4, 1), createSurface: stubSurface,
    })
    expect(() => r.paint(frameOfCmds([
      { op: 'disc', x: 4, y: 4, r: 3, tone: 'warm' },
    ]))).not.toThrow()
  })

  // CHUNKY BY CONSTRUCTION. At the largest cell the runtime allows, one
  // logical pixel is several device pixels on an ordinary retina display —
  // deliberately blocky, not a low-resolution accident.
  it('makes a logical pixel several device pixels at a typical cell size', () => {
    const lay = layoutGrid(MAX_CELL * 30, 30, 14, 2)
    expect((lay.cellW * lay.dpr) / PX_PER_CELL).toBeGreaterThanOrEqual(4)
    const small = layoutGrid(MIN_CELL * 30, 30, 14, 2)
    expect((small.cellW * small.dpr) / PX_PER_CELL).toBeGreaterThanOrEqual(1)
  })
})
