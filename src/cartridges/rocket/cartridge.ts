import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'
import { POINTS, PAD_POINTS, groundAt, makeGround, onPad, type Ground } from './terrain'

/**
 * LANDER — put it down gently, on the flat bit.
 *
 * WHAT THIS USED TO BE, AND WHY IT IS NOT ANY MORE. This cartridge was
 * BLASTOFF: hold the space bar, watch a gauge fill, let go, and the rocket
 * flew as high as the gauge had got. It was pretty and it had a real
 * physical verb in it, and it had no game in it at all. A full charge always
 * reached the moon, so there was exactly one thing to find out, it took one
 * flight to find it out, and after that the whole cartridge was a button. The
 * altitude track and the drawn spacebar that grew on it over time were both
 * attempts to explain a goal it did not have.
 *
 * A landing has a goal that needs no explaining, because it is a goal you can
 * FAIL AT SLOWLY and watch yourself failing at: you are coming down, you are
 * coming down too fast, and there is still time to do something about it.
 * That last clause is the whole game, and it is the thing BLASTOFF could
 * never have — a launch is over the instant you let go.
 *
 * WHAT WAS KEPT: the rocket itself, pixel for pixel. It is the same little
 * ship, and a child who played the old one must recognise it.
 *
 * WHAT WAS CHANGED FOR A SIX-YEAR-OLD:
 *
 *   NO ROTATION. The original is flown by turning the ship and firing a
 *   single engine through its base, so every landing starts with a minute of
 *   getting upright again. Here UP thrusts up and LEFT and RIGHT thrust
 *   sideways — three keys, each doing exactly what its arrow says. The
 *   physics underneath is still real: you are fighting momentum, not
 *   steering a cursor.
 *
 *   GRAVITY IS GENTLE and the ship is heavy on the controls, so the whole
 *   flight happens at a speed a child can think at.
 *
 *   FUEL IS A BAR, NOT A NUMBER. It empties while you hold a key. Running out
 *   is not an ending — you simply fall from wherever you are, which is
 *   usually survivable if you have been careful and never is if you have not.
 *
 * TOO FAST IS NOT A CRASH ANIMATION. The ship stops where it touched, wearing
 * the same two hollow rings every other game in this box leaves when
 * something concludes, and the next key lays fresh ground. Nothing explodes
 * and nothing is deducted.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** The rocket, unchanged from BLASTOFF. The same little ship. */
const ROCKET = [
  '    #    ',
  '   ###   ',
  '  #####  ',
  '  #####  ',
  '  ## ##  ',
  '  #####  ',
  '  #####  ',
  '  #####  ',
  ' ####### ',
  '###   ###',
  '##     ##',
]
const ROCKET_COLS = 9
const ROCKET_ROWS = 11
// THREE, not two. At `scale: 2` the ship is eighteen pixels across on a
// 240-pixel stage — under the "more than a tenth of the field" the house
// asks of the thing a child steers, and on a screen this busy (mountains,
// a starfield, a gauge) it read as one more piece of scenery.
const ROCKET_SCALE = 3

/** The flame, drawn under the ship while a thruster is lit. */
const FLAME = [
  '## ##',
  '#####',
  ' ### ',
  ' ### ',
  '  #  ',
]
const FLAME_COLS = 5
const FLAME_ROWS = 5

/**
 * The flight, in stage-heights and seconds. Everything vertical is a fraction
 * of the stage, so the same landing feels the same on a phone and a monitor
 * and survives a mid-flight resize without a hiccup.
 */
const GRAVITY = 0.20
const THRUST_UP = 0.52
const THRUST_SIDE = 0.26
/** How long a thruster stays lit after its last key repeat arrived. */
const HELD = 0.12

/** Seconds of thrust in a full tank. */
const FUEL_SECS = 9
/** The gauge, in stage fractions. */
const GAUGE_X = 0.055
const GAUGE_TOP = 0.10
const GAUGE_H = 0.30
const GAUGE_W = 0.045

/**
 * THE ONLY NUMBER THAT DECIDES ANYTHING: how fast is too fast, in
 * stage-heights per second. Generous — a child who is trying will make it,
 * and a child who is dropping like a stone will not.
 */
const SAFE_DOWN = 0.30
/** And how far sideways you may still be sliding when you touch. */
const SAFE_SIDE = 0.22

/** How far the pad's end posts stand above it, in pixels. */
const PAD_POST = 11

