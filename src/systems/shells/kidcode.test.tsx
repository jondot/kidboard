import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KidCodeShell, GERUNDS } from './kidcode'
import type { ShellProps } from '../Shell'
import { KIDCODE } from '../systems'
import { makeFrameChannel } from '../../runtime/frameChannel'
import { makeT } from '../../i18n/locale'
import type { Block, Hint, Locale } from '../../types'

/**
 * THE KIDCODE CODE MACHINE.
 *
 * The requirement is fidelity, not inspiration: a column of left-gutter
 * markers, a rounded welcome box, a tool call where a cartridge starts, a
 * bordered prompt box, and a nonsense-gerund spinner. What is asserted below
 * is the furniture, in the places the real terminal puts it.
 */

let n = 0
const id = () => `b${++n}`

const said = (text: string): Block => ({
  id: id(), kind: 'static', spec: { kind: 'text', text },
})

const typed = (text: string): Block => ({
  id: id(), kind: 'echo', prompt: KIDCODE.prompt.en, text,
})

const game = (state: 'running' | 'frozen' | 'collapsed'): Block => ({
  id: id(),
  kind: 'live',
  cartridgeId: 'ball',
  title: 'bounce',
  state,
  frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
  souvenir: '',
})

const HINTS: Hint[] = [
  { keys: '← →', label: 'move' },
  { keys: 'ESC', label: 'done' },
]

