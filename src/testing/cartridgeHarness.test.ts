import { describe, it, expect } from 'vitest'
import type { CanvasLike, GameSize, LiveInstance } from '../types'
import { frameOf, pixelsOf, cmdsOf, testCtx } from './cartridgeHarness'

const SIZE: GameSize = { cols: 10, aspect: 10 * 0.6 / 4 }   // a 10x4 grid

const inst = (draw: (c: CanvasLike) => void): LiveInstance => ({ draw })

describe('frameOf', () => {
  it('is the character model of a frame', () => {
    const f = frameOf(inst((c) => { c.clear(); c.put(1, 1, 'o') }), SIZE)
    expect(f.split('\n')).toHaveLength(4)
    expect(f.split('\n')[1]).toBe(' o        ')
  })

  // THE ANTI-DIVERGENCE GUARD. A shape-drawing game has nothing in the
  // character model, so `frameOf` would return a blank grid — and a blank
  // grid is exactly the shape of a test that passes while the screen is
  // wrong. Rather than hand back that lie, say what to use instead.
  it('refuses to hand back a blank grid for a game that drew only shapes', () => {
    expect(() => frameOf(inst((c) => { c.clear(); c.rect(0, 0, 8, 8, 'warm') }), SIZE))
      .toThrow(/pixelsOf/)
  })

  it('still works for a game that draws both, since the characters are real', () => {
    const f = frameOf(inst((c) => {
      c.clear()
      c.rect(0, 0, 8, 8, 'warm')
      c.text(0, 0, 'hi')
    }), SIZE)
    expect(f.split('\n')[0]).toBe('hi        ')
  })
})

describe('pixelsOf', () => {
  it('is the full-resolution pixel model, one character per logical pixel', () => {
    const rows = pixelsOf(inst((c) => {
      c.clear()
      c.rect(0, 0, 4, 2, 'warm')
    }), SIZE).split('\n')
    expect(rows).toHaveLength(4 * 8)
    expect(rows[0]).toHaveLength(10 * 8)
    expect(rows[0]!.startsWith('####.')).toBe(true)
    expect(rows[2]!.startsWith('.....')).toBe(true)
  })

  it('reads the wider grid a wide window would hand the game', () => {
    const rows = pixelsOf(inst((c) => { c.clear(); c.rect(0, 0, c.pw, 1, 'warm') }),
      SIZE, 20).split('\n')
    expect(rows[0]).toHaveLength(20 * 8)
    expect(rows[0]).toBe('#'.repeat(160))
  })
})

describe('cmdsOf', () => {
  it('hands back the recorded buffer for a game to be asserted on directly', () => {
    const cmds = cmdsOf(inst((c) => { c.clear(); c.disc(4, 4, 2, 'warm') }), SIZE)
    expect(cmds).toEqual([
      { op: 'clear' },
      { op: 'disc', x: 4, y: 4, r: 2, tone: 'warm' },
    ])
  })
})

describe('testCtx', () => {
  it('is still a plain seeded ctx', () => {
    const { ctx } = testCtx({ seed: 3 })
    expect(ctx.locale).toBe('en')
    expect(typeof ctx.rng.float()).toBe('number')
  })
})
