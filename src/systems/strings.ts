import type { Locale } from '../types'

/**
 * The systems layer's shell strings — the four machine names, which are the
 * only user-visible text this layer owns.
 *
 * They live here rather than in `src/i18n/en.json` because concurrent tasks
 * hold that file; `makeT(locale, extra)` already takes exactly this shape as
 * its `extra` table, so the picker (S5) can merge these in with no change to
 * the i18n module. Folding them into `en.json`/`he.json` later is a copy and a
 * delete.
 *
 * These are machine names, so they are proper nouns; they are left in Latin
 * script and lower case, matching how the theme gallery names its themes.
 *
 * `kid code` IS NOT A BRAND, and must not become one by borrowing somebody
 * else's. The machine is a terminal that talks back to a six-year-old, and
 * dressing it in a real product's name would be both a liberty and a lie
 * about what it is. `kid code` says what it actually is: the code a kid
 * writes, in a terminal shaped like the ones grown-ups use.
 *
 * All four stay Latin in Hebrew too. `kidtari`
 * and `kid code` are this playground's own machine names, `omarchy` is a brand
 * name, and `crt` is an acronym next to `logo`, a language. Hebrew writes foreign names in
 * Latin script as a matter of course, and a transliteration would be a guess
 * at a spelling no child has ever seen on the machine itself. This is the same
 * call the theme gallery already made for `nord` and `gruvbox`. A Hebrew `he`
 * table is therefore deliberately absent, not missing.
 */
export const SYSTEM_STRINGS: { en: Record<string, string> } & Partial<
  Record<Locale, Record<string, string>>
> = {
  en: {
    'system.kidtari': 'kidtari',
    'system.kidcode': 'kid code',
    'system.crt': 'crt / logo',
    'system.omarchy': 'omarchy',
  },
}
