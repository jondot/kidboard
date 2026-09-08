import type { Locale } from '../types'

/**
 * What a cart PNG actually carries.
 *
 * The shape is documented in full in `docs/CARTS.md`. Two fields there are
 * additions to the original design, and are called out because a reader will
 * wonder why a picture of a cartridge needs them:
 *
 *  - `size` — a `LiveCartridge` must declare `{ cols, aspect }` under
 *    apiVersion 1 and the design's manifest had nowhere to put it. Optional,
 *    with the same default the built-ins use, so an older manifest still
 *    loads.
 *  - `emoji` — one optional emoji trigger, so a cart can be reached by a
 *    child who cannot read either language. Optional.
 *
 * `apiVersion` is 1 and the loader rejects anything else, exactly as the
 * cartridge registry does.
 */
export type CartManifest = {
  apiVersion: 1
  id: string
  /** The word a child types. One per locale. */
  name: Partial<Record<Locale, string>>
  /** The name shown on the label. */
  title: Partial<Record<Locale, string>>
  author: string
  locales: Locale[]
  hints: Partial<Record<Locale, string[]>>
  strings: Partial<Record<Locale, Record<string, string>>>
  code: string
  size?: { cols: number; aspect: number }
  emoji?: string
}

export const DEFAULT_SIZE = { cols: 32, aspect: 4 / 3 }

/**
 * What `npm run pack-carts` stamps on the id of a built-in it packs, so that
 * `pop` the cartridge becomes `kidboard-pop` the cart. It is the one thing
 * that makes a downloaded built-in recognisable as itself when it is dropped
 * back in — see `sameBuiltIn` in `registry.ts`. `packed.test.ts` pins every
 * generated id to it.
 */
export const BUILT_IN_PREFIX = 'kidboard-'

/** Longest anything a stranger wrote is allowed to be. Mercy, not policy. */
const MAX_CODE = 256 * 1024
const MAX_TEXT = 200
const LOCALES: readonly Locale[] = ['en', 'he']

const str = (x: unknown, max = MAX_TEXT): string | null =>
  typeof x === 'string' && x.length > 0 && x.length <= max ? x : null

const textMap = (x: unknown): Partial<Record<Locale, string>> => {
  const out: Partial<Record<Locale, string>> = {}
  if (typeof x !== 'object' || x === null) return out
  for (const l of LOCALES) {
    const v = str((x as Record<string, unknown>)[l])
    if (v !== null) out[l] = v
  }
  return out
}

const listMap = (x: unknown): Partial<Record<Locale, string[]>> => {
  const out: Partial<Record<Locale, string[]>> = {}
  if (typeof x !== 'object' || x === null) return out
  for (const l of LOCALES) {
    const v = (x as Record<string, unknown>)[l]
    if (!Array.isArray(v)) continue
    out[l] = v.filter((s): s is string => typeof s === 'string').slice(0, 8)
  }
  return out
}

const stringsMap = (x: unknown): Partial<Record<Locale, Record<string, string>>> => {
  const out: Partial<Record<Locale, Record<string, string>>> = {}
  if (typeof x !== 'object' || x === null) return out
  for (const l of LOCALES) {
    const v = (x as Record<string, unknown>)[l]
    if (typeof v !== 'object' || v === null) continue
    const table: Record<string, string> = {}
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
      if (typeof s === 'string' && s.length <= MAX_TEXT * 4) table[k] = s
    }
    out[l] = table
  }
  return out
}

/**
 * Turns whatever was in the chunk into a manifest, or into `null`.
 *
 * Everything here arrives from a file a stranger wrote, so nothing is trusted
 * and nothing throws: a field of the wrong type is dropped, and a manifest
 * missing something load-bearing (an id, a name, runnable code, a locale) is
 * refused whole. Refusal is not an error state — the caller shows a warm line.
 */
export function readManifest(x: unknown): CartManifest | null {
  if (typeof x !== 'object' || x === null) return null
  const raw = x as Record<string, unknown>
  if (raw.apiVersion !== 1) return null

  const id = str(raw.id, 64)
  const code = str(raw.code, MAX_CODE)
  if (!id || !code) return null

  const name = textMap(raw.name)
  const title = textMap(raw.title)

  const declared = Array.isArray(raw.locales)
    ? LOCALES.filter((l) => (raw.locales as unknown[]).includes(l))
    : []
  // A cart is only reachable in a language it has a WORD in, so the locale
  // list is intersected with the names rather than believed.
  const locales = declared.filter((l) => name[l] !== undefined)
  if (locales.length === 0) return null

  const sizeRaw = raw.size as { cols?: unknown; aspect?: unknown } | undefined
  const cols = typeof sizeRaw?.cols === 'number' ? sizeRaw.cols : NaN
  const aspect = typeof sizeRaw?.aspect === 'number' ? sizeRaw.aspect : NaN
  const size = Number.isFinite(cols) && cols > 0 && cols <= 200
    && Number.isFinite(aspect) && aspect > 0 && aspect <= 8
    ? { cols: Math.round(cols), aspect }
    : DEFAULT_SIZE

  const emoji = str(raw.emoji, 8)

  return {
    apiVersion: 1,
    id,
    name,
    title,
    author: str(raw.author) ?? '',
    locales,
    hints: listMap(raw.hints),
    strings: stringsMap(raw.strings),
    code,
    size,
    ...(emoji ? { emoji } : {}),
  }
}
