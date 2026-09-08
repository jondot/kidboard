import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * INVADERS — a formation comes down, and it steps.
 *
 * The most recognisable silhouette of the era, and the reason it is worth
 * having even beside `catch` and `mole`: nothing else in this box MARCHES.
 * Everything here that moves does so smoothly, and a formation that steps
 * sideways on a beat — all of it at once, in silence, and then again — is a
 * completely different feeling to be in front of. It is the first video game
 * that was frightening, and it managed that with two frames of animation.
 *
 * TWO FRAMES IS THE ANIMATION, and they are not decoration. The formation
 * changes shape on every step, so the marching and the drawing are the same
 * event: a child watching a still screen sees nothing, and the instant the
 * row moves, every invader in it also opens its arms. That is why the arcade
 * cabinet felt alive on hardware that could not afford to feel alive.
 *
 * IT SPEEDS UP AS IT EMPTIES, which in 1978 was a bug — fewer sprites to draw
 * meant a faster loop — and is kept here on purpose because it is the best
 * accidental design decision in the history of the form. The last invader is
 * frantic, and nobody had to write a difficulty curve.
 *
 * WHAT IS NOT HERE. The invaders do not shoot back. A six-year-old flying a
 * ship that can be destroyed from above while also aiming is playing two
 * games, and the second one is a game about dying. The pressure here comes
 * from the formation coming DOWN — which is visible, gradual, and something
 * you can do something about — and when it lands the picture holds and waits,
 * exactly like a missed ball.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

const ROWS = 3
const FILE = 6

/** The two frames. Same creature, arms up and arms down. */
const INVADER_A = [
  '  #     #  ',
  '   #   #   ',
  '  #######  ',
  ' ## ### ## ',
  '###########',
  '# ####### #',
  '# #     # #',
  '   ## ##   ',
]
const INVADER_B = [
  '  #     #  ',
  '#  #   #  #',
  '# ####### #',
  '### ### ###',
  '###########',
  ' ######### ',
  '  #     #  ',
  ' ##     ## ',
]
const INV_COLS = 11
const INV_ROWS = 8

/** The ship. Solid, wide-based, unmistakably the thing at the bottom. */
const SHIP = [
  '     #     ',
  '    ###    ',
  '    ###    ',
  ' ######### ',
  '###########',
  '###########',
  '## ##### ##',
]
const SHIP_COLS = 11
const SHIP_ROWS = 7

/** Formation geometry, in court fractions. */
const FORM_TOP = 0.08
const CELL_W = 1 / (FILE + 1)
// Tall enough that the ROWS DO NOT TOUCH. An invader is eight source rows at
// `scale: 2`, so sixteen pixels; at 0.10 of the court the rows were fourteen
// pixels apart and the formation rendered as one continuous slab of legs. The
// gap between ranks is what makes it a formation.
const CELL_H = 0.14
/** How far a step moves the formation sideways, and down at the edge. */
const STEP_X = 0.035
const STEP_Y = 0.055
/** Seconds between steps: a full formation, and the very last invader. */
const STEP_SLOW = 0.62
const STEP_FAST = 0.09

const SHIP_Y = 0.93
const SHIP_SPEED = 0.055     // court-widths per keypress
const BOLT_SPEED = 1.35      // court-heights per second
const BOLT_W = 0.012
const BOLT_H = 0.055

