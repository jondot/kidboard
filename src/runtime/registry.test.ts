import { describe, it, expect, vi } from 'vitest'
import { buildRegistry, forLocaleIn } from './registry'
import type { Cartridge, Locale } from '../types'

const cart = (id: string, locales: Locale[]): Cartridge => ({
  kind: 'echo', apiVersion: 1, id,
  triggers: { en: [id] }, locales,
  respond: () => {},
})

// The TEST suite builds STRICTLY: these checks are the gate on contributions
// and must stay hard failures here, even though the runtime registry
// skip-and-warns so one bad folder cannot blank the child's whole page.
const strict = (mods: Record<string, unknown>) => buildRegistry(mods, { strict: true })

describe('buildRegistry', () => {
  it('collects default exports from glob modules', () => {
    const r = strict({
      './ball/cartridge.ts': { default: cart('ball', ['en']) },
      './piano/cartridge.ts': { default: cart('piano', ['en', 'he']) },
    })
    expect(r.map((c) => c.id).sort()).toEqual(['ball', 'piano'])
  })

  it('skips the _template folder', () => {
    const r = strict({
      './_template/cartridge.ts': { default: cart('template', ['en']) },
      './ball/cartridge.ts': { default: cart('ball', ['en']) },
    })
    expect(r.map((c) => c.id)).toEqual(['ball'])
  })

  it('throws on a duplicate id so collisions surface at build time', () => {
    expect(() =>
      strict({
        './a/cartridge.ts': { default: cart('dup', ['en']) },
        './b/cartridge.ts': { default: cart('dup', ['en']) },
      }),
    ).toThrow(/duplicate/i)
  })

  it('throws when apiVersion is wrong', () => {
    const bad = { ...cart('x', ['en']), apiVersion: 2 as unknown as 1 }
    expect(() => strict({ './x/cartridge.ts': { default: bad } }))
      .toThrow(/apiVersion/i)
  })

  it('throws when a cartridge declares no locales', () => {
    expect(() =>
      strict({ './x/cartridge.ts': { default: cart('x', []) } }),
    ).toThrow(/locales/i)
  })

  it('throws when a module has no default export', () => {
    expect(() => strict({ './x/cartridge.ts': {} }))
      .toThrow(/default export/i)
  })
})

// At runtime a bad folder must cost its own cartridge, not the whole page:
// buildRegistry runs at module evaluation, so a throw there means the child
// sees a blank screen instead of a terminal.
describe('buildRegistry, non-strict (the runtime path)', () => {
  it('skips a bad module and keeps every good one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = buildRegistry({
      './ball/cartridge.ts': { default: cart('ball', ['en']) },
      './broken/cartridge.ts': {},
      './bad-version/cartridge.ts': {
        default: { ...cart('bv', ['en']), apiVersion: 2 as unknown as 1 },
      },
      './no-locale/cartridge.ts': { default: cart('nl', []) },
      './dup/cartridge.ts': { default: cart('ball', ['en']) },
      './piano/cartridge.ts': { default: cart('piano', ['en']) },
    })
    expect(r.map((c) => c.id).sort()).toEqual(['ball', 'piano'])
    expect(warn).toHaveBeenCalledTimes(4)
    warn.mockRestore()
  })
})

describe('forLocaleIn', () => {
  it('returns only cartridges declaring that locale', () => {
    const all = [cart('ball', ['en', 'he']), cart('rhyme', ['en'])]
    expect(forLocaleIn(all, 'he').map((c) => c.id)).toEqual(['ball'])
    expect(forLocaleIn(all, 'en').map((c) => c.id)).toEqual(['ball', 'rhyme'])
  })
})
