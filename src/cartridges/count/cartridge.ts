import type { BlockSpec, Locale, TurnCartridge } from '../../types'
import { CARD_W, card } from '../card'
import { parseNumber } from './numberWords'
import en from './en.json'
import he from './he.json'

/**
 * Things worth counting. Each has a name in both languages (see
 * `count.name.*`), because the souvenir names WHAT was counted — "you counted
 * the ducks!" — and never how many times the child got it right.
 */
type Item = { emoji: string; id: string }

const ITEMS: readonly Item[] = [
  { emoji: '🦆', id: 'duck' },
  { emoji: '⭐', id: 'star' },
  { emoji: '🍎', id: 'apple' },
  { emoji: '🐱', id: 'cat' },
  { emoji: '🎈', id: 'balloon' },
  { emoji: '🐟', id: 'fish' },
  { emoji: '🌸', id: 'flower' },
  { emoji: '🚗', id: 'car' },
  { emoji: '🐸', id: 'frog' },
  { emoji: '🍪', id: 'cookie' },
]

/**
 * How big a group gets, round by round. It ramps SLOWLY and deliberately
 * starts at two or three: a six-year-old who opens this and immediately meets
 * seven scattered ducks has been handed a puzzle, not an invitation. The last
 * band repeats forever, so the game never runs out and never gets hard.
 */
const RANGES: readonly (readonly [number, number])[] = [
  [2, 3], [2, 4], [3, 5], [4, 6], [5, 8],
]

/**
 * The scatter's grid, ON THE CARD (`../card` — the character idiom's shared
 * stage). Three rows of six columns at a FOUR-cell pitch: an emoji is two
 * cells and two go to air, so the pond is 24 cells across and eighteen slots
 * deep — a real field to scan rather than the ten-cell huddle the ducks used
 * to sit in, and eighteen slots is roomy for the two the first round deals
 * and still comfortable for the eight of the last.
 *
 * `PITCH` is four and not two for a reason that is only visible on screen: a
 * transcript row is 1.15em tall and a mono cell is 0.6em wide, so four cells
 * across (2.4em) is very nearly two rows down (2.3em). With a blank line
 * between the scatter's rows — see `spread` — the grid's cells come out
 * SQUARE, and a scatter laid out on square cells is one a child can track
 * with a finger instead of one that reads as three long lines.
 */
const COLS = 6
const ROWS = 3
const PITCH = 4

/** How many names the souvenir spells out before "...and more!". */
const NAME_CAP = 4

/**
 * Joins named things the way a person says them aloud. English gets an Oxford
 * comma; Hebrew's "and" (ו) is a PREFIX glued onto the next word, not a
 * standalone token, so it is never preceded by its own comma.
 *
 * This is the ONLY place a conjunction is added — deliberately. `memory`
 * shipped a doubled conjunction ("the cat, and and more!" / "...הכדורסל
 * וועוד!") precisely because its overflow marker carried its own "and"/ו and
 * the join then added a second. `count.souvenir.more` holds the bare word
 * ("more" / "עוד") and this function supplies the conjunction uniformly for
 * every final slot, real name or overflow marker alike. Do not put a
 * conjunction back into count.souvenir.more.
 */
function joinNamed(names: string[], locale: Locale): string {
  if (names.length === 1) return names[0]!
  const head = names.slice(0, -1)
  const last = names[names.length - 1]!
  if (locale === 'he') return `${head.join(', ')} ו${last}`
  return names.length === 2 ? `${names[0]} and ${last}` : `${head.join(', ')}, and ${last}`
}

