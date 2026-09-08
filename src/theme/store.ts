import { themeById } from './themes'

/**
 * One of five persisted keys: `kb.locale`, `kb.muted`, `kb.theme`,
 * `kb.system` and `kb.text` — nothing else, ever. `kb.system` arrived with
 * the systems layer and is written by `systems/store.ts`, which owns the
 * PAIR; `kb.text` is how big the prose is and is written by
 * `chrome/textSize.ts`. This module still owns the spelling of this key, so
 * the two halves of the pair cannot drift.
 */
const KEY = 'kb.theme'

export function loadThemeId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    // A sandboxed iframe or a browser with storage disabled. The system
    // preference decides instead, which is exactly the no-choice-stored case.
    return null
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Persistence is a nicety; the choice still holds for this session.
  }
}

/**
 * THE OPERATING SYSTEM NO LONGER GETS A VOTE, AND THAT IS THE DESIGN.
 *
 * `prefersDark`, `pickTheme` and `initialTheme` lived here and are gone. They
 * answered "what should a child with no stored choice see?" with the OS's
 * light/dark preference, which was right when a theme was a free-floating
 * palette. It is not right now: a palette belongs to a MACHINE, and a machine
 * has a look. There is no light Kidtari — "is this console in light mode?" has
 * no answer — so guessing at the OS's mood could only dress a machine in
 * someone else's clothes.
 *
 * `systems/store.ts` answers it instead, and with a fact rather than a guess:
 * a child with no stored choice gets the default machine and that machine's
 * own default palette. `initialSelection` is the entry point.
 *
 * What stays here is the SPELLING of `kb.theme`, so the two halves of the
 * persisted pair cannot drift apart.
 */

export { themeById }
