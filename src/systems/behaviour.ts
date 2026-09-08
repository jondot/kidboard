import type { GameEntry, HelpAt, System } from './types'

/**
 * The behavioural questions a shell asks a system, as pure functions.
 *
 * They exist so the answers are TESTED DATA rather than a condition buried in
 * a component: "does the transcript clear when a game exits" is the difference
 * between Kidtari and Kid Code, and it should be readable in one line.
 *
 * Every one of them is total over the unions in `./types.ts` and has no
 * swallowing default: a fifth `scrollback` or `gameEntry` is a TYPE ERROR at
 * `assertNever`, not a silently wrong screen.
 */

function assertNever(x: never): never {
  throw new Error(`[kidboard] unhandled system behaviour: ${String(x)}`)
}

/**
 * When a live cartridge exits, is the transcript emptied?
 *
 * Kidtari alone says yes: a game is a mode, and leaving it leaves a cleared
 * `READY`. `surface` does not clear — the CRT field keeps its last drawing.
 */
export function clearsTranscriptOnExit(s: System): boolean {
  switch (s.scrollback) {
    case 'clearOnExit': return true
    case 'keep': return false
    case 'surface': return false
    default: return assertNever(s.scrollback)
  }
}

/** Nothing is ever removed: Kid Code and Omarchy. */
export function keepsScrollback(s: System): boolean {
  switch (s.scrollback) {
    case 'keep': return true
    case 'clearOnExit': return false
    case 'surface': return false
    default: return assertNever(s.scrollback)
  }
}

/** One screen — a fixed field plus a command area that scrolls on its own. */
export function isSingleSurface(s: System): boolean {
  switch (s.scrollback) {
    case 'surface': return true
    case 'keep': return false
    case 'clearOnExit': return false
    default: return assertNever(s.scrollback)
  }
}

/** Where a live cartridge's `hints()` render. Never a global bottom bar. */
export function helpAtOf(s: System): HelpAt {
  switch (s.helpAt) {
    case 'label':
    case 'callLine':
    case 'onScreen':
    case 'paneTitle':
      return s.helpAt
    default: return assertNever(s.helpAt)
  }
}

/**
 * Does the help sit with the game rather than in the surrounding frame?
 * True where the game owns the drawing area: Kidtari's label strip above the
 * full-screen game, and CRT's hints drawn on the field itself.
 */
export function helpRendersOverTheGame(s: System): boolean {
  switch (helpAtOf(s)) {
    case 'label': return true
    case 'onScreen': return true
    case 'callLine': return false
    case 'paneTitle': return false
  }
}

/** How a game arrives. */
export function gameEntryOf(s: System): GameEntry {
  switch (s.gameEntry) {
    case 'inline':
    case 'fullscreen':
    case 'field':
    case 'pane':
      return s.gameEntry
    default: return assertNever(s.gameEntry)
  }
}

/** The game replaces the whole terminal: no prompt, no chrome. Kidtari. */
export function gameIsFullscreen(s: System): boolean {
  return gameEntryOf(s) === 'fullscreen'
}

/**
 * Can the child still see what was said while a game runs? Everywhere the
 * game does not take the screen — inline blocks, the CRT command line under
 * the field, Omarchy's pane below the transcript.
 */
export function transcriptStaysVisibleDuringGame(s: System): boolean {
  switch (gameEntryOf(s)) {
    case 'fullscreen': return false
    case 'inline': return true
    case 'field': return true
    case 'pane': return true
  }
}
