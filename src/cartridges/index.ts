import { buildRegistry, forLocaleIn } from '../runtime/registry'
import { cartCartridges, onCartsChanged } from '../carts/registry'
import type { Cartridge, Locale } from '../types'

// Adding a folder with a cartridge.ts registers it. No central list to edit.
// Built non-strictly on purpose: this runs at module evaluation, so a single
// malformed folder throwing here would blank the entire page rather than cost
// only its own cartridge. The hard apiVersion / duplicate-id gate lives in
// the test suite (registry.test.ts builds with { strict: true }).
const mods = import.meta.glob('./*/cartridge.ts', { eager: true })

let cache: Cartridge[] | null = null

export function registry(): Cartridge[] {
  cache ??= buildRegistry(mods)
  return cache
}

export function byId(id: string): Cartridge | undefined {
  return registry().find((c) => c.id === id)
}

/**
 * The cartridges reachable in a language: the built-ins, plus whatever carts
 * the child has loaded.
 *
 * THE ARRAY IS REFILLED IN PLACE, and that is deliberate. The terminal asks
 * for this list once and memoizes it on the locale, because the built-ins
 * cannot change while the page is open — but a CART can arrive at any moment,
 * and the very next thing that happens is a child typing the word they were
 * just told to type. `resolve()` reads the array it was handed, so refilling
 * that same array is what makes a cart typeable the instant it lands, without
 * a new prop, a new context, or a re-render the toolbar would have to
 * coordinate.
 *
 * The consequence, stated rather than hidden: a component that memoizes on
 * this array's IDENTITY will not re-render when carts change. The 🃏 panel
 * subscribes to `onCartsChanged` for exactly that reason.
 */
const views = new Map<Locale, Cartridge[]>()

function fill(locale: Locale, into: Cartridge[]): Cartridge[] {
  const next = forLocaleIn([...registry(), ...cartCartridges()], locale)
  into.length = 0
  into.push(...next)
  return into
}

onCartsChanged(() => { for (const [locale, arr] of views) fill(locale, arr) })

export function forLocale(locale: Locale): Cartridge[] {
  let arr = views.get(locale)
  if (!arr) {
    arr = fill(locale, [])
    views.set(locale, arr)
  }
  return arr
}
