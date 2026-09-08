import type { CanvasLike, LiveCartridge } from '../../types'
import { court, sameStage, screenOf } from '../card'
import en from './en.json'

/**
 * The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
 * wide as it is tall. Rows follow from the aspect (18 of them); extra columns
 * follow from how wide the browser viewport is.
 *
 * THIS USED TO BE `9 / 7` and the sky was drawn EDGE TO EDGE inside it, which
 * on a desktop came out roughly 1190 x 200 — a full-width dashed frame with
 * no court and no proportion. `pop` is the same mechanic (a thing arrives,
 * you press a letter) drawn as shapes in a proper field, and side by side the
 * comparison was not kind to this one. `aspect: 1` buys the height, and
 * `screenOf` (`../card`) centres a field-shaped SCREEN in whatever grid
 * arrives; everything below is laid out in screen coordinates and offset once
 * in `draw`, the way a shape game works in stage coordinates.
 */
const COLS = 30
const ASPECT = 1

/** Screen columns one word lane occupies: four letters plus two of air. */
const LANE = 6
/** Seconds between two words being let go. Slow: this is reading, not reflex. */
const DROP = 2.2
/** Words at once, as a share of the lanes there are, so there is always an
 *  easy one on a narrow grid and never a wall of them on a wide one. */
const IN_AIR_MIN = 2
const IN_AIR_MAX = 5
/** Rows per second. A word takes roughly eight seconds to cross a short grid. */
const FALL_MIN = 0.85
const FALL_MAX = 1.4
/** Seconds a landed word lingers, fading, before it is gone. */
const FADE = 0.7
/** Seconds the zap flash sits where a word was. */
const ZAP = 0.35
/** What a zap leaves behind for a moment. Latin, one row, no emoji: an emoji
 *  is full colour that no theme can re-tint, and this sky has ONE ink. */
export const ZAP_MARK = '-*-'
/** How many words the souvenir spells out before it says "and more". */
const NAME_CAP = 4

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * The capital of a single Latin letter, by table. Deliberately not the
 * built-in case-raising string method, which is banned project-wide (and
 * mechanically checked for) because raising case is meaningless in Hebrew.
 */
export const capital = (ch: string): string => {
  const i = LOWER.indexOf(ch)
  return i < 0 ? ch : UPPER[i]!
}

/** A whole word in capitals, for the child to read off the canvas. */
export const capitals = (s: string): string => [...s].map(capital).join('')

/**
 * Words a 6-year-old can actually read, three or four letters, every one a
 * concrete thing they can picture. Most of them are words the rest of
 * Kidboard already celebrates — `animals` has the cat, the dog, the cow, the
 * pig, the owl, the duck, the frog, the bird and the fish; `vehicles` has the
 * bus, the car, the van and the boat; `catch` drops the cake, the star and
 * the moon — so a word that falls here is a word the child has already been
 * cheered for somewhere else.
 */
export const WORDS: readonly string[] = [
  'cat', 'dog', 'cow', 'pig', 'owl', 'fox', 'bee', 'ant', 'bug',
  'bus', 'car', 'van', 'jet', 'sun', 'cup', 'hat', 'egg', 'box', 'bed',
  'fish', 'bird', 'frog', 'duck', 'moon', 'star', 'cake', 'milk',
  'ball', 'tree', 'book', 'boat', 'kite', 'drum', 'leaf', 'nest', 'sock',
]

/**
 * ONE INK, plus exactly one more — and the second one is earned the only way
 * the house style allows it to be: it marks WHAT THE CHILD CONTROLS. `INK` is
 * the weather (the sky's frame and every word falling through it); `MINE` is
 * the letters the child has typed, on the word and on the typing line, and
 * nothing else in the game is ever painted in it.
 *
 * Four tones used to sprinkle themselves over the falling words at random,
 * which said nothing at all: a `warm` CAT and a `cool` DOG differ in no way
 * that matters to a child reading them.
 */