/** The formation has arrived when its lowest row reaches this. */
const LANDED = 0.80

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'invaders',
  triggers: {
    en: ['invaders', 'aliens'],
    he: ['פולשים', 'חייזרים'],
    emoji: ['👾'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('invaders.move') },
    { keys: '␣', label: t('invaders.fire') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let alive: boolean[] = []
    /** The formation's offset from where it was laid out, in court fractions. */
    let ox = 0
    let oy = 0
    let dir = 1
    let sinceStep = 0
    /** Which of the two frames the formation is wearing. Flips on every step. */
    let frame = 0

    let ship = 0.5
    /** One bolt at a time, and `null` when there is not one. */
    let bolt: { x: number; y: number } | null = null

    let landed = false
    let holdT = HOLD_IGNORE
    let waves = 0
    let everHit = false
    let everCleared = false

    const layWave = (): void => {
      alive = Array(ROWS * FILE).fill(true)
      ox = 0
      oy = 0
      dir = 1
      sinceStep = 0
      bolt = null
      landed = false
    }

    layWave()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    const count = (): number => alive.filter(Boolean).length

    /** Where invader `i` sits now, in court fractions: its centre. */
    const invAt = (i: number): { x: number; y: number } => ({
      x: CELL_W * (1 + (i % FILE)) + ox,
      y: FORM_TOP + CELL_H * Math.floor(i / FILE) + oy,
    })

    /** Seconds between steps, from how much of the wave is left. */
    const stepEvery = (): number => {
      const k = count() / (ROWS * FILE)
      return STEP_FAST + (STEP_SLOW - STEP_FAST) * k
    }

    const march = (): void => {
      frame ^= 1
      // The whole formation is one object: it turns round when its outermost
      // LIVING invader would leave the court, not when a dead one would.
      let lo = 1
      let hi = 0
      for (let i = 0; i < alive.length; i++) {
        if (!alive[i]) continue
        const p = invAt(i)
        lo = Math.min(lo, p.x)
        hi = Math.max(hi, p.x)
      }
      if (lo > hi) return
      const half = CELL_W * 0.45
      if ((dir > 0 && hi + STEP_X + half > 1) || (dir < 0 && lo - STEP_X - half < 0)) {
        dir = -dir
        oy += STEP_Y
      } else {
        ox += dir * STEP_X
      }
      // One beat, on the step. The heartbeat the cabinet had, and it gets
      // faster for free because the step does.
      ctx.audio.hit('kick')

      for (let i = 0; i < alive.length; i++) {
        if (alive[i] && invAt(i).y >= LANDED) {
          landed = true
          holdT = 0
          ctx.audio.hit('snare')
          return
        }
      }
    }

    const fire = (): void => {
      if (bolt) return
      bolt = { x: ship, y: SHIP_Y - 0.03 }
      ctx.audio.note(880, 45)
    }

    return {
      onKey(k) {
        if (landed) {
          if (holdT < HOLD_IGNORE) return
          layWave()
          return
        }
        if (k.key === 'ArrowLeft') ship = Math.max(0.04, ship - SHIP_SPEED)
        else if (k.key === 'ArrowRight') ship = Math.min(0.96, ship + SHIP_SPEED)
        else fire()
      },

      tick(dt) {
        if (landed) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        sinceStep += dt
        if (sinceStep >= stepEvery()) {
          sinceStep = 0
          march()
          if (landed) return
        }

        if (!bolt) return
        bolt.y -= BOLT_SPEED * dt
        if (bolt.y < 0) { bolt = null; return }

        for (let i = 0; i < alive.length; i++) {
          if (!alive[i]) continue
          const p = invAt(i)
          if (Math.abs(p.x - bolt.x) > CELL_W * 0.45) continue
          if (Math.abs(p.y - bolt.y) > CELL_H * 0.45) continue
          alive[i] = false
          bolt = null
          everHit = true
          ctx.audio.hit('clap')
          if (count() === 0) {
            everCleared = true
            waves += 1
            layWave()
            ctx.audio.note(700, 110)
            ctx.audio.note(950, 170)
          }
          return
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // The line they are coming for. Thin, hollow, world — and it is where
        // the formation stops, so it is honest scenery rather than decoration.
        c.rect(stage.x, Y(LANDED), stage.w, 3, INK)

        const invScale = Math.max(1, Math.round((CELL_W * stage.w * 0.72) / INV_COLS))
        const rows = frame === 0 ? INVADER_A : INVADER_B
        for (let i = 0; i < alive.length; i++) {
          if (!alive[i]) continue
          const p = invAt(i)
          c.sprite(
            X(p.x) - (INV_COLS * invScale) / 2,
            Y(p.y) - (INV_ROWS * invScale) / 2,
            rows, INK, { scale: invScale },
          )
        }

        const shipScale = Math.max(1, Math.round((CELL_W * stage.w * 0.8) / SHIP_COLS))
        c.sprite(
          X(ship) - (SHIP_COLS * shipScale) / 2,
          Y(SHIP_Y) - (SHIP_ROWS * shipScale) / 2,
          SHIP, INK, { scale: shipScale },
        )

        if (bolt) {
          c.rect(
            X(bolt.x) - (BOLT_W * stage.w) / 2, Y(bolt.y),
            Math.max(3, BOLT_W * stage.w), BOLT_H * stage.h, INK,
          )
        }

        // Arrived. Two hollow rings around the ship, the same cheer-shaped
        // mark every other game uses when something concludes — hollow, so it
        // is never a piece of the game.
        if (landed) {
          c.circle(X(ship), Y(SHIP_Y), stage.w * 0.07, INK)
          c.circle(X(ship), Y(SHIP_Y), stage.w * 0.10, INK)
        }
      },

      souvenir: () => {
        if (everCleared) return ctx.t('invaders.souvenir.wave')
        if (everHit) return ctx.t('invaders.souvenir.some')
        return ctx.t('invaders.souvenir.none')
      },
    }
  },
}

export default cartridge
