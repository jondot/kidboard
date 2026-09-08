import { ensureContrast, mix, parseHex } from './color'
import { parseToml } from './toml'

/**
 * Omarchy's `colors.toml` schema, verbatim. These are the key names a theme
 * author already knows; Kidboard adds none of its own, so any of Omarchy's
 * 22 themes — or anything written for Omarchy — is a Kidboard theme as data.
 */
export const PALETTE_KEYS = [
  'accent', 'selection', 'muted',
  'background', 'dark_background', 'darker_background', 'lighter_background',
  'foreground', 'dark_foreground', 'light_foreground', 'bright_foreground',
  'red', 'yellow', 'orange', 'green', 'cyan', 'blue', 'magenta', 'brown',
  'bright_red', 'bright_yellow', 'bright_orange', 'bright_green',
  'bright_cyan', 'bright_blue', 'bright_magenta', 'bright_brown',
] as const

export type PaletteKey = (typeof PALETTE_KEYS)[number]
export type Mode = 'dark' | 'light'
export type Palette = { mode: Mode } & Record<PaletteKey, string>

/**
 * The legacy short names Omarchy still accepts. Canonical wins where both are
 * present, exactly as `docs/theming.md` specifies.
 */
const LEGACY: Partial<Record<PaletteKey, string>> = {
  background: 'bg',
  dark_background: 'dark_bg',
  darker_background: 'darker_bg',
  lighter_background: 'lighter_bg',
  foreground: 'fg',
  dark_foreground: 'dark_fg',
  light_foreground: 'light_fg',
  bright_foreground: 'bright_fg',
}

/** The three keys without which there is no theme, only a suggestion. */
const REQUIRED = ['background', 'foreground', 'accent'] as const

/**
 * Reads a hex out of the raw table, honouring the legacy alias. Anything that
 * is not a hex colour — a gradient, a name, a typo — is treated as absent, so
 * it is derived below instead of being handed to CSS as nonsense.
 */
function hexOf(raw: Record<string, string>, key: PaletteKey): string | null {
  const direct = parseHex(raw[key])
  if (direct) return raw[key]!.trim().toLowerCase()
  const legacy = LEGACY[key]
  if (legacy && parseHex(raw[legacy])) return raw[legacy]!.trim().toLowerCase()
  return null
}

/**
 * Turns a partial palette into a complete one.
 *
 * Every derived value is a blend along the theme's own background→foreground
 * ramp, so a theme that ships nothing but `background`, `foreground` and
 * `accent` still gets a coherent set of neutrals rather than a set of greys
 * borrowed from some other theme's mood.
 */
function derive(raw: Record<string, string>, mode: Mode): Palette {
  const bg = hexOf(raw, 'background')!
  const fg = hexOf(raw, 'foreground')!
  const accent = hexOf(raw, 'accent')!
  // On a dark ground "further from the foreground" is darker; on a light one
  // it is lighter. One sign flip covers both directions of the ramp.
  const away = mode === 'dark' ? '#000000' : '#ffffff'

  const pick = (key: PaletteKey, fallback: string): string =>
    hexOf(raw, key) ?? fallback

  const dark_background = pick('dark_background', mix(bg, away, 0.35))
  const lighter_background = pick('lighter_background', mix(bg, fg, 0.12))
  const dark_foreground = pick('dark_foreground', mix(bg, fg, 0.55))

  const red = pick('red', accent)
  const yellow = pick('yellow', accent)
  const orange = pick('orange', yellow)
  const green = pick('green', fg)
  const cyan = pick('cyan', accent)
  const blue = pick('blue', accent)
  const magenta = pick('magenta', accent)
  const brown = pick('brown', mix(orange, away, 0.5))

  return {
    mode,
    accent,
    selection: pick('selection', lighter_background),
    muted: pick('muted', mix(bg, fg, 0.35)),

    background: bg,
    dark_background,
    darker_background: pick('darker_background', mix(dark_background, away, 0.4)),
    lighter_background,

    foreground: fg,
    dark_foreground,
    light_foreground: pick('light_foreground', mix(fg, bg, 0.2)),
    bright_foreground: pick('bright_foreground', fg),

    red, yellow, orange, green, cyan, blue, magenta, brown,

    bright_red: pick('bright_red', red),
    bright_yellow: pick('bright_yellow', yellow),
    bright_orange: pick('bright_orange', orange),
    bright_green: pick('bright_green', green),
    bright_cyan: pick('bright_cyan', cyan),
    bright_blue: pick('bright_blue', blue),
    bright_magenta: pick('bright_magenta', magenta),
    bright_brown: pick('bright_brown', brown),
  }
}

/**
 * Parses an Omarchy `colors.toml` into a complete palette, or returns `null`
 * if it is not a palette at all.
 *
 * `null` — never a throw — is the whole contract: the caller falls back to a
 * shipped theme and the child never learns that a file was broken.
 */
export function parsePalette(src: unknown): Palette | null {
  const raw = parseToml(src)
  for (const key of REQUIRED) if (!hexOf(raw, key)) return null
  // `mode` is advisory: a theme that lies about it (or omits it) is still
  // usable, and the background's own luminance is the honest answer.
  const declared = raw.mode?.trim().toLowerCase()
  const mode: Mode =
    declared === 'light' || declared === 'dark'
      ? declared
      : isLightHex(hexOf(raw, 'background')!)
        ? 'light'
        : 'dark'
  return derive(raw, mode)
}

function isLightHex(hex: string): boolean {
  const c = parseHex(hex)
  if (!c) return false
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000 > 128
}

