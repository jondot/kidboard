import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu, type MenuNode } from './Menu'
import type { Dir } from '../types'

/**
 * ONE HIERARCHICAL MENU, THE WAY EVERY DESKTOP DOES IT.
 *
 * There used to be four buttons in the title bar, each with a flat popup, and
 * the theme one had grown two headings inside it because a machine and its
 * palette are two questions wearing one button. Four buttons is four things to
 * explain; a title bar has a settings menu, and a settings menu has submenus.
 */

const nodes = (picked: () => void): MenuNode[] => [
  { kind: 'item', key: 'games', icon: 'games', label: 'games', run: picked },
  { kind: 'sep', key: 's1' },
  {
    kind: 'sub', key: 'machine', icon: 'system', label: 'machine', value: 'kidtari',
    children: [
      { kind: 'item', key: 'kidtari', label: 'kidtari', checked: true, run: picked },
      { kind: 'item', key: 'crt', label: 'crt / logo', checked: false, run: picked },
    ],
  },
  {
    kind: 'sub', key: 'colours', icon: 'theme', label: 'colours', value: 'classic blue',
    children: [
      { kind: 'item', key: 'blue', label: 'classic blue', checked: true, run: picked },
    ],
  },
  { kind: 'note', key: 'note', label: 'or drop one anywhere' },
]

const open = async (dir: Dir = 'ltr', busy = false) => {
  const picked = vi.fn()
  const u = userEvent.setup()
  const r = render(
    <Menu label="settings" icon="settings" nodes={nodes(picked)} dir={dir} busy={busy} />,
  )
  await u.click(screen.getByRole('button', { name: 'settings' }))
  return { u, picked, ...r }
}

describe('the settings menu', () => {
  it('is one button, and it is an icon rather than an emoji', () => {
    render(
      <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="ltr" busy={false} />,
    )
    const button = screen.getByRole('button', { name: 'settings' })
    // Stroked SVG in `currentColor`: it is drawn in the machine's own ink, so
    // it can never be the four-colour smudge an emoji is on a one-ink machine.
    const svg = button.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(button.textContent).toBe('')
  })

  it('opens and closes on the opener', async () => {
    const { u } = await open()
    expect(screen.getByRole('menu')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'settings' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  describe('submenus', () => {
    it('opens one to the side on hover, and closes it moving off', async () => {
      const { u } = await open()
      await u.hover(screen.getByRole('menuitem', { name: /machine/i }))
      expect(screen.getAllByRole('menu')).toHaveLength(2)
      expect(within(screen.getAllByRole('menu')[1]!).getByText('crt / logo')).toBeTruthy()

      // Moving onto a row that is not a submenu closes whatever was open.
      await u.hover(screen.getByRole('menuitem', { name: /games/i }))
      expect(screen.getAllByRole('menu')).toHaveLength(1)
    })

    /**
     * MACHINE AND COLOURS ARE TWO MENUS, not one list with headings in it.
     * They are different questions, and each shows its own current answer on
     * the parent row so both are legible without opening either.
     */
    it('shows each submenu its own current answer on the parent row', async () => {
      await open()
      expect(screen.getByRole('menuitem', { name: /machine/i }).textContent)
        .toContain('kidtari')
      expect(screen.getByRole('menuitem', { name: /colours/i }).textContent)
        .toContain('classic blue')
    })

    it('marks the chosen row, and only that one', async () => {
      const { u } = await open()
      await u.hover(screen.getByRole('menuitem', { name: /machine/i }))
      const sub = screen.getAllByRole('menu')[1]!
      expect(within(sub).getByRole('menuitemradio', { name: 'kidtari' })
        .getAttribute('aria-checked')).toBe('true')
      expect(within(sub).getByRole('menuitemradio', { name: 'crt / logo' })
        .getAttribute('aria-checked')).toBe('false')
    })

    it('closes the whole stack when anything is picked', async () => {
      const { u, picked } = await open()
      await u.hover(screen.getByRole('menuitem', { name: /machine/i }))
      await u.click(within(screen.getAllByRole('menu')[1]!).getByText('crt / logo'))
      expect(picked).toHaveBeenCalledOnce()
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  describe('the keyboard', () => {
    /**
     * `→` means INWARDS in English and OUTWARDS in Hebrew, so the two are read
     * off `dir` rather than hard-coded. Everything else — ↑↓, Enter, Escape —
     * is the same in both, because a vertical list does not mirror.
     */
    it('steps in with the arrow that points inwards, and back out with the other', async () => {
      const u = userEvent.setup()
      render(
        <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="ltr" busy={false} />,
      )
      const button = screen.getByRole('button', { name: 'settings' })
      button.focus()
      await u.keyboard('{ArrowDown}')
      await u.keyboard('{ArrowDown}')        // onto `machine` (the `sep` is skipped)
      await u.keyboard('{ArrowRight}')
      expect(screen.getAllByRole('menu')).toHaveLength(2)
      await u.keyboard('{ArrowLeft}')
      expect(screen.getAllByRole('menu')).toHaveLength(1)
    })

    it('mirrors those two arrows under Hebrew', async () => {
      const u = userEvent.setup()
      render(
        <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="rtl" busy={false} />,
      )
      screen.getByRole('button', { name: 'settings' }).focus()
      await u.keyboard('{ArrowDown}{ArrowDown}{ArrowLeft}')
      expect(screen.getAllByRole('menu')).toHaveLength(2)
      await u.keyboard('{ArrowRight}')
      expect(screen.getAllByRole('menu')).toHaveLength(1)
    })

    /** A separator and a note are not stops: the highlight skips both. */
    it('never lands the highlight on something nothing happens to', async () => {
      const u = userEvent.setup()
      render(
        <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="ltr" busy={false} />,
      )
      screen.getByRole('button', { name: 'settings' }).focus()
      await u.keyboard('{ArrowDown}')
      // Wrapping upwards from the top lands on `colours`, the last PICKABLE
      // row — never on the note under it.
      await u.keyboard('{ArrowUp}')
      expect(document.activeElement?.textContent).toContain('colours')
    })

    it('walks back out of a submenu on escape, one level at a time', async () => {
      const u = userEvent.setup()
      render(
        <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="ltr" busy={false} />,
      )
      screen.getByRole('button', { name: 'settings' }).focus()
      await u.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
      expect(screen.getAllByRole('menu')).toHaveLength(2)
      await u.keyboard('{Escape}')
      expect(screen.getAllByRole('menu')).toHaveLength(1)
      await u.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  /**
   * A RUNNING CARTRIDGE OWNS EVERY KEY, and that rule does not bend for a
   * menu. Opening this with the pointer must not move focus, or a tap would
   * strand a game that is still going.
   */
  it('never takes focus when it is opened by a pointer', async () => {
    const u = userEvent.setup()
    render(
      <>
        <input data-test-elsewhere="" />
        <Menu label="settings" icon="settings" nodes={nodes(vi.fn())} dir="ltr" busy={false} />
      </>,
    )
    const box = screen.getByRole('textbox')
    box.focus()
    await u.click(screen.getByRole('button', { name: 'settings' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(document.activeElement).toBe(box)
  })

  /** While a cartridge runs, a stray Escape from outside belongs to the game. */
  it('leaves a stray escape to a running cartridge', async () => {
    const { u } = await open('ltr', true)
    await u.keyboard('{Escape}')
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('takes a stray escape when nothing is running to claim it', async () => {
    const { u } = await open('ltr', false)
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
