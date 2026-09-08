import { describe, it, expect } from 'vitest'
import {
  ART_CELL_ASPECT, CARD_W, FACE, SLOT,
  card, cells, centre, court, padAt, padRule, pad, sameStage, screenOf,
} from './card'
import { MAX_ASPECT, MIN_ASPECT, seenAspect } from './stage'
import { Canvas } from '../runtime/Canvas'
import { frameToString, rasterize } from '../runtime/Canvas'

/** The character model of a canvas, as the child would read it. */
const drawn = (w: number, h: number, f: (c: Canvas) => void): string[] => {
  const c = new Canvas(w, h)
  f(c)
  return frameToString(rasterize(c.cmds(), w, h)).split('\n')
}

describe('cells', () => {
  it('counts an emoji as two and everything else as one', () => {
    expect(cells('abc')).toBe(3)
    expect(cells('🍎')).toBe(2)
    expect(cells('a🍎b')).toBe(4)
    expect(cells('')).toBe(0)
  })

  // A flag, a skin tone or a ZWJ family is ONE glyph in one cell pair. Counted
  // by code unit they would come out as three or four, and every frame built
  // around one would be that many columns too wide.
  // (A regional-indicator flag is deliberately NOT counted as wide here: the
  // renderer's own `isWide` uses this same `Extended_Pictographic` test and
  // does not either, and the model agreeing with the painter matters more
  // than either of them being right about flags. No cartridge ships one.)
  it('counts a multi-codepoint emoji once, not once per codepoint', () => {
    expect(cells('👍🏽')).toBe(2)
    expect(cells('👩‍👩‍👧')).toBe(2)
  })
})

describe('centre', () => {
  it('pads a line out to exactly the width, on both sides', () => {
    expect(centre('ab', 6)).toBe('  ab  ')
    expect(cells(centre('ab', 7))).toBe(7)
  })

  it('measures the line in CELLS, so an emoji costs two', () => {
    expect(centre('🍎', 4)).toBe(' 🍎 ')
    expect(cells(centre('🍎', 9))).toBe(9)
  })

  // Cutting a child's picture in half to make a rectangle line up is the wrong
  // trade; the caller's own numbers are what should have been smaller.
  it('never cuts a line that is already wider than the width', () => {
    expect(centre('abcdef', 3)).toBe('abcdef')
  })
})

describe('the card', () => {
  it('frames a picture and stands it on the ground rail', () => {
    const lines = card(['ab'], { width: 8 }).split('\n')
    expect(lines[0]).toBe('┌──────┐')
    expect(lines[1]).toBe('│  ab  │')
    expect(lines.at(-1)).toBe('╘══════╛')
  })

  // THE GROUND is the whole of the answer to "count's ducks and spot's row are
  // floating in space": one glyph's difference between the foot and the other
  // three sides, so a picture gains a floor without gaining furniture.
  it('draws the foot differently from every other side', () => {
    const lines = card(['x']).split('\n')
    expect(lines[0]).toContain('─')
    expect(lines[0]).not.toContain('═')
    expect(lines.at(-1)).toContain('═')
    expect(lines.at(-1)).not.toContain('─')
  })

  it('is a perfect rectangle, measured in cells, whatever is inside it', () => {
    for (const body of [['a'], ['🍎🍎', 'x'], ['', '🐱  🐱  🐱'], []]) {
      const lines = card(body).split('\n')
      const w = cells(lines[0]!)
      for (const l of lines) expect(cells(l)).toBe(w)
    }
  })

  it('grows around a picture wider than the width it was asked for', () => {
    const wide = '🍎'.repeat(30)
    const lines = card([wide], { width: 10 }).split('\n')
    expect(cells(lines[0]!)).toBeGreaterThanOrEqual(cells(wide) + 2)
    expect(lines[1]).toContain(wide)
  })

  it('keeps a fixed width when one is asked for, so a picture cannot jump', () => {
    const a = card(['🦆'], { width: CARD_W }).split('\n')[0]!
    const b = card(['🦆   🦆   🦆'], { width: CARD_W }).split('\n')[0]!
    expect(cells(a)).toBe(CARD_W)
    expect(cells(b)).toBe(CARD_W)
  })

  it('keeps the lines it was given, in order, centred by the same amount', () => {
    const [, one, two] = card(['ab', 'cd'], { width: 10 }).split('\n')
    expect(one!.indexOf('a')).toBe(two!.indexOf('c'))
  })

  it('adds air above and below when asked, and none when not', () => {
    expect(card(['x'], { padY: 0 }).split('\n')).toHaveLength(3)
    expect(card(['x'], { padY: 2 }).split('\n')).toHaveLength(7)
  })

  // 34 cells is ~326px at the terminal's 16px mono, which fits a 390px phone
  // with its padding. Art is `white-space: pre` inside a transcript that
  // scrolls vertically only, so anything wider is CLIPPED, not scrolled.
  it('offers a width a phone can hold, and hugs the picture without one', () => {
    expect(CARD_W).toBeLessThanOrEqual(34)
    expect(cells(card(['x'], { width: CARD_W }).split('\n')[0]!)).toBe(CARD_W)
    // Snug by default: the frame follows the picture, because a frame with a
    // lot of dead space inside it makes the picture look SMALLER than it did
    // unframed.
    expect(cells(card(['x']).split('\n')[0]!)).toBeLessThan(CARD_W)
  })
})