const cartridge: TurnCartridge = {
  kind: 'turn',
  apiVersion: 1,
  id: 'count',
  /**
   * TRIGGERS. `numbers` is the neighbour to be careful about: it owns the
   * plain noun ("numbers" / "מספרים") AND every bare digit the child types,
   * which `Terminal` routes to it directly. This cartridge takes the verb
   * instead — you *count* things here, you don't look a number up — so the
   * two never contend for a word, and the 🎮 games menu makes it findable
   * without needing the obvious noun. Hebrew "ספירה" is the act of counting,
   * distinct from "מספרים" (numbers).
   */
  triggers: { en: ['count', 'counting'], he: ['ספירה'], emoji: ['🔢'] },
  locales: ['en', 'he'],
  strings: { en, he },

  // The shell owns the ESC hint; see invariants.test.ts.
  hints: (t) => [
    { keys: '↵', label: t('count.answer') },
  ],

  create(ctx) {
    let round = 0
    let item: Item = ITEMS[0]!
    let howMany = 0
    /**
     * True while the game is HOLDING on a correct answer. THE PACING RULE: a
     * right answer used to cheer and deal the next group in the very same
     * breath, so the good moment was buried under a fresh puzzle before a
     * six-year-old had finished being pleased about it. Now the cheer stands
     * on its own and the next line the child types — any line — brings the
     * next group. Nothing here re-arms by itself.
     */
    let holding = false
    /** How many misses so far, only so two wordings can alternate. */
    let misses = 0
    /** The distinct things counted, in the order they were counted. */
    const counted: string[] = []
    /**
     * The picture standing on screen right now: the scattered group, or the
     * neat row once a miss has asked for help. It changes when the CHILD does
     * something, never merely because the screen was redrawn.
     */
    let art = ''

    const deal = (): void => {
      const [lo, hi] = RANGES[Math.min(round, RANGES.length - 1)]!
      item = ctx.rng.pick(ITEMS)
      howMany = lo + ctx.rng.int(hi - lo + 1)
      // Laid out ONCE, here, and kept in `art` until the next deal. `scatter`
      // draws a fresh random arrangement every time it is called, and every
      // redraw used to call it again — so typing "banana" at a group of three
      // ducks rearranged the ducks. A child counting is tracking positions
      // with their eyes; moving the things under them mid-count is the least
      // humane thing this cartridge could do, and it was doing it on every
      // unparseable keystroke.
      art = scatter()
    }

    /**
     * The puzzle: the group scattered over a grid ON THE CARD, so counting
     * takes real one-to-one tracking. Every slot is exactly `PITCH` cells —
     * an emoji and two spaces, or four spaces — which is why this is
     * `{ kind: 'art' }` and never `{ kind: 'text' }`: prose is bidi-reordered
     * under Hebrew and would scramble the layout.
     *
     * The card is the ground the ducks used to be missing. They were laid out
     * at body-text size in the top-left corner with nothing under them and
     * nothing around them; they now stand on the same double ground rail
     * `spot`'s row and `memory`'s board stand on, inside the same walls.
     *
     * They are NOT put in pads the way `spot`'s and `memory`'s things are, and
     * that is the one place this cartridge parts company with them: the whole
     * mechanic here is tracking loose things across a field with your eyes,
     * and a thing in a numbered box has already been counted for you.
     */
    const scatter = (): string => {
      // THE POND DOES NOT CHANGE SIZE WHEN A DUCK ARRIVES. The field is always
      // `ROWS` x `COLS` inside a card of always the same width, so the picture
      // a child looks at is in the same place and at the same scale every
      // round — and, crucially, when a miss swaps the scatter for the helping
      // row underneath them. A field that grew with the group would make the
      // frame jump every time the child got one right.
      const slots: string[] = Array.from({ length: ROWS * COLS }, () => ' '.repeat(PITCH))
      const free = [...slots.keys()]
      const used = { rows: new Set<number>(), cols: new Set<number>() }
      const take = (from: readonly number[]): void => {
        const at = from[ctx.rng.int(from.length)]!
        slots[at] = item.emoji + ' '.repeat(PITCH - 2)
        free.splice(free.indexOf(at), 1)
        used.rows.add(Math.floor(at / COLS))
        used.cols.add(at % COLS)
      }
      // SPREAD, NOT SPRINKLED. Every thing prefers a row and a column that
      // have nothing in them yet, and only falls back to anywhere once the
      // field has one of each. Purely random placement clumped often enough
      // to matter — three ducks in one corner of the pond, or worse, all of
      // them in one line, which is the HELP this cartridge gives after a
      // miss and so the one arrangement the puzzle itself must never be.
      const fresh = (): number[] => {
        const both = free.filter((i) =>
          !used.rows.has(Math.floor(i / COLS)) && !used.cols.has(i % COLS))
        if (both.length > 0) return both
        const either = free.filter((i) =>
          !used.rows.has(Math.floor(i / COLS)) || !used.cols.has(i % COLS))
        return either.length > 0 ? either : free
      }
      for (let i = 0; i < howMany; i++) take(fresh())

      return card(spread(Array.from({ length: ROWS }, (_, y) =>
        slots.slice(y * COLS, (y + 1) * COLS).join(''),
      )), { width: CARD_W, padY: 1 })
    }

    /**
     * A blank line between every row, so the scatter's grid reads square —
     * see `PITCH`. Rows are NOT trimmed of their trailing spaces: `card`
     * centres each line on its own, and a trimmed row would centre by a
     * different amount than a full one, walking the columns out of line
     * between one row and the next.
     */
    const spread = (rows: readonly string[]): string[] =>
      rows.flatMap((r, i) => (i === 0 ? [r] : ['', r]))

    /**
     * THE POINT OF THIS CARTRIDGE. A miscount is not a wrong answer, it is a
     * child who lost their place in a scatter — so the very same group comes
     * back in a neat left-to-right row, evenly spaced, where a finger can
     * touch each thing exactly once. Nothing is taken away and nothing is
     * marked; the row IS the help.
     */
    const row = (): string =>
      card([Array.from({ length: howMany },
        () => item.emoji + ' '.repeat(PITCH - 2)).join('')], { width: CARD_W, padY: 1 })

    // MONOCHROME: the group and the prose around it are the theme's own ink.
    // The one second tone (`win`) belongs to the moment the child got there,
    // and to nothing else.
    //
    // ONE GROUP ON SCREEN. The picture is re-said on every line, and every
    // re-say used to be a fresh block — a child who typed three words at a
    // group of ducks got four copies of the ducks. `{ replace: true }`
    // supersedes the last one instead. The cheer for a right answer is a
    // plain say, which seals the group the child counted into the scrollback
    // and starts the next round in a paragraph of its own.
    const show = (art: string, note: string, tone: 'plain' | 'win' = 'plain'): void => {
      const blocks: BlockSpec[] = [
        { kind: 'art', art, tone: 'plain' },
        { kind: 'text', text: note, tone },
      ]
      ctx.say(blocks, { replace: true })
    }

    return {
      start() {
        deal()
        show(art, ctx.t('count.ask'))
      },

      onLine(text) {
        // Holding on a right answer. Any line at all brings the next group,
        // so there is no key to learn and no way to be stuck.
        if (holding) {
          holding = false
          deal()
          show(art, ctx.t('count.next'))
          return
        }

        const guess = parseNumber(text)

        // Empty input, letters, punctuation, an emoji, a stray coordinate —
        // all land here, and all get the same gentle nudge with the group
        // still on screen. Nothing is ever an error.
        // The SAME picture stays put — the scatter if the group has not been
        // helped yet, the row if it has. Nothing rearranges itself because a
        // child typed a word.
        if (guess === null) {
          show(art, ctx.t('count.howto'))
          return
        }

        if (guess === howMany) {
          ctx.audio.note(660, 120)
          if (!counted.includes(item.id)) counted.push(item.id)
          round += 1
          holding = true
          ctx.say([
            { kind: 'text', text: ctx.t('count.yes'), tone: 'win', scale: 'big' },
            { kind: 'text', text: ctx.t('count.more'), tone: 'plain' },
          ])
          return
        }

        // A miss: same group, laid out in a row, and an invitation. Two
        // wordings, ALTERNATING rather than picked at random, so a child who
        // miscounts three times running can never be read the identical
        // sentence three times — which starts to sound like a machine
        // disapproving. A coin flip repeated itself one time in four.
        ctx.audio.blip()
        art = row()
        show(art, ctx.t(misses++ % 2 === 0 ? 'count.again' : 'count.again.b'))
      },

      /**
       * Names what was counted, never how much of it. A child who opens this
       * and presses ESC straight away gets a warm line, never a bare "0" and
       * never a template with an empty gap in it.
       */
      souvenir() {
        if (counted.length === 0) return ctx.t('count.souvenir.none')
        const names = counted.map((id) => ctx.t(`count.name.${id}`))
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('count.souvenir.more')]
          : names
        return ctx.t('count.souvenir', { list: joinNamed(shown, ctx.locale) })
      },
    }
  },
}

export default cartridge
