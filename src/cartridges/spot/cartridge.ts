import type { Locale, TurnCartridge } from '../../types'
import { SLOT, pad, padAt, padRule } from '../card'
import { parseNumber } from './numberWords'
import en from './en.json'
import he from './he.json'

/**
 * A row is one thing repeated, plus one that is not. `oddId` names the odd
 * one for the souvenir — "you spotted the orange!" — so the keepsake says
 * what happened rather than how often it happened.
 */
export type Pair = { same: string; odd: string; oddId: string }

/**
 * Ordered from unmistakable to genuinely worth a second look. A six-year-old
 * meeting this for the first time should find the answer in a heartbeat: the
 * skill being practised is *scanning a row*, and a puzzle that is hard on
 * turn one teaches nothing except that this game is not for them.
 */
export const PAIRS: readonly Pair[] = [
  { same: '🍎', odd: '🍊', oddId: 'orange' },
  { same: '⭐', odd: '🌙', oddId: 'moon' },
  { same: '🐱', odd: '🐶', oddId: 'dog' },
  { same: '🚗', odd: '🚌', oddId: 'bus' },
  { same: '🍪', odd: '🍩', oddId: 'donut' },
  { same: '🐟', odd: '🐠', oddId: 'stripy' },
  { same: '🔵', odd: '🟣', oddId: 'purple' },
]

/** The opening rounds only ever use these. */
export const OBVIOUS: readonly Pair[] = PAIRS.slice(0, 4)

/** How many rounds stay inside the obvious set before the subtler ones join. */
const EASY_ROUNDS = 2

/** How many names the souvenir spells out before "...and more!". */
const NAME_CAP = 4


