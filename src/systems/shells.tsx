import type { Shell } from './Shell'
import { pickSystem } from './store'
import type { SystemId } from './types'
import { KidtariShell } from './shells/kidtari'
import { KidCodeShell } from './shells/kidcode'
import { CrtShell } from './shells/crt'
import { OmarchyShell } from './shells/omarchy'

/**
 * id -> face. The one place a `SystemId` becomes a component.
 *
 * Typed as a total `Record<SystemId, Shell>`, so a fifth machine added to
 * `SystemId` without a shell is a TYPE ERROR here rather than a blank screen
 * a child finds later.
 */
export const SHELLS: Record<SystemId, Shell> = {
  kidtari: KidtariShell,
  kidcode: KidCodeShell,
  crt: CrtShell,
  omarchy: OmarchyShell,
}

/**
 * The shell for an id, whatever the id is.
 *
 * A string that names no machine falls back through `pickSystem` — the same
 * rule `kb.system` is read with, and the reason a corrupt stored id or a stale
 * link can never reach a child as an error. Nothing here throws.
 */
export function shellFor(id: string | null | undefined): Shell {
  return SHELLS[pickSystem(id).id]
}
