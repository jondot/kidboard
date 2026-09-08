import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OmarchyShell } from './omarchy'
import type { ShellProps } from '../Shell'
import { OMARCHY } from '../systems'
import { ThemeContext } from '../../theme/context'
import { GALLERY } from '../../theme/gallery'
import { toVars } from '../../theme/palette'
import { contrast } from '../../theme/color'
import { makeFrameChannel } from '../../runtime/frameChannel'
import { makeT } from '../../i18n/locale'
import { SYSTEM_STRINGS } from '../strings'
import type { Block, Hint, Locale } from '../../types'

const CSS = readFileSync(
  join(process.cwd(), 'src/systems/shells/omarchy.css'),
  'utf8',
)
const TSX = readFileSync(
  join(process.cwd(), 'src/systems/shells/omarchy.tsx'),
  'utf8',
)

const game = (state: 'running' | 'frozen'): Block => ({
  id: 'g', kind: 'live', cartridgeId: 'ball', title: 'bounce', state,
  frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
  souvenir: '',
})

const said = (id: string, text: string): Block => ({
  id, kind: 'static', spec: { kind: 'text', text },
})

const props = (over: Partial<ShellProps> = {}): ShellProps => ({
  system: OMARCHY,
  locale: 'en' as Locale,
  dir: 'ltr',
  t: makeT('en', SYSTEM_STRINGS),
  blocks: [],
  channel: makeFrameChannel(),
  hints: [],
  liveTitle: null,
  busy: false,
  isLive: false,
  input: <textarea data-test-input="" readOnly value="" />,
  scrollRef: () => {},
  contentRef: () => {},
  ...over,
})

const live: Partial<ShellProps> = {
  isLive: true,
  busy: true,
  blocks: [said('a', 'hello!'), game('running')],
  liveTitle: 'bounce',
  hints: [{ keys: '← →', label: 'move' }, { keys: 'ESC', label: 'done' }] as Hint[],
}

/**
 * The sheet with its comments removed.
 *
 * Every "this file must not contain X" test below reads THIS, not the raw
 * text: the comments explain at length what was deleted and why, and naming
 * `clip-path` in the sentence that says the powerline segments are gone would
 * otherwise fail the test that proves they are.
 */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

const HINTS: Hint[] = [{ keys: '← →', label: 'move' }, { keys: 'ESC', label: 'done' }]

beforeEach(() => {
  localStorage.clear()
})

