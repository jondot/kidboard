import type { CanvasLike, LiveCartridge, Rng } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * ROCKS — shoot a big one and get two smaller ones.
 *
 * THIS ONE IS DRAWN IN LINES, and that is not a stylistic flourish: Asteroids
 * ran on a vector monitor, which had no pixels to fill and could only draw
 * bright straight strokes between two points. Every rock here is a closed
 * polygon of `c.line` and the ship is three strokes, which is exactly what the
 * 1979 cabinet did and exactly what the hardware allowed. It is also the only
 * game in this box drawn that way, so it looks like nothing else here — which
 * is the point of having it.
 *
 * WHAT WAS CHANGED FOR A SIX-YEAR-OLD, and why:
 *
 *   THRUST IS DAMPED, HARD. The original is Newtonian: you accelerate, and
 *   then you keep going forever, and the skill of the game is knowing that
 *   before you press anything. That is a genuinely difficult idea and it is
 *   not the interesting part of the game. Here the ship coasts to a stop in
 *   about a second, so holding UP means "go that way" and letting go means
 *   "stop" — point and go, which a child understands at once, while the
 *   drifting fraction of a second keeps it feeling like space rather than
 *   like a cursor.
 *
 *   HYPERSPACE IS GONE. It was a button that sometimes killed you. No.
 *
 *   A HIT IS NOT A DEATH, it is a stop. The picture holds with a ring on the
 *   ship, exactly like a missed ball, and any key lays a fresh field. Nothing
 *   is deducted and nothing is over.
 *
 * SPLITTING IS THE WHOLE GAME, and it is why the rocks are drawn hollow and
 * irregular rather than as discs: a child needs to see that the two small
 * ones are PIECES of the big one, and a polygon that breaks into two smaller
 * polygons says so. A disc splitting into two discs says nothing.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** Three sizes. A big one splits into two mediums, a medium into two smalls,
 *  a small into nothing at all. */
const SIZES = [0.095, 0.060, 0.036] as const
/** How many points a rock's outline has. Seven is lumpy; ten is a circle. */
const POINTS = 8
/** How far each point wanders off the circle, as a fraction of the radius. */
const LUMP = 0.32

/**
 * Court-widths per second, per size. Smaller rocks are quicker.
 *
 * All three came down by about a third. The field is small and it wraps, so a
 * rock at the old speeds crossed the whole screen in six seconds and arrived
 * back from the other side before a child had finished turning towards where
 * it had been. Slower rocks do not make the game easier to AIM at — they make
 * it a game you have time to aim in at all.
 */
const ROCK_SPEED = [0.050, 0.078, 0.112] as const

/**
 * The ship's radius, as a fraction of the court's width. Rule 3 asks that the
 * thing the child steers be more than a tenth of the field across; the nose
 * reaches 1.35 of this, so 0.075 puts the ship at just over that. An earlier
 * 0.045 drew a fifteen-pixel dart that was hard to find on a field of rocks
 * twice its size.
 */
const SHIP_R = 0.075
/**
 * Radians per second. A FULL TURN IN HALF A SECOND.
 *
 * It was 5.0 — a turn and a quarter seconds — and that is the number that
 * made this game feel unresponsive rather than difficult. Aiming is the whole
 * verb here, and a child who has seen the rock they want and pressed the key
 * should be pointing at it now, not in a second's time. Nothing else about
 * the game is fast, so a quick turn costs no control; it just stops the ship
 * feeling like it is turning through treacle.
 */
const TURN = 12.0
/** Court-widths per second squared, and the drag that eats it. */
const THRUST = 1.9
const DRAG = 2.6

/**
 * The shot. FASTER and LONGER-LIVED than it was (0.95 / 1.1s): a bolt that
 * expired before it crossed the screen meant a child who aimed correctly at
 * something far away simply watched their shot evaporate, with no way to tell
 * that the aim had been right. It now outlives a full crossing.
 */
const BOLT_SPEED = 1.30
const BOLT_LIFE = 1.6
const BOLT_R = 0.013
const MAX_BOLTS = 5

/**
 * How many rocks the first field has. Every cleared field adds one.
 *
 * TWO, not three. A big rock splits into two mediums and each of those into
 * two smalls, so a "three rock" field is really up to twenty-one things to
 * shoot and, at the end of it, a screenful of small fast ones all at once.
 * Two opens at fourteen, which is still a long field and no longer a swarm.
 */
const FIRST_WAVE = 2

type Rock = {
  x: number
  y: number
  vx: number
  vy: number
  /** 0 big, 1 medium, 2 small. */
  size: number
  /** One radius per point, already lumped. Fixed for the rock's whole life,
   *  so a drifting rock keeps its shape instead of shimmering. */
  shape: number[]
  spin: number
  angle: number
}

