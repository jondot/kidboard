import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * CLIMB — up the girders, past the barrels, to the top.
 *
 * WHY THIS AND NOT `tanks`. Combat was two players on one keyboard and had no
 * computer opponent by design, but that design does not survive contact with
 * one child: both tanks roll forward on their own, so a child playing alone
 * watches the second tank drive about doing nothing in particular, and there
 * is no way to tell that from a very bad opponent. A game whose whole premise
 * is invisible unless a second person happens to be sitting there is a game
 * that is broken most of the time it is open.
 *
 * WHAT THIS FILLS. There was no JUMPING anywhere in this box, and jumping is
 * the single most beloved verb in the medium — it is the one action a
 * five-year-old will do over and over for its own sake, with nothing at stake.
 * It is also the most famous game of the era that was missing here.
 *
 * THE GOAL IS THE PICTURE. Someone is waiting at the top of the screen, and
 * "get up there" needs no sentence in any language. Everything else follows
 * from it: the girders are the way up, the ladders are how you change girder,
 * and the barrels are what is in the way.
 *
 * THE FILL RULE, doing its usual work:
 *
 *   the girders   SOLID bars. They are the ground; solid is what you stand on.
 *   the climber   SOLID, and the only solid THING. It is the child.
 *   a barrel      HOLLOW ring. World, in the way, and a ring is unmistakably
 *                 not a person at ten pixels across.
 *   the ladders   HOLLOW: two rails and rungs, so you can see the girder
 *                 behind them and a ladder never reads as a wall.
 *   the friend    HOLLOW figure at the top. The same size and shape as the
 *                 climber, so it is plainly a person, and hollow so it is
 *                 plainly not the person you are moving.
 *
 * WHAT WAS MADE EASIER THAN THE ARCADE. Barrels do not bounce down ladders,
 * there are no fireballs, and a barrel that reaches the bottom simply leaves.
 * The jump is generous and it is the only timing in the game.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** Girders, bottom to top. Four is a climb; five is a chore. */
const FLOORS = 4
/** Where girder `i` sits, as a fraction of the stage height. */
const floorY = (i: number): number => 0.90 - i * 0.235
const GIRDER_T = 4

/**
 * The ladder out of girder `i`, as a fraction across. Alternating sides, so
 * the climb is a zig-zag and every floor has to be walked before it can be
 * left — which is what puts the child in front of the barrels.
 *
 * The TOP ladder is on the left and the friend is on the right, so the last
 * thing that happens is a walk the whole width of the top girder, into the
 * oncoming barrels, with the goal in sight the entire way. With the ladder on
 * the same side as the friend the climb simply ended: you arrived and had
 * already won, and the best moment in the game was over before it started.
 */
const ladderX = (i: number): number => (i % 2 === 0 ? 0.24 : 0.76)
const LADDER_W = 0.055

/** The climber, and the friend: the same person, one solid and one hollow. */
const PERSON = [
  '  ###  ',
  '  ###  ',
  ' ##### ',
  '#######',
  ' ##### ',
  ' ##### ',
  '## ## ',
]
const PERSON_HOLLOW = [
  '  ###  ',
  '  # #  ',
  ' #   # ',
  '#     #',
  ' #   # ',
  ' #   # ',
  '##   ##',
]
const PERSON_COLS = 7
const PERSON_ROWS = 7

/** Stage-widths per second, and stage-heights per second for the ladder. */
const RUN = 0.30
const CLIMB = 0.34
/** The jump, in stage-heights: how high, and how long it takes. */
const JUMP_UP = 1.55
const GRAVITY = 4.2

/** Barrels. Slow, and they only ever roll or fall. */
const BARREL_R = 0.026
const BARREL_SPEED = 0.20
const BARREL_FALL = 0.55
/** Seconds between barrels at the start, and the floor it never goes under. */
const DROP_SLOW = 3.0
const DROP_FAST = 1.4
/** Every trip to the top takes this much off the gap between barrels. */
const DROP_STEP = 0.35

