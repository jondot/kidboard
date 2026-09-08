import type { Locale } from '../types'
import { parsePalette, type Palette } from './palette'

export type Theme = {
  id: string
  /** What the child sees in the 🎨 panel, in their own language. */
  name: Record<Locale, string>
  palette: Palette
}

/**
 * The palette used when everything else has failed: a malformed built-in, a
 * bundler that did not inline the `.toml`, a theme id that no longer exists.
 * It is `sunset-arcade` written out by hand, so the worst case is still the
 * intended look and never a blank screen or a thrown error.
 */
export const LAST_RESORT: Palette = {
  mode: 'dark',
  accent: '#ff7a3d',
  selection: '#153543',
  muted: '#3f7f8c',
  background: '#0e2732',
  dark_background: '#0a1e27',
  darker_background: '#07161d',
  lighter_background: '#1a3f4f',
  foreground: '#f5deb0',
  dark_foreground: '#84b2b8',
  light_foreground: '#fbecc9',
  bright_foreground: '#fff6e0',
  red: '#ff6a4d',
  yellow: '#f7d488',
  orange: '#ffa45c',
  green: '#7ed99f',
  cyan: '#5fcfd6',
  blue: '#7fb5e0',
  magenta: '#e9a7d1',
  brown: '#7a4526',
  bright_red: '#ff8a70',
  bright_yellow: '#ffe3a0',
  bright_orange: '#ffb87c',
  bright_green: '#9ce8b6',
  bright_cyan: '#84e0e6',
  bright_blue: '#9dc9ec',
  bright_magenta: '#f3bfe0',
  bright_brown: '#7a4526',
}

/**
 * Builds a theme from an Omarchy `colors.toml` source. A source that will not
 * parse falls back rather than throwing — this runs at module evaluation, and
 * a throw here would blank the page, which is the one error state this project
 * promises a child will never see.
 */
export function themeFrom(
  id: string,
  name: Record<Locale, string>,
  src: unknown,
): Theme {
  const palette = parsePalette(src)
  if (!palette) {
    console.warn(`[kidboard] theme "${id}" did not parse; using the default palette`)
  }
  return { id, name, palette: palette ?? LAST_RESORT }
}
