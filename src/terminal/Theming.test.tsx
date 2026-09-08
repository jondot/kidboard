import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import userEvent from '@testing-library/user-event'
import { Kidboard } from '../Kidboard'
import { themeById } from '../theme/themes'
import { toVars } from '../theme/palette'
import { KIDTARI, MONO_STACK, SYSTEMS } from '../systems/systems'

/**
 * A THEME BELONGS TO A SYSTEM. There is no free-floating palette any more:
 * what a child is offered is the active machine's own list, and what a fresh
 * child gets is the default machine's default palette rather than a guess at
 * the operating system's mood. So these read against the Kidtari — the machine
 * a child who has never chosen is on.
 */
const BOOT = themeById(KIDTARI.defaultTheme)!
const OTHER = themeById('kidtari-console-black')!

const setScheme = (dark: boolean): void => {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: dark === q.includes('dark') }),
  })
}

const root = (c: HTMLElement) => c.firstElementChild as HTMLElement

/** `#rrggbb` as the browser gives it back. */
const rgb = (hex: string): string => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/**
 * THE ONE SETTINGS MENU, and how these tests walk it.
 *
 * There used to be four buttons — games, look, language, carts — each with a
 * flat popup of its own. There is one now, and the four questions are submenus
 * inside it, which is what every desktop menu bar has done since 1984. So a
 * test that used to click a named button now opens the gear and steps into the
 * submenu it wants.
 *
 * A submenu is a nested `role="menu"`, so the INNERMOST one is the last in
 * document order — that is what `sub()` returns and what `within()` scopes to.
 */
const openSettings = async (u: ReturnType<typeof userEvent.setup>) => {
  const button = screen.getByRole('button', { name: 'settings' })
  // Idempotent: the opener TOGGLES, so a second call on an already-open menu
  // would close it. A test that steps into two submenus in turn wants the menu
  // open both times, not open then shut.
  if (button.getAttribute('aria-expanded') !== 'true') await u.click(button)
  return screen.getAllByRole('menu')[0]!
}

const sub = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
  const top = await openSettings(u)
  await u.click(within(top).getByRole('menuitem', { name: new RegExp(name, 'i') }))
  const menus = screen.getAllByRole('menu')
  return menus[menus.length - 1]!
}

/**
 * THE THREE CHOICES ARE NOT IN THE MENU ANY MORE. Each is a list in the middle
 * of the screen — one box, one highlight, one set of keys — opened by a double
 * tap, or by its row in the settings menu for a tablet with no keyboard at
 * all. So a test that used to step into a submenu opens the list instead.
 */
const twice = (key: string) => `{${key}>}{/${key}}{${key}>}{/${key}}`

const ctrlCtrl = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.keyboard(twice('Control'))
  return screen.getByRole('listbox')
}

const altAlt = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.keyboard(twice('Alt'))
  return screen.getByRole('listbox')
}

