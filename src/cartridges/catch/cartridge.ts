import type { CanvasLike, Locale, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { sameStage, stageOf } from '../stage'

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
// ONE INK, `plain` — the theme's own foreground. Nothing here is told apart
// by colour: the sky's wall is HOLLOW, the basket is an open U (the thing the
// child holds), and each falling thing is a small solid bitmap of ITSELF.
const INK = 'plain' as const
const WALL = 3
/** Every bitmap below is 13 x 8, drawn at DOUBLE size: one source pixel
 *  becomes a 2 x 2 block, which is both bigger for a 6-year-old to see and
 *  unmistakably pixel art rather than a shrunken icon. */
const ITEM_SCALE = 2
const ITEM_W = 13 * ITEM_SCALE
const ITEM_H = 8 * ITEM_SCALE
/** A lane is one thing plus air either side. */
const LANE = 34
/** The basket: an open box, wide enough to be forgiving and wider than the
 *  things it catches. */
const BASKET_W = 54
const BASKET_H = 16
const BASKET_T = 3

/** Seconds between two things being dropped. Unhurried on purpose — and
 *  slower than it was: a sky that keeps handing out gifts faster than a
 *  6-year-old can walk under them is a treadmill, not a game. */
const DROP = 1.9
/** At most this many things in the air at once, so the sky never crowds. */
const IN_AIR = 2
/** Pixels per second. A thing takes 5-7 seconds to cross a 144-pixel sky. */
const FALL_MIN = 21
const FALL_MAX = 30
/** Seconds the ring sits over the basket after a catch. */
const CHEER = 0.5
/** How many names the souvenir spells out before it says "and more". */
const NAME_CAP = 4

/**
 * WHAT FALLS, AS PICTURES.
 *
 * These were emoji. Emoji are full-colour images that no tone can re-tint, so
 * on a one-ink field they would be the only colour on screen — they would
 * break the palette AND the flat-fill look in the same stroke. And a plain
 * disc for everything was not an option either: the souvenir NAMES what was
 * caught ("you caught a star and a cake!"), so a child has to have actually
 * seen a star and a cake. Hence ten small bitmaps, one ink, thirteen pixels
 * across — about the size of a thumbnail on screen, which is as small as a
 * shape can get and still say what it is.
 *
 * Each carries the id of the translation key that NAMES it — what happened,
 * never how many times it happened.
 */
const STAR = [
  '      #      ',
  '     ###     ',
  '#############',
  ' ########### ',
  '   #######   ',
  '  ###   ###  ',
  ' ###     ### ',
  '##         ##',
]
const CAKE = [
  '      #      ',
  '      #      ',
  '  #########  ',
  ' ########### ',
  ' #         # ',
  ' ########### ',
  ' #         # ',
  ' ########### ',
]
const APPLE = [
  '     ##      ',
  '    ##       ',
  '  #########  ',
  ' ########### ',
  '#############',
  '#############',
  ' ########### ',
  '  ###   ###  ',
]
const BALLOON = [
  '   #######   ',
  '  #########  ',
  ' ########### ',
  ' ########### ',
  '  #########  ',
  '    #####    ',
  '      #      ',
  '     # #     ',
]
const GIFT = [
  '  ##     ##  ',
  '   ##   ##   ',
  '#############',
  '#############',
  '#####   #####',
  '#####   #####',
  '#####   #####',
  '#####   #####',
]
const BLOSSOM = [
  '  ###   ###  ',
  ' ########### ',
  '#############',
  '#####   #####',
  '#####   #####',
  '#############',
  ' ########### ',
  '  ###   ###  ',
]
const BANANA = [
  '         ##  ',
  '       ####  ',
  '     ####    ',
  '   ####      ',
  '  ####       ',
  '  ####       ',
  '   #####     ',
  '     #####   ',
]
const FISH = [
  '   ####    # ',
  '  ###### ### ',
  ' ############',
  '#############',
  '#############',
  ' ############',
  '  ###### ### ',
  '   ####    # ',
]
const MOON = [
  '    #####    ',
  '  #########  ',
  ' ######      ',
  '#####        ',
  '#####        ',
  ' ######      ',
  '  #########  ',
  '    #####    ',
]
const COOKIE = [
  '   #######   ',
  ' ##### ##### ',
  '#############',
  '#### ####  ##',
  '#############',
  '## ##### ####',
  ' ########### ',
  '   #######   ',
]

export const ITEMS = [
  { art: STAR, id: 'star' },
  { art: CAKE, id: 'cake' },
  { art: APPLE, id: 'apple' },
  { art: BALLOON, id: 'balloon' },
  { art: GIFT, id: 'gift' },
  { art: BLOSSOM, id: 'blossom' },
  { art: BANANA, id: 'banana' },
  { art: FISH, id: 'fish' },
  { art: MOON, id: 'moon' },
  { art: COOKIE, id: 'cookie' },
] as const

/**
 * Joins named things the way a person says them aloud. Same idiom as
 * `memory`, including the correction made there: the conjunction is added
 * HERE and only here. Hebrew's "and" is the prefix ו glued to the next word,
 * never a standalone token and never preceded by its own comma — and the
 * overflow marker (`catch.souvenir.more`) is therefore the bare word "more" /
 * "עוד", so a capped list cannot come out as "and and more" / "וועוד".
 */
export function joinNamed(names: string[], locale: Locale): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  const head = names.slice(0, -1)
  const last = names[names.length - 1]!
  if (locale === 'he') return `${head.join(', ')} ו${last}`
  return names.length === 2 ? `${names[0]} and ${last}` : `${head.join(', ')}, and ${last}`
}

