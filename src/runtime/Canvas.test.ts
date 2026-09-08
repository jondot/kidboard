import { describe, it, expect } from 'vitest'
import { Canvas, rasterize, rasterizeWithShapes, frameToString } from './Canvas'
import { PX_PER_CELL, rasterizePixels, pixelArt } from './shapes'

const render = (f: (c: Canvas) => void, w = 8, h = 3): string => {
  const c = new Canvas(w, h)
  f(c)
  return frameToString(rasterize(c.cmds(), w, h))
}

describe('Canvas', () => {
  it('records commands instead of pixels, so the buffer is serializable', () => {
    const c = new Canvas(4, 2)
    c.clear()
    c.put(1, 1, 'x', 'warm')
    expect(c.cmds()).toEqual([
      { op: 'clear' },
      { op: 'put', x: 1, y: 1, ch: 'x', tone: 'warm' },
    ])
    expect(JSON.parse(JSON.stringify(c.cmds()))).toEqual(c.cmds())
  })

  it('starts blank', () => {
    expect(render(() => {})).toBe('        \n        \n        ')
  })

  it('puts a character', () => {
    expect(render((c) => c.put(2, 1, 'o'))).toBe('        \n  o     \n        ')
  })

  it('writes text', () => {
    expect(render((c) => c.text(1, 0, 'hi'))).toBe(' hi     \n        \n        ')
  })

  it('draws a box with corners', () => {
    expect(render((c) => c.box(0, 0, 4, 3), 4, 3))
      .toBe('+--+\n|  |\n+--+')
  })

  it('clips writes outside the grid instead of throwing', () => {
    expect(() => render((c) => {
      c.put(-5, -5, 'x')
      c.put(99, 99, 'x')
      c.text(6, 0, 'overflowing')
    })).not.toThrow()
  })

  it('clear resets previously drawn cells', () => {
    expect(render((c) => { c.put(0, 0, 'x'); c.clear() }))
      .toBe('        \n        \n        ')
  })

  it('reserves two columns for an emoji so grids stay aligned', () => {
    const cells = rasterize(new Canvas(8, 1).cmds(), 8, 1)
    expect(cells[0]).toHaveLength(8)
    const c = new Canvas(8, 1)
    c.emoji(0, 0, '🐟')
    c.put(2, 0, 'x')
    const out = rasterize(c.cmds(), 8, 1)
    expect(out[0]![0]!.ch).toBe('🐟')
    expect(out[0]![1]!.ch).toBe('')       // continuation cell, renders nothing
    expect(out[0]![2]!.ch).toBe('x')
  })

  it('carries tones through to cells', () => {
    const c = new Canvas(3, 1)
    c.put(0, 0, 'a', 'magic')
    expect(rasterize(c.cmds(), 3, 1)[0]![0]!.tone).toBe('magic')
  })

  // THE FIX. Rounding used to happen at record time, so a ball moving 0.58
  // cells a frame recorded 12, 12, 13, 13 — the same cell twice, then a jump.
  // The float now reaches the painter untouched, while the integer model below
  // still rounds exactly as it always did.
  it('records fractional coordinates verbatim', () => {
    const c = new Canvas(20, 4)
    c.put(12.4, 1.2, 'o', 'warm')
    c.text(3.5, 0.5, 'hi')
    c.emoji(2.25, 1.75, '🐟')
    c.box(0.5, 0.5, 4.5, 2.5)
    expect(c.cmds()).toEqual([
      { op: 'put', x: 12.4, y: 1.2, ch: 'o', tone: 'warm' },
      { op: 'text', x: 3.5, y: 0.5, text: 'hi', tone: 'plain' },
      { op: 'emoji', x: 2.25, y: 1.75, emoji: '🐟' },
      { op: 'box', x: 0.5, y: 0.5, w: 4.5, h: 2.5, tone: 'plain' },
    ])
  })

  it('a fractional buffer is still JSON-serializable', () => {
    const c = new Canvas(8, 3)
    c.put(1.234567, 2.5, 'o', 'warm')
    expect(JSON.parse(JSON.stringify(c.cmds()))).toEqual(c.cmds())
  })

  it('rasterize rounds a fractional position to the nearest cell', () => {
    expect(render((c) => c.put(2.4, 1.4, 'o')))
      .toBe('        \n  o     \n        ')
    expect(render((c) => c.put(2.6, 1.4, 'o')))
      .toBe('        \n   o    \n        ')
  })

  it('rasterize gives the same grid the old record-time rounding gave', () => {
    // 0.58 cells a frame: the integer model is allowed to be lumpy, because
    // it is a model. The canvas painter is the one that must be smooth.
    const cells = []
    for (let i = 0; i < 4; i++) {
      const c = new Canvas(8, 1)
      c.put(1 + i * 0.58, 0, 'o')
      cells.push(frameToString(rasterize(c.cmds(), 8, 1)).indexOf('o'))
    }
    expect(cells).toEqual([1, 2, 2, 3])
  })

  it('rasterize survives a non-finite coordinate instead of throwing', () => {
    const c = new Canvas(4, 2)
    c.put(NaN, 0, 'x')
    c.put(0, Infinity, 'y')
    expect(() => rasterize(c.cmds(), 4, 2)).not.toThrow()
  })

  it('is deterministic: same commands, same frame', () => {
    const f = (c: Canvas) => { c.box(0, 0, 8, 3); c.put(3, 1, '@', 'win') }
    expect(render(f)).toBe(render(f))
  })

  it('rounds a fractional box position instead of throwing', () => {
    const c = new Canvas(8, 4)
    c.box(0, 1.5, 4, 2)
    expect(() => rasterize(c.cmds(), 8, 4)).not.toThrow()
    expect(frameToString(rasterize(c.cmds(), 8, 4)))
      .toBe('        \n        \n+--+    \n+--+    ')
  })

  it('clips a box drawn at a negative origin', () => {
    const c = new Canvas(6, 6)
    c.box(-3, -3, 6, 6)
    expect(() => rasterize(c.cmds(), 6, 6)).not.toThrow()
    expect(frameToString(rasterize(c.cmds(), 6, 6)))
      .toBe('  |   \n  |   \n--+   \n      \n      \n      ')
  })

  it('clips a box larger than the grid', () => {
    const c = new Canvas(6, 4)
    c.box(0, 0, 40, 40)
    expect(() => rasterize(c.cmds(), 6, 4)).not.toThrow()
    const out = frameToString(rasterize(c.cmds(), 6, 4))
    expect(out).toBe('+-----\n|     \n|     \n|     ')
  })

  it('handles degenerate box sizes without throwing', () => {
    const c1 = new Canvas(4, 4)
    c1.box(1, 1, 0, 0)
    expect(() => rasterize(c1.cmds(), 4, 4)).not.toThrow()
    expect(frameToString(rasterize(c1.cmds(), 4, 4)))
      .toBe('++  \n++  \n    \n    ')

    const c2 = new Canvas(4, 4)
    c2.box(1, 1, 1, 1)
    expect(() => rasterize(c2.cmds(), 4, 4)).not.toThrow()
    expect(frameToString(rasterize(c2.cmds(), 4, 4)))
      .toBe('    \n +  \n    \n    ')
  })

  it('clips an emoji at a negative coordinate', () => {
    const c = new Canvas(6, 1)
    c.emoji(-2, 0, '🐟')
    expect(() => rasterize(c.cmds(), 6, 1)).not.toThrow()
    expect(frameToString(rasterize(c.cmds(), 6, 1))).toBe('      ')
  })

  // FINDING 2. `rasterize` used to reserve the continuation cell only for
  // `op: 'emoji'`, while the painter gives ANY wide character a two-cell
  // advance whichever op drew it. An author reaching for `put` (the natural
  // choice when they want a `tone`, since `c.emoji()` takes none) got a
  // model that looked fine and a picture with a full cell of overlap.
  it('put reserves a continuation cell for a wide glyph, matching the two-cell advance the painter gives it', () => {
    const c = new Canvas(4, 1)
    c.put(0, 0, '🐱')
    c.put(2, 0, '🐶')
    const out = rasterize(c.cmds(), 4, 1)
    expect(out[0]!.map((cell) => cell.ch)).toEqual(['🐱', '', '🐶', ''])
  })

  it('text reserves a continuation cell for an embedded wide glyph, matching the painter', () => {
    const c = new Canvas(4, 1)
    c.text(0, 0, 'a🐱')
    const out = rasterize(c.cmds(), 4, 1)
    expect(out[0]!.map((cell) => cell.ch)).toEqual(['a', '🐱', '', ' '])
  })

  // THE RESIDUAL CAVEAT FROM A8, NOW CLOSED. `text` used to advance the
  // cursor once per UTF-16 *code point* (via `[...cmd.text]`) regardless of
  // glyph width, so a wide grapheme's reserved continuation cell was
  // immediately overwritten by whatever came next in the same string. Three
  // fish in one `c.text` call used to paint on top of each other; now each
  // advances the cursor by the two cells the painter actually gives it.
  it('text advances two cells per wide grapheme, so three consecutive emoji land at columns 0, 2 and 4', () => {
    const c = new Canvas(6, 1)
    c.text(0, 0, '🐟🐟🐟')
    const out = rasterize(c.cmds(), 6, 1)
    expect(out[0]!.map((cell) => cell.ch)).toEqual(['🐟', '', '🐟', '', '🐟', ''])
  })

  it('text advances a narrow grapheme by one cell and a wide one by two, even mixed in one string', () => {
    const c = new Canvas(4, 1)
    c.text(0, 0, 'a🐱b')
    const out = rasterize(c.cmds(), 4, 1)
    expect(out[0]!.map((cell) => cell.ch)).toEqual(['a', '🐱', '', 'b'])
  })

  // A ZWJ sequence (here: man + ZWJ + woman + ZWJ + girl + ZWJ + boy, seven
  // code points) is ONE grapheme cluster and one glyph on screen. Splitting
  // by code point — what `[...cmd.text]` does — tears it into pictographic
  // and non-pictographic pieces and misjudges width; `Intl.Segmenter` keeps
  // it whole, so `isWide` sees the real glyph and reserves one continuation
  // cell for it, not several.
  it('treats a ZWJ emoji sequence as a single wide grapheme, not one cell per code point', () => {
    const family = '👨‍👩‍👧‍👦'
    const c = new Canvas(6, 1)
    c.text(0, 0, family + 'x')
    const out = rasterize(c.cmds(), 6, 1)
    expect(out[0]!.map((cell) => cell.ch)).toEqual([family, '', 'x', ' ', ' ', ' '])
  })

  // ---- shapes -----------------------------------------------------------

  it('exposes the pixel field alongside the cell grid, live', () => {
    const c = new Canvas(40, 20)
    expect(c.pw).toBe(40 * PX_PER_CELL)
    expect(c.ph).toBe(20 * PX_PER_CELL)
    expect(c.pw).toBe(320)
    expect(c.ph).toBe(160)
  })

  it('records every shape op as plain data, defaults filled in', () => {
    const c = new Canvas(4, 2)
    c.rect(1, 2, 3, 4)
    c.outline(0, 0, 8, 6, 'cool')
    c.outline(0, 0, 8, 6, 'cool', 3)
    c.line(0, 0, 5, 5, 'art')
    c.disc(4, 4, 2, 'warm')
    c.circle(4, 4, 2)
    c.sprite(1, 1, ['##', ' #'], 'win')
    c.sprite(1, 1, ['##'], 'win', { flipX: true, scale: 2 })
    expect(c.cmds()).toEqual([
      { op: 'rect', x: 1, y: 2, w: 3, h: 4, tone: 'plain' },
      { op: 'outline', x: 0, y: 0, w: 8, h: 6, t: 1, tone: 'cool' },
      { op: 'outline', x: 0, y: 0, w: 8, h: 6, t: 3, tone: 'cool' },
      { op: 'line', x: 0, y: 0, x2: 5, y2: 5, tone: 'art' },
      { op: 'disc', x: 4, y: 4, r: 2, tone: 'warm' },
      { op: 'circle', x: 4, y: 4, r: 2, tone: 'plain' },
      {
        op: 'sprite', x: 1, y: 1, rows: ['##', ' #'], tone: 'win',
        flipX: false, flipY: false, scale: 1,
      },
      {
        op: 'sprite', x: 1, y: 1, rows: ['##'], tone: 'win',
        flipX: true, flipY: false, scale: 2,
      },
    ])
  })

  // THE BOUNDARY. Every shape op has to survive a postMessage, which means
  // plain JSON and nothing else — no functions, no class instances, no
  // callbacks, and no bitmap the cartridge can still reach into.
  it('a buffer of shapes round-trips through JSON unchanged', () => {
    const c = new Canvas(8, 3)
    c.clear()
    c.rect(1.5, 2.25, 3, 4, 'warm')
    c.outline(0, 0, 64, 24, 'cool', 2)
    c.line(0.5, 0, 12.5, 7, 'art')
    c.disc(9.75, 4, 3, 'magic')
    c.circle(9.75, 4, 3, 'info')
    c.sprite(2.5, 1, [' # ', '###'], 'win', { flipX: true, flipY: true, scale: 2 })
    c.put(1, 1, 'x', 'warm')
    const round = JSON.parse(JSON.stringify(c.cmds()))
    expect(round).toEqual(c.cmds())
    expect(JSON.stringify(round)).toBe(JSON.stringify(c.cmds()))
  })

  it('copies a sprite bitmap, so the cartridge cannot mutate a recorded frame', () => {
    const c = new Canvas(4, 2)
    const rows = ['##', '  ']
    c.sprite(0, 0, rows, 'win')
    rows[0] = 'changed'
    expect((c.cmds()[0] as { rows: string[] }).rows).toEqual(['##', '  '])
  })

  it('records fractional pixel coordinates verbatim, exactly like cell ones', () => {
    const c = new Canvas(8, 4)
    c.rect(12.4, 3.25, 6, 4, 'warm')
    expect(c.cmds()).toEqual([
      { op: 'rect', x: 12.4, y: 3.25, w: 6, h: 4, tone: 'warm' },
    ])
  })

  it('draws shapes into the pixel model at 8 pixels per cell', () => {
    const c = new Canvas(1, 1)
    c.rect(0, 0, 8, 2, 'cool')
    expect(pixelArt(rasterizePixels(c.cmds(), c.pw, c.ph)).split('\n').slice(0, 3))
      .toEqual(['########', '########', '........'])
  })

  // The two models are separate on purpose: `rasterize` is the CHARACTER
  // model and a pixel field cannot be squeezed into characters without lying
  // about its resolution. A shape game is snapshot-tested on `rasterizePixels`
  // instead — see `cartridgeHarness.pixelsOf`.
  it('rasterize leaves shape ops out of the character model', () => {
    const c = new Canvas(8, 3)
    c.rect(0, 0, 64, 24, 'warm')
    c.disc(10, 10, 4, 'cool')
    c.put(1, 1, 'x')
    expect(frameToString(rasterize(c.cmds(), 8, 3)))
      .toBe('        \n x      \n        ')
  })

  // ---- the degraded DOM path ---------------------------------------------
  //
  // When no 2D context can be acquired at all (a locked-down embedder, a lost
  // GPU) a game still has to be a PICTURE, not a blank rectangle — there is no
  // error state a child may see. `rasterizeWithShapes` squeezes the pixel
  // field into quadrant blocks, four per cell. It is lossy by construction and
  // no test ever compares a game against it: tests use the full-resolution
  // pixel model, so this coarse view can never be the thing that agrees with a
  // buggy game.
  it('renders shapes as quadrant blocks when there is no canvas at all', () => {
    const c = new Canvas(2, 1)
    c.rect(0, 0, 8, 8, 'cool')          // exactly the left cell
    expect(frameToString(rasterizeWithShapes(c.cmds(), 2, 1))).toBe('█ ')
  })

  it('shows a half-filled cell as a half block', () => {
    const c = new Canvas(1, 1)
    c.rect(0, 0, 8, 4, 'cool')          // top half of the only cell
    expect(frameToString(rasterizeWithShapes(c.cmds(), 1, 1))).toBe('▀')
    const d = new Canvas(1, 1)
    d.rect(0, 0, 4, 8, 'cool')          // left half
    expect(frameToString(rasterizeWithShapes(d.cmds(), 1, 1))).toBe('▌')
  })

  it('keeps the shape tone on the block it paints', () => {
    const c = new Canvas(1, 1)
    c.rect(0, 0, 8, 8, 'magic')
    expect(rasterizeWithShapes(c.cmds(), 1, 1)[0]![0]!.tone).toBe('magic')
  })

  it('lets characters win over shapes, so a label is never swallowed', () => {
    const c = new Canvas(2, 1)
    c.rect(0, 0, 16, 8, 'cool')
    c.put(0, 0, 'x', 'warm')
    const out = rasterizeWithShapes(c.cmds(), 2, 1)
    expect(out[0]![0]!.ch).toBe('x')
    expect(out[0]![1]!.ch).toBe('█')
  })

  it('is exactly rasterize when a game draws no shapes at all', () => {
    const c = new Canvas(8, 3)
    c.box(0, 0, 8, 3, 'cool')
    c.text(2, 1, 'hi', 'warm')
    expect(rasterizeWithShapes(c.cmds(), 8, 3))
      .toEqual(rasterize(c.cmds(), 8, 3))
  })

  it('drops the continuation cell of an emoji in the last column without wrapping rows', () => {
    const w = 6
    const c = new Canvas(w, 2)
    c.emoji(w - 1, 0, '🐟')
    const out = rasterize(c.cmds(), w, 2)
    expect(out[0]![w - 1]!.ch).toBe('🐟')
    // continuation cell falls off-grid: must not wrap onto row 1, col 0
    expect(out[1]![0]!.ch).toBe(' ')
    expect(frameToString(out)).toBe('     🐟\n      ')
  })
})
