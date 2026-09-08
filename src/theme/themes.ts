import type { Locale } from '../types'
import { GALLERY } from './gallery'
import { SYSTEM_THEMES } from './systemThemes'
import { themeFrom, type Theme } from './theme'
import sunsetArcadeToml from './builtin/sunset-arcade.toml?raw'
import desertNoonToml from './builtin/desert-noon.toml?raw'

export { themeFrom, type Theme } from './theme'

export const SUNSET_ARCADE = themeFrom(
  'sunset-arcade',
  { en: 'sunset arcade', he: 'ארקייד שקיעה' },
  sunsetArcadeToml,
)

export const DESERT_NOON = themeFrom(
  'desert-noon',
  { en: 'desert noon', he: 'צהרי מדבר' },
  desertNoonToml,
)

/** Kidboard's own two, tuned themes — always first, always the defaults. */
export const OURS: readonly Theme[] = [SUNSET_ARCADE, DESERT_NOON]

export { GALLERY } from './gallery'
export { SYSTEM_THEMES } from './systemThemes'

/**
 * Every theme that exists: ours, Omarchy's gallery, and the palettes that
 * belong to a machine (`./systemThemes.ts`). Adding a theme to `./gallery.ts`
 * is the whole job — nothing here, in the panel, or in the store needs to
 * change to pick it up.
 *
 * This is the LOOKUP set, not the pick-one-from list. Which of these a child
 * is actually offered is a question about the system they are on, and
 * `src/systems/` answers it; `themeById` and the store need to resolve a
 * persisted id whatever machine minted it, which is what this is for.
 */
export const THEMES: readonly Theme[] = [...OURS, ...GALLERY, ...SYSTEM_THEMES]

export const DEFAULT_DARK = SUNSET_ARCADE
export const DEFAULT_LIGHT = DESERT_NOON

export function themeById(id: string | null | undefined): Theme | undefined {
  if (!id) return undefined
  return THEMES.find((t) => t.id === id)
}

// ---- the panel's rows ------------------------------------------------------

/**
 * A row `Toolbar`'s theme panel can render. Deliberately the same shape as
 * `Toolbar`'s own private `Row` type (a `key` and a `label`, everything else
 * optional) rather than importing it — this module has no reason to depend on
 * a terminal component, and a structurally-identical object is exactly what
 * `Row[]` accepts.
 */
export type ThemeRow = {
  key: string
  label: string
  swatch?: readonly string[]
  selected?: boolean
  run?: () => void
}

const header = (locale: Locale, key: string, en: string, he: string): ThemeRow => ({
  key: `header-${key}`,
  label: locale === 'he' ? he : en,
})

/**
 * Builds the theme panel's rows: ours first (unlabelled — they are simply the
 * top of the list, and the ones already selected on a first visit), then
 * Omarchy's gallery split into dark and light — `mode` is in every file, so
 * this grouping is free — each headed by an unpickable note row exactly like
 * the 🃏 panel's "no carts yet", and finally a one-line attribution note.
 *
 * A header/note row is a `ThemeRow` with no `run`: `Toolbar` already treats
 * such a row as unpickable and skips it in arrow-key navigation, so grouping
 * needs no new capability from the panel that renders these rows.
 */
export function themePanelRows(
  themes: readonly Theme[],
  locale: Locale,
  activeId: string,
  onPick: (theme: Theme) => void,
): ThemeRow[] {
  const toRow = (th: Theme): ThemeRow => ({
    key: th.id,
    label: th.name[locale] ?? th.name.en,
    // The four relationships the theme is built on, in reading order: deep
    // ground, one hot accent, structure, ink.
    swatch: [
      th.palette.background, th.palette.accent,
      th.palette.muted, th.palette.foreground,
    ],
    selected: th.id === activeId,
    run: () => onPick(th),
  })

  // Anything that is not a gallery import is listed plainly at the top:
  // our own two, and whichever machine palettes the caller passed in.
  const galleryIds = new Set(GALLERY.map((t) => t.id))
  const ours = themes.filter((t) => !galleryIds.has(t.id))
  const gallery = themes.filter((t) => galleryIds.has(t.id))
  const dark = gallery.filter((t) => t.palette.mode === 'dark')
  const light = gallery.filter((t) => t.palette.mode === 'light')

  const rows: ThemeRow[] = [...ours.map(toRow)]
  if (dark.length > 0) {
    rows.push(header(locale, 'gallery-dark', 'gallery · dark', 'גלריה · כהה'))
    rows.push(...dark.map(toRow))
  }
  if (light.length > 0) {
    rows.push(header(locale, 'gallery-light', 'gallery · light', 'גלריה · בהיר'))
    rows.push(...light.map(toRow))
  }
  if (gallery.length > 0) {
    rows.push(header(locale, 'gallery-credit', 'via Omarchy', 'מבית Omarchy'))
  }
  return rows
}
