import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * BLOCKS — stack them up, fill a row, watch it go.
 *
 * The awkward one on the list, and worth saying why before the code. Tetris
 * is a LOSING game: the stack comes at you, it never ends well, and the
 * ending is always the same ending. Rule 4 of this house says a round ends
 * when the child says it ends. Those two things cannot both be true, so one
 * of them had to give, and it was not going to be the house rule.
 *
 * SO THERE IS NO GAME OVER. When the stack reaches the top, the well does not
 * flash "you lose" and it does not deal a fresh piece over the wreckage. It
 * HOLDS — the whole stack standing there, exactly as the child built it, with
 * a ring over it — and the next key sweeps it away and starts again. Nothing
 * is scored, nothing is deducted, and the picture the child is left looking
 * at is the tower they made rather than the moment it failed.
 *
 * FIVE PIECES, NOT SEVEN, and none of them is the S or the Z. The two
 * kinked pieces are the ones that make Tetris hard: they cannot sit flat on
 * a flat floor, so they are what turns a tidy stack into a ragged one, and
 * every adult who has ever groaned at this game groaned at those two. A
 * six-year-old is playing a game about putting shapes into gaps; the square,
 * the bar, the two corners and the T are that game. The kinks are a
 * different one.
 *
 * THE FILL RULE DOES REAL WORK HERE, and it is the reason the screen is
 * readable at a glance:
 *
 *   the piece you are steering   SOLID. One thing, ever, is solid.
 *   the stack you have built     HOLLOW squares. It is world now — it has
 *                                stopped being yours the moment it landed —
 *                                and hollow squares stack into something you
 *                                can still count the pieces in, which a solid
 *                                mass does not.
 *   the well                     a thin hollow rail, like every other court
 *                                in this box.
 *
 * That is monochrome doing something a colour could not: in real Tetris the
 * falling piece is told from the stack by hue, and here it is told by MASS,
 * which reads from further away and works for a colour-blind child.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** The well. Eight across is wide enough to have a choice and narrow enough
 *  to fill a row; twelve down is a real drop without being a long wait. */
const W = 8
const H = 12

/**
 * The pieces, each as a list of cells on a 3x3 grid with `[1, 1]` at its
 * centre. Rotation turns them about that centre, which is why the square and
 * the bar are written off-centre-free: a piece that rotates about a corner
 * jumps sideways when you turn it, and a six-year-old reads that as the game
 * moving their piece for them.
 */
