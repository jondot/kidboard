import type { BlockSpec, Locale, T } from '../../types'

/**
 * THE CARD A CHILD ARRIVES AT.
 *
 * This is the machine's own answer to "what is this and what do I do?", and
 * it is the shape the answer has always had: a MARQUEE, a HOW-TO-PLAY panel,
 * and then a demonstration. That is a 1981 arcade cabinet standing in a room
 * with nobody in front of it — the title in big letters, then the panel that
 * names the characters one at a time, then the machine playing itself until
 * somebody drops a coin in. A child learned Pac-Man by watching the cabinet
 * before ever touching it, and none of it required reading a word.
 *
 * WHAT A CHILD ACTUALLY HAS TO LEARN HERE is one thing: type a word, and
 * something happens. Everything else — thirty-odd game names, four machines,
 * the shelf — follows from it and is discoverable once that is understood. So
 * the card teaches exactly that, with three words to try, and stops. `help`
 * is still the whole index for whoever wants one; this is not that.
 *
 * THE THREE WORDS ARE A SPREAD, not a sample: a THING that answers with a
 * picture, a COLOUR, and a GAME. Between them they cover every kind of thing
 * this machine does, and each one is a word a five-year-old already owns in
 * their own language — never a word they would have to be taught first.
 *
 * WHY THE WORDS ARE PROSE AND THE TITLE IS ART. A `{kind:'art'}` block is
 * bidi-isolated and laid out left-to-right, which is exactly right for a
 * drawing and exactly wrong for a Hebrew word — it would come out reversed.
 * So the marquee, which is Latin block letters in both languages, is art; the
 * rows, which carry a word in the child's own language, are text.
 */

/**
 * A block alphabet, four by five, hand-drawn — only the seven letters the
 * title needs. Generating one from a font would be a smaller file and a worse
 * thing: this is a marquee, and a marquee is drawn.
 *
 * FOUR AND NOT THREE. Three columns was tried first and is a column short of
 * a letter: a `B` at three wide has a stroke and two half-bowls with no
 * interior between them, so it comes out as a bar with two dots beside it,
 * and `D`, `B` and `O` all collapse toward the same shape. The fourth column
 * is the hole in the middle of the letter, which is most of what tells one
 * round letter from another. Checked at four times magnification in a real
 * browser rather than counted in the source, because the difference is
 * entirely in how it reads.
 */
const GLYPH: Record<string, readonly string[]> = {
  K: ['█  █', '█ █ ', '██  ', '█ █ ', '█  █'],
  I: ['████', ' ██ ', ' ██ ', ' ██ ', '████'],
  D: ['███ ', '█  █', '█  █', '█  █', '███ '],
  B: ['███ ', '█  █', '███ ', '█  █', '███ '],
  O: ['████', '█  █', '█  █', '█  █', '████'],
  A: ['████', '█  █', '████', '█  █', '█  █'],
  R: ['███ ', '█  █', '███ ', '█ █ ', '█  █'],
}

/** One column of space between letters, and no more: a marquee is tight. */
export function bigWord(word: string): string {
  const letters = [...word].map((ch) => GLYPH[ch])
  if (letters.some((g) => g === undefined)) return word
  return [0, 1, 2, 3, 4]
    .map((row) => letters.map((g) => g![row]!).join(' ').replace(/ +$/, ''))
    .join('\n')
}

export const TITLE = bigWord('KIDBOARD')

/** A picture and the word that fetches it. */
export type Example = { emoji: string; word: string }

/**
 * A thing, a colour, a game — in that order, because that is the order of
 * increasing commitment: `cat` answers instantly, `red` answers instantly and
 * shows there is more than one kind of word, and `ball` takes over the screen.
 */
export const EXAMPLES: Record<Locale, readonly Example[]> = {
  en: [
    { emoji: '🐱', word: 'cat' },
    { emoji: '🔴', word: 'red' },
    { emoji: '⚽', word: 'ball' },
  ],
  he: [
    { emoji: '🐱', word: 'חתול' },
    { emoji: '🔴', word: 'אדום' },
    { emoji: '⚽', word: 'כדור' },
  ],
}

/**
 * The word the machine types for itself on a child's very first visit — the
 * cabinet playing itself. It is the FIRST word on the card, so what the child
 * watches happen is the line they were just told to try, and it is a word
 * that answers instantly rather than one that takes the screen: a game
 * starting itself with nobody at the keys is a machine that has stopped
 * demonstrating and started waiting.
 */
export const demoWord = (locale: Locale): string => EXAMPLES[locale][0]!.word

/**
 * THE TWO INKS. `info` is the machine talking — the marquee and the two lines
 * that tell a child what to do — and `plain` is the words themselves, which
 * are what the child is meant to look at and copy. Two tones, one of them the
 * ink, which is the house rule.
 */
export function introBlocks(t: T, locale: Locale): BlockSpec[] {
  return [
    { kind: 'art', art: TITLE, tone: 'info' },
    { kind: 'text', text: t('intro.type'), tone: 'info', scale: 'big' },
    ...EXAMPLES[locale].map((e): BlockSpec => ({
      kind: 'text',
      // Two spaces, not a tab or a table: an emoji is two cells wide
      // everywhere (see `splitWide`), so this lines up on its own in both
      // directions without a grid to keep straight.
      text: `${e.emoji}  ${e.word}`,
      tone: 'plain',
      scale: 'big',
    })),
    { kind: 'text', text: t('intro.games'), tone: 'info' },
  ]
}
