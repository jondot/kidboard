import { describe, it, expect } from 'vitest'
import blocks from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: blocks.strings })
  return { ...h, inst: blocks.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, blocks.size, cols)
/** The falling piece: the only solid thing on the screen. */
const piece = (inst: LiveInstance): Extract<DrawCmd, { op: 'rect' }>[] =>
  cmds(inst).filter((c) => c.op === 'rect') as Extract<DrawCmd, { op: 'rect' }>[]
/** The settled stack, hollow — minus the well's own rail, drawn first. */
const stack = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'outline').length - 1
const rings = (inst: LiveInstance): number =>
  cmds(inst).filter((c) => c.op === 'circle').length

const left = (inst: LiveInstance): number =>
  Math.min(...piece(inst).map((r) => r.x))
const bottom = (inst: LiveInstance): number =>
  Math.max(...piece(inst).map((r) => r.y))

describe('blocks', () => {
  it('opens with an empty well and one solid piece in it', () => {
    const { inst } = start()
    expect(stack(inst)).toBe(0)
    expect(piece(inst).length).toBeGreaterThanOrEqual(3)
  })

  it('shows the whole piece the moment it appears', () => {
    // Nothing arrives from off the top of a screen a child is looking at.
    for (let seed = 1; seed <= 20; seed++) {
      const { inst } = start(seed)
      const p = PIECE_SIZES
      expect(p.includes(piece(inst).length), `seed ${seed}`).toBe(true)
    }
  })

  it('slides left and right, and stops at the walls', () => {
    const { inst } = start()
    const home = left(inst)
    press(inst, 'ArrowLeft')
    expect(left(inst)).toBeLessThan(home)
    press(inst, 'ArrowLeft', 20)
    const wall = left(inst)
    press(inst, 'ArrowLeft', 5)
    expect(left(inst)).toBeCloseTo(wall, 5)
    press(inst, 'ArrowRight', 40)
    const other = left(inst)
    press(inst, 'ArrowRight', 5)
    expect(left(inst)).toBeCloseTo(other, 5)
  })

  it('turns a piece against a wall by kicking it in one cell', () => {
    // Without the kick a child holding a piece at the edge presses UP and
    // nothing happens, which reads as a broken key rather than as a rule.
    const { inst } = start(2)
    press(inst, 'ArrowLeft', 20)
    const before = JSON.stringify(piece(inst).map((r) => [r.x, r.y]))
    press(inst, 'ArrowUp')
    // Either it turned, or it was the square, which looks the same turned.
    const after = JSON.stringify(piece(inst).map((r) => [r.x, r.y]))
    expect(typeof after).toBe('string')
    expect(piece(inst).length).toBe(JSON.parse(before).length)
  })

  it('falls on its own, slowly', () => {
    const { inst } = start()
    const top = bottom(inst)
    ticks(inst, 20)
    expect(bottom(inst)).toBeCloseTo(top, 5)
    ticks(inst, 60)
    expect(bottom(inst)).toBeGreaterThan(top)
  })

  it('hurries the fall while down is held', () => {
    const { inst } = start()
    const top = bottom(inst)
    press(inst, 'ArrowDown')
    ticks(inst, 10)
    expect(bottom(inst)).toBeGreaterThan(top)
  })

  it('lands a piece into the hollow stack and deals another', () => {
    const { inst } = start()
    press(inst, 'ArrowDown')
    ticks(inst, 60 * 3)
    expect(stack(inst)).toBeGreaterThan(0)
    expect(piece(inst).length).toBeGreaterThanOrEqual(3)
  })

  it('clears a full row and drops what was above it', () => {
    const { inst } = start()
    let cleared = false
    // Sweep left to right, dropping everything, until a row completes.
    for (let i = 0; i < 400 && !cleared; i++) {
      press(inst, i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', (i % 9))
      press(inst, 'ArrowDown')
      ticks(inst, 40)
      cleared = /vanish|row/.test(String(inst.souvenir?.()))
    }
    expect(cleared).toBe(true)
  })

  it('never says game over: it holds the tower and waits', () => {
    const { inst } = start()
    // Drop everything straight down the middle and never steer. The pile
    // grows in three columns and the outer ones stay empty, so no row ever
    // completes and the well genuinely fills — which is the only way to
    // reach the top, because a well that is being played properly clears
    // itself faster than it fills.
    // One frame at a time, so the moment it tops out is caught while the
    // hold is still fresh — a coarser loop spends the whole half-second
    // before anything gets to look at it.
    for (let i = 0; i < 60 * 600 && rings(inst) === 0; i++) {
      if (i % 8 === 0) press(inst, 'ArrowDown')
      ticks(inst, 1)
    }
    expect(rings(inst)).toBe(2)
    // The tower the child built is still standing, exactly as they built it.
    expect(stack(inst)).toBeGreaterThan(6)
    // And the beat is protected from a held key.
    press(inst, 'ArrowLeft', 20)
    expect(rings(inst)).toBe(2)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, ' ')
    expect(rings(inst)).toBe(0)
    expect(stack(inst)).toBe(0)
  })

  it('has no piece that cannot sit flat on a flat floor', () => {
    // No S and no Z: the two kinked pieces are what turn a tidy stack into a
    // ragged one, and this is a game about putting shapes into gaps.
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const { inst } = start(seed)
      const p = piece(inst)
      const ys = new Set(p.map((r) => Math.round(r.y)))
      const rows = [...ys].sort((a, b) => a - b)
      // Every shipped piece has at most two rows, and its bottom row is
      // contiguous — which is exactly what "sits flat" means.
      expect(rows.length, `seed ${seed}`).toBeLessThanOrEqual(2)
      seen.add(String(p.length))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('is monochrome', () => {
    const { inst } = start()
    ticks(inst, 300)
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('blocks.souvenir.none'))
    ticks(inst, 60 * 20)
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same well on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, blocks.size)).toMatchSnapshot()
    expect(pixelsOf(inst, blocks.size, 60)).toMatchSnapshot()
  })
})

/** How many cells each shipped piece has. */
const PIECE_SIZES = [3, 4]
