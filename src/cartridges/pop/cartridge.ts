import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

// The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra columns
// follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 sky needs on a desktop. See `stageOf` in `../stage`.
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

// ---- the picture, in LOGICAL PIXELS --------------------------------------
//
// ONE INK, `plain`. The balloon is a HOLLOW ring with the letter inside it in
// the same ink — which is the whole reason it is hollow. This is the one
// place in the project where text belongs on top of a shape: recognising the
// letter IS the game, so the letter is content, not a score.
const INK = 'plain' as const
const WALL = 3
/** Balloon radius, horizontal. `circle` squashes the vertical one, so the
 *  ring is 2r across and 1.2r down — big enough to hold one 8-pixel glyph. */
const BALLOON_R = 11
/** Pixels of string hanging under a balloon. One pixel wide, as promised. */
const STRING_H = 7
/** Pixels one balloon lane occupies: the balloon plus air either side. */
const LANE = 30
/** Seconds between two balloons being let go. A rhythm, not a stream —
 *  slower than it was, because a sky that keeps handing out letters faster
 *  than a child can find them on a keyboard is a treadmill. */
const RELEASE = 1.7
/** Balloons at once, as a share of the lanes there are — a wide sky holds
 *  more of them, a narrow one fewer, and neither is ever a crowd. */
const IN_AIR_SHARE = 0.45
const IN_AIR_MIN = 2
const IN_AIR_MAX = 5
/** Pixels per second. Slow enough that a child can find the letter and
 *  press it: a balloon takes seven to eleven seconds to cross the sky. */
const RISE_MIN = 13
const RISE_MAX = 20
/** Seconds the burst ring sits where a balloon was. */
const BURST = 0.4
/** How many letters the souvenir spells out before it says "and more". */
const NAME_CAP = 4

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * The capital of a single Latin letter, by table.
 *
 * Deliberately NOT the built-in case-raising string method: that call is
 * banned project-wide, and mechanically checked for, because raising case is
 * meaningless in Hebrew — a cartridge that reaches for it once teaches the
 * next contributor to reach for it too. A balloon only ever wears one of
 * these twenty-six letters, so a table is both honest and exact.
 */
export const capital = (ch: string): string => {
  const i = LOWER.indexOf(ch)
  return i < 0 ? ch : UPPER[i]!
}

/**
 * Letters a 6-year-old is actually learning, in the order they usually meet
 * them, grouped so the early ones come up far more often than the late ones.
 *
 * A uniform draw over all 26 would spend a third of the game on Q, X and Z —
 * letters a child at this stage has barely seen — and the first tier is
 * deliberately the classic first phonics set (s a t p i n) plus the letters
 * that immediately follow it, because those are the ones a child is being
 * asked to recognise this week.
 */
export const LETTER_TIERS: readonly (readonly string[])[] = [
  ['s', 'a', 't', 'p', 'i', 'n', 'm', 'd'],
  ['g', 'o', 'c', 'k', 'e', 'u', 'r', 'h', 'b', 'f', 'l'],
  ['j', 'v', 'w', 'x', 'y', 'z', 'q'],
]

/** How many tickets each tier gets in the bag. */
const TIER_WEIGHT = [5, 2, 1]

/** The bag the rng draws from — one entry per ticket, so a `pick` is weighted. */
export const LETTER_BAG: readonly string[] = LETTER_TIERS.flatMap(
  (tier, i) => tier.flatMap((l) => Array.from({ length: TIER_WEIGHT[i]! }, () => l)),
)

/**
 * Joins named things the way a person says them aloud. Same idiom as `catch`
 * and `memory`, including the correction made there: the conjunction is added
 * HERE and only here, so a capped list can never come out as "and and more".
 * English-only, like the rest of this cartridge.
 */
export function joinNamed(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  const head = names.slice(0, -1)
  const last = names[names.length - 1]!
  return names.length === 2 ? `${names[0]} and ${last}` : `${head.join(', ')}, and ${last}`
}

