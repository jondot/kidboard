import { describe, it, expect } from 'vitest'
import { SYSTEMS, SYSTEM_IDS, DEFAULT_SYSTEM_ID, KIDTARI, KIDCODE, CRT, OMARCHY } from './systems'
import { SYSTEM_STRINGS } from './strings'
import { GALLERY, THEMES, SYSTEM_THEMES } from '../theme/themes'
import type { SystemId } from './types'

describe('the four systems', () => {
  it('are exactly kidtari, kid code, crt, omarchy, in that order', () => {
    expect(SYSTEMS.map((s) => s.id)).toEqual(['kidtari', 'kidcode', 'crt', 'omarchy'])
    expect(SYSTEM_IDS).toEqual(['kidtari', 'kidcode', 'crt', 'omarchy'])
  })

  it('defaults to kidtari', () => {
    expect(DEFAULT_SYSTEM_ID).toBe('kidtari')
  })

  it('gives every system a default theme drawn from its own list', () => {
    for (const s of SYSTEMS) {
      expect(s.themes).toContain(s.defaultTheme)
    }
  })

  it('never lists the same theme twice inside one system', () => {
    for (const s of SYSTEMS) {
      expect(new Set(s.themes).size).toBe(s.themes.length)
    }
  })

  it('keeps theme ids disjoint across systems, so a pair is unambiguous', () => {
    const seen = new Set<string>()
    for (const s of SYSTEMS) {
      for (const id of s.themes) {
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
    }
  })

  it('gives every system a font stack that ends in a generic family', () => {
    for (const s of SYSTEMS) {
      expect(s.font.stack).toMatch(/monospace$/)
      expect(s.font.size).toBeGreaterThan(0)
      expect(s.font.lineHeight).toBeGreaterThan(0)
    }
  })

  it('gives every system a non-empty prompt of its own, in both languages', () => {
    for (const s of SYSTEMS) {
      for (const l of ['en', 'he'] as const) {
        expect(s.prompt[l], `${s.id}.${l}`).toBeTruthy()
        expect(s.prompt[l].trim(), `${s.id}.${l}`).toBe(s.prompt[l])
      }
    }
    // A prompt is part of a machine's identity, so no two share one.
    expect(new Set(SYSTEMS.map((s) => s.prompt.en)).size).toBe(SYSTEMS.length)
  })

  /**
   * `READY` IS A WORD, and the only prompt here that is.
   *
   * A Hebrew-reading six-year-old was being shown a Latin word they cannot
   * read, at the exact spot where they are asked to type. `?`, `>` and `❯` are
   * symbols and repeat unchanged; a machine whose prompt is a word has to say
   * it in the child's language, so this asserts the difference rather than
   * that every prompt is translated.
   */
  it('translates a prompt that is a word, and repeats one that is a symbol', () => {
    expect(KIDTARI.prompt).toEqual({ en: 'READY', he: 'מוכן' })
    for (const s of [KIDCODE, CRT, OMARCHY]) {
      expect(s.prompt.he, s.id).toBe(s.prompt.en)
      expect(s.prompt.en, s.id).not.toMatch(/[A-Za-z]/)
    }
  })

  /**
   * Every machine is drawn inside a window that is ITS OWN, and no two share
   * one: a television, a macOS terminal window, a monitor, a tiling
   * compositor. `chrome/Window.tsx` is a total record over this union, so a
   * value with no frame behind it is a type error rather than a blank frame.
   */
  it('gives every system a window of its own', () => {
    expect(SYSTEMS.map((s) => s.window)).toEqual(['tv', 'mac', 'monitor', 'tiling'])
  })

  it('names every system through an i18n key that has English', () => {
    for (const s of SYSTEMS) {
      expect(s.name).toBe(`system.${s.id}`)
      expect(SYSTEM_STRINGS.en[s.name]).toBeTruthy()
    }
  })

  it('ships no Hebrew of its own — another task owns those files', () => {
    expect(Object.keys(SYSTEM_STRINGS)).toEqual(['en'])
  })

  /**
   * NO MACHINE HAS A BOTTOM STATUS BAR, and this is why `statusBar` is gone
   * from `SystemChrome` rather than merely set to false everywhere.
   *
   * Omarchy had one: a powerline strip along the foot naming the machine, the
   * palette, the language, the sound and the running game's keys. Four of
   * those five are answered by the settings menu whenever a child asks, in a
   * bar a child never reads, permanently occupying the bottom of the screen —
   * and the fifth belongs beside the game, which is where it went.
   */
  it('gives no machine a status bar — the field is not a chrome flag', () => {
    for (const s of SYSTEMS) {
      expect(Object.keys(s.chrome).sort(), s.id)
        .toEqual(['promptBox', 'spinner', 'welcome'])
      expect(s.helpAt, s.id).not.toBe('statusBar')
    }
  })

  // ---- system by system ---------------------------------------------------

  it('kidtari: silkscreen, clearOnExit + fullscreen, help on a label, no chrome', () => {
    expect(KIDTARI.font.stack).toContain('Silkscreen')
    expect(KIDTARI.scrollback).toBe('clearOnExit')
    expect(KIDTARI.gameEntry).toBe('fullscreen')
    expect(KIDTARI.helpAt).toBe('label')
    expect(KIDTARI.chrome).toEqual({
      welcome: false, promptBox: false, spinner: false,
    })
    expect(KIDTARI.prompt.en).toBe('READY')
    expect(KIDTARI.themes).toHaveLength(3)
    expect(KIDTARI.defaultTheme).toBe('kidtari-classic-blue')
  })

  it('kid code: jetbrains mono, keep + inline, help on the call line, box chrome', () => {
    expect(KIDCODE.font.stack).toContain('JetBrains Mono')
    expect(KIDCODE.scrollback).toBe('keep')
    expect(KIDCODE.gameEntry).toBe('inline')
    expect(KIDCODE.helpAt).toBe('callLine')
    expect(KIDCODE.chrome).toEqual({
      welcome: true, promptBox: true, spinner: true,
    })
    expect(KIDCODE.prompt.en).toBe('❯')
    expect(KIDCODE.themes).toEqual(['kidcode-dark', 'kidcode-light'])
    expect(KIDCODE.defaultTheme).toBe('kidcode-dark')
  })

  it('crt: vt323, surface + field, help on the game screen, no chrome', () => {
    expect(CRT.font.stack).toContain('VT323')
    expect(CRT.scrollback).toBe('surface')
    expect(CRT.gameEntry).toBe('field')
    expect(CRT.helpAt).toBe('onScreen')
    expect(CRT.chrome).toEqual({
      welcome: false, promptBox: false, spinner: false,
    })
    expect(CRT.prompt.en).toBe('?')
    // Green first, and green is the default: P1 is the phosphor people
    // picture when they picture a terminal.
    expect(CRT.themes).toEqual(['crt-p1-green', 'crt-p3-amber', 'crt-p4-white'])
    expect(CRT.defaultTheme).toBe('crt-p1-green')
  })

  it('omarchy: fira code, keep + pane, help on the pane title', () => {
    expect(OMARCHY.font.stack).toContain('Fira Code')
    expect(OMARCHY.scrollback).toBe('keep')
    expect(OMARCHY.gameEntry).toBe('pane')
    expect(OMARCHY.helpAt).toBe('paneTitle')
    expect(OMARCHY.chrome).toEqual({
      welcome: false, promptBox: false, spinner: false,
    })
    expect(OMARCHY.prompt.en).toBe('➜')
    expect(OMARCHY.defaultTheme).toBe('hackerman')
  })

  /**
   * `OMARCHY.themes` IS `GALLERY.map(t => t.id)`, so comparing the two sorted
   * is an expression compared with itself and cannot fail. What can fail — and
   * what this list exists to guarantee — is that it stays the whole gallery
   * and nothing else: a 23rd Omarchy theme must appear here with no edit, and
   * a palette belonging to another machine must never leak in.
   */
  it('gives omarchy all 22 gallery themes, and only real ones', () => {
    expect(OMARCHY.themes).toHaveLength(22)
    expect(OMARCHY.themes).toHaveLength(GALLERY.length)
    const offered = new Set(OMARCHY.themes)
    for (const t of GALLERY) expect(offered.has(t.id), `${t.id} is not offered`).toBe(true)
    for (const t of SYSTEM_THEMES) {
      expect(offered.has(t.id), `${t.id} belongs to another machine`).toBe(false)
    }
    for (const id of OMARCHY.themes) {
      expect(THEMES.some((t) => t.id === id)).toBe(true)
    }
  })

  it('covers every SystemId with a definition — no id without a system', () => {
    const ids: SystemId[] = ['kidtari', 'kidcode', 'crt', 'omarchy']
    for (const id of ids) expect(SYSTEMS.some((s) => s.id === id)).toBe(true)
  })
})
