/**
 * THE MACHINE TYPING FOR ITSELF, ONCE.
 *
 * The last third of an arcade cabinet's attract loop is the machine PLAYING
 * ITSELF: Pac-Man being chased around a board nobody is steering, barrels
 * rolling at a climber nobody is moving. A child stood and watched it, and
 * learned the game before they ever spent a coin — no reading, no
 * instructions, and nothing to press.
 *
 * This is that, for a machine whose whole verb is typing. On a child's very
 * first visit, after the card, a word appears in the prompt one letter at a
 * time and then runs. Not a picture of a word being typed — the real prompt,
 * the real word, the real answer underneath it. What a child sees is the
 * exact thing they are about to do.
 *
 * IT RUNS ONCE, AND ONLY EVER ONCE. An arcade cabinet loops because nobody is
 * there; a transcript is a record of what happened, and a machine that types
 * into its own prompt every twenty seconds is filling a child's history with
 * lines they did not write. One demonstration is a demonstration. Two is a
 * nag.
 *
 * ANYTHING THE CHILD DOES STOPS IT DEAD. That is the coin going in.
 *
 * No React, no DOM: a caller hands in two callbacks and gets back the way to
 * cancel. That is what makes the timing testable without rendering anything.
 */

/** How long each letter waits, and how long the finished word sits there. */
export const LETTER_MS = 170
export const HOLD_MS = 700
/** …and the beat before the first letter, so the card is read first. */
export const LEAD_MS = 900

export type TypeOpts = {
  /** The word so far, on every letter. Called with '' to open the prompt. */
  onFrame(text: string): void
  /** The word is finished and the beat has passed: run it. */
  onDone(): void
  letterMs?: number
  holdMs?: number
  leadMs?: number
  /** Injectable for tests; the real one is `setTimeout`. */
  wait?: (fn: () => void, ms: number) => unknown
  clear?: (handle: unknown) => void
}

/**
 * Types `word` out and then runs it. Returns the cancel: calling it stops the
 * sequence wherever it is and never calls `onDone`, which is what makes "the
 * child touched something" a single line at every call site.
 */
export function typeOut(word: string, o: TypeOpts): () => void {
  const letterMs = o.letterMs ?? LETTER_MS
  const holdMs = o.holdMs ?? HOLD_MS
  const leadMs = o.leadMs ?? LEAD_MS
  const wait = o.wait ?? ((fn, ms) => setTimeout(fn, ms))
  const clear = o.clear ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  const letters = [...word]
  let handle: unknown = null
  let stopped = false

  const step = (i: number): void => {
    if (stopped) return
    if (i > letters.length) { o.onDone(); return }
    o.onFrame(letters.slice(0, i).join(''))
    // The last step is the HOLD: the finished word sits in the prompt for a
    // beat before it runs, because a word that vanishes the instant it is
    // complete was never on screen long enough to be copied.
    handle = wait(() => step(i + 1), i === letters.length ? holdMs : letterMs)
  }

  handle = wait(() => step(0), leadMs)

  return () => {
    stopped = true
    if (handle !== null) clear(handle)
    handle = null
  }
}
