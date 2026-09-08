import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { GameCanvas } from './GameCanvas'
import { makeFrameChannel } from './frameChannel'
import type { DrawCmd, Frame } from '../types'
import { EMPTY_FRAME } from '../types'
import type { Ctx2D, Surface } from './GridCanvas'

const frame = (ch: string, w = 4, h = 2): Frame => ({
  cmds: [{ op: 'put', x: 0, y: 0, ch, tone: 'plain' }],
  w, h,
})

type Rec = { fn: string; args: unknown[] }

/** Installs a working 2D context on every canvas jsdom creates. */
function withCanvas(): { calls: Rec[]; restore(): void } {
  const calls: Rec[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
  const original = HTMLCanvasElement.prototype.getContext
  const ctx: Ctx2D = {
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    clearRect: rec('clearRect'), fillRect: rec('fillRect'),
    fillText: rec('fillText'),
    drawImage: rec('drawImage'), save: rec('save'), restore: rec('restore'),
  }
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx) as unknown as HTMLCanvasElement['getContext']
  return {
    calls,
    restore() { HTMLCanvasElement.prototype.getContext = original },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('GameCanvas — with a real 2D context', () => {
  it('mounts one canvas and paints the frame it was given', () => {
    const c = withCanvas()
    try {
      const { container } = render(<GameCanvas frame={frame('o')} frozen />)
      expect(container.querySelectorAll('canvas')).toHaveLength(1)
      expect(container.querySelector('pre')).toBeNull()
      expect(c.calls.some((x) => x.fn === 'clearRect')).toBe(true)
    } finally {
      c.restore()
    }
  })

  it('sizes the backing store by device pixel ratio and the element by CSS pixels', () => {
    const c = withCanvas()
    vi.stubGlobal('devicePixelRatio', 3)
    try {
      const { container } = render(<GameCanvas frame={frame('o', 4, 2)} frozen />)
      const el = container.querySelector('canvas')!
      // jsdom reports clientWidth 0, so the layout falls back to MIN_CELL (5):
      // 4 cols x 5px = 20 CSS px, x3 dpr = 60 device px.
      expect(el.style.width).toBe('20px')
      expect(el.width).toBe(60)
    } finally {
      c.restore()
    }
  })

  it('paints a frame that arrives on the channel without any re-render', () => {
    const c = withCanvas()
    try {
      const channel = makeFrameChannel()
      render(<GameCanvas frame={EMPTY_FRAME} channel={channel} />)
      const before = c.calls.length
      act(() => channel.emit(frame('x')))
      expect(c.calls.length).toBeGreaterThan(before)
    } finally {
      c.restore()
    }
  })

  it('stops painting once unmounted', () => {
    const c = withCanvas()
    try {
      const channel = makeFrameChannel()
      const { unmount } = render(<GameCanvas frame={EMPTY_FRAME} channel={channel} />)
      unmount()
      const after = c.calls.length
      channel.emit(frame('x'))
      expect(c.calls.length).toBe(after)
    } finally {
      c.restore()
    }
  })

  it('never throws when the canvas element reports no context at all', () => {
    // setupTests already stubs getContext to null; assert the promise directly.
    expect(() => render(<GameCanvas frame={frame('o')} />)).not.toThrow()
  })
})

describe('GameCanvas — degradation', () => {
  // There is no error state a child can see: a browser that cannot give us a
  // 2D context still gets a picture of the game, drawn with the v1 DOM path.
  it('falls back to a DOM grid rather than a blank box or a message', () => {
    const { container } = render(<GameCanvas frame={frame('o')} frozen />)
    expect(container.querySelector('canvas')).toBeNull()
    const pre = container.querySelector('pre')!
    expect(pre.textContent).toBe('o   \n    ')
    expect(container.textContent).not.toMatch(/error|sorry|fail/i)
  })

  // A game drawn with shapes must not degrade to an empty rectangle here:
  // the DOM path squeezes the pixel field into quadrant blocks so there is
  // still a picture. Coarse, but never blank.
  it('still shows a shape-drawing game when there is no 2D context', () => {
    const cmds: DrawCmd[] = [
      { op: 'clear' },
      { op: 'rect', x: 0, y: 0, w: 8, h: 16, tone: 'cool' },
    ]
    const { container } = render(
      <GameCanvas frame={{ cmds, w: 4, h: 2 }} frozen />,
    )
    const pre = container.querySelector('pre')!
    expect(pre.textContent).toBe('█   \n█   ')
  })

  it('keeps showing live frames through the fallback', () => {
    const channel = makeFrameChannel()
    const { container } = render(<GameCanvas frame={EMPTY_FRAME} channel={channel} />)
    act(() => channel.emit(frame('z')))
    expect(container.querySelector('pre')!.textContent).toBe('z   \n    ')
  })

  it('marks a running block and a frozen block distinctly', () => {
    const a = render(<GameCanvas frame={frame('o')} />)
    expect(a.container.querySelector('[data-kb-game]')!.getAttribute('data-kb-game'))
      .toBe('running')
    const b = render(<GameCanvas frame={frame('o')} frozen />)
    expect(b.container.querySelectorAll('[data-kb-game="frozen"]')).toHaveLength(1)
  })

  it('renders an empty frame without crashing', () => {
    const { container } = render(<GameCanvas frame={EMPTY_FRAME} frozen />)
    expect(container.querySelector('pre')!.textContent).toBe('')
  })
})

describe('GameCanvas — responsive', () => {
  it('re-measures and repaints when the container is resized', () => {
    const c = withCanvas()
    const observers: (() => void)[] = []
    class RO {
      constructor(private cb: () => void) { observers.push(() => this.cb()) }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)
    try {
      const { container } = render(<GameCanvas frame={frame('o', 4, 2)} frozen />)
      const el = container.querySelector('canvas')!
      const host = container.querySelector('[data-kb-game]') as HTMLElement
      Object.defineProperty(host, 'clientWidth', { value: 400, configurable: true })
      act(() => { for (const fire of observers) fire() })
      // 400px over 4 columns would be 100px a cell, capped at MAX_CELL (16).
      expect(el.style.width).toBe('64px')
    } finally {
      c.restore()
    }
  })

  it('works without a ResizeObserver instead of throwing', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => render(<GameCanvas frame={frame('o')} frozen />)).not.toThrow()
  })
})
