import { describe, it, expect } from 'vitest'
import { CHUNK_TYPE, packCart, readCart, stripCart } from './codec'
import { crc32, findChunk, isPng, readChunks, writeChunks, type Bytes } from './png'
import { readManifest, DEFAULT_SIZE, type CartManifest } from './manifest'
import { checkerPng, grayPng } from './fixtures'
import { decodeGray, encodeBitmap } from './pixels'

const manifest: CartManifest = {
  apiVersion: 1,
  id: 'meow-maze',
  name: { en: 'meowmaze', he: 'מבוךחתול' },
  title: { en: 'Meow Maze', he: 'מבוך חתול' },
  author: 'somebody',
  locales: ['en', 'he'],
  hints: { en: ['arrows move'], he: ['חיצים לזוז'] },
  strings: { en: { hi: 'hi' }, he: { hi: 'היי' } },
  code: 'kb.game(() => ({ draw: (c) => c.text(0, 0, "hi") }))',
  size: { cols: 30, aspect: 1.5 },
}

const bytesEqual = (a: Bytes, b: Bytes): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

describe('the chunk walk', () => {
  it('reads a PNG written by somebody else and writes it back byte for byte', () => {
    const png = checkerPng()
    const chunks = readChunks(png)
    expect(chunks?.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(bytesEqual(writeChunks(chunks!), png)).toBe(true)
  })

  it('computes the CRC the PNG spec does', () => {
    // "IEND" with an empty payload has one universally-quoted CRC.
    expect(crc32(Uint8Array.from([73, 69, 78, 68]))).toBe(0xae426082)
  })

  it('refuses every file that is not exactly a PNG', () => {
    const png = checkerPng()
    expect(readChunks(new Uint8Array(0))).toBeNull()
    expect(readChunks(new TextEncoder().encode('not a png at all'))).toBeNull()
    // A JPEG's magic, then nothing.
    expect(readChunks(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBeNull()
    // Truncated at every length there is.
    for (let n = 1; n < png.length; n++) {
      expect(readChunks(png.slice(0, n)), `truncated to ${n}`).toBeNull()
    }
    // Trailing rubbish after IEND.
    const extra = new Uint8Array(png.length + 3)
    extra.set(png)
    expect(readChunks(extra)).toBeNull()
  })

  it('refuses a PNG whose CRC has been tampered with', () => {
    const png = checkerPng()
    const bad = png.slice()
    bad[bad.length - 5] = (bad[bad.length - 5]! ^ 0xff) & 0xff
    expect(readChunks(bad)).toBeNull()
  })

  it('refuses a chunk whose declared length runs off the end', () => {
    const png = checkerPng()
    const bad = png.slice()
    new DataView(bad.buffer).setUint32(8, 0x0000ffff)
    expect(readChunks(bad)).toBeNull()
  })

  it('recognises a PNG signature and nothing else', () => {
    expect(isPng(checkerPng())).toBe(true)
    expect(isPng(Uint8Array.from([137, 80, 78]))).toBe(false)
  })
})

describe('pack and read', () => {
  it('round-trips a manifest through a real PNG', async () => {
    const cart = await packCart(checkerPng(), manifest)
    expect(cart).not.toBeNull()
    expect(await readCart(cart!)).toEqual(manifest)
  })

  it('leaves the picture byte-identical: stripping the chunk gives the original back', async () => {
    const png = checkerPng()
    const cart = await packCart(png, manifest)
    expect(bytesEqual(stripCart(cart!)!, png)).toBe(true)
  })

  it('is still an ordinary image: the pixels decode the same before and after', async () => {
    const png = checkerPng()
    const cart = await packCart(png, manifest)
    expect(await decodeGray(cart!)).toEqual(await decodeGray(png))
  })

  it('replaces rather than accumulates when a cart is packed twice', async () => {
    const once = await packCart(checkerPng(), manifest)
    const twice = await packCart(once!, { ...manifest, author: 'somebody else' })
    const chunks = readChunks(twice!)!
    expect(chunks.filter((c) => c.type === CHUNK_TYPE)).toHaveLength(1)
    expect((await readCart(twice!))?.author).toBe('somebody else')
  })

  it('puts the chunk before IEND, where a decoder expects an ancillary chunk', async () => {
    const cart = await packCart(checkerPng(), manifest)
    const types = readChunks(cart!)!.map((c) => c.type)
    expect(types.at(-1)).toBe('IEND')
    expect(types.at(-2)).toBe(CHUNK_TYPE)
  })

  it('accepts an ArrayBuffer, which is what a dropped File actually gives', async () => {
    const cart = await packCart(checkerPng(), manifest)
    const buf = cart!.buffer.slice(0) as ArrayBuffer
    expect((await readCart(buf))?.id).toBe('meow-maze')
  })

  it('survives text that is not ASCII in either direction', async () => {
    const hebrew = { ...manifest, title: { en: 'Cat', he: 'חתול 🐱' }, author: 'דני' }
    const cart = await packCart(checkerPng(), hebrew)
    expect((await readCart(cart!))?.title.he).toBe('חתול 🐱')
  })
})

describe('every failure path is a friendly nothing', () => {
  it('returns nothing for a PNG with no cart in it', async () => {
    expect(await readCart(checkerPng())).toBeNull()
  })

  it('returns nothing for a file that is not a PNG', async () => {
    expect(await readCart(new TextEncoder().encode('hello, I am a text file'))).toBeNull()
    expect(await readCart(new Uint8Array(0))).toBeNull()
  })

  it('returns nothing for a truncated cart, at every truncation', async () => {
    const cart = (await packCart(checkerPng(), manifest))!
    for (let n = 1; n < cart.length; n += 7) {
      expect(await readCart(cart.slice(0, n)), `truncated to ${n}`).toBeNull()
    }
  })

  it('returns nothing when the payload is noise rather than gzip', async () => {
    const chunks = readChunks(checkerPng())!
    const noise = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) % 256)
    const bad = writeChunks([
      ...chunks.filter((c) => c.type !== 'IEND'),
      { type: CHUNK_TYPE, data: noise },
      ...chunks.filter((c) => c.type === 'IEND'),
    ])
    expect(await readCart(bad)).toBeNull()
  })

  it('returns nothing when the payload is gzip of something that is not JSON', async () => {
    const cart = (await packCart(checkerPng(), manifest))!
    const chunks = readChunks(cart)!
    const good = findChunk(chunks, CHUNK_TYPE)!
    // Flip a byte deep inside the deflate stream: valid gzip framing, broken body.
    const torn = good.slice()
    torn[Math.floor(torn.length / 2)] = (torn[Math.floor(torn.length / 2)]! ^ 0x5a) & 0xff
    const bad = writeChunks(chunks.map((c) =>
      c.type === CHUNK_TYPE ? { type: CHUNK_TYPE, data: torn } : c))
    expect(await readCart(bad)).toBeNull()
  })

  it('returns nothing for an empty payload', async () => {
    const chunks = readChunks(checkerPng())!
    const bad = writeChunks([
      ...chunks.filter((c) => c.type !== 'IEND'),
      { type: CHUNK_TYPE, data: new Uint8Array(0) },
      ...chunks.filter((c) => c.type === 'IEND'),
    ])
    expect(await readCart(bad)).toBeNull()
  })
})

describe('the manifest is read, never trusted', () => {
  it('rejects an apiVersion this build does not know', () => {
    expect(readManifest({ ...manifest, apiVersion: 2 })).toBeNull()
    expect(readManifest({ ...manifest, apiVersion: '1' })).toBeNull()
    expect(readManifest({ ...manifest, apiVersion: undefined })).toBeNull()
  })

  it('rejects a manifest with nothing to run or nothing to call it', () => {
    expect(readManifest({ ...manifest, code: '' })).toBeNull()
    expect(readManifest({ ...manifest, id: '' })).toBeNull()
    expect(readManifest({ ...manifest, name: {} })).toBeNull()
    expect(readManifest({ ...manifest, locales: [] })).toBeNull()
  })

  it('rejects things that are not objects at all', () => {
    for (const x of [null, undefined, 0, 'cart', [], true]) {
      expect(readManifest(x)).toBeNull()
    }
  })

  it('keeps only the locales the cart actually has a word for', () => {
    const m = readManifest({ ...manifest, name: { en: 'meowmaze' } })
    expect(m?.locales).toEqual(['en'])
  })

  it('drops fields of the wrong type instead of failing', () => {
    const m = readManifest({
      ...manifest, author: 42, hints: 'nope', strings: [1, 2], size: { cols: 'wide' },
    })
    expect(m).not.toBeNull()
    expect(m!.author).toBe('')
    expect(m!.hints).toEqual({})
    expect(m!.size).toEqual(DEFAULT_SIZE)
  })

  it('refuses an absurd size rather than laying out a game a mile wide', () => {
    expect(readManifest({ ...manifest, size: { cols: 1e9, aspect: 1 } })?.size)
      .toEqual(DEFAULT_SIZE)
    expect(readManifest({ ...manifest, size: { cols: 30, aspect: 0 } })?.size)
      .toEqual(DEFAULT_SIZE)
  })
})

describe('the pixel layer', () => {
  it('decodes an RGBA PNG somebody else wrote', async () => {
    const g = await decodeGray(checkerPng())
    expect(g?.w).toBe(8)
    expect(g?.h).toBe(8)
    // Checkerboard: the first pixel is the bright one, its neighbour is not.
    expect(g!.lum[0]! > g!.lum[1]!).toBe(true)
  })

  it('decodes a greyscale PNG somebody else wrote', async () => {
    const g = await decodeGray(grayPng())
    expect(g?.w).toBe(4)
    expect(Array.from(g!.lum.slice(0, 4))).toEqual([0, 255, 255, 0])
  })

  it('round-trips a bitmap through its own encoder', async () => {
    const on = Uint8Array.from([1, 0, 0, 1, 1, 1])
    const png = await encodeBitmap({ w: 3, h: 2, on }, [0, 0, 0], [255, 255, 255])
    const g = await decodeGray(png!)
    expect(g?.w).toBe(3)
    expect(Array.from(g!.lum).map((v) => (v > 127 ? 1 : 0))).toEqual(Array.from(on))
  })

  it('decodes nothing rather than throwing on rubbish', async () => {
    expect(await decodeGray(new TextEncoder().encode('nope'))).toBeNull()
    expect(await decodeGray(new Uint8Array(0))).toBeNull()
  })
})
