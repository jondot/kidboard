import { useMemo } from 'react'
import type { Cartridge, Locale, T } from '../types'
import { themeById, type Theme } from '../theme/themes'
import type { System, SystemId } from '../systems/types'
import { useCartNodes } from '../carts/CartsPanel'
import type { MenuNode } from './Menu'
import { TEXT_SIZES, type TextSize } from './textSize'

/**
 * THE SETTINGS MENU, AS DATA.
 *
 * One tree, built here, rendered by `Menu`. Nothing in this file is a
 * component and nothing in it touches the DOM, so what is on the menu is
 * readable in one screen and testable without rendering anything.
 *
 * THE SHAPE, and why it is this shape:
 *
 *   games…                 ⇧⇧ opens the picker; this is its pointer twin
 *   colours…               ⌃⌃ opens the second one
 *   machines…      kidtari   ⌥⌥ opens the third
 *   ──────
 *   language ▸ English · עברית
 *   sound      (a toggle, not a list of two)
 *   ──────
 *   cartridges ▸
 *
 * THE THREE THINGS A CHILD CAME HERE TO CHOOSE ARE NOT SETTINGS, and that is
 * why all three sit above the rule. Each opens a PICKER — the list in the
 * middle of the screen a double tap also opens, Shift for the games, Ctrl for
 * the colours, Option for the machines — rather than a dropdown of its own.
 * What you play, what colour it is and which computer you are sitting at are
 * the questions; everything under the rule is how that computer is set up,
 * which is a different kind of question and is asked in a different kind of
 * place.
 *
 * THEY WERE SUBMENUS, and it was the wrong shape twice over: twenty-two
 * palette names in a strip four hundred pixels tall hanging off a title bar,
 * and the things a child changes most often filed next to the language.
 *
 * THE ROWS STILL SAY THEIR ANSWERS. `machines` carries the machine's name,
 * because a machine's answer is a word; `colours` carries the palette as a
 * chip, because a palette's answer is four colours and `everforest` is a word
 * an adult chose.
 */

export type MenuModelOpts = {
  t: T
  locale: Locale
  /** Every machine, in picker order. */
  systems: readonly System[]
  systemId: SystemId
  /** Only the ACTIVE machine's palettes — picking a phosphor on a Kidtari is
   *  not a choice, so the caller scopes this and the menu never has to. */
  themes: readonly Theme[]
  themeId: string
  muted: boolean
  textSize: TextSize
  /** Already filtered to the current locale by the caller. */
  cartridges: readonly Cartridge[]
  onOpenPicker(): void
  onOpenThemes(): void
  onOpenSystems(): void
  onPickCartridge(c: Cartridge): void
  onPickLocale(l: Locale): void
  onPickTextSize(s: TextSize): void
  onToggleSound(): void
}

/**
 * The four relationships a palette is built on, in reading order: deep ground,
 * one hot accent, structure, ink. Undefined for a machine whose palette failed
 * to parse — the row then simply has no chip, which is the same shape of
 * graceful nothing every other fallback in this project uses.
 */
export function swatchOf(th: Theme | undefined): readonly string[] | undefined {
  if (!th) return undefined
  return [
    th.palette.background, th.palette.accent,
    th.palette.muted, th.palette.foreground,
  ]
}

const LOCALES: readonly Locale[] = ['en', 'he']

export function useSettingsMenu(o: MenuModelOpts): MenuNode[] {
  const {
    t, locale, systems, systemId, themes, themeId, muted, textSize, cartridges,
    onOpenPicker, onOpenThemes, onOpenSystems, onPickCartridge, onPickLocale,
    onPickTextSize, onToggleSound,
  } = o

  // The 🃏 submenu owns its own file picker, download and drop listener, and
  // contributes nodes. That is the whole of its wiring.
  const cartNodes = useCartNodes({ locale, cartridges, onPickCartridge })

  return useMemo((): MenuNode[] => {
    const active = systems.find((s) => s.id === systemId)
    const wearing = themes.find((th) => th.id === themeId)

    return [
      {
        kind: 'item', key: 'games', icon: 'games',
        label: t('pick.open'), run: onOpenPicker,
      },
      {
        // The palette a child is wearing, shown rather than named: the row
        // carries the same 2x2 chip every palette row in the picker does.
        kind: 'item', key: 'theme',
        swatch: swatchOf(wearing),
        label: t('pick.colours'), run: onOpenThemes,
      },
      {
        // The one row of the three whose answer is a WORD, so it says it.
        kind: 'item', key: 'system', icon: 'system',
        label: t('pick.machines'),
        value: active ? t(active.name) : undefined,
        run: onOpenSystems,
      },
      { kind: 'sep', key: 'sep-1' },
      {
        kind: 'sub', key: 'language', icon: 'language', label: t('menu.language'),
        value: t(`lang.${locale}`),
        children: LOCALES.map((l) => ({
          kind: 'item' as const,
          key: `loc:${l}`,
          label: t(`lang.${l}`),
          checked: l === locale,
          run: () => onPickLocale(l),
        })),
      },
      {
        /*
         * HOW BIG THE WORDS ARE. A submenu rather than a toggle, because
         * unlike sound this has more than two answers, and a named list is
         * how the language row already asks a question of this shape.
         *
         * It sits under the rule, with the language and the sound, because it
         * is how this computer is SET UP — not what you play, what colour it
         * is, or which machine you are at. And it moves the prose only: the
         * games are the same size whatever is chosen here. See
         * `chrome/textSize.ts`.
         */
        kind: 'sub', key: 'textsize', icon: 'textsize',
        label: t('menu.textsize'),
        value: t(`textsize.${textSize}`),
        children: TEXT_SIZES.map((size) => ({
          kind: 'item' as const,
          key: `text:${size}`,
          label: t(`textsize.${size}`),
          checked: size === textSize,
          run: () => onPickTextSize(size),
        })),
      },
      {
        // A toggle, not a submenu of two: sound is on or it is not, and a
        // child who wants it back presses the same row again.
        kind: 'item', key: 'sound',
        icon: muted ? 'soundOff' : 'soundOn',
        label: t(muted ? 'sound.off' : 'sound.on'),
        checked: !muted,
        run: onToggleSound,
      },
      { kind: 'sep', key: 'sep-2' },
      {
        kind: 'sub', key: 'carts', icon: 'carts', label: t('menu.carts'),
        children: cartNodes,
      },
    ]
  }, [
    t, locale, systems, systemId, themes, themeId, muted, textSize, cartNodes,
    onOpenPicker, onOpenThemes, onOpenSystems, onPickLocale, onPickTextSize,
    onToggleSound,
  ])
}
