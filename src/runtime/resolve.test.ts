import { describe, it, expect } from 'vitest'
import { withinOne, resolve } from './resolve'
import { normalize } from '../i18n/locale'
import { smashResponse } from '../content/smash'
import { makeT } from '../i18n/locale'
import { makeRng } from './rng'
import type { Cartridge, Locale } from '../types'

const c = (
  id: string,
  triggers: Cartridge['triggers'],
  locales: Locale[] = ['en', 'he'],
): Cartridge => ({
  kind: 'echo', apiVersion: 1, id, triggers, locales, respond: () => {},
})

const CARTS: Cartridge[] = [
  c('cat', { en: ['cat'], he: ['חתול'], emoji: ['🐱'] }),
  c('ball', { en: ['ball'], he: ['כדור'], emoji: ['⚽'] }),
  c('rhyme', { en: ['rhyme'] }, ['en']),
]

const r = (raw: string, locale: Locale = 'en') =>
  resolve(raw, { locale, cartridges: CARTS })

describe('normalize', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalize('  CaT   the  ')).toBe('cat the')
  })

  it('folds Hebrew final letters so sofit spelling still matches', () => {
    expect(normalize('בן')).toBe(normalize('בנ'))
  })
})

describe('withinOne', () => {
  it('accepts identical strings', () => expect(withinOne('cat', 'cat')).toBe(true))
  it('accepts one substitution', () => expect(withinOne('cot', 'cat')).toBe(true))
  it('accepts one insertion', () => expect(withinOne('catt', 'cat')).toBe(true))
  it('accepts one deletion', () => expect(withinOne('ca', 'cat')).toBe(true))
  it('rejects two edits', () => expect(withinOne('dog', 'cat')).toBe(false))
  it('rejects a length gap of two', () => expect(withinOne('c', 'cat')).toBe(false))
})

describe('resolve', () => {
  it('matches an exact trigger in the active locale', () => {
    expect(r('cat')).toMatchObject({ kind: 'cartridge', cartridge: { id: 'cat' } })
  })

  it('matches a Hebrew trigger under he', () => {
    expect(r('חתול', 'he'))
      .toMatchObject({ cartridge: { id: 'cat' } })
  })

  it('matches an English trigger even under he (cross-locale)', () => {
    expect(r('cat', 'he')).toMatchObject({ cartridge: { id: 'cat' } })
  })

  it('matches an emoji trigger in any locale', () => {
    expect(r('⚽', 'he')).toMatchObject({ cartridge: { id: 'ball' } })
  })

  it('skips cartridges that do not declare the active locale', () => {
    expect(r('rhyme', 'he').kind).not.toBe('cartridge')
  })

  it('forgives a one-letter typo on words of four or more', () => {
    const res = r('balll')
    expect(res).toMatchObject({ kind: 'cartridge', cartridge: { id: 'ball' } })
    expect((res as { corrected?: string }).corrected).toBe('ball')
  })

  it('does not near-match short words, which would hijack smashing', () => {
    expect(r('bat').kind).not.toBe('cartridge')
  })

  it('treats long unspaced nonsense as a smash', () => {
    expect(r('asdkjhasdkjh')).toMatchObject({ kind: 'smash' })
  })

  it('echoes ordinary sentences rather than smashing them', () => {
    expect(r('i like trains')).toMatchObject({ kind: 'echo' })
  })

  it('NEVER returns an error for any input', () => {
    const inputs = [
      '', '   ', 'cat', 'CAT', '?!?!', '123', 'ñ', '🐱🐱',
      'חתול', 'a'.repeat(500), '<script>', 'ball', 'balll',
      'zzzzzzzz', '‏', '.',
    ]
    for (const input of inputs) {
      expect(['cartridge', 'smash', 'echo']).toContain(r(input).kind)
    }
  })
})

describe('smashResponse', () => {
  const en = makeT('en')
  const he = makeT('he')

  it('is deterministic for a seed', () => {
    expect(smashResponse('qwer', makeRng(1), en))
      .toEqual(smashResponse('qwer', makeRng(1), en))
  })

  it('always returns at least one block with non-empty content', () => {
    for (let seed = 0; seed < 60; seed++) {
      const blocks = smashResponse('asdf', makeRng(seed), en)
      expect(blocks.length).toBeGreaterThan(0)
      for (const b of blocks) {
        expect((b.kind === 'text' ? b.text : b.art).length).toBeGreaterThan(0)
      }
    }
  })

  // Keyboard-smashing is the single most likely thing a six-year-old does,
  // and seven of the twelve responses are prose. Before this seam existed a
  // Hebrew-reading child saw "your letters made a creature!", "backwards:",
  // "beep boop!", "secret code:", six English facts and Latin sound words.
  it('never leaks an English response word into Hebrew', () => {
    const english = [
      'letters', 'creature', 'backwards', 'beep', 'boop', 'secret', 'code',
      'Dinosaurs', 'Octopuses', 'Honey', 'moon', 'Elephants', 'Sharks',
      'BOING', 'SPLAT', 'WHOOOMP', 'KABOOM', 'ZING', 'BLOOP', 'SWOOSH',
    ]
    for (let seed = 0; seed < 400; seed++) {
      // The typed text is echoed verbatim by several shapes, so smash a
      // Hebrew-only string: anything Latin in the output is then a leak.
      const blocks = smashResponse('קקקקקקק', makeRng(seed), he)
      const all = blocks.map((b) => (b.kind === 'text' ? b.text : b.art)).join(' ')
      for (const w of english) {
        expect(all, `seed ${seed} leaked "${w}" into Hebrew`).not.toContain(w)
      }
    }
  })

  // Exercising all twelve branches proves the translated ones really do come
  // back different in the two locales, rather than silently falling through
  // makeT's English fallback.
  it('renders the prose shapes differently in each locale', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 400; seed++) {
      const a = smashResponse('qwer', makeRng(seed), en)
      const b = smashResponse('qwer', makeRng(seed), he)
      const flat = (bs: typeof a) =>
        bs.map((x) => (x.kind === 'text' ? x.text : x.art)).join(' ')
      if (flat(a) !== flat(b)) seen.add(flat(b))
    }
    // creature, {n} letters, backwards, beep boop, secret code, facts, sounds
    expect(seen.size).toBeGreaterThan(6)
  })
})
