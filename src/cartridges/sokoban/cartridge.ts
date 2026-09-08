import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'
import {
  LEVELS, parse, restore, snapshot, solved, step, type Board,
} from './levels'

/**
 * CRATES — walk into a box, the box moves. That is the whole rule.
 *
 * Sokoban is the one classic puzzle whose entire ruleset fits in a sentence a
 * five-year-old can repeat back, and whose difficulty comes from nothing but
 * that sentence. There is no timer, no enemy, no reflex, nothing that can
 * happen to a child who is thinking. It is the calmest thing in this box and
 * the only one where being slow is an advantage.
 *
 * THE ONE THING THAT HAD TO BE SOLVED. A crate pushed into a corner is stuck
 * forever, and a six-year-old will do that on their first board. Without a way
 * back that is a child stranded in a room they cannot leave — precisely the
 * "state a child can be stuck in" the house style forbids. So U undoes, all
 * the way back to the start of the level, and it is the second hint on the
 * bar. Level four is built to teach the corner while the undo is still new.
 *
 * FOUR THINGS ON SCREEN, TOLD APART BY FILL AND SIZE — never by colour:
 *
 *   the wall      a SOLID block filling its whole cell, so walls merge into
 *                 one mass and read as a room rather than as a row of bricks
 *   a target      a small HOLLOW ring in the middle of an empty floor: the
 *                 world asking for something, and hollow because it is not a
 *                 thing you can touch
 *   a crate       a solid square, inset so it never touches the wall beside
 *                 it, with a HOLLOW middle — a box has a lid
 *   a done crate  the same square with the middle FILLED IN. Mass is the
 *                 whole signal: a finished board is the heaviest picture on
 *                 screen, and a child can see they have finished from across
 *                 the room without reading anything.
 *   the child     the same solid figure `maze` uses, because it is the same
 *                 child, and a game should not introduce a new person for no
 *                 reason.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** `maze`'s child, unchanged. The same small person in both games. */
const CHILD = [
  '   #####   ',
  '  #######  ',
  '   #####   ',
  ' ######### ',
  ' ######### ',
  '  ##   ##  ',
  '  ##   ##  ',
]
const CHILD_ROWS = 7
const CHILD_COLS = 11

