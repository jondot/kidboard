import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { PIXEL_ASPECT, stageOf } from '../stage'
import { HOLD_IGNORE } from '../pacing'

// The board's DESIGN size: 30 columns at its narrowest and, at that width,
// exactly as wide as it is tall. Rows follow from the aspect (18 of them);
// extra columns follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 board needs on a desktop. See `stageOf` in `../stage`.
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

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK. The whole board is drawn in `plain` — the theme's own foreground —
// so it re-tints with the theme and can never clash with it. Nothing here is
// told apart by colour: the wall is HOLLOW and the things are SOLID; the
// snake is SQUARE and the fruit is ROUND with a stalk; the head keeps its
// whole square while every body block is trimmed. Shape does the work a
// second hue would have done badly.
const INK = 'plain' as const
const WALL = 3
/** One board square. 16 x 10 pixels reads as a SQUARE: a pixel is 0.6 as
 *  wide as it is tall, so 10 tall is 16.7 wide-units. */
const CELL_W = 16
const CELL_H = 10
/** Pixels trimmed off each side of a body block, which is what turns a
 *  ribbon into segments. The head keeps the whole square, so it reads as a
 *  head without a second colour. */
const SEG = 1
/** Fruit radius (horizontal; `disc` squashes the vertical one for us). */
const FRUIT_R = 5
/** Pixels of stalk above the fruit. Two pixels of charm, and the thing that
 *  makes a round blob unmistakably a fruit rather than a ball. */
const STALK = 3

/** Seconds per step. Slow on purpose: a 6-year-old has to be able to turn. */
const STEP = 0.4
const START_LEN = 3
/** A single tick can never advance more than this, whatever dt arrives. */
const MAX_STEPS_PER_TICK = 2

/**
 * The fruit the snake eats. Each carries the id of the translation key that
 * NAMES it — the souvenir says "you ate the strawberry!", never how many.
 *
 * The emoji is no longer painted (the board is a pixel field now, and a
 * fruit is a small disc), but it is kept: it is what the `fruits` menu and
 * any future prose line reach for, and dropping it would be an unrelated
 * change to a table other code reads.
 */
export const FRUITS = [
  { emoji: '🍓', id: 'strawberry' },
  { emoji: '🍎', id: 'apple' },
  { emoji: '🍌', id: 'banana' },
  { emoji: '🍇', id: 'grapes' },
  { emoji: '🍒', id: 'cherries' },
  { emoji: '🍉', id: 'watermelon' },
  { emoji: '🍊', id: 'orange' },
  { emoji: '🍐', id: 'pear' },
] as const

