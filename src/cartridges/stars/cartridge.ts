import type { CanvasLike, LiveCartridge } from '../../types'
import { sameStage, stageOf } from '../stage'
import en from './en.json'
import he from './he.json'

// The sky's DESIGN size: 30 columns at its narrowest and, at that width,
// exactly as wide as it is tall. Rows follow from the aspect (18 of them);
// extra columns follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 window on space needs on a desktop. See `stageOf` in
// `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain` — the theme's own foreground, so the sky re-tints with the
// theme and can never clash with it. This is the game where that constraint
// pays for itself twice over: depth used to be three different tones, and
// three tones on a black field read as confetti. Depth is SIZE now, which is
// what distance actually looks like.
const INK = 'plain' as const
/** The porthole rail. A window on space has an edge; the pillarbox needs one. */
const WALL = 3

/**
 * A star at each depth, far to near, as a block of pixels. The LAST one is
 * the closest, which is what `stars.test.ts` leans on when it checks that
 * near stars really do outrun — and outgrow — far ones.
 *
 * Each is roughly square ON SCREEN: a logical pixel is 0.6 as wide as it is
 * tall, so 2 x 1, 4 x 2 and 7 x 4 all read as dots rather than as dashes.
 */
export const STAR_SIZES = [
  { w: 2, h: 1 },
  { w: 4, h: 2 },
  { w: 7, h: 4 },
] as const

/** The moon: a crescent, which is the one moon shape nothing else looks like. */
const MOON = [
  '    ####   ',
  '  ####     ',
  ' ####      ',
  ' ###       ',
  ' ###       ',
  ' ###       ',
  ' ####      ',
  '  ####     ',
  '    ####   ',
]

/** A planet with a ring — and the ring is the whole point, so it runs the
 *  full width of the bitmap and out past the planet on both sides. */
const PLANET = [
  '     #####     ',
  '    #######    ',
  '   #########   ',
  '###############',
  '   #########   ',
  '    #######    ',
  '     #####     ',
]

/** A comet: a round head on the right with three streaks trailing behind. */
const COMET = [
  '         ### ',
  '    ### #####',
  '####### #####',
  '   #### #####',
  '         ### ',
]

/** A flying saucer: a dome, a brim wider than everything else, three beams. */
const SAUCER = [
  '    #####    ',
  '   #######   ',
  '  ##  #  ##  ',
  '#############',
  ' ########### ',
  '   #  #  #   ',
  '   #     #   ',
]

/**
 * The rare something that floats past. `id` is what the souvenir names, so
 * each bitmap has to be recognisable as the thing its sentence claims —
 * "a planet with a ring" is a promise about a picture.
 */
export const DRIFTERS = [
  { id: 'moon', art: MOON },
  { id: 'planet', art: PLANET },
  { id: 'comet', art: COMET },
  { id: 'saucer', art: SAUCER },
] as const

/** Depth units per second the sky flows past. */
const SPEED = 0.34
/** Nearest a star comes before it is behind us and recycled. */
const Z_NEAR = 0.22
/** Where a fresh star is born. */
const Z_FAR = 1
/** How far off centre a star at the far plane may sit, as a fraction of the stage. */
const SPREAD = 0.3
/** Depth units per second the drifter closes in — much slower than the stars. */
const DRIFT_SPEED = 0.16
/** Steering nudge, in world units, per key press. */
const STEER = 0.22
/** Steering never runs away. */
const MAX_STEER = 0.8
/** Steering eases back toward straight-and-level over a few seconds. */
const EASE = 0.35

type Star = { x: number; y: number; z: number }
type Drifter = { id: string; art: readonly string[]; x: number; y: number; z: number }

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

