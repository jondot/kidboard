import type { CanvasLike, LiveCartridge } from '../../types'
import {
  CORR_H, CORR_W, PITCH_H, PITCH_W, WALL_X, WALL_Y,
  canWalk, generateMaze, mazeDims, mazeSize, wallRects,
} from './generate'
import type { Maze } from './generate'
import en from './en.json'
import he from './he.json'
import { sameStage, stageOf } from '../stage'
import { HOLD_IGNORE } from '../pacing'

// The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra columns
// follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 maze needs on a desktop. See `stageOf` in `../stage`.
const COLS = 30
const ASPECT = 1

// ---- THE STAGE: a screen inside the canvas -------------------------------
//
// A play field is field-shaped, never a slot: `stageOf` returns the largest
// centred rectangle of the pixel field whose ON-SCREEN proportions stay
// between 3:4 and 4:3, and everything outside it is the theme's own ground.
// The arithmetic (a logical pixel is 0.6 as wide as it is tall, so a `pw x ph`
// block reads as `0.6 * pw : ph`) lives in `../stage`, once, for every game
// that draws shapes — see `src/cartridges/stage.ts`.

// ---- the picture ---------------------------------------------------------
//
// ONE INK, `plain` — the theme's own foreground. Walls are solid blocks; the
// child is a solid little figure; home is a HOLLOW house. Nothing here needs
// a second hue: what says "that is the door and this is you" is that one of
// them is filled in and the other is not.
const INK = 'plain' as const

// SECONDS: there is exactly one of them in this game. Nothing here happens
// because time passed — but a child arrives home WITH THE ARROW KEY STILL
// DOWN, and a held arrow is a fresh keydown every ~30 ms, so the party needs
// a moment that a key already in flight cannot dismiss. `tick` runs that half
// second and nothing else. See `../pacing`.

/** The child. 11 x 7 pixels, which reads square, and solid all through. */
const CHILD = [
  '   #####   ',
  '  #######  ',
  '   #####   ',
  ' ######### ',
  ' ######### ',
  '  ##   ##  ',
  '  ##   ##  ',
]

/** Home. The same size, and HOLLOW — a roof, two walls and a door. */
const HOME = [
  '     #     ',
  '    ###    ',
  '   #####   ',
  '  #######  ',
  ' ######### ',
  ' ##     ## ',
  ' ## ### ## ',
]

/** Both bitmaps are 11 x 7, drawn at DOUBLE size: one source pixel becomes a
 *  2 x 2 block. Chunky on purpose, and it fills the corridor properly. */
