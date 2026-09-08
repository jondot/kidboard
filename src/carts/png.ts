/**
 * PNG at the CHUNK level, and nothing above it.
 *
 * A cart is a real PNG carrying one extra ancillary chunk. We deliberately do
 * NOT hide the payload in the low bits of the pixels the way PICO-8 does:
 * canvas decoding un-premultiplies alpha and a browser may apply an ICC
 * conversion on decode, and both quietly rewrite low bits. Walking the chunk
 * list off an `ArrayBuffer` is losslessly exact, needs no canvas, and leaves
 * the file an ordinary image everywhere else.
 *
 * EVERY function here returns `null` rather than throwing. A child drops a
 * file; whatever the file turns out to be, the answer is a friendly nothing.
 */

/**
 * TypeScript 5.7 made `Uint8Array` generic in its backing buffer, and the DOM
 * lib's `BufferSource` accepts only the `ArrayBuffer` flavour. Naming it once
 * keeps every signature in `src/carts` honest instead of casting at each
 * stream boundary.
 */
export type Bytes = Uint8Array<ArrayBuffer>

export const SIGNATURE: Bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

export type Chunk = { type: string; data: Bytes }

/** Largest file we will walk at all. A cart is kilobytes; this is mercy, not policy. */
export const MAX_BYTES = 8 * 1024 * 1024

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Bytes): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export function isPng(bytes: Bytes): boolean {
  if (bytes.length < SIGNATURE.length) return false
  for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]!) return false
  return true
}

const ascii = (bytes: Bytes): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('')

/** A chunk type is four ASCII letters. Anything else means the file is not one. */
const isType = (s: string): boolean => /^[A-Za-z]{4}$/.test(s)

/**
 * Walks the whole chunk list. `null` for a non-PNG, a truncated file, a bad
 * length, a bad CRC, a missing IHDR or a missing IEND — i.e. for every file
 * that is not exactly a PNG, with no attempt at repair.
 */
export function readChunks(bytes: Bytes): Chunk[] | null {
  if (bytes.length > MAX_BYTES) return null
  if (!isPng(bytes)) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Chunk[] = []
  let i = SIGNATURE.length
  let sawEnd = false

  while (i < bytes.length) {
    // length(4) + type(4) + crc(4) is the floor for any chunk at all.
    if (i + 12 > bytes.length) return null
    const len = view.getUint32(i)
    if (len > MAX_BYTES) return null
    const end = i + 12 + len
    if (end > bytes.length) return null

    const type = ascii(bytes.subarray(i + 4, i + 8))
    if (!isType(type)) return null

    const data = bytes.subarray(i + 8, i + 8 + len)
    const want = view.getUint32(i + 8 + len)
    if (crc32(bytes.subarray(i + 4, i + 8 + len)) !== want) return null

    out.push({ type, data })
    if (type === 'IEND') { sawEnd = true; i = end; break }
    i = end
  }

  if (!sawEnd) return null
  if (i !== bytes.length) return null
  if (out[0]?.type !== 'IHDR') return null
  return out
}

export function writeChunks(chunks: readonly Chunk[]): Bytes {
  let size = SIGNATURE.length
  for (const c of chunks) size += 12 + c.data.length

  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  out.set(SIGNATURE, 0)
  let i = SIGNATURE.length

  for (const c of chunks) {
    view.setUint32(i, c.data.length)
    for (let k = 0; k < 4; k++) out[i + 4 + k] = c.type.charCodeAt(k)
    out.set(c.data, i + 8)
    view.setUint32(i + 8 + c.data.length, crc32(out.subarray(i + 4, i + 8 + c.data.length)))
    i += 12 + c.data.length
  }
  return out
}

/**
 * Replaces every chunk of `type` with exactly one carrying `data`, inserted
 * immediately before IEND. Order is otherwise preserved byte for byte, so
 * splicing a chunk out of a file and back in reproduces the original exactly.
 */
export function spliceChunk(
  chunks: readonly Chunk[], type: string, data: Bytes,
): Chunk[] {
  const kept = chunks.filter((c) => c.type !== type && c.type !== 'IEND')
  const end = chunks.filter((c) => c.type === 'IEND')
  return [...kept, { type, data }, ...end]
}

export function findChunk(chunks: readonly Chunk[], type: string): Bytes | null {
  return chunks.find((c) => c.type === type)?.data ?? null
}
