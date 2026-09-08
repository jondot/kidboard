import type { CanvasLike, Tone } from '../types'
import type { Bounds, Stage } from './stage'
import { sameStage, stageOf } from './stage'

/**
 * THE CARD: a stage for the CHARACTER idiom.
 *
 * `stage.ts` gives a game that draws SHAPES a screen inside the canvas — a
 * centred, field-shaped rectangle with the theme's own ground either side.
 * This module is the same idea for the other idiom: the games whose content
 * is *language* (a keyboard, falling words, a board of cards, a row to scan)
 * and which are therefore made of characters and emoji rather than pixels.
 *
 * WHY THIS EXISTS. "Shapes for pictures, characters for characters" is the
 * right rule and it is not in question here. What was missing is any shared
 * *presentation* for the second half of it. Six cartridges each invented one
 * and none of them got one: `piano` drew an 8:1 strip edge to edge with 700px
 * of nothing under it while `drum` — same category, same instrument
 * metaphor — sat in a neat centred court; `count` scattered four emoji at
 * body-text size in the top-left corner of an otherwise empty screen. Played
 * back to back with the thirteen shape games they read as two decisions
 * rather than as one product with two registers.
 *
 * A HELPER, NOT A CONVENTION. This is a module the six call, not a paragraph
 * in the README they each follow, and the reason is the evidence: the six
 * already *had* a convention (rule 5, "when ASCII is still the right answer")
 * and every one of them followed it differently. `stage.ts` was extracted for
 * exactly this reason after it had been copy-pasted into five cartridges.
 * Cartridge #21 that draws characters gets the presentation by importing one
 * function, the way #21 that draws shapes gets it by importing `stageOf` —
 * and the day the frame changes, it changes once.
 *
 * ---- WHAT THE PRESENTATION ACTUALLY IS -----------------------------------
 *
 * ONE FRAME, in box-drawing characters, drawn from the same constants on both
 * surfaces — so a framed art block in the transcript and a framed canvas are
 * not merely alike, they are the same picture. (Why box-drawing rather than
 * `c.box`'s `+ - |`: see the glyph constants below.)
 *
 * A GROUND at its foot: the bottom rail is a DOUBLE rule where the other three
 * sides are single. `count`'s ducks and `spot`'s row used to float in blank
 * space with nothing under them. One glyph's difference buys them somewhere to
 * be, where a shelf of new furniture would have bought clutter.
 *
 * THE FRAME IS THE PICTURE'S OWN EDGE, never a box around a box. `BlockView`
 * learned this the hard way for games — it used to draw a border around the
 * whole transcript-width block, which framed the court AND the dead margins
 * either side of it — and the lesson is the same here: where a picture is a
 * grid of faces (`spot`, `memory`), the grid's own outer wall IS the frame
 * and there is no second one around it. `card` is for a picture that has no
 * edge of its own.
 *
 * SCALE, honestly. An emoji in the transcript is 16px and nothing here can
 * change that: art is DOM text at the terminal's own size and `{ kind: 'art' }`
 * carries no `scale`. What CAN be made bigger is the thing a child scans, and
 * `pad`/`padRule` are how — a face of four cells inside walls is about
 * 48 x 37px, so a row of them is four objects to compare rather than four
 * glyphs to squint at. It is the same move `drum` makes with shapes: a face
 * to hit, with its label under it.
 *
 * Plain arithmetic and string building. No DOM, no React, no runtime state,
 * so a cartridge that imports it is still the plain data and functions a
 * sandbox can host.
 */

// ---- the vocabulary ------------------------------------------------------

/**
 * THE FRAME, in box-drawing characters.
 *
 * Not `+ - |`. `c.box` rasterizes to those, and the first draft of this module
 * used them everywhere so that a canvas court and a transcript card would be
 * literally the same characters — but `+---+` does not JOIN. Its dashes stop
 * short of each cell's edges, so at 16px a frame made of them reads as a
 * dashed hairline next to `maze`'s solid walls, which is the opposite of the
 * problem this module exists to fix. Box-drawing glyphs are designed to meet
 * their neighbours exactly, and rule 4 of the cartridge README allows them on
 * a canvas by name ("Latin, box-drawing and emoji only").
 *
 * So the canvas court is drawn by `court` below with `put`/`text` rather than
 * by `c.box`, and the two registers share these exact glyphs instead of merely
 * resembling each other. Every one of them was measured in a real browser at
 * exactly one mono advance in the terminal's own font stack; an emoji is the
 * only thing in this project that is ever two.
 */
export const WALL = '│'
const RAIL = '─'
const TL = '┌'
const TR = '┐'
const TEE = '┬'
const CROSS = '┼'
const LEFT_TEE = '├'
const RIGHT_TEE = '┤'

