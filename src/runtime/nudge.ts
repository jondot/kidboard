import type { Locale, Rng } from '../types'

export type Challenge = {
  prompt: string
  answers: string[]
  hintKey: string
}

/**
 * Answers are stored lowercase and are matched case- and whitespace-
 * tolerantly (see `tryAnswer`). Hebrew answers are written as literal
 * Hebrew script — no transliteration — so a Hebrew-speaking child is asked
 * to type a Hebrew word, never an English one.
 *
 * NOTE: every Hebrew string below should get a native-speaker review pass;
 * see the task report for the full back-translation table and the reasoning
 * on the two count challenges (fish/stars), where Hebrew's gender-agreement
 * on numerals means more than one spelled-out answer is plausible from a
 * 6-year-old.
 */
export const CHALLENGES: Record<Locale, Challenge[]> = {
  en: [
    { prompt: '🐱', answers: ['cat'], hintKey: 'nudge.animal' },
    { prompt: '🐶', answers: ['dog'], hintKey: 'nudge.animal' },
    { prompt: '🐸', answers: ['frog'], hintKey: 'nudge.animal' },
    { prompt: '🐍', answers: ['snake'], hintKey: 'nudge.animal' },
    { prompt: '🚀', answers: ['rocket'], hintKey: 'nudge.what' },
    { prompt: '🚛', answers: ['truck'], hintKey: 'nudge.what' },
    { prompt: '🔴', answers: ['red'], hintKey: 'nudge.color' },
    { prompt: '🔵', answers: ['blue'], hintKey: 'nudge.color' },
    { prompt: '🐟🐟🐟', answers: ['3', 'three'], hintKey: 'nudge.count' },
    { prompt: '⭐⭐⭐⭐⭐', answers: ['5', 'five'], hintKey: 'nudge.count' },
  ],
  he: [
    { prompt: '🐱', answers: ['חתול'], hintKey: 'nudge.animal' },
    { prompt: '🐶', answers: ['כלב'], hintKey: 'nudge.animal' },
    { prompt: '🐸', answers: ['צפרדע'], hintKey: 'nudge.animal' },
    { prompt: '🐍', answers: ['נחש'], hintKey: 'nudge.animal' },
    { prompt: '🚀', answers: ['טיל', 'רקטה'], hintKey: 'nudge.what' },
    { prompt: '🚛', answers: ['משאית'], hintKey: 'nudge.what' },
    { prompt: '🔴', answers: ['אדום'], hintKey: 'nudge.color' },
    { prompt: '🔵', answers: ['כחול'], hintKey: 'nudge.color' },
    // דג (fish) is grammatically masculine, so "שלושה" is the noun-agreeing
    // form; "שלוש" is the bare/abstract counting form Hebrew-speaking
    // children learn first when reciting numbers. Both are accepted, plus
    // the numeral, so neither a "correct in spirit" answer nor grammatical
    // gender ever counts as a miss.
    { prompt: '🐟🐟🐟', answers: ['3', 'שלוש', 'שלושה'], hintKey: 'nudge.count' },
    // כוכב (star) is likewise masculine; same reasoning as above.
    { prompt: '⭐⭐⭐⭐⭐', answers: ['5', 'חמש', 'חמישה'], hintKey: 'nudge.count' },
  ],
}

export type Nudger = {
  onInput(recognized: boolean): Challenge | null
  tryAnswer(text: string): boolean
  readonly pending: Challenge | null
}

export function makeNudger(o: { rng: Rng; locale: Locale }): Nudger {
  const pool = CHALLENGES[o.locale].length ? CHALLENGES[o.locale] : CHALLENGES.en
  let run = 0
  // After three or four unrecognized inputs, a picture challenge appears.
  // The randomization is deliberate — a fixed cadence would feel
  // mechanical; this is meant to land as a small, organic surprise for a
  // 6-year-old, not a metronome. Re-rolled after every fire so later runs
  // (within the same nudger) also vary between 3 and 4.
  let threshold = 3 + o.rng.int(2)
  let pending: Challenge | null = null

  return {
    get pending() { return pending },

    onInput(recognized) {
      if (recognized) { run = 0; return null }
      if (pending) return null // never stack two challenges
      run += 1
      if (run < threshold) return null
      run = 0
      threshold = 3 + o.rng.int(2)
      pending = o.rng.pick(pool)
      return pending
    },

    tryAnswer(text) {
      if (!pending) return false
      const guess = text.trim().toLowerCase()
      const hit = pending.answers.includes(guess)
      // Right or wrong, the challenge is over. A miss costs the child
      // nothing and is never mentioned again.
      pending = null
      return hit
    },
  }
}
