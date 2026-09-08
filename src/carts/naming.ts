import { normalize } from '../i18n/locale'
import type { Cartridge, Locale } from '../types'
import type { CartManifest } from './manifest'

/**
 * Two carts called `maze`, or a cart called `snake` when `snake` already
 * ships, is not an error — it is a name clash, and a name clash has an
 * answer. Built-ins always win, because the word a child already learned must
 * keep doing what it did yesterday.
 */

/** Every word that already means something, in every language. */
export function takenWords(cartridges: readonly Cartridge[]): Set<string> {
  const out = new Set<string>()
  for (const c of cartridges) {
    for (const l of ['en', 'he'] as Locale[]) {
      for (const w of c.triggers[l] ?? []) out.add(normalize(w))
    }
  }
  return out
}

/**
 * The first free word: `maze`, then `maze2`, then `maze3`. A digit rather
 * than a suffix word, because the child has to be able to type it in either
 * language and a digit is the same in both.
 */
export function uniqueWord(want: string, taken: ReadonlySet<string>): string {
  const base = normalize(want)
  if (base.length === 0) return ''
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n++) {
    const next = `${base}${n}`
    if (!taken.has(next)) return next
  }
  return `${base}${Date.now() % 1000}`
}

export type Naming = {
  /** The final word per locale, after clashes were settled. */
  names: Partial<Record<Locale, string>>
  /** The words that had to change, so the child can be told. */
  renamed: { locale: Locale; from: string; to: string }[]
}

export function settleNames(m: CartManifest, taken: ReadonlySet<string>): Naming {
  const claimed = new Set(taken)
  const names: Naming['names'] = {}
  const renamed: Naming['renamed'] = []

  for (const l of m.locales) {
    const want = m.name[l]
    if (!want) continue
    const got = uniqueWord(want, claimed)
    if (got.length === 0) continue
    claimed.add(got)
    names[l] = got
    if (got !== normalize(want)) renamed.push({ locale: l, from: normalize(want), to: got })
  }
  return { names, renamed }
}
