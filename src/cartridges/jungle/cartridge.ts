import type { CanvasLike, Locale, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * JUNGLE — run right, jump the holes, and see what is in there.
 *
 * WHAT THIS HAS THAT NOTHING ELSE HERE HAS: somewhere to GO. Every other game
 * in this box happens on one screen. This one is a journey — walk off the
 * right-hand edge and you are somewhere new, walk back and it is exactly as
 * you left it, and the only reason to keep going is that you have not seen
 * what is further in yet. A five-year-old needs no other reason.
 *
 * IT REUSES `climb`'S JUMP on purpose. Jumping was built once, for the
 * girders, and it is the one verb a small child will repeat for its own sake.
 * Here it has somewhere to be spent: a hole in the ground, and a log rolling
 * at you. The leap carries you forward as well as up, so ONE key clears a
 * hole — a jump that has to be combined with a direction is a jump a
 * five-year-old misses every time.
 *
 * THE TREASURE IS THE POINT, and it is why the souvenir is a list rather than
 * a tier. Coming home with the crown and the diamond is a thing that
 * HAPPENED, with names on it. Getting a long way in without finding anything
 * is also a thing that happened, and it gets its own line.
 *
 * THE FILL RULE:
 *
 *   the ground    a SOLID band, with a hole in it where there is a hole. The
 *                 gap IS the hazard; nothing had to be drawn to say so.
 *   the runner    SOLID, two frames, the only person here. It is the child.
 *   a log         a HOLLOW ring, rolling. World, in the way, and unmistakably
 *                 not a person — the same ring `climb` rolls barrels with.
 *   the treasure  SOLID little bitmaps of themselves, sitting on the ground.
 *   the canopy    a solid band with a ragged edge, right at the top where
 *                 nothing can reach it. Scenery reads as scenery by being
 *                 somewhere the game does not happen.
 *
 * WHAT WAS MADE KINDER THAN THE ARCADE. There is no clock, no scorpions and
 * no quicksand; a hole is a hole. Falling in does not send you home — you get
 * lifted back to the near edge of the same screen, with everything you have
 * already found still yours. The journey is never taken away.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/**
 * The ground line, as a fraction of the stage height — and the canopy hangs
 * to `CANOPY_LOW`. Between them is the band the game happens in, and it is
 * deliberately about half the screen: the first cut put the leaves at a tenth
 * and the ground at four fifths, and two thirds of the picture was empty
 * blue with a very small person in the middle of it.
 */
const GROUND_Y = 0.74
const CANOPY_TOP = 0.05
const CANOPY_LOW = 0.16
/** The hole in a hole screen, as fractions across. */
const PIT_A = 0.40
const PIT_B = 0.60

/** Stage-widths per keypress, and the leap. */
const STEP = 0.016
const JUMP_UP = 1.55
const GRAVITY = 4.2
/** The forward drift a leap carries, in stage-widths per second. One press
 *  of one key must clear a hole; a jump you have to steer is a jump missed. */
const JUMP_RUN = 0.30
/** How far below the ground you sink before the fall is a fall. */
const PIT_DEPTH = 0.10

/** Logs. Hollow, slow, and they roll in from the right for ever. */
const LOG_R = 0.026
const LOG_SPEED = 0.17
/** A leap this high is over the log. */
const LOG_CLEAR = 0.05

/** Where the edges of a screen are. */
const EDGE_R = 0.96
const EDGE_L = 0.04

/** How many treasures the souvenir spells out before it says "and more". */
const NAME_CAP = 3

const RUNNER_A = [
  '   ###   ',
  '  #####  ',
  '   ###   ',
  '  #####  ',
  ' ####### ',
  '#  ###  #',
  '#  ###  #',
  '   ###   ',
  '  ## ##  ',
  ' ##   ## ',
  '##     ##',
]
const RUNNER_B = [
  '   ###   ',
  '  #####  ',
  '   ###   ',
  '  #####  ',
  ' ####### ',
  '   ###  #',
  '   ###  #',
  '   ###   ',
  '   ###   ',
  '  ## ##  ',
  '  ##  ## ',
]
const RUNNER_COLS = 9
const RUNNER_ROWS = 11
/** Seconds per leg swap while running. */
const STRIDE = 0.14

const GOLD = [
  '           ',
  '   #####   ',
  '  #######  ',
  ' ######### ',
  '###########',
  '###########',
  '           ',
]
const DIAMOND = [
  '   #####   ',
  '  #######  ',
  ' ######### ',
  '###########',
  ' ######### ',
  '  #######  ',
  '   #####   ',
]
const BAG = [
  '    ###    ',
  '   #####   ',
  '  #######  ',
  ' ######### ',
  '###########',
  '###########',
  ' ######### ',
]
const CROWN = [
  '#    #    #',
  '##  ###  ##',
  '###########',
  '###########',
  '###########',
  ' ######### ',
  '           ',
]
/** Each treasure is its own picture and its own name in the souvenir. */
const TREASURES = [
  { art: GOLD, key: 'jungle.gold' },
  { art: DIAMOND, key: 'jungle.diamond' },
  { art: BAG, key: 'jungle.bag' },
  { art: CROWN, key: 'jungle.crown' },
] as const
const TREASURE_COLS = 11
const TREASURE_ROWS = 7

/**
 * Joins named things the way a person says them aloud. THE CONJUNCTION IS
 * ADDED HERE AND NOWHERE ELSE — Hebrew's "and" is the prefix ו glued to the
 * next word, so a string that carries its own would produce the doubled
 * letter וו, which is not a word in any register of Hebrew. `jungle.more`
 * holds the bare word; this supplies the ו.
 */
function joinNamed(names: string[], locale: Locale): string {
  if (names.length === 1) return names[0]!
  const head = names.slice(0, -1)
  const last = names[names.length - 1]!
  if (locale === 'he') return `${head.join(', ')} ו${last}`
  return names.length === 2 ? `${names[0]} and ${last}` : `${head.join(', ')}, and ${last}`
}

/** One place in the jungle. Generated once, then it stays as it was left. */
type Screen = {
  pit: boolean
  logs: number
  /** Index into `TREASURES`, or -1 once it has been picked up. */
  treasure: number
  treasureX: number
}

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'jungle',
  triggers: {
    en: ['jungle', 'pitfall', 'treasure'],
    he: ['יער', 'אוצר'],
    emoji: ['🌴'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('jungle.run') },
    { keys: '␣', label: t('jungle.jump') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let x = 0.12
    /** Height above the ground line; negative while falling into a hole. */
    let air = 0
    let vy = 0
    let facing = 1
    /** The forward drift of the leap in progress, or 0 on the ground. */
    let drift = 0
    let stride = 0
    let frame = 0

    let at = 0
    let deepest = 0
    let logPhase = 0
    let bumped = false
    let holdT = HOLD_IGNORE
    /** The names of what was found, in the order it was found. */
    const found: string[] = []

    /**
     * The jungle, generated one screen at a time and then KEPT. A place a
     * child walks back to must be the place they left; a world re-rolled on
     * every visit is not somewhere you can go, it is weather.
     */
    const screens: Screen[] = [{ pit: false, logs: 0, treasure: -1, treasureX: 0.5 }]

    const screenAt = (i: number): Screen => {
      while (screens.length <= i) {
        const roll = ctx.rng.int(3)
        const pit = roll === 1
        screens.push({
          pit,
          logs: roll === 2 ? 1 + ctx.rng.int(2) : 0,
          treasure: ctx.rng.chance(0.5) ? ctx.rng.int(TREASURES.length) : -1,
          // On a hole screen the treasure sits on the FAR side, so the leap
          // is what buys it. That trade is the whole of Pitfall.
          treasureX: pit ? 0.78 : 0.30 + ctx.rng.int(5) * 0.1,
        })
      }
      return screens[i]!
    }

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** Where log `j` is on this screen, as a fraction across. */
    const logX = (screen: Screen, j: number): number => {
      const spread = 1 / Math.max(1, screen.logs)
      return ((logPhase + j * spread) % 1 + 1) % 1
    }

    const overPit = (screen: Screen): boolean =>
      screen.pit && x > PIT_A && x < PIT_B

    const bump = (): void => {
      bumped = true
      holdT = 0
      ctx.audio.hit('kick')
      ctx.audio.hit('snare')
    }

    const backToEdge = (): void => {
      bumped = false
      x = EDGE_L + 0.06
      air = 0
      vy = 0
      drift = 0
    }

    return {
      onKey(k) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) return
          backToEdge()
          return
        }
        // Nothing steers while you are in a hole. The fall is the moment.
        if (air < 0) return

        if (k.key === 'ArrowLeft') { x -= STEP; facing = -1; stride += 0.05 }
        else if (k.key === 'ArrowRight') { x += STEP; facing = 1; stride += 0.05 }
        else if (air === 0) {
          // ANY other key leaps — the bar is on the hint line for a child who
          // reads, and every other key works for one who does not.
          vy = JUMP_UP
          drift = JUMP_RUN * facing
          ctx.audio.note(700, 60)
        }
      },

      tick(dt) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }
        const screen = screenAt(at)

        stride += dt
        if (stride >= STRIDE) { stride = 0; frame = frame === 0 ? 1 : 0 }

        logPhase = ((logPhase - LOG_SPEED * dt) % 1 + 1) % 1

        if (vy !== 0 || air !== 0) {
          x += drift * dt
          air += vy * dt
          vy -= GRAVITY * dt
          if (air <= 0 && vy < 0) {
            // Back down. Either there is ground here or there is not.
            if (overPit(screen)) {
              if (air <= -PIT_DEPTH) { bump(); return }
            } else {
              air = 0
              vy = 0
              drift = 0
            }
          }
        } else if (overPit(screen)) {
          // Walked straight in. Same fall, no jump needed.
          vy = -0.01
        }

        // The edges of a screen. Walking off one is how the jungle is seen.
        if (x > EDGE_R) {
          at += 1
          deepest = Math.max(deepest, at)
          screenAt(at)
          x = EDGE_L + 0.02
          logPhase = 0
          ctx.audio.blip()
        } else if (x < EDGE_L) {
          if (at === 0) x = EDGE_L
          else { at -= 1; x = EDGE_R - 0.02; logPhase = 0; ctx.audio.blip() }
        }

        const here = screenAt(at)

        // A log only touches you while you are low. A leap is the answer and
        // it is the only timing in the game.
        if (air < LOG_CLEAR) {
          for (let j = 0; j < here.logs; j++) {
            if (Math.abs(logX(here, j) - x) < LOG_R + 0.025) { bump(); return }
          }
        }

        if (here.treasure >= 0 && air < 0.06 && Math.abs(here.treasureX - x) < 0.055) {
          found.push(ctx.t(TREASURES[here.treasure]!.key))
          here.treasure = -1
          ctx.audio.note(880, 90)
          ctx.audio.note(1180, 150)
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h
        const screen = screenAt(at)

        // The canopy, up where the game does not happen. Its ragged lower
        // edge is worked out from the leaf's own index rather than from the
        // rng, so a redraw can never reshuffle the trees under a child.
        c.rect(stage.x, stage.y, stage.w, Math.max(3, stage.h * CANOPY_TOP), INK)
        const leaves = 14
        const hang = stage.h * (CANOPY_LOW - CANOPY_TOP)
        for (let i = 0; i < leaves; i++) {
          const w = stage.w / leaves
          const h = hang * (0.4 + 0.6 * (((i * 7) % 5) / 4))
          c.rect(stage.x + i * w, stage.y + stage.h * CANOPY_TOP, w * 0.82, h, INK)
        }

        // The ground: one solid band, or two with a hole between them.
        const gy = Y(GROUND_Y)
        const gh = stage.y + stage.h - gy
        if (screen.pit) {
          c.rect(stage.x, gy, PIT_A * stage.w, gh, INK)
          c.rect(X(PIT_B), gy, stage.w * (1 - PIT_B), gh, INK)
        } else {
          c.rect(stage.x, gy, stage.w, gh, INK)
        }

        // The treasure, sitting on the ground.
        const tScale = Math.max(1, Math.round((stage.h * 0.10) / TREASURE_ROWS))
        if (screen.treasure >= 0) {
          c.sprite(
            X(screen.treasureX) - (TREASURE_COLS * tScale) / 2,
            gy - TREASURE_ROWS * tScale,
            TREASURES[screen.treasure]!.art, INK, { scale: tScale },
          )
        }

        // The logs: hollow rings, rolling.
        const lr = LOG_R * stage.w
        for (let j = 0; j < screen.logs; j++) {
          c.circle(X(logX(screen, j)), gy - lr * PIXEL_ASPECT, lr, INK)
        }

        // The runner, solid, mid-stride, facing where they last went. Scaled
        // off the stage's WIDTH, because the width is what grows on a big
        // screen — scaled off the height, the child stayed the same handful
        // of pixels while the jungle got wider around them.
        const rScale = Math.max(2, Math.round((stage.w * 0.085) / RUNNER_COLS))
        const rh = RUNNER_ROWS * rScale
        c.sprite(
          X(x) - (RUNNER_COLS * rScale) / 2,
          gy - air * stage.h - rh,
          frame === 0 ? RUNNER_A : RUNNER_B, INK,
          { scale: rScale, flipX: facing < 0 },
        )

        if (bumped) {
          const cx = X(x)
          const cy = gy - rh / 2
          c.circle(cx, cy, stage.w * 0.055, INK)
          c.circle(cx, cy, stage.w * 0.08, INK)
        }
      },

      souvenir: () => {
        if (found.length > 0) {
          const names = found.slice(0, NAME_CAP)
          if (found.length > NAME_CAP) names.push(ctx.t('jungle.more'))
          return ctx.t('jungle.souvenir.found').replace('{list}', joinNamed(names, ctx.locale))
        }
        if (deepest > 0) return ctx.t('jungle.souvenir.deep')
        return ctx.t('jungle.souvenir.none')
      },
    }
  },
}

export default cartridge
