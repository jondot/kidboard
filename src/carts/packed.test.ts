import { describe, it, expect, beforeEach } from 'vitest'
import { PACKED, SOURCES, UNPACKABLE } from './packed'
import { hashSources } from './freshness'
import { packedArt } from './packedArt'
import { BUILT_IN_PREFIX, readManifest } from './manifest'
import { looksImportable } from './workerSource'
import { buildCartPng, cartFilename, savables } from './export'
import { readCart } from './codec'
import {
  addCart, cartCartridges, cartList, resetCarts, setCartSpawn, welcomeBack,
} from './registry'
import { makeLoopbackWorker } from './loopback'
import { makeCartCartridge } from './cartridge'
import { registry } from '../cartridges'
import { testCtx } from '../testing/cartridgeHarness'
import { Canvas } from '../runtime/Canvas'
import { gridFor } from '../runtime/GridCanvas'
import type { Cartridge, Locale } from '../types'

/**
 * The built-ins, as carts.
 *
 * The claim being tested is a strong one and worth stating plainly: a file
 * this app offers a child for download must really contain the game, and must
 * really play when it is dropped back in. Every test below is against the
 * generated `packed.ts` — the artifact that actually ships — rather than
 * against the packer, so a bad regeneration fails here rather than in a
 * child's hands.
 */

const builtIns = () => registry() as Cartridge[]
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

const liveIds = () => builtIns().filter((c) => c.kind === 'live').map((c) => c.id).sort()
const packedIds = () => PACKED.map((m) => m.id.replace(/^kidboard-/, '')).sort()

beforeEach(() => {
  resetCarts()
  setCartSpawn(makeLoopbackWorker)
})

describe('the built-ins, packed as carts', () => {
  it('accounts for every built-in: either it is a cart, or there is a reason', () => {
    const explained = new Set([...packedIds(), ...UNPACKABLE.map((u) => u.id)])
    for (const c of builtIns()) {
      expect(explained.has(c.id), `${c.id} is neither packed nor explained`).toBe(true)
    }
  })

  it('packs every game and no conversation', () => {
    expect(packedIds()).toEqual(liveIds())
    for (const u of UNPACKABLE) {
      expect(builtIns().find((c) => c.id === u.id)?.kind).not.toBe('live')
      // A reason, not a shrug.
      expect(u.why.length).toBeGreaterThan(20)
    }
  })

  // The one thing that makes a downloaded built-in recognisable as itself
  // when it is dropped back in. `sameBuiltIn` reads this prefix off the id;
  // the packer writes it. If they ever drift, a child's own `pop` comes home
  // as `pop2` again.
  it('namespaces every id, so a built-in can be recognised coming home', () => {
    for (const m of PACKED) {
      expect(m.id.startsWith(BUILT_IN_PREFIX), m.id).toBe(true)
      const id = m.id.slice(BUILT_IN_PREFIX.length)
      expect(builtIns().some((c) => c.id === id), m.id).toBe(true)
    }
  })

  it('carries real code, not a label and a promise', () => {
    for (const m of PACKED) {
      expect(m.code.length, m.id).toBeGreaterThan(500)
      // The one static gate the sandbox applies. A bundle that tripped it
      // would be refused at the door and the child would see a warm line
      // instead of a game.
      expect(looksImportable(m.code), m.id).toBe(false)
      // Emoji as emoji, Hebrew as Hebrew — the same rule the string catalogs
      // are held to, applied to what the packer wrote.
      expect(m.code, m.id).not.toMatch(/\\u\{/)
    }
  })

  it('is a manifest the loader would accept from a stranger', () => {
    for (const m of PACKED) {
      const back = readManifest(JSON.parse(JSON.stringify(m)))
      expect(back, m.id).not.toBeNull()
      expect(back!.id).toBe(m.id)
      expect(back!.code).toBe(m.code)
      expect(back!.locales.length).toBeGreaterThan(0)
    }
  })

  it('keeps the word the child already knows, in every language the game speaks', () => {
    for (const m of PACKED) {
      const built = builtIns().find((c) => `kidboard-${c.id}` === m.id)!
      for (const l of m.locales) {
        expect(m.name[l], `${m.id} ${l}`).toBe(built.triggers[l]?.[0])
      }
    }
  })

  it('has a picture of its own on the front', () => {
    for (const m of PACKED) {
      expect(packedArt(m.id), `${m.id} has no label drawing`).toBeDefined()
    }
  })

  it('is offered for download, in each language the game is playable in', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const keys = savables(locale).map((s) => s.key)
      for (const m of PACKED) {
        const offered = m.locales.includes(locale)
        expect(keys.includes(`packed:${m.id}`), `${m.id} in ${locale}`).toBe(offered)
      }
    }
  })

  it('gives every offered file a name a child can find again', () => {
    for (const m of PACKED) {
      expect(cartFilename(m, m.locales[0]!)).toMatch(/^[^.]+\.png$/)
    }
  })
})

/**
 * The whole loop, once per game: build the file the panel would hand over,
 * read it back the way a dropped file is read, and play what came back. This
 * is the test that would catch a cart that is offered but does not work.
 *
 * Dropping one of these back into a session that has the built-in is
 * WELCOMED HOME rather than loaded (see "a built-in that comes home" above),
 * so the cartridge is built here from the manifest that survived the PNG —
 * `makeCartCartridge` is the identical call the registry makes, with the
 * identical arguments, so what plays here is what would play for the child.
 */