describe('Kidboard theming', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  it('writes the palette onto its own root, never onto the document', () => {
    const { container } = render(<Kidboard />)
    const el = root(container)
    expect(el.style.getPropertyValue('--kb-bg'))
      .toBe(BOOT.palette.background)
    // Embeddable: the host page must be exactly as it was.
    expect(document.documentElement.style.getPropertyValue('--kb-bg')).toBe('')
    expect(document.body.style.getPropertyValue('--kb-bg')).toBe('')
  })

  it('emits every var the stylesheet consumes', () => {
    const { container } = render(<Kidboard />)
    const el = root(container)
    for (const [k, v] of Object.entries(toVars(BOOT.palette))) {
      expect(el.style.getPropertyValue(k), k).toBe(v)
    }
  })

  /**
   * The typeface rides on the same element as the palette, and for the same
   * reason: everything below inherits it — `.kb-art`'s `2ch` emoji cells
   * included — and the host page is left exactly as it was found.
   */
  it('writes the machine\'s typeface onto that same root, and nowhere else', () => {
    const { container } = render(<Kidboard />)
    const el = root(container)
    expect(el.style.getPropertyValue('--kb-font')).toBe(KIDTARI.font.stack)
    expect(el.style.getPropertyValue('--kb-font-size')).toBe(`${KIDTARI.font.size}px`)
    expect(el.style.getPropertyValue('--kb-line-height'))
      .toBe(String(KIDTARI.font.lineHeight))
    expect(document.documentElement.style.getPropertyValue('--kb-font')).toBe('')
    expect(document.body.style.getPropertyValue('--kb-font')).toBe('')
  })

  it('switches typeface with the machine', () => {
    localStorage.setItem('kb.system', 'crt')
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-font')).toContain('VT323')
  })

  // A first-time child gets the default machine's own palette. The operating
  // system's light/dark mood is not a second, competing answer to "which
  // machine am I on".
  it('gives a child who has never chosen the default machine and its palette', () => {
    setScheme(false)
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(BOOT.palette.background)
  })

  // The reason `kb.theme` exists at all.
  it('lets a stored palette win on the first frame', () => {
    localStorage.setItem('kb.theme', OTHER.id)
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(OTHER.palette.background)
  })

  it('shrugs at a stored theme that no longer exists', () => {
    localStorage.setItem('kb.theme', 'a-theme-from-a-previous-life')
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(BOOT.palette.background)
    expect(container.textContent?.toLowerCase()).not.toContain('error')
  })

  /**
   * A theme id is SCOPED. A palette stored by an older, system-less build —
   * or by a different machine — is judged against the machine that actually
   * won, and refused in favour of that machine's default.
   */
  it('refuses a stored palette that belongs to another machine', () => {
    localStorage.setItem('kb.theme', 'crt-p3-amber')
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(BOOT.palette.background)
  })

  it('offers only the palettes of the machine you are on', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const panel = await ctrlCtrl(u)
    for (const id of KIDTARI.themes) {
      expect(within(panel).getByText(themeById(id)!.name.en)).toBeTruthy()
    }
    // Picking a phosphor on a Kidtari is not a choice a machine offers.
    expect(within(panel).queryByText(themeById('crt-p3-amber')!.name.en)).toBeNull()
  })

  it('applies a theme live when one is picked, and persists it', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const panel = await ctrlCtrl(u)
    await u.click(within(panel).getByText(OTHER.name.en))
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(OTHER.palette.background)
    expect(localStorage.getItem('kb.theme')).toBe(OTHER.id)
  })

  /**
   * BIGGER WORDS, AND ONLY WORDS.
   *
   * The reason this setting exists is somebody who could not read the screen,
   * so what it does has to be measurable — and what it must NOT do is
   * measurable too. A game sizes its cells from the width of its container
   * and a drawing is a picture at the size its cartridge asked for, so
   * neither may move when the prose does. See `chrome/textSize.ts`.
   */
  describe('how big the words are', () => {
    it('multiplies the machine\'s own type, and remembers the choice', async () => {
      const u = userEvent.setup()
      const { container } = render(<Kidboard />)
      expect(root(container).style.getPropertyValue('--kb-text-scale')).toBe('1')

      const sizes = await sub(u, 'text size')
      await u.click(within(sizes).getByText('bigger'))

      const scale = Number(root(container).style.getPropertyValue('--kb-text-scale'))
      expect(scale).toBeGreaterThan(1)
      expect(localStorage.getItem('kb.text')).toBe('bigger')
    })

    it('comes back at the chosen size on the very first frame', () => {
      localStorage.setItem('kb.text', 'big')
      const { container } = render(<Kidboard />)
      expect(Number(root(container).style.getPropertyValue('--kb-text-scale')))
        .toBeGreaterThan(1)
    })

    /**
     * The variable reaches `.kb-prose` and nothing else. A stylesheet check
     * rather than a rendered one: jsdom has no layout, so the honest thing to
     * assert here is the SHAPE of the rule — that art and the game canvas are
     * not named by it — and the real sizes were measured in a Chromium
     * (prose 16px → 27px, canvas 1180x472 unchanged, art 16px unchanged).
     */
    it('never reaches a drawing or a game', () => {
      const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')
      expect(css).toContain('.kb-prose { font-size: calc(1em * var(--kb-text-scale, 1)); }')
      // Declarations only: comments in this stylesheet explain the variable
      // at length and are not rules.
      for (const line of css.split('\n')) {
        if (!/font-size:.*--kb-text-scale/.test(line)) continue
        expect(line, `--kb-text-scale is applied by "${line.trim()}"`)
          .toMatch(/^\.kb-prose/)
      }
    })
  })

  /**
   * A muted machine does not offer to read anything out loud, and the offer
   * is withdrawn by a variable on the frame rather than by a prop threaded
   * through four shells and nine `BlockView` call sites. `display: none`
   * takes the speaker out of the tab order too — never leave a control on
   * screen that answers nothing.
   */
  it('withdraws the read-aloud speaker when the sound goes off', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-speak')).toBe('inline-flex')

    await u.type(screen.getByRole('textbox'), 'quiet{Enter}')
    expect(root(container).style.getPropertyValue('--kb-speak')).toBe('none')
  })

  it('persists nothing beyond the five keys it owns', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const colours = await ctrlCtrl(u)
    await u.click(within(colours).getByText(OTHER.name.en))
    const sizes = await sub(u, 'text size')
    await u.click(within(sizes).getByText('big'))
    const langs = await sub(u, 'language')
    await u.click(within(langs).getByText('עברית'))
    await u.type(screen.getByRole('textbox'), 'quiet{Enter}')
    expect(Object.keys(localStorage).sort())
      .toEqual(['kb.locale', 'kb.muted', 'kb.system', 'kb.text', 'kb.theme'])
  })
})

