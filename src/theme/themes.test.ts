import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_DARK, DEFAULT_LIGHT, GALLERY, OURS, SYSTEM_THEMES, THEMES,
  themeById, themeFrom,
} from './themes'
import { MIN_TEXT_CONTRAST, TONE_SOURCE, parsePalette, toVars } from './palette'
import { contrast, parseHex } from './color'

const BUILTIN = join(import.meta.dirname, 'builtin')

describe('the shipped themes', () => {
  it('ships exactly one dark and one light of its own, and names them', () => {
    expect(OURS.map((t) => t.id)).toEqual(['sunset-arcade', 'desert-noon'])
    expect(DEFAULT_DARK.palette.mode).toBe('dark')
    expect(DEFAULT_LIGHT.palette.mode).toBe('light')
  })

  it('names both of its own themes in both languages', () => {
    for (const t of OURS) {
      expect(t.name.en.trim(), t.id).not.toBe('')
      expect(t.name.he.trim(), t.id).not.toBe('')
      // A Hebrew name written in Latin letters is not a Hebrew name.
      expect(t.name.he, `${t.id} he name`).toMatch(/[֐-׿]/)
    }
  })

  it('is authored as real Omarchy colors.toml files', () => {
    const files = readdirSync(BUILTIN).filter((f) => f.endsWith('.toml'))
    expect(files.sort()).toEqual(['desert-noon.toml', 'sunset-arcade.toml'])
    for (const f of files) {
      expect(parsePalette(readFileSync(join(BUILTIN, f), 'utf8')), f).not.toBeNull()
    }
  })

  // The legibility guard is a safety net for imported themes, not a crutch
  // for ours: if a shipped theme ever needs rescuing, the theme is wrong.
  it('needs no rescuing — every tone clears AA as authored', () => {
    for (const t of OURS) {
      const v = toVars(t.palette)
      for (const [tone, key] of Object.entries(TONE_SOURCE)) {
        expect(v[`--kb-${tone}`], `${t.id}: --kb-${tone} was moved by the guard`)
          .toBe(t.palette[key])
      }
      expect(v['--kb-accent'], `${t.id}: accent was moved by the guard`)
        .toBe(t.palette.accent)
      expect(v['--kb-dim'], `${t.id}: dim was moved by the guard`)
        .toBe(t.palette.dark_foreground)
    }
  })

  it('keeps every tone legible on all three grounds', () => {
    for (const t of THEMES) {
      const v = toVars(t.palette)
      for (const g of [v['--kb-bg']!, v['--kb-panel']!, v['--kb-surface']!]) {
        for (const name of [...Object.keys(TONE_SOURCE), 'dim', 'accent', 'prompt']) {
          expect(contrast(v[`--kb-${name}`], g), `${t.id}: --kb-${name} on ${g}`)
            .toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
        }
      }
    }
  })

  // A border a child cannot see is a border that is not there. WCAG's
  // non-text floor is 3:1.
  it('draws borders a child can see', () => {
    for (const t of THEMES) {
      const v = toVars(t.palette)
      expect(contrast(v['--kb-border'], v['--kb-bg']), `${t.id} border`)
        .toBeGreaterThanOrEqual(3)
    }
  })

  it('gives the chrome and the panel a visible step off the ground', () => {
    for (const t of THEMES) {
      const v = toVars(t.palette)
      for (const key of ['--kb-surface', '--kb-panel', '--kb-raised']) {
        expect(v[key], `${t.id} ${key}`).not.toBe(v['--kb-bg'])
      }
    }
  })

  // Scoped to OURS, not THEMES: the gallery's own `retro-82` entry is
  // supposed to be retro-82's real hexes, verbatim — that is the whole point
  // of a gallery. This test is only about sunset-arcade being inspired by it
  // rather than a copy of it.
  it('is the retro-82 MOOD and not its hexes', () => {
    const retro = parsePalette(
      readFileSync(join(import.meta.dirname, 'fixtures/retro-82.toml'), 'utf8'),
    )!
    const mine = new Set(
      OURS.flatMap((t) => Object.values(t.palette)).map((s) => s.toLowerCase()),
    )
    for (const [k, v] of Object.entries(retro)) {
      if (k === 'mode') continue
      expect(mine.has(v.toLowerCase()), `retro-82's ${k} (${v}) was copied verbatim`)
        .toBe(false)
    }
  })
})

