import type { Cell, CanvasLike, DrawCmd, SpriteOpts, Tone } from '../types'
import { isWide } from '../terminal/wide'
import { PX_PER_CELL, isShape, rasterizePixels } from './shapes'

/**
 * Splits a string into grapheme clusters, so a ZWJ sequence (family emoji) or
 * a base character plus a variation selector counts as the single glyph it
 * renders as, not one cell per UTF-16 code point. Same pattern as
 * `src/runtime/resolve.ts` and `src/terminal/wide.ts`: `Intl.Segmenter` where
 * it exists, code-point iteration as the fallback everywhere else.
 */
function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return [...s]
  return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
}

/**
 * Records draw commands. Never touches the DOM and never rasterizes, so the
 * output is JSON-serializable and a cartridge can one day run in a Worker.
 *
 * Coordinates are recorded VERBATIM, fractions included. Rounding used to
 * happen here, which is what made motion choppy: a ball moving 0.58 cells per
 * frame recorded the same integer twice and then jumped a whole cell, and no
 * framerate could fix that. The float now survives all the way to the painter,
 * while `rasterize` — the integer model the snapshot tests compare — does the
 * rounding itself, so the grid stays exactly as testable as it was.
 */
export class Canvas implements CanvasLike {
  readonly w: number
  readonly h: number
  private buf: DrawCmd[] = []

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
  }

  clear(): void {
    this.buf.push({ op: 'clear' })
  }

  put(x: number, y: number, ch: string, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'put', x, y, ch, tone })
  }

  text(x: number, y: number, text: string, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'text', x, y, text, tone })
  }

  box(x: number, y: number, w: number, h: number, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'box', x, y, w, h, tone })
  }

  emoji(x: number, y: number, emoji: string): void {
    this.buf.push({ op: 'emoji', x, y, emoji })
  }

  // ---- shapes: PIXEL coordinates, 8 logical pixels per cell --------------

  /** Pixel width of the field: the live cell grid times `PX_PER_CELL`. */
  get pw(): number {
    return this.w * PX_PER_CELL
  }

  get ph(): number {
    return this.h * PX_PER_CELL
  }

  rect(x: number, y: number, w: number, h: number, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'rect', x, y, w, h, tone })
  }

  outline(
    x: number, y: number, w: number, h: number,
    tone: Tone = 'plain', t = 1,
  ): void {
    this.buf.push({ op: 'outline', x, y, w, h, t, tone })
  }

  line(x: number, y: number, x2: number, y2: number, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'line', x, y, x2, y2, tone })
  }

  disc(x: number, y: number, r: number, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'disc', x, y, r, tone })
  }

  circle(x: number, y: number, r: number, tone: Tone = 'plain'): void {
    this.buf.push({ op: 'circle', x, y, r, tone })
  }

  /**
   * Blits a bitmap. `rows` is COPIED into the buffer: a cartridge that keeps
   * a mutable bitmap around (an animation that edits rows in place) can never
   * reach back into a frame that was already recorded — which is exactly the
   * guarantee a postMessage boundary needs.
   */
  sprite(
    x: number, y: number, rows: readonly string[],
    tone: Tone = 'plain', opts: SpriteOpts = {},
  ): void {
    this.buf.push({
      op: 'sprite', x, y, rows: [...rows], tone,
      flipX: opts.flipX === true,
      flipY: opts.flipY === true,
      scale: opts.scale ?? 1,
    })
  }

  cmds(): DrawCmd[] {
    return this.buf
  }
}

const blank = (w: number, h: number): Cell[][] =>
  Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: ' ', tone: 'plain' as Tone })),
  )

const r = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0)

/**
 * Host-side. Turns a command buffer into a character grid.
 *
 * This is the INTEGER MODEL of a frame and the thing every cartridge snapshot
 * test compares. Fractional coordinates are rounded to the nearest cell here,
 * exactly as `Canvas` used to round them at record time — same input, same
 * grid, byte for byte. Sub-cell placement is a property of the *painter*, not
 * of the model.
 *
 * Pure: no DOM, no canvas, no cartridge state.
 */
