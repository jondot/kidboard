import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  MIN_BORDER_CONTRAST, MIN_TEXT_CONTRAST, PALETTE_KEYS, TONE_SOURCE, parsePalette, toVars,
} from './palette'
import { contrast, parseHex } from './color'

const MINIMAL = 'background = "#101010"\nforeground = "#f0f0f0"\naccent = "#ff0000"'

describe('parsePalette', () => {
  it('reads a complete Omarchy palette', () => {
    const p = parsePalette(`mode = "dark"
accent = "#faa968"
selection = "#134e5a"
muted = "#2a6b78"
background = "#05182e"
dark_background = "#031222"
darker_background = "#020c17"
lighter_background = "#0a2540"
foreground = "#f6dcac"
dark_foreground = "#3f8f8a"
light_foreground = "#a7c9c6"
bright_foreground = "#f6dcac"
red = "#f85525"
yellow = "#e97b3c"
orange = "#faa968"
green = "#028391"
cyan = "#8cbfb8"
blue = "#3f8f8a"
magenta = "#3f8f8a"
brown = "#743d1e"`)!
    expect(p).not.toBeNull()
    expect(p.mode).toBe('dark')
    expect(p.background).toBe('#05182e')
    expect(p.green).toBe('#028391')
  })

  it('fills in every key it was not given', () => {
    const p = parsePalette(MINIMAL)!
    for (const k of PALETTE_KEYS) {
      expect(parseHex(p[k]), `${k} = ${p[k]}`).not.toBeNull()
    }
  })

  it('honours the legacy short names', () => {
    const p = parsePalette('bg = "#101010"\nfg = "#f0f0f0"\naccent = "#ff0000"')!
    expect(p.background).toBe('#101010')
    expect(p.foreground).toBe('#f0f0f0')
  })

  it('prefers the canonical name when both are present', () => {
    const p = parsePalette(
      'bg = "#010101"\nbackground = "#101010"\nforeground = "#f0f0f0"\naccent = "#ff0000"',
    )!
    expect(p.background).toBe('#101010')
  })

  it('ignores keys it does not know', () => {
    const p = parsePalette(`${MINIMAL}\nwallpaper = "x.png"\nhyprland_active_border = "rgba(1) rgba(2) 45deg"`)!
    expect(p.background).toBe('#101010')
    expect(Object.keys(p).sort()).toEqual(['mode', ...PALETTE_KEYS].sort())
  })

  it('treats a non-hex value as absent and derives instead', () => {
    const p = parsePalette(`${MINIMAL}\ngreen = "rgba(33ccffee) rgba(00ff99ee) 45deg"`)!
    expect(parseHex(p.green)).not.toBeNull()
  })

  it('infers the mode from the background when it is missing or a lie', () => {
    expect(parsePalette(MINIMAL)!.mode).toBe('dark')
    expect(parsePalette('background = "#fdfdfd"\nforeground = "#111111"\naccent = "#c00000"')!.mode)
      .toBe('light')
    expect(parsePalette(`mode = "banana"\n${MINIMAL}`)!.mode).toBe('dark')
  })

  it('honours a declared mode', () => {
    expect(parsePalette(`mode = "light"\n${MINIMAL}`)!.mode).toBe('light')
  })

  it('returns null — never a throw — when a required key is missing', () => {
    expect(parsePalette('foreground = "#fff"\naccent = "#f00"')).toBeNull()
    expect(parsePalette('background = "#000"\naccent = "#f00"')).toBeNull()
    expect(parsePalette('background = "#000"\nforeground = "#fff"')).toBeNull()
    expect(parsePalette('')).toBeNull()
  })

  it('returns null for a required key that is present but not a colour', () => {
    expect(parsePalette('background = "chartreuse"\nforeground = "#fff"\naccent = "#f00"'))
      .toBeNull()
  })

  it('never throws on hostile input', () => {
    for (const src of ['', null, undefined, 42, {}, [], '\0'.repeat(100),
      '='.repeat(1000), 'background = "#"', 'a'.repeat(50000)]) {
      expect(() => parsePalette(src), String(src).slice(0, 16)).not.toThrow()
    }
  })
})

