import { describe, it, expect } from 'vitest'
import { CART_H, CART_W, LABEL_WINDOW, cartridgeImage, titleFor } from './shell'
import { GLYPH_H, GLYPH_W, spellable, textBitmap } from './font'
import { fromRows, type Bitmap } from './art'
import { buildCartPng } from './export'
import { decodeGray } from './pixels'
import { BLANK_LABEL, halfBlockLabel, labelView } from './label'
import { BLINK, BLINK_LABEL } from './samples'
import type { CartManifest } from './manifest'

/**
 * A CART IS A PICTURE OF A CARTRIDGE.
 *
 * The file used to be the label art blown up on a plain matte, so a folder of
 * saved games was a folder of abstract squares. PICO-8 has always handed you a
 * photograph of the object; this draws one — shell, ridges, label window,
 * title, connector — in the two colours the format already had.
 */

const lit = (b: Bitmap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < b.w && y < b.h && b.on[y * b.w + x] === 1

const anyLit = (b: Bitmap, x0: number, y0: number, w: number, h: number): boolean => {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) if (lit(b, x, y)) return true
  }
  return false
}

/** A picture with an obvious left/right asymmetry, to follow through a crop. */
const LEFT_HALF = fromRows([
  'xxxxxx      ',
  'xxxxxx      ',
  'xxxxxx      ',
  'xxxxxx      ',
  'xxxxxx      ',
  'xxxxxx      ',
])

describe('the picture on the front of a cart', () => {
  it('is always the same size, so a reader can find the label', () => {
    for (const art of [BLINK_LABEL, LEFT_HALF]) {
      const img = cartridgeImage(art, 'BLINK')
      expect([img.w, img.h]).toEqual([CART_W, CART_H])
    }
  })

  /** The silhouette: shoulders cut, edges drawn, nothing outside the shell. */
  it('draws a cartridge, not a rectangle', () => {
    const img = cartridgeImage(BLINK_LABEL, 'BLINK')
    // The four square corners of the image are empty…
    for (const [x, y] of [[0, 0], [CART_W - 1, 0]] as const) {
      expect(lit(img, x, y), `corner ${x},${y}`).toBe(false)
    }
    // …the shoulders are cut, so the very top only has ink in the middle…
    expect(anyLit(img, 0, 6, 10, 1)).toBe(false)
    expect(anyLit(img, CART_W / 2 - 5, 6, 10, 1)).toBe(true)
    // …and the sides and foot are drawn.
    expect(anyLit(img, 6, CART_H / 2, 3, 1), 'no left edge').toBe(true)
    expect(anyLit(img, CART_W - 9, CART_H / 2, 3, 1), 'no right edge').toBe(true)
    expect(anyLit(img, CART_W / 2, CART_H - 9, 1, 3), 'no bottom edge').toBe(true)
  })

  it('puts the game\'s own picture in the label window, and only there', () => {
    const plain = cartridgeImage({ w: 1, h: 1, on: new Uint8Array([0]) }, '')
    const withArt = cartridgeImage(LEFT_HALF, '')
    const { x, y, w, h } = LABEL_WINDOW
    // Ink appeared inside the window…
    expect(anyLit(withArt, x, y, w, h)).toBe(true)
    // …and nowhere else: outside the window the two pictures are identical.
    let differsOutside = false
    for (let j = 0; j < CART_H; j++) {
      for (let i = 0; i < CART_W; i++) {
        const inside = i >= x && i < x + w && j >= y && j < y + h
        if (!inside && lit(withArt, i, j) !== lit(plain, i, j)) differsOutside = true
      }
    }
    expect(differsOutside, 'the label painted over the shell').toBe(false)
  })

  it('scales a small picture up in whole pixels, and centres it', () => {
    const img = cartridgeImage(LEFT_HALF, '')
    const { x, y, w, h } = LABEL_WINDOW
    // 12x6 into 110x86 is a scale of 9: 108 wide, 54 tall, centred.
    expect(anyLit(img, x, y, w, 10), 'the top of the window should be margin').toBe(false)
    expect(anyLit(img, x + 1, y + h / 2, 40, 1), 'the lit half is missing').toBe(true)
    expect(anyLit(img, x + w - 40, y + h / 2, 39, 1), 'the empty half is not empty').toBe(false)
  })

  describe('the title', () => {
    it('is drawn under the window when this font can spell it', () => {
      const named = cartridgeImage(BLINK_LABEL, 'BLINK')
      const bare = cartridgeImage(BLINK_LABEL, '')
      const strip = { x: 20, y: LABEL_WINDOW.y + LABEL_WINDOW.h + 6, w: 120, h: 24 }
      expect(anyLit(named, strip.x, strip.y, strip.w, strip.h)).toBe(true)
      expect(anyLit(bare, strip.x, strip.y, strip.w, strip.h)).toBe(false)
    })

    /**
     * HEBREW NEVER GOES ON A CANVAS — the project's standing rule, and a PNG is
     * the one surface with no text stack at all. A name this font cannot spell
     * falls back to the English one; when there is none, the cart carries no
     * title and its picture speaks for it.
     */
    it('falls back rather than drawing a row of question marks', () => {
      const m: CartManifest = {
        ...BLINK,
        title: { en: 'Blink', he: 'ממצמץ' },
        name: { en: 'blink', he: 'ממצמץ' },
      }
      expect(titleFor(m, 'en')).toBe('Blink')
      expect(titleFor(m, 'he')).toBe('Blink')
      const only = { ...m, title: { he: 'ממצמץ' }, name: { he: 'ממצמץ' } } as CartManifest
      expect(titleFor(only, 'he')).toBe('')
      expect(spellable('ממצמץ')).toBe(false)
    })
  })
})

