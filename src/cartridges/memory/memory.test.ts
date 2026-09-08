import { describe, it, expect } from 'vitest'
import memory from './cartridge'
import { testCtx } from '../../testing/cartridgeHarness'
import type { BlockSpec } from '../../types'

const ROWS = ['a', 'b', 'c', 'd'] as const
const coordAt = (i: number): string => `${ROWS[Math.floor(i / 4)]}${(i % 4) + 1}`

const play = (lines: string[], seed = 1, locale: 'en' | 'he' = 'en') => {
  // CORRECTION 3: memory.strings must be passed into testCtx, or ctx.t(...)
  // renders raw keys instead of the actual copy.
  const h = testCtx({ seed, locale, strings: memory.strings })
  const inst = memory.create(h.ctx)
  inst.start()
  for (const l of lines) inst.onLine(l)
  return { ...h, inst }
}

const text = (said: unknown[]) =>
  said.map((b) => {
    const x = b as { text?: string; art?: string }
    return x.text ?? x.art ?? ''
  }).join('\n')

/** The most recently emitted `art` block — the board as it looked right
 * after the most recent guess. */
const lastArt = (said: BlockSpec[]): string => {
  for (let k = said.length - 1; k >= 0; k--) {
    const b = said[k]!
    if (b.kind === 'art') return b.art
  }
  return ''
}

/** Reads the token (a literal `?` for hidden, or the true emoji) shown at
 * board index `i` in a rendered board string. Parses by splitting each row
 * on whitespace, so it doesn't depend on exact column widths. */
const readCell = (art: string, i: number): string => {
  const row = ROWS[Math.floor(i / 4)]
  const col = i % 4
  const line = art.split('\n').find((l) => l.trim().split(/\s+/)[0] === row)
  if (!line) throw new Error(`no row "${row}" in board:\n${art}`)
  // Split on the card WALL rather than on whitespace: every place is a framed
  // face now (`cartridges/card.ts`), so the walls are the column boundaries
  // and this still does not depend on the exact width of a face.
  return line.split('\u2502').slice(1, 5)[col]!.trim()
}

/**
 * Plays a fresh board (given seed/locale) to exactly `n` found pairs, in the
 * board's own natural pair order, and returns the resulting souvenir.
 *
 * A throwaway "scan" instance first reveals every cell (via 8 adjacent-coord
 * guesses, exactly like the other tests in this file) purely to read off the
 * true emoji at each index — this does not depend on any of those guesses
 * happening to be real matches. From that, the 8 true pairs are grouped by
 * value, in the order their first cell appears on the board. A second, fresh
 * instance then plays exactly the first `n` of those *true* pairs, so it
 * matches every time regardless of guess order, giving a souvenir with
 * exactly `n` named things — 0 through 8, on demand.
 */
const souvenirAtLength = (n: number, seed: number, locale: 'en' | 'he'): string => {
  const scan = testCtx({ seed, strings: memory.strings })
  const scanInst = memory.create(scan.ctx)
  scanInst.start()
  const values: string[] = new Array(16)
  for (let i = 0; i < 16; i += 2) {
    scanInst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
    const art = lastArt(scan.said)
    values[i] = readCell(art, i)
    values[i + 1] = readCell(art, i + 1)
  }
  const byValue = new Map<string, number[]>()
  for (let i = 0; i < 16; i++) {
    const list = byValue.get(values[i]!) ?? []
    list.push(i)
    byValue.set(values[i]!, list)
  }
  const pairs = [...byValue.values()]

  const h = testCtx({ seed, locale, strings: memory.strings })
  const inst = memory.create(h.ctx)
  inst.start()
  for (let k = 0; k < n; k++) {
    const pair = pairs[k]!
    inst.onLine(`${coordAt(pair[0]!)} ${coordAt(pair[1]!)}`)
  }
  return inst.souvenir!()
}

