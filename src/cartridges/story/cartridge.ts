import type { TurnCartridge } from '../../types'
import en from './en.json'
import he from './he.json'

const PROMPTS = ['story.ask.animal', 'story.ask.color', 'story.ask.food'] as const
const LINES = ['story.line1', 'story.line2', 'story.line3'] as const

const cartridge: TurnCartridge = {
  kind: 'turn',
  apiVersion: 1,
  id: 'story',
  // he: real Hebrew for "story" (not a transliteration) — a Hebrew-speaking
  // child types Hebrew, not romanised Hebrew.
  triggers: { en: ['story'], he: ['סיפור'], emoji: ['📖'] },
  locales: ['en', 'he'],
  strings: { en, he },

  // The shell owns the ESC hint; see invariants.test.ts.
  hints: (t) => [
    { keys: '↵', label: t('story.answer') },
  ],

  create(ctx) {
    let answers: string[] = []
    /**
     * The title of the last story that was actually finished. THE PACING
     * RULE: telling the third answer used to call ctx.exit() on the spot, so
     * the shell collapsed the tale into a one-line row the same instant it
     * appeared. The finished story now HOLDS in the transcript and the next
     * line the child types — any line — starts another one. `answers` is
     * emptied for that next story, so the souvenir keeps its own copy of the
     * title rather than reading a half-answered array.
     */
    let told = ''

    const ask = (): void => {
      ctx.say([{
        kind: 'text',
        text: ctx.t(PROMPTS[answers.length]!),
        // MONOCHROME: the whole conversation is the theme's own ink. The one
        // second tone is saved for the story itself — the thing the child
        // made.
        tone: 'plain',
        scale: 'big',
      }])
    }

    return {
      start: ask,

      onLine(text) {
        // Holding on a finished story. Any line at all begins a new one.
        if (told && answers.length === PROMPTS.length) {
          answers = []
          ask()
          return
        }

        // Every answer is accepted. There is nothing to get wrong here.
        answers.push(text.trim())
        if (answers.length < PROMPTS.length) {
          ask()
          return
        }

        const vars = {
          animal: answers[0]!, color: answers[1]!, food: answers[2]!,
        }
        told = ctx.t('story.title', vars)
        ctx.say([
          // The heading IS the story's own title — built from what this
          // child actually said, not a generic "your story" caption — and
          // `souvenir()` below returns this exact same string, so the
          // collapsed block in the transcript names the tale by its title.
          //
          // No `rainbow`: a rainbow is every tone at once, which is the one
          // thing the palette rule forbids outright. `win` alone already
          // says "this is yours, and it is finished".
          { kind: 'text', text: told, tone: 'win', scale: 'giant' },
          ...LINES.map((k) => ({
            kind: 'text' as const, text: ctx.t(k, vars), tone: 'plain' as const,
          })),
          { kind: 'text', text: ctx.t('story.more'), tone: 'plain' },
        ])
      },

      // ESC (or a quit word) can end the turn before every answer was given.
      // `story.title` needs all three of {animal, color, food} — interpolating
      // it with a missing answer would leave a dangling, malformed fragment
      // ("the story" with an empty gap where the color should be), which is
      // the exact bug shape this cartridge shipped once already (a dangling
      // "a story about a " when only the animal had been answered). So the
      // souvenir names the last story that was actually FINISHED, and is
      // empty until one is — never a template around a missing value.
      souvenir: () => told,
    }
  },
}

export default cartridge