type Spot = { x: number; y: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'snake',
  // DEVIATION from the design table, deliberately: `animals` already claims
  // the word "snake", "נחש" and the 🐍 emoji (a snake is one of its animals),
  // and two cartridges may not share a trigger — `cartridges.test.ts` fails
  // the build if they do, and the resolver would hand every one of them to
  // `animals` anyway, since it sorts first. The game therefore answers to the
  // plural ("snakes" / "נחשים") plus "slither", and wears the worm as its
  // emoji, which nothing else claims.
  triggers: { en: ['snakes', 'slither'], he: ['נחשים'], emoji: ['🪱'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('snake.move') }],

  create(ctx) {
    // The live stage, learned from the canvas on the first draw and refreshed
    // on every one after it. `tick` gets no canvas, so the last drawn stage is
    // the honest answer for it — and a draw always precedes the first tick.
    let stage = stageOf(COLS * 8, 18 * 8)

    // The play field is a lattice of SQUARES inside the wall, centred in
    // whatever room the wall leaves. Everything the game simulates is in
    // lattice coordinates; the offset is added once, in `draw`.
    let gw = 0
    let gh = 0
    let ox = 0
    let oy = 0

    let body: Spot[] = []
    let dir: Spot = { x: 1, y: 0 }
    let next: Spot = dir
    let fruit: { x: number; y: number; emoji: string; id: string } | null = null
    let acc = 0
    // NOTHING RE-ARMS ON A TIMER. The snake is still until the child steers
    // it, and it goes still again after a bump — with the bump mark left on
    // the board so there is something to look at. The pause lasts exactly as
    // long as the child wants it to, and any arrow ends it.
    let running = false
    let bumpAt: Spot | null = null
    // Seconds this stillness has lasted. The snake is steered with the arrow
    // HELD DOWN, so the wall it hits is the one it was being driven at — and
    // without this the next auto-repeat, 30 ms later, wiped the mark off and
    // set it going again inside the same press. Starts already spent: opening
    // the game is not a bump, and the first arrow must answer at once.
    let stillT = HOLD_IGNORE
    // What the souvenir names. A counter of eaten fruit is deliberately NOT
    // kept: there is nothing here that could turn into a score.
    let lastFruit: string | null = null

    const sizeGrid = (): void => {
      const iw = Math.max(CELL_W * 4, stage.w - WALL * 2)
      const ih = Math.max(CELL_H * 3, stage.h - WALL * 2)
      gw = Math.max(4, Math.floor(iw / CELL_W))
      gh = Math.max(3, Math.floor(ih / CELL_H))
      // Centre the lattice in the room the wall left, so a board that does
      // not divide evenly has equal air on both sides rather than a fat
      // margin down one edge.
      ox = stage.x + Math.round((stage.w - gw * CELL_W) / 2)
      oy = stage.y + Math.round((stage.h - gh * CELL_H) / 2)
    }

    const occupied = (x: number, y: number): boolean =>
      body.some((s) => s.x === x && s.y === y)

    /** Puts the fruit on a free cell, chosen with the seeded rng only. */
    const placeFruit = (): void => {
      const free: Spot[] = []
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) if (!occupied(x, y)) free.push({ x, y })
      }
      const spot = free.length > 0 ? free[ctx.rng.int(free.length)]! : { x: 0, y: 0 }
      const kind = FRUITS[ctx.rng.int(FRUITS.length)]!
      fruit = { x: spot.x, y: spot.y, emoji: kind.emoji, id: kind.id }
    }

    /** A short snake in the middle of the field, heading right. Middle in
     *  BOTH axes: a snake pinned to the left edge with the whole board ahead
     *  of it reads as a game that has already half-started. */
    const reset = (len = START_LEN): void => {
      const n = Math.max(2, Math.min(len, gw - 1))
      const row = Math.floor(gh / 2)
      const nose = Math.max(n - 1, Math.floor(gw / 2))
      body = Array.from({ length: n }, (_, i) => ({ x: nose - i, y: row }))
      dir = { x: 1, y: 0 }
      next = dir
      acc = 0
    }

    /**
     * Re-fits everything that depends on the stage: a window drag, a tablet
     * rotation, or simply the first frame inside a real container. The snake
     * is re-laid at its current LENGTH rather than clamped cell by cell — a
     * clamp can fold two segments onto one cell, which would read as the
     * snake eating itself the instant the child resized the browser viewport.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      const same = s.w === stage.w && s.h === stage.h
        && s.x === stage.x && s.y === stage.y
      if (same && body.length > 0) return
      stage = s
      sizeGrid()
      // A new board is a new beginning: the mark from the old one means
      // nothing here, and the snake holds still until the child steers it
      // rather than bolting off the instant the window stops moving.
      bumpAt = null
      running = false
      reset(body.length || START_LEN)
      placeFruit()
    }

    // Lay the first board out immediately rather than waiting for the first
    // draw: the runtime always draws before it ticks, but a cartridge that
    // falls apart when called in another order is a trap for the next host.
    sizeGrid()
    reset()
    placeFruit()

    const bump = (at: Spot): void => {
      // A wall or a tail is a soft "oops", a pause, and a fresh short snake.
      // It is never a loss: nothing ends, nothing is taken away, and the
      // souvenir still remembers the fruit that was eaten.
      ctx.audio.noise(140)
      bumpAt = {
        x: Math.max(0, Math.min(gw - 1, at.x)),
        y: Math.max(0, Math.min(gh - 1, at.y)),
      }
      running = false
      stillT = 0
      reset()
    }

    const stepOnce = (): void => {
      dir = next
      const nx = body[0]!.x + dir.x
      const ny = body[0]!.y + dir.y
      const offBoard = nx < 0 || ny < 0 || nx >= gw || ny >= gh
      // The tail cell is about to move away, so running onto it is fine —
      // being forgiving about that is the difference between a game a small
      // child can play and one that punishes a wobbly turn.
      const intoSelf = body.slice(0, -1).some((s) => s.x === nx && s.y === ny)
      if (offBoard || intoSelf) {
        bump({ x: nx, y: ny })
        return
      }

      body.unshift({ x: nx, y: ny })
      if (fruit && nx === fruit.x && ny === fruit.y) {
        lastFruit = fruit.id
        ctx.audio.note(520 + body.length * 8, 90)
        placeFruit()
      } else {
        body.pop()
      }
    }

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
        if (!want) return
        // The first half second after a bump belongs to the child's eyes: the
        // mark on the board is the whole point of stopping, and an arrow that
        // was already down must not scrub it off before it has been seen.
        if (!running && stillT < HOLD_IGNORE) return
        // Turning back on itself would be an instant self-bump; ignoring it
        // is kinder than punishing it.
        if (body.length > 1 && want.x === -dir.x && want.y === -dir.y) return
        next = want
        // An arrow is also how a stopped snake starts again. There is no
        // separate key to learn and no way to be stuck.
        if (!running) {
          running = true
          bumpAt = null
        }
      },

      tick(dt) {
        // Still: the board holds, and the clock runs only far enough to end
        // the ignore window. Six hundred ticks change nothing else here.
        if (!running) {
          if (stillT < HOLD_IGNORE) stillT += dt
          return
        }
        acc += dt
        for (let i = 0; i < MAX_STEPS_PER_TICK && acc >= STEP; i++) {
          acc -= STEP
          stepOnce()
        }
        if (acc >= STEP) acc = 0
      },

      draw(c) {
        refit(c)
        c.clear()
        c.outline(stage.x, stage.y, stage.w, stage.h, INK, WALL)

        const sx = (cx: number): number => ox + CELL_W * cx
        const sy = (cy: number): number => oy + CELL_H * cy

        // The fruit: a round thing with a stalk, which is the only round
        // thing on a board made of squares. That is what makes it findable
        // without a second colour.
        if (fruit) {
          const fx = sx(fruit.x) + CELL_W / 2
          const fy = sy(fruit.y) + CELL_H / 2
          c.disc(fx, fy, FRUIT_R, INK)
          c.rect(fx - 1, fy - FRUIT_R * PIXEL_ASPECT - STALK, 2, STALK, INK)
        }

        // Body from tail to neck, then the head LAST so it draws on top.
        // Each body block is trimmed by a pixel on every side, which leaves a
        // seam between neighbours: the snake reads as segments rather than as
        // one long bar. One tone for the whole animal — alternating two of
        // them looked, on a real screen, like two animals holding hands.
        for (let i = body.length - 1; i >= 1; i--) {
          const s = body[i]!
          c.rect(sx(s.x) + SEG, sy(s.y) + SEG, CELL_W - SEG * 2, CELL_H - SEG * 2, INK)
        }
        const h = body[0]!
        c.rect(sx(h.x), sy(h.y), CELL_W, CELL_H, INK)

        // The "oops": a ring where the bump happened, held until the child
        // steers again. A picture, not a word — canvas art carries no
        // language — and a ring is hollow, so it cannot be mistaken for a
        // piece of snake.
        if (bumpAt) {
          const bx = Math.max(0, Math.min(gw - 1, bumpAt.x))
          const by = Math.max(0, Math.min(gh - 1, bumpAt.y))
          c.circle(sx(bx) + CELL_W / 2, sy(by) + CELL_H / 2, CELL_W * 0.5, INK)
        }
      },

      // Names the last fruit eaten, never how many were eaten. A child who
      // opens the game and leaves gets a warm line about a hungry snake.
      souvenir: () =>
        lastFruit === null
          ? ctx.t('snake.souvenir.none')
          : ctx.t('snake.souvenir', { fruit: ctx.t(`snake.fruit.${lastFruit}`) }),
    }
  },
}

export default cartridge
