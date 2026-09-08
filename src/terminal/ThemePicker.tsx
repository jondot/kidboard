import { useCallback, useMemo } from 'react'
import type { Dir, Locale, T } from '../types'
import type { Theme } from '../theme/themes'
import { swatchOf } from '../chrome/menuModel'
import { Picker } from './Picker'

/**
 * THE COLOUR PICKER. Ctrl, Ctrl.
 *
 * The palettes were a submenu behind a pointer: open the settings menu, find
 * `colours`, walk into it, and read twenty-two names in a strip four hundred
 * pixels tall. Colour is the thing a six-year-old changes most and the one
 * they change for fun, so it gets the same treatment the games got — a list in
 * the middle of the screen, opened by a gesture, driven by the arrows.
 *
 * WHY THIS ONE HAS CHIPS. A palette's NAME is a word an adult chose
 * (`everforest`, `tokyo night`); what a child is actually choosing is four
 * colours. So every row wears its own palette as a 2x2 chip — ground, accent,
 * structure, ink — which is the same chip the settings menu draws, from the
 * same function, so the two can never disagree.
 *
 * THE HIGHLIGHT STARTS ON THE ONE YOU ARE WEARING, rather than at the top:
 * this list is a place you come back to, and arriving with the cursor on the
 * current palette makes "the next one along" a single press.
 */

export type ThemePickerProps = {
  t: T
  locale: Locale
  dir: Dir
  /** Only the ACTIVE machine's palettes — the caller scopes them. */
  themes: readonly Theme[]
  themeId: string
  onPick(theme: Theme): void
  onClose(): void
}

export function ThemePicker(
  { t, locale, dir, themes, themeId, onPick, onClose }: ThemePickerProps,
) {
  const items = useMemo(
    () =>
      themes.map((th) => ({
        key: th.id,
        label: th.name[locale] ?? th.name.en,
        swatch: swatchOf(th),
        checked: th.id === themeId,
      })),
    [themes, locale, themeId],
  )

  const start = useMemo(
    () => Math.max(0, themes.findIndex((th) => th.id === themeId)),
    [themes, themeId],
  )

  const pick = useCallback((key: string) => {
    const th = themes.find((x) => x.id === key)
    if (th) onPick(th)
  }, [themes, onPick])

  return (
    <Picker
      title={t('pick.colours.title')}
      hint={t('pick.colours.hint')}
      dir={dir}
      items={items}
      start={start}
      onPick={pick}
      onClose={onClose}
    />
  )
}
