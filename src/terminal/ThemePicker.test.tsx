import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemePicker } from './ThemePicker'
import { makeT } from '../i18n/locale'
import { themeById } from '../theme/themes'
import { KIDTARI } from '../systems/systems'
import type { Theme } from '../theme/themes'

/**
 * THE COLOUR PICKER. Ctrl, Ctrl.
 *
 * The same box, the same highlight and the same keys as the game list — one
 * gesture to learn, two questions answered — and one thing of its own: every
 * row wears the palette it names, because `everforest` is a word an adult
 * chose and four colours are what a six-year-old is actually picking.
 */

const themes = KIDTARI.themes
  .map((id) => themeById(id))
  .filter((th): th is Theme => !!th)

const props = (over: Partial<Parameters<typeof ThemePicker>[0]> = {}) => ({
  t: makeT('en'),
  locale: 'en' as const,
  dir: 'ltr' as const,
  themes,
  themeId: themes[2]!.id,
  onPick: vi.fn(),
  onClose: vi.fn(),
  ...over,
})

const rows = (c: HTMLElement) =>
  [...c.querySelectorAll('.kb-picker-word')].map((e) => e.textContent ?? '')

const active = (c: HTMLElement) =>
  c.querySelector('[data-kb-active="true"] .kb-picker-word')?.textContent ?? ''

describe('the colour picker', () => {
  it('lists this machine\'s palettes, and only those', () => {
    const { container } = render(<ThemePicker {...props()} />)
    expect(rows(container)).toEqual(themes.map((th) => th.name.en))
    // Picking a phosphor on a Kidtari is not a choice a machine offers.
    expect(within(container).queryByText('P3 amber')).toBeNull()
  })

  /**
   * A palette's NAME is a word an adult chose; what a child is choosing is
   * four colours. Same chip the settings menu draws, from the same function.
   */
  it('wears each palette on the row that names it', () => {
    const { container } = render(<ThemePicker {...props()} />)
    const chips = container.querySelectorAll('.kb-swatch')
    expect(chips).toHaveLength(themes.length)
    expect(chips[0]!.querySelectorAll('i')).toHaveLength(4)
  })

  /**
   * This is a list you come back to, so it opens where you left it: the
   * highlight starts on the palette the machine is wearing, which makes "the
   * next one along" a single press.
   */
  it('starts the highlight on the palette you are wearing', () => {
    const { container } = render(<ThemePicker {...props()} />)
    expect(active(container)).toBe(themes[2]!.name.en)
    expect(container.querySelector('.kb-picker-check')).toBeTruthy()
  })

  it('moves with the arrows, wraps, and chooses on enter', async () => {
    const u = userEvent.setup()
    const onPick = vi.fn()
    render(<ThemePicker {...props({ onPick })} />)
    // The highlight starts on the last palette here, so one step down wraps —
    // which is what a list this short is for.
    await u.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(themes[0])
  })

  it('chooses the row that is clicked', async () => {
    const u = userEvent.setup()
    const onPick = vi.fn()
    const { container } = render(<ThemePicker {...props({ onPick })} />)
    await u.click(within(container).getByText(themes[0]!.name.en))
    expect(onPick).toHaveBeenCalledWith(themes[0])
  })

  it('closes on escape, and on a click outside the box', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<ThemePicker {...props({ onClose })} />)
    await u.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    await u.click(container.querySelector('.kb-picker-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('names each palette in the child\'s own language, and reads their way', () => {
    const { container } = render(
      <ThemePicker {...props({ locale: 'he', dir: 'rtl' })} />,
    )
    expect(container.querySelector('[data-kb-picker]')!.getAttribute('dir'))
      .toBe('rtl')
    expect(rows(container)).toEqual(themes.map((th) => th.name.he ?? th.name.en))
  })

  /** A palette that vanished from under it is not an error a child may see. */
  it('shows a list with nothing chosen rather than breaking', () => {
    const { container } = render(<ThemePicker {...props({ themeId: 'nope' })} />)
    expect(rows(container)).toHaveLength(themes.length)
    expect(active(container)).toBe(themes[0]!.name.en)
    expect(container.querySelector('.kb-picker-check')).toBeNull()
  })
})
