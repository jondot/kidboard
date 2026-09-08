import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CanvasView } from './CanvasView'
import type { Cell } from '../types'
import { Canvas, rasterize, frameToString } from './Canvas'

const row = (s: string, tone: Cell['tone'] = 'plain'): Cell[] =>
  [...s].map((ch) => ({ ch, tone }))

describe('CanvasView', () => {
  it('renders LTR with bidi isolation regardless of page direction', () => {
    const { container } = render(<CanvasView cells={[row('ab')]} />)
    const pre = container.querySelector('pre')!
    expect(pre.getAttribute('dir')).toBe('ltr')
    expect(pre.className).toContain('kb-art')
  })

  it('renders the grid text', () => {
    const { container } = render(<CanvasView cells={[row('ab'), row('cd')]} />)
    expect(container.querySelector('pre')!.textContent).toBe('ab\ncd')
  })

  it('coalesces runs of the same tone into one span', () => {
    const cells: Cell[][] = [[
      ...row('aa', 'warm'), ...row('bb', 'win'),
    ]]
    const { container } = render(<CanvasView cells={cells} />)
    expect(container.querySelectorAll('span').length).toBe(2)
  })

  it('renders an empty grid without crashing', () => {
    const { container } = render(<CanvasView cells={[]} />)
    expect(container.querySelector('pre')!.textContent).toBe('')
  })

  // An emoji glyph is never exactly two monospace advances in any browser —
  // it is served by a fallback font — so the two-cell reservation the
  // rasterizer makes has to be enforced in CSS. Each emoji gets its own
  // `.kb-cell2` span of `width: 2ch`, and its empty continuation cell is
  // skipped so the frame string is unchanged.
  it('renders an emoji as exactly one 2ch-wide span and leaves the frame width alone', () => {
    const c = new Canvas(6, 1)
    c.text(0, 0, 'ab')
    c.emoji(2, 0, '🐟')
    c.text(4, 0, 'cd')
    const cells = rasterize(c.cmds(), 6, 1)

    expect(frameToString(cells)).toBe('ab🐟cd')

    const { container } = render(<CanvasView cells={cells} />)
    expect(container.querySelectorAll('.kb-cell2').length).toBe(1)
    expect(container.querySelector('.kb-cell2')!.textContent).toBe('🐟')
    expect(container.querySelector('pre')!.textContent).toBe('ab🐟cd')
  })

  it('gives every emoji on a row its own 2ch span', () => {
    const c = new Canvas(8, 1)
    for (let x = 0; x < 8; x += 2) c.emoji(x, 0, '🐟')
    const { container } = render(
      <CanvasView cells={rasterize(c.cmds(), 8, 1)} />,
    )
    expect(container.querySelectorAll('.kb-cell2').length).toBe(4)
  })

  it('applies the tone class of each run', () => {
    const { container } = render(<CanvasView cells={[row('x', 'magic')]} />)
    expect(container.querySelector('span')!.className).toContain('kb-tone-magic')
  })
})