type Balloon = {
  lane: number
  y: number
  vy: number
  /** The lowercase letter a key press is compared against. */
  letter: string
}

type Burst = { lane: number; y: number; left: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'pop',

  // "pop" is unclaimed in the live registry (checked against every trigger
  // table, including the content cartridges' hundred-odd nouns), so the
  // design table's plain word stands. "balloons" is the second, evocative
  // one: `catch` already floats a 🎈 among the things it drops but claims no
  // balloon *word* and no 🎈 *trigger*, so nothing collides. Three letters
  // long, "pop" is also below the resolver's four-character floor for
  // typo-forgiveness, so it can never quietly swallow a near-miss meant for
  // another cartridge.
  triggers: { en: ['pop', 'balloons'], emoji: ['🎈'] },

  // English only, and honestly so: the whole mechanic is "press the Latin
  // letter you can see". A Hebrew-reading child gets no English balloons in
  // their `help` or their games menu — better absent than pretending.
  locales: ['en'],
  strings: { en },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: 'A-Z', label: t('pop.press') }],

  create(ctx) {
    // The live stage, learned from the canvas every frame. `tick` gets no
    // canvas, so the last drawn stage is the honest answer for it — and the
    // runtime always draws before it ticks.
    let stage = stageOf(COLS * 8, 18 * 8)
    let lanes = 0

    let balloons: Balloon[] = []
    let bursts: Burst[] = []
    // The first balloon arrives after a full beat, not instantly: a child
    // gets to see an empty sky before anything is asked of them.
    let release = RELEASE * 0.8
    // The letters that were popped, deduplicated, in the order they were
    // first popped. No count is kept anywhere — there is nothing here that
    // could turn into a score.
    const popped: string[] = []

    const clamp = (n: number, lo: number, hi: number): number =>
      Math.max(lo, Math.min(hi, n))

    /** Stage pixel of lane `i`'s CENTRE. */
    const laneX = (i: number): number => WALL + LANE * i + LANE / 2
    /** The height a balloon is released from, just inside the bottom wall. */
    const ground = (): number => stage.h - WALL - BALLOON_R * PIXEL_ASPECT - STRING_H
    /** Above this and the balloon has drifted away over the top. */
    const sky = (): number => WALL + BALLOON_R * PIXEL_ASPECT

    const sizeGrid = (): void => {
      lanes = Math.max(1, Math.floor((stage.w - WALL * 2) / LANE))
    }

    /** How many balloons this sky holds at once. Read off the live grid. */
    const inAir = (): number =>
      clamp(Math.round(lanes * IN_AIR_SHARE), IN_AIR_MIN, IN_AIR_MAX)

    const release1 = (): void => {
      // One letter at a time in the air: two identical balloons would make a
      // key press ambiguous, which is confusing rather than challenging.
      const airborne = new Set(balloons.map((b) => b.letter))
      const free = LETTER_BAG.filter((l) => !airborne.has(l))
      if (free.length === 0) return
      const takenLanes = new Set(balloons.map((b) => b.lane))
      const openLanes = Array.from({ length: lanes }, (_, i) => i)
        .filter((i) => !takenLanes.has(i))
      if (openLanes.length === 0) return
      balloons.push({
        lane: openLanes[ctx.rng.int(openLanes.length)]!,
        y: ground(),
        vy: RISE_MIN + ctx.rng.float() * (RISE_MAX - RISE_MIN),
        letter: ctx.rng.pick(free),
      })
    }

    /**
     * Re-fits to the grid the canvas actually reported: a window drag, a
     * tablet rotation, or the first frame inside a real container. Everything
     * in the air keeps its height proportionally instead of teleporting, and
     * a balloon whose lane no longer exists is walked back into one that does.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage)) return
      const oldGround = ground()
      stage = s
      sizeGrid()
      const kY = ground() / Math.max(1, oldGround)
      for (const b of balloons) {
        b.lane = clamp(b.lane, 0, lanes - 1)
        b.y = clamp(b.y * kY, sky(), ground())
      }
      for (const p of bursts) {
        p.lane = clamp(p.lane, 0, lanes - 1)
        p.y = clamp(p.y * kY, sky(), ground())
      }
      // Two balloons can land in the same lane after a shrink; the newer one
      // simply drifts away early rather than overlapping the older one.
      const seen = new Set<number>()
      balloons = balloons.filter((b) => {
        if (seen.has(b.lane)) return false
        seen.add(b.lane)
        return true
      })
    }

    sizeGrid()

    return {
      onKey(k) {
        // Only a single Latin letter means anything here. Everything else —
        // an arrow, a digit, a punctuation mark, a stray modifier — is
        // ignored in complete silence: no sound, no flash, no state change.
        // A child pressing the wrong key must never be told they pressed the
        // wrong key.
        if (k.key.length !== 1) return
        const letter = k.key.toLowerCase()
        if (!LOWER.includes(letter)) return

        // If two balloons ever wore the same letter, popping the highest one
        // is the kind thing: it is the one about to drift out of reach.
        let best: Balloon | null = null
        for (const b of balloons) if (b.letter === letter && (!best || b.y < best.y)) best = b
        if (!best) return

        const hit = best
        balloons = balloons.filter((b) => b !== hit)
        bursts.push({ lane: hit.lane, y: hit.y, left: BURST })
        if (!popped.includes(letter)) popped.push(letter)
        ctx.audio.blip()
        ctx.audio.note(720, 80)
      },

      tick(dt) {
        release -= dt
        if (release <= 0) {
          release = RELEASE
          if (balloons.length < inAir()) release1()
        }

        const top = sky()
        const still: Balloon[] = []
        for (const b of balloons) {
          b.y -= b.vy * dt
          // Over the top and away. No sound, no mark, no mention — a balloon
          // that gets away is simply gone, and the sky keeps giving.
          if (b.y < top) continue
          still.push(b)
        }
        balloons = still

        for (const p of bursts) p.left -= dt
        bursts = bursts.filter((p) => p.left > 0)
      },

      draw(c) {
        refit(c)
        c.clear()
        const ox = stage.x
        const oy = stage.y
        c.outline(ox, oy, stage.w, stage.h, INK, WALL)

        for (const b of balloons) {
          const x = ox + laneX(b.lane)
          const y = oy + clamp(b.y, sky(), ground())
          // A HOLLOW ring, so the letter inside it is readable in the very
          // same ink. Its FRACTIONAL height goes straight to the painter, so
          // the rise reads as a rise and not as a row-by-row hop.
          c.circle(x, y, BALLOON_R, INK)
          // One pixel of string, hanging straight down from the knot.
          c.rect(x, y + BALLOON_R * PIXEL_ASPECT, 1, STRING_H, INK)
          // THE LETTER. Character ops take CELL coordinates, so the pixel
          // centre is divided by the eight pixels in a cell; half a glyph
          // box (4 pixels) puts the letter's middle on the balloon's.
          c.text((x - 4) / 8, (y - 4) / 8, capital(b.letter), INK)
        }

        // The burst: one ring where the balloon was, wider than the balloon.
        // A picture, so it carries no language and says nothing about how
        // many.
        for (const p of bursts) {
          c.circle(ox + laneX(p.lane), oy + clamp(p.y, sky(), ground()),
            BALLOON_R * 1.5, INK)
        }
      },

      // Names the letters that were popped, never how many. A child who
      // opens the game and leaves gets a warm line about a full sky.
      souvenir: () => {
        if (popped.length === 0) return ctx.t('pop.souvenir.none')
        const names = popped.map(capital)
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('pop.souvenir.more')]
          : names
        return ctx.t('pop.souvenir', { list: joinNamed(shown) })
      },
    }
  },
}

export default cartridge
