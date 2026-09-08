import type { CanvasLike, LiveCartridge, Tone } from '../../types'
import { sameStage, stageOf } from '../stage'
import en from './en.json'
import he from './he.json'

// The pad's DESIGN size: 30 columns at its narrowest and, at that width,
// exactly as wide as it is tall. Rows follow from the aspect (18 of them);
// extra columns follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 sheet of paper needs on a desktop. See `stageOf` in
// `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain` — the theme's own foreground. This is the cartridge that
// changed most in the port and the one that gained most from it: a drawing
// used to be `█` characters on a 36 x 27 grid of cells, which is a chunky,
// low-resolution thing to hand a child who wants to draw a cat.
const INK = 'plain' as const
/** The paper's edge. */
const WALL = 3
/** How far the two pen guides reach in from that edge. Long enough to be a
 *  ruler tick rather than a nick in the border: they are the only way to find
 *  the nib once a child has drawn a big patch of ink around it. */
const GUIDE = 11

/**
 * ONE DOT of the pad, in logical pixels. A logical pixel is 0.6 as wide as it
 * is tall, so 5 x 3 is the smallest block that reads as SQUARE — which is
 * what a drawing lattice has to be, or a circle a child draws comes out an
 * egg. Adjacent dots tile exactly, so a filled-in patch is a solid area with
 * no seams in it.
 *
 * A 640 px stage is 46 dots tall and 62 across: nearly five times the
 * resolution of the character grid this used to draw on.
 */
export const DOT_W = 5
export const DOT_H = 3

/**
 * The three brushes, in the order SPACE cycles them.
 *
 * SPACE used to cycle the pen's COLOUR through five tones. Under one ink
 * there is no colour to cycle, so it cycles what a child can actually see the
 * difference between — how big a mark is, and whether it puts ink down or
 * takes it away. That is more expressive than the colours were, not less: an
 * eraser is the first thing a 6-year-old asks for and the pad never had one,
 * because "start again" wiped the whole page and there was nothing in
 * between.
 *
 * The brushes are told apart the way everything else in this project is:
 * `fine` is a small solid nib, `fat` a big solid one, and the rubber is the
 * same size as `fat` but HOLLOW — solid puts ink down, hollow takes it away.
 */
export const BRUSHES = [
  { id: 'fine', span: 1, erase: false },
  { id: 'fat', span: 3, erase: false },
  { id: 'rub', span: 3, erase: true },
] as const
export type Brush = (typeof BRUSHES)[number]['id']

/**
 * The picture, and NOTHING but the picture: plain JSON, no functions, no
 * class instances, no closures. A concurrent task turns a child's drawing
 * into a shareable cartridge image, and this is the whole thing it has to
 * read — `JSON.stringify(drawing)` is already a complete, replayable save
 * file, and it stays that way.
 *
 * `marks` is keyed `"x,y"` rather than held as an array so a pen that crosses
 * its own line overwrites instead of growing the file forever. `w`/`h` are
 * the pad's size in DOTS and `dot` is one dot's size in logical pixels, which
 * together are everything an exporter needs to know the picture's real
 * proportions.
 */
export type Drawing = {
  w: number
  h: number
  /**
   * One dot's size in logical pixels. Optional, because a picture that does
   * not carry it is a grid of squares — which is what every exporter assumed
   * when this pad drew on character cells.
   */
  dot?: { w: number; h: number }
  /**
   * A mark's value is the ink it was laid in. There is exactly one ink now
   * (`plain`, the theme's own foreground) and the field stays a `Tone` rather
   * than becoming a bare `1`, because the picture is read back by the cart
   * exporter and painted straight through — a tone re-tints with the theme,
   * and a saved drawing should look right in whatever theme opens it.
   */
  marks: Record<string, Tone>
}

export const emptyDrawing = (w: number, h: number): Drawing => ({
  w, h, dot: { w: DOT_W, h: DOT_H }, marks: {},
})

export const cellKey = (x: number, y: number): string => `${x},${y}`

/** The picture as a list, for anything that would rather iterate than parse. */
export function marksOf(d: Drawing): { x: number; y: number; ink: Tone }[] {
  const out: { x: number; y: number; ink: Tone }[] = []
  for (const [key, ink] of Object.entries(d.marks)) {
    const [x, y] = key.split(',').map(Number)
    if (x === undefined || y === undefined) continue
    out.push({ x, y, ink })
  }
  return out
}

/**
 * The most recent picture drawn in this session, or null before anything has
 * been drawn. This is the export hook: it is a plain `Drawing`, held here
 * rather than buried in a closure precisely so "save my drawing" is one read
 * and a `JSON.stringify`, with nothing to untangle.
 */
