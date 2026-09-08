import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * ROAD — night driving, and the road is only the posts either side of it.
 *
 * Night Driver, 1976, and it is in this box because of what it is NOT. There
 * is no scenery, no other traffic, no track, no tarmac: the entire world is
 * two rows of reflective posts coming towards you out of the dark, and your
 * car at the bottom of the screen. That was a hardware limitation — the
 * cabinet could not draw a road — and it produced the most atmospheric thing
 * anyone made that decade. It is also, by complete accident, the only game
 * here that is monochrome BY BIRTH rather than by house rule: the original
 * screen was black with white dots on it, and that is exactly what this is.
 *
 * ONE VERB. Left and right. Nothing else, ever — no accelerator, no brake,
 * no gears. A six-year-old can be handed this and be driving inside two
 * seconds, and the whole of the game is in the wrist.
 *
 * HOW THE PERSPECTIVE WORKS, because it is the only clever thing in the file.
 * Each post has a distance `z`, one at the horizon and zero at the bumper.
 * Every frame the whole set of them moves a little closer and any that
 * arrives is sent back to the horizon. Where a post lands on the screen and
 * how far it sits from the middle both come from `z` alone:
 *
 *   how far DOWN the screen   `1 - z` SQUARED, so posts bunch up near the
 *                             horizon and then rush apart as they arrive,
 *                             which is what speed looks like
 *   how far ACROSS            `1 - z` straight, so the two rows of posts
 *                             converge on a vanishing point
 *
 * The road BENDS, and it bends as a function of how far you have driven
 * rather than of time, so slowing down would not change the shape of the
 * bend if there were a way to slow down. A post's centre is read at ITS OWN
 * distance, which is why a corner arrives visibly before you reach it.
 *
 * OFF THE ROAD IS NOT A CRASH. There is nothing to hit out there. The car
 * stops, the picture holds with a ring on it, and the next key puts you back
 * on the road facing forwards, exactly like a missed ball.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** Where the horizon sits, as a fraction of the stage's height. */
const HORIZON = 0.30
/** How many posts are in the air at once, per side. */
const POSTS = 14
/** Half the road's width at the bumper, as a fraction of the stage width. */
const ROAD_HALF = 0.34
/** A post, at the bumper, in stage-width fractions. It shrinks with distance. */
const POST_W = 0.022
const POST_H = 0.055

/** Distances per second: how fast `z` falls. Gentle, and it creeps up. */
const SPEED_MIN = 0.34
const SPEED_MAX = 0.62
/** Seconds of staying on the road to go from one to the other. */
const SPEED_RAMP = 45

/** How far the road wanders either side of the middle, and how tight. */
const BEND = 0.20
const BEND_RATE = 0.55
/** How far ahead a bend is read. Bigger reads as a longer, lazier corner. */
const LOOK = 1.4

const CAR_Y = 0.90
const CAR_W = 0.13
/** Stage-widths per keypress. */
const STEER = 0.028

/**
 * THE CAR, FROM BEHIND, and it took two goes.
 *
 * The first one was a solid block with two rows of holes punched through it,
 * which at this size is not a car — it is a house with windows, and that is
 * exactly what it read as on screen. A car seen from behind at night is a
 * narrow roof over a wide body, a dark band where the rear window is, two
 * tail lights near the corners, and wheels poking out below. Every gap in
 * this bitmap is one of those four things.
 */
