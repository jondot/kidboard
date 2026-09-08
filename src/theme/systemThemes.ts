import { themeFrom, type Theme } from './theme'

import kidtariClassicBlue from './systems/kidtari-classic-blue.toml?raw'
import kidtariConsoleBlack from './systems/kidtari-console-black.toml?raw'
import kidtariWarmPlastic from './systems/kidtari-warm-plastic.toml?raw'
import kidcodeDark from './systems/kidcode-dark.toml?raw'
import kidcodeLight from './systems/kidcode-light.toml?raw'
import crtP3Amber from './systems/crt-p3-amber.toml?raw'
import crtP1Green from './systems/crt-p1-green.toml?raw'
import crtP4White from './systems/crt-p4-white.toml?raw'

/**
 * The palettes that belong to a MACHINE rather than to the gallery.
 *
 * A theme is a palette; a system is the machine it runs on, and three of the
 * four machines have their own. They are authored in the same Omarchy
 * `colors.toml` schema as everything else — a palette is a palette — but they
 * are not gallery entries and never appear as free-floating choices: picking
 * `crt · P3 amber` outside the CRT is picking a phosphor for a machine that
 * has no tube. `src/systems/systems.ts` is what binds each id to its system,
 * and `switchSystem` is what refuses an invalid pair.
 *
 * Omarchy needs no entry here: its themes ARE the gallery, all 22 of them.
 *
 * Every one of these is deliberately near-monochrome — one ramp, one accent —
 * because the ground and the single ink are the same rule the cartridges are
 * held to. A machine whose chrome spends six hues would make every game drawn
 * on it look like a different product.
 */
const RAW: readonly [id: string, en: string, he: string, src: string][] = [
  ['kidtari-classic-blue', 'classic blue', 'כחול קלאסי', kidtariClassicBlue],
  ['kidtari-console-black', 'console black', 'שחור קונסולה', kidtariConsoleBlack],
  ['kidtari-warm-plastic', 'warm plastic', 'פלסטיק חמים', kidtariWarmPlastic],
  ['kidcode-dark', 'dark', 'כהה', kidcodeDark],
  ['kidcode-light', 'light', 'בהיר', kidcodeLight],
  ['crt-p3-amber', 'P3 amber', 'ענבר P3', crtP3Amber],
  ['crt-p1-green', 'P1 green', 'ירוק P1', crtP1Green],
  ['crt-p4-white', 'P4 white', 'לבן P4', crtP4White],
]

export const SYSTEM_THEMES: readonly Theme[] = RAW.map(([id, en, he, src]) =>
  themeFrom(id, { en, he }, src))
