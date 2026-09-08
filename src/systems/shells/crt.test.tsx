import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CrtShell } from './crt'
import type { ShellProps } from '../Shell'
import { CRT } from '../systems'
import { makeFrameChannel } from '../../runtime/frameChannel'
import { makeT } from '../../i18n/locale'
import { EMPTY_FRAME, type Block, type Hint, type Locale } from '../../types'

const CSS = readFileSync(
  join(process.cwd(), 'src/systems/shells/crt.css'),
  'utf8',
)
const TSX = readFileSync(
  join(process.cwd(), 'src/systems/shells/crt.tsx'),
  'utf8',
)

const game = (state: 'running' | 'frozen'): Block => ({
  id: 'g', kind: 'live', cartridgeId: 'ball', title: 'bounce', state,
  frame: state === 'frozen'
    ? { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 }
    // A RUNNING block's frames never pass through the transcript; they arrive
    // on the channel. Its own `frame` is empty, exactly as `mount` leaves it.
    : EMPTY_FRAME,
  souvenir: '',
})

/** What the reducer leaves behind once anything new is said: no frame at all. */
const collapsed = (): Block => ({
  ...(game('frozen') as Extract<Block, { kind: 'live' }>),
  state: 'collapsed',
  frame: EMPTY_FRAME,
  souvenir: 'nice one',
})

const said = (text: string): Block =>
  ({ id: `s-${text}`, kind: 'static', spec: { kind: 'text', text } })

