/**
 * The pixel half of the PNG story: enough of a decoder to look at a cart's
 * label, and enough of an encoder to make one.
 *
 * Why not a canvas? Because the label has to be readable in a Worker-less,
 * canvas-less test and because `getImageData` un-premultiplies alpha — the
 * same reason the manifest lives in a chunk. `DecompressionStream('deflate')`
 * is zlib, which is exactly what a PNG's IDAT is, so this costs no dependency.
 *
 * Scope, stated honestly: bit depth 8, no interlacing, colour types
 * 0/2/3/4/6. That is every PNG this app writes and very nearly every PNG a
 * child will ever drop. Anything else decodes to `null`, and `null` means the
 * cart gets the plain fallback label — never an error.
 */
import { findChunk, readChunks, writeChunks, type Bytes, type Chunk } from './png'

/** A picture reduced to what a terminal can show: one luminance byte per pixel. */
export type Gray = { w: number; h: number; lum: Uint8Array }

async function inflate(data: Bytes): Promise<Bytes | null> {
  try {
    const ds = new DecompressionStream('deflate')
    const w = ds.writable.getWriter()
    // The writer's own promises reject when the stream errors on a torn
    // payload. They are the same failure `arrayBuffer()` below reports, so
    // swallow them here rather than let a duplicate surface as an unhandled
    // rejection — a corrupt cart must be quiet, not noisy.
    void w.write(data).catch(() => {})
    void w.close().catch(() => {})
    return new Uint8Array(await new Response(ds.readable).arrayBuffer())
  } catch {
    return null
  }
}

async function deflate(data: Bytes): Promise<Bytes | null> {
  try {
    const cs = new CompressionStream('deflate')
    const w = cs.writable.getWriter()
    // The writer's own promises reject when the stream errors on a torn
    // payload. They are the same failure `arrayBuffer()` below reports, so
    // swallow them here rather than let a duplicate surface as an unhandled
    // rejection — a corrupt cart must be quiet, not noisy.
    void w.write(data).catch(() => {})
    void w.close().catch(() => {})
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  } catch {
    return null
  }
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Paeth, straight from the PNG spec. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function unfilter(raw: Bytes, w: number, h: number, bpp: number): Bytes | null {
  const stride = w * bpp
  if (raw.length < h * (stride + 1)) return null
  const out = new Uint8Array(h * stride)

  for (let y = 0; y < h; y++) {
    const type = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const dst = y * stride
    const up = dst - stride

    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!
      const a = x >= bpp ? out[dst + x - bpp]! : 0
      const b = y > 0 ? out[up + x]! : 0
      const c = x >= bpp && y > 0 ? out[up + x - bpp]! : 0
      let r: number
      switch (type) {
        case 0: r = v; break
        case 1: r = v + a; break
        case 2: r = v + b; break
        case 3: r = v + ((a + b) >> 1); break
        case 4: r = v + paeth(a, b, c); break
        default: return null
      }
      out[dst + x] = r & 0xff
    }
  }
  return out
}

/**
 * Decodes a PNG to luminance. Transparent pixels read as 0 (dark), which is
 * what makes a cut-out sprite on a transparent ground render as ink on the
 * terminal's own background rather than as a solid block.
 */
export async function decodeGray(bytes: Bytes): Promise<Gray | null> {
  const chunks = readChunks(bytes)
  if (!chunks) return null

  const ihdr = findChunk(chunks, 'IHDR')
  if (!ihdr || ihdr.length < 13) return null
  const head = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength)
  const w = head.getUint32(0)
  const h = head.getUint32(4)
  const depth = ihdr[8]!
  const colour = ihdr[9]!
  const interlace = ihdr[12]!

  if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return null
  if (depth !== 8 || interlace !== 0) return null
  const ch = CHANNELS[colour]
  if (ch === undefined) return null

  const idat = chunks.filter((c) => c.type === 'IDAT')
  if (idat.length === 0) return null
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0))
  let at = 0
  for (const c of idat) { joined.set(c.data, at); at += c.data.length }

  const raw = await inflate(joined)
  if (!raw) return null
  const flat = unfilter(raw, w, h, ch)
  if (!flat) return null

  const plte = colour === 3 ? findChunk(chunks, 'PLTE') : null
  if (colour === 3 && !plte) return null

  const lum = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const p = i * ch
    let r: number, g: number, b: number, a = 255
    switch (colour) {
      case 0: r = g = b = flat[p]!; break
      case 4: r = g = b = flat[p]!; a = flat[p + 1]!; break
      case 2: r = flat[p]!; g = flat[p + 1]!; b = flat[p + 2]!; break
      case 6: r = flat[p]!; g = flat[p + 1]!; b = flat[p + 2]!; a = flat[p + 3]!; break
      default: {
        const k = flat[p]! * 3
        r = plte![k] ?? 0; g = plte![k + 1] ?? 0; b = plte![k + 2] ?? 0
        break
      }
    }
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    lum[i] = Math.round((y * a) / 255)
  }
  return { w, h, lum }
}

/** Two flat colours, which is all a cart label ever is. RGB, 0-255. */
export type Ink = readonly [number, number, number]

/**
 * Writes a two-colour PNG from a bitmap of on/off bytes. Non-interlaced,
 * 8-bit indexed with a two-entry palette, so a 96x96 label is a few hundred
 * bytes and stays a perfectly ordinary image in any viewer.
 */
export async function encodeBitmap(
  bm: { w: number; h: number; on: Uint8Array },
  ground: Ink,
  ink: Ink,
): Promise<Bytes | null> {
  const { w, h } = bm
  if (w <= 0 || h <= 0 || bm.on.length < w * h) return null

  const ihdr = new Uint8Array(13)
  const head = new DataView(ihdr.buffer)
  head.setUint32(0, w)
  head.setUint32(4, h)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 3   // colour type: indexed
  ihdr[10] = 0  // compression: deflate
  ihdr[11] = 0  // filter: adaptive
  ihdr[12] = 0  // interlace: none

  const plte = Uint8Array.from([...ground, ...ink])

  // Filter type 0 on every scanline. A label is tiny and flat; an adaptive
  // filter would save bytes nobody is counting and cost a reader clarity.
  const rawRows = new Uint8Array(h * (w + 1))
  for (let y = 0; y < h; y++) {
    rawRows[y * (w + 1)] = 0
    for (let x = 0; x < w; x++) {
      rawRows[y * (w + 1) + 1 + x] = bm.on[y * w + x] ? 1 : 0
    }
  }
  const idat = await deflate(rawRows)
  if (!idat) return null

  const chunks: Chunk[] = [
    { type: 'IHDR', data: ihdr },
    { type: 'PLTE', data: plte },
    { type: 'IDAT', data: idat },
    { type: 'IEND', data: new Uint8Array(0) },
  ]
  return writeChunks(chunks)
}