describe('the Omarchy gallery', () => {
  it('ships all 22 quattro-branch themes, none colliding with our own ids', () => {
    expect(GALLERY.length).toBe(22)
    const oursIds = new Set(OURS.map((t) => t.id))
    for (const t of GALLERY) expect(oursIds.has(t.id), t.id).toBe(false)
    expect(new Set(GALLERY.map((t) => t.id)).size).toBe(22)
  })

  it('parses every gallery theme as a real palette, none falling back', () => {
    for (const t of GALLERY) {
      expect(t.palette, `${t.id} did not parse and fell back`).not.toEqual(
        THEMES.find((o) => o.id === 'sunset-arcade')!.palette,
      )
    }
  })

  it('splits 17 dark and 5 light, read off `mode` for free', () => {
    const dark = GALLERY.filter((t) => t.palette.mode === 'dark')
    const light = GALLERY.filter((t) => t.palette.mode === 'light')
    expect(dark.length).toBe(17)
    expect(light.length).toBe(5)
  })

  it('is included in THEMES, so the store and the panel see it with no changes', () => {
    for (const t of GALLERY) expect(THEMES).toContain(t)
    expect(THEMES.length).toBe(OURS.length + GALLERY.length + SYSTEM_THEMES.length)
  })
})

const SYSTEMS_DIR = join(import.meta.dirname, 'systems')

describe('the machine palettes', () => {
  it('ships one file per palette and parses every one', () => {
    const files = readdirSync(SYSTEMS_DIR).filter((f) => f.endsWith('.toml'))
    expect(files.length).toBe(SYSTEM_THEMES.length)
    for (const f of files) {
      expect(parsePalette(readFileSync(join(SYSTEMS_DIR, f), 'utf8')), f).not.toBeNull()
    }
  })

  it('parses as real palettes, none silently falling back', () => {
    for (const t of SYSTEM_THEMES) {
      expect(t.palette, `${t.id} fell back`).not.toEqual(DEFAULT_DARK.palette)
    }
  })

  it('names every machine palette in both languages', () => {
    for (const t of SYSTEM_THEMES) {
      expect(t.name.en.trim(), t.id).not.toBe('')
      expect(t.name.he, `${t.id} he name`).toMatch(/[֐-׿]/)
    }
  })

  it('is in THEMES, so a persisted id resolves whatever machine minted it', () => {
    for (const t of SYSTEM_THEMES) expect(themeById(t.id)).toBe(t)
  })

  it('collides with no gallery or built-in id', () => {
    const others = new Set([...OURS, ...GALLERY].map((t) => t.id))
    for (const t of SYSTEM_THEMES) expect(others.has(t.id), t.id).toBe(false)
    expect(new Set(SYSTEM_THEMES.map((t) => t.id)).size).toBe(SYSTEM_THEMES.length)
  })

  /**
   * The point of these eight. A machine's chrome may not spend more colour
   * than the games drawn on it are allowed to: one ramp and one accent. So
   * every tone but the accent's own two must sit within a narrow hue band of
   * the foreground — measured as the spread between a colour's channels
   * relative to the foreground's, which is the cheap, honest way to ask "is
   * this the same ink at a different brightness?".
   */
  it('spends one ramp and one accent, never a third hue', () => {
    // Hue in degrees, or null for a grey that has no hue to speak of.
    const hue = (hex: string): number | null => {
      const c = parseHex(hex)!
      const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b)
      if (max - min < 12) return null
      const d = max - min
      const h = max === c.r ? ((c.g - c.b) / d + 6) % 6
        : max === c.g ? (c.b - c.r) / d + 2
          : (c.r - c.g) / d + 4
      return h * 60
    }
    const apart = (a: number, b: number): number => {
      const d = Math.abs(a - b) % 360
      return d > 180 ? 360 - d : d
    }

    for (const t of SYSTEM_THEMES) {
      const ink = hue(t.palette.foreground)
      const accent = hue(t.palette.accent)
      for (const key of Object.keys(TONE_SOURCE)) {
        const src = TONE_SOURCE[key as keyof typeof TONE_SOURCE]
        const h = hue(t.palette[src])
        if (h === null || ink === null) continue
        const near = apart(h, ink) <= 40 || (accent !== null && apart(h, accent) <= 40)
        expect(near, `${t.id}: --kb-${key} (${t.palette[src]}) is a third hue`).toBe(true)
      }
    }
  })
})

describe('themeFrom', () => {
  it('falls back to the default palette rather than throwing on a bad source', () => {
    const t = themeFrom('broken', { en: 'broken', he: 'שבור' }, 'not a theme at all')
    expect(t.id).toBe('broken')
    expect(t.palette.mode).toBe('dark')
    // The whole palette, not just the ground: `LAST_RESORT` is `sunset-arcade`
    // written out by hand, and a hand-written copy of a file is exactly the
    // kind of thing that silently stops matching it.
    expect(t.palette).toEqual(DEFAULT_DARK.palette)
  })

  it('never throws, whatever it is handed', () => {
    for (const src of [null, undefined, 42, {}, [], '', '\0']) {
      expect(() => themeFrom('x', { en: 'x', he: 'x' }, src)).not.toThrow()
    }
  })
})

describe('themeById', () => {
  it('finds a shipped theme and shrugs at anything else', () => {
    expect(themeById('desert-noon')).toBe(DEFAULT_LIGHT)
    expect(themeById('nope')).toBeUndefined()
    expect(themeById(null)).toBeUndefined()
    expect(themeById(undefined)).toBeUndefined()
    expect(themeById('')).toBeUndefined()
  })
})
