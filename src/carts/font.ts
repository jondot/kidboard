import type { Bitmap } from './art'

/**
 * FIVE BY SEVEN, HAND-DRAWN, and the only typeface that exists as PIXELS in
 * this project.
 *
 * Everything else Kidboard writes is text in a real font — the machine's own,
 * chosen by `System.font` — because everything else is on a page. A cart's
 * picture is not on a page: it is a PNG, two colours, opened in whatever
 * viewer a grown-up happens to have. Nothing about a font reaches it. So the
 * title on the front of a cartridge has to be drawn, letter by letter, the
 * way a label is drawn.
 *
 * UPPER CASE ONLY, plus digits and the handful of marks a cart name can carry.
 * A five-pixel-wide lower case with descenders would be a worse letter at this
 * size, and a cartridge label has been upper case since 1977.
 *
 * WHAT IS NOT HERE IS THE POINT. There is no Hebrew, and there will not be:
 * this project's standing rule is that Hebrew never goes on a canvas — the
 * bidi algorithm and the shaping that make it readable live in the browser's
 * text stack, and a hand-drawn 5x7 alphabet has neither. A name this font
 * cannot spell is drawn as no title at all, and the picture speaks for the
 * cart. See `titleFor` in `shell.ts`.
 */

/** Every glyph is this size. A missing character is simply not drawn. */
export const GLYPH_W = 5
export const GLYPH_H = 7
/** Blank columns between two letters, at scale 1. */
export const TRACKING = 1

const rows = (...r: string[]): readonly string[] => r

const GLYPHS: Record<string, readonly string[]> = {
  A: rows('.xxx.', 'x...x', 'x...x', 'xxxxx', 'x...x', 'x...x', 'x...x'),
  B: rows('xxxx.', 'x...x', 'x...x', 'xxxx.', 'x...x', 'x...x', 'xxxx.'),
  C: rows('.xxx.', 'x...x', 'x....', 'x....', 'x....', 'x...x', '.xxx.'),
  D: rows('xxxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', 'xxxx.'),
  E: rows('xxxxx', 'x....', 'x....', 'xxxx.', 'x....', 'x....', 'xxxxx'),
  F: rows('xxxxx', 'x....', 'x....', 'xxxx.', 'x....', 'x....', 'x....'),
  G: rows('.xxx.', 'x...x', 'x....', 'x.xxx', 'x...x', 'x...x', '.xxx.'),
  H: rows('x...x', 'x...x', 'x...x', 'xxxxx', 'x...x', 'x...x', 'x...x'),
  I: rows('xxxxx', '..x..', '..x..', '..x..', '..x..', '..x..', 'xxxxx'),
  J: rows('..xxx', '...x.', '...x.', '...x.', '...x.', 'x..x.', '.xx..'),
  K: rows('x...x', 'x..x.', 'x.x..', 'xx...', 'x.x..', 'x..x.', 'x...x'),
  L: rows('x....', 'x....', 'x....', 'x....', 'x....', 'x....', 'xxxxx'),
  M: rows('x...x', 'xx.xx', 'x.x.x', 'x.x.x', 'x...x', 'x...x', 'x...x'),
  N: rows('x...x', 'xx..x', 'x.x.x', 'x..xx', 'x...x', 'x...x', 'x...x'),
  O: rows('.xxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.xxx.'),
  P: rows('xxxx.', 'x...x', 'x...x', 'xxxx.', 'x....', 'x....', 'x....'),
  Q: rows('.xxx.', 'x...x', 'x...x', 'x...x', 'x.x.x', 'x..x.', '.xx.x'),
  R: rows('xxxx.', 'x...x', 'x...x', 'xxxx.', 'x.x..', 'x..x.', 'x...x'),
  S: rows('.xxxx', 'x....', 'x....', '.xxx.', '....x', '....x', 'xxxx.'),
  T: rows('xxxxx', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..'),
  U: rows('x...x', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.xxx.'),
  V: rows('x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.x.x.', '..x..'),
  W: rows('x...x', 'x...x', 'x...x', 'x.x.x', 'x.x.x', 'xx.xx', 'x...x'),
  X: rows('x...x', 'x...x', '.x.x.', '..x..', '.x.x.', 'x...x', 'x...x'),
  Y: rows('x...x', 'x...x', '.x.x.', '..x..', '..x..', '..x..', '..x..'),
  Z: rows('xxxxx', '....x', '...x.', '..x..', '.x...', 'x....', 'xxxxx'),
  0: rows('.xxx.', 'x...x', 'x..xx', 'x.x.x', 'xx..x', 'x...x', '.xxx.'),
  1: rows('..x..', '.xx..', '..x..', '..x..', '..x..', '..x..', 'xxxxx'),
  2: rows('.xxx.', 'x...x', '....x', '..xx.', '.x...', 'x....', 'xxxxx'),
  3: rows('xxxxx', '...x.', '..xx.', '...x.', '....x', 'x...x', '.xxx.'),
  4: rows('...x.', '..xx.', '.x.x.', 'x..x.', 'xxxxx', '...x.', '...x.'),
  5: rows('xxxxx', 'x....', 'xxxx.', '....x', '....x', 'x...x', '.xxx.'),
  6: rows('..xx.', '.x...', 'x....', 'xxxx.', 'x...x', 'x...x', '.xxx.'),
  7: rows('xxxxx', '....x', '...x.', '..x..', '.x...', '.x...', '.x...'),
  8: rows('.xxx.', 'x...x', 'x...x', '.xxx.', 'x...x', 'x...x', '.xxx.'),
  9: rows('.xxx.', 'x...x', 'x...x', '.xxxx', '....x', '...x.', '.xx..'),
  '-': rows('.....', '.....', '.....', 'xxxxx', '.....', '.....', '.....'),
  '.': rows('.....', '.....', '.....', '.....', '.....', '.....', '..x..'),
  "'": rows('..x..', '..x..', '.....', '.....', '.....', '.....', '.....'),
  '!': rows('..x..', '..x..', '..x..', '..x..', '..x..', '.....', '..x..'),
  '?': rows('.xxx.', 'x...x', '....x', '..xx.', '..x..', '.....', '..x..'),
  ' ': rows('.....', '.....', '.....', '.....', '.....', '.....', '.....'),
}

/** Whether this font can spell a word at all. */
export function spellable(text: string): boolean {
  const up = text.toUpperCase()
  return [...up].some((c) => c !== ' ' && GLYPHS[c] !== undefined)
}

/**
 * A word as pixels, upper-cased, with anything the font cannot spell dropped.
 *
 * Dropped rather than substituted: a `?` where a letter should be is a
 * question the cart cannot answer, and a row of them is worse than a cartridge
 * with no title on it.
 */
export function textBitmap(text: string): Bitmap {
  const glyphs = [...text.toUpperCase()]
    .map((c) => GLYPHS[c])
    .filter((g): g is readonly string[] => g !== undefined)

  if (glyphs.length === 0) return { w: 0, h: 0, on: new Uint8Array(0) }

  const w = glyphs.length * GLYPH_W + (glyphs.length - 1) * TRACKING
  const on = new Uint8Array(w * GLYPH_H)
  glyphs.forEach((g, i) => {
    const x0 = i * (GLYPH_W + TRACKING)
    g.forEach((row, y) => {
      ;[...row].forEach((ch, x) => {
        if (ch !== '.' && ch !== ' ') on[y * w + x0 + x] = 1
      })
    })
  })
  return { w, h: GLYPH_H, on }
}
