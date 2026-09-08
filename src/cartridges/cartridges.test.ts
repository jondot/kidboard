import { describe, it, expect } from 'vitest'
import { registry, forLocale } from './index'
import { makeCtx } from '../runtime/ctx'
import { makeRng } from '../runtime/rng'
import { makeAudio } from '../runtime/audio'
import { makeSession } from '../runtime/session'
import { resolve } from '../runtime/resolve'
import { normalize } from '../i18n/locale'
import type { BlockSpec, Cartridge, Locale } from '../types'
import { ANIMALS } from '../content/animals'
import { VEHICLES } from '../content/vehicles'
import { COLORS } from '../content/colors'
import { HE_KEYS as ANIMALS_HE_KEYS } from './animals/cartridge'
import { HE_KEYS as VEHICLES_HE_KEYS } from './vehicles/cartridge'
import { HE_KEYS as COLORS_HE_KEYS } from './colors/cartridge'

const LOCALES: Locale[] = ['en', 'he']

const runEcho = (c: Cartridge, locale: Locale, input = '', seed = 1): BlockSpec[] => {
  const said: BlockSpec[] = []
  if (c.kind !== 'echo') return said
  c.respond(makeCtx({
    locale, rng: makeRng(seed), audio: makeAudio(), strings: c.strings, input,
    say: (s) => said.push(...s), exit: () => {},
  }))
  return said
}

describe('registry invariants', () => {
  it('registers the expected cartridges', () => {
    const ids = registry().map((c) => c.id).sort()
    expect(ids).toContain('animals')
    expect(ids).toContain('colors')
    expect(ids).toContain('help')
  })

  it('every cartridge declares apiVersion 1', () => {
    for (const c of registry()) expect(c.apiVersion).toBe(1)
  })

  it('every cartridge has at least one trigger in each declared locale', () => {
    for (const c of registry()) {
      for (const l of c.locales) {
        const has = (c.triggers[l]?.length ?? 0) > 0 || (c.triggers.emoji?.length ?? 0) > 0
        expect(has, `${c.id} has no ${l} trigger`).toBe(true)
      }
    }
  })

  it('no two cartridges share a trigger word', () => {
    const seen = new Map<string, string>()
    for (const c of registry()) {
      for (const l of LOCALES) {
        for (const w of c.triggers[l] ?? []) {
          const key = `${l}:${w.toLowerCase()}`
          expect(seen.has(key), `"${w}" claimed by ${seen.get(key)} and ${c.id}`)
            .toBe(false)
          seen.set(key, c.id)
        }
      }
    }
  })

  it('a cartridge claiming he actually ships he strings', () => {
    for (const c of registry()) {
      if (!c.locales.includes('he')) continue
      if (!c.strings) continue
      expect(Object.keys(c.strings.he ?? {}).length,
        `${c.id} claims he but ships no he strings`).toBeGreaterThan(0)
    }
  })
})

