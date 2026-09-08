import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Kidboard } from '../Kidboard'
import { TITLE } from '../cartridges/intro/card'
import { HOLD_MS, LEAD_MS, LETTER_MS } from '../chrome/demoType'

const type = async (text: string) => {
  const u = userEvent.setup()
  const box = screen.getByRole('textbox')
  await u.type(box, `${text}{Enter}`)
}

describe('Kidboard', () => {
  // `hebrew`/`english` persist the chosen locale to real localStorage (by
  // design — a returning child should not have to switch again). Clear it
  // between tests so one test's typed command cannot leak into the next.
  beforeEach(() => {
    localStorage.clear()
  })

  /**
   * The default machine is the Kidtari, and a Kidtari does not greet you in its
   * OWN voice — `chrome.welcome` is false, which is also why nothing is
   * re-said after a game wipes the transcript: there is nothing to re-say.
   * The welcome SCREEN is a separate question, and is below.
   */
  it('never greets in the voice of a machine that does not greet', () => {
    const { container } = render(<Kidboard />)
    expect(container.textContent).not.toContain('hello!')
    expect(container.textContent).toContain('READY')
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  /**
   * THE WELCOME SCREEN.
   *
   * A child arriving at this machine sees the same face every time, the way
   * an arcade cabinet has the same marquee every time somebody walks up to
   * it. It was tried as a first-visit-only card behind a flag, and that is
   * worse in two ways at once: whoever needs it is exactly the child who
   * will not remember it from last week, and once-only state is invisible —
   * there is no way to look at the screen and know why the thing you were
   * shown yesterday has gone.
   */
  describe('the welcome screen', () => {
    it('is there on the machine that greets you in no voice of its own', () => {
      const { container } = render(<Kidboard />)
      expect(container.textContent).toContain(TITLE)
      expect(container.textContent).toContain('type a word')
      for (const word of ['cat', 'red', 'ball']) {
        expect(container.textContent, word).toContain(word)
      }
    })

    it('is there again the next time, and the time after', () => {
      const first = render(<Kidboard />)
      expect(first.container.textContent).toContain(TITLE)
      cleanup()
      const again = render(<Kidboard />)
      expect(again.container.textContent,
        'the welcome screen went away on a second visit').toContain(TITLE)
    })

    it('leaves nothing behind in storage to remember it by', () => {
      render(<Kidboard />)
      expect(Object.keys(localStorage),
        'the welcome screen persisted something').toEqual([])
    })

    it('sits under a machine that does greet you, and does not repeat it', () => {
      localStorage.setItem('kb.system', 'kidcode')
      const { container } = render(<Kidboard />)
      expect(container.textContent).toContain('hello!')
      expect(container.textContent).toContain(TITLE)
      // The machine says hello in its own voice; the card carries the
      // instruction. Two invitations in a row is one too many.
      expect(container.textContent).not.toContain('type anything you like')
    })

    it('comes back whenever anybody types for it', async () => {
      const { container } = render(<Kidboard />)
      await type('intro')
      const marquees = container.textContent!.split(TITLE).length - 1
      expect(marquees, 'typing `intro` did not fetch the card').toBe(2)
    })

    it('greets a Hebrew child in Hebrew, with Hebrew words to try', () => {
      localStorage.setItem('kb.locale', 'he')
      const { container } = render(<Kidboard />)
      expect(container.textContent).toContain(TITLE)
      expect(container.textContent).toContain('חתול')
      expect(container.textContent).not.toContain('cat')
    })

    /**
     * …and says so in markup, on the frame rather than on `<html>`: Kidboard
     * is embeddable and leaves the host page exactly as it found it, which is
     * the same rule the palette and the typeface already follow.
     */
    it('tells the browser what language everything inside it is in', () => {
      const { container } = render(<Kidboard />)
      expect(container.firstElementChild!.getAttribute('lang')).toBe('en')
      expect(document.documentElement.getAttribute('lang'),
        'it reached out and relabelled the host page').not.toBe('en')
      cleanup()

      localStorage.setItem('kb.locale', 'he')
      const he = render(<Kidboard />)
      expect(he.container.firstElementChild!.getAttribute('lang')).toBe('he')
      expect(screen.getByRole('textbox').getAttribute('lang')).toBe('he')
    })

    /**
     * THE CABINET PLAYING ITSELF. The last third of an arcade attract loop is
     * the machine demonstrating with nobody at the controls, and a child
     * learned Pac-Man by watching one before ever spending a coin. For a
     * machine whose whole verb is typing, that is a word appearing in the
     * real prompt, one letter at a time, and then running.
     */
    describe('and then the machine types a word for itself', () => {
      /** Prompt marks: the live input line has one, and so does every echo. */
      const prompts = (c: HTMLElement) => c.querySelectorAll('[data-kb-prompt]').length
      const box = () => screen.getByRole('textbox') as HTMLTextAreaElement

      afterEach(() => vi.useRealTimers())

      it('types it into the real prompt and then runs it', async () => {
        vi.useFakeTimers()
        const { container } = render(<Kidboard />)
        expect(box().placeholder, 'it typed before the card was read').toBe('')
        expect(prompts(container)).toBe(1)

        await act(async () => { vi.advanceTimersByTime(LEAD_MS + LETTER_MS) })
        expect(box().placeholder).toBe('c')
        await act(async () => { vi.advanceTimersByTime(LETTER_MS * 2) })
        expect(box().placeholder).toBe('cat')
        // …and it sits there for a beat before it runs, or it was never on
        // screen long enough to be copied.
        expect(prompts(container), 'it ran before the word could be read').toBe(1)

        await act(async () => { vi.advanceTimersByTime(HOLD_MS + 20) })
        expect(box().placeholder, 'the prompt was left with the demo in it').toBe('')
        expect(prompts(container), 'the word never ran').toBe(2)
      })

      /** The coin going in: whatever the child does, the cabinet hands over. */
      it('stops dead the moment the child presses anything', async () => {
        vi.useFakeTimers()
        const { container } = render(<Kidboard />)
        await act(async () => { vi.advanceTimersByTime(LEAD_MS + LETTER_MS) })
        expect(box().placeholder).toBe('c')

        await act(async () => { fireEvent.keyDown(window, { key: 'a' }) })
        expect(box().placeholder, 'the demo was still in the prompt').toBe('')
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(prompts(container), 'a stopped demo still ran its word').toBe(1)
      })

      it('stops for a tap as well as for a key', async () => {
        vi.useFakeTimers()
        const { container } = render(<Kidboard />)
        await act(async () => { vi.advanceTimersByTime(LEAD_MS + LETTER_MS) })
        await act(async () => { fireEvent.pointerDown(window) })
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(prompts(container)).toBe(1)
      })

      /**
       * A CABINET FINISHING ITS ATTRACT LOOP IS SAYING "YOUR TURN", and the
       * caret is how this machine says it. The demonstration ends with a word
       * typed and answered, which is the exact moment a child wants to try
       * one of their own — and the caret was nowhere, so the next thing they
       * typed went into the page and vanished.
       */
      it('hands the keyboard over when it has finished', async () => {
        vi.useFakeTimers()
        render(<Kidboard />)
        expect(document.activeElement).not.toBe(box())
        await act(async () => {
          vi.advanceTimersByTime(LEAD_MS + LETTER_MS * 3 + HOLD_MS + 20)
        })
        expect(document.activeElement,
          'the machine typed a word and then kept the keyboard').toBe(box())
      })

      /**
       * THE PHANTOM IS THE PLACEHOLDER, so the box stays empty and fully
       * live. Showing it as the VALUE was the obvious way and cost a
       * keystroke every single boot: the box had to go readOnly so the
       * phantom could not be edited, and the key that cancelled the demo was
       * therefore also the key that got swallowed.
       */
      it('never eats the keystroke that stopped it', async () => {
        vi.useFakeTimers()
        render(<Kidboard />)
        await act(async () => { vi.advanceTimersByTime(LEAD_MS + LETTER_MS) })
        expect(box().readOnly, 'the box cannot be typed into').toBe(false)
        expect(box().value, 'the phantom is in the value, not the placeholder')
          .toBe('')
      })
    })
  })

  /**
   * The mute flag is read during the FIRST render, and the settings menu is
   * where it now shows: the toolbar's 🔊 / 🔇 went with the toolbar, and an
   * emoji in the chrome was the wrong way to say it anyway — a full-colour
   * bitmap the font vendor chose, on a machine that has one ink.
   *
   * Opening a menu happens after that first frame, but nothing corrects the
   * flag afterwards, so a `useState(false)` that ignored storage would still
   * be caught here: the row would read "sound on".
   */
  it('renders the persisted mute state on the very first frame', async () => {
    localStorage.setItem('kb.muted', '1')
    const u = userEvent.setup()
    render(<Kidboard />)
    await u.click(screen.getByRole('button', { name: 'settings' }))
    const sound = screen.getByRole('menuitemradio', { name: /sound/i })
    expect(sound.textContent).toContain('sound off')
    expect(sound.getAttribute('aria-checked')).toBe('false')
  })

  it('shows a picture challenge after several unrecognized inputs', async () => {
    const { container } = render(<Kidboard />)
    for (let i = 0; i < 6; i++) await type(`zxqwv${i}`)
    expect(container.textContent).toMatch(/what animal|what is this|what color|how many/)
  })

  it('never scolds a wrong challenge answer', async () => {
    const { container } = render(<Kidboard />)
    for (let i = 0; i < 6; i++) await type(`zxqwv${i}`)
    await type('banana')
    const text = container.textContent?.toLowerCase() ?? ''
    expect(text).not.toContain('wrong')
    expect(text).not.toContain('try again')
  })

  /**
   * I1. The transcript scrolls to the bottom when `blocks` changes — but a
   * game block's height does not exist yet at that moment. `GameCanvas` sizes
   * its canvas from a `ResizeObserver` callback on a LATER commit, so the
   * scroll target was computed while the canvas was still ~zero high; from a
   * cold reload, eight games in a row, `scrollTop` stayed at 0 while
   * `scrollHeight - clientHeight` grew to 388px, leaving the running game and
   * the input prompt both below the fold.
   *
   * WHAT THIS TEST CAN AND CANNOT DO. jsdom has no layout — `scrollHeight` is
   * 0, `Element.scrollTo` does not exist — so it cannot reproduce the defect
   * and no assertion here would have caught it. What it CAN pin is the
   * mechanism the fix rests on: that a change in the transcript CONTENT's
   * height, with no new block and no key pressed, re-issues the scroll. The
   * defect itself was reproduced, and the fix confirmed, in a real browser.
   */
  it('re-scrolls when the transcript content grows on a later frame', () => {
    const seen: ResizeObserverCallback[] = []
    const real = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    class FakeRO {
      constructor(cb: ResizeObserverCallback) { seen.push(cb) }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO
    try {
      const { container } = render(<Kidboard />)
      const box = container.querySelector('[data-kb-transcript]') as HTMLElement
      const tops: number[] = []
      ;(box as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo =
        (o) => { tops.push(o.top ?? -1) }
      expect(seen.length, 'nothing is watching the transcript content')
        .toBeGreaterThan(0)
      const before = tops.length
      // A canvas has just been given its real height. No new block, no key.
      for (const cb of seen) cb([], null as unknown as ResizeObserver)
      expect(tops.length, 'a taller transcript did not scroll to the bottom')
        .toBeGreaterThan(before)
    } finally {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = real
    }
  })

  /**
   * The three machines' theories of what a session IS, exercised end to end
   * through the real Terminal rather than through a shell in isolation.
   */
  describe('a game, and what the machine thinks a session is', () => {
    // jsdom's window carries `ontouchstart`, so Kidboard reads it as a tablet
    // and answers "this one needs a keyboard!" instead of starting a game.
    let restore = () => {}
    beforeEach(() => {
      const had = Object.prototype.hasOwnProperty.call(window, 'ontouchstart')
      const was = (window as unknown as Record<string, unknown>).ontouchstart
      delete (window as unknown as Record<string, unknown>).ontouchstart
      restore = () => {
        if (had) (window as unknown as Record<string, unknown>).ontouchstart = was
      }
    })
    afterEach(() => restore())

    /**
     * KIDTARI'S RULE. A game is a MODE: it takes the screen, and when it exits
     * the past is gone and the child is left with a bare `READY`. Nothing is
     * re-said, because this machine has no welcome to re-say.
     */
    it('takes the screen for a game, and wipes the past when it ends', async () => {
      const u = userEvent.setup()
      const { container } = render(<Kidboard />)
      await type('cat')
      expect(container.textContent).toContain('🐱')

      await type('ball')
      expect(container.querySelector('[data-kb-fullscreen]')).toBeTruthy()
      expect(container.querySelector('[data-kb-game="running"]')).toBeTruthy()
      // No prompt, no toolbar, no transcript while the game has the screen.
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.queryByRole('button', { name: 'games' })).toBeNull()

      await u.keyboard('{Escape}')
      expect(container.querySelector('[data-kb-fullscreen]')).toBeNull()
      expect(container.textContent).not.toContain('🐱')
      expect(container.textContent).not.toContain('hello!')
      expect(container.textContent).toContain('READY')
      expect(screen.getByRole('textbox')).toBeTruthy()
    })

    // The other theory of a session, from the same code. Nothing is removed.
    it('keeps everything on a machine whose scrollback is kept', async () => {
      const u = userEvent.setup()
      localStorage.setItem('kb.system', 'kidcode')
      const { container } = render(<Kidboard />)
      await type('cat')
      await type('ball')
      // The game runs INLINE and the transcript is all still there — that is
      // this machine's whole theory of a session.
      expect(container.querySelector('[data-kb-fullscreen]')).toBeNull()
      expect(container.textContent).toContain('🐱')
      // …but the prompt is not, because the game owns every key. It used to
      // sit there at 40% opacity with a caret in it, and typing the next
      // game's name into it did nothing at all — no letters, no sound, no
      // reason. Every machine now says the same thing about who is listening.
      expect(screen.queryByRole('textbox'),
        'a prompt that answers nothing is still on screen').toBeNull()

      await u.keyboard('{Escape}')
      expect(container.textContent).toContain('🐱')
      expect(container.querySelector('[data-kb-game]')).toBeTruthy()
      // And it comes straight back when the game gives the keyboard up.
      expect(screen.getByRole('textbox')).toBeTruthy()
    })

    /**
     * SWAPPING GAMES WITHOUT LEAVING THE ONE YOU ARE IN.
     *
     * The shelf is bound in the capture phase precisely so it can take the
     * keys off a running cartridge, and this is the whole path: two taps on
     * Shift out of a game, move along the shelf, choose. The game that was
     * running ends, the new one starts, and the shelf puts itself away.
     */
    it('swaps one game for another straight out of a running game', async () => {
      const u = userEvent.setup()
      localStorage.setItem('kb.system', 'kidcode')
      const { container } = render(<Kidboard />)
      await type('ball')
      expect(container.querySelector('[data-kb-game="running"]')).toBeTruthy()

      await u.keyboard('{Shift}{Shift}')
      const shelf = container.querySelector('[data-kb-picker]')
      expect(shelf, 'shift, shift did not reach past the running game').toBeTruthy()
      // It opened ON the game that is running, ticked.
      const on = container.querySelector('[data-kb-active="true"] .kb-picker-word')
      expect(on?.textContent).toBe('ball')

      await u.keyboard('{ArrowRight}{Enter}')
      expect(container.querySelector('[data-kb-picker]')).toBeNull()
      expect(container.querySelector('[data-kb-game="running"]'),
        'nothing is running after the swap').toBeTruthy()
      // The one that was running is history now, and the new one has its own
      // name on the chrome.
      expect(container.textContent).not.toContain('▸ball')
    })

    /**
     * THE STILL IS THE HISTORY. Asked for in so many words: "if a game was
     * played, and done, leave the game snapshot there in the history so it
     * would look like we visually played it and stopped".
     *
     * The trap is what happens NEXT. A frozen block used to collapse to a
     * one-line `ball — boing! ▸` the moment anything else was appended, and
     * the frame was thrown away with it — so the snapshot survived right up
     * until the child typed their next word, which is the one moment it was
     * meant to start being history. Freezing it is not the test; typing
     * afterwards is.
     */
    it('leaves the picture in the history, and keeps it there', async () => {
      const u = userEvent.setup()
      localStorage.setItem('kb.system', 'kidcode')
      const { container } = render(<Kidboard />)
      await type('ball')
      await u.keyboard('{Escape}')

      await type('cat')
      await type('dog')
      expect(
        container.querySelector('[data-kb-game="frozen"]'),
        'the snapshot was collapsed away by the next line',
      ).toBeTruthy()
      // And nothing in the transcript collapsed at all. `▸` is the mark a
      // collapsed block wears, and a collapsed block carries no
      // `data-kb-game` — so checking for the mark INSIDE the still could
      // never have failed. The whole transcript is the honest place to look.
      expect(container.textContent).not.toContain('▸')
    })

    /**
     * And the machines that do NOT keep it are not being forgetful — each has
     * the picture somewhere better. The Kidtari is about to wipe the screen
     * anyway; the CRT keeps it glowing on the field and files a line in the
     * command area, so collapsing there is what stops it being shown twice.
     */
    it('collapses the still on a machine that does not keep scrollback', async () => {
      const u = userEvent.setup()
      localStorage.setItem('kb.system', 'crt')
      const { container } = render(<Kidboard />)
      await type('ball')
      await u.keyboard('{Escape}')
      await type('cat')
      // Scoped to the command area on purpose: the CRT paints the still in
      // its FIELD, which is exactly why the transcript does not need it too.
      const area = container.querySelector('[data-kb-transcript]')!
      expect(area.querySelector('[data-kb-game]')).toBeNull()
      expect(area.textContent).toContain('▸')
      expect(area.textContent).toContain('ball')
    })

    /**
     * The Kidtari unmounts the prompt for a full-screen game, so ESC left focus
     * on `<body>` — the machine looked alive and did nothing until the child
     * thought to click. The default machine, after every game.
     */
    it('hands the keyboard back to the prompt when a game ends', async () => {
      const u = userEvent.setup()
      render(<Kidboard />)
      await type('ball')
      expect(screen.queryByRole('textbox')).toBeNull()
      await u.keyboard('{Escape}')
      const box = screen.getByRole('textbox')
      expect(document.activeElement, 'focus was stranded on the body').toBe(box)
      // …and the proof that matters: typing works with no click first.
      await u.keyboard('cat{Enter}')
      expect(box.ownerDocument.body.textContent).toContain('🐱')
    })

    it('puts the running cartridge on the label, and nothing there when idle', async () => {
      const u = userEvent.setup()
      const { container } = render(<Kidboard />)
      await type('ball')
      const label = container.querySelector('[data-kb-label]')!
      expect(label.textContent).toContain('ball')
      expect(label.textContent).toContain('ESC')
      await u.keyboard('{Escape}')
      expect(container.querySelector('[data-kb-label]')).toBeNull()
    })

    /**
     * I1, ACROSS A SHELL SWAP. The transcript box is watched for its width
     * (the column count a game is handed) and its content for its height (a
     * canvas learns how tall it is a frame or more after it is committed). The
     * Kidtari swaps its whole tree when a game takes the screen, so an observer
     * attached once on mount could be left watching a DETACHED node —
     * measuring nothing, for ever, with every test still green.
     *
     * The invariant is what matters, not the remount: this asserts that every
     * box under observation is still on the page, in a game and out of one.
     * Counting re-observations instead was a test of one implementation of
     * the fix — it went red the day the settings menu left the shell tree and
     * the Kidtari's two trees became the same shape, at which point React
     * reuses the nodes and there is nothing to re-observe, which is the
     * invariant HOLDING rather than breaking.
     */
    it('never ends up measuring a node that has left the page', async () => {
      /** Every box still under observation, with unobserved ones removed. */
      const watching = new Set<Element>()
      const real = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
      class FakeRO {
        private mine = new Set<Element>()
        constructor(_cb: ResizeObserverCallback) {}
        observe(el: Element) { this.mine.add(el); watching.add(el) }
        unobserve(el: Element) { this.mine.delete(el); watching.delete(el) }
        disconnect() {
          for (const el of this.mine) watching.delete(el)
          this.mine.clear()
        }
      }
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO
      try {
        const { container } = render(<Kidboard />)
        await type('ball')
        expect(watching.size, 'nothing is being measured at all')
          .toBeGreaterThanOrEqual(2)
        for (const el of watching) {
          expect(container.contains(el), el.outerHTML.slice(0, 80)).toBe(true)
        }
        // ...and out the other side again, when the game ends and the Kidtari
        // swaps back to the idle tree.
        await userEvent.setup().keyboard('{Escape}')
        expect(watching.size).toBeGreaterThanOrEqual(2)
        for (const el of watching) {
          expect(container.contains(el), el.outerHTML.slice(0, 80)).toBe(true)
        }
      } finally {
        ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = real
      }
    })
  })

  it('resets the nudge run on a recognized word, so alternating real words with mashing never accumulates toward a challenge', async () => {
    const { container } = render(<Kidboard />)
    // The nudge threshold is randomized 3 or 4 unrecognized inputs in a row.
    // Two unrecognized inputs is under either value, so neither half of this
    // sequence can trigger a challenge on its own. A real recognized word
    // ("cat") sits between them: without a reset on that word, the run
    // would carry over and the combined total (2 + 2 = 4, or reaching 3 on
    // the way) would fire a challenge for both possible thresholds. With
    // the reset, the run restarts at zero after "cat" and never gets past 2
    // either side.
    await type('zxqwv0')
    await type('zxqwv1')
    await type('cat')
    await type('zxqwv2')
    await type('zxqwv3')
    expect(container.textContent).not.toMatch(/what animal|what is this|what color|how many/)
  })
})
