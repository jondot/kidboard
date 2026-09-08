// Task 22: mechanical enforcement of the project-wide rules from Global
// Constraints. These must keep passing as the remaining 16 cartridges land.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { registry } from './cartridges'
import { resolve } from './runtime/resolve'
import { SHELL, makeT } from './i18n/locale'
import type { BlockSpec, Cartridge, Locale } from './types'
import { testCtx } from './testing/cartridgeHarness'
import { gridFor } from './runtime/GridCanvas'
import { Canvas } from './runtime/Canvas'
import { isShape } from './runtime/shapes'

const CART_DIR = join(process.cwd(), 'src/cartridges')

const cartridgeSources = (): { file: string; src: string }[] => {
  const out: { file: string; src: string }[] = []
  for (const dir of readdirSync(CART_DIR)) {
    const full = join(CART_DIR, dir)
    if (!statSync(full).isDirectory()) continue
    for (const f of readdirSync(full)) {
      if (f.endsWith('.ts') || f.endsWith('.tsx')) {
        out.push({ file: `${dir}/${f}`, src: readFileSync(join(full, f), 'utf8') })
      }
    }
  }
  return out
}

// Exclude the cartridges' own test files: they legitimately reference
// Math.random-adjacent test doubles, mention "document"/"window" in comments,
// etc. The rules bind cartridge *implementation* files, not their specs.
const implementationSources = (): { file: string; src: string }[] =>
  cartridgeSources().filter(({ file }) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))

/**
 * FIX (S3): the sandbox checks below used to grep raw source, comments and
 * string literals included — so an English SENTENCE could trip a rule meant
 * for CODE. Twice: a comment containing `Math.random()`, and a comment
 * containing the word `window.`. Both times the "fix" was to reword a
 * harmless comment to appease a test, which is backwards — it trains
 * contributors to distrust the guard instead of trusting it.
 *
 * `stripComments` removes `//` and `/* *\/` comments only; string and
 * template-literal content is left untouched, because `no react import`
 * below needs a real string literal (`from 'react'`) to still be there.
 *
 * `code()` goes further and also empties string/template-literal TEXT
 * (keeping `${...}` template-expression code, which is real code) — safe for
 * document./window./Math.random, since a genuine violation of any of those
 * is always bare code, never text a cartridge legitimately quotes.
 */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && c2 === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (c === '\'' || c === '"') {
      const quote = c
      out += c
      i += 1
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        out += src[i]
        i += 1
      }
      out += src[i] ?? ''
      i += 1
      continue
    }
    if (c === '`') {
      out += c
      i += 1
      let depth = 0
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        if (depth === 0 && src[i] === '`') { out += '`'; i += 1; break }
        out += src[i]
        if (src[i] === '$' && src[i + 1] === '{') depth += 1
        else if (depth > 0 && src[i] === '}') depth -= 1
        i += 1
      }
      continue
    }
    out += c
    i += 1
  }
  return out
}

function stripStrings(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\'' || c === '"') {
      const quote = c
      i += 1
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i += 2
        else i += 1
      }
      i += 1
      continue
    }
    if (c === '`') {
      i += 1
      let depth = 0
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (depth === 0 && src[i] === '`') { i += 1; break }
        if (src[i] === '$' && src[i + 1] === '{') { depth += 1; out += '${'; i += 2; continue }
        if (depth > 0 && src[i] === '}') { depth -= 1; out += '}'; i += 1; continue }
        if (depth > 0) { out += src[i]; i += 1; continue }
        i += 1
      }
      continue
    }
    out += c
    i += 1
  }
  return out
}

const code = (src: string): string => stripStrings(stripComments(src))

