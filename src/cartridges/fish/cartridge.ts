import type { CanvasLike, LiveCartridge } from '../../types'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'
import en from './en.json'
import he from './he.json'

// The tank's DESIGN size: 30 columns at its narrowest and, at that width,
// exactly as wide as it is tall. Rows follow from the aspect (18 of them);
// extra columns follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 4:3 tank needs on a desktop. See `stageOf` in `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain` — the theme's own foreground, so the tank re-tints with
// the theme and can never clash with it. Nothing here is told apart by
// colour, and everything is told apart by FILL and SIZE:
//
//   the glass       HOLLOW — it is the world, not a thing in it
//   a fish          SOLID, and a big one is near while a small one is far
//   a bubble        a RING — hollow, so it is never mistaken for food
//   a crumb         a small SOLID flake — the only thing a fish chases
//   the feeder      a solid wedge on the rail, pointing at where food lands
const INK = 'plain' as const
const WALL = 3    // the glass, in pixels
const BED = 5     // the gravel, in pixels

/**
 * One fish. Deliberately a SPRITE and not the emoji it used to be: an emoji
 * is a full-colour image that no tone can re-tint, so on a one-ink field it
 * would be the only colour on screen. 13 x 7 source pixels, drawn at scale 1
 * or 2 — see `SWIMMERS`.
 *
 * Three holes do all the describing, which is the whole trick of drawing in
 * one ink: the notch between the tail and the body, the single gap near the
 * nose that is an eye, and the narrower top and bottom rows that turn a
 * rectangle into an oval. An earlier version had a fatter tail and a blunter
 * body and read as a little machine rather than as a fish.
 */
export const FISH = [
  '      #####  ',
  '##   ########',
  '###  ###### #',
  '#############',
  '###  ########',
  '##   ########',
  '      #####  ',
]

/**
 * A weed, standing on the gravel. Scenery, and the only curve in the tank.
 * Chunky on purpose: at one pixel a stroke it read as a scratch on the glass
 * rather than as a plant.
 */
const WEED = [
  '    ###   ',
  '##  ###   ',
  '###  ###  ',
  ' ###  ### ',
  '  ###  ###',
  '   ###  ##',
  '   ###    ',
  '   ###    ',
  '   ###    ',
  '   ###    ',
  '  #####   ',
]

/** The feeder on the rail: a wedge that points at where the food will land. */
const FEEDER = [
  '#####',
  ' ### ',
  '  #  ',
]

/**
 * The tank's residents. Speed is PIXELS PER SECOND and `scale` is depth: a
 * near fish is drawn at double size and swims quickly, a far one is small and
 * slow. That is the same trick `stars` uses — in one ink, size IS distance —
 * and it replaces the six different emoji, which said nothing about depth.
 */
export const SWIMMERS = [
  { speed: 34, scale: 2 },
  { speed: 27, scale: 2 },
  { speed: 21, scale: 2 },
  { speed: 14, scale: 1 },
  { speed: 11, scale: 1 },
  { speed: 9, scale: 1 },
] as const

/** The fish bitmap's own size. A scale-2 fish is twice this, so `FISH_H` is
 *  also the half-height of the biggest fish in the tank. */
const FISH_W = 13
const FISH_H = 7
/** The feeder wedge, drawn at scale 2: 10 x 6 pixels on the rail. */
const FEEDER_W = 10
const FEEDER_H = 6

/** Pixels per second a crumb sinks. Slow: watching it fall is half the point. */
const SINK = 16
/**
 * How far a fish can notice a crumb, in pixels. Deliberately a fixed distance
 * rather than a fraction of the tank: scaled to the width, every fish in a
 * wide tank noticed every crumb at once and swarmed it before a child could
 * watch a single flake fall.
 */
const NOTICE = 128
/**
 * How much faster a fish swims when it has noticed food. Exactly 1: a fish
 * that has seen a crumb changes HEADING, it does not put on a burst of speed.
 * At 1.5 the tank read as a feeding frenzy and a flake was gone before a
 * child could watch it fall.
 */
const CHASE = 1
/** Pixels per second a fish rises or dives, chasing or settling. */
const VSPEED = 13
/** A fish this close to a crumb has eaten it. */
const BITE = 7
/** More crumbs than this and the oldest is simply forgotten. */
const MAX_FOOD = 10
/**
 * Seconds a crumb rests on the gravel before it dissolves. Without this a
 * settled crumb is a permanent attractor and the whole shoal ends up living
 * on the tank floor — which is exactly what the first version looked like.
 */