/**
 * THE GROUND: the foot of every frame, drawn as a DOUBLE rule where the other
 * three sides are single. It is the whole answer to "count's ducks and spot's
 * row are floating in space" — one glyph's difference, so the picture gains a
 * floor without gaining any furniture. `╘ ╧ ╛` are the joints where a single
 * wall lands on a double rule.
 */
const GROUND = '═'
const GL = '╘'
const GR = '╛'
const GTEE = '╧'

// ---- the canvas register -------------------------------------------------

/**
 * The character idiom's screen on a CANVAS: the largest centred rectangle of
 * the live grid whose on-screen proportions stay field-shaped.
 *
 * This is `stageOf` with CELLS for its units, and that is not a coincidence to
 * be tidied away — a logical pixel is defined to have the shape of a character
 * cell (`PIXEL_ASPECT`, 0.6 as wide as it is tall), so the arithmetic that
 * centres a 4:3 screen in a wide pixel field is the same arithmetic that
 * centres one in a wide grid of cells. The alias exists so the character idiom
 * has ONE module to import, and so the unit is named at the call site:
 * `screenOf(c.w, c.h)` is cells, `stageOf(c.pw, c.ph)` is pixels, and mixing
 * them up is now an obvious mistake rather than a picture eight times too
 * small.
 *
 * Lay out in screen coordinates (0..w across, 0..h down) and add `screen.x` /
 * `screen.y` once, in `draw`, exactly as a shape game does with its stage.
 */
export const screenOf = (
  cols: number,
  rows: number,
  bounds?: Bounds,
): Stage => stageOf(cols, rows, bounds)

/** Re-exported so a character-idiom cartridge needs one import, not two. */
export { sameStage }
export type { Stage }

/**
 * The court, on a canvas: the same walls and the same ground rail a
 * transcript card wears, drawn with the same glyphs.
 *
 * Character ops on purpose. This is the idiom that draws with characters, and
 * a solid pixel rail here would be a shape game's wall bolted onto a
 * keyboard — `drum` next door draws its court in pixels because everything
 * inside it is pixels too.
 */
export const court = (c: CanvasLike, s: Stage, tone: Tone = 'plain'): void => {
  const inner = Math.max(0, s.w - 2)
  const right = s.x + s.w - 1
  const foot = s.y + s.h - 1
  c.text(s.x, s.y, TL + RAIL.repeat(inner) + TR, tone)
  for (let y = s.y + 1; y < foot; y++) {
    c.put(s.x, y, WALL, tone)
    c.put(right, y, WALL, tone)
  }
  c.text(s.x, foot, GL + GROUND.repeat(inner) + GR, tone)
}

// ---- measuring a row of characters --------------------------------------

/**
 * An emoji is TWO cells wide — that is the model the whole project is written
 * against, and `ArtView` renders every emoji grapheme in a `2ch` span so the
 * browser cannot disagree with it. Anything else is one cell.
 *
 * Deliberately its own five lines rather than an import from
 * `terminal/wide.ts`: a cartridge must not reach into the DOM layer even for a
 * pure function, and this is the same one-line test
 * (`Extended_Pictographic`) that lives there. If one ever changes, both must.
 */
export const cells = (s: string): number => {
  let n = 0
  for (const g of graphemes(s)) n += /\p{Extended_Pictographic}/u.test(g) ? 2 : 1
  return n
}

/**
 * Graphemes, not code units. A flag, a skin tone or a ZWJ family is one glyph
 * in one cell pair, and `[...s]` would count it as three or four.
 * `Intl.Segmenter` has been in every browser and in Node since 2022; the
 * fallback is there so a stray old runtime degrades to a slightly wrong width
 * rather than throwing inside a child's game.
 */
const graphemes = (s: string): string[] => {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return [...s]
  return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
}

/**
 * One line, centred in `width` cells and padded out to exactly that many.
 *
 * Padded on BOTH sides on purpose: the line usually goes inside a frame, so
 * its trailing spaces are what hold the right-hand wall up. A line wider than
 * the width is returned as it stands — cutting a child's picture in half to
 * make a rectangle line up is the wrong trade, and the caller's own layout
 * numbers are what should have been smaller.
 */
export const centre = (line: string, width: number): string => {
  const w = cells(line)
  if (w >= width) return line
  const left = Math.floor((width - w) / 2)
  return ' '.repeat(left) + line + ' '.repeat(width - w - left)
}

// ---- a grid of faces -----------------------------------------------------

/**
 * Cells across one face. Two of them are the emoji itself and one goes to air
 * each side, so a face is `| 🍎 |` — and with the walls shared between
 * neighbours a column is five cells of pitch. Six of them come to 31 cells,
 * which is the widest thing that still fits a phone (see `CARD_W`).
 */
export const FACE = 4

/** Pitch from one face's left wall to the next. The wall is shared. */
export const SLOT = FACE + 1

