import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KidtariShell } from './kidtari'
import type { ShellProps } from '../Shell'
import { KIDTARI } from '../systems'
import { makeFrameChannel } from '../../runtime/frameChannel'
import { makeT } from '../../i18n/locale'
import type { Block, Hint, Locale } from '../../types'

const game = (state: 'running' | 'frozen'): Block => ({
  id: 'g', kind: 'live', cartridgeId: 'ball', title: 'bounce', state,
  frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
  souvenir: '',
})

const props = (over: Partial<ShellProps> = {}): ShellProps => ({
  system: KIDTARI,
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

const live: Partial<ShellProps> = {
  isLive: true,
  busy: true,
  blocks: [game('running')],
  liveTitle: 'bounce',
  hints: [{ keys: '← →', label: 'move' }, { keys: 'ESC', label: 'done' }] as Hint[],
}

describe('the Kidtari shell', () => {
  describe('a game is a mode', () => {
    it('gives the game the whole screen: no toolbar, no prompt, no transcript', () => {
      const { container } = render(<KidtariShell {...props(live)} />)
      expect(container.querySelector('[data-test-input]')).toBeNull()
      expect(container.querySelector('[data-test-input]')).toBeNull()
      expect(container.querySelector('[data-kb-transcript]')).toBeNull()
      expect(container.querySelector('[data-kb-fullscreen]')).toBeTruthy()
    })

    it('paints the running game itself', () => {
      const { container } = render(<KidtariShell {...props(live)} />)
      expect(container.querySelector('[data-kb-game="running"]')).toBeTruthy()
    })

    // `helpAt: 'label'` — the name and the keys, printed above the screen the
    // way they were printed on the cartridge.
    it('prints the cartridge label above the game, with its hints', () => {
      const { container } = render(<KidtariShell {...props(live)} />)
      const label = container.querySelector('[data-kb-label]')!
      expect(label.textContent).toContain('bounce')
      expect(label.textContent).toContain('← →')
      expect(label.textContent).toContain('move')
      expect(label.textContent).toContain('ESC')
      // ABOVE the game, not under it.
      expect(label.compareDocumentPosition(container.querySelector('[data-kb-game]')!))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  describe('idle is the same machine at rest', () => {
    it('shows the transcript and the prompt', () => {
      const { container } = render(
        <KidtariShell {...props({ blocks: [game('frozen')] })} />,
      )
      expect(container.querySelector('[data-test-input]')).toBeTruthy()
      expect(container.querySelector('[data-kb-transcript]')).toBeTruthy()
    })

    // A still is scrollback. `hoistLive` only ever hides a RUNNING game.
    it('keeps a frozen still in the transcript', () => {
      const { container } = render(
        <KidtariShell {...props({ blocks: [game('frozen')] })} />,
      )
      expect(container.querySelector('[data-kb-game="frozen"]')).toBeTruthy()
    })

    it('shows no label strip when nothing is running', () => {
      const { container } = render(<KidtariShell {...props()} />)
      expect(container.querySelector('[data-kb-label]')).toBeNull()
    })
  })

  /**
   * Upper case is a `text-transform`, never a mutation — and never on Hebrew,
   * which is unicase. `uppercase` on Hebrew is a no-op today, but relying on
   * a no-op is how a rule survives right up until it is not one.
   */
  describe('upper case', () => {
    it('marks the Latin chrome it owns', () => {
      const { container } = render(<KidtariShell {...props(live)} />)
      expect(container.querySelector('.kb-upper')).toBeTruthy()
    })

    it('never marks Hebrew', () => {
      for (const over of [{ locale: 'he' as Locale }, { ...live, locale: 'he' as Locale }]) {
        const { container } = render(<KidtariShell {...props(over)} />)
        expect(container.querySelector('.kb-upper')).toBeNull()
      }
    })

    it('mutates no string on its way to the screen', () => {
      const { container } = render(<KidtariShell {...props(live)} />)
      expect(container.querySelector('[data-kb-label]')!.textContent).toContain('bounce')
    })

    // A drawing is not prose: `animals` and `memory` line their grids up out
    // of specific characters, and upper-casing them is a different picture.
    it('exempts art in the stylesheet', () => {
      const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
      expect(css).toMatch(/\.kb-upper\s+\.kb-art\s*\{\s*text-transform:\s*none;?\s*\}/)
    })
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
          <KidtariShell
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
})
