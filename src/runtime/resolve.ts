import type { Cartridge, Locale } from '../types'
import { normalize } from '../i18n/locale'

export type Resolution =
  | { kind: 'cartridge'; cartridge: Cartridge; corrected?: string }
  | { kind: 'smash'; text: string }
  | { kind: 'echo'; text: string }

/**
 * Levenshtein distance <= 1, computed by matching a common prefix and a common
 * suffix. Linear, no matrix, and enough for one-typo forgiveness.
 */
export function withinOne(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (l.length - s.length > 1) return false

  let i = 0
  while (i < s.length && s[i] === l[i]) i += 1

  let j = 0
  while (j < s.length - i && s[s.length - 1 - j] === l[l.length - 1 - j]) j += 1

  // Same length: one substitution. Different length: one insertion.
  return s.length === l.length ? i + j >= s.length - 1 : i + j >= s.length
}

function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return [...s]
  return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
}

/** Long unspaced input we could not recognise. Short input is never a smash. */
export function isSmash(text: string): boolean {
  const n = [...text].length
  if (n < 3) return false
  if (/^\d+$/.test(text)) return false
  return !/\s/.test(text) && n > 4
}

const words = (c: Cartridge, locale: Locale): string[] =>
  (c.triggers[locale] ?? []).map(normalize)

const allWords = (c: Cartridge): string[] =>
  [...(c.triggers.en ?? []), ...(c.triggers.he ?? [])].map(normalize)

/**
 * Spec section 7, steps 3-7. There is no error branch: every input lands on
 * `cartridge`, `smash`, or `echo`.
 */
export function resolve(
  raw: string,
  o: { locale: Locale; cartridges: Cartridge[] },
): Resolution {
  const text = raw.trim()
  const key = normalize(text)
  const available = o.cartridges.filter((c) => c.locales.includes(o.locale))

  // 3a: exact match in the active locale
  for (const c of available) {
    if (words(c, o.locale).includes(key)) return { kind: 'cartridge', cartridge: c }
  }

  // 3b: exact match in any locale — a Hebrew-UI child typing "ball" still plays
  for (const c of available) {
    if (allWords(c).includes(key)) return { kind: 'cartridge', cartridge: c }
  }

  // 3c: emoji triggers are language-neutral
  const first = graphemes(text)[0]
  if (first) {
    for (const c of available) {
      if ((c.triggers.emoji ?? []).includes(first)) {
        return { kind: 'cartridge', cartridge: c }
      }
    }
  }

  // 5: forgive a single typo, but only on words long enough that a near-match
  //    cannot steal a deliberate keyboard smash.
  if (key.length >= 4) {
    for (const c of available) {
      for (const trigger of allWords(c)) {
        if (trigger.length >= 4 && withinOne(key, trigger)) {
          return { kind: 'cartridge', cartridge: c, corrected: trigger }
        }
      }
    }
  }

  // 6 and 7
  return isSmash(text) ? { kind: 'smash', text } : { kind: 'echo', text }
}
