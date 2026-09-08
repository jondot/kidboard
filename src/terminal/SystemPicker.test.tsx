import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SystemPicker } from './SystemPicker'
import { makeT } from '../i18n/locale'
import { SYSTEMS } from '../systems/systems'
import { SYSTEM_STRINGS } from '../systems/strings'
import { themeById } from '../theme/themes'

/**
 * THE MACHINE PICKER. Option, Option.
 *
 * The third of the same list: same box, same highlight, same keys as the games
 * and the colours. A machine is not a setting — it is which computer you are
 * sitting at — so it left the settings menu along with the palettes.
 */

const t = makeT('en', SYSTEM_STRINGS)

const props = (over: Partial<Parameters<typeof SystemPicker>[0]> = {}) => ({
  t,
  dir: 'ltr' as const,
  systems: SYSTEMS,
  systemId: SYSTEMS[1]!.id,
  onPick: vi.fn(),
  onClose: vi.fn(),
  ...over,
})

const rows = (c: HTMLElement) =>
  [...c.querySelectorAll('.kb-picker-word')].map((e) => e.textContent ?? '')

const active = (c: HTMLElement) =>
  c.querySelector('[data-kb-active="true"] .kb-picker-word')?.textContent ?? ''

describe('the machine picker', () => {
  it('lists every machine, by name, in registry order', () => {
    const { container } = render(<SystemPicker {...props()} />)
    expect(rows(container)).toEqual(SYSTEMS.map((s) => t(s.name)))
    // Never a raw i18n key on a list a six-year-old is reading.
    expect(container.textContent).not.toContain('system.')
  })

  /**
   * Each row wears that machine's OWN default palette — what the computer
   * looks like when you arrive at it, which is the only honest thing a chip
   * beside its name can say.
   */
  it('wears each machine\'s own colours on its row', () => {
    const { container } = render(<SystemPicker {...props()} />)
    const chips = container.querySelectorAll('.kb-swatch')
    expect(chips).toHaveLength(SYSTEMS.length)
    const first = themeById(SYSTEMS[0]!.defaultTheme)!
    const cells = [...chips[0]!.querySelectorAll('i')]
      .map((el) => (el as HTMLElement).style.background)
    expect(cells).toHaveLength(4)
    // jsdom gives a colour back as `rgb()`, so the hex is taken there too.
    const n = parseInt(first.palette.background.replace('#', ''), 16)
    expect(cells[0])
      .toBe(`rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`)
  })

  it('starts the highlight on the machine you are on, and checks it', () => {
    const { container } = render(<SystemPicker {...props()} />)
    expect(active(container)).toBe(t(SYSTEMS[1]!.name))
    expect(container.querySelectorAll('.kb-picker-check')).toHaveLength(1)
  })

  it('moves with the arrows and switches on enter', async () => {
    const u = userEvent.setup()
    const onPick = vi.fn()
    render(<SystemPicker {...props({ onPick })} />)
    await u.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(SYSTEMS[2]!.id)
  })

  it('switches to the machine that is clicked', async () => {
    const u = userEvent.setup()
    const onPick = vi.fn()
    const { container } = render(<SystemPicker {...props({ onPick })} />)
    await u.click(within(container).getByText(t(SYSTEMS[0]!.name)))
    expect(onPick).toHaveBeenCalledWith(SYSTEMS[0]!.id)
  })

  it('closes on escape, and on a click outside the box', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<SystemPicker {...props({ onClose })} />)
    await u.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    await u.click(container.querySelector('.kb-picker-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  /**
   * The box reads the child's way. The NAMES do not change: `kidtari` and
   * `omarchy` are proper names of real things, and Hebrew writes those in
   * Latin — the rule is in `systems/strings.ts`.
   */
  it('reads right to left in Hebrew', () => {
    const { container } = render(
      <SystemPicker {...props({ t: makeT('he', SYSTEM_STRINGS), dir: 'rtl' })} />,
    )
    expect(container.querySelector('[data-kb-picker]')!.getAttribute('dir'))
      .toBe('rtl')
    expect(container.querySelector('.kb-picker-title')!.textContent)
      .toBe('בחרו מכונה')
  })

  /** A machine that vanished from under it is not an error a child may see. */
  it('shows a list with nothing checked rather than breaking', () => {
    const { container } = render(
      <SystemPicker {...props({ systemId: 'nope' as never })} />,
    )
    expect(rows(container)).toHaveLength(SYSTEMS.length)
    expect(active(container)).toBe(t(SYSTEMS[0]!.name))
    expect(container.querySelector('.kb-picker-check')).toBeNull()
  })
})