const SETTLED_LIFE = 7

type Fish = {
  /** Stage pixels, fractional — this is what makes the drift continuous.
   *  `x`/`y` are the fish's CENTRE, so its size never shifts where it is. */
  x: number
  y: number
  /** Swim height it settles back to, as a fraction of the swimmable band, so
   *  a resize re-derives the depth instead of stranding the fish. */
  home: number
  dir: 1 | -1
  speed: number
  scale: number
  bobAmp: number
  bobFreq: number
  bobPhase: number
}

type Crumb = { x: number; y: number; settled: boolean; rest: number }
type Bubble = { x: number; y: number; speed: number }
/** Where a weed stands, as a fraction of the tank's width. */
type Weed = { at: number; scale: number }

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'fish',
  // DEVIATION from the design table, and the same ruling `snake` already
  // took: `animals` claims "fish", "דג" and 🐟 (a fish is one of its
  // animals), and two cartridges may not share a trigger — the registry test
  // fails the build if they do, and the resolver would hand every one of them
  // to `animals` anyway. The plain noun therefore stays with the content
  // cartridge and the tank answers to the place rather than the creature:
  // "aquarium" / "fishtank", the Hebrew plural "דגים" (fish, plural — `דג` is
  // still the animal), and the tropical fish 🐠, which nothing else claims.
  triggers: {
    en: ['aquarium', 'fishtank'],
    he: ['אקווריום', 'דגים'],
    emoji: ['🐠'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('fish.feed') }],

  create(ctx) {
    // The live stage, learned from the canvas on the first draw and refreshed
    // on every one after it. `tick` gets no canvas, so the last drawn stage is
    // the honest answer for it — and a draw always precedes the first tick.
    let stage = stageOf(COLS * 8, 18 * 8)
    let W = stage.w
    let H = stage.h

    let clock = 0
    let feeder = W / 2
    const fish: Fish[] = []
    const food: Crumb[] = []
    const bubbles: Bubble[] = []
    const weeds: Weed[] = []

    // What the souvenir names. Deliberately two flags rather than two
    // counters: there is nothing here that could ever turn into a score.
    let sprinkled = false
    let eaten = false

    // ---- the tank's geometry, all of it derived from the live stage ------

    /** Topmost pixel a fish's centre may reach: clear of the feeder above it,
     *  and half a big fish below that, so nothing ever clips the rail. */
    const skyY = (): number => WALL + FEEDER_H + FISH_H
    /** The top of the gravel. */
    const bedY = (): number => H - WALL - BED
    /** Bottom pixel a fish's centre may reach. */
    const floorY = (): number => Math.max(skyY(), bedY() - FISH_H)
    const bandOf = (home: number): number =>
      skyY() + home * (floorY() - skyY())
    /** Leftmost / rightmost a fish of this size may take its centre. */
    const swimLo = (f: Fish): number => WALL + (FISH_W * f.scale) / 2
    const swimHi = (f: Fish): number =>
      Math.max(swimLo(f), W - WALL - (FISH_W * f.scale) / 2)
    /** Leftmost / rightmost the feeder may sit without overhanging the glass. */
    const feedLo = (): number => WALL + FEEDER_W / 2
    const feedHi = (): number => Math.max(feedLo(), W - WALL - FEEDER_W / 2)

    // A wider tank is a bigger tank, so it gets more of everything — a 640 px
    // screen with four fish in it reads as an empty aquarium.
    const wantFish = (): number => clamp(Math.floor(W / 44), 4, 14)
    const wantBubbles = (): number => clamp(Math.floor(W / 60), 3, 8)
    const wantWeeds = (): number => clamp(Math.floor(W / 110), 2, 6)

    const newFish = (): Fish => {
      const kind = ctx.rng.pick(SWIMMERS)
      return {
        x: W / 2,
        y: 0,
        home: ctx.rng.float(),
        dir: ctx.rng.chance(0.5) ? 1 : -1,
        // Depth reads as speed AND as size: each kind has its own pace,
        // jittered a little so two of the same fish never swim in lockstep.
        speed: kind.speed * (0.75 + ctx.rng.float() * 0.5),
        scale: kind.scale,
        bobAmp: 2 + ctx.rng.float() * 4,
        bobFreq: 0.5 + ctx.rng.float() * 0.9,
        bobPhase: ctx.rng.float() * 6.283,
      }
    }

    const stock = (): void => {
      while (fish.length > wantFish()) fish.pop()
      while (fish.length < wantFish()) {
        const f = newFish()
        f.x = swimLo(f) + ctx.rng.float() * (swimHi(f) - swimLo(f))
        f.y = bandOf(f.home)
        fish.push(f)
      }
      // Kept sorted small-and-slow first, so an overlap always reads as the
      // near fish passing in FRONT of the far one.
      fish.sort((a, b) => a.speed - b.speed)
      while (bubbles.length > wantBubbles()) bubbles.pop()
      while (bubbles.length < wantBubbles()) {
        bubbles.push({
          x: WALL + 4 + ctx.rng.float() * Math.max(1, W - 2 * WALL - 8),
          y: skyY() + ctx.rng.float() * Math.max(1, bedY() - skyY()),
          speed: 8 + ctx.rng.float() * 14,
        })
      }
      while (weeds.length > wantWeeds()) weeds.pop()
      while (weeds.length < wantWeeds()) {
        weeds.push({ at: ctx.rng.float(), scale: ctx.rng.chance(0.5) ? 3 : 2 })
      }
    }

    /**
     * Re-fits everything that depends on the stage: a window drag, a tablet
     * rotation, or simply the first frame inside a real container. Horizontal
     * positions are carried across PROPORTIONALLY (a fish two thirds of the
     * way across stays two thirds of the way across) and swim heights are
     * re-derived from each fish's `home` fraction, so a resize never strands
     * anything against the glass.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage) && fish.length > 0) return
      const oldW = W
      stage = s
      W = s.w
      H = s.h
      const k = W / Math.max(1, oldW)
      // Nothing sprinkled yet, so there is nothing to preserve: put the feeder
      // in the middle of the tank a child was ACTUALLY given.
      feeder = clamp(sprinkled ? feeder * k : W / 2, feedLo(), feedHi())
      for (const f of fish) {
        f.x = clamp(f.x * k, swimLo(f), swimHi(f))
        f.y = clamp(f.y, skyY(), floorY())
      }
      for (const b of bubbles) {
        b.x = clamp(b.x * k, WALL + 2, W - WALL - 2)
        b.y = clamp(b.y, skyY(), bedY())
      }
      for (const p of food) {
        p.x = clamp(p.x * k, WALL + 2, W - WALL - 2)
        p.y = clamp(p.y, WALL, bedY() - 2)
      }
      stock()
    }

    // Stock the tank immediately rather than waiting for the first draw: the
    // runtime always draws before it ticks, but a cartridge that falls apart
    // when called in another order is a trap for the next host.
    stock()

    const sprinkle = (): void => {
      sprinkled = true
      const x = clamp(feeder + (ctx.rng.float() - 0.5) * 3, WALL + 2, W - WALL - 2)
      food.push({ x, y: WALL + FISH_H, settled: false, rest: 0 })
      while (food.length > MAX_FOOD) food.shift()
      ctx.audio.blip()
    }

    /** The crumb a fish is closest to, or null when nothing is worth a swim. */
    const noticed = (f: Fish): Crumb | null => {
      let best: Crumb | null = null
      let bestD = NOTICE
      for (const p of food) {
        // A logical pixel is taller than it is wide, so a vertical pixel is
        // further away than a horizontal one. 1.6 is that ratio: this is
        // SCREEN distance, which is the distance a fish would judge.
        const d = Math.hypot(p.x - f.x, (p.y - f.y) / PIXEL_ASPECT * 0.96)
        if (d < bestD) { best = p; bestD = d }
      }
      return best
    }

    return {
      onKey(k) {
        // Physical coordinates: left is screen-left in every language, so
        // nothing here ever looks at ctx.dir or ctx.locale. Every arrow drops
        // a crumb, so a child mashing keys always gets something; left and
        // right also carry the feeder along the rail.
        if (k.key === 'ArrowLeft') feeder = clamp(feeder - 12, feedLo(), feedHi())
        else if (k.key === 'ArrowRight') feeder = clamp(feeder + 12, feedLo(), feedHi())
        else if (k.key !== 'ArrowUp' && k.key !== 'ArrowDown') return
        sprinkle()
      },

      tick(dt) {
        clock += dt

        // Crumbs sink, rest on the gravel a while, and then dissolve.
        for (let i = food.length - 1; i >= 0; i--) {
          const p = food[i]!
          if (p.settled) {
            p.rest += dt
            if (p.rest > SETTLED_LIFE) food.splice(i, 1)
            continue
          }
          p.y += SINK * dt
          if (p.y >= bedY() - 2) { p.y = bedY() - 2; p.settled = true }
        }

        for (const f of fish) {
          const crumb = noticed(f)
          if (crumb) {
            const dx = crumb.x - f.x
            const dy = crumb.y - f.y
            if (Math.abs(dx) > 0.4) f.dir = dx > 0 ? 1 : -1
            const step = f.speed * CHASE * dt
            f.x += Math.sign(dx) * Math.min(Math.abs(dx), step)
            f.y += Math.sign(dy) * Math.min(Math.abs(dy), VSPEED * dt)
            if (Math.hypot(dx, dy) < BITE) {
              const i = food.indexOf(crumb)
              if (i >= 0) food.splice(i, 1)
              eaten = true
              ctx.audio.note(620 + f.speed * 4, 60)
            }
          } else {
            f.x += f.dir * f.speed * dt
            // Ease back to the depth this fish likes to live at.
            const home = bandOf(f.home)
            f.y += clamp(home - f.y, -8, 8) * VSPEED * 0.075 * dt
          }

          // The glass. A fish simply turns around: nothing is ever lost and
          // nothing ever leaves the tank.
          if (f.x <= swimLo(f)) { f.x = swimLo(f); f.dir = 1 }
          if (f.x >= swimHi(f)) { f.x = swimHi(f); f.dir = -1 }
          f.y = clamp(f.y, skyY(), floorY())
        }

        for (const b of bubbles) {
          b.y -= b.speed * dt
          if (b.y < skyY()) {
            b.y = bedY() - 2
            b.x = WALL + 4 + ctx.rng.float() * Math.max(1, W - 2 * WALL - 8)
            b.speed = 8 + ctx.rng.float() * 14
          }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x, y } = stage

        // The glass: one HOLLOW rectangle, filling the stage. Whole
        // coordinates, so it snaps to whole device pixels and stays crisp.
        c.outline(x, y, W, H, INK, WALL)
        // The gravel: a flat solid bed along the bottom.
        c.rect(x + WALL, y + bedY(), Math.max(0, W - 2 * WALL), BED, INK)

        // Weeds, standing on the gravel.
        for (const p of weeds) {
          const wx = clamp(
            WALL + 6 + p.at * Math.max(1, W - 2 * WALL - 12),
            WALL, Math.max(WALL, W - WALL - WEED[0]!.length * p.scale),
          )
          c.sprite(x + Math.round(wx), y + bedY() - WEED.length * p.scale, WEED,
            INK, { scale: p.scale })
        }

        // Bubbles: rings, so they can never be mistaken for food.
        for (const b of bubbles) c.circle(x + b.x, y + b.y, 2, INK)

        // The shoal, far and slow first so a near fish passes in front.
        for (const f of fish) {
          const bob = f.bobAmp * Math.sin(clock * f.bobFreq + f.bobPhase)
          const fy = clamp(f.y + bob, skyY(), floorY())
          // Fractional positions go straight through to the painter: that is
          // what keeps the drift smooth at any speed. One bitmap, both ways
          // round — `flipX` mirrors the fish that swims left.
          c.sprite(
            x + f.x - (FISH_W * f.scale) / 2,
            y + fy - (FISH_H * f.scale) / 2,
            FISH, INK, { scale: f.scale, flipX: f.dir < 0 },
          )
        }

        // Food last: a crumb in front of a fish is still a crumb, whereas a
        // crumb behind one has simply vanished.
        for (const p of food) c.rect(x + p.x - 1.5, y + p.y - 1, 3, 2, INK)

        // The feeder, riding the top rail: a wedge pointing at where the next
        // crumb will land. It says "food comes from here" without a word.
        c.sprite(x + Math.round(feeder) - FEEDER_W / 2, y + WALL, FEEDER, INK,
          { scale: 2 })
      },

      // Names what happened, never how much of it. A child who opens the tank
      // and leaves gets a warm line about quiet fish, not a bare zero.
      souvenir: () =>
        eaten ? ctx.t('fish.souvenir.happy')
          : sprinkled ? ctx.t('fish.souvenir.fed')
            : ctx.t('fish.souvenir.none'),
    }
  },
}

export default cartridge