/** Fractions of one cell. */
const CRATE_INSET = 0.12   // air between a crate and whatever is beside it
const CRATE_LID = 0.28     // the hollow middle, as a fraction of the crate
const GOAL_R = 0.22        // the target ring's horizontal radius
const RING_T = 2           // hollow line thickness, in pixels, floor of 2

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'sokoban',
  triggers: {
    en: ['crates', 'sokoban', 'boxes'],
    he: ['ארגזים'],
    emoji: ['📦'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← ↑ → ↓', label: t('sokoban.push') },
    { keys: 'U', label: t('sokoban.undo') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let n = 0
    let board: Board = parse(LEVELS[0]!)
    /** Every position since the level started, newest last. U walks it back. */
    let trail: ReturnType<typeof snapshot>[] = []
    let done = false
    let doneT = 0
    /** How far the child got, for the souvenir. Never shown as a number. */
    let reached = 0
    let everPushed = false

    const load = (i: number): void => {
      n = i % LEVELS.length
      board = parse(LEVELS[n]!)
      trail = []
      done = false
      doneT = 0
    }

    const finish = (): void => {
      done = true
      doneT = 0
      reached = Math.max(reached, n + 1)
      ctx.audio.note(660, 110)
      ctx.audio.note(880, 110)
      ctx.audio.note(990, 180)
    }

    // A board that opens already solved would be a bug, but a one-crate
    // level is close enough to one that the check belongs here rather than
    // only after a move.
    if (solved(board)) finish()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /**
     * The board's geometry inside the stage: a square-ON-SCREEN cell, and the
     * offset that centres the room.
     *
     * A logical pixel is 0.6 as wide as it is tall, so a cell that LOOKS
     * square is `cw` pixels across and `0.6 * cw` down. Sizing both axes off
     * one number is what keeps a 9x8 room from reading as a letterbox.
     */
    const geom = (): { cw: number; ch: number; ox: number; oy: number } => {
      const cw = Math.min(stage.w / board.w, stage.h / (board.h * PIXEL_ASPECT))
      const ch = cw * PIXEL_ASPECT
      return {
        cw,
        ch,
        ox: stage.x + (stage.w - cw * board.w) / 2,
        oy: stage.y + (stage.h - ch * board.h) / 2,
      }
    }

    const move = (dx: number, dy: number): void => {
      const before = snapshot(board)
      const m = step(board, dx, dy)
      if (!m.moved) {
        ctx.audio.noise(40)
        return
      }
      trail.push(before)
      if (m.pushed) {
        everPushed = true
        // A pushed crate sounds like weight sliding; a step is a step. Two
        // different noises, so a child hears whether they moved a box even
        // when they were looking at the other end of the room.
        ctx.audio.hit('tom')
      } else {
        ctx.audio.blip()
      }
      if (solved(board)) finish()
    }

    const undo = (): void => {
      const back = trail.pop()
      if (!back) return
      restore(board, back)
      ctx.audio.note(330, 70)
    }

    return {
      onKey(k) {
        if (done) {
          // The beat after a solve is protected, or a child with a finger
          // still on an arrow never sees the board they just finished.
          if (doneT < HOLD_IGNORE) return
          load(n + 1)
          return
        }
        if (k.key.toLowerCase() === 'u') {
          undo()
          return
        }
        if (k.key === 'ArrowLeft') move(-1, 0)
        else if (k.key === 'ArrowRight') move(1, 0)
        else if (k.key === 'ArrowUp') move(0, -1)
        else if (k.key === 'ArrowDown') move(0, 1)
      },

      tick(dt) {
        if (done && doneT < HOLD_IGNORE) doneT += dt
      },

      draw(c) {
        refit(c)
        c.clear()
        const { cw, ch, ox, oy } = geom()
        const px = (x: number): number => ox + x * cw
        const py = (y: number): number => oy + y * ch

        for (let y = 0; y < board.h; y++) {
          for (let x = 0; x < board.w; x++) {
            const i = y * board.w + x

            // The wall fills its cell edge to edge, so a run of them is one
            // solid mass rather than a dotted line of blocks.
            if (board.wall[i]) {
              c.rect(px(x), py(y), cw + 1, ch + 1, INK)
              continue
            }

            // A target under a crate is not drawn: the filled-in crate is
            // already saying it. Drawing both put a ring inside a solid
            // square, which reads as a third kind of object.
            if (board.goal[i] && !board.crate[i]) {
              c.circle(px(x) + cw / 2, py(y) + ch / 2, cw * GOAL_R, INK)
            }

            if (board.crate[i]) {
              const ix = px(x) + cw * CRATE_INSET
              const iy = py(y) + ch * CRATE_INSET
              const iw = cw * (1 - CRATE_INSET * 2)
              const ih = ch * (1 - CRATE_INSET * 2)
              if (board.goal[i]) {
                // DONE: solid all the way through. The heaviest thing on the
                // board, and the only signal a finished level needs.
                c.rect(ix, iy, iw, ih, INK)
              } else {
                // A box with a lid: solid walls, hollow middle.
                c.outline(ix, iy, iw, ih, INK, Math.max(RING_T, Math.round(iw * CRATE_LID / 2)))
              }
            }
          }
        }

        // The child last, so they are never hidden under a crate that shares
        // their cell for a frame during a resize.
        const scale = Math.max(1, Math.floor((cw * 0.7) / CHILD_COLS))
        c.sprite(
          px(board.x) + (cw - CHILD_COLS * scale) / 2,
          py(board.y) + (ch - CHILD_ROWS * scale) / 2,
          CHILD, INK, { scale },
        )

        // A solved board wears two rings around the child — the same cheer
        // `maze` uses when they get home, and hollow, so it can never be
        // mistaken for a piece of the puzzle.
        if (done) {
          const cx = px(board.x) + cw / 2
          const cy = py(board.y) + ch / 2
          c.circle(cx, cy, cw * 0.42, INK)
          c.circle(cx, cy, cw * 0.60, INK)
        }
      },

      /**
       * How far they got, named rather than counted. A child who opens the
       * game and presses ESC has pushed nothing and gets the warm line.
       */
      souvenir: () => {
        if (reached >= LEVELS.length) return ctx.t('sokoban.souvenir.all')
        if (reached >= 4) return ctx.t('sokoban.souvenir.far')
        if (reached >= 1) return ctx.t('sokoban.souvenir.some')
        if (everPushed) return ctx.t('sokoban.souvenir.pushed')
        return ctx.t('sokoban.souvenir.none')
      },
    }
  },
}

export default cartridge