describe('memory', () => {
  it('draws a 4x4 grid of hidden cards on start', () => {
    const board = text(play([]).said)
    expect(board).toContain('a')
    expect(board).toContain('1')
    expect((board.match(/\?/g) ?? []).length).toBeGreaterThanOrEqual(16)
  })

  it('reveals two cards for a valid pair of coordinates', () => {
    const { said } = play(['a1 b2'])
    expect(text(said).length).toBeGreaterThan(0)
  })

  it('shrugs at malformed input instead of erroring', () => {
    for (const bad of ['', 'zzz', 'a', 'a9 b9', 'q1 q2', '!!', 'a1']) {
      const { said } = play([bad])
      const all = text(said).toLowerCase()
      expect(all).not.toContain('error')
      expect(all).not.toContain('invalid')
    }
  })

  it('shrugs at malformed input in Hebrew too', () => {
    for (const bad of ['', 'zzz', 'a', 'a9 b9', 'q1 q2', '!!', 'a1']) {
      const { said } = play([bad], 1, 'he')
      const all = text(said)
      for (const word of ['שגיאה', 'לא תקין', 'לא חוקי', 'טעות']) {
        expect(all).not.toContain(word)
      }
    }
  })

  it('accepts coordinates in either order and with extra spaces', () => {
    expect(() => play(['  A1   b2  '])).not.toThrow()
  })

  it('is deterministic for a seed', () => {
    expect(text(play(['a1 a2'], 5).said)).toBe(text(play(['a1 a2'], 5).said))
  })

  // STRENGTHENED (was `expect(inst.souvenir!()).toMatch(/\d/)` with no
  // inspection of the deck at all, which passes no matter what the code
  // produces). This actually reads back all 16 cells via the cartridge's own
  // rendered output — playing every adjacent pair once reveals every cell's
  // true value at least once, whether or not that particular guess matched —
  // and verifies the deck really is 8 distinct emoji, each placed twice.
  it('lays out every emoji exactly twice', () => {
    const h = testCtx({ seed: 7, strings: memory.strings })
    const inst = memory.create(h.ctx)
    inst.start()

    const values: string[] = new Array(16)
    for (let i = 0; i < 16; i += 2) {
      inst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
      const art = lastArt(h.said)
      values[i] = readCell(art, i)
      values[i + 1] = readCell(art, i + 1)
    }

    expect(values).toHaveLength(16)
    expect(values.every((v) => v !== '?')).toBe(true)

    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    expect(counts.size).toBe(8)
    for (const n of counts.values()) expect(n).toBe(2)
  })

  // STRENGTHENED (was `expect(typeof exited()).toBe('boolean')`, true no
  // matter what happens). This genuinely plays the board to completion: a
  // first pass reveals every cell's true value by guessing adjacent pairs
  // (recording any of those that happened to be real matches), then a second
  // pass plays the *actual* matching pair for every cell not already found.
  // Only a cartridge that really tracks state and calls ctx.exit() once all
  // eight pairs are found can make `exited()` come back true here.
  it('holds on a finished board instead of ending itself', () => {
    const h = testCtx({ seed: 3, strings: memory.strings })
    const inst = memory.create(h.ctx)
    inst.start()

    const values: string[] = new Array(16)
    const matched = new Set<number>()

    for (let i = 0; i < 16; i += 2) {
      inst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
      const art = lastArt(h.said)
      values[i] = readCell(art, i)
      values[i + 1] = readCell(art, i + 1)
      if (values[i] === values[i + 1]) {
        matched.add(i)
        matched.add(i + 1)
      }
    }

    const remaining = [...Array(16).keys()].filter((i) => !matched.has(i))
    const byValue = new Map<string, number[]>()
    for (const i of remaining) {
      const list = byValue.get(values[i]!) ?? []
      list.push(i)
      byValue.set(values[i]!, list)
    }

    for (const idx of byValue.values()) {
      expect(idx).toHaveLength(2)
      inst.onLine(`${coordAt(idx[0]!)} ${coordAt(idx[1]!)}`)
    }

    // THE PACING RULE. Finding the last pair used to call ctx.exit(), so the
    // shell tore the solved board down in the same breath as the cheer. The
    // finished board now HOLDS: every card face up, a warm line, and not a
    // thing moves until the child types something.
    expect(h.exited()).toBe(false)
    expect(text(h.said)).toContain('you found them all!')
    expect(lastArt(h.said)).not.toContain('?')

    // ...and then any line at all deals a fresh board, face down again.
    inst.onLine('more')
    expect(h.exited()).toBe(false)
    expect(lastArt(h.said)).toContain('?')
  })

  it('never says the child was wrong', () => {
    const all = text(play(['a1 b2', 'c3 d4']).said).toLowerCase()
    for (const bad of ['wrong', 'lose', 'fail', 'error']) {
      expect(all).not.toContain(bad)
    }
  })

  it('never says the child was wrong, in Hebrew either', () => {
    const all = text(play(['a1 b2', 'c3 d4'], 1, 'he').said)
    for (const bad of ['שגוי', 'טעות', 'לא נכון', 'נסה שוב']) {
      expect(all).not.toContain(bad)
    }
  })

  it('is a turn cartridge available in both locales, Latin coordinates', () => {
    expect(memory.kind).toBe('turn')
    expect(memory.locales).toEqual(['en', 'he'])
    // The grid itself is canvas-style art: coordinates stay Latin even under
    // the Hebrew locale, and Hebrew shows up only in the prose around it.
    const heBoard = text(play([], 1, 'he').said)
    expect(heBoard).toContain('a')
    expect(heBoard).toContain('1')
    expect(/[֐-׿]/.test(heBoard)).toBe(true)
  })

  // Rewritten: the old assertion only checked the souvenir was a non-empty
  // string, which passed no matter what it said — including a bare count.
  // Zero pairs found (the ESC-immediately case) must read warmly, never as
  // a bare "0": there are no scores here, and nothing counts down.
  it('gives a warm, non-numeric souvenir when no pair was ever found', () => {
    const { inst } = play([])
    const s = inst.souvenir!()
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
  })

  it('names the pair found as its souvenir, not a count', () => {
    const { inst } = play(['a1 a2'], 1)
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
  })

  it('names every pair found, joined naturally, in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ seed: 3, locale, strings: memory.strings })
      const inst = memory.create(h.ctx)
      inst.start()

      const values: string[] = new Array(16)
      for (let i = 0; i < 16; i += 2) {
        inst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
        const art = lastArt(h.said)
        values[i] = readCell(art, i)
        values[i + 1] = readCell(art, i + 1)
      }
      // Re-derive real matches the same way the "exits once every pair is
      // found" test does, then play out the rest so every pair is found.
      const matched = new Set<number>()
      for (let i = 0; i < 16; i += 2) {
        if (values[i] === values[i + 1]) { matched.add(i); matched.add(i + 1) }
      }
      const left = [...Array(16).keys()].filter((i) => !matched.has(i))
      const byValue = new Map<string, number[]>()
      for (const i of left) {
        const list = byValue.get(values[i]!) ?? []
        list.push(i)
        byValue.set(values[i]!, list)
      }
      for (const idx of byValue.values()) inst.onLine(`${coordAt(idx[0]!)} ${coordAt(idx[1]!)}`)

      expect(h.exited()).toBe(false)
      const s = inst.souvenir!()
      expect(s).not.toMatch(/\d/)
      expect(s.length).toBeGreaterThan(0)
    }
  })

  it('caps how many names the souvenir spells out on a fully-found board', () => {
    const h = testCtx({ seed: 3, strings: memory.strings })
    const inst = memory.create(h.ctx)
    inst.start()

    const values: string[] = new Array(16)
    for (let i = 0; i < 16; i += 2) {
      inst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
      const art = lastArt(h.said)
      values[i] = readCell(art, i)
      values[i + 1] = readCell(art, i + 1)
    }
    const matched = new Set<number>()
    for (let i = 0; i < 16; i += 2) {
      if (values[i] === values[i + 1]) { matched.add(i); matched.add(i + 1) }
    }
    const left = [...Array(16).keys()].filter((i) => !matched.has(i))
    const byValue = new Map<string, number[]>()
    for (const i of left) {
      const list = byValue.get(values[i]!) ?? []
      list.push(i)
      byValue.set(values[i]!, list)
    }
    for (const idx of byValue.values()) inst.onLine(`${coordAt(idx[0]!)} ${coordAt(idx[1]!)}`)

    expect(h.exited()).toBe(false)
    const s = inst.souvenir!()
    // All 8 pairs found; the souvenir must not spell out all 8 names.
    const wordCount = s.split(/\s+/).length
    expect(wordCount).toBeLessThan(20)
    // STRENGTHENED: a word count under 20 says nothing about whether the
    // sentence is actually well-formed — "you found the circus, the
    // rainbow, the cat, and and more!" is 9 words and passed this exact
    // check before the fix. A capped list must not double its conjunction.
    expect(s).not.toMatch(/\band and\b/)
  })

  // TDD: this reproduces the live bug verbatim before the fix — a capped
  // souvenir list doubled its conjunction because `memory.souvenir.more`
  // ("and more" / "ועוד") already contains one, and `joinNamed` prepended a
  // second. Pre-fix output (seed 3, playing to all 8 pairs so the list caps
  // at NAME_CAP=4 shown items):
  //   en: "you found the planet, the target, the whale, and and more!"
  //   he: "מצאת את כוכב הלכת, המטרה, הלווייתן וועוד!"          (doubled ו)
  it('does not double the conjunction on a capped souvenir list, in either language', () => {
    const en = souvenirAtLength(8, 3, 'en')
    expect(en).not.toMatch(/\band and\b/)
    expect(en).toBe('you found the planet, the target, the whale, and more!')

    const he = souvenirAtLength(8, 3, 'he')
    // A doubled Hebrew conjunction shows up as two vavs run together at the
    // *start* of the final word ("וועוד" instead of "ועוד") — Hebrew's ו is
    // a prefix glued onto the next word, never a separate token, so there is
    // no space to catch this the way "and and" catches the English case.
    // The check must be word-start-anchored, not "וו anywhere": legitimate
    // Hebrew spelling doubles vav mid-word too (this very string contains
    // "הלווייתן", "the whale", spelled with a real doubled vav).
    expect(he).not.toMatch(/(^|\s)וו/)
    expect(he).toBe('מצאתם את כוכב הלכת, המטרה, הלווייתן ועוד!')
  })

  it('joins souvenir lists correctly at every length, in both languages', () => {
    // seed 3's true pair order (by first-appearance on the board) is
    // planet, target, whale, fire, sunflower, rainbow, butterfly, dinosaur.
    // NAME_CAP is 4, so 8 found pairs caps the list at 3 named things plus
    // the overflow marker.
    expect(souvenirAtLength(0, 3, 'en')).toBe(
      'no pairs yet — the cards are still a mystery!',
    )
    expect(souvenirAtLength(1, 3, 'en')).toBe('you found the planet!')
    expect(souvenirAtLength(2, 3, 'en')).toBe('you found the planet and the target!')
    expect(souvenirAtLength(3, 3, 'en')).toBe(
      'you found the planet, the target, and the whale!',
    )
    expect(souvenirAtLength(8, 3, 'en')).toBe(
      'you found the planet, the target, the whale, and more!',
    )

    expect(souvenirAtLength(0, 3, 'he')).toBe(
      'עוד לא מצאנו זוגות — הקלפים עדיין שומרים סוד!',
    )
    expect(souvenirAtLength(1, 3, 'he')).toBe('מצאתם את כוכב הלכת!')
    expect(souvenirAtLength(2, 3, 'he')).toBe('מצאתם את כוכב הלכת והמטרה!')
    expect(souvenirAtLength(3, 3, 'he')).toBe(
      'מצאתם את כוכב הלכת, המטרה והלווייתן!',
    )
    expect(souvenirAtLength(8, 3, 'he')).toBe(
      'מצאתם את כוכב הלכת, המטרה, הלווייתן ועוד!',
    )
  })

  it('the completion message no longer reports a try count', () => {
    const h = testCtx({ seed: 3, strings: memory.strings })
    const inst = memory.create(h.ctx)
    inst.start()

    const values: string[] = new Array(16)
    for (let i = 0; i < 16; i += 2) {
      inst.onLine(`${coordAt(i)} ${coordAt(i + 1)}`)
      const art = lastArt(h.said)
      values[i] = readCell(art, i)
      values[i + 1] = readCell(art, i + 1)
    }
    const matched = new Set<number>()
    for (let i = 0; i < 16; i += 2) {
      if (values[i] === values[i + 1]) { matched.add(i); matched.add(i + 1) }
    }
    const left = [...Array(16).keys()].filter((i) => !matched.has(i))
    const byValue = new Map<string, number[]>()
    for (const i of left) {
      const list = byValue.get(values[i]!) ?? []
      list.push(i)
      byValue.set(values[i]!, list)
    }
    for (const idx of byValue.values()) inst.onLine(`${coordAt(idx[0]!)} ${coordAt(idx[1]!)}`)

    // The last block said is the completion message itself (the board's
    // "art" block, which legitimately contains column digits 1-4, is the one
    // before it) — check that specific line, not the whole transcript.
    const last = h.said.at(-1) as { text?: string }
    expect(last.text).not.toMatch(/\d/)
  })

  // Three identical miss lines in a row read as a rebuke even when each one
  // is warm on its own. Two wordings, ALTERNATING rather than randomised, so
  // consecutive misses can never repeat.
  it('never says the same thing twice running after a miss', () => {
    const h = testCtx({ seed: 7, strings: memory.strings })
    const inst = memory.create(h.ctx)
    inst.start()
    const notes: string[] = []
    for (let i = 0; i < 6; i++) {
      const before = h.said.length
      inst.onLine('a1 d4')
      const spec = h.said.slice(before).find((b) => b.kind === 'text')
      if (spec && spec.kind === 'text') notes.push(spec.text)
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i]).not.toBe(notes[i - 1]!)
    expect(new Set(notes).size).toBeGreaterThan(1)
  })

  // The hint bar already carries `a1 b3  two spots`. The opening transcript
  // line used to spell the same example out a second time.
  it('does not repeat the hint bar in the transcript', () => {
    const h = testCtx({ strings: memory.strings })
    memory.create(h.ctx).start()
    const opening = text(h.said)
    expect(opening).not.toContain('a1 b3')
  })
})
