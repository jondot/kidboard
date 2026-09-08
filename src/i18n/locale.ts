import type { Dir, Locale, T } from '../types'
import en from './en.json'
import he from './he.json'

export const SHELL: Record<Locale, Record<string, string>> = { en, he }

const LOCALES: readonly Locale[] = ['en', 'he']
const KEY = 'kb.locale'

export function dirFor(locale: Locale): Dir {
  return locale === 'he' ? 'rtl' : 'ltr'
}

/**
 * Display-case helper. Hebrew is caseless, so uppercasing there is both a
 * no-op and a smell; using this everywhere keeps shared code locale-safe.
 */
export function caseFor(locale: Locale): (s: string) => string {
  return locale === 'he' ? (s) => s : (s) => s.toUpperCase()
}

const SOFIT: Record<string, string> = {
  'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ',
}

/** Fold Hebrew final letters so letter-matching games behave. */
export function normalizeSofit(s: string): string {
  return s.replace(/[ךםןףץ]/g, (c) => SOFIT[c] ?? c)
}

/**
 * The single normalization every lookup goes through: trim, collapse runs of
 * whitespace, lowercase, and fold Hebrew final letters. Lives here rather
 * than in the resolver because content tables index through it too — both
 * sides of a lookup must be folded the same way or a sofit word (אדום ->
 * אדומ) silently misses its entry.
 */
export function normalize(raw: string): string {
  return normalizeSofit(raw.trim().toLowerCase().replace(/\s+/g, ' '))
}

export function loadLocale(): Locale {
  const raw = localStorage.getItem(KEY)
  return LOCALES.includes(raw as Locale) ? (raw as Locale) : 'en'
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(KEY, locale)
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  )
}

/**
 * Resolution order: cartridge strings in the active locale, cartridge strings
 * in English, shell strings in the active locale, shell strings in English,
 * then the key itself. Never throws, never renders blank.
 */
export function makeT(
  locale: Locale,
  extra?: Partial<Record<Locale, Record<string, string>>>,
): T {
  return (key, vars) => {
    const raw =
      extra?.[locale]?.[key] ??
      extra?.en?.[key] ??
      SHELL[locale][key] ??
      SHELL.en[key] ??
      key
    return interpolate(raw, vars)
  }
}