type Falling = { lane: number; y: number; vy: number; art: readonly string[]; id: string }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'catch',
  triggers: { en: ['catch', 'basket'], he: ['תפוס'], emoji: ['🧺'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '← →', label: t('catch.move') }],

  create(ctx) {
    // The live stage, learned from the canvas every frame. `tick` gets no
    // canvas, so the last drawn stage is the honest answer for it.
    let stage = stageOf(COLS * 8, 18 * 8)

    // Things fall down a lattice of lanes; everything simulated below is in
    // STAGE coordinates and the offset is added once, in `draw`.
    let lanes = 0

    // The basket lives on the same lattice the things fall down, so lining it
    // up is exact rather than approximate: one key press is one lane.
    let basket = 0
    let items: Falling[] = []
    // The first thing arrives after a full beat, not instantly: a child gets
    // to see an empty sky and their own basket before anything is asked.
    let drop = DROP * 0.8
    let cheer = 0
    // The NAMES of what was caught, deduplicated, in the order they first
    // arrived. No count is kept anywhere: there is nothing here to score.
    const caught: string[] = []

    const clamp = (n: number, lo: number, hi: number): number =>
      Math.max(lo, Math.min(hi, n))

    /** Centre of lane `i`, in stage pixels. The lattice is centred in the sky
     *  so a board that does not divide evenly has equal air on both sides. */
    const laneX = (i: number): number =>
      (stage.w - lanes * LANE) / 2 + LANE * i + LANE / 2
    /** Top of the basket: the height at which a thing is caught or gone. */
    const rim = (): number => stage.h - WALL - BASKET_H - 4
    /** Where the basket's mouth is, in stage pixels. */
    const basketX = (): number => laneX(basket)

    const sizeGrid = (): void => {
      lanes = Math.max(2, Math.floor((stage.w - WALL * 2) / LANE))
    }

    const spawn = (): void => {
      const kind = ITEMS[ctx.rng.int(ITEMS.length)]!
      // Never two things down one lane: stacked, they read as one tall
      // thing, and a child who lines the basket up gets both at once.
      const taken = new Set(items.map((i) => i.lane))
      const open = Array.from({ length: lanes }, (_, i) => i)
        .filter((i) => !taken.has(i))
      if (open.length === 0) return
      items.push({
        lane: open[ctx.rng.int(open.length)]!,
        y: WALL + ITEM_H / 2,
        vy: FALL_MIN + ctx.rng.float() * (FALL_MAX - FALL_MIN),
        art: kind.art,
        id: kind.id,
      })
    }

    /**
     * Re-fits to the stage the canvas actually reported: a window drag, a
     * tablet rotation, or the first frame in a real container. Everything in
     * the air keeps its position proportionally instead of teleporting.
     */
    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (sameStage(s, stage)) return
      const oldLanes = Math.max(1, lanes)
      const oldRim = rim()
      stage = s
      sizeGrid()
      // Everything keeps its PLACE in the lattice, proportionally, rather
      // than its pixel position: a narrower sky has fewer lanes, and a thing
      // in the last one belongs in the last one still.
      const k = lanes / oldLanes
      basket = clamp(Math.round(basket * k), 0, lanes - 1)
      const kY = rim() / Math.max(1, oldRim)
      for (const it of items) {
        it.lane = clamp(Math.round(it.lane * k), 0, lanes - 1)
        it.y = clamp(it.y * kY, WALL, rim())
      }
    }

    sizeGrid()
    basket = Math.floor(lanes / 2)

    return {
      onKey(k) {
        // Physical coordinates: left is screen-left in every language.
        if (k.key === 'ArrowLeft') basket = clamp(basket - 1, 0, lanes - 1)
        if (k.key === 'ArrowRight') basket = clamp(basket + 1, 0, lanes - 1)
      },

      tick(dt) {
        if (cheer > 0) cheer = Math.max(0, cheer - dt)

        drop -= dt
        if (drop <= 0) {
          drop = DROP
          if (items.length < IN_AIR) spawn()
        }

        const r = rim()
        const still: Falling[] = []
        for (const it of items) {
          it.y += it.vy * dt
          // Same lane means caught. Both the basket and the things live on
          // the lattice, so lining up is exact — a child who gets the basket
          // under a thing catches it, every time.
          const overlaps = it.lane === basket
          if (it.y >= r - 3 && overlaps) {
            if (!caught.includes(it.id)) caught.push(it.id)
            ctx.audio.note(660, 90)
            ctx.audio.note(880, 90)
            cheer = CHEER
            continue
          }
          if (it.y > r) {
            // A miss is a soft bonk and the thing is simply gone. Nothing is
            // counted, nothing is lost, and the sky keeps giving.
            ctx.audio.noise(70)
            continue
          }
          still.push(it)
        }
        items = still
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x, y } = stage
        c.outline(x, y, stage.w, stage.h, INK, WALL)

        // Each falling thing as its own small bitmap, centred on its lane. Its
        // FRACTIONAL height goes straight to the painter, so the fall reads as
        // a fall and not as a row-by-row hop.
        for (const it of items) {
          c.sprite(x + laneX(it.lane) - ITEM_W / 2, y + it.y - ITEM_H / 2,
            it.art, INK, { scale: ITEM_SCALE })
        }

        // The basket: an open U — two staves and a floor. Open on top is what
        // says "things go in here", and it is the only hollow thing on the
        // sky besides the wall, so it can never be mistaken for a gift.
        const bx = x + basketX() - BASKET_W / 2
        const by = y + rim()
        c.rect(bx, by, BASKET_T, BASKET_H, INK)
        c.rect(bx + BASKET_W - BASKET_T, by, BASKET_T, BASKET_H, INK)
        c.rect(bx, by + BASKET_H - BASKET_T, BASKET_W, BASKET_T, INK)

        // A catch rings for a moment — a picture, so it needs no language.
        if (cheer > 0) c.circle(x + basketX(), by - 10, 11, INK)
      },

      // Names what was caught, never how many. A child who leaves before
      // catching anything gets a warm line, never a bare "0".
      souvenir: () => {
        if (caught.length === 0) return ctx.t('catch.souvenir.none')
        const names = caught.map((id) => ctx.t(`catch.name.${id}`))
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('catch.souvenir.more')]
          : names
        return ctx.t('catch.souvenir', { list: joinNamed(shown, ctx.locale) })
      },
    }
  },
}

export default cartridge
