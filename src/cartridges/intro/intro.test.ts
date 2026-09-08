import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { EXAMPLES, TITLE, bigWord, demoWord, introBlocks } from './card'
import { testCtx } from '../../testing/cartridgeHarness'
import { forLocale } from '../index'
import { resolve } from '../../runtime/resolve'
import type { BlockSpec, Locale } from '../../types'

const LOCALES: Locale[] = ['en', 'he']

const said = (locale: Locale): BlockSpec[] => {
  const h = testCtx({ locale, strings: cartridge.strings })
  cartridge.respond(h.ctx)
  return h.said
}

describe('the card a child arrives at', () => {
  it('opens with a marquee', () => {
    expect(TITLE.split('\n')).toHaveLength(5)
    // Block elements only. A marquee is a picture of a word, and a picture in
    // this project is Latin, box-drawing and emoji — never a Hebrew glyph,
    // which an art block would lay out backwards.
    expect(TITLE.replace(/[█ \n]/g, '')).toBe('')
    expect(bigWord('KID').split('\n')).toHaveLength(5)
  })

  it('shrugs at a word it has no letters for, rather than drawing gaps', () => {
    expect(bigWord('QQQ')).toBe('QQQ')
  })

  it('says the same card in both languages', () => {
    for (const locale of LOCALES) {
      const blocks = said(locale)
      expect(blocks[0]!.kind).toBe('art')
      // marquee, the invitation, the three words, the shelf line.
      expect(blocks).toHaveLength(3 + EXAMPLES[locale].length)
      for (const b of blocks) {
        if (b.kind !== 'text') continue
        expect(b.text.trim().length, `${locale}: an empty line`).toBeGreaterThan(0)
        expect(b.text).not.toContain('{')
      }
    }
  })

  /**
   * THE ONE THING THAT WOULD MAKE THIS CARD WORSE THAN NOTHING.
   *
   * It tells a five-year-old to type three specific words. If any of them
   * stops being a trigger — a rename, a game removed, a Hebrew key folded
   * differently — the machine's own first lesson becomes "type this word" /
   * "nothing happened", which teaches the opposite of what it is for. Nothing
   * in the picture would say so, and no other test would fail.
   */
  it('only ever names words that really work, in both languages', () => {
    for (const locale of LOCALES) {
      const carts = forLocale(locale)
      for (const e of EXAMPLES[locale]) {
        const r = resolve(e.word, { locale, cartridges: carts })
        expect(r.kind, `${locale}: "${e.word}" reaches nothing`).toBe('cartridge')
      }
    }
  })

  it('demonstrates a word that answers rather than one that takes the screen', () => {
    for (const locale of LOCALES) {
      const word = demoWord(locale)
      // It is the first word on the card, so what the child watches happen is
      // the line they were just told to try.
      expect(word).toBe(EXAMPLES[locale][0]!.word)
      const r = resolve(word, { locale, cartridges: forLocale(locale) })
      expect(r.kind).toBe('cartridge')
      if (r.kind !== 'cartridge') return
      // A game starting itself with nobody at the keys is a machine that has
      // stopped demonstrating and started waiting.
      expect(r.cartridge.kind, `${locale}: the demo word starts a game`).toBe('echo')
    }
  })

  it('spreads the three words across the kinds of thing this machine does', () => {
    for (const locale of LOCALES) {
      const kinds = EXAMPLES[locale].map((e) => {
        const r = resolve(e.word, { locale, cartridges: forLocale(locale) })
        return r.kind === 'cartridge' ? r.cartridge.id : '?'
      })
      expect(new Set(kinds).size, `${locale}: two of the three do the same thing`)
        .toBe(EXAMPLES[locale].length)
      // …and at least one of them is a real game, because half of what is
      // here is games and a card that never mentions one is half a card.
      const games = EXAMPLES[locale].filter((e) => {
        const r = resolve(e.word, { locale, cartridges: forLocale(locale) })
        return r.kind === 'cartridge' && r.cartridge.kind === 'live'
      })
      expect(games.length, `${locale}: no game on the card`).toBeGreaterThan(0)
    }
  })

  it('reads the same in Hebrew and English, line for line', () => {
    const t = (locale: Locale) => introBlocks(
      (k) => cartridge.strings?.[locale]?.[k] ?? k, locale,
    )
    expect(t('en').map((b) => b.kind)).toEqual(t('he').map((b) => b.kind))
  })

  // A card that told a child to type a word and then swallowed it would be
  // teaching them that words do nothing. An echo says its piece and gets out
  // of the way; a `turn` cartridge would own the prompt.
  it('is an echo, so the very next word the child types is theirs', () => {
    expect(cartridge.kind).toBe('echo')
  })
})