describe('the Omarchy machine', () => {
  /**
   * A GAME OPENS A SECOND WINDOW, and the compositor tiles the two.
   *
   * The other three machines have one window and put a game somewhere inside
   * it. This one has a window MANAGER, so a game is not a pane in your
   * terminal — it is a neighbour beside it, with its own border, its own title
   * bar and its own focus ring. ESC closes it and the terminal goes fullscreen
   * again.
   */
  describe('a game opens a second tiled window', () => {
    const tile = (c: HTMLElement, which: 'terminal' | 'game') =>
      c.querySelector(`[data-kb-window-tile="${which}"]`)

    it('gives the terminal chrome of its own, in a game and out of one', () => {
      for (const over of [{}, live]) {
        const { container } = render(<OmarchyShell {...props(over)} />)
        const term = tile(container, 'terminal')!
        expect(term).toBeTruthy()
        // A compositor does not grow a title bar onto a window the moment a
        // second one appears; it was always there.
        //
        // And it names the APPLICATION, never the machine. It said `omarchy`
        // — the name of the whole computer, printed on the title bar of one
        // window inside it, which is a thing no compositor has ever done.
        expect(term.querySelector('[data-kb-pane-title]')!.textContent)
          .toContain('terminal')
      }
    })

    /** And in Hebrew it is a Hebrew word, like every other string on screen. */
    it("names the terminal window in the child's own language", () => {
      const { container } = render(
        <OmarchyShell {...props({ locale: 'he' as Locale, dir: 'rtl' })} />,
      )
      const title = tile(container, 'terminal')!
        .querySelector('[data-kb-pane-title]')!
      expect(title.textContent).toBe('מסוף')
    })

    it('tiles exactly one window when idle and two in a game', () => {
      const idle = render(<OmarchyShell {...props()} />)
      expect(idle.container.querySelectorAll('[data-kb-window-tile]')).toHaveLength(1)
      const playing = render(<OmarchyShell {...props(live)} />)
      expect(playing.container.querySelectorAll('[data-kb-window-tile]')).toHaveLength(2)
    })

    /**
     * The accent border is the one thing every compositor on earth draws, and
     * the only way a child can tell which window their keys are going to. A
     * running cartridge owns every key, so "the game window is focused" is a
     * statement of fact rather than a decoration.
     */
    it('marks exactly one window focused, and it is the one taking keys', () => {
      const idle = render(<OmarchyShell {...props()} />)
      expect(idle.container.querySelectorAll('[data-kb-focused="true"]')).toHaveLength(1)
      expect(tile(idle.container, 'terminal')!.querySelector('[data-kb-focused="true"]'))
        .toBeTruthy()

      const playing = render(<OmarchyShell {...props(live)} />)
      expect(playing.container.querySelectorAll('[data-kb-focused="true"]'))
        .toHaveLength(1)
      expect(tile(playing.container, 'game')!.querySelector('[data-kb-focused="true"]'))
        .toBeTruthy()
    })

    /** Both windows get the SAME frame. That is the entire point. */
    it('draws both windows with one frame, never two kinds', () => {
      const { container } = render(<OmarchyShell {...props(live)} />)
      for (const which of ['terminal', 'game'] as const) {
        const t = tile(container, which)!
        expect(t.classList.contains('kb-omarchy-tile'), which).toBe(true)
        expect(t.querySelector('.kb-omarchy-title'), which).toBeTruthy()
      }
    })

    /** `dwindle` splits along the longer axis, so this asks its own width. */
    it('splits along the longer axis, measured on itself and not the screen', () => {
      expect(CODE).toContain('container-type')
      expect(CODE).toMatch(/@container[^{]*min-width/)
      // A media query would ask the BROWSER how wide it is; Kidboard is
      // embeddable and may have been given a column of somebody's page.
      expect(CODE).not.toMatch(/@media[^{]*\bwidth\b/)
    })

    it('paints the running game in its own window and nowhere else', () => {
      const { container } = render(<OmarchyShell {...props(live)} />)
      const pane = container.querySelector('[data-kb-pane]')!
      expect(pane.querySelector('[data-kb-game="running"]')).toBeTruthy()
      expect(container.querySelectorAll('[data-kb-game]')).toHaveLength(1)
      expect(
        container.querySelector('[data-kb-transcript] [data-kb-game]'),
      ).toBeNull()
    })

    it('titles the game window with the cartridge name', () => {
      const { container } = render(<OmarchyShell {...props(live)} />)
      const title = container
        .querySelector('[data-kb-window-tile="game"] [data-kb-pane-title]')!
      expect(title.textContent).toContain('bounce')
    })

    it('opens the game window AFTER the terminal, which stays', () => {
      const { container } = render(<OmarchyShell {...props(live)} />)
      const transcript = container.querySelector('[data-kb-transcript]')!
      const pane = container.querySelector('[data-kb-pane]')!
      expect(transcript.compareDocumentPosition(pane))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      // The transcript is still there, with everything already said in it.
      expect(transcript.textContent).toContain('hello!')
      expect(container.querySelector('[data-test-input]')).toBeTruthy()
    })

    it('closes the game window when the game ends, leaving the still behind', () => {
      const { container } = render(
        <OmarchyShell
          {...props({ blocks: [said('a', 'hello!'), game('frozen')] })}
        />,
      )
      expect(container.querySelector('[data-kb-pane]')).toBeNull()
      expect(
        container.querySelector('[data-kb-transcript] [data-kb-game="frozen"]'),
      ).toBeTruthy()
      expect(container.querySelector('[data-kb-transcript]')!.textContent)
        .toContain('hello!')
    })

    it('shows no second window when nothing is running', () => {
      const { container } = render(<OmarchyShell {...props()} />)
      expect(container.querySelector('[data-kb-pane]')).toBeNull()
    })
  })

  /**
   * `helpAt: 'statusBar'`, `chrome.statusBar: true`. The segments carry, in
   * order: the machine, the theme, the locale, the mute state, and then the
   * running cartridge's hints.
   */
  /**
   * TWO WHOLE SECTIONS WERE DELETED FROM THIS MACHINE, and these are the tests
   * that keep them deleted. What replaced twenty-odd assertions about segments
   * and sun discs is four about their absence, which is the honest exchange:
   * there is much less to be right about now.
   */
  describe('the bottom status bar is gone', () => {
    /**
     * It was a powerline strip along the foot: five angled segments naming the
     * machine, the palette, the language, the sound and the running game's
     * keys. The first four are all answered by the settings menu whenever a
     * child asks — permanently restating them in a bar a child never reads
     * cost the bottom of every screen — and the fifth belongs beside the game.
     */
    it('draws no status bar, in a game or out of one', () => {
      for (const over of [{}, live]) {
        const { container } = render(<OmarchyShell {...props(over)} />)
        expect(container.querySelector('[data-kb-statusbar]')).toBeNull()
      }
      expect(TSX).not.toContain('data-kb-statusbar')
      expect(CODE).not.toContain('clip-path')
    })

    /**
     * `helpAt: 'paneTitle'`. The keys went onto the title of the pane the game
     * is running in — beside the game rather than under the page, and only
     * while there is a game.
     */
    it('puts the running game keys on the game window\'s own title bar', () => {
      const { container } = render(
        <OmarchyShell {...props({ ...live, hints: HINTS }) } />,
      )
      const title = container
        .querySelector('[data-kb-window-tile="game"] [data-kb-pane-title]')!
      expect(title.querySelector('[data-kb-hints]')).toBeTruthy()
      expect(title.textContent).toContain('← →')
      expect(title.textContent).toContain('move')
      // The cartridge's own name is still on it, first.
      expect(title.textContent).toContain('bounce')
    })

    it('shows no keys at all when nothing is running', () => {
      const { container } = render(<OmarchyShell {...props({ hints: HINTS })} />)
      expect(container.querySelector('[data-kb-hints]')).toBeNull()
    })

    /**
     * `← →` is a PICTURE OF TWO KEYS, not prose: it means the same two keys on
     * the same keyboard in both languages, so it never mirrors. The row around
     * it sets no direction of its own, so under Hebrew it starts from the
     * other end along with the rest of the frame.
     */
    it('keeps the key glyphs left-to-right under Hebrew', () => {
      const { container } = render(
        <OmarchyShell {...props({ ...live, hints: HINTS, dir: 'rtl', locale: 'he' as Locale })} />,
      )
      const keys = container.querySelector('.kb-omarchy-key')!
      expect(keys.getAttribute('dir')).toBe('ltr')
      expect(container.querySelector('[data-kb-pane-title]')!.getAttribute('dir'))
        .toBeNull()
    })
  })

  describe('the synthwave backdrop is gone', () => {
    /**
     * A CSS horizon: a perspective wireframe grid running to a horizon line, a
     * glowing disc of sun sitting on it, and an opt-in animation drifting the
     * grid toward the viewer. Two hundred lines of invented scenery wearing a
     * real project's name — Omarchy is a Linux setup, not a retrowave album
     * cover — drawn underneath every line a six-year-old was reading.
     */
    it('draws no backdrop, and no longer knows how to', () => {
      const { container } = render(<OmarchyShell {...props()} />)
      expect(container.querySelector('[data-kb-backdrop]')).toBeNull()
      expect(TSX).not.toContain('Horizon')
      for (const banned of ['perspective(', 'linear-gradient', 'radial-gradient']) {
        expect(CODE, `omarchy.css still draws with ${banned}`).not.toContain(banned)
      }
    })

    /** Nothing on this machine moves, so there is no motion left to gate. */
    it('declares no animation at all', () => {
      expect(CODE).not.toMatch(/@keyframes|\banimation(?:-name)?\s*:/)
    })
  })

  /**
   * A palette must reach every colour this machine paints. Still true, and
   * still the reason there is not one literal colour in the sheet — there are
   * 22 palettes here and it has to be all of them.
   */
  it('invents no colour of its own', () => {
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CODE).not.toMatch(/\b(?:rgba?|hsla?|oklch|lab)\(/)
    expect(CSS).toContain('var(--kb-')
  })

  /**
   * `Terminal` observes both boxes — the scroll box for its width (the column
   * count a game is handed) and the content for its height (a canvas learns
   * how tall it is a frame or more after React commits it). A shell that
   * attaches neither, or attaches one twice, silently breaks the
   * follow-the-bottom behaviour.
   */
  describe('the two refs', () => {
    for (const [name, over] of [['idle', {}], ['in a game', live]] as const) {
      it(`attaches both, exactly once, ${name}`, () => {
        const scrolls: (HTMLElement | null)[] = []
        const contents: (HTMLElement | null)[] = []
        render(
          <OmarchyShell
            {...props({
              ...over,
              scrollRef: (el) => { scrolls.push(el) },
              contentRef: (el) => { contents.push(el) },
            })}
          />,
        )
        expect(scrolls.filter(Boolean)).toHaveLength(1)
        expect(contents.filter(Boolean)).toHaveLength(1)
        expect(scrolls[0]!.contains(contents[0]!)).toBe(true)
      })
    }
  })

  it('marks itself as the omarchy shell', () => {
    const { container } = render(<OmarchyShell {...props()} />)
    expect(container.querySelector('[data-kb-shell="omarchy"]')).toBeTruthy()
  })
})

/**
 * The bar re-tints with all 22 palettes, so its ink must clear WCAG AA on
 * every ramp step it is ever drawn on — `--kb-raised` included, which
 * `toVars` does not itself guard (it walks text through bg, panel and
 * surface only). Measured rather than assumed: this is the test that says a
 * segment palette chosen for `hackerman` is also readable in `white`.
 */
describe('the status bar is readable in all 22 themes', () => {
  const INK_ON: [ink: string, ground: string][] = [
    ['--kb-bg', '--kb-accent'],
    ['--kb-plain', '--kb-panel'],
    ['--kb-plain', '--kb-raised'],
    ['--kb-dim', '--kb-raised'],
    ['--kb-dim', '--kb-surface'],
    ['--kb-accent', '--kb-surface'],
    ['--kb-plain', '--kb-surface'],
  ]

  for (const th of GALLERY) {
    it(`${th.id}`, () => {
      const v = toVars(th.palette)
      for (const [ink, ground] of INK_ON) {
        expect(contrast(v[ink]!, v[ground]!), `${ink} on ${ground}`)
          .toBeGreaterThanOrEqual(4.5)
      }
      // The separators are the only thing between two ramp steps that a
      // theme may have left identical, so they are held to the non-text
      // floor against every ground they cross.
      for (const ground of ['--kb-bg', '--kb-surface', '--kb-panel', '--kb-raised']) {
        expect(contrast(v['--kb-border']!, v[ground]!), `border on ${ground}`)
          .toBeGreaterThanOrEqual(3)
      }
    })
  }
})