describe('echo cartridges produce output in every declared locale', () => {
  it('never returns nothing and never returns empty text', () => {
    for (const c of registry()) {
      if (c.kind !== 'echo') continue
      for (const l of c.locales) {
        const out = runEcho(c, l)
        expect(out.length, `${c.id} said nothing in ${l}`).toBeGreaterThan(0)
        for (const b of out) {
          expect((b.kind === 'text' ? b.text : b.art).length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// Each of these cartridges opens `respond` with the matched item's emoji
// repeated 3x as the first block (see animals/vehicles/colors cartridge.ts).
// That first block is locale-independent (unlike the sound/name text further
// down, which is translated), so it is the generic, content-shape-agnostic
// signal used below to prove a trigger resolved to the *specific* item.
const CONTENT_CARTRIDGES: {
  id: string
  content: Record<string, { emoji: string }>
  heKeys: Record<string, string>
  collectives: string[]
}[] = [
  {
    id: 'animals', content: ANIMALS, heKeys: ANIMALS_HE_KEYS,
    collectives: ['animals', 'חיות'],
  },
  {
    id: 'vehicles', content: VEHICLES, heKeys: VEHICLES_HE_KEYS,
    collectives: ['vehicles', 'cars', 'trucks', 'רכבים'],
  },
  {
    id: 'colors', content: COLORS, heKeys: COLORS_HE_KEYS,
    collectives: ['colors', 'colours', 'צבעים'],
  },
]

/**
 * Drives the REAL path a child's keystroke takes: resolve() (which applies
 * normalize(), including sofit folding) and then session.start() (which is
 * what hands the cartridge its ctx.input).
 *
 * The previous version of this file called `respond()` directly with a raw
 * trigger word, bypassing exactly the two transformations that were broken —
 * which is why it passed while אדום rendered pink and 🐱 rendered an
 * elephant in the actual app.
 */
const typeIt = (raw: string, locale: Locale, seed = 1): {
  cartridgeId: string | null
  said: BlockSpec[]
} => {
  const said: BlockSpec[] = []
  const res = resolve(raw, { locale, cartridges: forLocale(locale) })
  if (res.kind !== 'cartridge') return { cartridgeId: null, said }
  const s = makeSession({
    locale, audio: makeAudio(), seed,
    say: (specs) => said.push(...specs),
    mount: () => {}, frame: () => {}, freeze: () => {},
  })
  s.start(res.cartridge, { input: res.corrected ?? normalize(raw) })
  return { cartridgeId: res.cartridge.id, said }
}

const firstEmojiBlock = (out: BlockSpec[]): string | undefined => {
  const b = out[0]
  return b?.kind === 'text' ? b.text : undefined
}

describe('every declared trigger reaches its specific item, end to end', () => {
  for (const { id, content, heKeys, collectives } of CONTENT_CARTRIDGES) {
    const cart = () => registry().find((x) => x.id === id)!

    it(`${id}: every English word trigger shows its own item`, () => {
      const triggers = (cart().triggers.en ?? [])
        .filter((w) => !collectives.includes(w))
      expect(triggers.length).toBeGreaterThan(0)
      for (const w of triggers) {
        const expected = content[w]!.emoji.repeat(3)
        for (const seed of [1, 42, 999]) {
          const { cartridgeId, said } = typeIt(w, 'en', seed)
          expect(cartridgeId, `"${w}" did not resolve to ${id}`).toBe(id)
          expect(firstEmojiBlock(said), `"${w}" (seed ${seed}) showed the wrong item`)
            .toBe(expected)
        }
      }
    })

    it(`${id}: every Hebrew word trigger shows its own item, sofit and all`, () => {
      const triggers = (cart().triggers.he ?? [])
        .filter((w) => !collectives.includes(w))
      expect(triggers.length).toBeGreaterThan(0)
      for (const w of triggers) {
        const enKey = heKeys[w]
        expect(enKey, `${id}: Hebrew trigger "${w}" has no HE_KEYS mapping`).toBeTruthy()
        const expected = content[enKey!]!.emoji.repeat(3)
        for (const seed of [1, 42, 999]) {
          const { cartridgeId, said } = typeIt(w, 'he', seed)
          expect(cartridgeId, `"${w}" did not resolve to ${id}`).toBe(id)
          expect(firstEmojiBlock(said), `"${w}" (seed ${seed}) showed the wrong item`)
            .toBe(expected)
        }
      }
    })

    // The path that matters most: a six-year-old who cannot yet read types an
    // emoji. Two items may legitimately share an emoji (✈️ is both `airplane`
    // and `plane`; 🏗️ is both `excavator` and `crane`), so the assertion is
    // that what comes back is an item wearing THAT emoji — never a random one.
    it(`${id}: every emoji trigger shows an item wearing that emoji`, () => {
      const triggers = cart().triggers.emoji ?? []
      expect(triggers.length).toBeGreaterThan(0)
      for (const e of triggers) {
        for (const locale of LOCALES) {
          for (const seed of [1, 42, 999]) {
            const { cartridgeId, said } = typeIt(e, locale, seed)
            expect(cartridgeId, `"${e}" did not resolve to ${id} under ${locale}`).toBe(id)
            expect(firstEmojiBlock(said), `"${e}" (${locale}, seed ${seed}) showed a different emoji`)
              .toBe(e.repeat(3))
          }
        }
      }
    })
  }
})

// REGRESSION (final review, CRITICAL 1): the session used to build a fresh
// makeRng(deps.seed) inside ctxFor, so every start() re-seeded from the same
// constant and `animals` returned the identical animal forever. The rng's
// lifetime is the session, so this drives five real start()s through ONE
// session rather than calling respond() five times with fresh contexts.
describe('a session keeps one rng across starts', () => {
  const firstText = (specs: BlockSpec[]): string =>
    specs[0]?.kind === 'text' ? specs[0].text : ''

  it('five consecutive starts of animals produce more than one animal', () => {
    const seen = new Set<string>()
    const s = makeSession({
      locale: 'en',
      audio: makeAudio(),
      seed: 1,
      say: (specs) => { seen.add(firstText(specs)) },
      mount: () => {},
      frame: () => {},
      freeze: () => {},
    })
    const animals = registry().find((c) => c.id === 'animals')!
    for (let i = 0; i < 5; i++) s.start(animals, { input: 'animals' })
    expect(seen.size, `five starts produced only ${[...seen].join(', ')}`)
      .toBeGreaterThan(1)
  })

  it('memory deals a different board to a different seed', () => {
    const boards = [1, 2, 3, 4, 5].map((seed) => {
      const said: BlockSpec[] = []
      const s = makeSession({
        locale: 'en', audio: makeAudio(), seed,
        say: (specs) => said.push(...specs),
        mount: () => {}, frame: () => {}, freeze: () => {},
      })
      s.start(registry().find((c) => c.id === 'memory')!)
      s.submit('a1 b2')
      return said.map((b) => (b.kind === 'art' ? b.art : b.text)).join('\n')
    })
    expect(new Set(boards).size).toBeGreaterThan(1)
  })
})

describe('help', () => {
  it('lists only cartridges available in the active locale', () => {
    const heIds = new Set(forLocale('he').map((c) => c.id))
    const help = registry().find((c) => c.id === 'help')!
    const text = runEcho(help, 'he').map((b) =>
      b.kind === 'text' ? b.text : b.art).join('\n')
    for (const c of registry()) {
      if (c.locales.includes('he')) continue
      for (const w of c.triggers.en ?? []) {
        expect(text.includes(w), `help leaked English-only "${w}" into he`)
          .toBe(false)
      }
    }
    expect(heIds.size).toBeGreaterThan(0)
  })
})
