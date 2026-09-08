/**
 * The picture on the front of a cart.
 *
 * A label is a two-colour bitmap and nothing more: it is written into the
 * PNG with a two-entry palette and read back out as half-blocks, so a third
 * colour would be thrown away twice over. Monochrome is not a restriction
 * here, it is the format.
 */
export type Bitmap = { w: number; h: number; on: Uint8Array }

/** Whole-pixel magnification, so a 24-cell drawing becomes a real picture. */
export function blowUp(src: Bitmap, scale: number): Bitmap {
  const k = Math.max(1, Math.round(scale))
  const w = src.w * k
  const h = src.h * k
  const on = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      on[y * w + x] = src.on[Math.floor(y / k) * src.w + Math.floor(x / k)]!
    }
  }
  return { w, h, on }
}

/** A quiet border, so the label reads as a card rather than as a crop. */
export function matte(src: Bitmap, pad: number): Bitmap {
  const p = Math.max(0, Math.round(pad))
  const w = src.w + p * 2
  const h = src.h + p * 2
  const on = new Uint8Array(w * h)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      on[(y + p) * w + (x + p)] = src.on[y * src.w + x]!
    }
  }
  return { w, h, on }
}

/** Builds a bitmap from rows of text: any non-space character is ink. */
export function fromRows(rows: readonly string[]): Bitmap {
  const w = Math.max(1, ...rows.map((r) => r.length))
  const h = Math.max(1, rows.length)
  const on = new Uint8Array(w * h)
  rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => { if (ch !== ' ') on[y * w + x] = 1 })
  })
  return { w, h, on }
}

/** The ground and the ink a cart PNG is painted in, as flat RGB. */
export const GROUND = [14, 39, 50] as const
export const INK = [245, 222, 176] as const
