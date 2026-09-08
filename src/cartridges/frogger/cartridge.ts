import type { CanvasLike, LiveCartridge, Rng } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * HOP — cross the road, fill the burrows.
 *
 * ROAD ONLY. The arcade original is two games stacked: a road you must not
 * touch anything on, and a river you must not touch anything BUT. They are
 * opposite rules learnt in one sitting, and for a six-year-old that is the
 * difference between a game and a rule sheet. The road half is the half with
 * the joke in it, so the river is not here and is not coming.
 *
 * THE SHAPE OF THE THING, and why it needs no colour:
 *
 *   a car        HOLLOW, and it is world: a thing that happens to you rather
 *                than a thing you touch. Outlined cars also read as traffic
 *                at a glance in a way solid blocks do not — you can see the
 *                gaps THROUGH them, and the gaps are the game.
 *   the frog     SOLID, small, and the only solid thing that moves. It is the
 *                child, so it is the heaviest ink on the screen.
 *   a burrow     a HOLLOW arch at the top: the world asking for something.
 *   a filled one a SOLID frog sitting in it. Mass again, and it means the
 *                picture of a finished round is three heavy marks in a row.
 *
 * HOPS ARE DISCRETE, TRAFFIC IS NOT. The frog moves a whole band at a time
 * and lands square in it, because a child aiming a continuous frog at a gap
 * is playing a completely different and much harder game. The cars slide
 * smoothly across in pixels. That asymmetry is the original's and it is what
 * makes the timing readable: you are not steering, you are CHOOSING A MOMENT.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/**
 * Bands, bottom to top: the kerb you start on, the lanes, the burrow row.
 *
 * THREE LANES, not five. Five was a road a six-year-old could not cross: every
 * lane is an independent piece of timing, and the chance of getting a clean
 * run at all five before the traffic in lane one has moved on is small enough
 * that the honest description of the game was "hop and hope". Three lanes is
 * still three decisions and it is a road you can actually plan.
 */
const LANES = 3
/** Every band is `1 / BANDS` of the stage's height. */
const BANDS = LANES + 2

const BURROWS = 3

/**
 * A car, as a fraction of the stage width — and SMALLER than it was, which is
 * the other half of making this crossable. The gap between two cars in a lane
 * is whatever the lane's width is not; narrowing the car from 0.155 to 0.115
 * widens every gap in the game without touching a single speed.
 */
const CAR_W = 0.115
const CAR_H = 0.62      // of a band's height
const CAR_T = 3         // outline thickness, the house minimum for a rail

/**
 * The frog, as a fraction of a BAND'S HEIGHT — not of the stage.
 *
 * It is sized off the band because the band is what it has to fit inside, and
 * a road of seven bands in a 4:3 stage gives each of them about two and a half
 * character cells. At 0.62 the sprite doubles (a 7x7 bitmap at `scale: 2`),
 * which is the house minimum for "a bitmap of a thing" and lands the frog at
 * roughly three quarters of a band — filling it, without touching the kerbs
 * either side. An earlier 0.30 rounded the scale down to 1 and shipped a
 * seven-pixel frog: a speck, exactly what rule 3 exists to prevent.
 */
const FROG_W = 0.62
const FROG = [
  ' #   # ',
  '  ###  ',
  ' ##### ',
  '#######',
  '#######',
  ' ##### ',
  '##   ##',
]
const FROG_COLS = 7
const FROG_ROWS = 7

/**
 * Speeds, in stage-widths per second. Slow: this is a game about waiting.
 *
 * All three numbers came down. A lane at 0.22 crosses the whole screen in
 * four and a half seconds, which is quick enough that a child who has decided
 * to go and then hesitated has already been caught. The ramp came down
 * hardest: filling two burrows used to make the third crossing half again as
 * fast as the first, so the game got hardest exactly when a child was closest
 * to finishing it.
 */
const SPEED_MIN = 0.07
const SPEED_MAX = 0.13
/** Every burrow filled makes the next crossing this much brisker. */
const SPEED_STEP = 0.018

type Lane = {
  /** -1 or 1. Alternating, so the traffic reads as two directions of road. */
  dir: number
  speed: number
  /** Car centres, in stage-widths, always in `0..1`. */
  cars: number[]
}

/**
 * One lane of traffic. Cars are evenly spaced with a random phase rather than
 * randomly placed: evenly spaced traffic always has a gap of a known size in
 * it, and randomly placed traffic sometimes has none at all — which is a road
 * a child simply cannot cross, arriving without warning and for no reason.
 */
