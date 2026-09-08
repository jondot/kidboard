import { describe, it, expect } from 'vitest'
import { BLANK_LABEL, halfBlockLabel } from './label'
import { decodeGray } from './pixels'
import { checkerPng } from './fixtures'

const gray = (w: number, h: number, f: (x: number, y: number) => number) => ({
  w, h,
  lum: Uint8Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w))),
})

describe('the half-block label', () => {
  it('uses only the four half-block glyphs and nothing else', async () => {
    const rows = halfBlockLabel(await decodeGray(checkerPng()), 12)
    for (const line of rows.join('')) expect(' ▀▄█').toContain(line)
  })

  it('gives two rows of picture per row of text', () => {
    // Top half bright, bottom half dark: one text row, all upper halves.
    const g = gray(8, 8, (_, y) => (y < 4 ? 255 : 0))
    const rows = halfBlockLabel(g, 8)
    expect(rows.join('\n')).toMatch(/▀/)
    expect(rows.join('\n')).not.toMatch(/▄/)
  })

  it('sees a stripe finer than a whole cell, which a plain block could not', () => {
    // One bright row, one dark row, repeating: only half-blocks can show it.
    const g = gray(8, 8, (_, y) => (y % 2 === 0 ? 255 : 0))
    expect(halfBlockLabel(g, 8).join('\n')).toContain('▀')
  })

  it('keeps the picture\'s proportions rather than squashing it', () => {
    const tall = halfBlockLabel(gray(8, 32, (x) => (x < 4 ? 255 : 0)), 8)
    const wide = halfBlockLabel(gray(32, 8, (x) => (x < 16 ? 255 : 0)), 8)
    expect(tall.length).toBeGreaterThan(wide.length)
  })

  it('never exceeds the width it was given', () => {
    for (const rows of [
      halfBlockLabel(gray(64, 64, (x, y) => ((x ^ y) & 8 ? 255 : 0)), 10),
      halfBlockLabel(gray(3, 90, (_, y) => (y % 3 ? 255 : 0)), 10),
    ]) {
      for (const line of rows) expect([...line].length).toBeLessThanOrEqual(10)
    }
  })

  it('shows a blank card rather than nothing when there is no picture to show', () => {
    expect(halfBlockLabel(null)).toBe(BLANK_LABEL)
    expect(halfBlockLabel(gray(8, 8, () => 128))).toBe(BLANK_LABEL)
    expect(halfBlockLabel(gray(0, 0, () => 0))).toBe(BLANK_LABEL)
    expect(halfBlockLabel(gray(8, 8, (x, y) => (x + y) * 0), 1)).toBe(BLANK_LABEL)
  })

  it('is a picture, not an error, for a pathological size', () => {
    expect(halfBlockLabel(gray(1, 1, () => 255), 4)).toBe(BLANK_LABEL)
    expect(halfBlockLabel(gray(2, 1, (x) => (x ? 255 : 0)), 4).length).toBeGreaterThan(0)
  })
})

describe('a thin line survives being shrunk', () => {
  const gray = (w: number, h: number, f: (x: number, y: number) => number) => ({
    w, h,
    lum: Uint8Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w))),
  })

  // THE BUG THIS CATCHES: a cart label is often a thin outline on a dark
  // ground. Averaging each sample box put a one-pixel stroke far below the
  // midpoint, so a real drawing came back as `BLANK_LABEL` — an empty card
  // where a child's own picture should have been. Verified in a browser
  // before this test was written.
  it('shows an outlined box rather than an empty card', () => {
    const g = gray(140, 108, (x, y) => {
      const onEdge = x > 20 && x < 120 && y > 20 && y < 88
        && (x < 26 || x > 114 || y < 26 || y > 82)
      return onEdge ? 255 : 0
    })
    const rows = halfBlockLabel(g, 16)
    expect(rows).not.toBe(BLANK_LABEL)
    expect(rows.join('\n').trim().length).toBeGreaterThan(8)
  })

  it('still calls a nearly-empty picture an empty card', () => {
    const g = gray(140, 108, (x, y) => (x === 70 && y === 54 ? 255 : 0))
    expect(halfBlockLabel(g, 16)).toBe(BLANK_LABEL)
  })
})
