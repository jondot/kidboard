/**
 * The cart format, both directions.
 *
 *   PNG bytes  ──pack──►  the same PNG plus a `kbRT` chunk
 *   PNG bytes  ──read──►  the manifest inside it, or nothing
 *
 * `kbRT` is ancillary (lower-case first letter) and private (lower-case
 * second), so every other decoder on earth skips it and the file stays an
 * ordinary picture. The payload is `CompressionStream('gzip')` of the
 * manifest JSON — no dependency, and small enough that a cart is a picture
 * with a game in it rather than a game with a picture attached.
 *
 * Nothing here throws. Every failure — a non-PNG, a truncated file, no chunk,
 * a chunk full of noise, a manifest from the future — returns `null`, and the
 * caller turns `null` into a warm line. A child never sees an error.
 */
import { findChunk, readChunks, spliceChunk, writeChunks, type Bytes } from './png'
import { readManifest, type CartManifest } from './manifest'

export const CHUNK_TYPE = 'kbRT'

/** A gzip member always starts with these two bytes. */
const GZIP_MAGIC = [0x1f, 0x8b]

async function gzip(bytes: Bytes): Promise<Bytes | null> {
  try {
    const cs = new CompressionStream('gzip')
    const w = cs.writable.getWriter()
    // The writer's own promises reject when the stream errors on a torn
    // payload. They are the same failure `arrayBuffer()` below reports, so
    // swallow them here rather than let a duplicate surface as an unhandled
    // rejection — a corrupt cart must be quiet, not noisy.
    void w.write(bytes).catch(() => {})
    void w.close().catch(() => {})
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  } catch {
    return null
  }
}

async function gunzip(bytes: Bytes): Promise<Bytes | null> {
  if (bytes.length < 2 || bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) return null
  try {
    const ds = new DecompressionStream('gzip')
    const w = ds.writable.getWriter()
    // The writer's own promises reject when the stream errors on a torn
    // payload. They are the same failure `arrayBuffer()` below reports, so
    // swallow them here rather than let a duplicate surface as an unhandled
    // rejection — a corrupt cart must be quiet, not noisy.
    void w.write(bytes).catch(() => {})
    void w.close().catch(() => {})
    return new Uint8Array(await new Response(ds.readable).arrayBuffer())
  } catch {
    return null
  }
}

/** Adds (or replaces) the manifest chunk. `null` if `png` is not a PNG. */
export async function packCart(
  png: Bytes, manifest: CartManifest,
): Promise<Bytes | null> {
  const chunks = readChunks(png)
  if (!chunks) return null
  const payload = await gzip(new TextEncoder().encode(JSON.stringify(manifest)))
  if (!payload) return null
  return writeChunks(spliceChunk(chunks, CHUNK_TYPE, payload))
}

export async function readCart(
  file: ArrayBuffer | Bytes,
): Promise<CartManifest | null> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file)
  const chunks = readChunks(bytes)
  if (!chunks) return null

  const payload = findChunk(chunks, CHUNK_TYPE)
  if (!payload) return null

  const json = await gunzip(payload)
  if (!json) return null

  try {
    return readManifest(JSON.parse(new TextDecoder().decode(json)))
  } catch {
    return null
  }
}

/** The picture without the game in it, byte for byte as it arrived. */
export function stripCart(png: Bytes): Bytes | null {
  const chunks = readChunks(png)
  if (!chunks) return null
  return writeChunks(chunks.filter((c) => c.type !== CHUNK_TYPE))
}
