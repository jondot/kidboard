import { describe, it, expect } from 'vitest'
import { makeCartCartridge, splitHint } from './cartridge'
import { settleNames, takenWords, uniqueWord } from './naming'
import { makeLoopbackWorker } from './loopback'
import { testCtx } from '../testing/cartridgeHarness'
import { Canvas, rasterize, frameToString } from '../runtime/Canvas'
import { gridFor } from '../runtime/GridCanvas'
import { registry } from '../cartridges'
import { makeT } from '../i18n/locale'
import { CART_STRINGS } from './strings'
import type { CartManifest } from './manifest'
import type { Cartridge, LiveCartridge, LiveInstance } from '../types'

const DRAWS = 'kb.game(function (ctx) { var k = ""; return { onKey: function (e) { k = e.key }, tick: function () {}, draw: function (c) { c.text(0, 0, "hi" + k) }, souvenir: function () { return "you played" } } })'

const manifest = (over: Partial<CartManifest> = {}): CartManifest => ({
  apiVersion: 1, id: 'meow', name: { en: 'meowmaze', he: 'מבוךחתול' },
  title: { en: 'Meow Maze', he: 'מבוך חתול' }, author: 'somebody',
  locales: ['en', 'he'], hints: { en: ['ESC done', 'SPACE jump', 'hold an arrow'], he: ['ESC סיום', 'SPACE קפיצה', 'להחזיק חץ'] },
  strings: {}, code: DRAWS, size: { cols: 12, aspect: 3 }, ...over,
})

const make = (m = manifest()): LiveCartridge =>
  makeCartCartridge(m, { names: { en: 'meowmaze', he: 'מבוךחתול' }, spawn: makeLoopbackWorker })

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

const picture = (inst: LiveInstance, cart: LiveCartridge): string => {
  const g = gridFor(cart.size)
  const c = new Canvas(g.w, g.h)
  inst.draw(c)
  return frameToString(rasterize(c.cmds(), g.w, g.h)).trim()
}

describe('a cart is a LiveCartridge like any other', () => {
  it('declares apiVersion 1 and a positive, finite size', () => {
    const c = make()
    expect(c.apiVersion).toBe(1)
    expect(c.kind).toBe('live')
    expect(c.size.cols).toBeGreaterThan(0)
    expect(Number.isFinite(c.size.aspect)).toBe(true)
  })

  it('is reachable by the word the child was told to type, in both languages', () => {
    const c = make()
    expect(c.triggers.en).toEqual(['meowmaze'])
    expect(c.triggers.he).toEqual(['מבוךחתול'])
  })

  it('claims only the locales it actually has a word for', () => {
    const c = makeCartCartridge(manifest(), { names: { en: 'meowmaze' }, spawn: makeLoopbackWorker })
    expect(c.locales).toEqual(['en'])
  })

  it('paints the frame the worker sent, through the ordinary canvas', async () => {
    const cart = make()
    const { ctx } = testCtx()
    const inst = cart.create(ctx)
    await flush()
    expect(picture(inst, cart)).toBe('hi')
    inst.onKey?.({ key: 'a', shift: false, repeat: false })
    await flush()
    expect(picture(inst, cart)).toBe('hia')
  })

  it('gives back the cart\'s own souvenir when the shell ends it', async () => {
    const cart = make()
    const { ctx } = testCtx()
    const inst = cart.create(ctx)
    await flush()
    inst.tick?.(1 / 60)
    await flush()
    expect(inst.souvenir?.()).toBe('you played')
  })

  it('is blank rather than broken before the first frame comes back', () => {
    const cart = make()
    const inst = cart.create(testCtx().ctx)
    expect(picture(inst, cart)).toBe('')
  })
})

describe('a cart that cannot play says something warm', () => {
  it('says the resting line, in the child\'s language, and never the word error', async () => {
    for (const locale of ['en', 'he'] as const) {
      const cart = makeCartCartridge(manifest({ code: 'import("https://example.invalid")' }), {
        names: { en: 'meowmaze', he: 'מבוךחתול' }, spawn: makeLoopbackWorker,
      })
      const { ctx, said } = testCtx({ locale })
      cart.create(ctx)
      await flush()
      const t = makeT(locale, CART_STRINGS)
      const title = locale === 'he' ? 'מבוך חתול' : 'Meow Maze'
      expect(said.map((b) => (b.kind === 'text' ? b.text : ''))).toContain(t('carts.rest', { name: title }))
      for (const b of said) {
        if (b.kind !== 'text') continue
        expect(b.text.toLowerCase()).not.toContain('error')
        expect(b.text).not.toContain('שגיאה')
      }
    }
  })

  it('ends itself rather than sitting there when the code never registers a game', async () => {
    const cart = makeCartCartridge(manifest({ code: 'var x = 1' }), {
      names: { en: 'meowmaze' }, spawn: makeLoopbackWorker,
    })
    const { ctx, exited } = testCtx()
    cart.create(ctx)
    await flush()
    expect(exited()).toBe(true)
  })
})

describe('a cart\'s hints', () => {
  it('never repeats the ESC hint the shell already owns', () => {
    const labels = make().hints(makeT('en')).map((h) => `${h.keys} ${h.label}`)
    expect(labels.join(' ')).not.toContain('ESC')
  })

  it('reads in Hebrew for a Hebrew-reading child', () => {
    const cart = make()
    const he = cart.hints(makeT('he', cart.strings)).map((h) => h.label)
    expect(he).toContain('קפיצה')
  })

  it('tells a key cap from a sentence', () => {
    expect(splitHint('SPACE jump')).toEqual({ keys: 'SPACE', label: 'jump' })
    expect(splitHint('← → move')).toEqual({ keys: '←', label: '→ move' })
    expect(splitHint('hold an arrow')).toEqual({ keys: '', label: 'hold an arrow' })
    expect(splitHint('jump')).toEqual({ keys: '', label: 'jump' })
    expect(splitHint('   ')).toEqual({ keys: '', label: '' })
  })
})

describe('name clashes', () => {
  const taken = new Set(['snake', 'maze', 'maze2'])

  it('leaves a free word alone', () => {
    expect(uniqueWord('meowmaze', taken)).toBe('meowmaze')
  })

  it('appends a digit, and keeps going until a word is free', () => {
    expect(uniqueWord('snake', taken)).toBe('snake2')
    expect(uniqueWord('maze', taken)).toBe('maze3')
  })

  it('folds the word the same way the resolver does, so a clash cannot hide', () => {
    expect(uniqueWord('  SNAKE  ', taken)).toBe('snake2')
  })

  it('lets a built-in win: every shipped trigger counts as taken', () => {
    const words = takenWords(registry() as Cartridge[])
    expect(words.has('draw')).toBe(true)
    expect(uniqueWord('draw', words)).toBe('draw2')
  })

  it('renames per language and says exactly what changed', () => {
    const settled = settleNames(manifest({ name: { en: 'snake', he: 'נחש' } }), taken)
    expect(settled.names.en).toBe('snake2')
    expect(settled.names.he).toBe('נחש')
    expect(settled.renamed).toEqual([{ locale: 'en', from: 'snake', to: 'snake2' }])
  })

  it('never hands two locales of one cart the same word by accident', () => {
    const settled = settleNames(manifest({ name: { en: 'cat', he: 'cat' } }), new Set())
    expect(settled.names.en).not.toBe(settled.names.he)
  })
})
