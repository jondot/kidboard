import type { DrawCmd, Frame, GameSize, Tone } from '../types'
import { isWide } from '../terminal/wide'
import { PX_PER_CELL, eachRect, isShape } from './shapes'

/**
 * Splits a string into grapheme clusters, so a ZWJ sequence (family emoji) or
 * a base character plus a variation selector advances the cursor as the
 * single glyph it paints, not one cell per UTF-16 code point. Same pattern
 * as `src/runtime/resolve.ts`, `src/terminal/wide.ts` and `Canvas.ts`:
 * `Intl.Segmenter` where it exists, code-point iteration as the fallback.
 */
function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return [...s]
  return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
}

/**
 * Canvas grid renderer.
 *
 * A running game is one `<canvas>`, not ~800 `<span>`s. Each distinct
 * `(char, tone)` pair is rasterized once into an offscreen glyph atlas keyed
 * by cell size, then blitted with `drawImage` — the technique xterm.js's
 * renderer uses, without any of its VT emulation, because we already hold a
 * command buffer.
 *
 * The renderer consumes `DrawCmd[]` and nothing else. It never reaches back
 * into cartridge state, so the same buffer can one day arrive over
 * `postMessage` from a Worker-hosted cart and paint identically.
 */

// ---- geometry -----------------------------------------------------------

/**
 * Width-to-height ratio of one grid cell. A monospace advance is ~0.6em and
 * we give a row a full em plus a little air, so a cell is noticeably taller
 * than it is wide — the same proportion the DOM transcript has always had.
 */
export const CELL_ASPECT = 0.6

/**
 * Cells never grow past this, or a game on a 4K monitor becomes six enormous
 * letters and no longer fits the window vertically either — a cell is
 * 1/CELL_ASPECT times taller than it is wide, so the height grows fastest.
 */
export const MAX_CELL = 16
/** …and never shrink past this, or the glyphs stop being glyphs. */
export const MIN_CELL = 5

export type Layout = {
  /** Live column count: at least the declared `cols`, more on a wide screen. */
  cols: number
  rows: number
  cellW: number
  cellH: number
  /** CSS pixel size of the canvas element. */
  cssW: number
  cssH: number
  /** Backing-store size, i.e. CSS size times device pixel ratio. */
  pixelW: number
  pixelH: number
  dpr: number
}

/**
 * Rows are fixed by the declared aspect at the declared column count, so a
 * game's proportions are a property of the game. Extra columns on a wide
 * screen widen the play area rather than stretching it vertically off-screen.
 */
export function rowsFor(size: GameSize): number {
  const cols = Math.max(1, Math.floor(size.cols))
  const aspect = size.aspect > 0 ? size.aspect : 1
  return Math.max(1, Math.round((cols * CELL_ASPECT) / aspect))
}

