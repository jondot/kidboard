import { describe, it, expect } from 'vitest'
import { MAX_CMDS, replay, sanitizeBlocks, sanitizeCmds } from './protocol'
import { Canvas, rasterize, frameToString } from '../runtime/Canvas'
import type { DrawCmd } from '../types'

describe('a buffer from a stranger is read, never trusted', () => {
  it('drops anything that is not a command', () => {
    expect(sanitizeCmds(null)).toEqual([])
    expect(sanitizeCmds('draw everything')).toEqual([])
    expect(sanitizeCmds([null, 3, 'x', {}, { op: 'launch' }])).toEqual([])
  })

  it('replaces a coordinate that is not a number with zero', () => {
    expect(sanitizeCmds([{ op: 'put', x: NaN, y: Infinity, ch: 'x', tone: 'win' }]))
      .toEqual([{ op: 'put', x: 0, y: 0, ch: 'x', tone: 'win' }])
    expect(sanitizeCmds([{ op: 'disc', x: '4', y: {}, r: -3, tone: 'art' }]))
      .toEqual([{ op: 'disc', x: 0, y: 0, r: -3, tone: 'art' }])
  })

  it('falls back to the plain tone rather than inventing a colour', () => {
    expect(sanitizeCmds([{ op: 'text', x: 0, y: 0, text: 'hi', tone: 'neon' }])[0])
      .toMatchObject({ tone: 'plain' })
  })

  it('keeps fractional coordinates, which is the whole point of the buffer', () => {
    expect(sanitizeCmds([{ op: 'disc', x: 12.4, y: 3.75, r: 2.5, tone: 'warm' }])[0])
      .toMatchObject({ x: 12.4, y: 3.75, r: 2.5 })
  })

  it('refuses a frame long enough to be a denial rather than a picture', () => {
    const many = Array.from({ length: MAX_CMDS + 500 }, () => ({ op: 'clear' }))
    expect(sanitizeCmds(many)).toHaveLength(MAX_CMDS)
  })

  it('caps a sprite and a run of text rather than letting one grow forever', () => {
    const long = 'x'.repeat(50000)
    const rows = Array.from({ length: 5000 }, () => long)
    const out = sanitizeCmds([{ op: 'sprite', x: 0, y: 0, rows, tone: 'art', scale: 1e9 }])
    const s = out[0] as Extract<DrawCmd, { op: 'sprite' }>
    expect(s.rows.length).toBeLessThanOrEqual(128)
    expect(s.rows[0]!.length).toBeLessThanOrEqual(400)
    expect(s.scale).toBeLessThanOrEqual(16)
  })

  it('keeps only text blocks and art blocks when a cart says something', () => {
    expect(sanitizeBlocks([{ kind: 'art', art: 'oo', tone: 'win' }, { kind: 'iframe', src: 'x' }]))
      .toEqual([
        { kind: 'art', art: 'oo', tone: 'win' },
        { kind: 'text', text: '', tone: 'plain' },
      ])
    expect(sanitizeBlocks('hello')).toEqual([])
  })
})

describe('replay puts a cart on the same canvas a built-in draws on', () => {
  it('reproduces the picture the cart recorded', () => {
    const source = new Canvas(8, 3)
    source.text(0, 0, 'hi')
    source.put(3, 1, '*', 'win')
    source.box(0, 0, 4, 3, 'art')

    const target = new Canvas(8, 3)
    replay(sanitizeCmds(JSON.parse(JSON.stringify(source.cmds()))), target)

    expect(frameToString(rasterize(target.cmds(), 8, 3)))
      .toBe(frameToString(rasterize(source.cmds(), 8, 3)))
  })

  it('carries every op across, including the pixel ones', () => {
    const source = new Canvas(8, 8)
    source.clear(); source.rect(0, 0, 8, 8, 'art'); source.outline(0, 0, 8, 8, 'cool', 2)
    source.line(0, 0, 7, 7); source.disc(4, 4, 2); source.circle(4, 4, 3)
    source.emoji(1, 1, '🐱'); source.sprite(0, 0, ['x.'], 'warm', { flipY: true, scale: 3 })

    const target = new Canvas(8, 8)
    replay(source.cmds(), target)
    expect(target.cmds()).toEqual(source.cmds())
  })
})
