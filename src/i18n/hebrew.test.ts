// The Hebrew conventions, made mechanical.
//
// Twenty-five catalogs have to agree with each other, and consistency is the
// half of that a machine can check. `docs/HEBREW.md` states the conventions
// in prose and says what still needs a native ear; THIS FILE holds everything
// nobody should have to check twice: those conventions, the two bugs Hebrew
// has actually shipped here (a doubled conjunction, and sofit triggers that
// stopped resolving), and the rules that keep Hebrew out of places its glyph
// widths would break.
//
// It is deliberately separate from `invariants.test.ts`. That file enforces
// the project's cross-cutting engineering rules; this one enforces one
// language's editorial rules, and reads as a checklist a reviewer can follow.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { registry, forLocale } from '../cartridges'
import { resolve } from '../runtime/resolve'
import { normalize, normalizeSofit, SHELL } from './locale'
import { testCtx } from '../testing/cartridgeHarness'
import { gridFor } from '../runtime/GridCanvas'
import { Canvas } from '../runtime/Canvas'
import type { BlockSpec, Cartridge, Locale } from '../types'

const CART_DIR = join(process.cwd(), 'src/cartridges')

/** Any Hebrew letter, plus the niqqud and cantillation marks around them. */
const HEBREW = /[֐-׿יִ-ﭏ]/

type Catalog = { name: string; en: Record<string, string>; he: Record<string, string> }

/**
 * Every en/he pair on DISK, not every pair in the registry. The registry
 * cannot see `_template` (deliberately unregistered, and the file everyone
 * copies) or `src/i18n` (the shell, which is not a cartridge at all), so the
 * registry-driven checks in `invariants.test.ts` have never covered either.
 * A placeholder typo in the shell catalog would show a child literal braces.
 */
const catalogs = (): Catalog[] => {
  const read = (p: string): Record<string, string> =>
    JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>

  const out: Catalog[] = [{
    name: 'src/i18n',
    en: read(join(process.cwd(), 'src/i18n/en.json')),
    he: read(join(process.cwd(), 'src/i18n/he.json')),
  }]

  for (const dir of readdirSync(CART_DIR).sort()) {
    const full = join(CART_DIR, dir)
    if (!statSync(full).isDirectory()) continue
    const he = join(full, 'he.json')
    const en = join(full, 'en.json')
    if (!existsSync(he)) continue
    expect(existsSync(en), `${dir} ships he.json but no en.json`).toBe(true)
    out.push({ name: dir, en: read(en), he: read(he) })
  }
  return out
}

const heStrings = (): { where: string; key: string; value: string }[] =>
  catalogs().flatMap((c) =>
    Object.entries(c.he).map(([key, value]) => ({ where: c.name, key, value })))

/** Hebrew words in a string, as whole tokens. JS `\b` does not know Hebrew. */
const heWords = (s: string): string[] =>
  s.split(/[^֐-׿]+/).filter(Boolean)