describe('the settings menu inside the terminal', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  /**
   * ONE BUTTON IN THE WINDOW CHROME, not four. Everything the four did is
   * inside it, and it is an ICON rather than an emoji: 🎮 🎨 🌍 🃏 were
   * full-colour bitmaps the font vendor chose, which ignore the palette
   * entirely and read as four identical smudges at 18px on a single-ink
   * machine.
   */
  it('puts exactly one button in the window chrome', () => {
    const { container } = render(<Kidboard />)
    const bar = container.querySelector('[data-kb-titlebar]')!
    expect(bar.querySelectorAll('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'settings' })).toBeTruthy()
    // Stroked SVG in `currentColor`, so it is drawn in the machine's own ink.
    expect(bar.querySelector('svg.kb-glyph')).toBeTruthy()
  })

  /**
   * The machine and its palette are DIFFERENT QUESTIONS, and they are asked in
   * different places: a machine is which computer you are sitting at, and it
   * is a submenu; a palette is what that computer is wearing, and it is a list
   * in the middle of the screen. Neither list ever contains the other's
   * answers, which is the thing a flat column of
   * `kidtari / console black / warm plastic / kid code` got wrong.
   */
  it('asks for the machine and the colours in two separate places', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const machines = await altAlt(u)
    expect(within(machines).getByText('kid code')).toBeTruthy()
    expect(within(machines).queryByText(OTHER.name.en)).toBeNull()

    await u.keyboard('{Escape}')
    const colours = await ctrlCtrl(u)
    expect(within(colours).getByText(OTHER.name.en)).toBeTruthy()
    expect(within(colours).queryByText('kid code')).toBeNull()
  })

  /**
   * The machine row says its answer in words. The colours row SHOWS its
   * answer: the palette a child is wearing, as the same 2x2 chip every row of
   * the picker draws — a name an adult chose (`everforest`) tells a
   * six-year-old nothing that four colours do not tell them better.
   */
  it('shows the current machine and palette without opening either', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const top = await openSettings(u)
    expect(within(top).getByRole('menuitem', { name: /machines/i }).textContent)
      .toContain('kidtari')
    const row = within(top).getByRole('menuitem', { name: /colours/i })
    const chips = [...row.querySelectorAll('.kb-swatch > i')]
      .map((el) => (el as HTMLElement).style.background)
    expect(chips).toHaveLength(4)
    // jsdom serializes a colour back as `rgb()`, so the hex has to be taken
    // there too rather than compared as the string that was written.
    expect(chips).toContain(rgb(BOOT.palette.accent))
  })

  /** The rows on the menu that open them, for a tablet with no keyboard. */
  it('opens the colours list from the settings menu too', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const top = await openSettings(u)
    await u.click(within(top).getByRole('menuitem', { name: /colours/i }))
    expect(container.querySelector('[data-kb-picker]')).toBeTruthy()
    expect(screen.getByRole('listbox').textContent).toContain(OTHER.name.en)
  })

  it('opens the machines list from the settings menu too', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const top = await openSettings(u)
    await u.click(within(top).getByRole('menuitem', { name: /machines/i }))
    expect(container.querySelector('[data-kb-picker]')).toBeTruthy()
    expect(screen.getByRole('listbox').textContent).toContain('kid code')
  })

  it('switches the whole terminal to Hebrew from the language menu', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const langs = await sub(u, 'language')
    await u.click(within(langs).getByText('עברית'))
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy()

    /**
     * THE PROMPT IS THE PROOF, and it is the fix for a real complaint: the
     * Kidtari said `READY` in a Hebrew session and its input box took text
     * left-to-right, so a child who reads Hebrew was shown a Latin word they
     * cannot read at the exact spot they are asked to type, with the caret at
     * the wrong end of the line.
     *
     * `READY` is a WORD, so it is translated. `?`, `>` and `❯` are symbols and
     * repeat — see `systems.test.ts`.
     */
    expect(container.querySelector('[data-kb-prompt]')?.textContent).toBe('מוכן')
    expect(screen.getByRole('textbox').getAttribute('dir')).toBe('rtl')
  })

  it('never steals focus from the terminal when the menu is opened by pointer', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const box = screen.getByRole('textbox')
    box.focus()
    await openSettings(u)
    expect(document.activeElement).toBe(box)
  })

  // The terminal refocuses its input on any click. A click on the menu is not
  // a click on the terminal, or the menu would close itself.
  it('stays open when a row inside it is clicked', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    await sub(u, 'language')
    expect(screen.getAllByRole('menu').length).toBeGreaterThan(1)
  })

  it('still refocuses the input when the window bar around it is clicked', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const box = screen.getByRole('textbox')
    box.blur()
    await u.click(container.querySelector('[data-kb-titlebar]')!)
    expect(document.activeElement).toBe(box)
  })

  it('shows no error state in either language, whatever is opened', async () => {
    const u = userEvent.setup()
    const clean = (container: HTMLElement, what: string) => {
      const text = container.textContent?.toLowerCase() ?? ''
      for (const bad of ['error', 'undefined', 'null', 'nan', 'not found']) {
        expect(text, `${what}: ${bad}`).not.toContain(bad)
      }
    }
    for (const name of ['language', 'carts']) {
      const { container, unmount } = render(<Kidboard />)
      await sub(u, name)
      clean(container, name)
      unmount()
    }
    // The three lists, which are not menus.
    for (const open of [ctrlCtrl, altAlt, async (uu: typeof u) => {
      await uu.keyboard(twice('Shift'))
    }]) {
      const { container, unmount } = render(<Kidboard />)
      await open(u)
      clean(container, 'picker')
      unmount()
    }
  })
})

