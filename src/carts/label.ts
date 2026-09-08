import type { Gray } from './pixels'
import type { Bitmap } from './art'
import { CART_H, CART_W, LABEL_WINDOW } from './shell'

/**
 * A cart's picture, rendered into the terminal as HALF-BLOCKS.
 *
 * `▀` and `▄` split a character cell in two, so a row of text carries two
 * rows of picture and the label gets double vertical resolution without ever
 * becoming a bitmap on the page. That is the whole point: a cart label is the
 * charming part of the PICO-8 idea, and terminal-izing it is what keeps the
 * aesthetic whole.
 *
 * MONOCHROME by construction. Four glyphs — blank, top, bottom, full — on the
 * terminal's own ground, in ONE ink tone chosen by the caller. There is no
 * second colour to re-tint and nothing here knows what a palette is.
 */

/** Blank, top half, bottom half, full — indexed by `top | bottom << 1`. */
const HALVES = [' ', '▀', '▄', '█'] as const

/**
 * A half-cell is one cell wide and half a cell tall, and a cell is about
 * 0.6 as wide as it is tall — so a half-cell is roughly 1.2:1. Sampling has
 * to account for that or every label comes out squashed.
 */
const HALF_ASPECT = 1.2

/** Below this spread the picture is a flat wash, and a wash is not a label. */
const MIN_SPREAD = 24

/** How much of a half-cell must be lit for the half-cell to be lit. */
const COVERAGE = 0.28

/**
 * The label shown when a cart's picture cannot be read — an interlaced PNG, a
 * 16-bit one, a file the encoder here does not speak. Never an error, never a
 * blank space where a picture was promised: a small blank card, which is what
 * a cart with no art on it honestly is.
 */
export const BLANK_LABEL: readonly string[] = [
  '▄▄▄▄▄▄▄▄',
  '█ ▄▄▄▄ █',
  '█ ▀▀▀▀ █',
  '▀▀▀▀▀▀▀▀',
]

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

function crop(g: Gray, x0: number, y0: number, w: number, h: number): Gray {
  const lum = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) lum[y * w + x] = g.lum[(y0 + y) * g.w + x0 + x]!
  }
  return { w, h, lum }
}

const spread = (g: Gray): number => {
  let lo = 255
  let hi = 0
  for (const v of g.lum) { if (v < lo) lo = v; if (v > hi) hi = v }
  return hi - lo
}

/**
 * The lit part of a picture, with the ground around it cut away.
 *
 * A label is centred in its window with a margin, and those margins are blank
 * rows in the transcript — the drawing, floating in a couple of empty lines.
 *
 * IT GIVES UP RATHER THAN CUTTING TOO FAR. A picture that is one solid shape
 * trims to a rectangle of pure ink, which has no spread at all, and
 * `halfBlockLabel` reads a picture with no spread as no picture — so a solid
 * label would have come back as a blank card. When the cut leaves nothing to
 * tell apart, the margin is what makes the shape visible, and the uncut
 * picture is the honest answer.
 */
function trim(g: Gray): Gray {
  if (spread(g) < MIN_SPREAD) return g
  const mid = spread(g) / 2 + Math.min(...g.lum)

  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.lum[y * g.w + x]! <= mid) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0 || y1 < y0) return g
  const cut = crop(g, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  return spread(cut) >= MIN_SPREAD ? cut : g
}

/**
 * THE GAME'S PICTURE, OUT OF THE PICTURE OF A CARTRIDGE.
 *
 * A cart file is a drawing of the cartridge itself now — shell, ridges, title,
 * connector and all (see `shell.ts`) — and sampling THAT down to sixteen
 * columns would put a tiny grey cartridge in the transcript where the game's
 * own label belongs. So a file at exactly the size this app writes is cropped
 * to `LABEL_WINDOW`, which is a fixed rectangle for precisely this reason:
 * PICO-8's carts are one size with the label always in one place, and that is
 * what lets a reader find it without being told.
 *
 * Anything else — a cart from another tool, an older file, a picture that is
 * not one of ours — is read whole, exactly as before. The crop is then trimmed
 * to what is actually lit, so the half-blocks show the drawing rather than the
 * drawing plus the margin it was centred in.
 */
export function labelView(g: Gray | null): Gray | null {
  if (!g) return null
  if (g.w !== CART_W || g.h !== CART_H) return g
  const { x, y, w, h } = LABEL_WINDOW
  return trim(crop(g, x, y, w, h))
}

/**
 * Reduces a decoded picture to half-block rows.
 *
 * `cols` is the widest the label may be; the height follows from the
 * picture's own proportions. Returns `BLANK_LABEL` for anything it cannot
 * make a picture of, so a caller never has to branch.
 */
export function halfBlockLabel(g: Gray | null, cols = 16): readonly string[] {
  if (!g || g.w <= 0 || g.h <= 0 || cols < 2) return BLANK_LABEL

  let lo = 255
  let hi = 0
  for (const v of g.lum) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (hi - lo < MIN_SPREAD) return BLANK_LABEL
  const mid = (lo + hi) / 2

  const wide = clamp(Math.round(cols), 2, 64)
  const halves = clamp(Math.round((g.h / g.w) * wide * HALF_ASPECT), 2, 64)
  const rows = Math.ceil(halves / 2)

  /**
   * Box sampling by COVERAGE, not by average.
   *
   * Averaging was the obvious choice and it was wrong: a cart label is often
   * a thin outline on a dark ground, and a one-pixel stroke shrunk from 140
   * pixels to twelve half-cells averages far below the midpoint, so the whole
   * drawing came back as an empty card. Counting how much of the box is lit
   * keeps a stroke visible while still letting a genuinely dim area stay
   * dark.
   */
  const sample = (cx: number, cy: number): boolean => {
    const x0 = Math.floor((cx * g.w) / wide)
    const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * g.w) / wide))
    const y0 = Math.floor((cy * g.h) / halves)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * g.h) / halves))
    let lit = 0
    let n = 0
    for (let y = y0; y < Math.min(y1, g.h); y++) {
      for (let x = x0; x < Math.min(x1, g.w); x++) {
        if (g.lum[y * g.w + x]! > mid) lit += 1
        n += 1
      }
    }
    return n > 0 && lit / n >= COVERAGE
  }

  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let x = 0; x < wide; x++) {
      const top = sample(x, r * 2) ? 1 : 0
      const bottom = r * 2 + 1 < halves && sample(x, r * 2 + 1) ? 2 : 0
      line += HALVES[top | bottom]
    }
    // Trailing blanks are invisible and only make the block wider than the
    // picture, which matters when the transcript centres nothing.
    out.push(line.replace(/\s+$/, ''))
  }
  // An all-blank result is a lie about there being a picture.
  return out.some((l) => l.trim().length > 0) ? out : BLANK_LABEL
}

/**
 * A DRAWING WE ALREADY HAVE, as the same half-blocks a cart's label becomes.
 *
 * The built-ins' pictures are `Bitmap`s in `packedArt.ts` — they never go
 * through a PNG unless somebody saves one — and the game picker draws them as
 * tiles. Rather than a second sampler, they are lifted into the one-byte
 * luminance a decoded picture has and handed to the same function, so a tile
 * and a dropped cart's label can never be drawn by two different rules.
 */
export function bitmapLabel(bm: Bitmap, cols = 12): readonly string[] {
  if (bm.w <= 0 || bm.h <= 0) return BLANK_LABEL
  return halfBlockLabel(
    { w: bm.w, h: bm.h, lum: Uint8Array.from(bm.on, (v) => (v ? 255 : 0)) },
    cols,
  )
}
