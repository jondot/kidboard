import { describe, it, expect } from 'vitest'
import count from './cartridge'
import { testCtx } from '../../testing/cartridgeHarness'
import type { BlockSpec } from '../../types'

const play = (lines: string[], seed = 1, locale: 'en' | 'he' = 'en') => {
  const h = testCtx({ seed, locale, strings: count.strings })
  const inst = count.create(h.ctx)
  inst.start()
  for (const l of lines) inst.onLine(l)
  return { ...h, inst }
}

const text = (said: BlockSpec[]): string =>
  said.map((b) => (b.kind === 'art' ? b.art : b.text)).join('\n')

/** The most recently emitted art block — the group as it looks right now. */
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

const emojiCount = (art: string): number =>
  (art.match(/\p{Extended_Pictographic}/gu) ?? []).length

/**
 * Lines of an art block that actually carry THINGS.
 *
 * Emoji, not "any non-blank character": the picture stands in a frame now
 * (`cartridges/card.ts`), and its walls and ground rail are non-blank on
 * every single line. What these tests mean by "a scatter, not a row" is how
 * many lines have something to count on them.
 */
const inkedLines = (art: string): string[] =>
  art.split('\n').filter((l) => /\p{Extended_Pictographic}/u.test(l))

/** Starts a fresh game and returns how many things are in the first group. */
const groupSize = (seed: number): number => {
  const h = play([], seed)
  return emojiCount(firstArt(h.said))
}

