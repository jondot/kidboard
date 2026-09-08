import { loadThemeId, saveThemeId } from '../theme/store'
import { DEFAULT_SYSTEM_ID, SYSTEMS } from './systems'
import type { Selection, System, SystemId, ThemeId } from './types'

/**
 * Two persisted keys and no others: `kb.system` holds a `SystemId`, `kb.theme`
 * keeps holding a theme id. `kb.theme` is read and written through
 * `theme/store.ts` so the key itself is still declared in exactly one place.
 */
export const SYSTEM_KEY = 'kb.system'
export const THEME_KEY = 'kb.theme'

export function loadSystemId(): string | null {
  try {
    return localStorage.getItem(SYSTEM_KEY)
  } catch {
    // A sandboxed iframe, or storage switched off. No choice stored, then.
    return null
  }
}

export function saveSystemId(id: string): void {
  try {
    localStorage.setItem(SYSTEM_KEY, id)
  } catch {
    // Persistence is a nicety; the choice still holds for this session.
  }
}

/** Writes the pair. The only writer of both keys, so they cannot drift apart. */
export function saveSelection(sel: Selection): void {
  saveSystemId(sel.system)
  saveThemeId(sel.theme)
}

export function systemById(
  id: string | null | undefined,
  systems: readonly System[] = SYSTEMS,
): System | undefined {
  if (!id) return undefined
  return systems.find((s) => s.id === id)
}

/**
 * A stored id that names no system is treated as no choice at all rather than
 * as an error — the same rule `theme/store.ts` uses, and the reason a corrupt
 * `kb.system` can never reach a child as a broken screen.
 */
export function pickSystem(
  storedId: string | null | undefined,
  systems: readonly System[] = SYSTEMS,
): System {
  const stored = systemById(storedId, systems)
  if (stored) return stored
  const fallback = systems.find((s) => s.id === DEFAULT_SYSTEM_ID)
  // `systems[0]` is only reached by a caller passing a registry without kidtari
  // (the tests do); `SYSTEMS` always has it, and `KIDTARI` is the last word.
  return fallback ?? systems[0] ?? SYSTEMS[0] as System
}

/** True when this theme belongs to this system. The whole of "scoped". */
export function hasTheme(system: System, themeId: string | null | undefined): boolean {
  if (!themeId) return false
  return system.themes.includes(themeId)
}

/**
 * The system's answer to "may I show this theme?" — the theme itself when it
 * belongs here, the system's own default otherwise. Total: every input, valid
 * or not, yields a theme this system owns.
 */
export function themeFor(system: System, themeId: string | null | undefined): ThemeId {
  return hasTheme(system, themeId) ? (themeId as ThemeId) : system.defaultTheme
}

/**
 * The load path: whatever the two keys hold, resolved to a pair that is always
 * valid. An unknown system falls back to kidtari, and the theme is then judged
 * against the system that actually won — so a theme stored by an older,
 * system-less build never leaks into a system that does not own it.
 */
export function pickSelection(
  storedSystemId: string | null | undefined,
  storedThemeId: string | null | undefined,
  systems: readonly System[] = SYSTEMS,
): Selection {
  const system = pickSystem(storedSystemId, systems)
  return { system: system.id, theme: themeFor(system, storedThemeId) }
}

/**
 * THE LAUNCH FLAG: `?system=` and `?theme=` on the URL.
 *
 * Omarchy installs Kidboard as a web app whose launcher reads the desktop's
 * live theme out of `~/.local/state/omarchy/current/theme.name` and passes it
 * here, so the console comes up wearing whatever the machine is wearing. The
 * name in that file IS a theme id and needs no translating: `theme/gallery/`
 * holds Omarchy's own 22 `colors.toml` files under Omarchy's own names, so
 * there is no mapping table that could drift out of date.
 *
 * THE FLAG BEATS THE STORED PAIR, and that is the point rather than an
 * oversight. The flag describes the MACHINE this launch came from; the stored
 * pair only describes the last visit. A child who picks a palette inside the
 * app still keeps it — it is persisted exactly as before and holds for the
 * session — but the next launch from the desktop icon starts from the desktop
 * again. That is what "follows the system" means, and it is the same bargain
 * any app makes when it tracks the OS's dark mode.
 *
 * Whatever a flag says is judged by `pickSelection` and nothing else, so a
 * stale link, a theme belonging to another machine, or plain nonsense can
 * only ever produce a valid pair — never a broken screen.
 */
export function selectionFromSearch(
  search: string,
  systems: readonly System[] = SYSTEMS,
): Selection | null {
  const params = new URLSearchParams(search)
  const system = params.get('system')
  const theme = params.get('theme')
  // No flag at all is different from an empty one: `?theme=` is a launcher
  // that found no theme file, and should still be read as "this is Omarchy".
  if (system === null && theme === null) return null
  return pickSelection(system || loadSystemId(), theme || loadThemeId(), systems)
}

/** The query string, or none at all where there is no `location` to read. */
function currentSearch(): string {
  try {
    return window.location.search
  } catch {
    return ''
  }
}

/** What the very first render should use. Read synchronously — no flash. */
export function initialSelection(
  systems: readonly System[] = SYSTEMS,
  search: string = currentSearch(),
): Selection {
  return selectionFromSearch(search, systems)
    ?? pickSelection(loadSystemId(), loadThemeId(), systems)
}

/**
 * Switching machine.
 *
 * The current theme is CARRIED when the target system also owns it, and
 * otherwise replaced by the target's default. Carrying is the rule because the
 * palette is the child's choice and a switch is about the machine, not the
 * colours: if both machines can show it, taking it away would be a second,
 * unasked-for change. Today the four theme lists are disjoint, so carrying
 * never fires in practice — it is here so that the day a palette is offered by
 * two systems (say the gallery reaching Kid Code), the child keeps it
 * without anyone remembering to add a rule.
 *
 * An unknown target is a no-op rather than a reset: a picker cannot produce
 * one, so it means a bug or a stale link, and dropping a child's machine over
 * that would be the worse failure. The current pair is still re-validated on
 * the way out, so the result is valid either way.
 */
export function switchSystem(
  current: Selection,
  nextSystemId: string,
  systems: readonly System[] = SYSTEMS,
): Selection {
  const target = systemById(nextSystemId, systems)
  if (!target) return pickSelection(current.system, current.theme, systems)
  return { system: target.id, theme: themeFor(target, current.theme) }
}

/**
 * Picking a palette inside the current machine. A theme the machine does not
 * own is refused in favour of its default rather than accepted and rendered
 * from a palette that does not exist.
 */
export function selectTheme(
  current: Selection,
  themeId: string,
  systems: readonly System[] = SYSTEMS,
): Selection {
  const system = pickSystem(current.system, systems)
  return { system: system.id, theme: themeFor(system, themeId) }
}

/** The systems a picker should offer, and the themes inside the active one. */
export function themesOf(systemId: string | null | undefined): readonly ThemeId[] {
  return pickSystem(systemId).themes
}

export type { Selection, SystemId }