function laneOf(rng: Rng, i: number, speed: number): Lane {
  // TWO cars a lane, never three. Three evenly-spaced cars in a lane leave
  // gaps a third of the lane wide; two leave gaps half of it. That is the
  // difference between a gap you have to hit and a gap you can walk into.
  const count = 2
  const phase = rng.float()
  return {
    dir: i % 2 === 0 ? 1 : -1,
    speed,
    cars: Array.from({ length: count }, (_, k) => (phase + k / count) % 1),
  }
}

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'frogger',
  /**
   * NOT `frog` and not `צפרדע`: `animals` has claimed both since long before
   * this existed, and a child who types the name of an animal must get the
   * animal. The road is the thing this game is about anyway — `hop` is the
   * verb, and it is the word on the transcript row.
   */
  triggers: {
    en: ['hop', 'frogger'],
    he: ['קפיצה', 'זינוק'],
    emoji: ['🛼'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('frogger.hop') }],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    /** 0 is the kerb the frog starts on; `BANDS - 1` is the burrow row. */
    let band = 0
    /** Across the road, in stage-widths, `0..1`. Continuous: the frog slides
     *  left and right within its band rather than snapping to columns. */
    let across = 0.5
    let lanes: Lane[] = []
    let filled: boolean[] = Array(BURROWS).fill(false)
    let squashed = false
    let holdT = 0
    /** Set when every burrow is filled: the round is over and holding. */
    let cleared = false
    /** For the souvenir. Named, never shown. */
    let everHome = false
    let everCleared = false

    const speedNow = (): number => {
      const done = filled.filter(Boolean).length
      return SPEED_MIN + SPEED_STEP * done
    }

    const layLanes = (): void => {
      lanes = Array.from({ length: LANES }, (_, i) =>
        laneOf(ctx.rng, i, speedNow() + ctx.rng.float() * (SPEED_MAX - SPEED_MIN)))
    }

    const backToKerb = (): void => {
      band = 0
      across = 0.5
      squashed = false
    }

    layLanes()

    // The opening rest is not a round ending, so its hold window starts
    // already spent: a child who typed the name and reaches for a key must be
    // answered at once. See `../pacing`.
    holdT = HOLD_IGNORE

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** The centre of band `b`, as a fraction of the stage height, top-down. */
    const bandY = (b: number): number => (BANDS - 0.5 - b) / BANDS
    const bandH = (): number => 1 / BANDS

    /**
     * Which burrow a landing on the top row counts as.
     *
     * THE WHOLE ROW IS BURROW: the bank is divided into three and the nearest
     * one wins, with no dead strip between them. An early draft left a narrow
     * gap either side of each burrow, and it was simply a punishment for
     * imprecision — a child who timed five lanes of traffic correctly and
     * landed two pixels wide was sent back for it. The aiming this game asks
     * for is the aiming that matters: once the middle burrow is full you have
     * to go somewhere else, and that is a decision about WHERE, made on the
     * kerb, not a pixel-hunt made under a lorry.
     */
    const burrowAt = (x: number): number =>
      Math.max(0, Math.min(BURROWS - 1, Math.floor(x * BURROWS)))

    /**
     * Whole-pixel magnification for the frog bitmap. One number, read by the
     * drawing, by the parked frogs in the burrows and by the collision test,
     * so the frog a car hits is exactly the frog on the screen.
     */
    const frogScale = (): number =>
      Math.max(1, Math.round((bandH() * stage.h * FROG_W) / FROG_ROWS))

    /** The frog's half-width, as a fraction of the stage width. */
    const frogHalfX = (): number => (FROG_COLS * frogScale()) / 2 / stage.w

    const hopTo = (b: number, x: number): void => {
      band = Math.max(0, Math.min(BANDS - 1, b))
      across = Math.max(0.03, Math.min(0.97, x))
      ctx.audio.note(520 + band * 40, 55)

      if (band !== BANDS - 1) return

      // The burrow row. An empty burrow takes the frog; a burrow that already
      // has one in it cannot take another, so the frog is walked back to the
      // kerb with a small noise. That is not a loss and nothing is taken away
      // — it is the game saying "not that one, one of the others".
      const i = burrowAt(across)
      if (filled[i]) {
        ctx.audio.noise(50)
        backToKerb()
        return
      }
      filled[i] = true
      everHome = true
      ctx.audio.note(700, 90)
      ctx.audio.note(950, 140)
      if (filled.every(Boolean)) {
        cleared = true
        everCleared = true
        holdT = 0
        ctx.audio.note(1180, 220)
        return
      }
      backToKerb()
      layLanes()
    }

    const squash = (): void => {
      squashed = true
      holdT = 0
      ctx.audio.hit('snare')
    }

    return {
      onKey(k) {
        if (squashed || cleared) {
          if (holdT < HOLD_IGNORE) return
          if (cleared) {
            cleared = false
            filled = Array(BURROWS).fill(false)
            layLanes()
          }
          backToKerb()
          return
        }
        // A hop is one band up or down, or a slide left or right within the
        // band the frog is already in. Four keys, one meaning each.
        if (k.key === 'ArrowUp') hopTo(band + 1, across)
        else if (k.key === 'ArrowDown') hopTo(band - 1, across)
        else if (k.key === 'ArrowLeft') hopTo(band, across - 1 / 8)
        else if (k.key === 'ArrowRight') hopTo(band, across + 1 / 8)
      },

      tick(dt) {
        if (squashed || cleared) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }
        for (const lane of lanes) {
          for (let i = 0; i < lane.cars.length; i++) {
            // Wrapped into 0..1 rather than clamped, so a car that leaves one
            // edge is the same car arriving at the other and the traffic never
            // thins out.
            lane.cars[i] = (lane.cars[i]! + lane.dir * lane.speed * dt + 1) % 1
          }
        }
        // Only the five road bands can squash a frog: band 0 is the kerb and
        // the top band is the bank in front of the burrows.
        const lane = lanes[band - 1]
        if (!lane) return
        const hx = frogHalfX()
        for (const car of lane.cars) {
          // Distance the short way round the wrap, so a car at 0.98 and a frog
          // at 0.02 are touching rather than a road apart.
          const gap = Math.abs(((car - across + 1.5) % 1) - 0.5)
          if (gap < CAR_W / 2 + hx) { squash(); return }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h
        const H = bandH() * stage.h

        // The two kerbs: thin rails, world. They are the only scenery, and
        // they are what says "this strip is safe and that strip is not".
        for (const b of [1, BANDS - 1]) {
          c.rect(stage.x, Y((BANDS - b) / BANDS) - 1, stage.w, 3, INK)
        }

        // The burrows, along the top.
        for (let i = 0; i < BURROWS; i++) {
          const cx = X((i + 0.5) / BURROWS)
          const w = (stage.w / BURROWS) * 0.5
          const y = Y(bandY(BANDS - 1)) - H * 0.35
          if (filled[i]) {
            // A frog is in it. Solid, and drawn at the frog's own size, so it
            // is plainly the same animal parked rather than a new symbol.
            const s = frogScale()
            c.sprite(cx - (FROG_COLS * s) / 2, y + H * 0.1, FROG, INK, { scale: s })
          } else {
            c.outline(cx - w / 2, y, w, H * 0.7, INK, CAR_T)
          }
        }

        // The traffic. Hollow, so the gaps show through — and the gaps are
        // what the child is actually looking at.
        lanes.forEach((lane, i) => {
          const y = Y(bandY(i + 1)) - (H * CAR_H) / 2
          for (const car of lane.cars) {
            const w = CAR_W * stage.w
            // Drawn at three phases so a car halfway off one edge is also
            // halfway onto the other, which is what wrapping looks like.
            for (const shift of [-1, 0, 1]) {
              const x = X(car + shift) - w / 2
              if (x > stage.x + stage.w || x + w < stage.x) continue
              c.outline(x, y, w, H * CAR_H, INK, CAR_T)
            }
          }
        })

        // The frog, last and solid.
        const s = frogScale()
        const fx = X(across) - (FROG_COLS * s) / 2
        const fy = Y(bandY(band)) - (FROG_ROWS * s) / 2
        c.sprite(fx, fy, FROG, INK, { scale: s })

        // A squash is a ring — hollow, so it can never be mistaken for a
        // piece of the game — left standing on the spot it happened.
        if (squashed) {
          c.circle(X(across), Y(bandY(band)), H * 0.5, INK)
          c.circle(X(across), Y(bandY(band)), H * 0.75, INK)
        }
      },

      souvenir: () => {
        if (everCleared) return ctx.t('frogger.souvenir.all')
        if (everHome) return ctx.t('frogger.souvenir.home')
        if (band > 0) return ctx.t('frogger.souvenir.tried')
        return ctx.t('frogger.souvenir.none')
      },
    }
  },
}

export default cartridge
