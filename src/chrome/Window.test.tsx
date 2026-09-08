import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Window } from './Window'
import { KIDTARI, KIDCODE, CRT, OMARCHY, SYSTEMS } from '../systems/systems'
import { SYSTEM_STRINGS } from '../systems/strings'
import { makeT } from '../i18n/locale'
import type { System } from '../systems/types'

/**
 * THE WINDOW A MACHINE LIVES IN.
 *
 * Kidboard used to sit in one generic box on all four machines: a teal rule, a
 * ✨, the word "kidboard" and four emoji buttons. That undid the point of
 * having four machines — the transcript below the line changed and the frame
 * around it never did, so every machine was the same computer in a different
 * font. These are the tests that keep the frames apart.
 */

const props = (system: System, over: Partial<Parameters<typeof Window>[0]> = {}) => ({
  system,
  locale: 'en' as const,
  dir: 'ltr' as const,
  t: makeT('en', SYSTEM_STRINGS),
  title: 'kidboard',
  liveTitle: null,
  menu: <button data-test-menu="">settings</button>,
  children: <div data-test-face="">the machine</div>,
  ...over,
})

describe('the window each machine lives in', () => {
  it('draws a different frame per machine, and never the same one twice', () => {
    const kinds = SYSTEMS.map((s) => {
      const { container } = render(<Window {...props(s)} />)
      return container.querySelector('[data-kb-window]')!.getAttribute('data-kb-window')
    })
    expect(kinds).toEqual(['tv', 'mac', 'monitor', 'tiling'])
    expect(new Set(kinds).size).toBe(SYSTEMS.length)
  })

  it('puts the machine inside the frame, whatever the frame is', () => {
    for (const s of SYSTEMS) {
      const { container } = render(<Window {...props(s)} />)
      const win = container.querySelector('[data-kb-window]')!
      expect(win.querySelector('[data-test-face]'), s.id).toBeTruthy()
    }
  })

  /**
   * ONE SETTINGS MENU, and it rides in whichever bit of chrome that machine
   * would actually put it in — the tab strip, the top bar, the bezel
   * moulding. There used to be four buttons; there is one, and every machine
   * has it.
   */
  it('carries the one settings menu in every frame, in the title bar', () => {
    for (const s of SYSTEMS) {
      const { container } = render(<Window {...props(s)} />)
      const bar = container.querySelector('[data-kb-titlebar]')!
      expect(bar, s.id).toBeTruthy()
      expect(bar.querySelector('[data-test-menu]'), s.id).toBeTruthy()
    }
  })

  /**
   * NOTHING IN A FRAME MOVES, and nothing in one is a control that lies.
   *
   * The macOS lights are not buttons and the tiling workspaces are not
   * buttons: a close button that closed nothing would be a lie, and one that
   * worked would leave a six-year-old on a blank page with no way back. Both
   * are `aria-hidden` scenery.
   */
  it('adds no button beyond the settings menu, on any machine', () => {
    for (const s of SYSTEMS) {
      const { container } = render(<Window {...props(s)} />)
      const own = [...container.querySelectorAll('button')]
        .filter((b) => !b.hasAttribute('data-test-menu'))
      expect(own, s.id).toHaveLength(0)
    }
  })

  describe('the television — a Kidtari has no windows', () => {
    it('badges the set with the machine name, not the product name', () => {
      const { container } = render(<Window {...props(KIDTARI)} />)
      const plate = container.querySelector('[data-kb-titlebar]')!
      expect(plate.textContent).toContain('kidtari')
      expect(plate.textContent).not.toContain('kidboard')
    })

    it('insets the picture in the set, with nothing drawn above it', () => {
      const { container } = render(<Window {...props(KIDTARI)} />)
      const screenBox = container.querySelector('.kb-win-tv-screen')!
      const plate = container.querySelector('[data-kb-titlebar]')!
      // A television's badge is UNDER the picture, because that is where it is.
      expect(screenBox.compareDocumentPosition(plate))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  describe('the macOS window — kid code is a terminal', () => {
    it('has three traffic lights and a tab carrying the title', () => {
      const { container } = render(<Window {...props(KIDCODE)} />)
      expect(container.querySelectorAll('.kb-win-mac-light')).toHaveLength(3)
      expect(container.querySelector('[data-kb-tab]')!.textContent)
        .toContain('kidboard')
    })

    /** A window title says what is OPEN, so a running game takes it over. */
    it('names the running game in the tab while one is running', () => {
      const { container } = render(
        <Window {...props(KIDCODE, { liveTitle: 'bounce' })} />,
      )
      const tab = container.querySelector('[data-kb-tab]')!
      expect(tab.textContent).toContain('bounce')
      expect(tab.textContent).toContain('kidboard')
    })

    it('hides the lights from anyone reading the page aloud', () => {
      const { container } = render(<Window {...props(KIDCODE)} />)
      expect(container.querySelector('.kb-win-mac-lights')!.getAttribute('aria-hidden'))
        .toBe('true')
    })
  })

  describe('the monitor — a Logo machine has no window manager', () => {
    it('badges the bezel with the machine name and shows no tab', () => {
      const { container } = render(<Window {...props(CRT)} />)
      expect(container.querySelector('[data-kb-titlebar]')!.textContent)
        .toContain('crt / logo')
      expect(container.querySelector('[data-kb-tab]')).toBeNull()
    })
  })

  describe('the tiling compositor — omarchy is hyprland', () => {
    it('runs a bar across the top with workspaces and the window title', () => {
      const { container } = render(<Window {...props(OMARCHY)} />)
      const bar = container.querySelector('[data-kb-titlebar]')!
      const body = container.querySelector('.kb-win-tiling-body')!
      // The bar is ABOVE the window's contents; a compositor's bar always is.
      expect(bar.compareDocumentPosition(body))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      expect(container.querySelectorAll('.kb-win-tiling-space')).toHaveLength(3)
      expect(bar.textContent).toContain('kidboard')
    })

    it('hides the workspaces from anyone reading the page aloud', () => {
      const { container } = render(<Window {...props(OMARCHY)} />)
      expect(container.querySelector('.kb-win-tiling-spaces')!.getAttribute('aria-hidden'))
        .toBe('true')
    })
  })

  /**
   * `makeT` falls back to the KEY when a lookup misses, which would print
   * "system.omarchy" on a bezel. Never a key, never blank.
   */
  it('never shows a raw i18n key as a machine name', () => {
    const blind = ((k: string) => k) as ReturnType<typeof makeT>
    for (const s of [KIDTARI, CRT]) {
      const { container } = render(<Window {...props(s, { t: blind })} />)
      const plate = container.querySelector('[data-kb-titlebar]')!.textContent ?? ''
      expect(plate, s.id).not.toContain('system.')
      expect(plate.trim().length, s.id).toBeGreaterThan(0)
    }
  })
})