describe('a packed built-in survives the round trip and plays', () => {
  for (const m of PACKED) {
    it(`${m.id} saves, loads and draws`, async () => {
      const png = await buildCartPng(m, packedArt(m.id)!)
      expect(png, 'no PNG').not.toBeNull()

      // Read back exactly as a dropped file is read.
      const back = await readCart(png!)
      expect(back).toEqual(m)

      // Dropped in, it is the game the child already has — no duplicate.
      const res = await addCart(png!, { builtIns: builtIns() })
      expect(res.ok, 'the loader refused it').toBe(true)
      expect(res.ok && res.kind).toBe('builtIn')
      expect(cartList(), 'a built-in was duplicated as a cart').toEqual([])

      const cart = makeCartCartridge(back!, {
        names: back!.name, spawn: makeLoopbackWorker,
      })
      const inst = cart.create(testCtx({ locale: m.locales[0] }).ctx)
      await flush()
      // A few frames, exactly as the frame loop would.
      for (let i = 0; i < 5; i++) { inst.tick?.(1 / 30); await flush() }

      const g = gridFor(cart.size)
      const c = new Canvas(g.w, g.h)
      inst.draw(c)
      expect(c.cmds().length, 'the cart drew nothing').toBeGreaterThan(1)

      // And it puts itself away without a fuss.
      expect(() => inst.souvenir?.()).not.toThrow()
    })
  }
})

/**
 * A BUILT-IN THAT COMES HOME.
 *
 * Download `pop`, drop it back in, and the naming machinery did what it was
 * built to do: `pop` was taken, so the file became `pop2`. Correct, and the
 * one place the whole feature read as machinery — a child who saved their
 * game and brought it back should never be told it is now called something
 * else.
 *
 * WHAT COUNTS AS THE SAME CART: the manifest's own id. Ours are namespaced
 * `kidboard-<cartridge id>`, so a file claiming that id is claiming to BE
 * that game. It is the same rule the registry already applies to a cart the
 * child has dropped twice (`again`), applied to a built-in — one rule, not
 * two. Deliberately NOT id-plus-a-content-hash: a cart saved from an older
 * version of the app hashes differently and would be renamed `pop2`, which is
 * precisely the unkindness being removed. A stranger's cart that merely
 * collides on the WORD carries its own id and is still renamed and told so.
 */
describe('a built-in that comes home', () => {
  const popped = async () => {
    const m = PACKED.find((p) => p.id === 'kidboard-pop')!
    return { m, png: (await buildCartPng(m, packedArt(m.id)!))! }
  }

  it('is welcomed back by the name it already has, and never renamed', async () => {
    const { png } = await popped()
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    expect(res.ok && res.kind).toBe('builtIn')
    expect(res.ok && res.kind === 'builtIn' && res.names.en).toBe('pop')
  })

  it('makes no duplicate: the cart the child already has is the one they play', async () => {
    const { png } = await popped()
    await addCart(png, { builtIns: builtIns() })
    expect(cartList()).toEqual([])
    expect(cartCartridges()).toEqual([])
  })

  it('says something warm, in both languages, and never the word error', async () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const lines = welcomeBack({ en: 'pop', he: 'פופ' }, locale)
      expect(lines.length).toBeGreaterThan(0)
      const all = lines.map((l) => (l.kind === 'text' ? l.text : '')).join(' ')
      expect(all.toLowerCase()).not.toContain('error')
      expect(all).toContain(locale === 'en' ? 'pop' : 'פופ')
    }
  })

  it('still renames a genuinely different cart that only collides on the word', async () => {
    const mine = { ...PACKED.find((p) => p.id === 'kidboard-pop')!, id: 'someone-elses-pop' }
    const png = (await buildCartPng(mine, packedArt('kidboard-pop')!))!
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok && res.kind).toBe('loaded')
    expect(res.ok && res.kind === 'loaded' && res.cart.names.en).toBe('pop2')
    expect(res.ok && res.kind === 'loaded' && res.renamed).toEqual(
      [{ locale: 'en', from: 'pop', to: 'pop2' }],
    )
  })
})

/**
 * FRESHNESS.
 *
 * `packed.ts` is a build artifact that is committed, so the app and the tests
 * work without anybody running the packer. The cost is that changing a
 * cartridge and not re-running it leaves a downloadable cart that quietly
 * stops being the game it claims to be — and nothing caught that.
 *
 * Re-bundling seventeen cartridges to find out would be far too slow to run
 * on every test. So the packer records, per cart, the exact set of source
 * files esbuild actually pulled into that bundle and one hash over their
 * contents. This reads the same files and hashes them the same way: a few
 * hundred small reads, a few milliseconds, and it fails with the cartridge's
 * name and the command that fixes it.
 */
describe('the packed artifact is not stale', () => {
  it('names the sources each cart was built from', () => {
    for (const m of PACKED) {
      const src = SOURCES[m.id]
      expect(src, `${m.id} has no recorded sources`).toBeDefined()
      // Its own folder is in there, at the very least.
      const id = m.id.replace(/^kidboard-/, '')
      expect(
        src!.files.some((f) => f.startsWith(`src/cartridges/${id}/`)),
        `${m.id} does not list its own cartridge source`,
      ).toBe(true)
    }
  })

  for (const m of PACKED) {
    it(`${m.id} was packed from the sources that are here now`, () => {
      const src = SOURCES[m.id]
      expect(src, `${m.id} has no recorded sources`).toBeDefined()
      expect(
        hashSources(src!.files),
        `${m.id} has changed since it was packed. Run: npm run pack-carts`,
      ).toBe(src!.hash)
    })
  }
})
