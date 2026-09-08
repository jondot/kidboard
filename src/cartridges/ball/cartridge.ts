import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'
import { HOLD_IGNORE } from '../pacing'

// The court's DESIGN size: 30 columns wide and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra
// columns follow from however wide the terminal is. Nothing below hard-codes
// either — every measurement comes off `c.pw` / `c.ph` via `stageOf`.
//
// Why `aspect: 1` and not a wide number: rows are FIXED by the declared
// aspect, and a wide screen is handed extra COLUMNS. So the canvas is only
// ever wider than what is declared, never taller. Declaring a square canvas
// at 30 columns is what buys the height that a 4:3 court needs on a desktop.
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
// This is a 1977 paddle game: flat shapes on the theme's own ground, with
// hard edges and no decoration whatsoever.
//
// ONE INK. The whole game is drawn in `plain` — the theme's own foreground,
// the ink the terminal writes its prose in — so it re-tints with the theme
// and can never clash with it. Pong was white on black; three hues on a page
// is a colouring book, not a machine. What tells the court from the paddle is
// not colour but FILL: the court is hollow, everything solid is a thing.
const INK = 'plain' as const
const WALL = 3               // side rails, in pixels
const PADDLE_H = 8           // a chunky bar, not a hairline
const PADDLE_GAP = 8         // pixels of court below the paddle
const BALL_R = 9             // horizontal radius; `disc` makes it read round
const PADDLE_FRACTION = 0.2  // of the court's width