export function rasterize(cmds: DrawCmd[], w: number, h: number): Cell[][] {
  let cells = blank(w, h)

  const set = (x: number, y: number, ch: string, tone: Tone): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    cells[y]![x] = { ch, tone }
  }

  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'clear':
        cells = blank(w, h)
        break

      case 'put': {
        // Mirrors 'emoji' below: a wide glyph is double-width in the picture
        // whichever op drew it, so the model reserves the same continuation
        // cell for a wide `put` that it always has for `c.emoji()`.
        const x = r(cmd.x), y = r(cmd.y)
        set(x, y, cmd.ch, cmd.tone)
        if (isWide(cmd.ch)) set(x + 1, y, '', cmd.tone)
        break
      }

      case 'text': {
        // Advance by grapheme, not by index: a wide glyph moves the cursor
        // two cells, a narrow one moves it one — the same rule the painter
        // uses below, so a run of emoji lays out identically in the model
        // and the picture instead of overlapping in either.
        const tx = r(cmd.x)
        const ty = r(cmd.y)
        let x = tx
        for (const g of graphemes(cmd.text)) {
          const wide = isWide(g)
          set(x, ty, g, cmd.tone)
          if (wide) set(x + 1, ty, '', cmd.tone)
          x += wide ? 2 : 1
        }
        break
      }

      case 'box': {
        const x = r(cmd.x), y = r(cmd.y), bw = r(cmd.w), bh = r(cmd.h)
        const { tone } = cmd
        for (let i = 1; i < bw - 1; i++) {
          set(x + i, y, '-', tone)
          set(x + i, y + bh - 1, '-', tone)
        }
        for (let j = 1; j < bh - 1; j++) {
          set(x, y + j, '|', tone)
          set(x + bw - 1, y + j, '|', tone)
        }
        set(x, y, '+', tone)
        set(x + bw - 1, y, '+', tone)
        set(x, y + bh - 1, '+', tone)
        set(x + bw - 1, y + bh - 1, '+', tone)
        break
      }

      case 'emoji':
        // Emoji are double-width in monospace. Occupy two cells so the grid
        // never shears; the continuation cell renders nothing.
        //
        // This reservation is the MODEL and it stays. On the canvas path the
        // painter chooses the advance itself (two cell-widths, exactly), so
        // the `width: 2ch` hack is gone from games. It survives only in
        // ArtView, where transcript art is still DOM and a browser still
        // cannot be trusted to make an emoji two mono advances wide.
        set(r(cmd.x), r(cmd.y), cmd.emoji, 'plain')
        set(r(cmd.x) + 1, r(cmd.y), '', 'plain')
        break
    }
  }
  return cells
}

/**
 * The sixteen quadrant blocks, indexed by
 * `topLeft | topRight<<1 | bottomLeft<<2 | bottomRight<<3`.
 */
const QUADRANTS = [
  ' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█',
]

/** A quadrant is 4x4 logical pixels; this many lit make it worth a block. */
const QUADRANT_MIN = 3

/**
 * THE DEGRADED PATH, and nothing else.
 *
 * When no 2D context can be acquired at all — a locked-down embedder, a lost
 * GPU — `GameCanvas` falls back to the DOM grid, and a shape-drawing game
 * would otherwise be a blank rectangle. There is no error state a child may
 * see, so the pixel field is squeezed into quadrant blocks: four per cell,
 * i.e. a quarter of the real resolution on each axis, with characters drawn
 * over the top.
 *
 * This is LOSSY and it is deliberately not the test model. Nothing in the
 * test suite compares a cartridge against this function: a shape game is
 * snapshot-tested on `rasterizePixels`, at the field's full resolution, so
 * this coarse view can never become the thing that quietly agrees with a
 * broken game.
 */
export function rasterizeWithShapes(
  cmds: DrawCmd[],
  w: number,
  h: number,
): Cell[][] {
  const cells = rasterize(cmds, w, h)
  if (!cmds.some(isShape)) return cells

  const px = rasterizePixels(cmds, w * PX_PER_CELL, h * PX_PER_CELL)
  const q = PX_PER_CELL / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A character always wins: a label must never be swallowed by scenery.
      const cell = cells[y]![x]!
      if (cell.ch !== ' ') continue

      let mask = 0
      let tone: Tone | null = null
      for (let qy = 0; qy < 2; qy++) {
        for (let qx = 0; qx < 2; qx++) {
          let lit = 0
          for (let j = 0; j < q; j++) {
            for (let i = 0; i < q; i++) {
              const t = px[y * PX_PER_CELL + qy * q + j]?.[x * PX_PER_CELL + qx * q + i]
              if (t) { lit += 1; tone ??= t }
            }
          }
          if (lit >= QUADRANT_MIN) mask |= 1 << (qy * 2 + qx)
        }
      }
      if (mask !== 0) cells[y]![x] = { ch: QUADRANTS[mask]!, tone: tone ?? 'plain' }
    }
  }
  return cells
}

export function frameToString(cells: Cell[][]): string {
  return cells.map((row) => row.map((c) => c.ch).join('')).join('\n')
}
