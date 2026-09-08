import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * KABOOM — someone up there is dropping bombs, and you have three buckets.
 *
 * WHY THIS WHEN `catch` EXISTS. `catch` is weather: gifts drift down out of an
 * empty sky at their own pace, nothing is lost, and the child walks under
 * them. This is a DUEL. There is a person at the top of the screen, you can
 * see him, he moves, and every bomb comes out of his hands — so a near miss
 * is something somebody did to you rather than something that fell. That is
 * the whole of Kaboom's appeal and it is not reachable by making `catch`
 * faster.
 *
 * THE STACK IS THE STORY, and it is why nothing here needs a number.
 *
 *   three buckets   a tall stack, and the TOP one is the one that catches.
 *   a bomb gets by  the top bucket goes. The stack is shorter, so the catch
 *                   line has dropped: the child can see, in the picture
 *                   alone, that there is more sky to cross and fewer chances
 *                   left. A counter would say the same thing in a language
 *                   a five-year-old cannot read.
 *   the last one    the round is over — and "over" here means the picture
 *                   holds until a key asks for three fresh buckets.
 *
 * THE FILL RULE:
 *
 *   the buckets   SOLID walls and a solid floor. The child steers them, so
 *                 they are the heaviest thing on screen. Open at the top,
 *                 because a bucket that is closed is a box.
 *   a bomb        SOLID, round, with a fuse. It is a thing, and things are
 *                 solid — it is told from a bucket by shape and by the fact
 *                 that it is falling.
 *   the bomber    HOLLOW. Exactly like the friend at the top of `climb`: the
 *                 same drawing as a person, hollow, so he is plainly someone
 *                 and plainly not the someone you are moving.
 *
 * NOTHING RE-ARMS ON A TIMER. A bomb that gets past holds the picture with a
 * ring where it landed, and the next bomb comes when the child presses a key.
 * Three misses is three separate held moments, not a slide down a chute.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** How many buckets a fresh round starts with. Three is the arcade's own. */
const BUCKETS = 3
/** The stack, in fractions of the stage. Bottom edge, height, gap, width. */
const BASE_Y = 0.95
const BUCKET_H = 0.095
const BUCKET_GAP = 0.012
const BUCKET_W = 0.16
const BUCKET_T = 4
/** How far the stack and the bomber stay clear of the sky's own rail. */
const MARGIN = 0.03
/** Stage-widths per keypress. */
const BUCKET_STEP = 0.055

/** The bomber walks this line, between these two edges. */
const BOMBER_Y = 0.11
const BOMBER_MIN = 0.13
const BOMBER_MAX = 0.87
/** Stage-widths per second. */
const BOMBER_SPEED = 0.30
/** He changes his mind about this often, per second, on top of the edges. */
const BOMBER_TURN = 0.4

/** A bomb: where it leaves his hands, how big it is, how fast it falls. */
const DROP_Y = 0.18
const BOMB_R = 0.028
const FALL_SLOW = 0.30
const FALL_FAST = 0.62
/** Every caught load makes the next one this much brisker. */
const FALL_STEP = 0.035

/** Seconds between two bombs, at the start and at its briskest. */
const GAP_SLOW = 1.05
const GAP_FAST = 0.42
const GAP_STEP = 0.08

/** Bombs in a load. Catch a whole one and the bomber tries harder. */
const LOAD = 6

/**
 * The bomber. Hollow, and drawn as a person rather than as a machine: the
 * child is playing against somebody, and a somebody has arms.
 */
const BOMBER = [
  '   ###   ',
  '  #   #  ',
  '   ###   ',
  '## ### ##',
  '#  ###  #',
  '   # #   ',
  '  #   #  ',
]
const BOMBER_COLS = 9
const BOMBER_ROWS = 7