/** The grid a cartridge draws into. `cols` may exceed the declared minimum. */
export function gridFor(size: GameSize, cols?: number): { w: number; h: number } {
  const base = Math.max(1, Math.floor(size.cols))
  const want = cols === undefined ? base : Math.floor(cols)
  return { w: Math.max(base, Number.isFinite(want) ? want : base), h: rowsFor(size) }
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

/**
 * Pure. Turns a container width plus a declared `{ cols, aspect }` into every
 * number the painter needs. No DOM, no canvas — this is the part that is
 * fully unit-tested, and the reason jsdom's lack of a 2D context costs us
 * nothing in coverage.
 *
 * A zero or non-finite width (jsdom, a display:none ancestor, the first
 * render before a ResizeObserver has fired) yields the declared grid at the
 * minimum cell size instead of a division by zero.
 */
export function layout(
  containerWidth: number,
  cols: number,
  aspect: number,
  dpr = 1,
): Layout {
  const baseCols = Math.max(1, Math.floor(cols))
  const rows = rowsFor({ cols: baseCols, aspect })
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1

  if (width === 0) return layoutGrid(0, baseCols, rows, d)

  // Fit the declared columns to the width, then — if that would make cells
  // absurdly large — hand the surplus back as extra columns.
  const fitted = clamp(width / baseCols, MIN_CELL, MAX_CELL)
  const cols2 = Math.max(baseCols, Math.floor(width / fitted))
  return layoutGrid(width, cols2, rows, d)
}

/**
 * Pure. Sizes the cells of an ALREADY-CHOSEN grid. The session picks the
 * column count once (via `layout`) and records it on the frame; the canvas
 * then divides the very same container width by that same count, so the two
 * can never disagree about how wide a cell is.
 */
export function layoutGrid(
  containerWidth: number,
  cols: number,
  rows: number,
  dpr = 1,
): Layout {
  const w = Math.max(1, Math.floor(cols))
  const h = Math.max(1, Math.floor(rows))
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0

  const cellW = width > 0 ? clamp(width / w, MIN_CELL, MAX_CELL) : MIN_CELL
  const cellH = cellW / CELL_ASPECT

  return {
    cols: w, rows: h, cellW, cellH,
    cssW: w * cellW, cssH: h * cellH,
    pixelW: Math.max(1, Math.round(w * cellW * d)),
    pixelH: Math.max(1, Math.round(h * cellH * d)),
    dpr: d,
  }
}

// ---- colours ------------------------------------------------------------

/**
 * A canvas cannot inherit `color` from a CSS class, so the tone vocabulary is
 * resolved to real colours once per atlas build. These match `styles.css` and
 * are only used when no computed style is available (jsdom, or a canvas that
 * is not in the document).
 */
export const TONE_FALLBACK: Record<Tone, string> = {
  plain: '#e8e8e8',
  art: '#fff1a0',
  info: '#a0d4ff',
  win: '#a8f0a8',
  magic: '#d4a8ff',
  warm: '#ffbe8a',
  cool: '#8aeaea',
}

const TONES = Object.keys(TONE_FALLBACK) as Tone[]

export const FONT_STACK =
  '"JetBrains Mono", "Miriam Mono CLM", "Cousine", ui-monospace, monospace'

/** Reads the live `--kb-*` custom properties, falling back to the constants. */
export function tonesFrom(el: unknown): Record<Tone, string> {
  const out = { ...TONE_FALLBACK }
  const g = (globalThis as { getComputedStyle?: (e: never) => { getPropertyValue(p: string): string } })
    .getComputedStyle
  if (!g || !el) return out
  try {
    const cs = g(el as never)
    for (const tone of TONES) {
      const v = cs.getPropertyValue(`--kb-${tone}`).trim()
      if (v) out[tone] = v
    }
  } catch {
    // A detached node or a jsdom stub. The fallbacks are already correct.
  }
  return out
}

/**
 * Identity of a rasterized atlas. The atlas is rebuilt when — and only when —
 * this string changes, i.e. on a cell-size change, a DPR change or a theme
 * change. Rounded to a tenth of a pixel so a one-pixel resize jitter does not
 * throw away a perfectly good atlas.
 */
export function atlasKey(
  cellW: number,
  cellH: number,
  dpr: number,
  theme: string,
): string {
  const q = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
  return `${q(cellW)}x${q(cellH)}@${q(dpr)}/${theme}`
}

/** A stable digest of a tone palette, so a theme swap invalidates the atlas. */
export function themeKey(colors: Record<Tone, string>): string {
  return TONES.map((t) => colors[t]).join(',')
}

// ---- the minimal 2D surface we need ------------------------------------

/**
 * Structural subset of Canvas2D. Declaring it ourselves keeps the painter
 * testable with a plain object, which is the whole reason jsdom's missing
 * canvas implementation is not a coverage hole.
 */
export type Ctx2D = {
  canvas?: unknown
  fillStyle: string
  font: string
  textAlign: string
  textBaseline: string
  clearRect(x: number, y: number, w: number, h: number): void
  /** The only shape primitive the painter needs: a flat, hard-edged fill. */
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  drawImage(
    img: unknown,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): void
  save(): void
  restore(): void
}

export type Surface = {
  width: number
  height: number
  getContext(id: '2d'): Ctx2D | null
}

const ATLAS_COLS = 16
const ATLAS_ROWS = 24              // 384 distinct (char, tone) pairs

/**
 * A monospace glyph advances 0.6em, and CELL_ASPECT is that same 0.6 — so a
 * font whose size equals the CELL HEIGHT advances exactly one cell width. That
 * is what makes `-` and `|` meet at a corner instead of leaving a hairline gap
 * between every pair of cells.
 */
const FONT_OF_CELL_H = 1
/** Emoji come from a fallback font drawn near-square; fit them to the row. */
const EMOJI_OF_CELL_H = 0.82

type Slot = { sx: number; sy: number; sw: number; sh: number; ox: number; oy: number }

/**
 * Lazily rasterizes each `(char, tone, wide)` triple into an offscreen sheet,
 * once. Blitting a cached bitmap is roughly an order of magnitude cheaper than
 * `fillText`, and it is what makes a 46x14 grid at 60fps unremarkable.
 */
export class GlyphAtlas {
  readonly key: string
  private readonly slots = new Map<string, Slot | null>()
  private readonly slotW: number
  private readonly slotH: number
  /** Horizontal and vertical air around a cell, for overhang and descenders. */
  private readonly padX: number
  private readonly padY: number
  private next = 0
  private ctx: Ctx2D | null = null

  constructor(
    readonly surface: Surface | null,
    private readonly cellW: number,
    private readonly cellH: number,
    private readonly dpr: number,
    private readonly colors: Record<Tone, string>,
  ) {
    this.key = atlasKey(cellW, cellH, dpr, themeKey(colors))
    this.padX = Math.ceil(cellW * dpr * 0.3) + 1
    this.padY = Math.ceil(cellH * dpr * 0.25) + 1
    this.slotW = Math.ceil(cellW * dpr * 2) + this.padX * 2
    this.slotH = Math.ceil(cellH * dpr) + this.padY * 2
    if (!surface) return
    surface.width = this.slotW * ATLAS_COLS
    surface.height = this.slotH * ATLAS_ROWS
    this.ctx = surface.getContext('2d')
  }

  /** Font size for a glyph, in device pixels. */
  fontPx(wide: boolean): number {
    return this.cellH * this.dpr * (wide ? EMOJI_OF_CELL_H : FONT_OF_CELL_H)
  }

  /** CSS for the font, shared with the direct-draw fallback. */
  fontOf(wide: boolean): string {
    return `${this.fontPx(wide).toFixed(2)}px ${FONT_STACK}`
  }

  /** Device-pixel advance of a glyph: one cell, or two for an emoji. */
  advance(wide: boolean): number {
    return (wide ? 2 : 1) * this.cellW * this.dpr
  }

  /**
   * The slot for a glyph, rasterizing it on first sight. `null` means "paint
   * this one directly" — no surface, or the sheet is full. Never throws.
   */
  get(ch: string, tone: Tone, wide: boolean): Slot | null {
    const id = `${wide ? 'W' : 'N'}${tone} ${ch}`
    const hit = this.slots.get(id)
    if (hit !== undefined) return hit

    const ctx = this.ctx
    if (!ctx || this.next >= ATLAS_COLS * ATLAS_ROWS) {
      this.slots.set(id, null)
      return null
    }

    const i = this.next++
    const sx = (i % ATLAS_COLS) * this.slotW
    const sy = Math.floor(i / ATLAS_COLS) * this.slotH
    const adv = this.advance(wide)

    try {
      ctx.save()
      ctx.clearRect(sx, sy, this.slotW, this.slotH)
      ctx.font = this.fontOf(wide)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = this.colors[tone] ?? TONE_FALLBACK.plain
      ctx.fillText(
        ch,
        sx + this.padX + adv / 2,
        sy + this.padY + (this.cellH * this.dpr) / 2,
      )
      ctx.restore()
    } catch {
      this.slots.set(id, null)
      return null
    }

    const slot: Slot = {
      sx, sy,
      sw: Math.min(this.slotW, Math.ceil(adv) + this.padX * 2),
      sh: this.slotH,
      // Where the slot's top-left sits relative to the cell's top-left.
      ox: this.padX,
      oy: this.padY,
    }
    this.slots.set(id, slot)
    return slot
  }
}

// ---- the painter --------------------------------------------------------

export type GridRenderer = {
  setLayout(l: Layout): void
  setColors(c: Record<Tone, string>): void
  paint(frame: Frame): void
  /** Repaints the frame most recently painted, e.g. after a resize. */
  repaint(): void
  destroy(): void
}

export type RendererOpts = {
  ctx: Ctx2D
  layout: Layout
  colors?: Record<Tone, string>
  /** Offscreen sheet factory. Defaults to a detached `<canvas>`. */
  createSurface?: () => Surface | null
}

const defaultSurface = (): Surface | null => {
  const doc = (globalThis as { document?: Document }).document
  if (!doc?.createElement) return null
  try {
    return doc.createElement('canvas') as unknown as Surface
  } catch {
    return null
  }
}

/**
 * Paints command buffers onto one 2D context.
 *
 * FRACTIONAL POSITIONS. A command's `x` is in cells and may be fractional; it
 * is multiplied by the cell width and used as-is, so `x = 12.4` really does
 * land at 12.4 cell-widths. An *integer* coordinate is snapped to a whole
 * device pixel instead, because a static border or label gains nothing from
 * sub-pixel resampling and loses crispness to it. Sprites move smoothly;
 * scenery stays sharp.
 */
export function createGridRenderer(opts: RendererOpts): GridRenderer {
  const { ctx } = opts
  const make = opts.createSurface ?? defaultSurface

  let lay = opts.layout
  let colors = opts.colors ?? { ...TONE_FALLBACK }
  let atlas = new GlyphAtlas(make(), lay.cellW, lay.cellH, lay.dpr, colors)
  let last: Frame | null = null
  let dead = false

  const ensureAtlas = (): void => {
    const want = atlasKey(lay.cellW, lay.cellH, lay.dpr, themeKey(colors))
    if (atlas.key === want) return
    atlas = new GlyphAtlas(make(), lay.cellW, lay.cellH, lay.dpr, colors)
  }

  /** Cell coordinate -> device pixel. Integers snap; fractions do not. */
  const px = (v: number, cell: number): number => {
    const p = v * cell * lay.dpr
    return Number.isInteger(v) ? Math.round(p) : p
  }

  const glyph = (x: number, y: number, ch: string, tone: Tone): void => {
    if (ch === '' || ch === ' ') return
    const wide = isWide(ch)
    const cx = px(x, lay.cellW)
    const cy = px(y, lay.cellH)
    if (cx > lay.pixelW || cy > lay.pixelH) return
    if (cx + atlas.advance(wide) < 0 || cy + lay.cellH * lay.dpr < 0) return

    const slot = atlas.get(ch, tone, wide)
    if (slot && atlas.surface) {
      ctx.drawImage(
        atlas.surface, slot.sx, slot.sy, slot.sw, slot.sh,
        cx - slot.ox, cy - slot.oy, slot.sw, slot.sh,
      )
      return
    }
    // No atlas (or a full one): draw straight to the target. Slower, but the
    // picture is identical and the child never sees a difference.
    ctx.font = atlas.fontOf(wide)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = colors[tone] ?? TONE_FALLBACK.plain
    ctx.fillText(ch, cx + atlas.advance(wide) / 2, cy + (lay.cellH * lay.dpr) / 2)
  }

  /**
   * THE WHOLE TRICK, in six lines.
   *
   * A shape arrives in logical pixels, fractions and all, and is painted as
   * one flat `fillRect` whose four edges are rounded to whole DEVICE pixels.
   * Rounding each edge independently (rather than rounding the origin and
   * adding a width) is what makes neighbouring fills meet exactly, with no
   * seam and no overlap.
   *
   * Snapping to device pixels — not to logical ones — is the difference
   * between crisp and smooth being a trade-off and being both at once. A
   * logical pixel is several device pixels across, so a sprite moving a tenth
   * of a logical pixel per frame still moves on screen, while its edges stay
   * exactly on the display's own grid.
   */
  const shape = (cmd: DrawCmd): void => {
    if (!isShape(cmd)) return
    const sx = (lay.cellW * lay.dpr) / PX_PER_CELL
    const sy = (lay.cellH * lay.dpr) / PX_PER_CELL
    ctx.fillStyle = colors[cmd.tone] ?? TONE_FALLBACK.plain
    eachRect(cmd, (x, y, w, h) => {
      const x0 = Math.round(x * sx)
      const y0 = Math.round(y * sy)
      const x1 = Math.round((x + w) * sx)
      const y1 = Math.round((y + h) * sy)
      // Off the field entirely: nothing to paint, and nothing to round.
      if (x1 <= 0 || y1 <= 0 || x0 >= lay.pixelW || y0 >= lay.pixelH) return
      // A shape thinner than a device pixel still gets one, or a hairline
      // border would blink out at some cell sizes.
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0))
    })
  }

  // Every frame opens with a full clear, and every cartridge's draw() opens
  // with c.clear() — so the first command of a buffer is almost always a
  // second, redundant wipe of the same surface. Skip it.
  let dirty = false

  const one = (cmd: DrawCmd): void => {
    switch (cmd.op) {
      case 'clear':
        if (dirty) ctx.clearRect(0, 0, lay.pixelW, lay.pixelH)
        dirty = false
        return
      case 'put':
        dirty = true
        glyph(cmd.x, cmd.y, cmd.ch, cmd.tone)
        return
      case 'text': {
        // Advance by grapheme — two cells for a wide glyph, one for a narrow
        // one — the same rule `rasterize` uses, so a run of emoji never
        // overlaps on screen even though the model already agreed it would.
        dirty = true
        let x = cmd.x
        for (const g of graphemes(cmd.text)) {
          const wide = isWide(g)
          glyph(x, cmd.y, g, cmd.tone)
          x += wide ? 2 : 1
        }
        return
      }
      case 'emoji':
        dirty = true
        glyph(cmd.x, cmd.y, cmd.emoji, 'plain')
        return
      case 'box': {
        // The EXTENT (w/h) is rounded to whole cells, exactly as `rasterize`
        // rounds it, so the walls always land on the same column/row the
        // model puts them on — a fractional extent used to shear the right
        // and bottom walls away from the model's corners. The POSITION
        // (x/y) is deliberately left alone: a box's origin may glide like
        // any sprite (a sliding frame), it is only the size that must be
        // whole cells.
        dirty = true
        const { x, y, tone } = cmd
        const w = Math.round(cmd.w)
        const h = Math.round(cmd.h)
        for (let i = 1; i < w - 1; i++) {
          glyph(x + i, y, '-', tone)
          glyph(x + i, y + h - 1, '-', tone)
        }
        for (let j = 1; j < h - 1; j++) {
          glyph(x, y + j, '|', tone)
          glyph(x + w - 1, y + j, '|', tone)
        }
        glyph(x, y, '+', tone)
        glyph(x + w - 1, y, '+', tone)
        glyph(x, y + h - 1, '+', tone)
        glyph(x + w - 1, y + h - 1, '+', tone)
        return
      }
      default:
        // Shape ops. Pixel coordinates, flat fills, in command order with
        // the character ops around them.
        dirty = true
        shape(cmd)
        return
    }
  }

  const paint = (frame: Frame): void => {
    if (dead) return
    last = frame
    ensureAtlas()
    try {
      ctx.clearRect(0, 0, lay.pixelW, lay.pixelH)
      dirty = false
      for (const cmd of frame.cmds) one(cmd)
    } catch {
      // A lost context mid-frame. The previous picture stays on screen and
      // the next frame tries again — never an error the child can see.
    }
  }

  return {
    setLayout(l) { lay = l },
    setColors(c) { colors = c },
    paint,
    repaint() { if (last) paint(last) },
    destroy() { dead = true; last = null },
  }
}
