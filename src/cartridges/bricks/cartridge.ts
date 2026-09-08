import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * BRICKS — the wall comes down one brick at a time.
 *
 * `ball` already owns the paddle and the bounce in this box, and this is
 * deliberately its sibling rather than its replacement: same court, same
 * serve-off-the-paddle, same "a round ends when the child says it ends". What
 * `bricks` adds is the one thing `ball` has not got, which is somewhere for
 * the ball to be GOING. A wall that visibly gets smaller is a goal a
 * five-year-old reads without a word of explanation, and it is the whole
 * reason Breakout outlived Pong.
 *
 * THE PICTURE, and why there is no second colour in it:
 *
 *   the wall     HOLLOW bricks. They are world — the thing that is there
 *                rather than the thing you touch — and hollow means the wall
 *                thins out visibly as it goes, which a grid of solid blocks
 *                does not.
 *   the paddle   SOLID. The child steers it, so it is the heaviest bar on
 *                screen, and it is well over a tenth of the court wide.
 *   the ball     SOLID, round, and big enough to be a ball rather than a
 *                speck: the house floor is ten pixels and 3% of the field.
 *   the rails    a thin hollow court, three pixels, the house minimum.
 *
 * THE SERVE IS THE INSTRUCTION. Between rounds the ball SITS ON THE PADDLE
 * and moves with it. Nothing says "press space"; the picture says it, in every
 * language, and a child who does nothing at all is looking at a still frame
 * rather than at a game that has started without them.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/**
 * The wall: FOUR rows of eight, and the row count is a drawing decision
 * rather than a difficulty one.
 *
 * A hollow brick needs three pixels of stroke (the house minimum for a wall)
 * on each of its two horizontal edges plus something in between, or it is not
 * hollow — it is a solid block with a rounding error in it. Five rows in this
 * band gave each brick seven pixels of height, six of which were stroke, and
 * the whole wall rendered as one grey slab: no gaps between rows, nothing to
 * thin out, and none of the "the wall is disappearing" that is the entire
 * point of the game. Four rows buy every brick eleven pixels and a real hole
 * in the middle, and the wall now visibly comes apart as it goes.
 */
const BRICK_COLS = 8
const BRICK_ROWS = 4
/** Where the wall sits, as fractions of the court's height. */
const WALL_TOP = 0.09
const WALL_BOT = 0.50
/** Air around each brick, as a fraction of its own cell — enough that the
 *  gaps between bricks are wider than the stroke around them. */
const BRICK_GAP = 0.12
const BRICK_T = 3

/** The paddle, as fractions of the court. Wide: rule 3 asks for a tenth. */
const PADDLE_W = 0.20
const PADDLE_H = 0.035
const PADDLE_Y = 0.93
/** Court-widths per second. */
const PADDLE_SPEED = 1.25