/**
 * THE GAME PICKER. Shift, Shift.
 *
 * Choosing what to play is not a setting, so it is not a dropdown filed next
 * to the language: it is a list the machine opens in the middle of the screen,
 * the way every terminal tool a grown-up uses opens its own. The settings menu
 * keeps one row that opens it, for a tablet with no keyboard at all.
 */
describe('the game picker', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  const shiftShift = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.keyboard('{Shift>}{/Shift}{Shift>}{/Shift}')
  }

  it('opens on a double tap of shift, and closes on escape', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await shiftShift(u)
    expect(container.querySelector('[data-kb-picker]')).toBeTruthy()
    await u.keyboard('{Escape}')
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  /**
   * Shift types nothing, so a child holding it for a capital letter cannot
   * summon this — only two taps inside the window do.
   */
  it('does not open on one shift', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard('{Shift>}{/Shift}')
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  it('lists games to start, never things you say', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await shiftShift(u)
    const list = container.querySelector('[data-kb-picker]')!
    expect(within(list as HTMLElement).getByText('story')).toBeTruthy()
    // `help` and `greet` are things you SAY, not things you start.
    expect(within(list as HTMLElement).queryByText('help')).toBeNull()
  })

  it('starts the game the arrows land on', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await shiftShift(u)
    await u.click(within(
      container.querySelector('[data-kb-picker]') as HTMLElement,
    ).getByText('story'))
    // `story` is a turn cartridge: it talks, and the cartridge label appears.
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
    expect(container.querySelector('[data-kb-label]')?.textContent).toContain('done')
  })

  it('is also reachable from the settings menu, for a tablet with no keys', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    const top = await openSettings(u)
    await u.click(within(top).getByRole('menuitem', { name: /games/i }))
    expect(container.querySelector('[data-kb-picker]')).toBeTruthy()
  })
})

