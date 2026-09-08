import { describe, it, expect } from 'vitest'
import spot, { PAIRS, OBVIOUS } from './cartridge'
import { testCtx } from '../../testing/cartridgeHarness'
import type { BlockSpec } from '../../types'

const play = (lines: string[], seed = 1, locale: 'en' | 'he' = 'en') => {
  const h = testCtx({ seed, locale, strings: spot.strings })
  const inst = spot.create(h.ctx)
  inst.start()
  for (const l of lines) inst.onLine(l)
  return { ...h, inst }
}

const text = (said: BlockSpec[]): string =>
  said.map((b) => (b.kind === 'art' ? b.art : b.text)).join('\n')

const lastArt = (said: BlockSpec[]): string => {
  for (let k = said.length - 1; k >= 0; k--) {
    const b = said[k]!
    if (b.kind === 'art') return b.art
  }
  return ''
}

const firstArt = (said: BlockSpec[]): string => {
  for (const b of said) if (b.kind === 'art') return b.art
  return ''
}

/**
 * The emoji of a rendered row, left to right. Read off the WHOLE picture, not
 * off its first line: the row stands in a grid of pads now (`cartridges/card.ts`)
 * and the first line is that grid's top rule.
 */
const rowEmoji = (art: string): string[] =>
  art.match(/\p{Extended_Pictographic}/gu) ?? []

/** The line of position labels: the last one, under the grid's ground rail. */
const labelLine = (art: string): string => art.split('\n').at(-1)!

/** 1-based position of the one that differs, read back off the drawn row. */
const oddPosition = (art: string): number => {
  const cells = rowEmoji(art)
  const counts = new Map<string, number>()
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1)
  const odd = [...counts.entries()].find(([, n]) => n === 1)
  if (!odd) throw new Error(`no odd one in row: ${art}`)
  return cells.indexOf(odd[0]) + 1
}