describe('the two catalogs say the same thing', () => {
  it('every he.json ships exactly the keys its en.json twin ships', () => {
    for (const c of catalogs()) {
      expect(Object.keys(c.he).sort(), `${c.name}: he/en key mismatch`)
        .toEqual(Object.keys(c.en).sort())
    }
  })

  // Independent of the registry-driven check in invariants.test.ts, and wider:
  // this one also sees the shell catalog and `_template`. Order may differ —
  // Hebrew word order is not English word order — so it compares NAME SETS.
  const names = (s: string): string[] =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

  it('every {placeholder} in an en string has the same name in its he twin', () => {
    for (const c of catalogs()) {
      for (const [key, en] of Object.entries(c.en)) {
        const he = c.he[key]
        if (he === undefined) continue // caught above
        expect(names(he), `${c.name}: "${key}" — en="${en}" he="${he}"`).toEqual(names(en))
      }
    }
  })

  it('writes Hebrew as literal characters, never as a codepoint escape', () => {
    for (const c of catalogs()) {
      for (const [key, he] of Object.entries(c.he)) {
        expect(/\\u\{?05/i.test(he), `${c.name}: "${key}" escapes a Hebrew codepoint`)
          .toBe(false)
      }
    }
  })
})

// A child is never told they got it wrong, in either language. The
// per-cartridge suites each check their own copy against their own list; this
// is the project-wide floor, over every catalog, with the union of every word
// those lists use plus the ones none of them had.
describe('nothing in either language reads as a rebuke', () => {
  const BAD_EN = [
    'wrong', 'incorrect', 'error', 'invalid', 'failed', 'failure', 'fail',
    'you lose', 'lost', 'game over', 'try again', 'nope', 'oops you',
    // "bad" is deliberately absent: `smash.fact.3` says honey never goes bad,
    // which is a delight rather than a rebuke, and no phrasing of the rule
    // separates the two. The Hebrew list below has no equivalent word.
    'not quite', 'too bad', 'mistake', 'missed', 'sorry',
  ]
  const BAD_HE = [
    'לא נכון', 'שגיאה', 'טעות', 'טעית', 'נסה שוב', 'נסו שוב', 'לא תקין',
    'שגוי', 'לא חוקי', 'הפסד', 'הפסדת', 'הפסדתם', 'נכשל', 'נכשלת',
    'סוף המשחק', 'פספסת', 'פספסתם', 'החמצת', 'החמצתם', 'מצטער', 'לא הצלחת',
    'אסור', 'תקלה', 'לא מתאים', 'לא בסדר',
  ]

  it('ships no rebuke in any English catalog', () => {
    for (const c of catalogs()) {
      for (const [key, en] of Object.entries(c.en)) {
        for (const bad of BAD_EN) {
          expect(en.toLowerCase().includes(bad), `${c.name}: "${key}" says "${bad}" — "${en}"`)
            .toBe(false)
        }
      }
    }
  })

  it('ships no rebuke in any Hebrew catalog', () => {
    for (const { where, key, value } of heStrings()) {
      for (const bad of BAD_HE) {
        expect(value.includes(bad), `${where}: "${key}" says "${bad}" — "${value}"`).toBe(false)
      }
    }
  })
})

// SETTLED CONVENTION (docs/HEBREW-REVIEW.md): the child is addressed in the
// second person PLURAL. Hebrew has no gender-neutral singular, so a singular
// address guesses the child's gender; the plural is the inclusive form
// Israeli children's material uses. Ten cartridges used to address a
// masculine singular child and four used the colloquial future imperative
// (תכתבו) against the others' plain imperative (כתבו).
//
// There is no grammatical rule that separates these forms from ordinary
// nouns — "חפרפרת" and "רכבת" end in ת exactly as a second-person-singular
// past verb does — so this is a blocklist of the specific forms this domain
// actually uses, matched as whole Hebrew tokens. It cannot catch a NEW
// singular verb nobody has written yet; it does stop every one that has been
// written here from coming back.
describe('the child is addressed in the plural, everywhere', () => {
  const SINGULAR = new Set([
    // possessive / pronominal, masculine singular
    'שלך', 'לך', 'אותך', 'איתך', 'בשבילך', 'אצלך', 'ממך',
    // masculine-singular imperatives (plain and colloquial-future)
    'כתוב', 'תכתוב', 'נסה', 'תנסה', 'לחץ', 'תלחץ', 'בוא', 'תבוא',
    'הסתכל', 'תסתכל', 'המשך', 'תמשיך', 'ספור', 'תספור', 'מצא', 'תמצא',
    'זכור', 'תזכור', 'שחק', 'תשחק', 'בחר', 'תבחר', 'קח', 'שים', 'תן',
    'הקשב', 'תקשיב', 'הקש', 'תקיש', 'הזז', 'תזיז', 'צייר', 'תצייר',
    'נגן', 'תנגן', 'תפוס', 'תגיד', 'אמור', 'תראה', 'הבט', 'תבדוק',
    // second-person-singular past, as used by the souvenirs
    'מצאת', 'ציירת', 'מילאת', 'פיזרת', 'אכלת', 'טסת', 'ריחפת', 'זכרת',
    'תפסת', 'ניגנת', 'ספרת', 'גילית', 'המראת', 'עפת', 'נסקת', 'הגעת',
    'אמרת', 'עשית', 'בנית', 'שמעת', 'ראית',
    // NOT listed: הלכת. It is "you walked" AND the second half of כוכב הלכת,
    // the planet — memory names one. The homograph is unresolvable without a
    // parser, and `robot` says הלך (it walked) rather than addressing anyone,
    // so nothing is lost by leaving this one to a reader.
  ])

  it('no Hebrew string uses a singular second-person form', () => {
    for (const { where, key, value } of heStrings()) {
      // A trigger word a child TYPES is vocabulary, not copy addressed to
      // them; only catalog VALUES are copy. (`catch` is reached by typing
      // תפוס, which is why the blocklist is applied here and not to triggers.)
      for (const w of heWords(value)) {
        expect(SINGULAR.has(w), `${where}: "${key}" addresses one child — "${w}" in "${value}"`)
          .toBe(false)
      }
    }
  })
})

// SHIPPED BUG, once: memory's capped souvenir came out "...הכדורסל וועוד!".
// Hebrew's "and" is the prefix ו glued to the next word, so a conjunction
// carried inside a string AND added by the joiner makes a literal doubled
// letter, which is not a word in any register of Hebrew.
describe("Hebrew's conjunction is a prefix, and is added exactly once", () => {
  // EXEMPT: onomatopoeia. Hebrew writes a foreign initial "w" as a double vav
  // — Washington is וושינגטון — so a WHOOOSH really is ווששש, and there is no
  // rule that separates that from the bug. Sound-effect keys are the one place
  // a doubled vav is a spelling rather than a conjunction; nothing joins them.
  const IS_SOUND = (key: string): boolean => /(^|\.)sound(\.|$)/.test(key)

  it('no Hebrew string begins a word with a doubled vav', () => {
    for (const { where, key, value } of heStrings()) {
      if (IS_SOUND(key)) continue
      for (const w of heWords(value)) {
        expect(w.startsWith('וו'), `${where}: "${key}" has a doubled vav — "${w}"`).toBe(false)
      }
    }
  })

  // `joinNamed` (catch, count, memory, simon, spot) writes `ו${last}`. If a
  // name's own first letter were ו the result would read as the doubled-vav
  // bug even though the joiner is correct — so no joinable name may start
  // with one. (ורוד, pink, is a real such word; it lives in `colors`, which
  // never joins.)
  it('no name a souvenir joins begins with a vav', () => {
    const JOINED = /^(catch\.name|count\.name|memory\.name|simon\.shape|spot\.name|snake\.fruit|stars\.thing)\./
    for (const { where, key, value } of heStrings()) {
      if (!JOINED.test(key)) continue
      expect(value.startsWith('ו'), `${where}: "${key}" would join as "ו${value}"`).toBe(false)
    }
  })
})

// SHIPPED BUG, once: `normalize()` folds Hebrew final letters (אדום -> אדומ)
// so letter games behave, and eight HE_KEYS entries spelled with the sofit
// stopped being reachable. `cartridges.test.ts` proves the three CONTENT
// cartridges land on the right ITEM; this proves every Hebrew trigger in the
// whole registry still lands on its own CARTRIDGE, by driving the real
// `resolve()` — including with the folding applied to the typed input, which
// is what a child's keystrokes go through.
describe('every Hebrew trigger still resolves, after sofit folding', () => {
  const SOFIT = /[ךםןףץ]/

  it('lands on its own cartridge, as typed and as folded', () => {
    const carts = forLocale('he')
    let checked = 0
    let folded = 0
    for (const c of carts) {
      for (const word of c.triggers.he ?? []) {
        for (const typed of [word, normalizeSofit(word), ` ${word.toUpperCase()} `]) {
          const r = resolve(typed, { locale: 'he', cartridges: carts })
          expect(r.kind, `"${typed}" (for ${c.id}) did not reach a cartridge`).toBe('cartridge')
          if (r.kind === 'cartridge') {
            expect(r.cartridge.id, `"${typed}" reached ${r.cartridge.id}, not ${c.id}`).toBe(c.id)
          }
          checked += 1
        }
        if (SOFIT.test(word)) folded += 1
      }
    }
    // Guards against the check silently passing on an empty registry.
    expect(checked).toBeGreaterThan(150)
    expect(folded, 'no trigger carries a sofit — the fold is untested').toBeGreaterThan(15)
  })

  it('no two Hebrew triggers collide once their final letters are folded', () => {
    const seen = new Map<string, string>()
    for (const c of registry()) {
      for (const word of c.triggers.he ?? []) {
        const k = normalize(word)
        expect(seen.has(k), `"${k}" is claimed by both ${seen.get(k)} and ${c.id} once folded`)
          .toBe(false)
        seen.set(k, c.id)
      }
    }
  })
})

// Hebrew glyphs are not the width of a monospace cell, and Hebrew runs
// right-to-left inside a left-to-right grid. Either one shears a canvas or an
// art block apart. Hebrew belongs in PROSE — a hint, a souvenir, a spoken
// line — and nowhere a character grid is being laid out.
describe('no Hebrew reaches a canvas or an art block', () => {
  const drives = (): ((k: (key: string) => void, t: (n: number) => void) => void)[] => [
    () => {},
    (k) => { k('ArrowRight'); k('ArrowUp') },
    (k) => { k('a'); k('s'); k('1') },
    (k) => { k(' '); k('Enter') },
    (_k, t) => { t(30) },
  ]

  it('no live cartridge paints a Hebrew character', () => {
    for (const c of registry()) {
      if (c.kind !== 'live') continue
      for (const locale of c.locales) {
        for (const drive of drives()) {
          const { ctx } = testCtx({ locale, strings: c.strings })
          const inst = c.create(ctx)
          const g = gridFor(c.size)
          drive(
            (key) => inst.onKey?.({ key, shift: false, repeat: false }),
            (n) => { for (let i = 0; i < n; i++) inst.tick?.(1 / 60) },
          )
          const canvas = new Canvas(g.w, g.h)
          inst.draw(canvas)
          for (const cmd of canvas.cmds()) {
            const painted = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
            expect(HEBREW.test(painted), `${c.id} (${locale}) painted Hebrew: "${painted}"`)
              .toBe(false)
          }
        }
      }
    }
  })

  it('no turn or echo cartridge puts Hebrew inside an art block', () => {
    // The lines a child types at a turn game: coordinates, numbers, words.
    const lines = ['a1 b2', '1', '3', 'more', 'עוד', 'חתול', 'אדום', '']
    for (const c of registry()) {
      for (const locale of c.locales) {
        if (locale !== 'he') continue
        const said: BlockSpec[] = []
        const { ctx } = testCtx({ locale, strings: c.strings })
        const collect = { ...ctx, say: (s: BlockSpec[]) => said.push(...s) }
        if (c.kind === 'turn') {
          const inst = c.create(collect)
          inst.start()
          for (const line of lines) inst.onLine(line)
        } else if (c.kind === 'echo') {
          for (const line of lines) {
            c.respond({ ...collect, input: line })
          }
        } else continue

        for (const b of said) {
          if (b.kind !== 'art') continue
          expect(HEBREW.test(b.art), `${c.id} put Hebrew in an art block:\n${b.art}`).toBe(false)
        }
      }
    }
  })
})

// Correct behaviour, not a gap: `letters`, `pop`, `rain` and `rhyme` are
// English word games — a Hebrew translation of "which letter rhymes" would be
// a lie. They declare `locales: ['en']`, and honest absence is better than a
// Hebrew name that leads to an English game.
describe('the four English-only cartridges are honestly absent from Hebrew', () => {
  const ENGLISH_ONLY = ['letters', 'pop', 'rain', 'rhyme']

  it('ship no Hebrew at all — no he.json, no Hebrew trigger', () => {
    for (const id of ENGLISH_ONLY) {
      const dir = join(CART_DIR, id)
      expect(existsSync(dir), `${id} is gone`).toBe(true)
      expect(existsSync(join(dir, 'he.json')), `${id} ships a he.json`).toBe(false)
      const c = registry().find((x) => x.id === id)!
      expect(c, `${id} is not registered`).toBeTruthy()
      expect(c.locales).toEqual(['en'])
      expect(c.triggers.he ?? [], `${id} declares a Hebrew trigger`).toEqual([])
      const src = readFileSync(join(dir, 'cartridge.ts'), 'utf8')
      expect(HEBREW.test(src), `${id}/cartridge.ts contains Hebrew`).toBe(false)
    }
  })

  it('are absent from the Hebrew games list, and present in the English one', () => {
    const he = forLocale('he').map((c) => c.id)
    const en = forLocale('en').map((c) => c.id)
    for (const id of ENGLISH_ONLY) {
      expect(he, `${id} is offered to a Hebrew-reading child`).not.toContain(id)
      expect(en, `${id} vanished from English`).toContain(id)
    }
  })

  it('are absent from Hebrew help, which lists only what a child can reach', () => {
    const help = registry().find((c) => c.id === 'help')!
    const said: BlockSpec[] = []
    if (help.kind !== 'echo') throw new Error('help is no longer an echo cartridge')
    const { ctx } = testCtx({ locale: 'he', strings: help.strings })
    help.respond({ ...ctx, say: (s) => said.push(...s) })
    const listed = said.map((b) => (b.kind === 'text' ? b.text : '')).join(' ')
    for (const id of ENGLISH_ONLY) {
      const c = registry().find((x) => x.id === id)!
      for (const w of c.triggers.en ?? []) {
        expect(listed.split(/\s+/), `Hebrew help offers "${w}" (${id})`).not.toContain(w)
      }
    }
    // …and it really did list something, so the check above is not vacuous.
    expect(listed).toContain('כדור')
  })
})

describe('the shell catalog', () => {
  it('is complete in Hebrew — every English key has a Hebrew value', () => {
    for (const key of Object.keys(SHELL.en)) {
      expect(SHELL.he[key], `shell key "${key}" is missing in Hebrew`).toBeTruthy()
    }
  })

  // `lang.en` / `lang.he` name each language IN that language, so a child who
  // cannot read the current one can still find their way back.
  it('names each language in its own script', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      expect(HEBREW.test(SHELL[locale]['lang.he']!), 'lang.he is not in Hebrew').toBe(true)
      expect(HEBREW.test(SHELL[locale]['lang.en']!), 'lang.en is not in Latin').toBe(false)
    }
  })
})

describe('every cartridge a Hebrew child can reach is really in Hebrew', () => {
  const heCarts = (): Cartridge[] => registry().filter((c) => c.locales.includes('he'))

  it('ships a Hebrew value for every key, with nothing left in English', () => {
    for (const c of heCarts()) {
      if (!c.strings?.he) continue
      for (const [key, value] of Object.entries(c.strings.he)) {
        expect(value.trim().length, `${c.id}: "${key}" is empty in Hebrew`).toBeGreaterThan(0)
        // A key left untranslated is pure Latin prose. Digits, emoji,
        // key caps (a1 b3, A-J) and the `{placeholder}`s are all legitimate.
        const prose = value.replace(/\{[^}]*\}/g, '').replace(/[^A-Za-z ]/g, '').trim()
        expect(prose.length, `${c.id}: "${key}" looks untranslated — "${value}"`)
          .toBeLessThan(12)
      }
    }
  })
})
