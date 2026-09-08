import type { Cartridge, Locale } from '../types'

export type RegistryOpts = {
  /**
   * `true` rethrows the first bad module. The TEST suite builds strictly, so
   * an unsupported apiVersion, a duplicate id, a missing default export or an
   * empty `locales` list still hard-fails and gates contributions exactly as
   * before.
   *
   * At RUNTIME the default is `false`: this project's premise is that
   * strangers drop folders in, and `buildRegistry` runs at module evaluation.
   * A single bad module throwing there blanks the whole page — the child's
   * terminal never appears at all. A bad cartridge should cost its own
   * cartridge, not the playground.
   */
  strict?: boolean
}

/** Pure, injectable core so the registry is testable without real folders. */
export function buildRegistry(
  mods: Record<string, unknown>,
  o: RegistryOpts = {},
): Cartridge[] {
  const out: Cartridge[] = []
  const seen = new Set<string>()

  for (const path of Object.keys(mods).sort()) {
    if (path.includes('/_template/')) continue
    try {
      const c = (mods[path] as { default?: Cartridge }).default
      if (!c) throw new Error(`${path}: cartridge must have a default export`)
      if (c.apiVersion !== 1) {
        throw new Error(`${path}: unsupported apiVersion ${String(c.apiVersion)}`)
      }
      if (!c.locales?.length) {
        throw new Error(`${path}: cartridge must declare at least one locale in "locales"`)
      }
      if (seen.has(c.id)) throw new Error(`duplicate cartridge id "${c.id}" at ${path}`)
      seen.add(c.id)
      out.push(c)
    } catch (err) {
      if (o.strict) throw err
      // Skip and warn: visible to whoever added the folder, invisible to the
      // child, and every other cartridge still loads.
      console.warn('[kidboard] skipping a cartridge that failed to load', err)
    }
  }
  return out
}

export function forLocaleIn(all: Cartridge[], locale: Locale): Cartridge[] {
  return all.filter((c) => c.locales.includes(locale))
}