describe('spot', () => {
  it('is a turn cartridge in both languages with its own triggers', () => {
    expect(spot.kind).toBe('turn')
    expect(spot.locales).toEqual(['en', 'he'])
    expect(spot.triggers.en).toContain('spot')
    expect(spot.triggers.he?.length).toBeGreaterThan(0)
  })

  it('shows a row with exactly one odd thing, as art not text', () => {
    const { said } = play([])
    expect(said.some((b) => b.kind === 'art')).toBe(true)
    const art = firstArt(said)
    const cells = rowEmoji(art)
    expect(cells.length).toBeGreaterThanOrEqual(4)
    expect(new Set(cells).size).toBe(2)
    expect(() => oddPosition(art)).not.toThrow()
  })

  it('labels every position so the child can name one', () => {
    const art = firstArt(play([]).said)
    // Five lines: the grid's top rule, a pad's empty upper row, the row of
    // faces, the ground rail they stand on, and the labels underneath — the
    // way `drum` puts a key cap under a pad.
    const lines = art.split('\n')
    expect(lines.length).toBe(5)
    const labels = labelLine(art).trim().split(/\s+/)
    expect(labels).toEqual(rowEmoji(art).map((_, i) => String(i + 1)))
  })

  // The frame is the picture's own edge, and it stands on the ground: the
  // shared vocabulary of the character idiom, which `memory` and `count` wear
  // too. A row of four emoji loose in the top-left corner was the thing this
  // cartridge was called out for.
  it('draws the row as a grid of pads standing on the ground', () => {
    const lines = firstArt(play([]).said).split('\n')
    expect(lines[0]!.startsWith('┌')).toBe(true)
    expect(lines[1]!.startsWith('│')).toBe(true)
    expect(lines[2]!.startsWith('│')).toBe(true)
    // The ground rail: a double rule where the other three sides are single.
    expect(lines[3]!.startsWith('╘')).toBe(true)
    expect(lines[3]!).toContain('═')
    // Every face has walls either side, so the pads and their labels line up,
    // and the pad's empty upper row is exactly as wide as the row of things.
    expect(lines[2]!.split('│')).toHaveLength(rowEmoji(lines[2]!).length + 2)
    expect(lines[1]!.length).toBe(lines[3]!.length)
  })

  it('starts with an obvious difference', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const cells = rowEmoji(firstArt(play([], seed).said))
      const kinds = new Set(cells)
      const obvious = OBVIOUS.some(
        (p) => kinds.has(p.same) && kinds.has(p.odd),
      )
      expect(obvious, `seed ${seed} opened with a subtle pair`).toBe(true)
    }
  })

  it('puts the odd one in different places across seeds', () => {
    const seen = new Set<number>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      seen.add(oddPosition(firstArt(play([], seed).said)))
    }
    expect(seen.size, `always slot ${[...seen]}`).toBeGreaterThan(1)
  })

  it('never puts the odd one in the same slot two rounds running', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const h = testCtx({ seed, strings: spot.strings })
      const inst = spot.create(h.ctx)
      inst.start()
      let prev = oddPosition(firstArt(h.said))
      for (let r = 0; r < 8; r++) {
        inst.onLine(String(prev))   // right answer: the game holds on the cheer
        inst.onLine('more')         // ...and the child asks for the next row
        const now = oddPosition(lastArt(h.said))
        expect(now, `seed ${seed} repeated slot ${prev}`).not.toBe(prev)
        prev = now
      }
    }
  })

  // THE PACING RULE. Spotting the odd one used to cheer and deal the next
  // row in the same breath, so the good moment was gone before a six-year-old
  // had finished enjoying it.
  it('holds on a find instead of dealing the next row over it', () => {
    const h = testCtx({ seed: 2, strings: spot.strings })
    const inst = spot.create(h.ctx)
    inst.start()
    const at = oddPosition(firstArt(h.said))
    const before = h.said.length
    inst.onLine(String(at))
    const after = h.said.slice(before)
    // The cheer stands alone: no new row until it is asked for.
    expect(after.some((b) => b.kind === 'art')).toBe(false)
    expect(inst.souvenir!().length).toBeGreaterThan(0)
    expect(h.exited()).toBe(false)

    // ...and then any line at all brings the next row.
    inst.onLine('more')
    expect(h.said.slice(before + after.length).some((b) => b.kind === 'art')).toBe(true)
    expect(h.exited()).toBe(false)
  })

  it('keeps the same row after a wrong guess so the child can look again', () => {
    const h = testCtx({ seed: 3, strings: spot.strings })
    const inst = spot.create(h.ctx)
    inst.start()
    const art = firstArt(h.said)
    const at = oddPosition(art)
    const wrong = at === 1 ? 2 : 1
    inst.onLine(String(wrong))
    expect(rowEmoji(lastArt(h.said))).toEqual(rowEmoji(art))
    expect(oddPosition(lastArt(h.said))).toBe(at)
    // The second look lands.
    inst.onLine(String(at))
    expect(inst.souvenir!()).not.toMatch(/\d/)
    expect(inst.souvenir!().length).toBeGreaterThan(0)
  })

  it('never rebukes a wrong guess, in English', () => {
    const h = testCtx({ seed: 3, strings: spot.strings })
    const inst = spot.create(h.ctx)
    inst.start()
    const at = oddPosition(firstArt(h.said))
    inst.onLine(String(at === 1 ? 2 : 1))
    inst.onLine(String(at === 3 ? 4 : 3))
    const all = text(h.said).toLowerCase()
    for (const bad of ['wrong', 'nope', 'lose', 'lost', 'fail', 'error', 'incorrect', 'try again']) {
      expect(all, `said "${bad}"`).not.toContain(bad)
    }
  })

  it('never rebukes a wrong guess, in Hebrew', () => {
    const h = testCtx({ seed: 3, locale: 'he', strings: spot.strings })
    const inst = spot.create(h.ctx)
    inst.start()
    const at = oddPosition(firstArt(h.said))
    inst.onLine(String(at === 1 ? 2 : 1))
    inst.onLine(String(at === 3 ? 4 : 3))
    const all = text(h.said)
    for (const bad of ['לא נכון', 'שגיאה', 'טעות', 'נסה שוב', 'שגוי', 'הפסדת']) {
      expect(all, `said "${bad}"`).not.toContain(bad)
    }
  })

  it('handles empty, lettered and punctuation input kindly, in both languages', () => {
    for (const locale of ['en', 'he'] as const) {
      for (const bad of ['', '   ', '\t', 'banana', '???', '!!!', 'a1 b3', '🍊', '0', '99']) {
        const h = play([bad], 1, locale)
        const all = text(h.said)
        expect(all.length, `${locale} "${bad}" said nothing`).toBeGreaterThan(0)
        for (const rude of ['wrong', 'error', 'invalid', 'לא נכון', 'שגיאה', 'טעות']) {
          expect(all.toLowerCase()).not.toContain(rude.toLowerCase())
        }
        expect(h.exited(), `${locale} "${bad}" ended the game`).toBe(false)
      }
    }
  })

  it('accepts a position spelled out as a word, in both languages', () => {
    const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six']
    const HE = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש']
    for (const [locale, words] of [['en', EN], ['he', HE]] as const) {
      const h = testCtx({ seed: 6, locale, strings: spot.strings })
      const inst = spot.create(h.ctx)
      inst.start()
      const at = oddPosition(firstArt(h.said))
      inst.onLine(words[at]!)
      expect(inst.souvenir!().length).toBeGreaterThan(0)
      expect(inst.souvenir!()).not.toMatch(/\d/)
    }
  })

  it('gives a warm, non-numeric souvenir before anything is spotted', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = play([], 1, locale)
      const s = inst.souvenir!()
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\d/)
      expect(s.trim()).not.toMatch(/[a-zA-Zא-ת]\s+$/)
    }
  })

  it('names what was spotted, never how many', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ seed: 8, locale, strings: spot.strings })
      const inst = spot.create(h.ctx)
      inst.start()
      for (let r = 0; r < 5; r++) {
        inst.onLine(String(oddPosition(lastArt(h.said))))
      }
      const s = inst.souvenir!()
      expect(s).not.toMatch(/\d/)
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\band and\b/)
      expect(s).not.toMatch(/(^|\s)וו/)
      expect(s).not.toMatch(/,\s*,/)
    }
  })

  it('names every odd thing it can show, in both languages', () => {
    for (const locale of ['en', 'he'] as const) {
      const t = (k: string): string => spot.strings![locale]![k] ?? ''
      for (const p of PAIRS) {
        expect(t(`spot.name.${p.oddId}`), `${locale} ${p.oddId}`).not.toBe('')
      }
    }
  })

  it('is deterministic for a seed', () => {
    expect(text(play(['1', '2'], 11).said)).toBe(text(play(['1', '2'], 11).said))
  })

  it('never ends the game by itself — only ESC or quit do that', () => {
    expect(play(['1', '2', '3', 'banana', ''], 12).exited()).toBe(false)
  })

  it('declares a hint that is not the shell-owned ESC', () => {
    const hints = spot.hints((k) => k)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys).not.toMatch(/esc/i)
  })

  // A coin flip repeated itself one turn in four, so three guesses running
  // could still read the identical sentence three times. The two wordings now
  // ALTERNATE, which makes an immediate repeat impossible rather than rare.
  it('never says the same thing twice running after a wrong guess', () => {
    const seen: string[] = []
    const h = testCtx({ seed: 4, strings: spot.strings })
    const inst = spot.create(h.ctx)
    inst.start()
    const at = oddPosition(firstArt(h.said))
    for (let i = 0; i < 6; i++) {
      inst.onLine(String(at === 1 ? 2 : 1))
      seen.push((h.said.at(-1) as { text?: string }).text ?? '')
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]!)
    expect(new Set(seen).size).toBe(2)
  })

  it('ships no rebuke anywhere in its copy, in either language', () => {
    const BAD = {
      en: ['wrong', 'nope', 'incorrect', 'fail', 'error', 'lose', 'lost', 'try again', 'no,'],
      he: ['לא נכון', 'שגיאה', 'טעות', 'נסה שוב', 'שגוי', 'לא תקין', 'הפסדת', 'נכשל'],
    }
    for (const locale of ['en', 'he'] as const) {
      for (const [key, value] of Object.entries(spot.strings![locale]!)) {
        for (const bad of BAD[locale]) {
          expect(value.toLowerCase(), `${locale} ${key} says "${bad}"`)
            .not.toContain(bad.toLowerCase())
        }
      }
    }
  })
})