const CAR = [
  '   #####   ',
  '  #######  ',
  ' ## ### ## ',
  '###########',
  '# ####### #',
  '###########',
  '##       ##',
]
const CAR_COLS = 11
const CAR_ROWS = 7

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'road',
  triggers: {
    en: ['road', 'drive', 'driving'],
    he: ['כביש', 'נהיגה'],
    emoji: ['🛣️'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: '← →', label: t('road.steer') }],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    /** How far the car has driven. The bend is a function of this. */
    let travelled = 0
    /** Seconds on the road without leaving it, which is all the speed knows. */
    let onRoad = 0
    let car = 0.5
    let off = false
    let holdT = HOLD_IGNORE
    /** For the souvenir. Named, never counted onto the screen. */
    let far = 0

    /**
     * Post distances, evenly spread from the bumper to the horizon — offset
     * by half a spacing so that none of them starts exactly AT the bumper.
     * A post at `z = 0` wraps back to the horizon on the very first frame,
     * which is a post vanishing off the bottom of the screen before the child
     * has touched anything.
     */
    let zs: number[] = Array.from({ length: POSTS }, (_, i) => (i + 0.5) / POSTS)

    const speed = (): number =>
      SPEED_MIN + (SPEED_MAX - SPEED_MIN) * Math.min(1, onRoad / SPEED_RAMP)

    const backOnRoad = (): void => {
      off = false
      onRoad = 0
      car = centreAt(0)
      zs = Array.from({ length: POSTS }, (_, i) => (i + 0.5) / POSTS)
    }

    /**
     * Where the middle of the road is, at distance `z`, as a fraction across
     * the stage. Read at the post's OWN distance, which is what makes a bend
     * arrive before you get to it.
     */
    function centreAt(z: number): number {
      return 0.5 + BEND * Math.sin((travelled + z * LOOK) * BEND_RATE * Math.PI * 2)
    }

    /** Half the road's width at distance `z`. Converges on the vanishing point. */
    const halfAt = (z: number): number => ROAD_HALF * (1 - z)

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    return {
      onKey(k) {
        if (off) {
          if (holdT < HOLD_IGNORE) return
          backOnRoad()
          return
        }
        if (k.key === 'ArrowLeft') car = Math.max(0.04, car - STEER)
        else if (k.key === 'ArrowRight') car = Math.min(0.96, car + STEER)
      },

      tick(dt) {
        if (off) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        const v = speed()
        travelled += v * dt
        onRoad += dt
        far = Math.max(far, onRoad)

        for (let i = 0; i < zs.length; i++) {
          zs[i] = zs[i]! - v * dt
          // A post that arrives is sent back to the horizon. Wrapped rather
          // than reset to exactly 1, so the spacing never drifts and the
          // stream of posts stays even at any speed.
          if (zs[i]! < 0) zs[i] = zs[i]! + 1
        }

        // Are we still between the posts? Read at the bumper, where the car
        // actually is.
        const c0 = centreAt(0)
        if (Math.abs(car - c0) > halfAt(0)) {
          off = true
          holdT = 0
          ctx.audio.hit('rumble')
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        for (const z of zs) {
          // Down the screen by `(1 - z)` squared: posts bunch at the horizon
          // and rush apart as they arrive, which is what speed looks like.
          const k = 1 - z
          const y = HORIZON + (1 - HORIZON) * k * k
          const centre = centreAt(z)
          const half = halfAt(z)
          const w = Math.max(1, POST_W * stage.w * k)
          const h = Math.max(1, POST_H * stage.h * k)
          for (const side of [-1, 1]) {
            const px = centre + side * half
            if (px < -0.1 || px > 1.1) continue
            c.rect(X(px) - w / 2, Y(y) - h, w, h, INK)
          }
        }

        const scale = Math.max(1, Math.round((CAR_W * stage.w) / CAR_COLS))
        c.sprite(
          X(car) - (CAR_COLS * scale) / 2,
          // Centred on `CAR_Y`, in PIXELS: the sprite is `CAR_ROWS * scale`
          // pixels tall whatever the pixel aspect is, and converting its
          // height through the aspect once put it a few pixels high.
          Y(CAR_Y) - (CAR_ROWS * scale) / 2,
          CAR, INK, { scale },
        )

        // Stopped in the dark. Two hollow rings on the car — the same mark
        // every other game leaves when something concludes.
        if (off) {
          c.circle(X(car), Y(CAR_Y), stage.w * 0.09, INK)
          c.circle(X(car), Y(CAR_Y), stage.w * 0.13, INK)
        }
      },

      souvenir: () => {
        if (far >= 25) return ctx.t('road.souvenir.long')
        if (far >= 8) return ctx.t('road.souvenir.some')
        if (far > 0.5) return ctx.t('road.souvenir.short')
        return ctx.t('road.souvenir.none')
      },
    }
  },
}

export default cartridge