let latest: Drawing | null = null
export const currentDrawing = (): Drawing | null => latest

/** Dots per second the pen glides. A dot is square on screen, so one speed
 *  is the same speed in every direction. At 20 the pen crosses the whole page
 *  in about three seconds of holding a key, which is what it took on the
 *  coarser character grid this replaced. */
const PEN_SPEED = 20
/** A press buys this much travel; holding the key keeps topping it up. */
const GLIDE_PER_PRESS = 1
/** …but never more than this, so the pen stops soon after a child lets go. */
const GLIDE_MAX = 2
/** More marks than this and the page counts as full. Never shown, never said. */
const A_LOT = 150

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'draw',
  // Checked against the live registry before choosing: nothing claims "draw",
  // "ציור" or ✏️ — `colors` owns the colour words but not the act of drawing.
  // So this one keeps the plain verb from the design table, with "doodle"
  // alongside it.
  triggers: {
    en: ['draw', 'doodle'],
    he: ['ציור'],
    emoji: ['✏️'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [
    { keys: '← ↑ → ↓', label: t('draw.move') },
    { keys: 'SPACE', label: t('draw.ink') },
    { keys: 'C', label: t('draw.clear') },
  ],

  create(ctx) {
    // The live stage, learned from the canvas on the first draw and refreshed
    // on every one after it. `tick` gets no canvas, so the last drawn stage is
    // the honest answer for it — and a draw always precedes the first tick.
    let stage = stageOf(COLS * 8, 18 * 8)

    /** The pad, in DOTS, and where its top-left dot sits in stage pixels. */
    let cols = Math.floor((stage.w - 2 * WALL) / DOT_W)
    let rows = Math.floor((stage.h - 2 * WALL) / DOT_H)
    let padX = WALL
    let padY = WALL

    const drawing = emptyDrawing(cols, rows)
    latest = drawing

    let penX = Math.floor(cols / 2)
    let penY = Math.floor(rows / 2)
    let dirX = 0
    let dirY = 0
    let glide = 0
    let brush = 0

    // Total marks ever laid down, cleared page or not. Internal only: it
    // picks between three fixed sentences and is never shown, never counted
    // out loud, and never painted. See src/cartridges/README.md, "Souvenirs".
    let everDrew = 0

    const lay = (): void => {
      cols = Math.max(4, Math.floor((stage.w - 2 * WALL) / DOT_W))
      rows = Math.max(4, Math.floor((stage.h - 2 * WALL) / DOT_H))
      // Centre the lattice in the paper, so the margin is even on both sides
      // rather than piling up on the right.
      padX = WALL + Math.floor((stage.w - 2 * WALL - cols * DOT_W) / 2)
      padY = WALL + Math.floor((stage.h - 2 * WALL - rows * DOT_H) / 2)
      drawing.w = cols
      drawing.h = rows
    }

    lay()

    /** Puts down (or rubs out) the brush's whole footprint, centred on the
     *  dot the pen is over. A footprint is quantized even though the pen is
     *  not: the marks land on the lattice, the nib glides between them. */
    const mark = (): void => {
      const b = BRUSHES[brush]!
      const half = (b.span - 1) / 2
      const cx = Math.round(penX)
      const cy = Math.round(penY)
      for (let j = -half; j <= half; j++) {
        for (let i = -half; i <= half; i++) {
          const x = cx + i
          const y = cy + j
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue
          const key = cellKey(x, y)
          if (b.erase) {
            delete drawing.marks[key]
            continue
          }
          if (drawing.marks[key] === undefined) everDrew += 1
          drawing.marks[key] = INK
        }
      }
    }

    /**
     * Re-fits to the live stage: a window drag, a tablet rotation, or simply
     * the first frame inside a real container. The picture is NOT rescaled —
     * a child's drawing is theirs, and stretching it would smear it. Marks
     * outside a shrunken page are kept in `marks` and simply not painted, so
     * widening the window brings them back exactly as they were.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage)) return
      stage = s
      lay()
      if (Object.keys(drawing.marks).length === 0) {
        // Nothing drawn yet, so there is nothing to preserve: start the pen
        // in the middle of the page a child was ACTUALLY given.
        penX = Math.floor(cols / 2)
        penY = Math.floor(rows / 2)
        return
      }
      penX = clamp(penX, 0, cols - 1)
      penY = clamp(penY, 0, rows - 1)
    }

    /** One dot of the lattice, in stage pixels. */
    const dotX = (i: number): number => padX + i * DOT_W
    const dotY = (j: number): number => padY + j * DOT_H

    return {
      onKey(k) {
        // Physical coordinates: left is screen-left in every language, so
        // nothing here ever looks at ctx.dir or ctx.locale.
        const want =
          k.key === 'ArrowLeft' ? { x: -1, y: 0 }
            : k.key === 'ArrowRight' ? { x: 1, y: 0 }
              : k.key === 'ArrowUp' ? { x: 0, y: -1 }
                : k.key === 'ArrowDown' ? { x: 0, y: 1 }
                  : null

        if (want) {
          dirX = want.x
          dirY = want.y
          // Each press buys a dot of travel; a held key tops it up faster
          // than the pen spends it, so holding draws one smooth line and
          // letting go stops within a dot.
          glide = Math.min(GLIDE_MAX, glide + GLIDE_PER_PRESS)
          mark()
          return
        }

        if (k.key === ' ' || k.key === 'Spacebar') {
          brush = (brush + 1) % BRUSHES.length
          ctx.audio.blip()
          // The pen's own dot takes the new brush straight away, so a child
          // sees what SPACE did without having to move first — including the
          // rubber, which rubs out the dot it is standing on.
          mark()
          return
        }

        // Clear. 'ב' is the letter on the same physical key under a Hebrew
        // layout, and backspace is what a child reaches for anyway — all of
        // them are accepted always, in every locale, so nothing here has to
        // ask what language the shell is in.
        if (k.key === 'c' || k.key === 'C' || k.key === 'ב'
          || k.key === 'Backspace' || k.key === 'Delete') {
          drawing.marks = {}
          glide = 0
          ctx.audio.noise(90)
        }
      },

      tick(dt) {
        if (glide <= 0) return
        const step = Math.min(PEN_SPEED * dt, glide)
        glide -= step
        // Fractional, always: at 20 dots a second the pen crosses a dot in
        // three frames, and rounding it here is exactly the stutter the
        // renderer exists to remove.
        const nx = clamp(penX + dirX * step, 0, cols - 1)
        const ny = clamp(penY + dirY * step, 0, rows - 1)
        if (nx === penX && ny === penY) glide = 0    // the edge of the paper
        penX = nx
        penY = ny
        mark()
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x, y } = stage

        // The paper: one HOLLOW rectangle. Hollow is what makes it read as
        // the page rather than as something drawn on it.
        c.outline(x, y, stage.w, stage.h, INK, WALL)

        // The picture. Marks sit on the lattice and tile seamlessly, so a
        // filled-in patch is one solid area; anything the page has shrunk
        // past is kept but not painted.
        for (const [key, ink] of Object.entries(drawing.marks)) {
          const [i, j] = key.split(',').map(Number)
          if (i === undefined || j === undefined) continue
          if (i < 0 || i >= cols || j < 0 || j >= rows) continue
          c.rect(x + dotX(i), y + dotY(j), DOT_W, DOT_H, ink)
        }

        // Two guides on the paper's edge, level with the pen: a child who has
        // drawn a big patch of ink can still find the nib inside it, because
        // these are never covered by anything. They are also what makes the
        // pad read as a machine rather than as a sheet of paper.
        const gx = clamp(x + padX + penX * DOT_W, x, x + stage.w - DOT_W)
        const gy = clamp(y + padY + penY * DOT_H, y, y + stage.h - DOT_H)
        c.rect(gx, y, DOT_W, GUIDE, INK)
        c.rect(x, gy, GUIDE, DOT_H, INK)

        // The nib, LAST so it is never buried, at its RAW fractional position
        // and in the shape of the brush it is about to use — which is the only
        // "what am I holding?" indicator there is. No swatch bar, no label, no
        // number: a fat nib is fat, and the rubber is the hollow one.
        const b = BRUSHES[brush]!
        const nx = x + padX + (penX - (b.span - 1) / 2) * DOT_W
        const ny = y + padY + (penY - (b.span - 1) / 2) * DOT_H
        if (b.erase) c.outline(nx, ny, b.span * DOT_W, b.span * DOT_H, INK, 2)
        else c.rect(nx, ny, b.span * DOT_W, b.span * DOT_H, INK)
      },

      // Three fixed sentences, chosen by how much of the page was used and
      // never by a number the child ever sees. A child who opens the pad and
      // leaves gets a warm invitation, not a bare zero.
      souvenir: () =>
        everDrew === 0 ? ctx.t('draw.souvenir.none')
          : everDrew < A_LOT ? ctx.t('draw.souvenir.some')
            : ctx.t('draw.souvenir.lots'),
    }
  },
}

export default cartridge