const SPRITE_SCALE = 2
const SPRITE_W = 11 * SPRITE_SCALE
const SPRITE_H = 7 * SPRITE_SCALE

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'maze',
  triggers: { en: ['maze'], he: ['מבוך'], emoji: ['🌀'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('maze.move') }],

  create(ctx) {
    // The live stage, learned from the canvas every frame. `tick` gets no
    // canvas, so the last drawn stage is the honest answer for it.
    let stage = stageOf(COLS * 8, 18 * 8)

    // Laid out immediately: `lay()` re-lays it on every resize, but the first
    // maze exists before any draw or tick, so the cartridge is safe whatever
    // order a host calls it in.
    const first = mazeDims(stage.w, stage.h)
    let maze: Maze = generateMaze(ctx.rng, first.cw, first.ch)
    let px = 0
    let py = 0
    // NOTHING RE-ARMS ON A TIMER. Reaching home used to start a countdown and
    // then deal a fresh maze underneath the child. Now the walk simply ends:
    // the child stands in the doorway with the rings around them for as long
    // as they like, and the next key press is what asks for another maze.
    let home = false
    // Seconds the party has been standing. The pause belongs to the child's
    // eyes for its first half second, and only then does a key mean "again".
    let homeT = 0
    // Whether the child has ever reached home. Not how many times: this is a
    // yes/no memory, so there is nothing here that could become a score.
    let arrived = false

    const lay = (): void => {
      const { cw, ch } = mazeDims(stage.w, stage.h)
      maze = generateMaze(ctx.rng, cw, ch)
      px = 0
      py = 0
      home = false
      homeT = 0
    }

    // Offsets that centre the drawn maze in whatever stage we were handed, so
    // a wide screen shows a wide maze in the middle rather than a small one
    // pinned to the left.
    const ox = (): number =>
      stage.x + Math.max(0, Math.round((stage.w - mazeSize(maze).w) / 2))
    const oy = (): number =>
      stage.y + Math.max(0, Math.round((stage.h - mazeSize(maze).h) / 2))
    const homeX = (): number => maze.cw - 1
    const homeY = (): number => maze.ch - 1

    /**
     * Re-fits to the stage the canvas reported: a drag, a tablet rotation, or
     * the first frame in a real container. A maze cannot be stretched, so a
     * new one is laid out at the new size — freshly generated from the same
     * seeded rng, and solvable by construction like every other.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage)) return
      stage = s
      lay()
    }

    return {
      onKey(k) {
        // Home is a full stop. The next key — any key — asks for another
        // maze, and nothing at all happens until the child asks. But not the
        // very next key: for half a second the party is all there is, or the
        // arrow that walked into the doorway repeats and wipes it out before
        // the child has looked up.
        if (home) {
          if (homeT < HOLD_IGNORE) return
          lay()
          return
        }
        // Physical coordinates: left is screen-left in every language.
        const step =
          k.key === 'ArrowLeft' ? { x: -1, y: 0 }
            : k.key === 'ArrowRight' ? { x: 1, y: 0 }
              : k.key === 'ArrowUp' ? { x: 0, y: -1 }
                : k.key === 'ArrowDown' ? { x: 0, y: 1 }
                  : null
        if (!step) return

        if (!canWalk(maze, px, py, step.x, step.y)) {
          // A wall is a soft bump, not a mistake: nothing is taken away and
          // nothing is said. The child simply tries another way.
          ctx.audio.noise(45)
          return
        }
        px += step.x
        py += step.y
        ctx.audio.blip()

        if (px === homeX() && py === homeY()) {
          arrived = true
          home = true
          homeT = 0
          ctx.audio.note(660, 120)
          ctx.audio.note(880, 120)
          ctx.audio.note(990, 180)
        }
      },

      // The ONLY thing time does in this game. The maze waits, the child
      // walks when they walk, and home lasts until they say otherwise —
      // nothing here is on a timer. This runs the half second during which
      // the party cannot be dismissed by a key that was already down, and
      // stops accumulating the moment it has done its job.
      tick(dt) {
        if (home && homeT < HOLD_IGNORE) homeT += dt
      },

      draw(c) {
        refit(c)
        c.clear()
        const x0 = ox()
        const y0 = oy()

        // The walls: flat solid blocks, the whole world of this game.
        for (const r of wallRects(maze)) c.rect(x0 + r.x, y0 + r.y, r.w, r.h, INK)

        // A corridor is wider than a sprite, so both sit centred in one.
        const sx = (cx: number): number =>
          x0 + PITCH_W * cx + WALL_X + (CORR_W - SPRITE_W) / 2
        const sy = (cy: number): number =>
          y0 + PITCH_H * cy + WALL_Y + (CORR_H - SPRITE_H) / 2

        if (home) {
          // Arriving is a party on the doorstep, in pictures only: the child
          // standing in the doorway with two rings around them. It holds.
          const cx = sx(homeX()) + SPRITE_W / 2
          const cy = sy(homeY()) + SPRITE_H / 2
          c.sprite(sx(homeX()), sy(homeY()), CHILD, INK, { scale: SPRITE_SCALE })
          c.circle(cx, cy, SPRITE_W * 0.62, INK)
          c.circle(cx, cy, SPRITE_W * 0.85, INK)
        } else {
          c.sprite(sx(homeX()), sy(homeY()), HOME, INK, { scale: SPRITE_SCALE })
          c.sprite(sx(px), sy(py), CHILD, INK, { scale: SPRITE_SCALE })
        }
      },

      // Names what happened, never how often. A child who leaves mid-maze
      // gets a warm line about home waiting, never a bare "0".
      souvenir: () =>
        arrived ? ctx.t('maze.souvenir') : ctx.t('maze.souvenir.none'),
    }
  },
}

export default cartridge
