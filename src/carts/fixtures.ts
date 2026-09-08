/**
 * Two PNGs written by an INDEPENDENT encoder (Python's zlib), not by
 * `src/carts/pixels.ts`. That is the point: a round-trip test against our own
 * encoder proves only that we are self-consistent, while these prove we can
 * walk and decode a file we did not write.
 *
 * `CHECKER_PNG` is 8x8 RGBA (colour type 6). `GRAY_PNG` is 4x4 greyscale
 * (colour type 0). Both are non-interlaced, bit depth 8.
 */
const B64 = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const CHECKER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVR42mP4v8XmP5ecxn9cNAM+SRDNMCxMAADMg4ehU/z1mAAAAABJRU5ErkJggg=='

export const GRAY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAAAAACMmsGiAAAAEElEQVR42mNg+P+fgQGVAABPxAf5SYUgogAAAABJRU5ErkJggg=='

export const checkerPng = (): Uint8Array<ArrayBuffer> => B64(CHECKER_PNG_B64)
export const grayPng = (): Uint8Array<ArrayBuffer> => B64(GRAY_PNG_B64)