const artW = (rows: readonly string[]): number =>
  Math.max(...rows.map((r) => r.length))

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'stars',
  // Checked against the live registry before choosing: unlike "fish", nothing
  // claims "stars", "כוכבים" or 🌌 — `colors` owns the colour words, `animals`
  // the creatures, and neither reaches into the sky. So the starfield keeps
  // the plain noun, and "starfield" comes along as the word an older child
  // might reach for.
  triggers: {
    en: ['stars', 'starfield'],
    he: ['כוכבים'],
    emoji: ['🌌'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('stars.steer') }],

  create(ctx) {
    // The live stage, learned from the canvas on the first draw and refreshed
    // on every one after it. `tick` gets no canvas, so the last drawn stage is
    // the honest answer for it — and a draw always precedes the first tick.
    let stage = stageOf(COLS * 8, 18 * 8)
    let W = stage.w
    let H = stage.h

    let clock = 0
    const stars: Star[] = []
    let drifter: Drifter | null = null
    let nextDrift = 0

    // What the souvenir names. A flag and a name, never a tally.
    let steered = false
    let seen: string | null = null

    // Steering is a lateral velocity through the star field, in world units.
    // Because a star's screen position is x/z, the same world-space nudge
    // sweeps a near star across the whole sky and barely stirs a far one —
    // the parallax is a property of the projection, not a special case.
    let steerX = 0
    let steerY = 0

    // ---- projection: world units in, STAGE PIXELS out --------------------

    const px = (s: { x: number; z: number }): number =>
      W / 2 + (s.x / s.z) * W * SPREAD
    const py = (s: { y: number; z: number }): number =>
      H / 2 + (s.y / s.z) * H * SPREAD

    /** Depth band, far to near — the index into `STAR_SIZES`. The bands are
     *  deliberately uneven, not thirds of the range: an even split put most of
     *  the sky in the middle band and the result read as confetti. Far specks
     *  have to outnumber near ones for the field to look like distance. */
    const bandOf = (z: number): number => (z > 0.6 ? 0 : z > 0.36 ? 1 : 2)

    const onStage = (s: Star, pad = 0): boolean => {
      const size = STAR_SIZES[bandOf(s.z)]!
      const x = px(s)
      const y = py(s)
      const mx = WALL + size.w / 2 + pad
      const my = WALL + size.h / 2 + pad
      return x >= mx && x <= W - mx && y >= my && y <= H - my
    }

    /** A brand new star at the far plane, always inside the visible sky. */
    const bornFar = (s: Star): void => {
      s.z = Z_FAR
      s.x = (ctx.rng.float() * 2 - 1) * 0.95
      s.y = (ctx.rng.float() * 2 - 1) * 0.95
    }

    // A pixel field is 64 logical pixels to a character cell, and the density
    // that looked right on the character grid was a tenth of the cells.
    const wantStars = (): number => clamp(Math.round((W * H) / 640), 24, 300)

    /**
     * Everything the painter is handed has to be inside the stage — the model
     * and the canvas clip at slightly different places, so a star half a block
     * off the edge could pass a snapshot and still be drawn over the rail.
     * This is the single place that guarantees it, and it runs after every
     * move and after every resize.
     */
    const recycle = (): void => {
      for (const s of stars) {
        if (s.z <= Z_NEAR || !onStage(s)) bornFar(s)
      }
    }

    const stock = (): void => {
      while (stars.length > wantStars()) stars.pop()
      while (stars.length < wantStars()) {
        const s: Star = { x: 0, y: 0, z: Z_FAR }
        bornFar(s)
        // Scatter the first sky through every depth, or the child watches an
        // empty sky fill up for two seconds before anything is close.
        s.z = Z_NEAR + ctx.rng.float() * (Z_FAR - Z_NEAR)
        stars.push(s)
      }
      recycle()
    }

    /**
     * Re-fits to the live stage: a window drag, a tablet rotation, or simply
     * the first frame inside a real container. Star positions are held in
     * WORLD units, so a resize needs no rescaling at all — only the star count
     * changes, and anything the new stage no longer contains is reborn far
     * away rather than left hanging over the rail.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage) && stars.length > 0) return
      stage = s
      W = s.w
      H = s.h
      stock()
      if (drifter && !driftOn(drifter)) drifter = null
    }

    /** The drifter's own size grows as it closes in, so it arrives rather
     *  than merely appearing: distance is size here, exactly as for a star. */
    const driftScale = (d: Drifter): number =>
      d.z < 0.55 ? 4 : d.z < 0.95 ? 3 : 2
    const driftOn = (d: Drifter): boolean => {
      const s = driftScale(d)
      const w = artW(d.art) * s
      const h = d.art.length * s
      const x = px(d)
      const y = py(d)
      return x - w / 2 >= WALL && x + w / 2 <= W - WALL
        && y - h / 2 >= WALL && y + h / 2 <= H - WALL
    }

    stock()
    nextDrift = 2.5 + ctx.rng.float() * 2

    const launchDrifter = (): void => {
      const kind = ctx.rng.pick(DRIFTERS)
      drifter = {
        id: kind.id,
        art: kind.art,
        // Kept well inside the cone so it stays on screen long enough to be
        // seen properly before it sweeps past.
        x: (ctx.rng.float() * 2 - 1) * 0.4,
        y: (ctx.rng.float() * 2 - 1) * 0.4,
        z: 1.6,
      }
    }

    return {
      onKey(k) {
        // Physical coordinates: left is screen-left in every language, so
        // nothing here ever looks at ctx.dir or ctx.locale. Pressing left
        // sweeps the whole sky to the left, which is what a child expects an
        // arrow to do — near stars sweep far more than distant ones, and that
        // difference is the depth.
        if (k.key === 'ArrowLeft') steerX = clamp(steerX - STEER, -MAX_STEER, MAX_STEER)
        else if (k.key === 'ArrowRight') steerX = clamp(steerX + STEER, -MAX_STEER, MAX_STEER)
        else if (k.key === 'ArrowUp') steerY = clamp(steerY - STEER, -MAX_STEER, MAX_STEER)
        else if (k.key === 'ArrowDown') steerY = clamp(steerY + STEER, -MAX_STEER, MAX_STEER)
        else return
        steered = true
        ctx.audio.blip()
      },

      tick(dt) {
        clock += dt

        for (const s of stars) {
          s.z -= SPEED * dt
          s.x += steerX * dt
          s.y += steerY * dt
        }
        recycle()

        // Steering eases back to straight flight on its own, so a child who
        // lets go glides rather than veering forever.
        const k = Math.exp(-EASE * dt)
        steerX *= k
        steerY *= k

        if (drifter) {
          drifter.z -= DRIFT_SPEED * dt
          drifter.x += steerX * dt * 0.6
          drifter.y += steerY * dt * 0.6
          if (drifter.z <= 0.25 || !driftOn(drifter)) {
            // It swept past us. That is the whole event, and it is what the
            // souvenir remembers — which one, never how many.
            seen = drifter.id
            drifter = null
            nextDrift = clock + 7 + ctx.rng.float() * 7
          }
        } else if (clock >= nextDrift) {
          launchDrifter()
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x: ox, y: oy } = stage

        // The porthole: one HOLLOW rectangle. Hollow is what makes it read as
        // the window rather than as something out there.
        c.outline(ox, oy, W, H, INK, WALL)

        // Every star, at its raw fractional position — this is the whole
        // reason the flight reads as continuous instead of as a slide show.
        // A near star is a big block and a far one is a speck: in one ink,
        // SIZE is the only honest way to draw distance.
        for (const s of stars) {
          const size = STAR_SIZES[bandOf(s.z)]!
          c.rect(ox + px(s) - size.w / 2, oy + py(s) - size.h / 2,
            size.w, size.h, INK)
        }

        if (drifter && drifter.z <= 1.15) {
          const s = driftScale(drifter)
          c.sprite(
            ox + px(drifter) - (artW(drifter.art) * s) / 2,
            oy + py(drifter) - (drifter.art.length * s) / 2,
            drifter.art, INK, { scale: s },
          )
        }
      },

      // Names what happened out there, never how much of it. A child who
      // opens the sky and flies nowhere still gets a warm line about it.
      souvenir: () =>
        seen !== null
          ? ctx.t('stars.souvenir.past', { thing: ctx.t(`stars.thing.${seen}`) })
          : steered ? ctx.t('stars.souvenir.flew')
            : ctx.t('stars.souvenir.none'),
    }
  },
}

export default cartridge
