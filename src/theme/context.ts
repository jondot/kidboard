import { createContext, useContext } from 'react'
import { DEFAULT_DARK } from './themes'

/**
 * The active theme's id, for the one consumer that cannot read it off CSS: the
 * glyph atlas.
 *
 * `GridCanvas`'s atlas is keyed partly on the theme, and it is rebuilt only
 * when that key changes. Colours reach the canvas through `tonesFrom`, which
 * reads the live `--kb-*` custom properties — but nothing about a CSS custom
 * property changing makes React re-run an effect, so without this a theme
 * switch would leave every running game painting in the old palette until it
 * happened to be resized.
 *
 * A bare string rather than the whole theme on purpose: this is an
 * invalidation signal, not a second way to get at colours.
 */
export const ThemeContext = createContext<string>(DEFAULT_DARK.id)

export function useThemeId(): string {
  return useContext(ThemeContext)
}