type Barrel = {
  x: number
  y: number
  /** The girder it is rolling along, or `null` while it is in the air. */
  floor: number | null
  /** The girder it is falling towards. Only meaningful while `floor` is null. */
  to: number
  dir: number
}

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'climb',
  triggers: {
    en: ['climb', 'barrels', 'ladders'],
    he: ['טיפוס', 'חביות'],
    emoji: ['🪜'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('climb.walk') },
    { keys: '↑ ↓', label: t('climb.ladder') },
    { keys: '␣', label: t('climb.jump') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let x = 0.10
    /** Which girder the climber is standing on. */
    let floor = 0
    /** Height above that girder, in stage fractions. 0 while walking. */
    let air = 0
    let vy = 0
    let climbing = false
    /** Fraction of the way up the ladder out of `floor`, while climbing. */
    let rung = 0

    let barrels: Barrel[] = []
    let sinceDrop = 0
    let trips = 0
    let done: 'home' | 'bumped' | null = null
    let holdT = HOLD_IGNORE
    let everClimbed = false
    let everHome = false

    const dropEvery = (): number =>
      Math.max(DROP_FAST, DROP_SLOW - DROP_STEP * trips)

    const backToBottom = (): void => {
      x = 0.10
      floor = 0
      air = 0
      vy = 0
      climbing = false
      rung = 0
      barrels = []
      sinceDrop = 0
      done = null
    }

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** Court fractions are not square; this converts a vertical step. */
    const aspectY = (): number => (stage.w * PIXEL_ASPECT) / stage.h

    /** Where the climber's feet are now, as a fraction of the stage height. */
    const feetY = (): number =>
      climbing
        ? floorY(floor) - (floorY(floor) - floorY(floor + 1)) * rung
        : floorY(floor) - air

    const atLadder = (): boolean =>
      floor < FLOORS - 1 && Math.abs(x - ladderX(floor)) < LADDER_W

    const bump = (): void => {
      done = 'bumped'
      holdT = 0
      ctx.audio.hit('kick')
      ctx.audio.hit('snare')
    }

    const home = (): void => {
      done = 'home'
      holdT = 0
      everHome = true
      trips += 1
      ctx.audio.note(660, 110)
      ctx.audio.note(880, 110)
      ctx.audio.note(1050, 190)
    }

    return {
      onKey(k) {
        if (done) {
          if (holdT < HOLD_IGNORE) return
          backToBottom()
          return
        }
        if (climbing) {
          if (k.key === 'ArrowUp') {
            rung = Math.min(1, rung + 0.16)
            if (rung >= 1) { climbing = false; floor += 1; rung = 0; x = ladderX(floor - 1) }
            return
          }
          if (k.key === 'ArrowDown') {
            rung = Math.max(0, rung - 0.16)
            if (rung <= 0) climbing = false
            return
          }
          /**
           * LEFT AND RIGHT STEP OFF THE LADDER, and this is not a nicety.
           *
           * They used to do nothing at all — the thought being that stepping
           * off a ladder mid-climb is how a child falls through a girder. What
           * it actually produced was a ladder that swallowed two of the four
           * arrow keys: a child halfway up who pressed left got no movement,
           * no sound and no reason, which reads as a broken keyboard rather
           * than as a rule. (It also wedged a scripted player solid, which is
           * how it was found.)
           *
           * So they step off, onto whichever girder is nearer — below for the
           * bottom half of the ladder, above for the top. Nobody falls
           * through anything and no key is ever dead.
           *
           * ONLY left and right. A jump pressed on a ladder does nothing,
           * because a child holding a ladder and tapping the jump key is not
           * asking to be thrown off it.
           */
          if (k.key !== 'ArrowLeft' && k.key !== 'ArrowRight') return
          climbing = false
          if (rung >= 0.5) { floor += 1; x = ladderX(floor - 1) }
          rung = 0
          air = 0
          vy = 0
        }
        if (k.key === 'ArrowLeft') x = Math.max(0.04, x - RUN * 0.05)
        else if (k.key === 'ArrowRight') x = Math.min(0.96, x + RUN * 0.05)
        else if (k.key === 'ArrowUp') {
          if (atLadder() && air === 0) { climbing = true; everClimbed = true; ctx.audio.blip() }
        } else if (air === 0) {
          // ANY other key jumps, not only the space bar: the bar is on the
          // hint line for a child who reads, and every other key works for
          // one who does not.
          vy = JUMP_UP
          ctx.audio.note(700, 60)
        }
      },

      tick(dt) {
        if (done) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        if (!climbing) {
          if (vy !== 0 || air > 0) {
            air += vy * dt
            vy -= GRAVITY * dt
            if (air <= 0) { air = 0; vy = 0 }
          }
        }

        // Reaching the top girder is the whole game, and it is checked by
        // POSITION rather than by touching anything: the friend is a picture
        // of the goal, not a hitbox.
        if (floor === FLOORS - 1 && !climbing && x > 0.62) { home(); return }

        sinceDrop += dt
        if (sinceDrop >= dropEvery()) {
          sinceDrop = 0
          barrels.push({
            x: 0.08, y: floorY(FLOORS - 1), floor: FLOORS - 1, to: FLOORS - 1, dir: 1,
          })
        }

        for (let i = barrels.length - 1; i >= 0; i--) {
          const b = barrels[i]!
          if (b.floor !== null) {
            b.x += b.dir * BARREL_SPEED * dt
            b.y = floorY(b.floor)
            // Off the end of a girder: it drops to the next one down and
            // turns round, which is what sends it back across the screen and
            // is the whole reason one barrel is a hazard on every floor.
            if (b.x > 0.97 || b.x < 0.03) {
              if (b.floor === 0) { barrels.splice(i, 1); continue }
              b.to = b.floor - 1
              b.floor = null
            }
          } else {
            b.y += BARREL_FALL * dt
            if (b.y >= floorY(b.to)) {
              b.y = floorY(b.to)
              b.floor = b.to
              b.dir = -b.dir
              b.x = Math.max(0.04, Math.min(0.96, b.x))
              ctx.audio.hit('tom')
            }
          }

          // Hit? Only while the climber is roughly at the barrel's height —
          // which is what makes a jump work, and it is the only timing in
          // the game.
          const dx = Math.abs(b.x - x)
          const dy = Math.abs(b.y - feetY())
          if (dx < BARREL_R + 0.03 && dy < 0.045) { bump(); return }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // The girders: solid bars, the ground.
        for (let i = 0; i < FLOORS; i++) {
          c.rect(stage.x, Y(floorY(i)), stage.w, GIRDER_T, INK)
        }

        // The ladders: two rails and rungs, hollow, so the girder behind them
        // still shows and a ladder never reads as a wall.
        for (let i = 0; i < FLOORS - 1; i++) {
          const lx = X(ladderX(i))
          const top = Y(floorY(i + 1))
          const bot = Y(floorY(i))
          const w = LADDER_W * stage.w
          c.rect(lx - w / 2, top, 2, bot - top, INK)
          c.rect(lx + w / 2 - 2, top, 2, bot - top, INK)
          const rungs = 5
          for (let r = 1; r < rungs; r++) {
            const ry = top + ((bot - top) * r) / rungs
            c.rect(lx - w / 2, ry, w, 2, INK)
          }
        }

        // The friend, at the top. Hollow, and the same person as the climber.
        const scale = Math.max(1, Math.round((stage.h * 0.075) / PERSON_ROWS))
        const ph = PERSON_ROWS * scale
        c.sprite(
          X(0.80) - (PERSON_COLS * scale) / 2, Y(floorY(FLOORS - 1)) - ph,
          PERSON_HOLLOW, INK, { scale },
        )

        // The barrels: hollow rings, world, in the way.
        for (const b of barrels) {
          const r = BARREL_R * stage.w
          c.circle(X(b.x), Y(b.y) - r * PIXEL_ASPECT, r, INK)
        }

        // The climber, last and solid.
        c.sprite(
          X(x) - (PERSON_COLS * scale) / 2, Y(feetY()) - ph,
          PERSON, INK, { scale },
        )

        if (done) {
          const cx = X(x)
          const cy = Y(feetY()) - ph / 2
          c.circle(cx, cy, stage.w * 0.055, INK)
          c.circle(cx, cy, stage.w * 0.080, INK)
        }
      },

      souvenir: () => {
        if (everHome) return ctx.t('climb.souvenir.home')
        if (everClimbed) return ctx.t('climb.souvenir.up')
        return ctx.t('climb.souvenir.none')
      },
    }
  },
}

export default cartridge