type Bolt = { x: number; y: number; vx: number; vy: number; life: number }

const lumpy = (rng: Rng): number[] =>
  Array.from({ length: POINTS }, () => 1 + (rng.float() * 2 - 1) * LUMP)

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'asteroids',
  triggers: {
    en: ['rocks', 'asteroids'],
    he: ['סלעים', 'אסטרואידים'],
    emoji: ['☄️'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('asteroids.turn') },
    { keys: '↑', label: t('asteroids.go') },
    { keys: '␣', label: t('asteroids.fire') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let rocks: Rock[] = []
    let bolts: Bolt[] = []
    let x = 0.5
    let y = 0.5
    let vx = 0
    let vy = 0
    /** Radians, 0 pointing up the screen. */
    let facing = 0
    /** Which keys are down this instant — arrow keys arrive as a repeat
     *  stream, so "held" is "one arrived recently". */
    let turnHeld = 0
    let thrustHeld = 0

    let bumped = false
    let holdT = HOLD_IGNORE
    let waves = 0
    let everSplit = false
    let everCleared = false

    const layField = (n: number): void => {
      rocks = []
      for (let i = 0; i < n; i++) {
        // Rocks arrive from the edges, never on top of the ship: a field that
        // opens with a rock already touching you is a field you lost before
        // you looked at it.
        const edge = ctx.rng.int(4)
        const along = ctx.rng.float()
        const px = edge === 0 ? along : edge === 1 ? 1 : along
        const py = edge === 0 ? 0 : edge === 1 ? along : edge === 2 ? 1 : along
        const dir = ctx.rng.float() * Math.PI * 2
        rocks.push({
          x: edge === 3 ? 0 : px,
          y: py,
          vx: Math.cos(dir) * ROCK_SPEED[0]!,
          vy: Math.sin(dir) * ROCK_SPEED[0]!,
          size: 0,
          shape: lumpy(ctx.rng),
          spin: (ctx.rng.float() * 2 - 1) * 0.7,
          angle: ctx.rng.float() * Math.PI * 2,
        })
      }
      bolts = []
      x = 0.5
      y = 0.5
      vx = 0
      vy = 0
      facing = 0
      bumped = false
    }

    layField(FIRST_WAVE)

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /**
     * Court fractions are not square: the stage is `stage.w` by `stage.h`
     * pixels and a pixel is 0.6 as wide as it is tall. Everything here
     * simulates in a SQUARE space and converts once, here, so a rock crossing
     * the screen sideways moves as fast as one crossing it downwards.
     */
    const aspectY = (): number => (stage.w * PIXEL_ASPECT) / stage.h

    const wrap = (v: number): number => (v % 1 + 1) % 1

    const fire = (): void => {
      if (bolts.length >= MAX_BOLTS) return
      bolts.push({
        x, y,
        vx: Math.sin(facing) * BOLT_SPEED,
        vy: -Math.cos(facing) * BOLT_SPEED,
        life: BOLT_LIFE,
      })
      ctx.audio.note(980, 40)
    }

    const split = (i: number): void => {
      const r = rocks[i]!
      everSplit = true
      ctx.audio.hit(r.size === 0 ? 'kick' : r.size === 1 ? 'tom' : 'hat')
      rocks.splice(i, 1)
      if (r.size >= SIZES.length - 1) return
      const next = r.size + 1
      // Two pieces, thrown apart at right angles to nothing in particular —
      // the important thing is that they visibly leave from where the big one
      // was, so the split reads as a break rather than as a replacement.
      for (const turn of [-1, 1]) {
        const dir = Math.atan2(r.vy, r.vx) + turn * 0.8
        rocks.push({
          x: r.x, y: r.y,
          vx: Math.cos(dir) * ROCK_SPEED[next]!,
          vy: Math.sin(dir) * ROCK_SPEED[next]!,
          size: next,
          shape: lumpy(ctx.rng),
          spin: (ctx.rng.float() * 2 - 1) * 1.1,
          angle: r.angle,
        })
      }
    }

    /** Distance in the square simulation space, the short way round the wrap. */
    const near = (
      ax: number, ay: number, bx: number, by: number, r: number,
    ): boolean => {
      const dx = Math.abs(((ax - bx + 1.5) % 1) - 0.5)
      const dy = Math.abs(((ay - by + 1.5) % 1) - 0.5) / aspectY()
      return dx * dx + dy * dy < r * r
    }

    return {
      onKey(k) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) return
          layField(FIRST_WAVE + waves)
          return
        }
        if (k.key === 'ArrowLeft') turnHeld = -1
        else if (k.key === 'ArrowRight') turnHeld = 1
        else if (k.key === 'ArrowUp') thrustHeld = 0.12
        else fire()
      },

      tick(dt) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        // A key is "held" for a moment after its last repeat arrived. The
        // browser sends a keydown roughly every 30ms while a key is down and
        // sends nothing at all when it is released, so this is the only
        // honest way to know: 120ms is four repeats' grace.
        if (turnHeld !== 0) {
          facing += turnHeld * TURN * dt
          turnHeld = 0
        }
        if (thrustHeld > 0) {
          vx += Math.sin(facing) * THRUST * dt
          vy += -Math.cos(facing) * THRUST * dt
          thrustHeld -= dt
        }
        // Drag, which is the whole of the "for a six-year-old" change: the
        // ship coasts to a stop in about a second instead of forever.
        const keep = Math.max(0, 1 - DRAG * dt)
        vx *= keep
        vy *= keep
        x = wrap(x + vx * dt)
        y = wrap(y + vy * dt * aspectY())

        for (const r of rocks) {
          r.x = wrap(r.x + r.vx * dt)
          r.y = wrap(r.y + r.vy * dt * aspectY())
          r.angle += r.spin * dt
        }

        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i]!
          b.life -= dt
          if (b.life <= 0) { bolts.splice(i, 1); continue }
          b.x = wrap(b.x + b.vx * dt)
          b.y = wrap(b.y + b.vy * dt * aspectY())
          for (let j = rocks.length - 1; j >= 0; j--) {
            if (!near(b.x, b.y, rocks[j]!.x, rocks[j]!.y, SIZES[rocks[j]!.size]!)) continue
            bolts.splice(i, 1)
            split(j)
            break
          }
        }

        if (rocks.length === 0) {
          everCleared = true
          waves += 1
          ctx.audio.note(700, 110)
          ctx.audio.note(950, 170)
          layField(FIRST_WAVE + waves)
          return
        }

        // A generous ship. The hull is drawn out to `SHIP_R`, and a bump is
        // only counted well inside that — a child who grazes the very tip of
        // a rock with the very tip of a fin has not really hit anything, and
        // in a game with this much wrapping that near-miss happens constantly.
        for (const r of rocks) {
          if (!near(x, y, r.x, r.y, SIZES[r.size]! + SHIP_R * 0.35)) continue
          bumped = true
          holdT = 0
          ctx.audio.hit('snare')
          return
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        /**
         * A closed polygon, in strokes. Drawn at every wrap offset it could
         * be visible at, so a rock leaving one edge is the same rock arriving
         * at the other rather than a rock that vanishes and reappears.
         */
        const poly = (cx: number, cy: number, pts: { x: number; y: number }[]): void => {
          for (const sx of [-1, 0, 1]) {
            for (const sy of [-1, 0, 1]) {
              const px = cx + sx
              const py = cy + sy
              if (px < -0.3 || px > 1.3 || py < -0.3 || py > 1.3) continue
              for (let i = 0; i < pts.length; i++) {
                const a = pts[i]!
                const b = pts[(i + 1) % pts.length]!
                c.line(X(px) + a.x, Y(py) + a.y, X(px) + b.x, Y(py) + b.y, INK)
              }
            }
          }
        }

        for (const r of rocks) {
          const rad = SIZES[r.size]! * stage.w
          const pts = r.shape.map((k, i) => {
            const a = r.angle + (i / POINTS) * Math.PI * 2
            return { x: Math.cos(a) * rad * k, y: Math.sin(a) * rad * k * PIXEL_ASPECT }
          })
          poly(r.x, r.y, pts)
        }

        // The ship: three strokes, the way the cabinet drew it. A notch in the
        // tail rather than a flat base, so which end is the front is never in
        // doubt at any angle.
        const rad = SHIP_R * stage.w
        const nose = { a: facing, k: 1.35 }
        const tail = [
          { a: facing + 2.5, k: 1 },
          { a: facing + Math.PI, k: 0.45 },
          { a: facing - 2.5, k: 1 },
        ]
        const at = (p: { a: number; k: number }): { x: number; y: number } => ({
          x: Math.sin(p.a) * rad * p.k,
          y: -Math.cos(p.a) * rad * p.k * PIXEL_ASPECT,
        })
        poly(x, y, [nose, ...tail].map(at))

        for (const b of bolts) {
          c.disc(X(b.x), Y(b.y), Math.max(2, BOLT_R * stage.w), INK)
        }

        if (bumped) {
          c.circle(X(x), Y(y), rad * 2.0, INK)
          c.circle(X(x), Y(y), rad * 2.8, INK)
        }
      },

      souvenir: () => {
        if (everCleared) return ctx.t('asteroids.souvenir.cleared')
        if (everSplit) return ctx.t('asteroids.souvenir.some')
        return ctx.t('asteroids.souvenir.none')
      },
    }
  },
}

export default cartridge