/**
 * THE COLOUR PICKER. Ctrl, Ctrl.
 *
 * The same gesture as the games and the same box, because they are the same
 * kind of question: which one? Colour is the thing a six-year-old changes most
 * often and the one they change for fun, and it used to be a submenu of
 * twenty-two names hanging off a title bar.
 */
describe('the colours picker', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  const ctrl = '{Control>}{/Control}'

  it('opens on a double tap of ctrl, and closes on escape', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(ctrl + ctrl)
    const box = container.querySelector('[data-kb-picker]')!
    expect(box).toBeTruthy()
    expect(box.textContent).toContain(OTHER.name.en)
    await u.keyboard('{Escape}')
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  it('does not open on one ctrl', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(ctrl)
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  /**
   * A KEY IN BETWEEN BREAKS THE RUN, and this is the whole reason a double tap
   * is safe to give a modifier: a grown-up pressing Ctrl+C and then Ctrl+V has
   * pressed Control twice inside the window, and a child holding Shift for two
   * capitals in a row has pressed Shift twice. Neither asked for a list.
   */
  it('is not summoned by two taps with something typed between them', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard('{Control>}c{/Control}{Control>}v{/Control}')
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  it('applies the palette it is given and closes, like the game list', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(ctrl + ctrl)
    await u.click(within(
      container.querySelector('[data-kb-picker]') as HTMLElement,
    ).getByText(OTHER.name.en))
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
    expect(root(container).style.getPropertyValue('--kb-bg'))
      .toBe(OTHER.palette.background)
  })

  /** One box in the middle of the screen, never two. */
  it('replaces the game list rather than stacking on it', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard('{Shift>}{/Shift}{Shift>}{/Shift}')
    await u.keyboard(ctrl + ctrl)
    expect(container.querySelectorAll('[data-kb-picker]')).toHaveLength(1)
    expect(container.querySelector('[data-kb-picker]')!.textContent)
      .toContain(OTHER.name.en)
  })

  /** The same gesture that opened it puts it away. */
  it('closes on a second double tap', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(ctrl + ctrl)
    await u.keyboard(ctrl + ctrl)
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })
})

/**
 * THE MACHINE PICKER. Option, Option.
 *
 * The third of the same list, and the last. A machine is not a preference: it
 * is which computer you are sitting at, and everything from the typeface to
 * what happens when a game starts changes with it.
 */