describe('toVars', () => {
  const p = parsePalette(MINIMAL)!

  it('emits every var the stylesheet consumes', () => {
    const v = toVars(p)
    for (const name of [
      'bg', 'surface', 'panel', 'raised', 'border', 'dim', 'accent', 'prompt',
      ...Object.keys(TONE_SOURCE),
    ]) {
      expect(v[`--kb-${name}`], `--kb-${name}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  // Doubles as the guard's no-op case: every colour below already clears
  // AA on this ground, so every var must come through untouched.
  it('maps the tone vocabulary onto the palette, so no cartridge changes', () => {
    const full = parsePalette(`${MINIMAL}
yellow = "#ffee00"
cyan = "#00eeff"
green = "#00ff44"
magenta = "#ff88dd"
orange = "#ff8800"
blue = "#77aaff"`)!
    const v = toVars(full)
    expect(v['--kb-plain']).toBe(full.foreground)
    expect(v['--kb-art']).toBe(full.yellow)
    expect(v['--kb-info']).toBe(full.cyan)
    expect(v['--kb-win']).toBe(full.green)
    expect(v['--kb-magic']).toBe(full.magenta)
    expect(v['--kb-warm']).toBe(full.orange)
    expect(v['--kb-cool']).toBe(full.blue)
  })

  it('makes the prompt the accent', () => {
    const v = toVars(p)
    expect(v['--kb-prompt']).toBe(v['--kb-accent'])
  })

  // The reason the guard exists: retro-82's own green is 1.6:1 on its own
  // background, and "you won!" must not be invisible to a six-year-old.
  it('rescues a text tone that is illegible in the source theme', () => {
    const retro = parsePalette(
      'mode = "dark"\nbackground = "#05182e"\nforeground = "#f6dcac"\naccent = "#faa968"\ngreen = "#028391"',
    )!
    expect(contrast(retro.green, retro.background)).toBeLessThan(MIN_TEXT_CONTRAST)
    expect(contrast(toVars(retro)['--kb-win'], retro.background))
      .toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
  })

  // A theme whose `muted` sits almost on top of its own `background` — a
  // colour picked for a code editor's minimap, not a frame a child has to
  // see — must not ship an invisible border.
  it('rescues a border colour that is nearly invisible on its ground', () => {
    const nearInvisible = parsePalette(`${MINIMAL}\nmuted = "#111111"`)!
    expect(contrast(nearInvisible.muted, nearInvisible.background))
      .toBeLessThan(MIN_BORDER_CONTRAST)
    expect(contrast(toVars(nearInvisible)['--kb-border'], nearInvisible.background))
      .toBeGreaterThanOrEqual(MIN_BORDER_CONTRAST)
  })

  it('leaves an already-visible border untouched', () => {
    // All three grounds pinned to the same dark colour, so there is exactly
    // one contrast check to reason about, and `muted` clears it by a wide
    // margin.
    const stable = parsePalette(
      `${MINIMAL}\nselection = "#101010"\ndark_background = "#101010"\nmuted = "#b5b5b5"`,
    )!
    expect(toVars(stable)['--kb-border']).toBe(stable.muted)
  })

  // Omarchy's own `last-horizon` sets `lighter_background` to exactly
  // `background` — a hover state that looked identical to not hovering.
  it('gives the chrome a real step off the ground even when the theme did not', () => {
    const flat = parsePalette(`${MINIMAL}\nlighter_background = "#101010"`)!
    expect(flat.lighter_background).toBe(flat.background)
    expect(toVars(flat)['--kb-raised']).not.toBe(flat.background)
  })

  it('holds every text tone to AA on all three grounds it is drawn on', () => {
    const v = toVars(p)
    const grounds = [v['--kb-bg']!, v['--kb-panel']!, v['--kb-surface']!]
    for (const name of [...Object.keys(TONE_SOURCE), 'dim', 'accent', 'prompt']) {
      for (const g of grounds) {
        expect(contrast(v[`--kb-${name}`], g), `--kb-${name} on ${g}`)
          .toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      }
    }
  })
})

// The promise this file exists to keep: any Omarchy theme is a Kidboard theme.
// `fixtures/` holds real, unedited Omarchy `colors.toml` files. See its README.
const FIXTURES = join(import.meta.dirname, 'fixtures')

describe('every real Omarchy theme in fixtures/', () => {
  const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.toml'))

  it('is a fixture set worth trusting', () => {
    expect(names.length).toBeGreaterThanOrEqual(10)
    // Both modes, and the two extremes of the ramp.
    expect(names).toContain('retro-82.toml')
    expect(names).toContain('catppuccin-latte.toml')
    expect(names).toContain('vantablack.toml')
    expect(names).toContain('white.toml')
  })

  it('parses into a complete palette', () => {
    for (const name of names) {
      const p = parsePalette(readFileSync(join(FIXTURES, name), 'utf8'))
      expect(p, `${name} did not parse`).not.toBeNull()
      for (const k of PALETTE_KEYS) {
        expect(parseHex(p![k]), `${name}: ${k} = ${p![k]}`).not.toBeNull()
      }
    }
  })

  it('resolves to text a six-year-old can actually read', () => {
    for (const name of names) {
      const p = parsePalette(readFileSync(join(FIXTURES, name), 'utf8'))!
      const v = toVars(p)
      const grounds = [v['--kb-bg']!, v['--kb-panel']!, v['--kb-surface']!]
      for (const tone of [...Object.keys(TONE_SOURCE), 'dim', 'accent']) {
        for (const g of grounds) {
          expect(contrast(v[`--kb-${tone}`], g), `${name}: --kb-${tone} on ${g}`)
            .toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
        }
      }
    }
  })

  it('detects the mode each theme declares', () => {
    const light = [
      'catppuccin-latte.toml', 'flexoki-light.toml', 'rose-pine.toml',
      'white.toml',
    ]
    for (const name of names) {
      const p = parsePalette(readFileSync(join(FIXTURES, name), 'utf8'))!
      expect(p.mode, name).toBe(light.includes(name) ? 'light' : 'dark')
    }
  })
})