/** Where a rule sits in a grid of faces: its top, between two rows, its foot. */
export type Rule = 'top' | 'mid' | 'ground'

/**
 * The rule above, between or below a row of faces. `'ground'` draws it as the
 * floor — this is the one place a grid's own bottom edge and the card's ground
 * rail are the same line, which is why `spot` and `memory` need no second
 * frame around them.
 */
export const padRule = (cols: number, where: Rule = 'mid'): string => {
  const [l, bar, join, r] = where === 'top'
    ? [TL, RAIL, TEE, TR]
    : where === 'ground'
      ? [GL, GROUND, GTEE, GR]
      : [LEFT_TEE, RAIL, CROSS, RIGHT_TEE]
  return l + Array.from({ length: cols }, () => bar.repeat(FACE)).join(join) + r
}

/**
 * A row of faces, walls shared. Each entry is centred in its face, so a
 * caller passes the THING (`'🍎'`, `'?'`) and never its padding.
 */
export const pad = (faces: readonly string[]): string =>
  WALL + faces.map((f) => centre(f, FACE)).join(WALL) + WALL

/**
 * The column a face's centre sits on, for a label placed under (or over) the
 * grid. Rounded to the cell left of centre, which is where a single digit
 * looks right beneath a two-cell emoji.
 */
export const padAt = (col: number): number => col * SLOT + Math.floor(FACE / 2)

// ---- a frame around a picture that has no edge of its own ----------------

/**
 * The card's outside width in cells, borders included, when a caller wants a
 * fixed one.
 *
 * THE CEILING IS A PHONE. Art is `white-space: pre` inside a transcript that
 * scrolls vertically only, so a card wider than the terminal is not wrapped or
 * scrolled — it is clipped by the frame, and the child loses the right of
 * their own picture. 34 cells is ~326px at the terminal's 16px mono, which
 * fits a 390px phone with its padding.
 *
 * A card does NOT grow on a desktop, and that is the honest behaviour rather
 * than a limitation being excused: a card is made of characters, and the prose
 * beside it does not grow either. What a wide screen gets is a card with more
 * room around it — the same relationship a paragraph has to the page.
 */
export const CARD_W = 34

/**
 * The on-screen width-to-height of ONE character cell in a transcript art
 * block, measured in a real browser: 9.633px across, 18.398px down.
 *
 * NOT `PIXEL_ASPECT` (0.6). Art is DOM text at `line-height: 1.15`, so a row
 * is 1.15em tall while a mono advance is 0.6em. This is the number `FACE`,
 * `count`'s `PITCH` and `memory`'s blank-line spacing were all chosen
 * against — four cells across is 2.4em and two rows down is 2.3em, which is
 * why a grid built on those two comes out square rather than four times as
 * wide as it is tall. Nothing computes with it; it is here so the next person
 * to change a pitch knows what they are trading against, and `card.test.ts`
 * pins it so a silent edit to the line-height would be caught.
 */
export const ART_CELL_ASPECT = 0.52

export type CardOpts = {
  /** Cells of air between the content and the side walls. */
  padX?: number
  /** Rows of air between the content and the top and the ground. */
  padY?: number
  /** Outside width in cells. Defaults to whatever the content needs. */
  width?: number
}

/**
 * A picture, framed and standing on the ground.
 *
 *   +--------------------------+
 *   |     🦆              🦆   |
 *   |                          |
 *   |          🦆              |
 *   +==========================+
 *
 * SNUG, and that is the whole design decision. A first draft made every card
 * a fixed 34 x 14 so all of them matched, and it was wrong for the reason
 * `BlockView` already documents: a frame drawn around a picture plus a lot of
 * dead space is two frames, one of them enclosing nothing, and the picture
 * inside it looks smaller than it did unframed. The frame follows the picture.
 * What the six share is the VOCABULARY — these walls, this ground, content
 * centred inside — not a fixed rectangle.
 *
 * Content is never cut and never rearranged: `lines` come back in the order
 * they were given. Lines meant to line up with each other (a row of things and
 * the labels beneath it) must be padded to the SAME width by the caller — each
 * line is centred independently, so two different widths centre by two
 * different amounts and the labels would drift off the things they name.
 */
export const card = (lines: readonly string[], opts: CardOpts = {}): string => {
  const padX = opts.padX ?? 2
  const padY = opts.padY ?? 0
  const inner = Math.max(
    1,
    (opts.width ?? 0) - 2,
    ...lines.map((l) => cells(l) + padX * 2),
  )
  const blank = ' '.repeat(inner)
  const body = [
    ...Array.from({ length: padY }, () => blank),
    ...lines.map((l) => centre(l, inner)),
    ...Array.from({ length: padY }, () => blank),
  ]
  return [
    TL + RAIL.repeat(inner) + TR,
    ...body.map((r) => WALL + r + WALL),
    GL + GROUND.repeat(inner) + GR,
  ].join('\n')
}