describe('the machines picker', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  const alt = '{Alt>}{/Alt}'

  it('opens on a double tap of option, and closes on escape', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(alt + alt)
    const box = container.querySelector('[data-kb-picker]')!
    expect(box).toBeTruthy()
    expect(box.textContent).toContain('kid code')
    await u.keyboard('{Escape}')
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  it('does not open on one option', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(alt)
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
  })

  it('lists every machine and marks the one you are on', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(alt + alt)
    const box = container.querySelector('[data-kb-picker]') as HTMLElement
    expect([...box.querySelectorAll('.kb-picker-word')].map((e) => e.textContent))
      .toEqual(['kidtari', 'kid code', 'crt / logo', 'omarchy'])
    // It opens on the machine you are on, so the next one along is one press.
    expect(box.querySelector('[data-kb-active="true"] .kb-picker-word')!.textContent)
      .toBe('kidtari')
    expect(box.querySelectorAll('.kb-picker-check')).toHaveLength(1)
  })

  it('switches the whole machine — palette, typeface and all — and closes', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(alt + alt)
    await u.click(within(
      container.querySelector('[data-kb-picker]') as HTMLElement,
    ).getByText('crt / logo'))
    expect(container.querySelector('[data-kb-picker]')).toBeNull()
    const el = root(container)
    expect(el.getAttribute('data-kb-system')).toBe('crt')
    expect(el.style.getPropertyValue('--kb-bg'))
      .toBe(themeById('crt-p1-green')!.palette.background)
    expect(el.style.getPropertyValue('--kb-font')).toContain('VT323')
    expect(localStorage.getItem('kb.system')).toBe('crt')
  })

  /** One box in the middle of the screen, never two. */
  it('replaces whichever list was up rather than stacking on it', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.keyboard(twice('Shift'))
    await u.keyboard(alt + alt)
    expect(container.querySelectorAll('[data-kb-picker]')).toHaveLength(1)
    expect(container.querySelector('[data-kb-picker]')!.textContent)
      .toContain('kid code')
  })

  /**
   * The box reads the child's way; the machine NAMES stay as they are, which
   * is the rule in `systems/strings.ts`: `kidtari` and `omarchy` are proper
   * names of real things, and Hebrew writes those in Latin.
   */
  it('reads right to left in Hebrew, with the names left as names', async () => {
    const u = userEvent.setup()
    localStorage.setItem('kb.locale', 'he')
    const { container } = render(<Kidboard />)
    await u.keyboard(alt + alt)
    const box = container.querySelector('[data-kb-picker]')!
    expect(box.getAttribute('dir')).toBe('rtl')
    expect(box.querySelector('.kb-picker-title')!.textContent).toBe('בחרו מכונה')
    expect(box.textContent).toContain('kid code')
  })
})

/**
 * SWITCHING MACHINE, end to end through the settings menu — the one path a
 * child actually has. These are integration tests on purpose: every piece
 * below is unit-tested somewhere (`systems/store.test.ts`), and the thing that
 * can still be wrong is the wiring between them.
 */
/**
 * THE FONT SEAM, GUARDED IN THE STYLESHEET ITSELF.
 *
 * A `var()` here shipped the whole playground in a proportional sans with
 * 1482 tests green, because jsdom computes no fonts and neither failure is
 * visible to it. Both are visible in the CSS text, so that is where they are
 * caught.
 */