/**
 * Joins named things the way a person says them aloud. English gets an Oxford
 * comma; Hebrew's "and" (ו) is a PREFIX glued onto the next word, not a
 * standalone token, so it is never preceded by its own comma.
 *
 * This is the ONLY place a conjunction is added — deliberately. `memory`
 * shipped a doubled conjunction ("the cat, and and more!" and, in Hebrew, a
 * literal doubled letter "וועוד") because its overflow marker carried a
 * conjunction of its own and the join then added a second.
 * `spot.souvenir.more` holds the bare word ("more" / "עוד"); do not put a
 * conjunction back into it.
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
  id: 'spot',
  /**
   * TRIGGERS. Everything obvious near this idea is already claimed — the
   * content cartridges own their plain nouns, `memory`/`match` owns matching,
   * `colors` owns every colour word. "spot" (as in *spot the difference*) and
   * "different" are free, evocative, and a child looking for it finds it in
   * the 🎮 games menu anyway. Hebrew "שונה" is literally "different".
   */
  triggers: { en: ['spot', 'different'], he: ['שונה'], emoji: ['👀'] },
  locales: ['en', 'he'],
  strings: { en, he },

  // The shell owns the ESC hint; see invariants.test.ts.
  hints: (t) => [
    { keys: '↵', label: t('spot.answer') },
  ],

  create(ctx) {
    let round = 0
    let pair: Pair = PAIRS[0]!
    /** The pair shown last round, so this round cannot repeat it. Null before
     *  the first deal, so the very first round can still be any of them. */
    let prev: Pair | null = null
    let len = 4
    /** Where the odd one sits, 0-based. `-1` before the first deal, so every
     *  slot — slot 0 included — is reachable on the opening row. */
    let at = -1
    /** The distinct odd things spotted, in the order they were found. */
    const spotted: string[] = []
    /**
     * True while the game is HOLDING on a find. THE PACING RULE: spotting the
     * odd one used to cheer and deal the next row in the same breath, so the
     * good moment was gone before a six-year-old had finished enjoying it.
     * The cheer now stands alone and the next line the child types — any line
     * — brings the next row. Nothing here re-arms by itself.
     */
    let holding = false
    /** How many misses so far, only so two wordings can alternate. */
    let misses = 0

    const deal = (): void => {
      const tier = round < EASY_ROUNDS ? OBVIOUS : PAIRS
      const choices = tier.filter((p) => p !== prev)
      pair = choices[ctx.rng.int(choices.length)]!
      prev = pair
      // The odd one never lands in the slot it just came from, so the child
      // cannot "win" by typing the same number twice — the eye has to do the
      // work every round.
      len = 4 + Math.min(round, 2)
      const slots = [...Array(len).keys()].filter((i) => i !== at)
      at = slots[ctx.rng.int(slots.length)]!
    }

    /**
     * A ROW OF PADS, in the character idiom's shared vocabulary (`../card`):
     * one framed face per thing with the walls shared, the GROUND rail along
     * their feet, and the position labels under it the way `drum` puts a key
     * cap under a pad.
     *
     * This was four emoji at body-text size in the top-left corner of an
     * otherwise empty screen, with nothing framing them, nothing scaling
     * them and no ground under them. An emoji in a transcript is 16px and
     * nothing can change that — but a pad is about 48 x 37px, so what a child
     * scans is now four objects rather than four glyphs, and they are
     * standing on something.
     *
     * There is deliberately no second frame around the row. The grid's own
     * outer wall IS the frame; a card around it would be a box around a box
     * with dead space between them, which is the mistake `BlockView` already
     * documents having made once for games.
     *
     * `{ kind: 'art' }`, never `{ kind: 'text' }`: prose is bidi-reordered
     * under Hebrew and would run this row backwards, which would make the
     * labels point at the wrong things.
     *
     * The digits are the row's own coordinates, exactly like `memory`'s
     * column header — the *content* of the puzzle, not a measure of how the
     * child is doing. Nothing here counts anything the child did.
     */
    const row = (): string => {
      const things = Array.from({ length: len }, (_, i) => (i === at ? pair.odd : pair.same))
      // The digits sit under the pads they name, at the column the face is
      // centred on — built as one padded line rather than joined, so a wider
      // or narrower face can never walk a label off its own pad.
      const label = Array.from({ length: len * SLOT + 1 }, () => ' ')
      for (let i = 0; i < len; i++) label[padAt(i)] = String(i + 1)
      const empty = Array.from({ length: len }, () => '')
      return [
        padRule(len, 'top'),
        // A pad is two rows tall here and one row tall in `memory`, and that
        // is the one number the two do not share. A row of four things can
        // afford the height and needs it — this is the cartridge that was
        // called out for being tiny — while sixteen cards each a row taller
        // would leave `memory` a narrow 190 x 260 ladder.
        pad(empty),
        pad(things),
        padRule(len, 'ground'),
        label.join(''),
      ].join('\n')
    }

    // MONOCHROME: the row and the prose around it are the theme's own ink.
    // The one second tone (`win`) belongs to the moment the child spotted it,
    // and to nothing else.
    //
    // ONE ROW ON SCREEN. The row is re-said on every line, and every re-say
    // used to be a fresh block, so three guesses left four rows stacked up
    // the page. `{ replace: true }` supersedes the last one instead. The
    // cheer for a find is a plain say, which seals the row the child solved
    // into the scrollback and starts the next round on its own paragraph.
    const show = (note: string): void => {
      ctx.say([
        // `scale: 'giant'`. A board of five emoji and a board of a thousand
        // canvas pixels are the same game to a child, and they were not the
        // same size on screen: this row drew at about a quarter of `maze`'s
        // height, so the two read as one product with a broken half. Spotting
        // a difference between two small faces is also literally an
        // eyesight task — of every board in the set, this is the one that
        // most wants to be large.
        { kind: 'art', art: row(), tone: 'plain', scale: 'giant' },
        { kind: 'text', text: note, tone: 'plain' },
      ], { replace: true })
    }

    return {
      start() {
        deal()
        show(ctx.t('spot.ask'))
      },

      onLine(text) {
        // Holding on a find. Any line at all brings the next row, so there is
        // no key to learn and no way to be stuck.
        if (holding) {
          holding = false
          deal()
          show(ctx.t('spot.next'))
          return
        }

        const guess = parseNumber(text)

        // Empty input, letters, punctuation, an emoji, a number that is not a
        // slot at all — all land here, with the row still on screen and a
        // reminder of what to type. Nothing is ever an error.
        if (guess === null || guess < 1 || guess > len) {
          show(ctx.t('spot.howto'))
          return
        }

        if (guess === at + 1) {
          ctx.audio.note(660, 120)
          if (!spotted.includes(pair.oddId)) spotted.push(pair.oddId)
          round += 1
          holding = true
          ctx.say([
            {
              kind: 'text',
              text: ctx.t('spot.yes', { name: ctx.t(`spot.name.${pair.oddId}`) }),
              tone: 'win',
              scale: 'big',
            },
            { kind: 'text', text: ctx.t('spot.more'), tone: 'plain' },
          ])
          return
        }

        // A wrong slot is not a wrong answer, it is a row that has not been
        // looked at long enough. Same row, same puzzle, another invitation —
        // in one of two wordings, ALTERNATING rather than picked at random,
        // so three guesses in a row can never replay the identical sentence
        // three times. A coin flip repeated itself one turn in four.
        ctx.audio.blip()
        show(ctx.t(misses++ % 2 === 0 ? 'spot.again' : 'spot.again.b'))
      },

      /**
       * Names what was spotted, never how much of it. A child who opens this
       * and presses ESC straight away gets a warm line, never a bare "0" and
       * never a template with an empty gap in it.
       */
      souvenir() {
        if (spotted.length === 0) return ctx.t('spot.souvenir.none')
        const names = spotted.map((id) => ctx.t(`spot.name.${id}`))
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('spot.souvenir.more')]
          : names
        return ctx.t('spot.souvenir', { list: joinNamed(shown, ctx.locale) })
      },
    }
  },
}

export default cartridge
