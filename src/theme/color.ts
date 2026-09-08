/**
 * The colour arithmetic the theme engine needs: parse, mix, measure contrast,
 * and — the only opinionated one — nudge a colour until it is actually legible
 * against its background.
 *
 * Everything here is pure and total. A colour we cannot read is `null`, never
 * an exception.
 */

export type Rgb = { r: number; g: number; b: number }

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i

/** `#abc`, `#aabbcc`, `#aabbccdd` (alpha ignored). `null` for anything else. */
export function parseHex(raw: unknown): Rgb | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()

  const short = HEX3.exec(s)
  if (short) {
    return {
      r: parseInt(short[1]! + short[1]!, 16),
      g: parseInt(short[2]! + short[2]!, 16),
      b: parseInt(short[3]! + short[3]!, 16),
    }
  }

  const long = HEX6.exec(s)
  if (long) {
    return {
      r: parseInt(long[1]!, 16),
      g: parseInt(long[2]!, 16),
      b: parseInt(long[3]!, 16),
    }
  }
  return null
}

const clamp255 = (n: number): number =>
  Math.max(0, Math.min(255, Math.round(n)))

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** WCAG relative luminance. */
export function luminance(c: Rgb): number {
  const ch = (v: number): number => {
    const s = clamp255(v) / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

/** WCAG contrast ratio, 1..21. Returns 1 for anything unparseable. */
export function contrast(a: unknown, b: unknown): number {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return 1
  const la = luminance(x)
  const lb = luminance(y)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** Linear blend in sRGB space. `t = 0` is `a`, `t = 1` is `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return a
  const f = Math.max(0, Math.min(1, t))
  return toHex({
    r: x.r + (y.r - x.r) * f,
    g: x.g + (y.g - x.g) * f,
    b: x.b + (y.b - x.b) * f,
  })
}

const WHITE = '#ffffff'
const BLACK = '#000000'

/**
 * The legibility guard.
 *
 * Kidboard accepts any Omarchy theme as data, and plenty of them were written
 * for a code editor where a dim comment colour is a feature. `retro-82`'s own
 * `green` (#028391) sits at 1.6:1 on its own background — as a "you won!"
 * message to a six-year-old that is not a style choice, it is invisible text.
 *
 * So a text colour that does not clear `min` is walked toward white (on a dark
 * ground) or black (on a light one) in small steps until it does. The hue
 * survives; only the lightness moves, and only as far as it has to. A colour
 * that already passes is returned untouched, which is every colour in both
 * shipped themes.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const f = parseHex(fg)
  const b = parseHex(bg)
  if (!f || !b) return fg
  if (contrast(fg, bg) >= min) return fg

  const target = luminance(b) > 0.4 ? BLACK : WHITE
  for (let i = 1; i <= 20; i++) {
    const candidate = mix(toHex(f), target, i / 20)
    if (contrast(candidate, bg) >= min) return candidate
  }
  // Unreachable for any real background — pure white on pure white is 1:1,
  // but so is every other option, and the target is still the best of them.
  return target
}