/** The ball's horizontal radius, as a fraction of the court's width. */
const BALL_R = 0.028
/** Court-heights per second. Slow enough to read, fast enough to be a ball. */
const BALL_SPEED = 0.62
/** Every cleared wall makes the next one this much brisker. */
const SPEED_STEP = 0.09

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'bricks',
  triggers: {
    en: ['bricks', 'breakout', 'wall'],
    he: ['לבנים'],
    emoji: ['🧱'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('bricks.move') },
    { keys: '␣', label: t('bricks.serve') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    /** `true` where a brick still stands. Court-relative, never pixels. */
    let wall: boolean[] = []
    let paddle = 0.5
    /** Ball centre and velocity, in court fractions and fractions per second. */
    let bx = 0.5
    let by = PADDLE_Y - PADDLE_H
    let vx = 0
    let vy = 0
    let riding = true
    let holdT = HOLD_IGNORE
    let walls = 0
    /** For the souvenir. Named, never shown as a number. */
    let everBroke = false
    let everCleared = false

    const buildWall = (): void => {
      wall = Array(BRICK_COLS * BRICK_ROWS).fill(true)
    }

    const rest = (): void => {
      riding = true
      holdT = 0
      bx = paddle
      by = PADDLE_Y - PADDLE_H / 2 - BALL_R
      vx = 0
      vy = 0
    }

    buildWall()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    const speed = (): number => BALL_SPEED + SPEED_STEP * walls

    const serve = (): void => {
      riding = false
      // Always up, and always off to one side, because a ball served straight
      // up comes straight back down and the first round teaches nothing.
      vy = -speed()
      vx = speed() * (ctx.rng.chance(0.5) ? 0.62 : -0.62)
      ctx.audio.note(560, 70)
    }

    /** The rectangle brick `i` occupies, in court fractions. */
    const brickBox = (i: number): { x: number; y: number; w: number; h: number } => {
      const col = i % BRICK_COLS
      const row = Math.floor(i / BRICK_COLS)
      const cw = 1 / BRICK_COLS
      const chh = (WALL_BOT - WALL_TOP) / BRICK_ROWS
      return {
        x: col * cw + cw * BRICK_GAP,
        y: WALL_TOP + row * chh + chh * BRICK_GAP,
        w: cw * (1 - BRICK_GAP * 2),
        h: chh * (1 - BRICK_GAP * 2),
      }
    }

    /**
     * The ball against the wall. Returns the brick it hit, or -1.
     *
     * Deliberately ONE brick per frame and deliberately a box test rather than
     * a swept one: at this speed the ball crosses about a fifth of a brick per
     * frame, so a tunnelling ball is not reachable, and a swept test would be
     * a page of arithmetic guarding against something that cannot happen.
     */
    const brickHit = (): number => {
      // The ball reads as round on screen, so its vertical radius is the
      // horizontal one converted through the court's own proportions.
      const ry = (BALL_R * stage.w * 0.6) / stage.h
      for (let i = 0; i < wall.length; i++) {
        if (!wall[i]) continue
        const b = brickBox(i)
        if (bx + BALL_R < b.x || bx - BALL_R > b.x + b.w) continue
        if (by + ry < b.y || by - ry > b.y + b.h) continue
        return i
      }
      return -1
    }

    return {
      onKey(k) {
        if (riding) {
          if (k.key === 'ArrowLeft') paddle = Math.max(PADDLE_W / 2, paddle - 0.06)
          else if (k.key === 'ArrowRight') paddle = Math.min(1 - PADDLE_W / 2, paddle + 0.06)
          bx = paddle
          // The serve is protected: a child holding an arrow after a miss
          // would otherwise fire the next ball inside the same keypress and
          // never see the beat the miss earned them.
          if (holdT < HOLD_IGNORE) return
          // ANY key serves, not only the space bar — the bar is on the hint
          // line for a child who reads, and every other key works for one who
          // does not. Left and right are excluded above because they are how
          // you aim the serve.
          if (k.key !== 'ArrowLeft' && k.key !== 'ArrowRight') serve()
          return
        }
        if (k.key === 'ArrowLeft') paddle = Math.max(PADDLE_W / 2, paddle - 0.06)
        else if (k.key === 'ArrowRight') paddle = Math.min(1 - PADDLE_W / 2, paddle + 0.06)
      },

      tick(dt) {
        if (riding) {
          if (holdT < HOLD_IGNORE) holdT += dt
          bx = paddle
          return
        }

        bx += vx * dt
        by += vy * dt

        // The rails. A court is hollow and a bounce off it is a bounce.
        if (bx - BALL_R < 0) { bx = BALL_R; vx = Math.abs(vx); ctx.audio.note(440, 40) }
        if (bx + BALL_R > 1) { bx = 1 - BALL_R; vx = -Math.abs(vx); ctx.audio.note(440, 40) }
        if (by - BALL_R < 0) { by = BALL_R; vy = Math.abs(vy); ctx.audio.note(520, 40) }

        const hit = brickHit()
        if (hit >= 0) {
          wall[hit] = false
          everBroke = true
          vy = -vy
          ctx.audio.hit('hat')
          if (wall.every((b) => !b)) {
            everCleared = true
            walls += 1
            buildWall()
            ctx.audio.note(700, 110)
            ctx.audio.note(950, 160)
            rest()
            return
          }
        }

        // The paddle. Where on it the ball lands decides where it goes: the
        // ends throw the ball out sideways, the middle sends it back up. That
        // is the whole of Breakout's skill and it needs no explaining — a
        // child works it out by watching.
        const py = PADDLE_Y - PADDLE_H / 2
        if (vy > 0 && by + BALL_R >= py && by - BALL_R <= py + PADDLE_H) {
          const off = (bx - paddle) / (PADDLE_W / 2)
          if (Math.abs(off) <= 1.15) {
            by = py - BALL_R
            const angle = Math.max(-1, Math.min(1, off)) * 0.85
            vy = -speed()
            vx = speed() * angle
            ctx.audio.note(660, 55)
          }
        }

        // Missed. The ball goes back on the paddle and rides there, which is
        // the picture that says what happens next without a word.
        if (by - BALL_R > 1) {
          ctx.audio.hit('kick')
          rest()
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // The court: hollow, thin, world.
        c.outline(stage.x, stage.y, stage.w, stage.h, INK, 3)

        for (let i = 0; i < wall.length; i++) {
          if (!wall[i]) continue
          const b = brickBox(i)
          c.outline(X(b.x), Y(b.y), b.w * stage.w, b.h * stage.h, INK, BRICK_T)
        }

        c.rect(
          X(paddle - PADDLE_W / 2), Y(PADDLE_Y - PADDLE_H / 2),
          PADDLE_W * stage.w, PADDLE_H * stage.h, INK,
        )

        c.disc(X(bx), Y(by), BALL_R * stage.w, INK)
      },

      souvenir: () => {
        if (everCleared) return ctx.t('bricks.souvenir.cleared')
        if (everBroke) return ctx.t('bricks.souvenir.some')
        return ctx.t('bricks.souvenir.none')
      },
    }
  },
}

export default cartridge
