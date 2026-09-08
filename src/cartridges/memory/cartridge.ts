import type { Locale, TurnCartridge } from '../../types'
import { SLOT, pad, padAt, padRule } from '../card'
import { EMOJI } from '../../content/smash'
import { EMOJI_NAME_ID } from './names'
import en from './en.json'
import he from './he.json'

const ROWS = ['a', 'b', 'c', 'd'] as const
const COLS = 4
const SIZE = ROWS.length * COLS

/**
 * The gutter the row labels (`a`, `b`, …) sit in, to the left of the board's
 * own wall. Three cells: a space, the letter, a space.
 */
const GUTTER = 3

// How many names the souvenir spells out before it switches to "...and
// more!" — eight pairs spelled out in full would read like a shopping list,
// not a keepsake.
const NAME_CAP = 4

/**
 * Joins named things the way a person would say them aloud, not the way code
 * concatenates them. English gets an Oxford comma; Hebrew's "and" (ו) is a
 * prefix glued to the next word rather than a standalone word, so it is never
 * preceded by its own comma.
 *
 * CORRECTION: this is the ONLY place a conjunction gets added, on purpose.
 * `memory.souvenir.more` (the capped-list overflow marker, "...and more!" /
 * "...ועוד!") used to carry its own conjunction baked into the string, so a
 * capped list doubled it: "the cat, and and more!" in English, and — worse,
 * since Hebrew's ו is a glued prefix rather than a word of its own — a
 * literal doubled letter, "וועוד", which is not a word in any register of
 * Hebrew. The strings now hold bare "more" / "עוד" and `joinNamed` supplies
 * the conjunction uniformly for every final slot, real name or overflow
 * marker alike. Do not put "and"/ו back into memory.souvenir.more.
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
  id: 'memory',
  // CORRECTION: he is the real Hebrew word for "memory" (זיכרון), not the
  // Latin transliteration "zikaron" — a Hebrew-speaking child types Hebrew.
  // CORRECTION: the joker emoji is the literal glyph, never a unicode escape.
  triggers: { en: ['memory', 'match'], he: ['זיכרון'], emoji: ['🃏'] },
  locales: ['en', 'he'],
  strings: { en, he },

  // The shell owns the ESC hint; see invariants.test.ts. The bar label is
  // memory.hint, not memory.pick: `keys` already shows the example, so the
  // longer transcript prompt rendered as "a1 b3 type two spots, like a1 b3".
  hints: (t) => [
    { keys: 'a1 b3', label: t('memory.hint') },
  ],

  create(ctx) {
    // Eight pairs, shuffled with the seeded rng so boards are reproducible.
    // ctx.rng only, never the global unseeded random function, so the same
    // seed always deals the same board.
    //
    // The eight faces are DRAWN from the whole pool rather than sliced off
    // the front of it: a fixed slice meant every child, on every device,
    // met the same eight emoji forever.
    const dealt = (): string[] => {
      const pool = [...EMOJI]
      const chosen: string[] = []
      for (let n = 0; n < SIZE / 2; n++) {
        chosen.push(...pool.splice(ctx.rng.int(pool.length), 1))
      }
      const cards = [...chosen, ...chosen]
      for (let i = cards.length - 1; i > 0; i--) {
        const j = ctx.rng.int(i + 1)
        ;[cards[i], cards[j]] = [cards[j]!, cards[i]!]
      }
      return cards
    }

    let deck = dealt()
    let found = new Set<number>()
    /**
     * True once the last pair is found. THE PACING RULE: finishing a board
     * used to call ctx.exit() on the spot, so the board a child had just
     * solved was swept away by the shell in the same breath as the cheer.
     * Now the finished board stays put and the next line the child types —
     * any line — deals a new one. Nothing here re-arms on its own, and ESC
     * (or a quit word, which the shell owns) is still how it ends.
     */
    let complete = false
    /** How many misses so far, only so two wordings can alternate. */
    let misses = 0
    // The name of each pair found, in the order it was found — what the
    // souvenir reports. `found` (the index set) stays purely for game logic:
    // knowing when the board is complete.
    const matched: string[] = []

    const indexOf = (token: string): number | null => {
      const m = /^([a-d])([1-4])$/.exec(token.trim().toLowerCase())
      if (!m) return null
      return ROWS.indexOf(m[1] as (typeof ROWS)[number]) * COLS + (Number(m[2]) - 1)
    }

    // SIXTEEN CARDS, DRAWN AS CARDS. Every place is a face of four cells with
    // a wall each side and the walls shared with its neighbours (`pad` and
    // `padRule` in `../card`, the character idiom's shared vocabulary). Two of
    // those four cells are the emoji itself, which is the model the whole
    // project is written against.
    //
    // This is not decoration. It is a game of face-down CARDS, and sixteen
    // `?` floating on an open grid was the one thing on screen that never said
    // so — while also being, of the three transcript games, the only one that
    // had any structure at all before this.
    //
    // Two columns is the *model*; it is not something the browser can be
    // trusted to honor. An emoji glyph is always served by a fallback font
    // (Apple Color Emoji / Noto / Segoe), never by the mono face, so its
    // advance is never exactly two mono cells and the error accumulates
    // across a row. An earlier note here claimed a static string-index trace
    // had proved the grid square: it proved that the *string indices* line
    // up, which they do, and says nothing about rendered pixels — which
    // drifted about 4px per revealed emoji in a real browser.
    // The fix is not here. `ArtView` tokenizes emoji graphemes out of the art
    // and renders each in a `.kb-cell2` span of `width: 2ch`, so a revealed
    // cell occupies exactly two mono cells whatever font supplies the glyph.
    // This cartridge simply keeps the model honest.
    const board = (reveal: number[] = []): string => {
      // Every line carries the same GUTTER, so the board's left wall is one
      // straight line down the picture whatever is beside it, and the header's
      // digits are placed by `padAt` — the same arithmetic the faces below
      // them are laid out with, so a column and its number cannot drift apart.
      const left = ' '.repeat(GUTTER)
      const header = Array.from({ length: GUTTER + COLS * SLOT + 1 }, () => ' ')
      for (let x = 0; x < COLS; x++) header[GUTTER + padAt(x)] = String(x + 1)

      const rows = ROWS.map((r, y) => ` ${r} ` + pad(
        Array.from({ length: COLS }, (_, x) => {
          const i = y * COLS + x
          return found.has(i) || reveal.includes(i) ? deck[i]! : '?'
        }),
      ))

      // The rule between two rows of cards is one line, shared, and the last
      // one is the GROUND — the board's own floor, which is the same rail
      // `spot` and `count` stand on.
      return [
        header.join(''),
        left + padRule(COLS, 'top'),
        ...rows.flatMap((r, i) =>
          [r, left + padRule(COLS, i === ROWS.length - 1 ? 'ground' : 'mid')]),
      ].join('\n')
    }

    // MONOCHROME: the board and its prose are the theme's own ink. The one
    // second tone (`win`) is for the moment the child made something happen —
    // a pair, or a finished board — and nothing else.
    //
    // ONE BOARD. The board is redrawn on every line, and every redraw used to
    // be a fresh block — three misses left four stacked grids and the live
    // one at the bottom. `{ replace: true }` supersedes the last board
    // instead, so there is one grid on screen and it updates in place. `keep`
    // is the exception: a solved board is a keepsake and stays in the
    // scrollback, so the fresh deal after it starts a paragraph of its own.
    const show = (
      reveal: number[], note: string,
      tone: 'plain' | 'win' = 'plain', keep = false,
    ): void => {
      ctx.say([
        { kind: 'art', art: board(reveal), tone: 'plain' },
        { kind: 'text', text: note, tone },
      ], keep ? undefined : { replace: true })
    }

    return {
      // An invitation, not a syntax reminder: the hint bar already carries
      // `a1 b3  two spots`, so spelling the same example out again in the
      // transcript said one thing twice. This line says what the GAME is,
      // which the bar does not; `memory.howto` still hands over the example
      // at the only moment it is actually needed.
      start: () => show([], ctx.t('memory.pick')),

      onLine(text) {
        // Holding on a finished board. Any line at all deals a new one, so
        // there is no key to learn and no way to be stuck.
        if (complete) {
          complete = false
          deck = dealt()
          found = new Set<number>()
          show([], ctx.t('memory.fresh'))
          return
        }

        const parts = text.trim().split(/\s+/)
        const a = parts[0] ? indexOf(parts[0]) : null
        const b = parts[1] ? indexOf(parts[1]) : null

        // Anything unparseable is a nudge, never a rebuke: empty input, a
        // single coordinate, out-of-range digits/letters, or two identical
        // spots all land here.
        if (a === null || b === null || a === b) {
          show([], ctx.t('memory.howto'))
          return
        }

        if (deck[a] === deck[b]) {
          found.add(a)
          found.add(b)
          matched.push(EMOJI_NAME_ID[deck[a] as keyof typeof EMOJI_NAME_ID]!)
          ctx.audio.note(660, 120)
          if (found.size >= SIZE) {
            complete = true
            show([], ctx.t('memory.done'), 'win', true)
            return
          }
          show([], ctx.t('memory.yes'), 'win')
          return
        }

        // A miss shows the pair once, then the next call (any call — even
        // another miss) redraws with no `reveal`, so only matched pairs
        // (tracked in `found`) ever stay face-up.
        //
        // Two wordings, alternating rather than random, so a child who misses
        // three times running is never read the identical sentence three
        // times — which stops sounding like a game waiting and starts
        // sounding like a machine disapproving.
        ctx.audio.blip()
        show([a, b], ctx.t(misses++ % 2 === 0 ? 'memory.again' : 'memory.again.b'))
      },

      // Names what was found, never how many. A child who leaves before any
      // pair is found gets a warm line instead of a bare "0"; a big board
      // gets capped at NAME_CAP names plus "...and more!" rather than a full
      // roll call.
      souvenir: () => {
        if (matched.length === 0) return ctx.t('memory.souvenir.none')
        const names = matched.map((id) => ctx.t(`memory.name.${id}`))
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('memory.souvenir.more')]
          : names
        return ctx.t('memory.souvenir', { list: joinNamed(shown, ctx.locale) })
      },
    }
  },
}

export default cartridge