const STARS = 40

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'rocket',
  /**
   * RENAMED, because the game changed. The first trigger is the title on the
   * transcript row, so this is not a free change — a child looking back at an
   * old session will find `land` where `blastoff` used to be. That is the
   * honest outcome: the thing they played is not there any more, and a row
   * labelled `blastoff` that opens a landing game would be worse.
   */
  triggers: {
    en: ['land', 'lander', 'landing'],
    he: ['נחיתה', 'לנחות'],
    // NOT 🚀: `vehicles` has owned that since before this was a landing
    // game, and a child typing the rocket emoji wants the rocket picture.
    emoji: ['🌙'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '↑', label: t('rocket.up') },
    { keys: '← →', label: t('rocket.side') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let ground: Ground = makeGround(ctx.rng)
    /** Where the ship is, in stage fractions, and how fast, in fractions/sec. */
    let x = 0.5
    let y = 0.12
    let vx = 0
    let vy = 0
    let fuel = FUEL_SECS
    /** Seconds each thruster stays lit after its last repeat. */
    let upHeld = 0
    let sideHeld = 0
    let side = 0
    /** `null` while flying; then how it ended. */
    let done: 'landed' | 'bumped' | null = null
    let holdT = HOLD_IGNORE
    let everLanded = false
    let everFlew = false

    /** The stars. Laid out ONCE — a sky that reshuffles on a redraw is a sky
     *  that twitches under a child who is looking at it. */
    const stars = Array.from({ length: STARS }, () => ({
      x: ctx.rng.float(),
      y: ctx.rng.float() * 0.75,
    }))

    const relaunch = (): void => {
      ground = makeGround(ctx.rng)
      x = 0.5
      y = 0.12
      vx = (ctx.rng.float() * 2 - 1) * 0.05
      vy = 0
      fuel = FUEL_SECS
      upHeld = 0
      sideHeld = 0
      done = null
    }

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** The ship's half-height, as a fraction of the stage. */
    const halfH = (): number => (ROCKET_ROWS * ROCKET_SCALE) / 2 / stage.h

    const touchdown = (): void => {
      // Three things have to be true, and all three are things the child can
      // see happening: coming down slowly, not sliding sideways, and over the
      // flat bit. Nothing here is a hidden number.
      const gentle = vy < SAFE_DOWN && Math.abs(vx) < SAFE_SIDE
      const over = onPad(ground, x, 0.02)
      done = gentle && over ? 'landed' : 'bumped'
      holdT = 0
      vx = 0
      vy = 0
      if (done === 'landed') {
        everLanded = true
        ctx.audio.note(660, 120)
        ctx.audio.note(880, 120)
        ctx.audio.note(990, 200)
      } else {
        ctx.audio.hit('kick')
        ctx.audio.hit('snare')
      }
    }

    return {
      onKey(k) {
        if (done) {
          if (holdT < HOLD_IGNORE) return
          relaunch()
          return
        }
        if (k.key === 'ArrowUp' || k.key === ' ') { upHeld = HELD; everFlew = true }
        else if (k.key === 'ArrowLeft') { sideHeld = HELD; side = -1; everFlew = true }
        else if (k.key === 'ArrowRight') { sideHeld = HELD; side = 1; everFlew = true }
      },

      tick(dt) {
        if (done) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        // A thruster burns fuel only while it is actually lit, and an empty
        // tank simply does not light. Running dry is not an ending — it is
        // the moment you find out how careful you were being.
        let burning = 0
        if (fuel > 0 && upHeld > 0) { vy += -THRUST_UP * dt; burning += dt }
        if (fuel > 0 && sideHeld > 0) { vx += side * THRUST_SIDE * dt; burning += dt }
        fuel = Math.max(0, fuel - burning)
        if (upHeld > 0) upHeld -= dt
        if (sideHeld > 0) sideHeld -= dt

        vy += GRAVITY * dt
        x += vx * dt * (stage.h / (stage.w * PIXEL_ASPECT))
        y += vy * dt

        // The sides are walls, not a wrap: a ship that reappears on the other
        // side of the sky is a ship a child has lost track of.
        if (x < 0.04) { x = 0.04; vx = Math.abs(vx) * 0.3 }
        if (x > 0.96) { x = 0.96; vx = -Math.abs(vx) * 0.3 }
        if (y < 0.04) { y = 0.04; vy = Math.max(0, vy) }

        if (y + halfH() >= groundAt(ground, x)) {
          y = groundAt(ground, x) - halfH()
          touchdown()
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // Sky. One pixel each, world, and they never move.
        for (const s of stars) c.rect(X(s.x), Y(s.y), 1, 1, INK)

        // The ground: one stroke from point to point, and the pad drawn
        // THICKER rather than marked. The pad is not signposted; it is a
        // different-looking piece of ground, which is a thing you can see
        // from the top of the screen.
        const step = 1 / (POINTS - 1)
        for (let i = 0; i < POINTS - 1; i++) {
          const x1 = X(i * step)
          const x2 = X((i + 1) * step)
          c.line(x1, Y(ground.h[i]!), x2, Y(ground.h[i + 1]!), INK)
        }
        // Everything below the surface, filled in, so the ground is ground
        // rather than a wire hanging in space.
        //
        // In STRIPS, a few per segment, rather than one rectangle per
        // segment. One rectangle has to pick a single height for a sloping
        // piece of ground, and whichever end it picks is wrong at the other:
        // taking the higher end pokes a shelf out over the valley, and taking
        // the lower one leaves a notch under every hillside. Six strips is
        // enough that a slope reads as a slope at this size and cheap enough
        // that the whole surface is still under a hundred commands.
        const STRIPS = 6
        for (let i = 0; i < POINTS - 1; i++) {
          for (let k = 0; k < STRIPS; k++) {
            const a = (i + k / STRIPS) * step
            const b = (i + (k + 1) / STRIPS) * step
            const x1 = X(a)
            const w = X(b) - x1
            const top = Y(Math.max(groundAt(ground, a), groundAt(ground, b)))
            c.rect(x1, top - 1, w + 1, stage.y + stage.h - top + 1, INK)
          }
        }

        /**
         * THE PAD, and it is the one thing on this screen that had to be
         * findable from the top of it.
         *
         * The first version drew the flat run as a slightly thicker stroke,
         * which was invisible: once the ground below it is filled in, a bar
         * two pixels thicker than the hillside beside it is not a landmark,
         * it is a rounding error. So the pad is a PLATFORM now — a bar that
         * overhangs its own ground at both ends, with a short post standing
         * at each end of it. The posts are the same vocabulary the rest of
         * the ground is drawn in (a stroke, one ink, nothing new to learn)
         * and two uprights against a horizon of diagonals is the one shape
         * on the screen that could not be a mountain.
         */
        const padX1 = X(ground.pad * step)
        const padX2 = X((ground.pad + PAD_POINTS - 1) * step)
        const padY = Y(ground.h[ground.pad]!)
        c.rect(padX1 - 5, padY - 3, padX2 - padX1 + 10, 6, INK)
        for (const px of [padX1 - 5, padX2 + 1]) {
          c.rect(px, padY - 3 - PAD_POST, 4, PAD_POST, INK)
        }

        // The fuel gauge: a hollow frame with a SOLID column in it. No number,
        // and nothing to read — the height of the ink is the answer.
        const gx = X(GAUGE_X)
        const gy = Y(GAUGE_TOP)
        const gw = GAUGE_W * stage.w
        const gh = GAUGE_H * stage.h
        c.outline(gx, gy, gw, gh, INK, 2)
        const k = fuel / FUEL_SECS
        c.rect(gx + 3, gy + gh - 3 - (gh - 6) * k, gw - 6, (gh - 6) * k, INK)

        const sx = X(x) - (ROCKET_COLS * ROCKET_SCALE) / 2
        const sy = Y(y) - (ROCKET_ROWS * ROCKET_SCALE) / 2

        // The flame, under the ship, only while an engine is actually lit.
        // It is the only feedback the thrusters give and it needs no words.
        if (!done && fuel > 0 && (upHeld > 0 || sideHeld > 0)) {
          c.sprite(
            X(x) - (FLAME_COLS * ROCKET_SCALE) / 2,
            sy + ROCKET_ROWS * ROCKET_SCALE,
            FLAME, INK, { scale: ROCKET_SCALE },
          )
        }

        c.sprite(sx, sy, ROCKET, INK, { scale: ROCKET_SCALE })

        if (done) {
          const r = ROCKET_COLS * ROCKET_SCALE
          c.circle(X(x), Y(y), r * 1.1, INK)
          c.circle(X(x), Y(y), r * 1.6, INK)
        }
      },

      souvenir: () => {
        if (everLanded) return ctx.t('rocket.souvenir.landed')
        if (everFlew) return ctx.t('rocket.souvenir.flew')
        return ctx.t('rocket.souvenir.none')
      },
    }
  },
}

export default cartridge
