/**
 * How a six-year-old says a number. Digits are the common case, but a child
 * who has just learned to write "three" should not be told to try again — so
 * the spelled-out forms count too, in both languages, and in Hebrew in both
 * the feminine and masculine counting forms (a child says "שלוש" or
 * "שלושה" depending on what is being counted, and both are right here).
 *
 * Returns `null` for anything that is not a number at all — empty input,
 * letters, punctuation, an emoji. The caller turns that into a nudge, never
 * an error.
 */
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  'אפס': 0,
  'אחת': 1, 'אחד': 1,
  'שתיים': 2, 'שניים': 2, 'שתים': 2, 'שנים': 2,
  'שלוש': 3, 'שלושה': 3,
  'ארבע': 4, 'ארבעה': 4,
  'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6,
  'שבע': 7, 'שבעה': 7,
  'שמונה': 8,
  'תשע': 9, 'תשעה': 9,
  'עשר': 10, 'עשרה': 10,
}

export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (/^\d{1,3}$/.test(s)) return Number.parseInt(s, 10)
  const word = WORDS[s]
  return word === undefined ? null : word
}