const props = (over: Partial<ShellProps> = {}): ShellProps => ({
  system: CRT,
  locale: 'en' as Locale,
  dir: 'ltr',
  t: makeT('en'),
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

const playing: Partial<ShellProps> = {
  isLive: true,
  busy: true,
  blocks: [game('running')],
  liveTitle: 'bounce',
  hints: [{ keys: '← →', label: 'move' }, { keys: 'ESC', label: 'done' }] as Hint[],
}

const field = (c: HTMLElement) => c.querySelector('[data-kb-field]')!
const command = (c: HTMLElement) => c.querySelector('[data-kb-command]')!

describe('the CRT / Logo machine', () => {
  /**
   * `scrollback: 'surface'`. Not a transcript that runs forever — one screen,
   * split, and the page itself never moves.
   */
  describe('one surface', () => {
    it('is a field and a command area, and nothing else scrolls', () => {
      const { container } = render(<CrtShell {...props()} />)
      expect(field(container)).toBeTruthy()
      expect(command(container)).toBeTruthy()
      // The field is never inside the thing that scrolls.
      expect(command(container).contains(field(container))).toBe(false)
    })

    it('says which machine it is', () => {
      const { container } = render(<CrtShell {...props()} />)
      expect(container.querySelector('[data-kb-shell="crt"]')).toBeTruthy()
    })

    it('keeps the command line: it is the only way to say anything', () => {
      const { container } = render(<CrtShell {...props()} />)
      expect(container.querySelector('[data-test-input]')).toBeTruthy()
    })

    it('shows a warm empty screen on a cold start, not a missing element', () => {
      const { container } = render(<CrtShell {...props()} />)
      expect(field(container)).toBeTruthy()
      expect(field(container).querySelector('[data-kb-game]')).toBeNull()
      const text = (container.textContent ?? '').toLowerCase()
      for (const bad of ['coming soon', 'not implemented', 'todo', 'placeholder']) {
        expect(text).not.toContain(bad)
      }
    })

    /**
     * `Terminal` observes the scroll box for its width and the content for its
     * height, and drives them to the bottom. On this machine that must follow
     * the COMMAND LINES: a follow-the-bottom pointed at the field would chase
     * a canvas that is not scrolling anywhere.
     */
    describe('the two refs', () => {
      for (const [name, over] of [['idle', {}], ['in a game', playing]] as const) {
        it(`attaches both to the command area, exactly once, ${name}`, () => {
          const scrolls: (HTMLElement | null)[] = []
          const contents: (HTMLElement | null)[] = []
          const { container } = render(
            <CrtShell
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
          expect(scrolls[0]).toBe(command(container))
          expect(scrolls[0]!.contains(field(container))).toBe(false)
        })
      }
    })
  })

  /** `gameEntry: 'field'`. The game draws upstairs; the prompt stays put. */
  describe('a game draws in the field', () => {
    it('paints the running game in the field', () => {
      const { container } = render(<CrtShell {...props(playing)} />)
      expect(field(container).querySelector('[data-kb-game="running"]')).toBeTruthy()
    })

    it('does not paint it a second time in the command area', () => {
      const { container } = render(<CrtShell {...props(playing)} />)
      expect(command(container).querySelector('[data-kb-game]')).toBeNull()
    })

    it('leaves the prompt where it was — the child can still see it', () => {
      const { container } = render(<CrtShell {...props(playing)} />)
      expect(command(container).querySelector('[data-test-input]')).toBeTruthy()
    })

    it('keeps what was already said, in the command area', () => {
      const { container } = render(
        <CrtShell {...props({ ...playing, blocks: [said('hello'), game('running')] })} />,
      )
      expect(command(container).textContent).toContain('hello')
    })
  })

  /**
   * A P1 phosphor had long persistence. What you drew STAYS GLOWING — which is
   * this machine's whole difference from a scrollback, and the reason the
   * still cannot simply be read off the transcript: the reducer empties a
   * frozen block's frame the moment anything else is said.
   */
  describe('the field keeps its last picture', () => {
    it('shows the still the moment a game ends', () => {
      const { container } = render(<CrtShell {...props({ blocks: [game('frozen')] })} />)
      expect(field(container).querySelector('[data-kb-game="frozen"]')).toBeTruthy()
    })

    it('files the finished game in the command area as a line, not a canvas', () => {
      const { container } = render(<CrtShell {...props({ blocks: [game('frozen')] })} />)
      expect(command(container).querySelector('[data-kb-game]')).toBeNull()
      expect(command(container).textContent).toContain('bounce')
    })

    it('goes on glowing after the block collapses and its frame is gone', () => {
      const { container, rerender } = render(
        <CrtShell {...props({ blocks: [game('frozen')] })} />,
      )
      rerender(<CrtShell {...props({ blocks: [collapsed(), said('ok')] })} />)
      expect(field(container).querySelector('[data-kb-game]')).toBeTruthy()
    })

    it('is wiped by a cleared screen, and only by that', () => {
      const { container, rerender } = render(
        <CrtShell {...props({ blocks: [game('frozen')] })} />,
      )
      rerender(<CrtShell {...props({ blocks: [] })} />)
      expect(field(container).querySelector('[data-kb-game]')).toBeNull()
    })

    it('gives the field to the new game when one starts', () => {
      const { container, rerender } = render(
        <CrtShell {...props({ blocks: [game('frozen')] })} />,
      )
      rerender(<CrtShell {...props(playing)} />)
      expect(field(container).querySelectorAll('[data-kb-game]')).toHaveLength(1)
      expect(field(container).querySelector('[data-kb-game="running"]')).toBeTruthy()
    })
  })

  /** `helpAt: 'onScreen'`. A strip on the tube, not a bar under the page. */
  describe('help is on the screen', () => {
    it('draws the running cartridge\'s hints at the foot of the field', () => {
      const { container } = render(<CrtShell {...props(playing)} />)
      const hints = field(container).querySelector('[data-kb-hints]')!
      expect(hints.textContent).toContain('← →')
      expect(hints.textContent).toContain('move')
      expect(hints.textContent).toContain('ESC')
      expect(container.querySelector('[data-kb-bar]')).toBeNull()
      // Below the picture, at the bottom edge of the field.
      expect(hints.compareDocumentPosition(container.querySelector('[data-kb-game]')!))
        .toBe(Node.DOCUMENT_POSITION_PRECEDING)
    })

    it('shows no strip at all when nothing is running', () => {
      for (const over of [{}, { blocks: [game('frozen')] }]) {
        const { container } = render(<CrtShell {...props(over)} />)
        expect(container.querySelector('[data-kb-hints]')).toBeNull()
      }
    })
  })

  describe('the tube', () => {
    /**
     * NO RASTER EFFECTS. There was an overlay drawing scanlines and a vignette
     * across the whole tube, and both are FAULTS of a cathode ray tube being
     * reproduced as decoration — the fault they reproduce best being the one
     * that makes small text hard to read. A six-year-old's letters at 22px
     * with a dark band through every line of them, and their own drawing dimmed
     * at the corners.
     *
     * Checked in the DOM and in the stylesheet, because either alone would let
     * it come back the other way.
     */
    it('lays no raster over the picture: no scanlines, no interlace, no fuzz', () => {
      const { container } = render(<CrtShell {...props()} />)
      expect(container.querySelector('[data-kb-scanlines]')).toBeNull()
      expect(TSX).not.toContain('data-kb-scanlines')
      // Comments stripped: the note explaining what was deleted names the
      // very things this asserts are gone.
      const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const banned of ['repeating-linear-gradient', 'radial-gradient', 'blur(']) {
        expect(code, `crt.css reaches for ${banned}`).not.toContain(banned)
      }
    })

    it('builds its glow out of the theme\'s own halo', () => {
      expect(CSS).toContain('var(--kb-glow)')
    })

    it('names no typeface of its own — the system writes --kb-font', () => {
      expect(CSS).not.toContain('VT323')
      expect(CSS).not.toMatch(/font-family\s*:/)
    })

    /**
     * A flickering tube is harder to read than a steady one, and a six-year-old
     * gets no say in the matter. There is no animation here to gate.
     */
    it('does not flicker', () => {
      expect(CSS).not.toMatch(/@keyframes/)
      expect(CSS).not.toMatch(/\banimation(-name)?\s*:/)
    })

    /**
     * The block cursor is every machine's now — it moved to `.kb-input` in
     * `styles.css`, because a hairline caret is hard for a six-year-old to
     * find on any of the four, not only on a phosphor tube. So this asks the
     * sheet that actually carries it.
     */
    it('gives the prompt a block cursor, along with every other machine', () => {
      const shared = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
      expect(shared).toMatch(/\.kb-input\s*\{[^}]*caret-shape:\s*block/)
      expect(CSS).not.toMatch(/caret-shape/)
    })

    it('takes the prompt it is handed and writes none of its own', () => {
      // `?` arrives already inside `input` (Terminal passes `System.prompt`),
      // so the shell renders that element once and adds no glyph beside it.
      const { container } = render(<CrtShell {...props()} />)
      expect(container.querySelectorAll('[data-test-input]')).toHaveLength(1)
      expect(container.textContent).not.toContain(CRT.prompt)
    })
  })

  /**
   * Hebrew mirrors the words. It never mirrors the picture: a canvas has no
   * bidi algorithm and the game box isolates itself, so the field needs no
   * override of its own — and must not grow one.
   */
  describe('hebrew', () => {
    it('leaves the command area to the page direction', () => {
      const { container } = render(<CrtShell {...props({ locale: 'he', dir: 'rtl' })} />)
      expect(command(container).getAttribute('dir')).toBeNull()
      expect(field(container).getAttribute('dir')).toBeNull()
    })

    it('isolates the still it paints itself', () => {
      const { container } = render(
        <CrtShell {...props({ locale: 'he', dir: 'rtl', blocks: [game('frozen')] })} />,
      )
      const box = field(container).querySelector('[data-kb-game="frozen"]')!
      expect(box.closest('[dir="ltr"]')).toBeTruthy()
    })
  })
})
