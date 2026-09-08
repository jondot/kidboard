import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_DARK, DEFAULT_LIGHT, GALLERY, OURS, THEMES, themePanelRows } from './themes'

describe('themePanelRows', () => {
  it('lists ours first, unheaded, in their own order', () => {
    const rows = themePanelRows(THEMES, 'en', DEFAULT_DARK.id, () => {})
    expect(rows[0]!.key).toBe('sunset-arcade')
    expect(rows[1]!.key).toBe('desert-noon')
  })

  it('groups the gallery into a dark header and a light header, in that order', () => {
    const rows = themePanelRows(THEMES, 'en', DEFAULT_DARK.id, () => {})
    const darkHeaderAt = rows.findIndex((r) => r.key === 'header-gallery-dark')
    const lightHeaderAt = rows.findIndex((r) => r.key === 'header-gallery-light')
    expect(darkHeaderAt).toBeGreaterThan(1)
    expect(lightHeaderAt).toBeGreaterThan(darkHeaderAt)
    // Every dark gallery theme's row sits between the two headers.
    const dark = GALLERY.filter((t) => t.palette.mode === 'dark')
    for (const t of dark) {
      const at = rows.findIndex((r) => r.key === t.id)
      expect(at, t.id).toBeGreaterThan(darkHeaderAt)
      expect(at, t.id).toBeLessThan(lightHeaderAt)
    }
    // Every light gallery theme's row sits after the light header.
    const light = GALLERY.filter((t) => t.palette.mode === 'light')
    for (const t of light) {
      const at = rows.findIndex((r) => r.key === t.id)
      expect(at, t.id).toBeGreaterThan(lightHeaderAt)
    }
  })

  it('attributes the gallery to Omarchy, once, at the end', () => {
    const rows = themePanelRows(THEMES, 'en', DEFAULT_DARK.id, () => {})
    expect(rows.at(-1)!.key).toBe('header-gallery-credit')
    expect(rows.at(-1)!.label).toMatch(/omarchy/i)
    expect(rows.filter((r) => r.key === 'header-gallery-credit')).toHaveLength(1)
  })

  it('says every header row in Hebrew under he, and every theme name too', () => {
    const rows = themePanelRows(THEMES, 'he', DEFAULT_DARK.id, () => {})
    const headers = rows.filter((r) => !r.run)
    expect(headers.length).toBeGreaterThan(0)
    for (const h of headers) expect(h.label, h.key).toMatch(/[֐-׿]/)
    for (const t of OURS) {
      const row = rows.find((r) => r.key === t.id)!
      expect(row.label).toBe(t.name.he)
    }
  })

  it('marks exactly the active theme as selected', () => {
    const rows = themePanelRows(THEMES, 'en', DEFAULT_LIGHT.id, () => {})
    const selected = rows.filter((r) => r.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0]!.key).toBe('desert-noon')
  })

  it('gives every theme row a swatch and every header row none', () => {
    const rows = themePanelRows(THEMES, 'en', DEFAULT_DARK.id, () => {})
    for (const r of rows) {
      if (r.run) expect(r.swatch, r.key).toBeDefined()
      else expect(r.swatch, r.key).toBeUndefined()
    }
  })

  it('picks the right theme, and only that one, on run', () => {
    const onPick = vi.fn()
    const rows = themePanelRows(THEMES, 'en', DEFAULT_DARK.id, onPick)
    const row = rows.find((r) => r.key === 'nord')!
    row.run!()
    expect(onPick).toHaveBeenCalledExactlyOnceWith(
      THEMES.find((t) => t.id === 'nord'),
    )
  })

  it('never crashes on an empty theme list, and heads nothing', () => {
    expect(() => themePanelRows([], 'en', 'anything', () => {})).not.toThrow()
    expect(themePanelRows([], 'en', 'anything', () => {})).toEqual([])
  })
})
