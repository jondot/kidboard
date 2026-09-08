/**
 * WHAT KIND OF THING A MACHINE'S PROMPT IS.
 *
 * Shared by `InputLine` (the live line) and `BlockView` (every echoed line
 * already in the transcript), because those two draw the same prompt and a
 * chevron that mirrors in one and not the other is worse than one that mirrors
 * in neither.
 *
 * - `chevron` — it POINTS. `styles.css` mirrors it under Hebrew: an arrow
 *   saying "your words go this way" has to turn round when the words do, or it
 *   sits at the right end of an RTL line aimed off the edge of the screen.
 * - `word`   — `READY`, `מוכן`. A word points at nothing and never mirrors.
 * - `glyph`  — `?`. Mirroring a question mark makes it a different mark.
 */
export type PromptKind = 'chevron' | 'word' | 'glyph'

/**
 * Mirrored with a CSS transform rather than by swapping the character: `❮` is
 * a different glyph with different metrics, and the two would not sit the same
 * on the line.
 */
const POINTING = new Set(['>', '\u276F', '\u279C', '\u00BB', '\u25B8', '\u25B6'])

export function promptKind(prompt: string): PromptKind {
  if (POINTING.has(prompt)) return 'chevron'
  return /\p{L}/u.test(prompt) ? 'word' : 'glyph'
}
