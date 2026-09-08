// src/i18n/locale.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  dirFor, caseFor, makeT, loadLocale, saveLocale, normalizeSofit,
} from './locale'

describe('direction', () => {
  it('maps locales to direction', () => {
    expect(dirFor('en')).toBe('ltr')
    expect(dirFor('he')).toBe('rtl')
  })
})

describe('caseFor', () => {
  it('uppercases in English', () => {
    expect(caseFor('en')('cat')).toBe('CAT')
  })

  it('is identity in Hebrew', () => {
    expect(caseFor('he')('חתול')).toBe('חתול')
  })

  it('leaves Latin alone under Hebrew locale', () => {
    expect(caseFor('he')('cat')).toBe('cat')
  })
})

describe('normalizeSofit', () => {
  it('folds final forms to their base letters', () => {
    expect(normalizeSofit('ךםןףץ')).toBe('כמנפצ')
  })

  it('leaves other text untouched', () => {
    expect(normalizeSofit('cat')).toBe('cat')
  })
})

describe('makeT', () => {
  it('translates a shell key', () => {
    expect(makeT('en')('welcome')).toBe('hello!')
    expect(makeT('he')('welcome')).toBe('שלום!')
  })

  it('interpolates vars', () => {
    expect(makeT('en')('letters.count', { n: 4 })).toBe('4 letters!')
  })

  it('falls back to English when a Hebrew key is missing', () => {
    const t = makeT('he', { he: {}, en: { 'only.en': 'hi' } })
    expect(t('only.en')).toBe('hi')
  })

  it('returns the key itself when nothing matches', () => {
    expect(makeT('en')('nope.not.here')).toBe('nope.not.here')
  })

  it('prefers cartridge strings over shell strings', () => {
    const t = makeT('en', { en: { welcome: 'custom' }, he: {} })
    expect(t('welcome')).toBe('custom')
  })
})

describe('persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a locale', () => {
    saveLocale('he')
    expect(loadLocale()).toBe('he')
  })

  it('defaults to en when unset or invalid', () => {
    expect(loadLocale()).toBe('en')
    localStorage.setItem('kb.locale', 'klingon')
    expect(loadLocale()).toBe('en')
  })
})