type Bomb = { x: number; y: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'kaboom',
  triggers: {
    en: ['kaboom', 'bombs', 'buckets'],
    he: ['בום', 'פצצות', 'דליים'],
    emoji: ['💣'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: '← →', label: t('kaboom.move') }],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    let x = 0.5
    let left = BUCKETS
    let bombs: Bomb[] = []
    let bomberX = 0.5
    let bomberDir = 1
    let sinceDrop = 0
    /** Caught since the last miss. Never shown; it only decides the load. */
    let inLoad = 0
    let loads = 0
    /** A miss holds the picture. Where the ring goes while it does. */
    let resting: { x: number; y: number } | null = null
    let holdT = HOLD_IGNORE
    let everCaught = false
    let everLoad = false
    let loadsPlural = false

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** The rim of the TOP bucket — the line a bomb is caught or missed on. */
    const rimY = (): number =>
      BASE_Y - left * BUCKET_H - (left - 1) * BUCKET_GAP

    const gapNow = (): number => Math.max(GAP_FAST, GAP_SLOW - GAP_STEP * loads)
    const fallNow = (): number => Math.min(FALL_FAST, FALL_SLOW + FALL_STEP * loads)

    const fresh = (): void => {
      left = BUCKETS
      bombs = []
      inLoad = 0
      loads = 0
      sinceDrop = 0
      resting = null
    }

    const missed = (b: Bomb): void => {
      bombs = []
      inLoad = 0
      left -= 1
      resting = { x: b.x, y: rimY() }
      holdT = 0
      ctx.audio.hit('kick')
      ctx.audio.hit('snare')
    }

    return {
      onKey(k) {
        if (resting) {
          if (holdT < HOLD_IGNORE) return
          if (left <= 0) fresh()
          else { resting = null; sinceDrop = 0 }
          return
        }
        // The stack stops clear of the rail. Run flush against it and the
        // bucket's own far wall lands ON the rail and disappears into it,
        // which turns the bucket into an open-ended tray.
        if (k.key === 'ArrowLeft') x = Math.max(BUCKET_W / 2 + MARGIN, x - BUCKET_STEP)
        else if (k.key === 'ArrowRight') x = Math.min(1 - BUCKET_W / 2 - MARGIN, x + BUCKET_STEP)
      },

      tick(dt) {
        if (resting) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        // The bomber paces, and turns at the edges or on a whim. The whim is
        // what stops him becoming a metronome a child can simply park under.
        bomberX += bomberDir * BOMBER_SPEED * dt
        if (bomberX <= BOMBER_MIN) { bomberX = BOMBER_MIN; bomberDir = 1 }
        if (bomberX >= BOMBER_MAX) { bomberX = BOMBER_MAX; bomberDir = -1 }
        if (ctx.rng.chance(BOMBER_TURN * dt)) bomberDir = -bomberDir

        sinceDrop += dt
        if (sinceDrop >= gapNow()) {
          sinceDrop = 0
          bombs.push({ x: bomberX, y: DROP_Y })
          ctx.audio.blip()
        }

        const rim = rimY()
        for (let i = bombs.length - 1; i >= 0; i--) {
          const b = bombs[i]!
          b.y += fallNow() * dt
          if (b.y < rim) continue
          // At the rim it is decided, one way or the other, in one frame.
          if (Math.abs(b.x - x) <= BUCKET_W / 2) {
            bombs.splice(i, 1)
            everCaught = true
            inLoad += 1
            ctx.audio.note(620, 55)
            if (inLoad >= LOAD) {
              inLoad = 0
              loads += 1
              if (everLoad) loadsPlural = true
              everLoad = true
              ctx.audio.note(760, 90)
              ctx.audio.note(1020, 150)
            }
            continue
          }
          missed(b)
          return
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // The sky. Hollow, thin, world — the same rail `catch` puts round its
        // own sky, and the thing that says where the bombs can and cannot go.
        c.outline(stage.x, stage.y, stage.w, stage.h, INK, 3)

        // The bomber, hollow, walking his line. Scaled off the stage's WIDTH,
        // which is what grows on a wide screen: off the height he stayed a
        // fixed handful of pixels while the sky got bigger around him.
        const scale = Math.max(2, Math.round((stage.w * 0.09) / BOMBER_COLS))
        c.sprite(
          X(bomberX) - (BOMBER_COLS * scale) / 2,
          Y(BOMBER_Y) - (BOMBER_ROWS * scale) / 2,
          BOMBER, INK, { scale },
        )

        // The stack. Solid walls, solid floor, open at the top.
        const bw = BUCKET_W * stage.w
        const bh = BUCKET_H * stage.h
        for (let i = 0; i < left; i++) {
          const top = Y(BASE_Y - (i + 1) * BUCKET_H - i * BUCKET_GAP)
          const x0 = X(x) - bw / 2
          c.rect(x0, top, BUCKET_T, bh, INK)
          c.rect(x0 + bw - BUCKET_T, top, BUCKET_T, bh, INK)
          c.rect(x0, top + bh - BUCKET_T, bw, BUCKET_T, INK)
        }

        // The bombs: solid, round, fused.
        const r = BOMB_R * stage.w
        for (const b of bombs) {
          const bx = X(b.x)
          const by = Y(b.y)
          c.disc(bx, by, r, INK)
          // The fuse sits ON the bomb: a disc's vertical radius is 0.6 of its
          // horizontal one, so a fuse measured in horizontal radii floats
          // above the thing it is meant to be stuck into.
          c.rect(bx - 1, by - r * 1.7, 2, r * 1.1, INK)
        }

        // The held moment: a ring, hollow, so it is never a piece of the game.
        if (resting) {
          c.circle(X(resting.x), Y(resting.y), stage.w * 0.05, INK)
          c.circle(X(resting.x), Y(resting.y), stage.w * 0.075, INK)
        }
      },

      souvenir: () => {
        if (loadsPlural) return ctx.t('kaboom.souvenir.loads')
        if (everLoad) return ctx.t('kaboom.souvenir.load')
        if (everCaught) return ctx.t('kaboom.souvenir.some')
        return ctx.t('kaboom.souvenir.none')
      },
    }
  },
}

export default cartridge