// ---- the simulation, in PIXELS PER SECOND -------------------------------
const SPEED = 14 * 8
const MAX_VX = 22 * 8
const STEP = 16              // pixels the paddle moves per key press

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'ball',
  // he: real Hebrew for "ball" (not a transliteration) — a Hebrew-speaking
  // child types Hebrew, not romanised Hebrew.
  triggers: { en: ['ball', 'bounce'], he: ['כדור'], emoji: ['⚽'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint here: the shell owns it and appends one whenever a
  // cartridge is running. Declaring it too rendered "ESC done" twice.
  hints: (t) => [
    { keys: '← →', label: t('ball.move') },
  ],

  create(ctx) {
    // The live stage, learned from the canvas on the first draw and refreshed
    // on every one after it. `tick` is not handed a canvas, so the last drawn
    // stage is the honest answer for it — and a draw always precedes the first
    // tick, because the session renders the moment a cartridge mounts.
    let stage = stageOf(COLS * 8, 18 * 8)
    let W = stage.w
    let H = stage.h

    const clamp = (n: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, n))

    // Everything below is in STAGE coordinates — 0..W across, 0..H down —
    // and the stage's offset is added once, in `draw`. The simulation never
    // has to know where on the canvas the screen happens to sit.
    let paddleW = Math.round(W * PADDLE_FRACTION)
    let paddle = (W - paddleW) / 2
    let bx = W / 2
    let by = H / 3
    let vx = ctx.rng.chance(0.5) ? SPEED * 0.7 : -SPEED * 0.7
    let vy = SPEED
    let bounces = 0

    // NOTHING RE-ARMS ON A TIMER. The ball starts at rest on the paddle and
    // goes back there whenever it is missed; the child serves it by pressing
    // a key. A still picture is not dead air — it is the beat in which a
    // 6-year-old works out what just happened and decides to go again. The
    // resting ball rides the paddle, so the serve is aimed, and the picture
    // says what will happen without a word in any language.
    let resting = true
    // ...AND THE PAUSE IS PROTECTED. Seconds this rest has lasted. A child
    // plays this game with the arrow HELD DOWN, and a held arrow is a keydown
    // every ~30 ms — so without this the miss, the rest and the next serve
    // all happened inside one press and the parked ball was never on screen
    // for more than two frames. See `../pacing`.
    //
    // It starts already spent: opening the game is not a round ending, and
    // the child who just typed `ball` must be answered at once.
    let restT = HOLD_IGNORE

    // Interior pixels are WALL..W-WALL. The paddle stops flush against the
    // rail rather than overlapping it: on a field this fine, flush reads as
    // deliberate, and there is no character grid left to shear.
    const paddleLo = () => WALL
    const paddleHi = () => Math.max(WALL, W - WALL - paddleW)
    /** Top of the paddle: the height at which the ball is either hit or lost. */
    const floor = () => H - WALL - PADDLE_GAP - PADDLE_H

    /** Puts the ball back on the paddle and stops the clock on it. */
    const rest = (): void => {
      resting = true
      restT = 0
      vy = SPEED
    }

    /** Where the resting ball sits: dead centre on top of the bar. */
    const restX = (): number => paddle + paddleW / 2
    // `disc` squashes the vertical radius by the pixel aspect, so the ball's
    // half-HEIGHT is `BALL_R * PIXEL_ASPECT`. Subtracting the horizontal
    // radius here would leave it hovering a visible gap above the bar.
    const restY = (): number => floor() - BALL_R * PIXEL_ASPECT - 1

    const serve = (): void => {
      resting = false
      bx = restX()
      by = restY()
      vx = ctx.rng.chance(0.5) ? SPEED * 0.7 : -SPEED * 0.7
      vy = -SPEED
    }

    /**
     * Re-fits everything that depends on the stage. Called whenever the canvas
     * reports a size we have not seen: a window drag, a tablet rotation, or
     * simply the first frame after mounting into a real container.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage)) return
      const oldW = W
      stage = s
      W = s.w
      H = s.h
      paddleW = Math.round(W * PADDLE_FRACTION)
      // Keep the rally where it was, proportionally, instead of teleporting
      // the ball to a wall when a child rotates the tablet mid-bounce.
      const k = W / oldW
      bx = clamp(bx * k, WALL + BALL_R, W - WALL - BALL_R)
      by = clamp(by, WALL + BALL_R, floor())
      paddle = clamp(paddle * k, paddleLo(), paddleHi())
    }

    return {
      onKey(k) {
        // THE FIRST HALF SECOND OF A REST BELONGS TO THE CHILD'S EYES. Not
        // just the serve — the paddle too, because the resting ball rides it
        // and a bar sliding out from under a parked ball is the same moment
        // being dismissed. After the window everything answers again.
        if (resting && restT < HOLD_IGNORE) return
        // Physical coordinates: left is screen-left in every language.
        if (k.key === 'ArrowLeft') paddle = clamp(paddle - STEP, paddleLo(), paddleHi())
        if (k.key === 'ArrowRight') paddle = clamp(paddle + STEP, paddleLo(), paddleHi())
        // ANY key serves — the arrows the child is already holding included.
        // There is no key to learn and no way to be stuck: whatever a child
        // presses, the ball goes. (ESC never reaches here; the shell owns it.)
        if (resting) serve()
      },

      tick(dt) {
        // At rest the ball rides the paddle and nothing else moves. This is
        // the whole pause: it lasts exactly as long as the child wants it to,
        // and `restT` is the only thing the clock is still good for — it runs
        // the ignore window and nothing else.
        if (resting) {
          restT += dt
          bx = restX()
          by = restY()
          return
        }

        bx += vx * dt
        by += vy * dt

        // Each check clamps the post-move position directly to the wall, so
        // no speed can ever tunnel the ball past a rail in a single tick —
        // there is no "in between" state to skip over.
        const lo = WALL + BALL_R
        if (bx <= lo) { bx = lo; vx = Math.abs(vx); ctx.audio.blip() }
        if (bx >= W - lo) { bx = W - lo; vx = -Math.abs(vx); ctx.audio.blip() }
        if (by <= lo) { by = lo; vy = Math.abs(vy); ctx.audio.blip() }

        if (by >= floor()) {
          const hit = bx >= paddle - BALL_R && bx <= paddle + paddleW + BALL_R
          if (hit) {
            bounces += 1
            ctx.audio.note(300 + bounces * 12, 70)
            by = floor() - 1
            vy = -Math.abs(vy)
            // Where on the bar it landed steers the rebound, which is the
            // whole game: the child aims with the paddle, not just blocks.
            vx = clamp(vx + ((bx - (paddle + paddleW / 2)) / paddleW) * 90,
              -MAX_VX, MAX_VX)
          } else {
            // A miss is a boing and a REST. Never a loss, never a score drop
            // — and never an instant re-serve either: the ball goes back to
            // the paddle and stays there until the child sends it off again.
            ctx.audio.noise(90)
            rest()
          }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x, y } = stage
        // The court: one HOLLOW rectangle of rail, filling the stage. Whole
        // coordinates, so it snaps to whole device pixels and stays crisp.
        // Hollow is what makes it read as the world rather than as a thing.
        c.outline(x, y, W, H, INK, WALL)
        // The paddle: a flat SOLID bar. Its x glides with the key repeat, so
        // it is deliberately NOT rounded here.
        c.rect(x + paddle, y + floor(), paddleW, PADDLE_H, INK)
        // The ball: a blocky disc whose FRACTIONAL position goes straight
        // through to the painter. That is what keeps it gliding at any speed.
        // At rest it sits on the bar, which is the entire "press to serve".
        c.disc(x + (resting ? restX() : bx), y + (resting ? restY() : by), BALL_R, INK)
      },

      // Qualitative, not counted: "boing boing boing!" says the rally was
      // lively without ever printing how lively. Capped at 3 repeats so a
      // long rally still reads as "a lot", not as a growing tally — and a
      // rally with zero paddle hits gets the same warm "boing!" as one hit,
      // never a bare "0".
      souvenir: () => ctx.t(`ball.souvenir.${Math.min(Math.max(bounces, 1), 3)}`),
    }
  },
}

export default cartridge
