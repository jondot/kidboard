import { describe, it, expect } from 'vitest'
import fart from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (locale: Locale = 'en') => {
  const h = testCtx({ locale, strings: fart.strings })
  const heard: string[] = []
  h.ctx.audio.hit = (v: string) => { heard.push(v) }
  return { ...h, heard, inst: fart.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, fart.size, cols)

const discs = (inst: LiveInstance): Extract<DrawCmd, { op: 'disc' }>[] =>
  cmds(inst).filter((c) => c.op === 'disc') as Extract<DrawCmd, { op: 'disc' }>[]
const rings = (inst: LiveInstance): Extract<DrawCmd, { op: 'circle' }>[] =>
  cmds(inst).filter((c) => c.op === 'circle') as Extract<DrawCmd, { op: 'circle' }>[]

describe('fart', () => {
  it('draws four cushions, each bigger than the last', () => {
    const { inst } = start()
    const r = discs(inst).map((d) => d.r)
    expect(r).toHaveLength(4)
    // Size is the ONLY thing telling the pads apart, so the ordering is the
    // game's entire legend and a regression here is a silent one.
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]!)
  })

  it('gives each key its own voice, small to large', () => {
    const { inst, heard } = start()
    press(inst, 'a'); press(inst, 's'); press(inst, 'd'); press(inst, 'f')
    expect(heard).toEqual(['squeak', 'toot', 'rumble', 'blast'])
  })

  it('ignores a key that is not a pad', () => {
    const { inst, heard } = start()
    press(inst, 'q'); press(inst, 'ArrowUp')
    expect(heard).toEqual([])
  })

  it('puffs a hollow ring that grows and then goes', () => {
    const { inst } = start()
    expect(rings(inst)).toHaveLength(0)
    press(inst, 'f')
    const first = rings(inst)
    expect(first).toHaveLength(1)
    ticks(inst, 12)
    const later = rings(inst)
    expect(later[0]!.r).toBeGreaterThan(first[0]!.r)
    // And it does not outstay the press.
    ticks(inst, 60)
    expect(rings(inst)).toHaveLength(0)
  })

  it('never lets a leaned-on key fill the screen with rings', () => {
    const { inst } = start()
    for (let i = 0; i < 40; i++) press(inst, 'd')
    expect(rings(inst).length).toBeLessThanOrEqual(8)
  })

  it('squashes the pad that was pressed, and lets it back up', () => {
    const { inst } = start()
    const rest = discs(inst)[3]!
    press(inst, 'f')
    const hit = discs(inst)[3]!
    // Smaller, and lower — a cushion sat on keeps its bottom on the floor.
    expect(hit.r).toBeLessThan(rest.r)
    expect(hit.y).toBeGreaterThan(rest.y)
    ticks(inst, 20)
    expect(discs(inst)[3]!.r).toBeCloseTo(rest.r, 5)
    expect(discs(inst)[3]!.y).toBeCloseTo(rest.y, 5)
  })

  it('rests every cushion on the same floor, whatever its size', () => {
    const { inst } = start()
    const floors = discs(inst).map((d) => d.y + d.r * 0.6)
    for (const f of floors) expect(f).toBeCloseTo(floors[0]!, 5)
  })

  it('says something warm before anything has been pressed', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('fart.souvenir.none'))
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('names what happened without counting it', () => {
    const { inst } = start()
    press(inst, 'a')
    expect(inst.souvenir?.()).not.toMatch(/\d/)
    press(inst, 's'); press(inst, 'd'); press(inst, 'f')
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, 'f')
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('draws the same picture on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, fart.size)).toMatchSnapshot()
    expect(pixelsOf(inst, fart.size, 60)).toMatchSnapshot()
  })
})
