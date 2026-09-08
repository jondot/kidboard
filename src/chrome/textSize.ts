/**
 * HOW BIG THE WORDS ARE, and nothing else about them.
 *
 * A grown-up reading over a child's shoulder, a child with a long word to
 * spell out, a tablet held at arm's length — three reasons the prose wants to
 * be bigger, and none of them is a reason to make the GAMES bigger. A game
 * sizes itself from the width of its container (see `runtime/GridCanvas.ts`),
 * which this setting never touches, and a drawing is a picture at the size
 * its cartridge asked for. So this moves exactly two things: what the machine
 * says, and the line the child types into.
 *
 * ONE MULTIPLIER, not a font size. Every machine has its own type size
 * (`SystemFont.size`) and the Kidtari's is not Kid Code's; a setting that
 * declared "16px" would flatten that difference and undo half of what makes
 * four machines four machines. `--kb-text-scale` multiplies whatever the
 * machine already chose, so a bigger Kidtari is still a Kidtari.
 *
 * THE STEPS ARE NAMED, not numbered. There is no percentage anywhere a child
 * can see, and the three of them are far enough apart that picking one is a
 * visible answer rather than a nudge.
 */
export type TextSize = 'normal' | 'big' | 'bigger'

export const TEXT_SIZES: readonly TextSize[] = ['normal', 'big', 'bigger']

/** The multiplier each step applies to the machine's own type size. */
export const SCALE_OF: Record<TextSize, number> = {
  normal: 1,
  big: 1.3,
  bigger: 1.7,
}

/**
 * The fifth persisted key, after `kb.locale`, `kb.muted`, `kb.theme` and
 * `kb.system`. Written only when a child picks a size — a default is not a
 * choice, and an unasked-for key in someone's browser storage is litter.
 */
const KEY = 'kb.text'

export const DEFAULT_TEXT_SIZE: TextSize = 'normal'

const known = (s: string | null): s is TextSize =>
  s !== null && (TEXT_SIZES as readonly string[]).includes(s)

export function loadTextSize(): TextSize {
  try {
    const raw = localStorage.getItem(KEY)
    // A value from an older or newer build, or from a child with devtools
    // open, is simply not a size — and the answer to "not a size" is the
    // machine's own, never a broken layout.
    return known(raw) ? raw : DEFAULT_TEXT_SIZE
  } catch {
    // A sandboxed iframe, or storage switched off. The session still works.
    return DEFAULT_TEXT_SIZE
  }
}

export function saveTextSize(size: TextSize): void {
  try {
    localStorage.setItem(KEY, size)
  } catch {
    // Persistence is a nicety; the choice still holds for this session.
  }
}