type Cell = { x: number; y: number }
const PIECES: readonly Cell[][] = [
  // O — the square. Rotating it does nothing, which is a fine thing to
  // discover by pressing the key.
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  // I — a bar of three. Long enough to bridge a gap, short enough to fit one.
  [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
  // L and its mirror — the two corners.
  [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 1 }],
  // T — the piece that fits into a notch, which is the nicest moment in the
  // whole game the first time a child sees it happen.
  [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
]

/** Seconds between one row of falling and the next. Slow: this is a game
 *  about deciding, and a child who is deciding must not be hurried. */
const FALL_SLOW = 1.0
const FALL_FAST = 0.05
/** Every cleared row takes this much off the fall, down to a floor. */
const FALL_STEP = 0.035
const FALL_FLOOR = 0.35

/** Air around each block, as a fraction of a cell. */
const PAD = 0.08
const BLOCK_T = 3
/** How far the well's rail stands outside the cells, in pixels. */
const RAIL = 5

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'blocks',
  triggers: {
    en: ['blocks', 'tetris', 'stack'],
    he: ['קוביות'],
    emoji: ['🧊'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('blocks.move') },
    { keys: '↑', label: t('blocks.turn') },
    { keys: '↓', label: t('blocks.drop') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    /** The settled stack. `true` where a block has landed. */
    let stack: boolean[] = Array(W * H).fill(false)
    let piece: Cell[] = []
    let px = 0
    let py = 0
    let sinceFall = 0
    let fast = false
    let toppedOut = false
    let holdT = HOLD_IGNORE
    /** For the souvenir, and for the fall speed. Never drawn. */
    let rowsGone = 0
    let everLanded = false

    const fallEvery = (): number =>
      fast ? FALL_FAST : Math.max(FALL_FLOOR, FALL_SLOW - FALL_STEP * rowsGone)

    /** The cells a piece would occupy at `(ox, oy)`. */
    const cellsAt = (p: Cell[], ox: number, oy: number): Cell[] =>
      p.map((c) => ({ x: ox + c.x, y: oy + c.y }))

    /**
     * Every cell of the piece inside the well and on empty floor.
     *
     * `c.y >= 0` is in there for a reason that is entirely about the drawing:
     * a piece is never allowed to poke above the top of the well, because
     * `draw` cannot paint a cell that is off the grid and a child pressing UP
     * at the top would watch a limb of their piece silently disappear.
     */
    const fits = (p: Cell[], ox: number, oy: number): boolean =>
      cellsAt(p, ox, oy).every((c) =>
        c.x >= 0 && c.x < W && c.y >= 0 && c.y < H && !stack[c.y * W + c.x])

    const spawn = (): void => {
      piece = PIECES[ctx.rng.int(PIECES.length)]!.map((c) => ({ ...c }))
      px = Math.floor(W / 2)
      // ONE ROW DOWN, not on the top row. Two reasons, and the second is the
      // real one: the whole piece is visible the moment it appears — nothing
      // arrives from off the top of a screen a child is looking at — and a
      // piece turned upright needs a row above its centre to turn into. On
      // row zero, UP silently did nothing on the very first press of the game.
      py = 1
      sinceFall = 0
      fast = false
      if (!fits(piece, px, py)) {
        toppedOut = true
        holdT = 0
        ctx.audio.hit('snare')
      }
    }

    const clearRows = (): void => {
      let cleared = 0
      for (let y = H - 1; y >= 0; y--) {
        let full = true
        for (let x = 0; x < W; x++) if (!stack[y * W + x]) { full = false; break }
        if (!full) continue
        // Everything above slides down one. Walked from the bottom up with
        // `y` held still afterwards, so two full rows in a row both go.
        for (let yy = y; yy > 0; yy--) {
          for (let x = 0; x < W; x++) stack[yy * W + x] = stack[(yy - 1) * W + x]!
        }
        for (let x = 0; x < W; x++) stack[x] = false
        cleared += 1
        y += 1
      }
      if (cleared === 0) return
      rowsGone += cleared
      ctx.audio.note(700, 100)
      ctx.audio.note(950, 150)
    }

    const land = (): void => {
      for (const c of cellsAt(piece, px, py)) {
        if (c.y >= 0 && c.y < H) stack[c.y * W + c.x] = true
      }
      everLanded = true
      ctx.audio.hit('tom')
      clearRows()
      spawn()
    }

    const fall = (): void => {
      if (fits(piece, px, py + 1)) { py += 1; return }
      land()
    }

    const rotate = (): void => {
      // A quarter turn about the piece's own centre: (x, y) -> (-y, x).
      const turned = piece.map((c) => ({ x: -c.y, y: c.x }))
      // A kick of one cell either way, so a piece against a wall can still
      // turn. Without it a child holding the piece at the edge presses UP and
      // nothing happens, which reads as a broken key rather than as a rule.
      for (const kick of [0, -1, 1]) {
        if (!fits(turned, px + kick, py)) continue
        piece = turned
        px += kick
        ctx.audio.note(620, 40)
        return
      }
    }

    spawn()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /**
     * A cell that is SQUARE ON SCREEN, and where the well sits in the stage.
     *
     * The well is fitted to the stage MINUS the rail it wears, or the rail
     * lands outside the canvas and the top and bottom of it are simply not
     * drawn — which shipped once and rendered as two vertical lines with no
     * floor between them.
     */
    const geom = (): { cw: number; ch: number; ox: number; oy: number } => {
      const room = { w: stage.w - RAIL * 2, h: stage.h - RAIL * 2 }
      const cw = Math.min(room.w / W, room.h / (H * PIXEL_ASPECT))
      const ch = cw * PIXEL_ASPECT
      return {
        cw, ch,
        ox: stage.x + (stage.w - cw * W) / 2,
        oy: stage.y + (stage.h - ch * H) / 2,
      }
    }

    return {
      onKey(k) {
        if (toppedOut) {
          if (holdT < HOLD_IGNORE) return
          stack = Array(W * H).fill(false)
          toppedOut = false
          rowsGone = 0
          spawn()
          return
        }
        if (k.key === 'ArrowLeft') { if (fits(piece, px - 1, py)) { px -= 1; ctx.audio.blip() } }
        else if (k.key === 'ArrowRight') { if (fits(piece, px + 1, py)) { px += 1; ctx.audio.blip() } }
        else if (k.key === 'ArrowUp') rotate()
        else if (k.key === 'ArrowDown') fast = true
      },

      tick(dt) {
        if (toppedOut) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }
        sinceFall += dt
        while (sinceFall >= fallEvery() && !toppedOut) {
          sinceFall -= fallEvery()
          fall()
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const { cw, ch, ox, oy } = geom()

        // The well: a hollow rail around the play area, world.
        c.outline(ox - RAIL, oy - RAIL, cw * W + RAIL * 2, ch * H + RAIL * 2, INK, 3)

        // The stack, HOLLOW. It has stopped being the child's the moment it
        // landed, and hollow squares stack into something whose pieces can
        // still be told apart, which a solid mass cannot.
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!stack[y * W + x]) continue
            c.outline(
              ox + x * cw + cw * PAD, oy + y * ch + ch * PAD,
              cw * (1 - PAD * 2), ch * (1 - PAD * 2), INK, BLOCK_T,
            )
          }
        }

        // The piece, SOLID, and the only solid thing on the screen.
        if (!toppedOut) {
          for (const cell of cellsAt(piece, px, py)) {
            if (cell.y < 0 || cell.y >= H) continue
            c.rect(
              ox + cell.x * cw + cw * PAD, oy + cell.y * ch + ch * PAD,
              cw * (1 - PAD * 2), ch * (1 - PAD * 2), INK,
            )
          }
        }

        // Topped out. Two rings over the middle of the tower the child built
        // — hollow, so they are plainly not part of it — and the stack itself
        // left standing exactly as it was.
        if (toppedOut) {
          const cx = ox + (cw * W) / 2
          const cy = oy + (ch * H) / 2
          c.circle(cx, cy, cw * 1.4, INK)
          c.circle(cx, cy, cw * 2.0, INK)
        }
      },

      souvenir: () => {
        if (rowsGone >= 4) return ctx.t('blocks.souvenir.many')
        if (rowsGone >= 1) return ctx.t('blocks.souvenir.row')
        if (everLanded) return ctx.t('blocks.souvenir.stacked')
        return ctx.t('blocks.souvenir.none')
      },
    }
  },
}

export default cartridge
