import { GALLERY } from '../theme/themes'
import type { System, SystemId, ThemeId } from './types'

/**
 * The four machines, as data.
 *
 * Nothing here is a component and nothing here touches the DOM: a system is a
 * description a shell reads, so the whole registry stays testable and a fifth
 * machine is one entry in `SYSTEMS`.
 *
 * ---- on theme ids -------------------------------------------------------
 *
 * A theme id is scoped to its system, so the ids below are prefixed with the
 * system that owns them (`kidtari-classic-blue`, not `classic-blue`). Two
 * reasons, both real: the Omarchy gallery already ships a theme called
 * `white`, which would collide with CRT's P4 White, and `dark`/`light` name
 * nothing at all on their own.
 *
 * Omarchy's list is DERIVED from `theme/themes.ts` rather than retyped, so it
 * is 22 real ids by construction and a 23rd gallery theme needs no edit here.
 *
 * The eight non-Omarchy palettes (kidtari-*, kid code-*, crt-*) ship in
 * `theme/systems/` and are registered through `theme/systemThemes.ts`, so
 * every id below resolves through `themeById`. Validity is still decided
 * HERE, from the system's own list, rather than from whether a palette
 * happens to parse: a pair is valid when the machine owns it, and a palette
 * that failed to load falls back to the renderer's last resort rather than
 * to an error. Nothing crashes either way.
 */

const KIDTARI_THEMES: readonly ThemeId[] = [
  'kidtari-classic-blue',
  'kidtari-console-black',
  'kidtari-warm-plastic',
]

const KIDCODE_THEMES: readonly ThemeId[] = ['kidcode-dark', 'kidcode-light']

/**
 * Green first, and green is the default. P1 is the phosphor most people
 * picture when they picture a terminal — a VT100, an Apple II monitor, a Logo
 * turtle — and it is what this machine should boot into. Amber and white are
 * the other two tubes you could actually buy.
 */
const CRT_THEMES: readonly ThemeId[] = ['crt-p1-green', 'crt-p3-amber', 'crt-p4-white']

/** All 22, in the order the gallery ships them. Never a hand-typed list. */
const OMARCHY_THEMES: readonly ThemeId[] = GALLERY.map((t) => t.id)

/**
 * Kidtari. Bitmap type, 40x24 feel, upper case, block cursor, `READY` prompt.
 * A game is a MODE: it takes the screen, and when it exits the past is gone.
 * Help is a label strip above the game, the way it was printed on a cartridge.
 */
export const KIDTARI: System = {
  id: 'kidtari',
  name: 'system.kidtari',
  prompt: { en: 'READY', he: 'מוכן' },
  font: {
    stack: '"Silkscreen", "Press Start 2P", ui-monospace, monospace',
    size: 18,
    lineHeight: 1.6,
    // Silkscreen is a display face, not a monospace: `0` and `M` and a space
    // are three different widths, and it has no box-drawing glyphs at all.
    monospaced: false,
  },
  themes: KIDTARI_THEMES,
  defaultTheme: 'kidtari-classic-blue',
  scrollback: 'clearOnExit',
  gameEntry: 'fullscreen',
  helpAt: 'label',
  chrome: { welcome: false, promptBox: false, spinner: false },
  window: 'tv',
}

/**
 * Kid Code. Rounded welcome box, `⏺` call / `⎿` result lines, a bordered
 * prompt box and a spinner. Nothing is ever removed; a finished game stays in
 * history as a still under its own call line, which is also where its help
 * lives.
 */
export const KIDCODE: System = {
  id: 'kidcode',
  name: 'system.kidcode',
  prompt: { en: '❯', he: '❯' },
  font: {
    stack: '"JetBrains Mono", "Miriam Mono CLM", "Cousine", ui-monospace, monospace',
    monospaced: true,
    size: 16,
    lineHeight: 1.5,
  },
  themes: KIDCODE_THEMES,
  defaultTheme: 'kidcode-dark',
  scrollback: 'keep',
  gameEntry: 'inline',
  helpAt: 'callLine',
  chrome: { welcome: true, promptBox: true, spinner: true },
  window: 'mac',
}

/**
 * CRT / Logo. Phosphor type, scanlines, `?` prompt, block cursor. ONE surface:
 * a permanent drawing field above a permanent command line, so a game draws
 * into the field and the prompt below never moves — it stays visible and in
 * place, though a running cartridge still owns the keyboard (see `GameEntry`).
 * Help is drawn on the game screen itself, because there is no other chrome.
 */
export const CRT: System = {
  id: 'crt',
  name: 'system.crt',
  prompt: { en: '?', he: '?' },
  font: {
    stack: '"VT323", "Silkscreen", ui-monospace, monospace',
    // VT323 draws a lovely tube and a very uneven grid. See `SystemFont`.
    monospaced: false,
    size: 22,
    lineHeight: 1.25,
  },
  themes: CRT_THEMES,
  defaultTheme: 'crt-p1-green',
  scrollback: 'surface',
  gameEntry: 'field',
  helpAt: 'onScreen',
  chrome: { welcome: false, promptBox: false, spinner: false },
  window: 'monitor',
}

/**
 * Omarchy. Ligature mono in a Hyprland window: a thin accent border, rounded
 * corners and a bar across the top, with a bordered pane that opens under the
 * transcript, which stays. A quattro theme is a whole identity, so this system
 * owns the entire 22-theme gallery; help rides on the pane's own title, beside
 * the game it belongs to.
 */
export const OMARCHY: System = {
  id: 'omarchy',
  name: 'system.omarchy',
  prompt: { en: '➜', he: '➜' },
  font: {
    stack: '"Fira Code", "JetBrains Mono", ui-monospace, monospace',
    monospaced: true,
    size: 16,
    lineHeight: 1.5,
  },
  themes: OMARCHY_THEMES,
  defaultTheme: 'hackerman',
  scrollback: 'keep',
  gameEntry: 'pane',
  helpAt: 'paneTitle',
  chrome: { welcome: false, promptBox: false, spinner: false },
  window: 'tiling',
}

/** Every system, in picker order. */
/**
 * THE FACE A DRAWING FALLS BACK TO, as a literal string.
 *
 * A literal, and not `var(--font-kb-mono)`, because that token does not
 * survive the build: Tailwind v4 only emits an `@theme` entry that one of its
 * generated utilities actually uses, and nothing uses this one as a utility —
 * it is only ever read from hand-written CSS. `--font-kb-mono` is therefore
 * absent from `dist`, and every `var(--font-kb-mono)` read in production
 * resolved to nothing at all and fell through to the inherited font.
 *
 * That is exactly how a drawing on the Kidtari came to be set in Silkscreen
 * even after being told not to be. Keeping the stack here, in data, means the
 * value crosses into the page as a string that cannot be optimised away.
 */
export const MONO_STACK =
  '"JetBrains Mono", "Miriam Mono CLM", "Cousine", ui-monospace, monospace'

export const SYSTEMS: readonly System[] = [KIDTARI, KIDCODE, CRT, OMARCHY]

export const SYSTEM_IDS: readonly SystemId[] = SYSTEMS.map((s) => s.id)

/** The machine a child who has never chosen gets. */
export const DEFAULT_SYSTEM_ID: SystemId = 'kidtari'
