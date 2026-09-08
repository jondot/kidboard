import { describe, it, expect } from 'vitest'
import rhyme, { FAMILIES } from './cartridge'
import { testCtx } from '../../testing/cartridgeHarness'
import type { BlockSpec } from '../../types'

const play = (lines: string[], seed = 1) => {
  const h = testCtx({ seed, strings: rhyme.strings })
  const inst = rhyme.create(h.ctx)
  inst.start()
  for (const l of lines) inst.onLine(l)
  return { ...h, inst }
}

const text = (said: BlockSpec[]): string =>
  said.map((b) => (b.kind === 'art' ? b.art : b.text)).join('\n')

/** Which word the game is currently asking about, read off its own output. */
const asking = (said: BlockSpec[]): string => {
  const all = text(said)
  const hit = [...FAMILIES]
    .map((f) => ({ f, at: all.lastIndexOf(f.word.toUpperCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => b.at - a.at)[0]
  if (!hit) throw new Error(`no prompt word in:\n${all}`)
  return hit.f.word
}

const familyOf = (word: string) => FAMILIES.find((f) => f.word === word)!

describe('rhyme', () => {
  it('is an English-only turn cartridge with its own triggers', () => {
    expect(rhyme.kind).toBe('turn')
    // Rhyme sets are language-specific; there is no honest Hebrew here, so
    // the cartridge is simply absent from Hebrew rather than showing English.
    expect(rhyme.locales).toEqual(['en'])
    expect(rhyme.triggers.en).toContain('rhyme')
    expect(rhyme.triggers.he ?? []).toHaveLength(0)
    expect(Object.keys(rhyme.strings?.en ?? {}).length).toBeGreaterThan(0)
    expect(rhyme.strings?.he).toBeUndefined()
  })

  it('asks what rhymes with a real word', () => {
    const { said } = play([])
    expect(said.length).toBeGreaterThan(0)
    const word = asking(said)
    expect(FAMILIES.some((f) => f.word === word)).toBe(true)
    expect(text(said).toLowerCase()).toContain('rhyme')
  })

  it('offers different words across seeds', () => {
    const seen = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) seen.add(asking(play([], seed).said))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('accepts several different valid rhymes for the same prompt', () => {
    const word = asking(play([]).said)
    const family = familyOf(word)
    const tries = family.rhymes.slice(0, 4)
    expect(tries.length).toBeGreaterThanOrEqual(3)
    for (const answer of tries) {
      const h = play([answer])
      const s = h.inst.souvenir!()
      expect(s.toLowerCase(), `"${answer}" was not accepted`).toContain(answer)
      expect(s.toLowerCase()).toContain(word)
    }
  })

  it('accepts a rhyme it was never told about, by how the word ends', () => {
    // Nothing curated: the ending rule has to carry these.
    const cases: [string, string][] = [
      ['cat', 'scat'], ['dog', 'smog'], ['bug', 'snug'], ['ball', 'stall'],
    ]
    for (const [word, answer] of cases) {
      expect(familyOf(word).rhymes, `${answer} should not be curated`).not.toContain(answer)
      const h = testCtx({ strings: rhyme.strings })
      const inst = rhyme.create(h.ctx)
      inst.start()
      // Every family is offered once before any repeats, so answering each
      // prompt walks the game to the one we want to test.
      for (let i = 0; i <= FAMILIES.length && asking(h.said) !== word; i++) {
        inst.onLine(familyOf(asking(h.said)).rhymes[0]!)  // rhyme found: holds
        inst.onLine('more')                               // ...child asks on
      }
      expect(asking(h.said), `never reached "${word}"`).toBe(word)
      const before = h.said.length
      inst.onLine(answer)
      const reply = text(h.said.slice(before)).toLowerCase()
      expect(reply, `"${answer}" was not accepted`).toContain(answer)
      expect(reply).toContain(word)
    }
  })

  it('never tells a child their word does not rhyme', () => {
    const answers = ['elephant', 'banana', 'zebra', 'kitten', 'blue', 'x', 'qqq']
    for (const seed of [1, 2, 3]) {
      const all = text(play(answers, seed).said).toLowerCase()
      for (const bad of [
        'does not rhyme', "doesn't rhyme", 'not a rhyme', 'no rhyme',
        'wrong', 'nope', 'incorrect', 'try again', 'error', 'lose', 'lost',
      ]) {
        expect(all, `said "${bad}"`).not.toContain(bad)
      }
    }
  })

  it('is kind about a word it cannot confirm, and stays on the same prompt', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    const word = asking(h.said)
    inst.onLine('elephant')
    expect(asking(h.said)).toBe(word)
    expect(text(h.said).length).toBeGreaterThan(0)
    expect(h.exited()).toBe(false)
  })

  it('is kind about the very same word being typed back', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    const word = asking(h.said)
    inst.onLine(word)
    const all = text(h.said).toLowerCase()
    for (const bad of ['wrong', 'no,', 'nope', 'error']) expect(all).not.toContain(bad)
    expect(h.exited()).toBe(false)
  })

  it('handles empty, punctuation and digit input kindly', () => {
    for (const bad of ['', '   ', '\t', '???', '!!!', '123', 'note3', 'a1 b3', '🎵']) {
      const h = play([bad])
      expect(text(h.said).length, `"${bad}" said nothing`).toBeGreaterThan(0)
      expect(h.exited(), `"${bad}" ended the game`).toBe(false)
      expect(h.inst.souvenir!()).not.toMatch(/\d/)
    }
  })

  it('gives a warm, non-numeric souvenir before any rhyme is found', () => {
    const { inst } = play([])
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
    // Never a dangling half-sentence like "a story about a ".
    expect(s.trim()).not.toMatch(/\ba\s*$/)
    expect(s.trim()).not.toMatch(/\bwith\s*$/)
  })

  // The prompt is shown in display case (CAT), so every other rendering of
  // the same word is too — the cheer used to answer "cat and hat" underneath
  // a prompt that said CAT, so the two words a child was comparing were not
  // spelled the same way on screen.
  it('names the pair as its souvenir — "CAT and HAT rhyme!"', () => {
    const word = asking(play([]).said)
    const answer = familyOf(word).rhymes[0]!
    const { inst } = play([answer])
    const s = inst.souvenir!()
    expect(s).toBe(`${word.toUpperCase()} and ${answer.toUpperCase()} rhyme!`)
    expect(s).not.toMatch(/\d/)
  })

  it('joins several pairs without doubling a conjunction or a comma', () => {
    const h = testCtx({ seed: 5, strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    for (let r = 0; r < 6; r++) {
      const family = familyOf(asking(h.said))
      inst.onLine(family.rhymes[0]!)
      inst.onLine('more')
    }
    const s = inst.souvenir!()
    expect(s).not.toMatch(/\band and\b/)
    expect(s).not.toMatch(/,\s*,/)
    expect(s.split(/\s+/).length).toBeLessThan(20)
    // No token immediately repeats, which is how a bad join reads aloud.
    const tokens = s.replace(/[!?.,]/g, '').split(/\s+/)
    for (let i = 1; i < tokens.length; i++) expect(tokens[i]).not.toBe(tokens[i - 1])
  })

  it('never offers a prompt word it has already used in this session', () => {
    const h = testCtx({ seed: 7, strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    const seen: string[] = []
    for (let r = 0; r < FAMILIES.length; r++) {
      const word = asking(h.said)
      expect(seen, `offered "${word}" twice`).not.toContain(word)
      seen.push(word)
      inst.onLine(familyOf(word).rhymes[0]!)
      inst.onLine('more')
    }
  })

  it('is deterministic for a seed', () => {
    expect(text(play(['hat', 'bat'], 11).said)).toBe(text(play(['hat', 'bat'], 11).said))
  })

  it('never ends the game by itself — only ESC or quit do that', () => {
    expect(play(['hat', 'banana', '', 'cat'], 12).exited()).toBe(false)
  })

  it('declares a hint that is not the shell-owned ESC', () => {
    const hints = rhyme.hints((k) => k)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys).not.toMatch(/esc/i)
  })

  it('every family really rhymes with itself, so no lie can ship', () => {
    for (const f of FAMILIES) {
      expect(f.rimes.length, `${f.word} has no rime`).toBeGreaterThan(0)
      expect(f.rhymes.length, `${f.word} has too few rhymes`).toBeGreaterThanOrEqual(4)
      expect(f.rhymes, `${f.word} lists itself`).not.toContain(f.word)
      // A family's own word must end in one of its rimes, or the ending rule
      // is measuring something the prompt does not have.
      expect(f.rimes.some((r) => f.word.endsWith(r)), `${f.word} vs ${f.rimes}`).toBe(true)
      // No two families share a prompt word.
      expect(FAMILIES.filter((g) => g.word === f.word)).toHaveLength(1)
    }
  })

  it('ships no rebuke, and no denial of a rhyme, anywhere in its copy', () => {
    const BAD = [
      'does not rhyme', "doesn't rhyme", 'not a rhyme', 'no rhyme', 'not rhyme',
      'wrong', 'nope', 'incorrect', 'fail', 'error', 'lose', 'lost', 'try again',
    ]
    for (const [key, value] of Object.entries(rhyme.strings!.en!)) {
      for (const bad of BAD) {
        expect(value.toLowerCase(), `${key} says "${bad}"`).not.toContain(bad)
      }
    }
  })

  // THE PACING RULE. Finding a rhyme used to cheer and ask the next question
  // in the same breath, so the good moment was gone before a six-year-old had
  // finished being pleased about it.
  it('holds on a rhyme instead of asking the next question over it', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    const word = asking(h.said)
    const before = h.said.length
    inst.onLine(familyOf(word).rhymes[0]!)
    // Still the same word standing: nothing new was asked.
    expect(asking(h.said)).toBe(word)
    expect(h.said.length).toBeGreaterThan(before)

    // ...and then any line at all brings the next word.
    inst.onLine('more')
    expect(asking(h.said)).not.toBe(word)
  })

  // Every non-winning branch ends by re-stating the standing question, so no
  // line of its own may ask one: the pair used to read "what else sounds like
  // CAT?" and then, right underneath, "what rhymes with CAT?".
  it('asks its question exactly once per turn', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    for (const line of ['banana', '???', asking(h.said), 'zebra', '']) {
      const before = h.said.length
      inst.onLine(line)
      const said = text(h.said.slice(before))
      expect((said.match(/\?/g) ?? []).length, `two questions for "${line}": ${said}`)
        .toBeLessThanOrEqual(1)
    }
  })

  it('never says the same thing twice running about a word it cannot confirm', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    const seen: string[] = []
    for (const w of ['banana', 'banana', 'banana', 'banana']) {
      const before = h.said.length
      inst.onLine(w)
      seen.push(text(h.said.slice(before)))
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]!)
  })

  it('draws its whole conversation in one ink, with `win` only for a rhyme found', () => {
    const h = testCtx({ strings: rhyme.strings })
    const inst = rhyme.create(h.ctx)
    inst.start()
    inst.onLine('banana')
    inst.onLine('???')
    expect(new Set(h.said.map((b) => b.tone))).toEqual(new Set(['plain']))
    inst.onLine(familyOf(asking(h.said)).rhymes[0]!)
    expect(new Set(h.said.map((b) => b.tone))).toEqual(new Set(['plain', 'win']))
  })
})