describe('sandbox scanners see code, not prose', () => {
  it('strips // and block comments but keeps a real string literal intact', () => {
    expect(stripComments("import { useState } from 'react'"))
      .toMatch(/from ['"]react['"]/)
    expect(stripComments("// see from 'react' below, not real\nconst x = 1"))
      .not.toMatch(/from ['"]react['"]/)
  })

  it('never flags a comment mentioning Math.random()', () => {
    expect(code('// rolls a die like Math.random() would\nconst x = 1'))
      .not.toMatch(/Math\.random/)
    expect(code('/* Math.random() is not allowed here */\nconst x = 1'))
      .not.toMatch(/Math\.random/)
  })

  it('never flags a comment mentioning the word "window."', () => {
    expect(code('// open the window. it is warm today\nconst x = 1'))
      .not.toMatch(/\bwindow\./)
  })

  it('never flags document./window./Math.random written inside a string', () => {
    expect(code("const s = 'see document. for details'")).not.toMatch(/\bdocument\./)
    expect(code('const s = `Math.random() explained`')).not.toMatch(/Math\.random/)
  })

  it('still catches a real violation once comments/strings are stripped away', () => {
    expect(code('document.getElementById("x")')).toMatch(/\bdocument\./)
    expect(code('window.alert(1)')).toMatch(/\bwindow\./)
    expect(code('const r = Math.random()')).toMatch(/Math\.random/)
  })

  it('still catches a violation hiding inside a template expression', () => {
    expect(code('const s = `roll: ${Math.random()}`')).toMatch(/Math\.random/)
    expect(code('const s = `w: ${window.innerWidth}`')).toMatch(/\bwindow\./)
  })
})

describe('cartridge sandbox readiness', () => {
  it('no cartridge imports React or touches the DOM', () => {
    for (const { file, src } of implementationSources()) {
      const noComments = stripComments(src)
      expect(noComments, `${file} imports react`).not.toMatch(/from ['"]react['"]/)
      const noCode = code(src)
      expect(noCode, `${file} uses document`).not.toMatch(/\bdocument\./)
      expect(noCode, `${file} uses window`).not.toMatch(/\bwindow\./)
    }
  })

  it('no cartridge uses Math.random, which would break snapshot tests', () => {
    for (const { file, src } of implementationSources()) {
      expect(code(src), `${file} uses Math.random`).not.toMatch(/Math\.random/)
    }
  })

  it('no cartridge uppercases text, which is meaningless in Hebrew', () => {
    for (const { file, src } of implementationSources()) {
      expect(src, `${file} calls toUpperCase`).not.toMatch(/toUpperCase\(/)
    }
  })

  it('every cartridge declares apiVersion 1', () => {
    for (const c of registry()) expect(c.apiVersion).toBe(1)
  })

  it('every live cartridge declares a positive, finite size', () => {
    for (const c of registry()) {
      if (c.kind !== 'live') continue
      expect(Number.isFinite(c.size.cols) && c.size.cols > 0, `${c.id}.size.cols`).toBe(true)
      expect(Number.isFinite(c.size.aspect) && c.size.aspect > 0, `${c.id}.size.aspect`).toBe(true)
    }
  })
})

// v2: a cartridge may draw in the PIXEL field (rect/outline/line/disc/circle/
// sprite) as well as with characters. Shape ops are deliberately absent from
// `rasterize`, the character model — characters are not pixels, and a coarse
// character view of a 320x160 field could agree with a broken game. So a
// cartridge that draws shapes has to be snapshotted on the PIXEL model, and
// this is the mechanical half of that rule.
//
// WHAT THIS CATCHES: a shape-drawing game whose tests only ever call
// `frameOf` — the exact shape of "green in tests, wrong on screen". (The
// harness itself refuses to return a blank character grid for such a game;
// this check covers the case where the game also paints a character or two,
// so the grid is not blank and the guard cannot fire.)
describe('a shape-drawing game is tested on the pixel model', () => {
  it('every live cartridge that draws shapes snapshots pixelsOf', () => {
    for (const c of registry()) {
      if (c.kind !== 'live') continue
      const { ctx } = testCtx({ strings: c.strings })
      const inst = c.create(ctx)
      const g = gridFor(c.size)
      const canvas = new Canvas(g.w, g.h)
      inst.draw(canvas)
      if (!canvas.cmds().some(isShape)) continue

      const dir = join(CART_DIR, c.id)
      const tests = readdirSync(dir).filter((f) => f.includes('.test.'))
      const src = tests.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
      expect(src.includes('pixelsOf'),
        `${c.id} draws shapes but no test of its own reads the pixel model — ` +
        'a character-grid snapshot cannot see a pixel field')
        .toBe(true)
    }
  })
})

// The four shipped cartridges are the de-facto template for the remaining
// sixteen, so a duplicated ESC hint would have been copied sixteen more
// times. The shell appends exactly one ESC hint whenever a cartridge is
// running (Terminal's refreshHints); a cartridge that declares its own makes
// the context bar read "ESC done   ESC done".
describe('the shell owns the ESC hint', () => {
  it('no cartridge declares its own ESC hint', () => {
    for (const c of registry()) {
      if (c.kind === 'echo') continue
      for (const h of c.hints(makeT('en', c.strings))) {
        expect(h.keys.toUpperCase(), `${c.id} declares an ESC hint`)
          .not.toContain('ESC')
      }
    }
  })
})

describe('there is no error state', () => {
  // Pathological inputs across scripts: empty/whitespace, ASCII words with
  // odd casing, punctuation-only, numeric, accented Latin, emoji typed as a
  // literal character (never a codepoint escape), a long run, an injection
  // attempt, Hebrew words (including one that is itself a real trigger and
  // one that is gibberish), path-traversal-shaped text, and control-ish
  // sequences.
  const inputs = [
    '', '  ', '\t\n', 'cat', 'CAT', 'catt', '?!?', '0', '999999', 'ñ',
    '🐱', '🎉🎉🎉', 'a'.repeat(1000), '<script>alert(1)</script>',
    'שלום', 'חתול', 'זזזזזזזזזזזז', 'quit', 'ball', 'zzzzzzzzzzzz', '\\', '{}',
    '../..', '   ball   ', 'תפוח',
  ]

  it('resolves every input to a celebration in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const carts = registry().filter((c) => c.locales.includes(locale))
      for (const input of inputs) {
        const res = resolve(input, { locale, cartridges: carts })
        expect(['cartridge', 'smash', 'echo'], `"${input}" under ${locale}`)
          .toContain(res.kind)
      }
    }
  })
})

describe('translation honesty', () => {
  // A renamed copy of _template that forgot to rename its keys shows a child
  // the literal string "mine.hello" — makeT never throws and never renders
  // blank, so nothing else would ever surface it. Every ctx.t('…') literal in
  // a cartridge's source must resolve to a key that cartridge ships, or to a
  // shell key (help legitimately uses help.title, cartridges use bar.*).
  it("every ctx.t('…') literal resolves to a key that is actually shipped", () => {
    const shell = new Set([...Object.keys(SHELL.en), ...Object.keys(SHELL.he)])

    // Read the folder's own JSON rather than the registry, so `_template` —
    // deliberately unregistered, and the thing everyone copies — is covered
    // too. A broken template would otherwise be copied sixteen times.
    const shipped = (dir: string): Set<string> => {
      const keys = new Set<string>()
      for (const loc of ['en', 'he']) {
        const f = join(CART_DIR, dir, `${loc}.json`)
        if (!existsSync(f)) continue
        for (const k of Object.keys(JSON.parse(readFileSync(f, 'utf8')) as object)) {
          keys.add(k)
        }
      }
      return keys
    }

    for (const { file, src } of implementationSources()) {
      const own = shipped(file.split('/')[0]!)

      for (const m of src.matchAll(/\bctx\.t\(\s*'([^'{}]+)'/g)) {
        const key = m[1]!
        expect(own.has(key) || shell.has(key),
          `${file}: ctx.t('${key}') resolves to nothing — a child would see the literal key`)
          .toBe(true)
      }
    }
  })

  // A cartridge that declares a locale but ships no trigger in it is
  // unreachable by a child reading that language, yet still listed by help —
  // it silently vanishes from the language it claims to support.
  it('a cartridge declaring a locale ships at least one trigger in it', () => {
    for (const c of registry()) {
      for (const l of c.locales) {
        const words = (c.triggers[l] ?? []).filter((w) => w.trim().length > 0)
        expect(words.length,
          `${c.id} claims ${l} but ships no ${l} trigger, so it cannot be reached in ${l}`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('a cartridge claiming a locale ships strings for it, unless it ships none at all', () => {
    // A cartridge with no `strings` block (e.g. `letters`, which has nothing
    // to localize — a bare letter plus its emoji) is exempt: there is no
    // dishonesty possible when there is nothing to check. But a cartridge
    // that *does* ship a strings block must cover every locale it claims.
    for (const c of registry()) {
      if (!c.strings) continue
      for (const l of c.locales) {
        expect(Object.keys(c.strings[l] ?? {}).length,
          `${c.id} claims ${l} but ships no ${l} strings`).toBeGreaterThan(0)
      }
    }
  })

  it('every locale of a cartridge defines the same keys', () => {
    for (const c of registry()) {
      if (!c.strings?.en || !c.strings.he) continue
      expect(Object.keys(c.strings.he).sort(),
        `${c.id} he/en key mismatch`).toEqual(Object.keys(c.strings.en).sort())
    }
  })

  // makeT interpolates `{name}` placeholders positionally by *name*, not by
  // position. If en.json says "{n} bounces!" and he.json says "{count}
  // קפיצות!" the substitution silently no-ops and the child sees literal
  // braces. Order may legitimately differ (Hebrew word order != English), so
  // this compares placeholder *name sets*, not the strings themselves.
  const placeholderNames = (s: string): string[] =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

  it('every {placeholder} in an en string has the same name in its he twin', () => {
    for (const c of registry()) {
      if (!c.strings?.en || !c.strings.he) continue
      for (const key of Object.keys(c.strings.en)) {
        const enStr = c.strings.en[key]
        const heStr = c.strings.he[key]
        if (enStr === undefined || heStr === undefined) continue // caught above
        expect(placeholderNames(heStr),
          `${c.id}: "${key}" placeholders differ — en="${enStr}" he="${heStr}"`)
          .toEqual(placeholderNames(enStr))
      }
    }
  })
})

// There are no scores. A score invites comparison, and comparison
// invites losing — the two checks below are the mechanical half of that
// principle (the qualitative half — does a souvenir actually name something
// specific — is not automatable and stays a human/code-review judgment call).
//
// WHAT THIS CATCHES: a `c.text`/`c.put` draw whose payload is nothing but
// digits (the exact shape of the old `c.text(2, H-1, \`${bounces}\`, 'art')`
// and `c.text(1, H-1, \`${played}\`, 'art')` bugs — a bare running counter
// painted in a corner of the canvas), and a souvenir that reads as a raw
// count on a freshly-created, zero-progress instance (the exact shape of the
// old "0 bounces!" / "0 notes!" / "0 pairs found" bugs, and the dangling
// "a story about a " bug once it interpolates a missing value with a digit).
//
// WHAT THIS DOES NOT CATCH: a souvenir that names a count in prose instead of
// digits ("zero bounces today"), a number embedded in a larger string
// ("player 1"), or a non-zero-progress souvenir that quietly degrades into a
// count once the child has actually played (e.g. "you played 4 notes!" would
// pass the fresh-instance check below, since 4 presses are required to
// produce it) — those are exactly what the "reads warmly / never a count"
// tests inside each cartridge's own *.test.ts file exist to cover, driven by
// real gameplay. This invariant is the floor every cartridge must clear
// automatically; it is not a substitute for that per-cartridge coverage.
describe('no cartridge scores', () => {
  const isBareNumber = (s: string): boolean => /^\d+$/.test(s.trim())

  it('no live cartridge ever paints a bare number onto its canvas', () => {
    for (const c of registry()) {
      if (c.kind !== 'live') continue
      const { ctx } = testCtx({ strings: c.strings })
      const inst = c.create(ctx)
      const g = gridFor(c.size)

      // Sample a handful of frames: fresh, after some keys, after some
      // ticks — a counter that only starts rendering once play begins would
      // otherwise slip past a single draw() at t=0.
      const samples: (() => void)[] = [
        () => {},
        () => { inst.onKey?.({ key: 'ArrowRight', shift: false, repeat: false }) },
        () => { inst.onKey?.({ key: 'a', shift: false, repeat: false }) },
        () => { inst.onKey?.({ key: '1', shift: false, repeat: false }) },
        () => { for (let i = 0; i < 30; i++) inst.tick?.(1 / 60) },
      ]

      for (const drive of samples) {
        drive()
        const canvas = new Canvas(g.w, g.h)
        inst.draw(canvas)
        for (const cmd of canvas.cmds()) {
          if (cmd.op === 'text') {
            expect(isBareNumber(cmd.text), `${c.id} painted a bare number "${cmd.text}"`).toBe(false)
          }
          if (cmd.op === 'put') {
            expect(isBareNumber(cmd.ch), `${c.id} painted a bare number "${cmd.ch}"`).toBe(false)
          }
        }
      }
    }
  })

  it('a fresh, zero-progress cartridge never returns a numeric souvenir', () => {
    for (const c of registry()) {
      for (const locale of c.locales) {
        const { ctx } = testCtx({ locale, strings: c.strings })
        let souvenir = ''
        if (c.kind === 'live') {
          souvenir = c.create(ctx).souvenir?.() ?? ''
        } else if (c.kind === 'turn') {
          const inst = c.create(ctx)
          inst.start()
          souvenir = inst.souvenir?.() ?? ''
        } else {
          continue
        }
        expect(/\d/.test(souvenir),
          `${c.id} (${locale}) gave a numeric fresh-instance souvenir: "${souvenir}"`)
          .toBe(false)
      }
    }
  })
})

// Task: memory's souvenir shipped "you found the circus, the rainbow, the
// cat, and and more!" (en) and "...הכדורסל וועוד!" (he, a doubled vav) once
// its capped list overflowed — a fully green suite shipped it, because the
// only cross-cutting souvenir check above is "no digits". Neither the digit
// check nor the per-cartridge tests each cartridge ships for itself are
// mechanical, project-wide protection against a broken *join* — a cartridge
// with its own list-building bug could ship the exact same way.
//
// WHAT THIS CATCHES: a souvenir string, produced by *this cartridge's own
// joining logic* while being driven through a range of played states, that
// contains an immediately-repeated word ("and and"), a Hebrew conjunction
// doubled at a word's start ("וו..." instead of "ו..." — Hebrew's ו is a
// glued prefix, so this is the shape a doubled-conjunction bug actually
// takes there, not a separate repeated token the way English's is), a
// doubled separator (", ,"), or a leading/trailing "and"/comma left over
// from an off-by-one in a list join. It genuinely reaches these states: for
// `turn` cartridges it plays through every one of the 120 two-coordinate
// lines a 4x4 grid can produce (across three seeds), which is exhaustive
// enough that any board-game cartridge's win condition fires many times
// over — this is exactly the exhaustive board coverage that would have
// caught memory's bug without knowing memory exists.
//
// WHAT THIS DOES NOT CATCH:
// - Any join bug that only manifests at a list length this drive never
//   reaches (unlikely here since the coordinate drive is exhaustive over the
//   whole board, but a future cartridge with a longer or differently-shaped
//   state space could still have unreached corners).
// - A malformed phrase built from a CHILD's own free-text answer (e.g.
//   `story` interpolates raw typed text) rather than from the cartridge's
//   own joining code — deliberately: the fuzz lines below contain no "and",
//   comma, or repeated words, precisely so a hit here points at the
//   cartridge's join logic, not at what a fuzz line happened to say. A real
//   child typing "and" as their story animal can still produce an odd
//   sentence; that is not a bug this check is trying to find.
// - A leading real Hebrew word that happens to start with ו (vav is a
//   completely ordinary first letter — "ורד", rose, "וילה", villa) is not
//   flagged as a "leading conjunction", and deliberately so: checking for
//   "starts with ו" generically would misfire on nearly every such word.
//   Only the doubled-vav-at-word-start shape (the actual bug's signature) is
//   checked; a single leading vav that is just a word's own first letter is
//   indistinguishable from a real conjunction without a dictionary, so this
//   check does not attempt it.
// - `live` cartridges are sampled the same shallow way as the "no cartridge
//   scores" check above (a fixed, generic run of keys and ticks) rather than
//   exhaustively — today's two live cartridges (`ball`, `piano`) do not join
//   lists at all, so this is a floor for whichever future `live` cartridge
//   does, not a guarantee it reaches every state that cartridge can reach.
describe('souvenir sentences are well-formed', () => {
  // Every coordinate on a 4x4 grid, paired every-way — 120 lines. This is
  // not "knowledge of memory's format" so much as the shape most grid/board
  // games in this codebase are likely to share; feeding it to a cartridge
  // that does not use it is a harmless no-op, exactly like the malformed
  // inputs in "there is no error state" above.
  const GRID_COORDS = ['a', 'b', 'c', 'd'].flatMap((r) => [1, 2, 3, 4].map((n) => `${r}${n}`))
  const COORD_PAIRS: string[] = []
  for (let i = 0; i < GRID_COORDS.length; i++) {
    for (let j = i + 1; j < GRID_COORDS.length; j++) {
      COORD_PAIRS.push(`${GRID_COORDS[i]} ${GRID_COORDS[j]}`)
    }
  }
  // Plain, join-word-free fuzz for turn cartridges that take free text
  // (e.g. `story`) rather than coordinates — no "and", no comma, no repeats,
  // so any repeated/doubled shape found later came from the cartridge, not
  // from this line.
  const WORD_FUZZ = ['red', 'kitten', 'seven', 'zzz9', 'note3', 'תפוח', 'כחול']
  const DRIVE_LINES = [...COORD_PAIRS, ...WORD_FUZZ]

  const stripEdgePunct = (w: string): string => w.replace(/^[!?.,:;]+|[!?.,:;]+$/g, '')

  const assertWellFormed = (s: string, label: string): void => {
    const trimmed = s.trim()
    if (trimmed.length === 0) return

    const tokens = trimmed.split(/\s+/).filter(Boolean).map(stripEdgePunct)
    for (let i = 1; i < tokens.length; i++) {
      const word = tokens[i]!
      expect(word.length > 0 && word === tokens[i - 1],
        `${label}: immediately-repeated word "${word}" in "${s}"`).toBe(false)
    }

    // Hebrew's "and" (ו) is a prefix glued to the next word, never its own
    // token — so a doubled conjunction shows up as two vavs run together at
    // a word's start, not as a repeated token the loop above could catch.
    // Anchored to word-start so it does not flag legitimate mid-word doubled
    // vav (e.g. "הלווייתן", "the whale", spelled with a real doubled vav).
    expect(/(^|\s)וו/.test(trimmed), `${label}: doubled Hebrew conjunction in "${s}"`).toBe(false)

    expect(/,\s*,/.test(trimmed), `${label}: doubled separator in "${s}"`).toBe(false)

    const core = trimmed.replace(/[!?.]+$/, '')
    expect(/^,|,$/.test(core), `${label}: leading/trailing comma in "${s}"`).toBe(false)
    expect(/^and\b/i.test(core), `${label}: leading "and" in "${s}"`).toBe(false)
    expect(/\band$/i.test(core), `${label}: trailing "and" in "${s}"`).toBe(false)
  }

  it('never joins a malformed sentence across a range of played states, in either language', () => {
    for (const c of registry()) {
      if (c.kind !== 'turn' && c.kind !== 'live') continue

      for (const locale of c.locales) {
        for (const seed of [1, 2, 3]) {
          const { ctx } = testCtx({ locale, seed, strings: c.strings })
          const souvenirs: string[] = []

          if (c.kind === 'turn') {
            const inst = c.create(ctx)
            inst.start()
            for (const line of DRIVE_LINES) {
              inst.onLine(line)
              souvenirs.push(inst.souvenir?.() ?? '')
            }
          } else {
            const inst = c.create(ctx)
            const g = gridFor(c.size)
            const keys = [
              'ArrowLeft', 'ArrowRight', 'a', 's', 'd', 'f', 'j', 'k', 'l', ';',
              '1', '2', '3', '4', '5',
            ]
            for (const key of keys) {
              inst.onKey?.({ key, shift: false, repeat: false })
              const canvas = new Canvas(g.w, g.h)
              inst.draw(canvas)
              for (let t = 0; t < 20; t++) inst.tick?.(1 / 60)
              souvenirs.push(inst.souvenir?.() ?? '')
            }
          }

          for (const s of souvenirs) {
            assertWellFormed(s, `${c.id} (${locale}, seed ${seed})`)
          }
        }
      }
    }
  },
  // The cost here is the ROSTER, not any one cartridge: every turn cartridge
  // is driven through 127 lines in two languages at three seeds, so the work
  // grows every time a game is added and the default five seconds was reached
  // by the twenty-ninth. Timed at the point this was raised: 107 ms for all
  // the live cartridges put together, and the rest in the turn ones. Nothing
  // is skipped to buy the headroom.
  30_000)
})

// ---------------------------------------------------------------------------
// MONOCHROME
//
// The palette rule, project-wide: the theme's ground plus ONE ink, and a
// second tone only for the thing the child controls. Never a third. Until now
// this lived only in prose and in a handful of per-cartridge tests, so
// cartridge #21 could drift straight past it with a fully green suite — which
// is exactly how the shipped set ended up with a six-tone game in it.
//
// WHAT THIS CANNOT CATCH, honestly:
//
//  * It sees only the tones a scripted drive actually REACHES. A branch that
//    needs real play to open (a win screen eight rounds in, a rare event) can
//    hide a third tone from it. Per-cartridge tests still have to cover the
//    states only that cartridge knows how to reach.
//  * It counts tones, it cannot judge them. "At most two" is mechanical; the
//    rule that the SECOND one must mark what the child controls, and not just
//    be a favourite colour, is taste, and stays with the reviewer.
//  * It says nothing about emoji CONTENT. A `{ kind: 'art' }` block full of
//    emoji is full colour that no tone can re-tint — that is deliberate for
//    the text games (`memory`'s cards, `count`'s ducks, `spot`'s row), and
//    this check has no way to distinguish it from a canvas painting a rainbow
//    of emoji. It does count a canvas `emoji` OP as its own tone, since on a
//    field of flat single-tone shapes that is precisely a second colour.
//  * It cannot see the theme. Two tones that resolve to nearly the same hue
//    still count as two, and two that clash violently still count as two.
describe('monochrome: the ground, one ink, and at most one more', () => {
  const ALLOWANCE = 2
  const INK = 'plain'

  // THE DEBT LIST IS GONE. It recorded seven cartridges — draw, drum, fish,
  // mole, rain, simon, stars — at 3 to 6 tones each, and every one of them
  // measures ONE tone today. A `<=` allowance that nothing can reach is not a
  // ratchet, it is a hole: it permitted a four- to six-tone regression in
  // seven of the fifteen live cartridges with the suite still green, and it
  // also skipped the "one of the two must be `plain`" check for exactly those
  // seven. Deleting it changes no result and closes both.

  /** Every tone a live cartridge puts in its command buffer while being played. */
  const liveTones = (c: Extract<Cartridge, { kind: 'live' }>): Set<string> => {
    const { ctx } = testCtx({ strings: c.strings })
    const inst = c.create(ctx)
    const g = gridFor(c.size)
    const tones = new Set<string>()

    const sample = (): void => {
      const canvas = new Canvas(g.w, g.h)
      inst.draw(canvas)
      for (const cmd of canvas.cmds()) {
        if (cmd.op === 'clear') continue
        // An emoji carries its own colours and no tone can re-tint it, so on
        // a canvas it IS a second palette.
        tones.add(cmd.op === 'emoji' ? 'emoji' : cmd.tone)
      }
    }

    const keys = [
      'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'Enter',
      'a', 's', 'd', 'f', 'g', 'h', 'j', 'z', '1', '2', '3', '4', '5',
    ]
    sample()
    for (let pass = 0; pass < 2; pass++) {
      for (const key of keys) {
        inst.onKey?.({ key, shift: false, repeat: false })
        sample()
      }
      for (let i = 0; i < 400; i++) {
        inst.tick?.(1 / 60)
        if (i % 10 === 0) sample()
      }
    }
    return tones
  }

  /** Every tone a turn/echo cartridge puts on a block while being talked to. */
  const saidTones = (
    c: Extract<Cartridge, { kind: 'turn' | 'echo' }>,
    locale: Locale,
  ): { tones: Set<string>; rainbow: boolean } => {
    const lines = [
      'cat', '3', 'a1 b3', 'more', '2', 'hello', 'b2 c4', 'red', '1', 'seven',
      'blue', 'hat', 'd4 a2', '4', 'pizza',
    ]
    const said: BlockSpec[] = []
    if (c.kind === 'echo') {
      for (const input of ['', 'cat', '3', 'red']) {
        const h = testCtx({ locale, input, strings: c.strings })
        c.respond(h.ctx)
        said.push(...h.said)
      }
    } else {
      const h = testCtx({ locale, strings: c.strings })
      const inst = c.create(h.ctx)
      inst.start()
      for (const line of lines) {
        if (h.exited()) break
        inst.onLine(line)
      }
      said.push(...h.said)
    }
    return {
      tones: new Set(said.map((b) => b.tone ?? INK)),
      rainbow: said.some((b) => b.kind === 'text' && b.rainbow === true),
    }
  }

  it('no live cartridge paints in more than the ground, one ink and one more', () => {
    for (const c of registry()) {
      if (c.kind !== 'live') continue
      const tones = liveTones(c)
      expect(
        tones.size,
        `${c.id} painted ${tones.size} tones (${[...tones].join(', ')}); ` +
        `the allowance is ${ALLOWANCE}`,
      ).toBeLessThanOrEqual(ALLOWANCE)

      if (tones.size === ALLOWANCE) {
        expect(
          tones.has(INK),
          `${c.id} uses two tones (${[...tones].join(', ')}) and neither is ` +
          `'${INK}' — the ink is the theme's own foreground, and the second ` +
          'tone is what sits on top of it',
        ).toBe(true)
      }
    }
  })

  it('no turn or echo cartridge speaks in more than one ink and one more', () => {
    for (const c of registry()) {
      if (c.kind === 'live') continue
      for (const locale of c.locales) {
        const { tones } = saidTones(c, locale)
        expect(
          tones.size,
          `${c.id} (${locale}) spoke in ${tones.size} tones (${[...tones].join(', ')})`,
        ).toBeLessThanOrEqual(ALLOWANCE)
        if (tones.size === ALLOWANCE) {
          expect(
            tones.has(INK),
            `${c.id} (${locale}) uses two tones (${[...tones].join(', ')}) ` +
            `and neither is '${INK}'`,
          ).toBe(true)
        }
      }
    }
  })

  // A rainbow is every tone at once, which is the one thing the rule forbids
  // outright. `story` shipped one on its title.
  it('no cartridge paints a rainbow', () => {
    for (const c of registry()) {
      if (c.kind === 'live') continue
      for (const locale of c.locales) {
        expect(saidTones(c, locale).rainbow, `${c.id} (${locale}) painted a rainbow`)
          .toBe(false)
      }
    }
  })
})