const INK = 'plain' as const
const MINE = 'win' as const

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

type Drop = {
  lane: number
  y: number
  vy: number
  word: string
  /** Counts down once the word has landed; it fades out and is gone. */
  fade: number
}

type Flash = { lane: number; y: number; left: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'rain',

  // "rain" is unclaimed in the live registry (checked against every trigger
  // table, the content cartridges' hundred-odd nouns included), so the design
  // table's plain word stands; "words" is the second, evocative one and is
  // likewise free. Note the near-neighbour: `vehicles` owns "train", one edit
  // away from "rain". That is safe by construction — the resolver tries exact
  // matches in every locale BEFORE it forgives a typo, so "rain" reaches this
  // game and "train" reaches the train, and neither can steal the other.
  triggers: { en: ['rain', 'words'], emoji: ['🌧️'] },

  // English only, and honestly so: an English word list IS the mechanic.
  // A Hebrew-reading child simply does not see this cartridge in `help` or in
  // the games menu — better absent than showing them English to type.
  locales: ['en'],
  strings: { en },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: 'A-Z', label: t('rain.type') }],

  create(ctx) {
    // THE SCREEN, learned from the canvas every frame. `tick` gets no canvas,
    // so the last drawn screen is the honest answer for it — and the runtime
    // always draws before it ticks. `W`/`H` are the SCREEN's size, not the
    // grid's: every word, lane and wall below lives in screen coordinates and
    // is offset by `screen.x`/`screen.y` exactly once, in `draw`.
    let screen = screenOf(COLS, Math.round((COLS * 0.6) / ASPECT))
    let W = screen.w
    let H = screen.h
    let lanes = 0

    let drops: Drop[] = []
    let flashes: Flash[] = []
    // A FULL BEAT OF EMPTY SKY FIRST. A game with no ending gets a rhythm
    // instead of a pause, and the rhythm starts with nothing happening: a
    // child needs a moment to look at the thing before it starts raining.
    let next = DROP
    /**
     * What the child has typed so far, lowercase. It is not a command line:
     * there is no ENTER, no cursor to manage, and nothing to erase before the
     * next attempt — see `feed` for how a letter that fits nothing is handled.
     */
    let typed = ''
    // The words that were zapped, deduplicated, in the order they were first
    // zapped. No count is kept anywhere.
    const zapped: string[] = []

    const clamp = (n: number, lo: number, hi: number): number =>
      Math.max(lo, Math.min(hi, n))

    /**
     * Screen column where lane `i` starts. A word is at most four cells, and
     * the lanes begin at column 2 rather than 1 so the leftmost word has a
     * cell of air between it and the wall instead of leaning on it.
     */
    const laneX = (i: number): number => 2 + LANE * i
    /** The row the child's typing is echoed on, just inside the bottom wall. */
    const typeRow = (): number => H - 2
    /**
     * The last row a word falls through before it lands and fades. Two rows
     * clear of the typing line, so a word settling at the bottom never looks
     * like it is sitting on the letters the child is spelling.
     */
    const landing = (): number => Math.max(1, H - 4)

    const sizeGrid = (): void => {
      lanes = Math.max(1, Math.floor((W - 3) / LANE))
    }

    /** How many words this sky holds at once. Read off the live grid. */
    const inAir = (): number => clamp(lanes - 1, IN_AIR_MIN, IN_AIR_MAX)

    /** Words still in play — a landed word is fading and can no longer be typed. */
    const live = (): Drop[] => drops.filter((d) => d.fade === 0)

    const spawn = (): void => {
      const airborne = new Set(drops.map((d) => d.word))
      const free = WORDS.filter((w) => !airborne.has(w))
      if (free.length === 0) return
      const takenLanes = new Set(drops.map((d) => d.lane))
      const openLanes = Array.from({ length: lanes }, (_, i) => i)
        .filter((i) => !takenLanes.has(i))
      if (openLanes.length === 0) return
      drops.push({
        lane: openLanes[ctx.rng.int(openLanes.length)]!,
        y: 1,
        vy: FALL_MIN + ctx.rng.float() * (FALL_MAX - FALL_MIN),
        word: ctx.rng.pick(free),
        fade: 0,
      })
    }

    /**
     * One letter, folded into the buffer.
     *
     * THE QUESTION THIS ANSWERS: what happens to a partial word that matches
     * nothing? The answer is never a rebuke, never an error tone, and never a
     * "wrong — start again". The buffer simply RE-ANCHORS: it keeps the
     * longest tail of itself that still begins a word on screen, and drops
     * the rest. A child who mashes `q` before typing `cat` types
     * q-c-a-t and the buffer goes '' -> 'c' -> 'ca' -> 'cat', which zaps.
     * A child who starts `cat` while only `dog` is falling loses nothing: as
     * soon as a `cat` appears their next `c` is already the start of it.
     *
     * This is strictly kinder than the two obvious alternatives. Clearing the
     * whole buffer on a miss punishes one slip by throwing away three correct
     * letters; keeping the buffer forever means an early stray letter blocks
     * every word after it. Re-anchoring silently forgives, and the only thing
     * the child ever sees is the letters that still count, glowing under the
     * word they are spelling.
     */
    const feed = (letter: string): void => {
      const words = live().map((d) => d.word)
      const want = typed + letter
      let anchored = ''
      for (let i = 0; i < want.length; i++) {
        const tail = want.slice(i)
        if (words.some((w) => w.startsWith(tail))) { anchored = tail; break }
      }
      typed = anchored

      if (typed.length === 0) return
      // A complete word: zap the lowest one wearing it — the one nearest the
      // ground is the one the child was most likely reading.
      let hit: Drop | null = null
      for (const d of live()) if (d.word === typed && (!hit || d.y > hit.y)) hit = d
      if (!hit) return

      const struck = hit
      drops = drops.filter((d) => d !== struck)
      flashes.push({ lane: struck.lane, y: struck.y, left: ZAP })
      if (!zapped.includes(struck.word)) zapped.push(struck.word)
      ctx.audio.blip()
      ctx.audio.note(880, 90)
      ctx.audio.note(1320, 90)
      typed = ''
    }

    /**
     * Re-fits to the grid the canvas actually reported: a window drag, a
     * tablet rotation, or the first frame inside a real container. Everything
     * in the air keeps its height proportionally instead of teleporting, and
     * a word whose lane no longer exists is walked back into one that does.
     */
    const refit = (c: CanvasLike): void => {
      const s = screenOf(Math.max(20, c.w), Math.max(12, c.h))
      if (sameStage(s, screen)) return
      const oldLanding = landing()
      screen = s
      W = s.w
      H = s.h
      sizeGrid()
      const kY = landing() / Math.max(1, oldLanding)
      for (const d of drops) {
        d.lane = clamp(d.lane, 0, lanes - 1)
        d.y = clamp(d.y * kY, 1, landing())
      }
      for (const f of flashes) {
        f.lane = clamp(f.lane, 0, lanes - 1)
        f.y = clamp(f.y * kY, 1, landing())
      }
      // Two words can land in the same lane after a shrink; the newer one
      // simply fades away early rather than overlapping the older one.
      const seen = new Set<number>()
      drops = drops.filter((d) => {
        if (seen.has(d.lane)) return false
        seen.add(d.lane)
        return true
      })
    }

    sizeGrid()

    return {
      onKey(k) {
        // A letter is the only thing that means anything here. Backspace
        // takes one back, and space or ENTER puts the buffer down — all three
        // in silence. Anything else is ignored just as silently: there is no
        // such thing as a wrong key in this game.
        if (k.key === 'Backspace') { typed = typed.slice(0, -1); return }
        if (k.key === ' ' || k.key === 'Enter') { typed = ''; return }
        if (k.key.length !== 1) return
        const letter = k.key.toLowerCase()
        if (!LOWER.includes(letter)) return
        feed(letter)
      },

      tick(dt) {
        next -= dt
        if (next <= 0) {
          next = DROP
          if (drops.length < inAir()) spawn()
        }

        const floor = landing()
        const still: Drop[] = []
        for (const d of drops) {
          if (d.fade > 0) {
            // Landed. It fades where it sits and is then simply gone — no
            // sound, no mark, and nothing anywhere that remembers it.
            d.fade -= dt
            if (d.fade > 0) still.push(d)
            continue
          }
          d.y += d.vy * dt
          if (d.y >= floor) {
            d.y = floor
            d.fade = FADE
          }
          still.push(d)
        }
        drops = still

        // A word that landed can no longer be typed, so a buffer that was
        // spelling it quietly lets go rather than sitting there dead.
        if (typed.length > 0 && !live().some((d) => d.word.startsWith(typed))) typed = ''

        for (const f of flashes) f.left -= dt
        flashes = flashes.filter((f) => f.left > 0)
      },

      draw(c) {
        refit(c)
        // Screen coordinates go out to the canvas offset by this, and by this
        // only — the simulation above never has to know where on the grid the
        // sky happens to sit, and a mid-play resize is one call.
        const { x: ox, y: oy } = screen
        c.clear()
        // The sky's court: `+ - |` walls with the `=` ground rail along the
        // foot, the same frame every other character-idiom cartridge wears.
        court(c, screen, INK)

        for (const d of drops) {
          const sx = laneX(d.lane)
          const shown = capitals(d.word)
          const y = oy + clamp(d.y, 1, landing())
          // Skip a lane a narrow screen cannot hold rather than letting a
          // word shear through the wall. Checked in SCREEN coordinates, so
          // the wall it is measured against is the sky's own.
          if (sx + shown.length - 1 > W - 2) continue
          const x = ox + sx
          if (d.fade > 0) {
            // A LANDED word settles into lower case — it stops shouting. That
            // is the whole difference between a word that can still be typed
            // and one that cannot, and it is a difference a child can see in
            // one ink, where a dimmer tone would have been a second colour
            // for something the child does not control.
            c.text(x, y, d.word, INK)
            continue
          }
          if (typed.length > 0 && d.word.startsWith(typed)) {
            // The part already typed glows, the rest stays as it was: the
            // child can see their own progress across the word itself. This
            // is the one thing in the game painted in the second tone,
            // because it is the one thing the child put there.
            c.text(x, y, shown.slice(0, typed.length), MINE)
            c.text(x + typed.length, y, shown.slice(typed.length), INK)
          } else {
            // The FRACTIONAL row goes straight to the painter, so the fall
            // reads as a fall and not as a row-by-row hop.
            c.text(x, y, shown, INK)
          }
        }

        for (const f of flashes) {
          const sx = laneX(f.lane)
          if (sx + ZAP_MARK.length - 1 > W - 2) continue
          c.text(ox + sx, oy + clamp(f.y, 1, landing()), ZAP_MARK, INK)
        }

        // The typing line: a caret, and the letters that still count. Never a
        // number, never a message, never a mark for a letter that did not fit.
        const line = `>${typed.length > 0 ? ` ${capitals(typed)}` : ''}`
        if (line.length + 1 <= W - 2 && typeRow() >= 1) {
          c.text(ox + 2, oy + typeRow(), line, MINE)
        }
      },

      // Names the words that were zapped, never how many. A child who opens
      // the game and leaves gets a warm line about the words still falling.
      souvenir: () => {
        if (zapped.length === 0) return ctx.t('rain.souvenir.none')
        const names = zapped.map(capitals)
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('rain.souvenir.more')]
          : names
        return ctx.t('rain.souvenir', { list: joinNamed(shown) })
      },
    }
  },
}

export default cartridge