describe('the machine typeface actually reaches the page', () => {
  const CSS = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')

  it('keeps `--font-kb-mono` a literal Tailwind can serialize', () => {
    const decl = CSS.match(/--font-kb-mono:[^;]*;/)![0]
    // Tailwind v4 cannot resolve a `@theme` entry whose value is a `var()`
    // reference: it emits no custom property at all, and every reader of it
    // silently falls back to the inherited body font.
    expect(decl).not.toContain('var(')
    expect(decl).toContain('monospace')
  })

  it('applies the machine seam in real font-family declarations, not in a token', () => {
    // A `var()` inside a CUSTOM PROPERTY resolves where that property is
    // declared. `--kb-font` lives on the Kidboard frame; a token on `:root`
    // would never see it. These do, because they resolve per element.
    const decl = (sel: string): string => {
      const rule = CSS.slice(CSS.indexOf(`${sel} {`))
      return rule.slice(0, rule.indexOf('\n}'))
    }
    expect(decl('.kb-frame')).toMatch(/font-family:\s*var\(--kb-font,/)
    // A DRAWING reads a different property, and that is the whole point of
    // it: `--kb-art-font` is the machine's face only when the face can hold a
    // grid. See `SystemFont.monospaced`.
    expect(decl('.kb-art')).toMatch(/font-family:\s*var\(--kb-art-font,/)
  })

  it('sets a drawing in the machine typeface only when it is monospaced', () => {
    // Silkscreen and VT323 give `0`, `M` and a space three different widths
    // and have no box-drawing glyphs, so a character grid set in either comes
    // out ragged — dashed borders, emoji off their columns, and under Hebrew
    // the look of a drawing that has been left-aligned. Measured in Chrome;
    // the flag is what the CSS reads, so a wrong one here is a broken grid.
    const mono = Object.fromEntries(
      SYSTEMS.map((s) => [s.id, s.font.monospaced]))
    expect(mono).toEqual({
      kidtari: false, crt: false, kidcode: true, omarchy: true,
    })
  })

  it('hands a drawing the shared monospace on a machine whose face is not one', () => {
    const { container } = render(<Kidboard />)
    const el = root(container)
    expect(el.style.getPropertyValue('--kb-font')).toBe(KIDTARI.font.stack)
    expect(el.style.getPropertyValue('--kb-art-font')).toBe(MONO_STACK)
  })

  it('sends a real font stack across, never a var() that the build can drop', () => {
    // `--font-kb-mono` is an `@theme` entry, and Tailwind v4 emits one of
    // those only when a generated utility uses it. Nothing uses this one as a
    // utility — it is read from hand-written CSS — so it is absent from
    // `dist`, and every `var(--font-kb-mono)` read in production resolved to
    // nothing and fell through to the inherited font. That is how a drawing
    // on the Kidtari stayed in Silkscreen after being told not to be.
    const { container } = render(<Kidboard />)
    expect(root(container).style.getPropertyValue('--kb-art-font'))
      .not.toContain('var(')
    expect(MONO_STACK).toContain('monospace')
  })
})

describe('picking a machine', () => {
  beforeEach(() => {
    localStorage.clear()
    setScheme(true)
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'matchMedia'))

  const pick = async (name: string) => {
    const u = userEvent.setup()
    const r = render(<Kidboard />)
    const machines = await altAlt(u)
    await u.click(within(machines).getByText(name))
    return r
  }

  it('changes the machine, its palette and its typeface together', async () => {
    const { container } = await pick('crt / logo')
    const el = root(container)
    const green = themeById('crt-p1-green')!
    expect(el.getAttribute('data-kb-system')).toBe('crt')
    expect(el.style.getPropertyValue('--kb-bg')).toBe(green.palette.background)
    expect(el.style.getPropertyValue('--kb-font')).toContain('VT323')
  })

  it('persists BOTH keys, so the child comes back to the machine they left', async () => {
    await pick('omarchy')
    expect(localStorage.getItem('kb.system')).toBe('omarchy')
    expect(localStorage.getItem('kb.theme')).toBe('hackerman')
  })

  /**
   * A switch is immediate and clears nothing. The Kidtari's own rule
   * — that a game ENDING wipes the transcript — is a different rule, and it
   * arrives on its own schedule rather than being smuggled in by a switch.
   */
  it('does not clear what was already said', async () => {
    const u = userEvent.setup()
    const { container } = render(<Kidboard />)
    await u.type(screen.getByRole('textbox'), 'wombat{Enter}')
    expect(container.textContent).toContain('wombat')
    const machines = await altAlt(u)
    await u.click(within(machines).getByText('kid code'))
    expect(container.textContent).toContain('wombat')
  })

  it('offers only the new machine\'s palettes once it has switched', async () => {
    const u = userEvent.setup()
    render(<Kidboard />)
    const machines = await altAlt(u)
    await u.click(within(machines).getByText('kid code'))
    const menu = await ctrlCtrl(u)
    expect(within(menu).getByText('dark')).toBeTruthy()
    // A phosphor is not a choice you can make on Kid Code.
    expect(within(menu).queryByText('P3 amber')).toBeNull()
  })

  /**
   * The machine is read during the FIRST render, exactly like the locale and
   * the mute flag: a returning child must never see one frame of the wrong
   * machine any more than one frame of the wrong language.
   */
  it('boots straight into a stored machine, with no flash of the default', () => {
    localStorage.setItem('kb.system', 'omarchy')
    localStorage.setItem('kb.theme', 'nord')
    const { container } = render(<Kidboard />)
    const el = root(container)
    expect(el.getAttribute('data-kb-system')).toBe('omarchy')
    expect(el.style.getPropertyValue('--kb-bg'))
      .toBe(themeById('nord')!.palette.background)
  })

  it('repairs a stored pair that no longer makes sense, rather than breaking', () => {
    localStorage.setItem('kb.system', 'crt')
    localStorage.setItem('kb.theme', 'hackerman')   // omarchy's, not a phosphor
    const { container } = render(<Kidboard />)
    const el = root(container)
    expect(el.getAttribute('data-kb-system')).toBe('crt')
    expect(el.style.getPropertyValue('--kb-bg'))
      .toBe(themeById('crt-p1-green')!.palette.background)
  })
})
