import type { Bitmap } from './art'
import { spellable, textBitmap } from './font'
import type { CartManifest } from './manifest'
import type { Locale } from '../types'

/**
 * THE PICTURE ON A CART IS A PICTURE OF A CARTRIDGE.
 *
 * It used to be the label art blown up on a plain matte — an honest picture of
 * the game and nothing else, which meant a folder of saved carts was a folder
 * of abstract squares. PICO-8 got this right years ago: the file you hand
 * somebody is a photograph of the physical object, shell and label and all, so
 * a directory listing looks like a shelf of cartridges. A six-year-old who
 * saves four games should see four CARTRIDGES in their downloads.
 *
 * So this draws the object: a shell with chamfered shoulders, the grip ridges
 * along the top that every cartridge of that era had, the label window with
 * the game's own picture inside it, the title underneath, and the connector
 * fingers at the foot. All of it in the same TWO COLOURS the label was already
 * drawn in — the format is a 2-entry indexed PNG and monochrome is not a
 * restriction here, it is the format (see `art.ts`).
 *
 * THE GEOMETRY IS FIXED, and that is load-bearing rather than lazy. PICO-8's
 * cart is always 160x205 with its label always in the same rectangle, which is
 * exactly what lets any reader find the label without being told where it is.
 * Ours is 160x200 with `LABEL_WINDOW` always in the same place, so when a cart
 * comes home the terminal crops that rectangle and shows the GAME's picture in
 * half-blocks rather than a tiny picture of a cartridge. A file from some other
 * tool, at some other size, is read whole exactly as before.
 */

/** The whole picture. A nod to PICO-8's 160x205, in our own proportion. */
export const CART_W = 160
export const CART_H = 200

/**
 * Where the game's own picture lives, and the one constant a reader needs.
 * Everything else here is decoration; this is an interface.
 */
export type Box = { x: number; y: number; w: number; h: number }

export const LABEL_WINDOW: Box = { x: 25, y: 51, w: 110, h: 86 }

/* ---- a very small painter ----------------------------------------------- */

const blank = (w: number, h: number): Bitmap =>
  ({ w, h, on: new Uint8Array(Math.max(0, w * h)) })

function dot(b: Bitmap, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  b.on[y * b.w + x] = 1
}

function fill(b: Bitmap, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(b, x + i, y + j)
}

/** A rectangle drawn as `t` pixels of edge. */
function frame(b: Bitmap, x: number, y: number, w: number, h: number, t: number): void {
  fill(b, x, y, w, t)
  fill(b, x, y + h - t, w, t)
  fill(b, x, y, t, h)
  fill(b, x + w - t, y, t, h)
}

/** A 45° edge, `t` thick, from (x, y) walking `n` steps in each direction. */
function bevel(
  b: Bitmap, x: number, y: number, n: number, dx: number, dy: number, t: number,
): void {
  for (let i = 0; i < n; i++) fill(b, x + i * dx, y + i * dy, t, t)
}

/**
 * The label, scaled to fit its window and centred in it.
 *
 * Whole-number magnification whenever the picture is smaller than the window,
 * because a 12x10 drawing enlarged by 8.7 is a 12x10 drawing with a stagger in
 * it. Anything already larger is sampled down, which is the only case where a
 * fractional step is the lesser evil.
 */
function place(dst: Bitmap, src: Bitmap, box: Box): void {
  if (src.w <= 0 || src.h <= 0) return
  const fit = Math.min(box.w / src.w, box.h / src.h)
  const k = fit >= 1 ? Math.floor(fit) : fit
  const w = Math.max(1, Math.floor(src.w * k))
  const h = Math.max(1, Math.floor(src.h * k))
  const ox = box.x + Math.floor((box.w - w) / 2)
  const oy = box.y + Math.floor((box.h - h) / 2)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.h - 1, Math.floor(y / k))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.floor(x / k))
      if (src.on[sy * src.w + sx]) dot(dst, ox + x, oy + y)
    }
  }
}

/* ---- the cartridge ------------------------------------------------------ */

const SHELL = { x: 6, y: 6, w: 148, h: 188, stroke: 3, chamfer: 14 }
const RIDGES = { x: 30, y: 18, w: 100, h: 4, gap: 5, count: 3 }
/** The window's own frame. `LABEL_WINDOW` is the hole inside it. */
const WINDOW_FRAME = { x: 22, y: 48, w: 116, h: 92, stroke: 3 }
const TITLE = { y: 150, maxW: 116, scale: 2 }
const FINGERS = { x: 30, y: 172, w: 12, h: 16, gap: 10, count: 5 }

/** The shell: a rectangle with its shoulders cut, the way a cartridge is. */
function drawShell(b: Bitmap): void {
  const { x, y, w, h, stroke: t, chamfer: c } = SHELL
  // The four straight edges, each stopping short of a chamfered corner.
  fill(b, x + c, y, w - 2 * c, t)                    // top
  fill(b, x, y + h - t, w, t)                        // bottom
  fill(b, x, y + c, t, h - c - t)                    // left
  fill(b, x + w - t, y + c, t, h - c - t)            // right
  // …and the shoulders themselves.
  bevel(b, x + c, y, c, -1, 1, t)
  bevel(b, x + w - c - t, y, c, 1, 1, t)
}

/**
 * The picture of one cartridge: shell, ridges, label, title, fingers.
 *
 * `title` is drawn only if this font can spell it (see `font.ts`); a name it
 * cannot is drawn as no title, and the label speaks for the cart.
 */
export function cartridgeImage(label: Bitmap, title: string): Bitmap {
  const b = blank(CART_W, CART_H)

  drawShell(b)

  // The grip ridges along the top moulding.
  for (let i = 0; i < RIDGES.count; i++) {
    fill(b, RIDGES.x, RIDGES.y + i * (RIDGES.h + RIDGES.gap), RIDGES.w, RIDGES.h)
  }

  // The label window, and the game's own picture inside it.
  frame(b, WINDOW_FRAME.x, WINDOW_FRAME.y, WINDOW_FRAME.w, WINDOW_FRAME.h, WINDOW_FRAME.stroke)
  place(b, label, LABEL_WINDOW)

  // The title, centred under the window.
  const words = textBitmap(title)
  if (words.w > 0) {
    const k = Math.max(1, Math.min(TITLE.scale, Math.floor(TITLE.maxW / words.w)))
    place(b, words, {
      x: Math.round((CART_W - words.w * k) / 2),
      y: TITLE.y,
      w: words.w * k,
      h: words.h * k,
    })
  }

  // The connector at the foot: the fingers that go into the slot.
  for (let i = 0; i < FINGERS.count; i++) {
    fill(b, FINGERS.x + i * (FINGERS.w + FINGERS.gap), FINGERS.y, FINGERS.w, FINGERS.h)
  }

  return b
}

/**
 * What the front of the cart says it is.
 *
 * The child's own language first, because that is the word they know the game
 * by. If this font cannot spell it — every Hebrew name, and that is the rule
 * rather than an accident — the English title is tried, then the English name,
 * and if none of them can be drawn the cartridge simply carries no title. A
 * picture of a cartridge with a blank label line is a real object; a label
 * full of question marks is a bug wearing a picture's clothes.
 */
export function titleFor(m: CartManifest, locale: Locale): string {
  for (const word of [m.title[locale], m.title.en, m.name[locale], m.name.en]) {
    if (word && spellable(word)) return word
  }
  return ''
}
