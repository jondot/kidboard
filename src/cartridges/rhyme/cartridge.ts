import type { TurnCartridge } from '../../types'
import { caseFor } from '../../i18n/locale'
import { FAMILIES, isRhyme, type Family } from './families'
import en from './en.json'

export { FAMILIES } from './families'
export type { Family } from './families'

/** How many pairs the souvenir spells out before "...and more!". */
const PAIR_CAP = 2

const cartridge: TurnCartridge = {
  kind: 'turn',
  apiVersion: 1,
  id: 'rhyme',
  /**
   * TRIGGERS. "rhyme" is unclaimed; `piano` owns "music" and 🎹, so 🎵 is
   * free for this one.
   *
   * NO HEBREW, DELIBERATELY. A rhyme set is not translatable — CAT/HAT has no
   * Hebrew counterpart, and Hebrew rhyme is built on different endings
   * entirely. Shipping a Hebrew locale here would mean either English words
   * shown to a Hebrew reader or a machine-shaped list nobody checked, and
   * both are worse than being honestly absent: with `locales: ['en']` this
   * cartridge simply does not appear in Hebrew `help`.
   */
  triggers: { en: ['rhyme', 'rhymes'], emoji: ['🎵'] },
  locales: ['en'],
  strings: { en },

  // The shell owns the ESC hint; see invariants.test.ts.
  hints: (t) => [
    { keys: '↵', label: t('rhyme.answer') },
  ],

  create(ctx) {
    const display = caseFor(ctx.locale)
    let family: Family = FAMILIES[0]!
    /** Prompt words already offered, so a session does not repeat itself. */
    const offered = new Set<string>()
    /** The rhyming pairs found, in order. What the souvenir is made of. */
    const pairs: { a: string; b: string }[] = []
    /**
     * True while the game is HOLDING on a rhyme it just heard. THE PACING
     * RULE: finding one used to cheer and ask the next question in the very
     * same breath, so the good moment was gone before a six-year-old had
     * finished being pleased about it. The cheer now stands alone and the
     * next line the child types — any line — brings the next word.
     */
    let holding = false
    /** How many unconfirmed words so far, only so two wordings alternate. */
    let hmms = 0

    const spoken = (word: string): boolean =>
      pairs.some((p) => p.a === word || p.b === word)

    const deal = (): void => {
      // Never re-offer a word already used as a prompt, and never offer a
      // word that already appears inside a found pair: the souvenir joins
      // pairs with commas, and "cat and ball, ball and tall" would read as a
      // stutter. When every family has had its turn, the pool refills.
      let choices = FAMILIES.filter((f) => !offered.has(f.word) && !spoken(f.word))
      if (choices.length === 0) {
        choices = FAMILIES.filter((f) => f !== family && !spoken(f.word))
      }
      if (choices.length === 0) choices = FAMILIES.filter((f) => f !== family)
      family = ctx.rng.pick(choices)
      offered.add(family.word)
    }

    // MONOCHROME: the whole conversation is the theme's own ink. The one
    // second tone (`win`) is for the rhyme the child actually found, and for
    // nothing else.
    const ask = (): void => {
      ctx.say([{
        kind: 'text',
        text: ctx.t('rhyme.ask', { word: display(family.word) }),
        tone: 'plain',
        scale: 'big',
      }])
    }

    return {
      start() {
        deal()
        ask()
      },

      onLine(text) {
        // Holding on a rhyme. Any line at all brings the next word, so there
        // is no key to learn and no way to be stuck.
        if (holding) {
          holding = false
          deal()
          ask()
          return
        }

        const answer = text.trim().toLowerCase()

        // Empty input, punctuation, digits, an emoji, several words at once:
        // a gentle "say a word" with the same prompt still standing. Nothing
        // is ever an error, and nothing here is a judgement about rhyming.
        // These three branches each end with `ask()`, which re-states the
        // standing question. So none of the lines below may ASK anything of
        // their own: the pair used to read "what else sounds like CAT?" and
        // then, immediately underneath, "what rhymes with CAT?" — the same
        // question twice, which is how a game starts to sound like a form.
        if (!/^[a-z]+$/.test(answer)) {
          ctx.say([{ kind: 'text', text: ctx.t('rhyme.howto'), tone: 'plain' }])
          ask()
          return
        }

        if (answer === family.word) {
          ctx.say([{ kind: 'text', text: ctx.t('rhyme.same'), tone: 'plain' }])
          ask()
          return
        }

        if (isRhyme(family, answer)) {
          ctx.audio.note(660, 120)
          pairs.push({ a: family.word, b: answer })
          holding = true
          ctx.say([
            {
              kind: 'text',
              // The same display case the prompt used. The prompt said CAT
              // and the cheer used to answer "cat and hat — they rhyme!", so
              // the two words a child was comparing were not even spelled
              // the same way on screen.
              text: ctx.t('rhyme.yes', { a: display(family.word), b: display(answer) }),
              tone: 'win',
              scale: 'big',
            },
            { kind: 'text', text: ctx.t('rhyme.more'), tone: 'plain' },
          ])
          return
        }

        // A WORD WE CANNOT CONFIRM. This branch never says a word does not
        // rhyme — it cannot know that, and a six-year-old hearing "no" about
        // a word they were proud of learns to stop offering words. So it
        // takes the word seriously, hands it back next to the prompt to be
        // said aloud (which is where a child actually hears a rhyme), and
        // asks for another. The prompt deliberately stays put: moving on
        // would read as the game giving up on them.
        //
        // Two wordings, ALTERNATING, so a child who offers three words in a
        // row is never handed the identical sentence three times.
        ctx.audio.blip()
        ctx.say([{
          kind: 'text',
          text: ctx.t(hmms++ % 2 === 0 ? 'rhyme.hmm' : 'rhyme.hmm.b', {
            word: display(answer), prompt: display(family.word),
          }),
          tone: 'plain',
        }])
        ask()
      },

      /**
       * Names the rhymes that were found, never how many. A child who opens
       * this and presses ESC straight away gets a warm line — never a bare
       * "0", and never a template left dangling around a missing value.
       */
      souvenir() {
        if (pairs.length === 0) return ctx.t('rhyme.souvenir.none')
        const shown = pairs.slice(0, PAIR_CAP)
          .map((p) => ctx.t('rhyme.pair', { a: display(p.a), b: display(p.b) }))
          .join(', ')
        // The conjunction lives in exactly two places and they never meet:
        // inside a single pair ("cat and hat"), and once at the end of an
        // overflowing list ("— and more!"). Pairs themselves are joined by
        // commas alone, so no join can ever double an "and".
        return pairs.length > PAIR_CAP
          ? ctx.t('rhyme.souvenir.more', { list: shown })
          : ctx.t('rhyme.souvenir', { list: shown })
      },
    }
  },
}

export default cartridge