describe('the five-by-seven font', () => {
  it('draws one glyph per letter, with tracking between them', () => {
    const one = textBitmap('A')
    expect([one.w, one.h]).toEqual([GLYPH_W, GLYPH_H])
    const two = textBitmap('AB')
    expect(two.w).toBe(GLYPH_W * 2 + 1)
  })

  it('drops what it cannot spell instead of substituting', () => {
    // Two letters and a Hebrew one: two glyphs' worth of picture.
    expect(textBitmap('Aב B').w).toBe(textBitmap('A B').w)
    expect(textBitmap('ממצמץ').w).toBe(0)
    expect(spellable('ok!')).toBe(true)
  })

  it('is upper case, so case never changes the picture', () => {
    expect(textBitmap('snake')).toEqual(textBitmap('SNAKE'))
  })
})

describe('reading a cart back', () => {
  it('crops one of ours to its label, and shows the GAME', async () => {
    const png = (await buildCartPng(BLINK, LEFT_HALF, 'en'))!
    const gray = (await decodeGray(png))!
    expect([gray.w, gray.h]).toEqual([CART_W, CART_H])

    const view = labelView(gray)!
    expect(view.w).toBeLessThanOrEqual(LABEL_WINDOW.w)
    expect(view.h).toBeLessThanOrEqual(LABEL_WINDOW.h)

    const rows = halfBlockLabel(view)
    expect(rows).not.toEqual(BLANK_LABEL)
    // The picture's own asymmetry survived: ink on the left, nothing on the
    // right, so the label comes back about half of the sixteen columns it was
    // sampled at. A label taken from the WHOLE cartridge could not say that —
    // it would be a tiny picture of a cartridge, full width, every row.
    const wide = Math.max(...rows.map((r) => r.length))
    expect(wide, rows.join('|')).toBeGreaterThan(3)
    expect(wide, rows.join('|')).toBeLessThan(10)
  })

  it('leaves a picture that is not one of ours exactly as it is', () => {
    const foreign = { w: 40, h: 30, lum: new Uint8Array(40 * 30).fill(200) }
    expect(labelView(foreign)).toBe(foreign)
    expect(labelView(null)).toBeNull()
  })
})
