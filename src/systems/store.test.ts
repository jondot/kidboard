import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  SYSTEM_KEY, THEME_KEY,
  initialSelection, loadSystemId, saveSystemId,
  hasTheme, pickSelection, pickSystem, saveSelection, selectTheme, switchSystem,
  systemById, themeFor, themesOf,
} from './store'
import { KIDTARI, KIDCODE, CRT, OMARCHY, SYSTEMS } from './systems'
import type { System } from './types'

/** Two systems that deliberately SHARE a theme, to exercise carrying. */
const SHARED: readonly System[] = [
  { ...KIDTARI, themes: ['kidtari-classic-blue', 'shared'], defaultTheme: 'kidtari-classic-blue' },
  { ...KIDCODE, themes: ['kidcode-dark', 'shared'], defaultTheme: 'kidcode-dark' },
]

describe('the system store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  describe('persistence', () => {
    it('writes kb.system and kb.theme and nothing else', () => {
      saveSelection({ system: 'crt', theme: 'crt-p1-green' })
      expect(localStorage.getItem(SYSTEM_KEY)).toBe('crt')
      expect(localStorage.getItem(THEME_KEY)).toBe('crt-p1-green')
      expect(Object.keys(localStorage).sort()).toEqual(['kb.system', 'kb.theme'])
    })

    it('names the two keys exactly', () => {
      expect(SYSTEM_KEY).toBe('kb.system')
      expect(THEME_KEY).toBe('kb.theme')
    })

    it('reads null when nothing is stored', () => {
      expect(loadSystemId()).toBeNull()
    })

    it('round-trips a stored system id', () => {
      saveSystemId('omarchy')
      expect(loadSystemId()).toBe('omarchy')
    })

    it('survives storage being unavailable, both ways', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      })
      expect(loadSystemId()).toBeNull()
      expect(() => saveSelection({ system: 'kidtari', theme: 'kidtari-classic-blue' }))
        .not.toThrow()
      expect(initialSelection()).toEqual({ system: 'kidtari', theme: 'kidtari-classic-blue' })
    })
  })

  describe('systemById', () => {
    it('finds each of the four', () => {
      for (const s of SYSTEMS) expect(systemById(s.id)).toBe(s)
    })

    it('returns undefined for anything else', () => {
      const bad = ['', ' ', 'KIDTARI', 'Kidtari', 'nintendo', 'null', 'undefined',
        '0', '[object Object]', '{"system":"kidtari"}', null, undefined]
      for (const b of bad) expect(systemById(b)).toBeUndefined()
    })
  })

  describe('pickSystem', () => {
    it('honours a stored id', () => {
      expect(pickSystem('crt')).toBe(CRT)
    })

    it.each([
      ['nothing stored', null],
      ['an empty string', ''],
      ['whitespace', '   '],
      ['the wrong case', 'Kidtari'],
      ['an unknown id', 'commodore'],
      ['a JSON blob', '{"id":"crt"}'],
      ['the string null', 'null'],
      ['the string undefined', 'undefined'],
    ])('falls back to kidtari for %s', (_why, stored) => {
      expect(pickSystem(stored)).toBe(KIDTARI)
    })

    it('falls back to the first system if kidtari is somehow absent', () => {
      expect(pickSystem('nope', [CRT, OMARCHY])).toBe(CRT)
    })
  })

  describe('themeFor -- a theme is only valid inside its system', () => {
    it('keeps a theme the system owns', () => {
      expect(themeFor(OMARCHY, 'nord')).toBe('nord')
      expect(themeFor(CRT, 'crt-p4-white')).toBe('crt-p4-white')
    })

    it('rejects a theme belonging to another system', () => {
      expect(themeFor(KIDTARI, 'nord')).toBe(KIDTARI.defaultTheme)
      expect(themeFor(KIDCODE, 'crt-p3-amber')).toBe(KIDCODE.defaultTheme)
      expect(themeFor(OMARCHY, 'kidtari-classic-blue')).toBe(OMARCHY.defaultTheme)
      expect(themeFor(CRT, 'kidcode-light')).toBe(CRT.defaultTheme)
    })

    it.each([null, undefined, '', '   ', 'NORD', 'no-such-theme', '{"theme":"nord"}'])(
      'falls back for %p', (bad) => {
        expect(themeFor(OMARCHY, bad)).toBe('hackerman')
      })

    it('rejects every cross-system pair, all sixteen combinations', () => {
      for (const a of SYSTEMS) {
        for (const b of SYSTEMS) {
          const t = b.defaultTheme
          expect(themeFor(a, t)).toBe(a.id === b.id ? t : a.defaultTheme)
        }
      }
    })

    it('accepts every theme of every system against its own system', () => {
      for (const s of SYSTEMS) {
        for (const t of s.themes) expect(themeFor(s, t)).toBe(t)
      }
    })
  })

  describe('pickSelection', () => {
    it('takes a valid pair as it stands', () => {
      expect(pickSelection('omarchy', 'gruvbox')).toEqual({
        system: 'omarchy', theme: 'gruvbox',
      })
    })

    it('repairs a valid system with a foreign theme', () => {
      expect(pickSelection('crt', 'gruvbox')).toEqual({
        system: 'crt', theme: 'crt-p1-green',
      })
    })

    it('repairs an unknown system, keeping nothing of the theme', () => {
      expect(pickSelection('sega', 'gruvbox')).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })

    it('repairs both when both are corrupt', () => {
      expect(pickSelection('{"a":1}', ' ')).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })

    it('repairs a missing pair', () => {
      expect(pickSelection(null, null)).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })

    it('does not honour a theme stored without a system', () => {
      // A theme without a system is not a pair. kidtari decides, and kidtari does
      // not own `nord`, so the child gets kidtari's own default.
      expect(pickSelection(null, 'nord')).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })

    it('always returns a pair that validates itself', () => {
      for (const sys of ['kidtari', 'kidcode', 'crt', 'omarchy', 'x', '', null]) {
        for (const th of ['nord', 'kidcode-dark', '', null, 'zzz']) {
          const got = pickSelection(sys, th)
          const s = systemById(got.system)
          expect(s).toBeDefined()
          expect(s?.themes).toContain(got.theme)
        }
      }
    })
  })

  describe('initialSelection', () => {
    it('reads the two keys', () => {
      localStorage.setItem(SYSTEM_KEY, 'kidcode')
      localStorage.setItem(THEME_KEY, 'kidcode-light')
      expect(initialSelection()).toEqual({ system: 'kidcode', theme: 'kidcode-light' })
    })

    it('repairs a corrupt stored pair without throwing', () => {
      localStorage.setItem(SYSTEM_KEY, 'KIDTARI!!')
      localStorage.setItem(THEME_KEY, '[object Object]')
      expect(initialSelection()).toEqual({ system: 'kidtari', theme: 'kidtari-classic-blue' })
    })

    it('repairs a theme left behind by an older, system-less build', () => {
      localStorage.setItem(THEME_KEY, 'tokyo-night')
      expect(initialSelection()).toEqual({ system: 'kidtari', theme: 'kidtari-classic-blue' })
    })
  })

  /**
   * The Omarchy desktop launcher's whole contract. Its `Exec` line reads
   * `~/.local/state/omarchy/current/theme.name` and hands the result over as
   * `?theme=`, so every case below is a real thing that file can hold.
   */
  describe('the launch flag', () => {
    it('takes the machine and its palette off the URL', () => {
      expect(initialSelection(SYSTEMS, '?system=omarchy&theme=tokyo-night'))
        .toEqual({ system: 'omarchy', theme: 'tokyo-night' })
    })

    it('beats a stored pair, because the flag is the machine we launched from', () => {
      localStorage.setItem(SYSTEM_KEY, 'kidtari')
      localStorage.setItem(THEME_KEY, 'kidtari-warm-plastic')
      expect(initialSelection(SYSTEMS, '?system=omarchy&theme=nord'))
        .toEqual({ system: 'omarchy', theme: 'nord' })
    })

    it('is not consulted when there is no flag', () => {
      localStorage.setItem(SYSTEM_KEY, 'crt')
      localStorage.setItem(THEME_KEY, 'crt-p3-amber')
      expect(initialSelection(SYSTEMS, '')).toEqual({ system: 'crt', theme: 'crt-p3-amber' })
      expect(initialSelection(SYSTEMS, '?lang=he'))
        .toEqual({ system: 'crt', theme: 'crt-p3-amber' })
    })

    /** Every one of Omarchy's 22 themes arrives as itself. No mapping table. */
    it('accepts all 22 Omarchy theme names verbatim', () => {
      for (const id of OMARCHY.themes) {
        expect(initialSelection(SYSTEMS, `?system=omarchy&theme=${id}`))
          .toEqual({ system: 'omarchy', theme: id })
      }
    })

    it('falls back to the machine default when the theme file was empty', () => {
      expect(initialSelection(SYSTEMS, '?system=omarchy&theme='))
        .toEqual({ system: 'omarchy', theme: OMARCHY.defaultTheme })
    })

    it('refuses a palette that belongs to another machine', () => {
      expect(initialSelection(SYSTEMS, '?system=omarchy&theme=kidtari-classic-blue'))
        .toEqual({ system: 'omarchy', theme: OMARCHY.defaultTheme })
    })

    it('cannot be talked into a broken screen', () => {
      for (const search of [
        '?system=omarchy&theme=%%%',
        '?system=&theme=',
        '?system=../../etc/passwd&theme=<script>',
        '?system=omarchy&theme=' + 'x'.repeat(5000),
        '?system=omarchy&system=crt&theme=nord',
      ]) {
        const got = initialSelection(SYSTEMS, search)
        const system = SYSTEMS.find((s) => s.id === got.system)
        expect(system, search).toBeDefined()
        expect(system?.themes, search).toContain(got.theme)
      }
    })
  })

  describe('switchSystem', () => {
    const at = { system: 'kidtari', theme: 'kidtari-warm-plastic' } as const

    it('moves to the new system on its own default', () => {
      expect(switchSystem(at, 'omarchy')).toEqual({ system: 'omarchy', theme: 'hackerman' })
    })

    it('carries the theme when the new system also owns it', () => {
      const cur = { system: 'kidtari' as const, theme: 'shared' }
      expect(switchSystem(cur, 'kidcode', SHARED))
        .toEqual({ system: 'kidcode', theme: 'shared' })
    })

    it('stays put, unchanged, when switching to the system already active', () => {
      expect(switchSystem(at, 'kidtari')).toEqual(at)
    })

    it('ignores an unknown target rather than stranding the child', () => {
      expect(switchSystem(at, 'sega')).toEqual(at)
      expect(switchSystem(at, '')).toEqual(at)
    })

    it('repairs a corrupt current selection on the way out', () => {
      const bad = { system: 'sega', theme: 'nope' } as unknown as typeof at
      expect(switchSystem(bad, 'crt')).toEqual({ system: 'crt', theme: 'crt-p1-green' })
    })

    it('repairs a corrupt current selection even when the target is unknown', () => {
      const bad = { system: 'sega', theme: 'nope' } as unknown as typeof at
      expect(switchSystem(bad, 'zzz')).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })

    it('yields a valid pair for every from/to combination', () => {
      for (const from of SYSTEMS) {
        for (const to of SYSTEMS) {
          for (const theme of [from.defaultTheme, 'nord', '', 'zzz']) {
            const got = switchSystem({ system: from.id, theme }, to.id)
            expect(systemById(got.system)?.themes).toContain(got.theme)
          }
        }
      }
    })
  })

  describe('selectTheme', () => {
    it('takes a theme the current system owns', () => {
      expect(selectTheme({ system: 'omarchy', theme: 'hackerman' }, 'nord'))
        .toEqual({ system: 'omarchy', theme: 'nord' })
    })

    it('refuses a theme from another system and falls back to the default', () => {
      expect(selectTheme({ system: 'omarchy', theme: 'nord' }, 'crt-p1-green'))
        .toEqual({ system: 'omarchy', theme: 'hackerman' })
    })

    it.each(['', '   ', 'NORD', 'nope'])('refuses %p', (bad) => {
      expect(selectTheme({ system: 'kidcode', theme: 'kidcode-light' }, bad))
        .toEqual({ system: 'kidcode', theme: 'kidcode-dark' })
    })

    it('repairs a corrupt current system first', () => {
      const bad = { system: 'sega', theme: 'nord' } as never
      expect(selectTheme(bad, 'nord')).toEqual({
        system: 'kidtari', theme: 'kidtari-classic-blue',
      })
    })
  })

  describe('hasTheme and themesOf', () => {
    it('answers ownership honestly for both directions', () => {
      expect(hasTheme(OMARCHY, 'nord')).toBe(true)
      expect(hasTheme(OMARCHY, 'crt-p1-green')).toBe(false)
      expect(hasTheme(KIDTARI, null)).toBe(false)
      expect(hasTheme(KIDTARI, undefined)).toBe(false)
      expect(hasTheme(KIDTARI, '')).toBe(false)
    })

    it('lists the active system themes, falling back with the system', () => {
      expect(themesOf('crt')).toEqual(CRT.themes)
      expect(themesOf('sega')).toEqual(KIDTARI.themes)
      expect(themesOf(null)).toEqual(KIDTARI.themes)
      expect(themesOf('')).toEqual(KIDTARI.themes)
    })
  })

  it('round-trips every selection it can produce through localStorage', () => {
    for (const s of SYSTEMS) {
      for (const t of s.themes) {
        localStorage.clear()
        saveSelection({ system: s.id, theme: t })
        expect(initialSelection()).toEqual({ system: s.id, theme: t })
      }
    }
  })
})
