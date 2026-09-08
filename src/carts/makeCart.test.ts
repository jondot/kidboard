import { describe, it, expect, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addCart, cartCartridges, resetCarts, setCartSpawn } from './registry'
import { makeLoopbackWorker } from './loopback'
import { readCart } from './codec'
import { decodeGray } from './pixels'
import { CART_H, CART_W } from './shell'
import { testCtx } from '../testing/cartridgeHarness'
import { Canvas } from '../runtime/Canvas'
import { gridFor } from '../runtime/GridCanvas'
import { registry } from '../cartridges'
import type { Cartridge } from '../types'

/**
 * `npm run make-cart` — THE OTHER DIRECTION.
 *
 * The cart format was fully specified and completely one-directional: the app
 * could hand a child a PNG, and there was no way to make one from outside it,
 * so anybody who wanted to write a game had to fork the repo. This is the tool
 * that closes that, and this test holds the TOOL to the same claim the packer
 * is held to: the file it writes really contains a game, and that game plays.
 *
 * It runs the real script in a real node, exactly as somebody at a terminal
 * would, because the thing being tested is the command.
 */

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const builtIns = () => registry() as Cartridge[]

const GAME = `
kb.game(function (ctx) {
  var x = 0
  return {
    onKey: function (k) { if (k.key === 'ArrowRight') x += 4 },
    tick: function (dt) { x += dt * 10 },
    draw: function (c) {
      c.clear()
      c.rect(x % Math.max(1, c.pw), c.ph / 2, 10, 10, 'plain')
    },
    souvenir: function () { return 'nice one' }
  }
})
`

const run = (args: string[], cwd: string): string =>
  execFileSync('node', [join(process.cwd(), 'scripts', 'make-cart.mjs'), ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })

describe('making a cart from outside the app', () => {
  beforeEach(() => {
    resetCarts()
    setCartSpawn(makeLoopbackWorker)
  })

  it('turns a file of plain JavaScript into a cart that plays', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-make-'))
    writeFileSync(join(dir, 'blip.js'), GAME)
    const said = run(
      ['blip.js', '--name', 'blip', '--title', 'Blip', '--hint', 'RIGHT move'],
      dir,
    )
    expect(said).toContain('a child types')
    expect(said).toContain('blip')

    const png = new Uint8Array(readFileSync(join(dir, 'blip.png')))

    // It is one of ours: a picture of a cartridge, at the one size.
    const gray = (await decodeGray(png))!
    expect([gray.w, gray.h]).toEqual([CART_W, CART_H])

    // The manifest says what the flags said…
    const manifest = (await readCart(png))!
    expect(manifest.apiVersion).toBe(1)
    expect(manifest.name.en).toBe('blip')
    expect(manifest.title.en).toBe('Blip')
    expect(manifest.hints.en).toEqual(['RIGHT move'])

    // …and the file really contains the game: it loads and it draws.
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok, 'the loader refused it').toBe(true)
    const cart = cartCartridges()[0]!
    const inst = cart.create(testCtx().ctx)
    await flush()
    for (let i = 0; i < 5; i++) { inst.tick?.(1 / 30); await flush() }
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    expect(c.cmds().length, 'the cart drew nothing').toBeGreaterThan(1)
  }, 30_000)

  /**
   * A FILE THAT LIES ABOUT CONTAINING A GAME IS THE ONE THING THIS MUST NEVER
   * WRITE, because the person who finds out is a six-year-old. The same gate
   * `pack-carts` holds the built-ins to.
   */
  it('refuses to write a cart that does not play', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-make-'))
    writeFileSync(join(dir, 'nope.js'), 'kb.game(function () { return { draw: function () {} } })')
    expect(() => run(['nope.js', '--name', 'nope'], dir)).toThrow(/drew nothing/)
  }, 30_000)

  it('will not make a cart with no name — a child types the name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-make-'))
    writeFileSync(join(dir, 'anon.js'), GAME)
    expect(() => run(['anon.js'], dir)).toThrow(/no name/)
  }, 30_000)
})
