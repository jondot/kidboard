/**
 * Emoji are two monospace cells wide — that is the model the Canvas and every
 * grid-drawing cartridge is written against (see docs/CARTRIDGE-API.md).
 *
 * The browser does not honor it. An emoji glyph is ALWAYS served by a fallback
 * font (Apple Color Emoji / Noto Color Emoji / Segoe UI Emoji), never by
 * JetBrains Mono, so its advance is never exactly two mono cells and the error
 * accumulates: measured drift of ~4px per revealed emoji, enough that after
 * four of them a column header no longer sits over its column.
 *
 * The fix is to stop trusting the browser rather than to pad differently. Every
 * emoji grapheme is emitted in its own `.kb-cell2` span of `width: 2ch` — `ch`
 * is the advance of `0` in the surrounding mono font, so `2ch` is exactly two
 * grid cells whatever font ends up supplying the glyph. The model (two reserved
 * cells) stays exactly as it was.
 */

/** True for a grapheme whose glyph is an emoji, i.e. one drawn double-width. */
export function isWide(ch: string): boolean {
  return ch !== '' && /\p{Extended_Pictographic}/u.test(ch)
}

function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return [...s]
  return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
}

export type Token = { text: string; wide: boolean }

/**
 * Splits a string into runs of ordinary text and individual emoji graphemes.
 * Concatenating every token's `text` reproduces the input exactly, so art is
 * never altered — only tokenized for rendering.
 */
export function splitWide(s: string): Token[] {
  const out: Token[] = []
  for (const g of graphemes(s)) {
    if (isWide(g)) {
      out.push({ text: g, wide: true })
      continue
    }
    const last = out[out.length - 1]
    if (last && !last.wide) last.text += g
    else out.push({ text: g, wide: false })
  }
  return out
}