// ---- the mapping onto the app's CSS custom properties --------------------

/**
 * Kidboard's semantic `Tone` vocabulary, mapped onto the Omarchy palette.
 *
 * Every choice here is about what a tone MEANS, not what colour it happens to
 * be — cartridges say `win`, never `#86d99b`, and that is why no cartridge had
 * to change for any of this.
 *
 *   plain -> foreground   the readable ink; that is what `foreground` is for
 *   art   -> yellow       drawings and ASCII art, the warm ink of a sketch
 *   info  -> cyan         calm and secondary; never competes with the accent
 *   win   -> green        success is green in both of Kidboard's languages
 *   magic -> magenta      the delight colour, the one nothing else uses
 *   warm  -> orange       literal, and the tone cartridges reach for for fire,
 *                         sun and enthusiasm
 *   cool  -> blue         literal, the opposite pole of `warm`
 *
 * The chrome follows the ramp rather than the hues:
 *
 *   --kb-bg      background          the ground
 *   --kb-surface dark_background     the chrome bars, one step recessed —
 *                                    consistently a step away from the ground
 *                                    in BOTH modes, which `lighter_background`
 *                                    is not
 *   --kb-panel   selection           the popover card
 *   --kb-raised  lighter_background  hover / press
 *   --kb-border  muted               exactly what `muted` is for
 *   --kb-dim     dark_foreground     de-emphasised chrome text
 *   --kb-accent  accent              the one hot colour
 *   --kb-prompt  accent              the prompt and caret ARE the accent: the
 *                                    single thing a child's eye should find
 */
export const TONE_SOURCE = {
  plain: 'foreground',
  art: 'yellow',
  info: 'cyan',
  win: 'green',
  magic: 'magenta',
  warm: 'orange',
  cool: 'blue',
} as const satisfies Record<string, PaletteKey>

/**
 * Text is held to WCAG AA (4.5:1) against the ground it is drawn on. See
 * `ensureContrast`: this is a floor, not a filter, and both shipped themes
 * clear it untouched.
 */
export const MIN_TEXT_CONTRAST = 4.5

/**
 * WCAG's non-text floor. `--kb-border` is not text, but it is not decoration
 * either — it is the only thing separating the panel from the ground behind
 * it, and a muted that is nearly its own background produces a border a
 * child cannot see. Some imported themes ship exactly that (a `muted` chosen
 * for a code editor's minimap, not for a frame around a game a six-year-old
 * has to find), so it gets the same treatment as text, at the lower floor
 * that applies to it.
 */
export const MIN_BORDER_CONTRAST = 3

export type ThemeVars = Record<string, string>

/**
 * Raises a colour until it clears `min` against EVERY ground it may be drawn
 * on. Text in Kidboard sits on three: the terminal ground, the popover card,
 * and the chrome bars. Guarding against only the first is how a theme ends up
 * with a status bar you cannot read — and `--kb-border` outlines all three
 * too, which is why it is walked through the same grounds at its own floor.
 */
function against(hex: string, grounds: string[], min = MIN_TEXT_CONTRAST): string {
  let out = hex
  for (const g of grounds) out = ensureContrast(out, g, min)
  return out
}

/**
 * A step of Kidboard's chrome (the status bar, the popover card, a hovered
 * row) must actually be a step — a theme whose author left two of these
 * fields identical (Omarchy's own `last-horizon` sets `lighter_background`
 * to exactly `background`) would otherwise make a hover state that looks
 * indistinguishable from not hovering at all. Nudged toward the foreground by
 * the same 12% `derive()` uses for its own default `lighter_background`, so a
 * theme that needed no rescue is not given a different-looking chrome than
 * the one its author actually specified.
 */
function stepOffGround(hex: string, bg: string, fg: string): string {
  return hex.toLowerCase() === bg.toLowerCase() ? mix(bg, fg, 0.12) : hex
}

/** The `--kb-*` custom properties a palette resolves to. */
export function toVars(p: Palette): ThemeVars {
  const bg = p.background
  const surface = stepOffGround(p.dark_background, bg, p.foreground)
  const panel = stepOffGround(p.selection, bg, p.foreground)
  const raised = stepOffGround(p.lighter_background, bg, p.foreground)
  // The three grounds text is ever drawn on, worst-first is irrelevant —
  // `against` walks all of them and keeps whatever survives.
  const grounds = [bg, panel, surface]
  const text = (hex: string): string => against(hex, grounds)

  const accent = text(p.accent)
  const rgb = parseHex(accent)

  const vars: ThemeVars = {
    '--kb-bg': bg,
    '--kb-surface': surface,
    '--kb-panel': panel,
    '--kb-raised': raised,
    '--kb-border': against(p.muted, grounds, MIN_BORDER_CONTRAST),
    '--kb-dim': text(p.dark_foreground),
    '--kb-accent': accent,
    '--kb-prompt': accent,
    /**
     * The one period gesture: a low-alpha halo, and ONLY on the accent. The
     * sun in retro-82's own wallpapers is the single burning point in an
     * otherwise cool picture, and the prompt is Kidboard's. Emitted here
     * rather than written in CSS because a glow has to be the accent at low
     * alpha, which no static stylesheet can derive from a custom property.
     */
    '--kb-glow': rgb ? `rgb(${rgb.r} ${rgb.g} ${rgb.b} / 0.42)` : 'transparent',
  }

  for (const [tone, key] of Object.entries(TONE_SOURCE)) {
    vars[`--kb-${tone}`] = text(p[key])
  }
  return vars
}