describe('a grid of faces', () => {
  it('shares a wall between neighbours, so a column is SLOT cells of pitch', () => {
    expect(SLOT).toBe(FACE + 1)
    expect(pad(['a', 'b', 'c'])).toBe('│ a  │ b  │ c  │')
    expect(cells(pad(['a', 'b']))).toBe(2 * SLOT + 1)
    expect(cells(padRule(2, 'top'))).toBe(2 * SLOT + 1)
  })

  it('centres an emoji in its face, so a face is two cells of thing and two of air', () => {
    expect(pad(['🍎'])).toBe('│ 🍎 │')
    expect(cells(pad(['🍎', '🍊']))).toBe(2 * SLOT + 1)
  })

  it('draws a top, a middle and a ground rule that all line up', () => {
    const top = padRule(3, 'top')
    const mid = padRule(3, 'mid')
    const ground = padRule(3, 'ground')
    expect(top).toBe('┌────┬────┬────┐')
    expect(mid).toBe('├────┼────┼────┤')
    expect(ground).toBe('╘════╧════╧════╛')
    for (const r of [mid, ground]) expect(cells(r)).toBe(cells(top))
  })

  // A grid's own outer wall IS the frame. A card around it would be a box
  // around a box with dead space between them — the mistake `BlockView`
  // documents having made once for games.
  it('puts the ground rail on the grid itself, so no second frame is needed', () => {
    expect(padRule(2, 'ground')).toContain('═')
    expect(padRule(2, 'top')).not.toContain('═')
  })

  it('names the column a label goes in, under the face it belongs to', () => {
    const faces = pad(['🍎', '🍊', '🍎'])
    for (let i = 0; i < 3; i++) {
      // The label column is inside face `i`: past its left wall, before its
      // right one.
      expect(padAt(i)).toBeGreaterThan(i * SLOT)
      expect(padAt(i)).toBeLessThan((i + 1) * SLOT)
    }
    expect(cells(faces)).toBe(3 * SLOT + 1)
  })
})

describe('the screen, on a canvas', () => {
  // `screenOf` is `stageOf` in CELLS, and that is not a coincidence to tidy
  // away: a logical pixel is defined to have the shape of a character cell.
  it('never lets a court read wider than 4:3 or taller than 3:4 on screen', () => {
    for (const [w, h] of [[30, 18], [90, 18], [200, 18], [20, 40], [12, 12]]) {
      const s = screenOf(w!, h!)
      const a = seenAspect(s.w, s.h)
      // A screen is whole cells — scenery snaps — so the bound it lands on
      // can be off by the rounding of one row. Never by more.
      expect(a).toBeLessThanOrEqual(MAX_ASPECT + 0.05)
      expect(a).toBeGreaterThanOrEqual(MIN_ASPECT - 0.05)
    }
  })

  it('centres the court in a wide grid and fills a narrow one', () => {
    const wide = screenOf(90, 18)
    expect(wide.x).toBeGreaterThan(0)
    expect(Math.abs(wide.x - (90 - wide.w - wide.x))).toBeLessThanOrEqual(1)
    const square = screenOf(30, 18)
    expect(square).toEqual({ x: 0, y: 0, w: 30, h: 18 })
  })

  it('is stable, so a redraw at the same size re-lays nothing', () => {
    expect(sameStage(screenOf(90, 18), screenOf(90, 18))).toBe(true)
    expect(sameStage(screenOf(90, 18), screenOf(91, 18))).toBe(false)
  })
})

describe('the court, on a canvas', () => {
  it('wears the same walls and the same ground rail the transcript card does', () => {
    const rows = drawn(12, 5, (c) => court(c, { x: 1, y: 0, w: 10, h: 5 }))
    expect(rows[0]).toBe(' ┌────────┐ ')
    expect(rows[1]).toBe(' │        │ ')
    expect(rows[4]).toBe(' ╘════════╛ ')
  })

  it('draws the SAME glyphs a card does, so the two registers are one frame', () => {
    const rows = drawn(10, 4, (c) => court(c, { x: 0, y: 0, w: 10, h: 4 }))
    const paper = card([' '.repeat(8)], { width: 10, padX: 0, padY: 1 }).split('\n')
    expect(rows[0]).toBe(paper[0])
    expect(rows[3]).toBe(paper.at(-1))
  })

  it('paints nothing outside the screen it was given', () => {
    const rows = drawn(10, 4, (c) => court(c, { x: 2, y: 1, w: 6, h: 3 }))
    expect(rows[0]!.trim()).toBe('')
    expect(rows[1]!.slice(0, 2)).toBe('  ')
    expect(rows[1]!.slice(8)).toBe('  ')
  })
})

describe('the numbers this module is built on', () => {
  // NOT `PIXEL_ASPECT`. Art is DOM text at `line-height: 1.15`, so a row is
  // 1.15em tall while a mono advance is 0.6em — 0.6 / 1.15 = 0.52. Measured in
  // a real browser at 9.633px per cell and 18.398px per row.
  it('uses the transcript row height, not the canvas cell height', () => {
    expect(ART_CELL_ASPECT).toBeCloseTo(9.633 / 18.398, 2)
  })

  it('keeps a face wide enough for an emoji and some air', () => {
    expect(FACE).toBeGreaterThanOrEqual(cells('🍎') + 2)
  })

  // Six faces is the widest thing any of the six cartridges needs (spot deals
  // up to six slots), and it has to fit inside the card's own interior.
  it('fits six faces inside a card a phone can hold', () => {
    expect(cells(padRule(6, 'top'))).toBeLessThanOrEqual(CARD_W)
  })
})