describe('count', () => {
  it('is a turn cartridge in both languages with its own triggers', () => {
    expect(count.kind).toBe('turn')
    expect(count.locales).toEqual(['en', 'he'])
    expect(count.triggers.en).toContain('count')
    expect(count.triggers.he?.length).toBeGreaterThan(0)
  })

  it('shows a scattered group and asks how many, as art not text', () => {
    const { said } = play([])
    const art = said.find((b) => b.kind === 'art')
    expect(art, 'the group must be an art block, never text').toBeTruthy()
    expect(emojiCount(firstArt(said))).toBeGreaterThan(1)
    // A scatter, not a row: more than one line carries emoji.
    expect(inkedLines(firstArt(said)).length).toBeGreaterThan(1)
    expect(text(said).length).toBeGreaterThan(0)
  })

  it('starts small — the first group is never a big pile', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(groupSize(seed)).toBeLessThanOrEqual(3)
      expect(groupSize(seed)).toBeGreaterThanOrEqual(2)
    }
  })

  it('ramps slowly — later groups grow', () => {
    // Answer correctly five times; the last group is bigger than the first.
    const h = testCtx({ seed: 4, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const first = emojiCount(firstArt(h.said))
    let n = first
    for (let r = 0; r < 5; r++) {
      inst.onLine(String(n))   // right answer: the game holds on the cheer
      inst.onLine('more')      // ...and the child asks for the next group
      n = emojiCount(lastArt(h.said))
    }
    expect(n).toBeGreaterThan(first)
  })

  // THE PACING RULE. A right answer used to cheer and deal the next group in
  // the same breath, so the good moment was buried under a fresh puzzle
  // before a six-year-old had finished being pleased about it.
  it('holds on a correct count instead of dealing the next group over it', () => {
    const h = testCtx({ seed: 2, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    const before = h.said.length
    inst.onLine(String(n))
    const after = h.said.slice(before)
    expect(after.length).toBeGreaterThan(0)
    // The cheer stands alone: no new group is dealt until it is asked for.
    expect(after.some((b) => b.kind === 'art')).toBe(false)
    expect(h.exited()).toBe(false)

    // ...and then any line at all brings the next group.
    inst.onLine('more')
    expect(h.said.slice(before + after.length).some((b) => b.kind === 'art')).toBe(true)
    expect(h.exited()).toBe(false)
  })

  it('re-arranges the same group into a neat row after a miss', () => {
    const h = testCtx({ seed: 3, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const scatter = firstArt(h.said)
    const n = emojiCount(scatter)
    expect(inkedLines(scatter).length).toBeGreaterThan(1)

    inst.onLine(String(n + 1)) // a miss

    const row = lastArt(h.said)
    // Same group, same things — just laid out one after another.
    expect(emojiCount(row)).toBe(n)
    expect(inkedLines(row)).toHaveLength(1)
    expect(row).not.toBe(scatter)
  })

  it('keeps the same group after a miss so the child can try again', () => {
    const h = testCtx({ seed: 5, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    inst.onLine(String(n + 2))
    expect(emojiCount(lastArt(h.said))).toBe(n)
    const before = h.said.length
    inst.onLine(String(n)) // the second go lands
    expect(h.said.length).toBeGreaterThan(before)
    expect(inst.souvenir!()).not.toMatch(/\d/)
    expect(inst.souvenir!().length).toBeGreaterThan(0)
  })

  it('never rebukes a wrong count, in English', () => {
    const h = testCtx({ seed: 3, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    inst.onLine(String(n + 1))
    inst.onLine(String(Math.max(1, n - 1)))
    const all = text(h.said).toLowerCase()
    for (const bad of ['wrong', 'no,', 'nope', 'lose', 'lost', 'fail', 'error', 'incorrect', 'try again']) {
      expect(all, `said "${bad}"`).not.toContain(bad)
    }
  })

  it('never rebukes a wrong count, in Hebrew', () => {
    const h = testCtx({ seed: 3, locale: 'he', strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    inst.onLine(String(n + 1))
    inst.onLine(String(Math.max(1, n - 1)))
    const all = text(h.said)
    for (const bad of ['לא נכון', 'שגיאה', 'טעות', 'נסה שוב', 'שגוי', 'לא תקין', 'הפסדת']) {
      expect(all, `said "${bad}"`).not.toContain(bad)
    }
  })

  it('handles empty, lettered and punctuation input kindly, in both languages', () => {
    for (const locale of ['en', 'he'] as const) {
      for (const bad of ['', '   ', '\t', 'banana', '???', '!!!', '- -', 'a1 b3', '🎈']) {
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

  it('accepts a number spelled out as a word, in both languages', () => {
    const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    const HE = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע']
    for (const [locale, words] of [['en', EN], ['he', HE]] as const) {
      const h = testCtx({ seed: 6, locale, strings: count.strings })
      const inst = count.create(h.ctx)
      inst.start()
      const n = emojiCount(firstArt(h.said))
      inst.onLine(words[n]!)
      // Counted, so the souvenir now names something.
      expect(inst.souvenir!().length).toBeGreaterThan(0)
      expect(inst.souvenir!()).not.toMatch(/\d/)
    }
  })

  it('gives a warm, non-numeric souvenir before anything is counted', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = play([], 1, locale)
      const s = inst.souvenir!()
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\d/)
      expect(s.trim()).not.toMatch(/[a-zA-Zא-ת]\s+$/)
    }
  })

  it('names what was counted, never how many', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ seed: 8, locale, strings: count.strings })
      const inst = count.create(h.ctx)
      inst.start()
      for (let r = 0; r < 4; r++) {
        inst.onLine(String(emojiCount(lastArt(h.said))))
      }
      const s = inst.souvenir!()
      expect(s).not.toMatch(/\d/)
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\band and\b/)
      expect(s).not.toMatch(/(^|\s)וו/)
    }
  })

  it('caps the souvenir list rather than reading out a roll call', () => {
    const h = testCtx({ seed: 9, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    for (let r = 0; r < 12; r++) inst.onLine(String(emojiCount(lastArt(h.said))))
    const s = inst.souvenir!()
    expect(s.split(/\s+/).length).toBeLessThan(20)
    expect(s).not.toMatch(/\band and\b/)
    expect(s).not.toMatch(/,\s*,/)
  })

  it('is deterministic for a seed', () => {
    expect(text(play(['1', '2'], 11).said)).toBe(text(play(['1', '2'], 11).said))
  })

  it('never ends the game by itself — only ESC or quit do that', () => {
    const h = play(['1', '2', '3', 'banana', ''], 12)
    expect(h.exited()).toBe(false)
  })

  it('declares a hint that is not the shell-owned ESC', () => {
    const hints = count.hints((k) => k)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys).not.toMatch(/esc/i)
  })

  // A coin flip repeated itself one turn in four, so three misses running
  // could still read the identical sentence three times. The two wordings now
  // ALTERNATE, which makes an immediate repeat impossible rather than rare.
  it('never says the same thing twice running after a miss', () => {
    const seen: string[] = []
    const h = testCtx({ seed: 5, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    for (let i = 0; i < 6; i++) {
      inst.onLine(String(n + 3))
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
      for (const [key, value] of Object.entries(count.strings![locale]!)) {
        for (const bad of BAD[locale]) {
          expect(value.toLowerCase(), `${locale} ${key} says "${bad}"`)
            .not.toContain(bad.toLowerCase())
        }
      }
    }
  })

  // Found by playing it: `scatter()` deals a NEW random arrangement every
  // time it is called, and every redraw called it again — so typing a word at
  // a group of three ducks shuffled the ducks. A child counting is tracking
  // positions with their eyes.
  it('never rearranges the group under the child', () => {
    const h = testCtx({ seed: 6, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const opening = firstArt(h.said)
    for (const noise of ['banana', '???', '', 'more', 'zzz']) {
      inst.onLine(noise)
      expect(lastArt(h.said), `"${noise}" moved the group`).toBe(opening)
    }
  })

  // ...and once a miss has laid the group out in a row, the ROW is what
  // stays. The help used to be taken away again by the next stray keystroke.
  it('keeps the helping row on screen once it has been offered', () => {
    const h = testCtx({ seed: 6, strings: count.strings })
    const inst = count.create(h.ctx)
    inst.start()
    const n = emojiCount(firstArt(h.said))
    inst.onLine(String(n + 4))
    const helped = lastArt(h.said)
    // One line of THINGS — a neat left-to-right row a finger can touch once
    // each. The other lines are the card's own frame and its ground rail.
    expect(inkedLines(helped)).toHaveLength(1)
    inst.onLine('banana')
    expect(lastArt(h.said)).toBe(helped)
  })
})
