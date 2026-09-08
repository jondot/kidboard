import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CART_STRINGS } from './strings'
import { makeT } from '../i18n/locale'

const names = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('the carts catalog is honest in both languages', () => {
  it('defines the same keys in Hebrew as in English', () => {
    expect(Object.keys(CART_STRINGS.he).sort()).toEqual(Object.keys(CART_STRINGS.en).sort())
  })

  it('never ships an empty string, which would render as a blank line', () => {
    for (const [locale, table] of Object.entries(CART_STRINGS)) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.trim().length, `${locale}.${key} is blank`).toBeGreaterThan(0)
      }
    }
  })

  it('uses the same {placeholder} names in both languages', () => {
    for (const key of Object.keys(CART_STRINGS.en)) {
      expect(names(CART_STRINGS.he[key]!), `${key} placeholders differ`)
        .toEqual(names(CART_STRINGS.en[key]!))
    }
  })

  it('actually contains Hebrew, not English wearing a Hebrew key', () => {
    for (const [key, value] of Object.entries(CART_STRINGS.he)) {
      expect(/[֐-׿]/.test(value), `${key} has no Hebrew in it`).toBe(true)
    }
  })

  it('resolves through makeT in both languages', () => {
    const en = makeT('en', CART_STRINGS)
    const he = makeT('he', CART_STRINGS)
    expect(en('carts.play', { word: 'meowmaze' })).toBe('type meowmaze to play!')
    expect(he('carts.play', { word: 'meowmaze' })).toContain('meowmaze')
    // Never a raw key, never a blank.
    for (const key of Object.keys(CART_STRINGS.en)) {
      expect(he(key)).not.toBe(key)
    }
  })

  it('writes every emoji as an emoji, never as a codepoint escape', () => {
    const needle = String.raw`\u` + '{'
    const src = readFileSync(join(process.cwd(), 'src/carts/strings.ts'), 'utf8')
    expect(src.includes(needle)).toBe(false)
  })
})
