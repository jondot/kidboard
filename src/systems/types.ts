import type { Locale } from '../types'

/**
 * The four machines. A *theme* is a palette; a *system* is the machine — its
 * typeface, its frame language, whether there is scrollback, and what happens
 * to the screen when a game starts. Themes belong to systems.
 */
export type SystemId = 'kidtari' | 'kidcode' | 'crt' | 'omarchy'

/**
 * A theme id, as `Theme.id` in `src/theme/theme.ts` — a plain string there, so
 * a plain string here. Named so the `System` shape reads at a glance.
 */
export type ThemeId = string

/**
 * What happens to what has already been said.
 *
 * - `keep` — nothing is ever removed. Kid Code, Omarchy.
 * - `clearOnExit` — when a live cartridge exits the transcript is emptied and
 *   a fresh prompt is shown. Kidtari: a game is a mode, and the past is gone.
 * - `surface` — a single screen: a fixed drawing field plus a command area
 *   that scrolls independently. CRT / Logo.
 */
export type Scrollback = 'keep' | 'clearOnExit' | 'surface'

/**
 * How a game arrives.
 *
 * - `inline` — the game block sits in the transcript where it was started.
 * - `fullscreen` — the game replaces the whole terminal; no prompt, no chrome.
 * - `field` — the game draws into the persistent upper field; the command line
 *   below stays visible, in place, and unmoved. It does NOT keep taking input:
 *   a running cartridge owns every key, and a game that stops responding
 *   because focus wandered into a text box is a far worse failure for a
 *   six-year-old than a prompt that waits its turn.
 * - `pane` — the game opens in a bordered pane below the transcript, which
 *   stays.
 */
export type GameEntry = 'inline' | 'fullscreen' | 'field' | 'pane'

/**
 * Where a live cartridge's `hints()` are rendered.
 *
 * NO SYSTEM RENDERS THEM IN A BOTTOM STATUS BAR, and `'statusBar'` is gone
 * from this union rather than merely unused. Omarchy had a powerline bar along
 * the foot carrying the machine, the palette, the language, the sound and the
 * hints — five things a child never reads, permanently occupying the bottom of
 * the screen, and a second place the language and the sound were stated after
 * the settings menu already states them. Its hints moved onto the title of the
 * pane the game is actually running in, which is where a child is already
 * looking.
 *
 * Per-game help is a system decision, and every one of the four now puts it
 * ON or BESIDE the game rather than in global chrome.
 */
export type HelpAt = 'label' | 'callLine' | 'onScreen' | 'paneTitle'

/** The typeface a system is drawn in. A CSS stack and its metrics; no loading. */
export type SystemFont = {
  /** A complete CSS `font-family` value, ending in a generic family. */
  stack: string
  /** Base cell size, in px. */
  size: number
  /** Unitless CSS `line-height`. */
  lineHeight: number
  /**
   * Whether the FIRST face in `stack` actually gives every character the same
   * advance — and it is not a formality, it decides whether this machine's
   * own typeface may be used to draw pictures.
   *
   * Two of the four faces here are display fonts, not monospaces. Measured in
   * Chrome at 32px: Silkscreen puts `0` at 24px, `M` at 28px and a space at
   * 16px; VT323 does the same. Neither has box-drawing glyphs at all, so a
   * frame around a drawing was already falling back to a third font at a
   * fourth width. Every `{ kind: 'art' }` grid on the Kidtari and the tube was
   * therefore ragged: the border came out dashed, the emoji inside it drifted
   * off their columns, and under Hebrew — where the ragged edge is the edge
   * you read from — it looked like the drawing had simply been left-aligned.
   *
   * So a drawing is set in this machine's face when the face can hold a grid,
   * and in the shared monospace when it cannot. Prose, the prompt, the
   * transcript and every piece of chrome keep the machine's own type either
   * way, which is where the seam is actually visible.
   */
  monospaced: boolean
}

/** Which frame furniture a system draws. All four flags always present. */
export type SystemChrome = {
  welcome: boolean
  promptBox: boolean
  spinner: boolean
}

/**
 * THE WINDOW THE MACHINE LIVES IN.
 *
 * Not decoration and not a theme: it is the thing a child sees FIRST, before a
 * single character is drawn, and it is what says which computer this is. Each
 * value names a real piece of hardware or a real window manager, and
 * `chrome/Window.tsx` draws one variant per value:
 *
 * - `tv`     — a television set. A Kidtari has no windows; it has a set with a
 *              moulded bezel, a wordmark and a power lamp, and the picture is
 *              inset in it.
 * - `mac`    — a macOS terminal window: traffic lights, a tab strip, a title.
 * - `monitor`— a monochrome monitor on a desk. Same reason as `tv`: a Logo
 *              machine had no window manager to imitate.
 * - `tiling` — a tiling compositor: a thin accent border, rounded corners, and
 *              a bar across the top carrying workspaces and the window title.
 *              This is Hyprland, which is what Omarchy actually is.
 */
export type WindowKind = 'tv' | 'mac' | 'monitor' | 'tiling'

export type System = {
  id: SystemId
  /**
   * An i18n KEY, not a phrase. Resolve it through `makeT`; the English lives
   * in `./strings.ts` (see the note there on why not `src/i18n/en.json`).
   */
  name: string
  /**
   * What the child's input line is prefixed with, PER LANGUAGE.
   *
   * A machine's prompt is part of its identity — `READY` is a Kidtari, `?` is a
   * Logo — so it is data here rather than a branch on `system.id` inside four
   * shells. It is a table rather than a string because `READY` is a WORD: a
   * Hebrew-reading six-year-old was being shown a Latin word they cannot read,
   * at the exact spot where they are asked to type. The symbols (`?`, `>`,
   * `❯`) are the same in both languages and simply repeat.
   */
  prompt: Record<Locale, string>
  font: SystemFont
  /** The themes that belong to this system, in picker order. */
  themes: readonly ThemeId[]
  /** Always a member of `themes`; enforced by `systems.test.ts`. */
  defaultTheme: ThemeId
  scrollback: Scrollback
  gameEntry: GameEntry
  helpAt: HelpAt
  chrome: SystemChrome
  /** The window this machine is drawn inside. */
  window: WindowKind
}

/** A valid, persistable choice: a system and one of *its* themes. */
export type Selection = { system: SystemId; theme: ThemeId }

/** Re-exported so `systems/*` consumers need not reach into `src/types`. */
export type { Locale }