const props = (over: Partial<ShellProps> = {}): ShellProps => ({
  system: KIDCODE,
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
  liveTitle: 'bounce',
  hints: HINTS,
}

const SRC = join(process.cwd(), 'src/systems/shells')
const TSX = readFileSync(join(SRC, 'kidcode.tsx'), 'utf8')
const CSS = readFileSync(join(SRC, 'kidcode.css'), 'utf8')

describe('the Kid Code shell', () => {
  it('says which machine it is, and keeps a scrolling transcript', () => {
    const { container } = render(<KidCodeShell {...props()} />)
    expect(container.querySelector('[data-kb-shell="kidcode"]')).toBeTruthy()
    expect(container.querySelector('[data-kb-transcript]')).toBeTruthy()
    expect(container.querySelector('[data-test-input]')).toBeTruthy()
    // Per-game help is a system decision; nobody has a global bottom bar.
    expect(container.querySelector('[data-kb-bar]')).toBeNull()
  })

  it('promises nothing it cannot do', () => {
    const { container } = render(<KidCodeShell {...props()} />)
    const text = (container.textContent ?? '').toLowerCase()
    for (const bad of ['coming soon', 'not implemented', 'todo', 'placeholder']) {
      expect(text).not.toContain(bad)
    }
  })

  describe('the header', () => {
    /**
     * A LOGO TILE, A NAME, A VERSION, A MODEL AND A PATH — the shape a real
     * terminal actually prints, which is the whole point of this machine: a
     * six-year-old should see that they are using the same kind of thing their
     * grown-up has open on the next desk.
     *
     * It replaced a rounded card saying "Welcome to …", which is a greeting.
     * No terminal has ever greeted anybody in a bordered box.
     */
    it('prints a mark, a name, a version, a model and a working directory', () => {
      const { container } = render(<KidCodeShell {...props()} />)
      const box = container.querySelector('[data-kb-welcome]')!
      expect(box).toBeTruthy()
      expect(box.querySelector('.kb-kc-logo')).toBeTruthy()
      expect(box.textContent).toContain('Kid Code')
      expect(box.textContent).toContain('v2')
      // The subtitle sits where a terminal tool puts its own, and says what
      // this machine is rather than borrowing what another one is called.
      expect(box.textContent).toContain('Kidboard 1')
      expect(box.textContent).toContain('~/projects/kidboard')
      // A header, not a greeting.
      expect(box.textContent).not.toMatch(/welcome/i)
    })

    /**
     * Nothing on this header is a number that could tick. A version that moved
     * on its own would be a thing on screen changing for no reason a child can
     * see, which is the same rule that keeps a clock off every window bar.
     */
    it('states a version that is a constant, not a real one', () => {
      const { container } = render(<KidCodeShell {...props()} />)
      const first = container.querySelector('[data-kb-welcome]')!.textContent
      const again = render(<KidCodeShell {...props()} />).container
        .querySelector('[data-kb-welcome]')!.textContent
      expect(again).toBe(first)
    })

    it('comes off `chrome.welcome`, never off the id', () => {
      const quiet = { ...KIDCODE, chrome: { ...KIDCODE.chrome, welcome: false } }
      const { container } = render(<KidCodeShell {...props({ system: quiet })} />)
      expect(container.querySelector('[data-kb-welcome]')).toBeNull()
      // ...and it is still the kid code machine.
      expect(container.querySelector('[data-kb-shell="kidcode"]')).toBeTruthy()
    })
  })

  describe('the gutter', () => {
    it('marks what was said with a single ⏺, however many lines it ran to', () => {
      const { container } = render(
        <KidCodeShell {...props({ blocks: [said('hello!'), said('type anything')] })} />,
      )
      const says = container.querySelectorAll('[data-kb-say]')
      expect(says).toHaveLength(1)
      expect(says[0]!.querySelector('[data-kb-gutter]')!.textContent).toBe('⏺')
      expect(says[0]!.textContent).toContain('hello!')
      expect(says[0]!.textContent).toContain('type anything')
    })

    it('starts a new ⏺ after the child speaks', () => {
      const { container } = render(
        <KidCodeShell
          {...props({ blocks: [said('hello!'), typed('cat'), said('meow'), typed('dog')] })}
        />,
      )
      expect(container.querySelectorAll('[data-kb-say]')).toHaveLength(2)
    })

    it('keeps the child on the chevron prompt the system supplies', () => {
      const { container } = render(<KidCodeShell {...props({ blocks: [typed('cat')] })} />)
      const echo = container.querySelector('[data-kb-echo]')!
      expect(echo.textContent).toContain(KIDCODE.prompt.en)
      expect(echo.textContent).toContain('cat')
      // An echoed prompt is marked the same way the live one is, so the two
      // can never disagree about which way the arrow points.
      expect(echo.querySelector('[data-kb-prompt="chevron"]')).toBeTruthy()
    })
  })

  describe('starting a cartridge is a tool call', () => {
    const live = [typed('ball'), game('running')]

    /**
     * The result marker is DRAWN, not typed. `⎿` was one character tall beside
     * a game four hundred pixels tall — it marked where the result began and
     * then let go of it. The rail is two borders on an empty box, so it is
     * exactly as tall as what it introduces, always.
     */
    it('prints ⏺ id(hints) above the game and runs a rail down beside it', () => {
      const { container } = render(
        <KidCodeShell {...props({ ...playing, blocks: live })} />,
      )
      const call = container.querySelector('[data-kb-call]')!
      expect(call.textContent).toContain('ball')
      expect(call.textContent).toContain('(')
      expect(call.textContent).toContain(')')
      const result = container.querySelector('[data-kb-result]')!
      const rail = result.querySelector('[data-kb-gutter]')!
      expect(rail.classList.contains('kb-kc-rail')).toBe(true)
      expect(rail.textContent).toBe('')
      // It is a line and a foot, and it stretches to whatever it introduces.
      const decl = CSS.slice(CSS.indexOf('.kb-kc-rail {'))
      const body = decl.slice(0, decl.indexOf('}'))
      expect(body).toContain('align-self: stretch')
      expect(body).toContain('border-inline-start')
      expect(body).toContain('border-block-end')
      expect(result.querySelector('[data-kb-game="running"]')).toBeTruthy()
      // The call line is ABOVE the game — `helpAt: 'callLine'`.
      expect(call.compareDocumentPosition(container.querySelector('[data-kb-game]')!))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('puts the running cartridge’s help in the call line, not in a bar', () => {
      const { container } = render(
        <KidCodeShell {...props({ ...playing, blocks: live })} />,
      )
      const hints = container.querySelector('[data-kb-hints]')!
      expect(hints.textContent).toContain('← →')
      expect(hints.textContent).toContain('move')
      expect(hints.textContent).toContain('ESC')
      expect(container.querySelector('[data-kb-call]')!.contains(hints)).toBe(true)
    })

    it('shows no hints for a game nobody is playing', () => {
      const { container } = render(
        <KidCodeShell {...props({ blocks: [typed('ball'), game('frozen')] })} />,
      )
      expect(container.querySelector('[data-kb-hints]')).toBeNull()
      // The name is still there: a call line with no arguments is still a call.
      expect(container.querySelector('[data-kb-call]')!.textContent).toContain('ball')
    })

    it('leaves the game in history as a still, under its own call line', () => {
      const { container } = render(
        <KidCodeShell {...props({ blocks: [typed('ball'), game('frozen'), said('bye')] })} />,
      )
      expect(container.querySelector('[data-kb-game="frozen"]')).toBeTruthy()
      const transcript = container.querySelector('[data-kb-transcript]')!
      expect(transcript.querySelector('[data-kb-game="frozen"]')).toBeTruthy()
    })

    it('never hoists the live game out of the transcript', () => {
      const { container } = render(
        <KidCodeShell {...props({ ...playing, blocks: live })} />,
      )
      const transcript = container.querySelector('[data-kb-transcript]')!
      expect(transcript.querySelector('[data-kb-game="running"]')).toBeTruthy()
      // The prompt stays: a game does not take the screen on this machine.
      expect(container.querySelector('[data-test-input]')).toBeTruthy()
    })
  })

  describe('the prompt box', () => {
    it('is a bordered box holding the input', () => {
      const { container } = render(<KidCodeShell {...props()} />)
      const box = container.querySelector('[data-kb-promptbox]')!
      expect(box).toBeTruthy()
      expect(box.querySelector('[data-test-input]')).toBeTruthy()
    })

    it('comes off `chrome.promptBox`, and the input survives without it', () => {
      const bare = { ...KIDCODE, chrome: { ...KIDCODE.chrome, promptBox: false } }
      const { container } = render(<KidCodeShell {...props({ system: bare })} />)
      expect(container.querySelector('[data-kb-promptbox]')).toBeNull()
      expect(container.querySelector('[data-test-input]')).toBeTruthy()
    })

    it('carries a dim hint line under it that does not say "type"', () => {
      const { container } = render(<KidCodeShell {...props()} />)
      const line = container.querySelector('[data-kb-shortcuts]')!
      expect(line.textContent!.trim().length).toBeGreaterThan(0)
      expect(line.textContent!.toLowerCase()).not.toContain('type')
    })

    it('speaks the child’s own language', () => {
      const { container } = render(
        <KidCodeShell {...props({ locale: 'he', dir: 'rtl' })} />,
      )
      const line = container.querySelector('[data-kb-shortcuts]')!
      expect(line.textContent).toMatch(/[֐-׿]/)
    })
  })

  describe('ANSI separators', () => {
    it('rules a thin line between turns, and none before the first', () => {
      const one = render(<KidCodeShell {...props({ blocks: [said('hello!')] })} />)
      expect(one.container.querySelectorAll('[data-kb-sep]')).toHaveLength(0)

      const many = render(
        <KidCodeShell
          {...props({ blocks: [said('hello!'), typed('cat'), said('meow'), typed('dog')] })}
        />,
      )
      expect(many.container.querySelectorAll('[data-kb-sep]')).toHaveLength(2)
    })

    it('draws them in the border tone', () => {
      expect(CSS).toMatch(/\[data-kb-sep\][\s\S]*?border-block-start:[^;]*--kb-border/)
    })
  })

  describe('the spinner', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    const answered = [said('hello!'), typed('cat'), said('meow')]

    it('thinks in nonsense for a beat, then lets the answer land under it', () => {
      const { container } = render(<KidCodeShell {...props({ blocks: answered })} />)
      const spin = container.querySelector('[data-kb-spinner]')!
      expect(spin).toBeTruthy()
      expect(spin.textContent).toContain('✻')
      expect(spin.textContent).toMatch(/\w+ing/)
      // The dots are three ELEMENTS, not a printed ellipsis: they fill left to
      // right in CSS, because a spinner that does not move is a sentence about
      // working rather than a thing working. No second timer, either — see the
      // note in `kidcode.css`.
      expect(spin.querySelectorAll('[data-kb-dots] > i')).toHaveLength(3)
      expect(spin.textContent).toContain('0s')
      expect(spin.textContent).toContain('esc')
      // The answer is not on screen yet — it lands when the spinner is done.
      expect(container.textContent).not.toContain('meow')

      act(() => { vi.advanceTimersByTime(5000) })
      expect(container.querySelector('[data-kb-spinner]')).toBeNull()
      expect(container.textContent).toContain('meow')
    })

    it('counts real seconds and invents no other number', () => {
      const { container } = render(<KidCodeShell {...props({ blocks: answered })} />)
      act(() => { vi.advanceTimersByTime(1000) })
      const spin = container.querySelector('[data-kb-spinner]')!
      expect(spin.textContent).toContain('1s')
      expect(spin.textContent).not.toMatch(/token/i)
      expect(spin.textContent).not.toMatch(/[↑↓]/)
    })

    it('never re-arms once it has finished', () => {
      const { container } = render(<KidCodeShell {...props({ blocks: answered })} />)
      act(() => { vi.advanceTimersByTime(5000) })
      for (let i = 0; i < 5; i++) {
        act(() => { vi.advanceTimersByTime(10000) })
        expect(container.querySelector('[data-kb-spinner]')).toBeNull()
      }
    })

    it('never delays a cartridge: a tool call shows at once, with no spinner', () => {
      const { container } = render(
        <KidCodeShell {...props({ ...playing, blocks: [typed('ball'), game('running')] })} />,
      )
      expect(container.querySelector('[data-kb-spinner]')).toBeNull()
      expect(container.querySelector('[data-kb-game="running"]')).toBeTruthy()
    })

    // A turn cartridge's board comes back the moment it is redrawn: while one
    // is running, the line the child typed was a GUESS, not a question.
    it('never makes a running cartridge wait for its own answer', () => {
      const { container } = render(
        <KidCodeShell
          {...props({ busy: true, blocks: [typed('3'), said('yes! 🎉')] })}
        />,
      )
      expect(container.querySelector('[data-kb-spinner]')).toBeNull()
      expect(container.textContent).toContain('yes! 🎉')
    })

    it('comes off `chrome.spinner`', () => {
      const still = { ...KIDCODE, chrome: { ...KIDCODE.chrome, spinner: false } }
      const { container } = render(
        <KidCodeShell {...props({ system: still, blocks: answered })} />,
      )
      expect(container.querySelector('[data-kb-spinner]')).toBeNull()
      expect(container.textContent).toContain('meow')
    })

    it('picks its gerund from a seeded source, never Math.random', () => {
      expect(TSX).not.toContain('Math.random')
    })

    it('is deterministic for the same turn', () => {
      const a = render(<KidCodeShell {...props({ blocks: answered })} />)
      const first = a.container.querySelector('[data-kb-spinner]')!.textContent
      a.unmount()
      const b = render(<KidCodeShell {...props({ blocks: answered })} />)
      expect(b.container.querySelector('[data-kb-spinner]')!.textContent).toBe(first)
    })
  })

  /**
   * `Terminal` observes BOTH boxes — the scroll box for its width, the content
   * for its height, because a canvas learns how tall it is a frame or more
   * after React commits it. A shell that attaches neither, or one twice,
   * silently breaks the follow-the-bottom behaviour.
   */
  describe('the two refs', () => {
    const cases: [string, Partial<ShellProps>][] = [
      ['idle', {}],
      ['in a game', { ...playing, blocks: [typed('ball'), game('running')] }],
    ]
    for (const [name, over] of cases) {
      it(`attaches both, exactly once, ${name}`, () => {
        const scrolls: (HTMLElement | null)[] = []
        const contents: (HTMLElement | null)[] = []
        render(
          <KidCodeShell
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

  describe('Hebrew', () => {
    const he: Partial<ShellProps> = { locale: 'he', dir: 'rtl' }

    it('never lets the call line be re-ordered by the frame’s direction', () => {
      const { container } = render(
        <KidCodeShell
          {...props({ ...he, ...playing, blocks: [typed('כדור'), game('running')] })}
        />,
      )
      expect(container.querySelector('[data-kb-call]')!.getAttribute('dir')).toBe('ltr')
    })

    // `>` is a bidi-mirrored character: in a Hebrew paragraph the browser
    // draws it as `<`. This machine's prompt is a sigil, not punctuation.
    /**
     * A CHEVRON POINTS, so in Hebrew it has to turn round: left alone it sits
     * at the right end of the line aimed off the edge of the screen, away from
     * every word the child is about to type.
     *
     * Two separate things have to be true, and they pull opposite ways. The
     * span is isolated LTR so Unicode's own bidi mirroring cannot flip the
     * glyph by accident — and then it is mirrored back DELIBERATELY, with a
     * transform, which is a different rule with a different reason. `?` and
     * `READY` get neither: a mirrored question mark is a different mark, and a
     * word points at nothing.
     */
    it('turns the chevron round in Hebrew, and only the chevron', () => {
      const { container } = render(
        <KidCodeShell {...props({ ...he, blocks: [typed('חתול')] })} />,
      )
      const prompt = container.querySelector('[data-kb-prompt]')!
      expect(prompt.getAttribute('data-kb-prompt')).toBe('chevron')
      expect(prompt.getAttribute('dir')).toBe('ltr')
      const sheet = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')
      expect(sheet).toMatch(/\[dir="rtl"\] \[data-kb-prompt="chevron"\][^}]*scaleX\(-1\)/)
    })

    it('keeps the gutter column mirroring with the rest of the transcript', () => {
      const { container } = render(
        <KidCodeShell
          {...props({ ...he, ...playing, blocks: [typed('כדור'), game('running')] })}
        />,
      )
      // The LINE is pinned LTR; the row that carries the marker is not.
      const row = container.querySelector('[data-kb-call]')!.parentElement!
      expect(row.hasAttribute('dir')).toBe(false)
    })

    it('leaves the art and the canvas alone', () => {
      const art: Block = { id: id(), kind: 'static', spec: { kind: 'art', art: '/\\_/\\' } }
      const { container } = render(<KidCodeShell {...props({ ...he, blocks: [art] })} />)
      // `ArtView` owns its own isolation; the shell adds nothing to it.
      const row = container.querySelector('.kb-art-row')!
      expect(row.hasAttribute('dir')).toBe(false)
      expect(container.querySelector('.kb-art')!.getAttribute('dir')).toBe('ltr')
    })
  })

  describe('the house rules', () => {
    it('is monochrome: the ground plus one ink, never a third tone', () => {
      for (const banned of ['--kb-win', '--kb-info', '--kb-magic', '--kb-warm', '--kb-cool']) {
        expect(CSS, `kidcode.css reaches for ${banned}`).not.toContain(banned)
      }
    })

    it('names no physical side, in either file', () => {
      expect(CSS).not.toMatch(/(?:margin|padding|border|inset)?-?(?:left|right)\s*:/)
      expect(TSX).not.toMatch(/\bkb:(?:-?(?:ml|mr|pl|pr)-|text-(?:left|right)\b)/)
    })

    it('writes emoji as emoji', () => {
      const needle = String.raw`\u` + '{'
      expect(TSX.includes(needle)).toBe(false)
      expect(CSS.includes(needle)).toBe(false)
    })

    it('counts nothing it was not given', () => {
      const { container } = render(
        <KidCodeShell {...props({ blocks: [said('hello!'), typed('cat'), game('collapsed')] })} />,
      )
      expect(container.textContent).not.toMatch(/token/i)
    })
  })
})

/**
 * The spinner is the only joke on this screen, so it has to land in both
 * languages. Latin nonsense in a Hebrew session is not the joke — it is a
 * child being shown letters they cannot read yet.
 */
describe('the spinner speaks the child\'s language', () => {
  it('says something in Hebrew script under he', () => {
    const list = GERUNDS.he
    expect(list.length).toBeGreaterThan(8)
    for (const g of list) {
      expect(g, g).toMatch(/^[֐-׿]+$/)
    }
  })

  /**
   * "They share no strings" would pass for any pair of lists in two scripts,
   * including the transliterations it claims to rule out. The claim worth
   * asserting is the one the comment in `kidcode.tsx` actually makes: these are
   * REAL REDUPLICATED HEBREW VERBS — the מְפַרְפֵּר / מְקַשְׁקֵשׁ family — every one
   * of which is `מ` followed by a doubled consonant pair. A transliterated
   * "Flabbering" could not satisfy that, and neither could invented Hebrew
   * that merely looked Hebrew.
   */
  it('is real reduplicated Hebrew, not a transliteration wearing Hebrew letters', () => {
    // Sofit letters are the same consonant at the end of a word: מגמגם ends in
    // ם, which is מ. Folding them is what lets the doubling be seen at all.
    const SOFIT: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
    const fold = (w: string) => [...w].map((c) => SOFIT[c] ?? c).join('')

    expect(GERUNDS.he.length).toBe(GERUNDS.en.length)
    for (const raw of GERUNDS.he) {
      const w = fold(raw)
      expect(w[0], raw).toBe('מ')
      expect(w.length, raw).toBeGreaterThanOrEqual(5)
      const [a, b, c, d] = w.slice(-4)
      expect(a, `${raw}: not a doubled pair`).toBe(c)
      expect(b, `${raw}: not a doubled pair`).toBe(d)
    }
  })
})

/**
 * A GAME ANSWERING A GUESS IS NEVER KIDCODE THINKING.
 *
 * A turn cartridge that ends on the line it answers with — the cheer that
 * closes a round — lands in the same commit that flips `busy` to false. Read
 * only the current value and the spinner arms on it, holding a child's
 * winning line back for a beat and a bit.
 */
describe('the spinner keeps out of a game\'s way', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const answered = [typed('3'), said('you counted the ducks!')]

  it('does not defer a line that arrives as a cartridge finishes', () => {
    const { container, rerender } = render(
      <KidCodeShell {...props({ busy: true, blocks: [typed('3')] })} />,
    )
    // The cheer and the end of the round, in one commit.
    rerender(<KidCodeShell {...props({ busy: false, blocks: answered })} />)
    expect(container.querySelector('[data-kb-spinner]')).toBeNull()
    expect(container.textContent).toContain('you counted the ducks!')
  })

  it('still defers an ordinary line in the conversation', () => {
    const { container, rerender } = render(
      <KidCodeShell {...props({ busy: false, blocks: [] })} />,
    )
    rerender(<KidCodeShell {...props({ busy: false, blocks: answered })} />)
    expect(container.querySelector('[data-kb-spinner]')).toBeTruthy()
  })
})
