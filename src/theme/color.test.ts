import { describe, it, expect } from 'vitest'
import { contrast, ensureContrast, luminance, mix, parseHex, toHex } from './color'

describe('parseHex', () => {
  it('reads the long form, with or without a #', () => {
    expect(parseHex('#ff7a59')).toEqual({ r: 255, g: 122, b: 89 })
    expect(parseHex('ff7a59')).toEqual({ r: 255, g: 122, b: 89 })
  })

  it('reads the short form', () => {
    expect(parseHex('#f0a')).toEqual({ r: 255, g: 0, b: 170 })
  })

  it('reads an 8-digit form and ignores the alpha', () => {
    expect(parseHex('#ff7a5980')).toEqual({ r: 255, g: 122, b: 89 })
  })

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(parseHex('  #FF7A59 ')).toEqual({ r: 255, g: 122, b: 89 })
  })

  it('returns null for anything it cannot read', () => {
    for (const bad of ['', '#', '#gg0000', 'rgb(1,2,3)', 'red', '#12345',
      null, undefined, 42, {}]) {
      expect(parseHex(bad), String(bad)).toBeNull()
    }
  })
})

describe('toHex', () => {
  it('round-trips and clamps', () => {
    expect(toHex({ r: 255, g: 122, b: 89 })).toBe('#ff7a59')
    expect(toHex({ r: -5, g: 300, b: 0 })).toBe('#00ff00')
  })
})

describe('luminance', () => {
  it('anchors at black and white', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
})

describe('contrast', () => {
  it('gives 21 for black on white and 1 for a colour on itself', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrast('#ff7a59', '#ff7a59')).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrast('#123456', '#fedcba')).toBeCloseTo(contrast('#fedcba', '#123456'), 8)
  })

  it('returns 1 rather than throwing on garbage', () => {
    expect(contrast('nope', '#ffffff')).toBe(1)
    expect(contrast(null, undefined)).toBe(1)
  })
})

describe('mix', () => {
  it('interpolates between the two ends', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('clamps t and falls back to a on garbage', () => {
    expect(mix('#000000', '#ffffff', -3)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 9)).toBe('#ffffff')
    expect(mix('#000000', 'nope', 0.5)).toBe('#000000')
  })
})

describe('ensureContrast', () => {
  it('leaves a colour that already passes exactly as it was', () => {
    expect(ensureContrast('#f0dcbc', '#1b1a2c')).toBe('#f0dcbc')
  })

  // retro-82's own `green`, which would be the `win` tone: 1.6:1 on its own
  // background. "You won!" must not be invisible.
  it('rescues a colour that is illegible on a dark ground', () => {
    const bad = '#028391'
    const bg = '#05182e'
    expect(contrast(bad, bg)).toBeLessThan(4.5)
    const fixed = ensureContrast(bad, bg)
    expect(contrast(fixed, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens rather than lightens on a light ground', () => {
    const fixed = ensureContrast('#ffe08a', '#f8f0dd')
    expect(contrast(fixed, '#f8f0dd')).toBeGreaterThanOrEqual(4.5)
    expect(luminance(parseHex(fixed)!)).toBeLessThan(luminance(parseHex('#ffe08a')!))
  })

  it('honours a custom minimum', () => {
    const fixed = ensureContrast('#028391', '#05182e', 7)
    expect(contrast(fixed, '#05182e')).toBeGreaterThanOrEqual(7)
  })

  it('returns the input unchanged when a colour is unparseable', () => {
    expect(ensureContrast('nope', '#000000')).toBe('nope')
    expect(ensureContrast('#ffffff', 'nope')).toBe('#ffffff')
  })

  it('never throws, and always returns a hex for real inputs', () => {
    for (const fg of ['#000000', '#ffffff', '#808080', '#028391']) {
      for (const bg of ['#000000', '#ffffff', '#05182e', '#f8f0dd']) {
        expect(() => ensureContrast(fg, bg)).not.toThrow()
        expect(ensureContrast(fg, bg)).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
