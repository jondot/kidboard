import { describe, it, expect } from 'vitest'
import type { DrawCmd, Tone } from '../types'
import { CELL_ASPECT } from './GridCanvas'
import {
  PX_PER_CELL, PIXEL_ASPECT,
  eachRect, isShape, rasterizePixels, pixelArt,
} from './shapes'

const rects = (cmd: DrawCmd): { x: number; y: number; w: number; h: number }[] => {
  const out: { x: number; y: number; w: number; h: number }[] = []
  if (!isShape(cmd)) return out
  eachRect(cmd, (x, y, w, h) => out.push({ x, y, w, h }))
  return out
}

/** Draws one command into a pw x ph pixel field and returns it as art. */
const art = (cmd: DrawCmd, pw: number, ph: number): string =>
  pixelArt(rasterizePixels([cmd], pw, ph))

describe('the pixel field', () => {
  it('subdivides a character cell into 8 x 8 logical pixels', () => {
    expect(PX_PER_CELL).toBe(8)
  })

  // A logical pixel is a cell, divided the same number of times on both axes,
  // so it inherits the cell's shape exactly: taller than it is wide. Anything
  // that wants to look round (a disc) has to compensate by this number, and it
  // is only ever right if it is the SAME number the layout uses for a cell.
  it('gives a logical pixel exactly the shape of a cell', () => {
    expect(PIXEL_ASPECT).toBe(CELL_ASPECT)
  })
})

describe('rect', () => {
  it('is one rectangle, fractions and all', () => {
    expect(rects({ op: 'rect', x: 2.25, y: 3.5, w: 4, h: 5, tone: 'warm' }))
      .toEqual([{ x: 2.25, y: 3.5, w: 4, h: 5 }])
  })

  it('draws nothing for an empty or backwards extent', () => {
    expect(rects({ op: 'rect', x: 1, y: 1, w: 0, h: 4, tone: 'warm' })).toEqual([])
    expect(rects({ op: 'rect', x: 1, y: 1, w: -3, h: 4, tone: 'warm' })).toEqual([])
  })

  it('draws nothing for a non-finite extent instead of hanging', () => {
    expect(rects({ op: 'rect', x: NaN, y: 1, w: 4, h: 4, tone: 'warm' })).toEqual([])
    expect(rects({ op: 'rect', x: 1, y: 1, w: Infinity, h: 4, tone: 'warm' })).toEqual([])
  })
})

describe('outline', () => {
  it('is four bars, hollow in the middle', () => {
    expect(art({ op: 'outline', x: 0, y: 0, w: 6, h: 4, t: 1, tone: 'cool' }, 6, 4))
      .toBe([
        '######',
        '#....#',
        '#....#',
        '######',
      ].join('\n'))
  })

  it('thickens inwards, never outwards', () => {
    expect(art({ op: 'outline', x: 0, y: 0, w: 6, h: 5, t: 2, tone: 'cool' }, 6, 5))
      .toBe([
        '######',
        '######',
        '##..##',
        '######',
        '######',
      ].join('\n'))
  })

  it('collapses to a filled rectangle when the walls meet', () => {
    expect(art({ op: 'outline', x: 0, y: 0, w: 4, h: 3, t: 9, tone: 'cool' }, 4, 3))
      .toBe(['####', '####', '####'].join('\n'))
  })
})

describe('line', () => {
  it('merges a horizontal run into one rectangle', () => {
    expect(rects({ op: 'line', x: 0, y: 0, x2: 3, y2: 0, tone: 'art' }))
      .toEqual([{ x: 0, y: 0, w: 4, h: 1 }])
  })

  it('steps a diagonal one pixel at a time', () => {
    expect(rects({ op: 'line', x: 0, y: 0, x2: 2, y2: 2, tone: 'art' }))
      .toEqual([
        { x: 0, y: 0, w: 1, h: 1 },
        { x: 1, y: 1, w: 1, h: 1 },
        { x: 2, y: 2, w: 1, h: 1 },
      ])
  })

  it('draws the same pixels in either direction', () => {
    const a = art({ op: 'line', x: 1, y: 0, x2: 6, y2: 3, tone: 'art' }, 8, 4)
    const b = art({ op: 'line', x: 6, y: 3, x2: 1, y2: 0, tone: 'art' }, 8, 4)
    expect(a).toBe(b)
  })

  it('is a single pixel when both ends are the same', () => {
    expect(rects({ op: 'line', x: 2, y: 2, x2: 2, y2: 2, tone: 'art' }))
      .toEqual([{ x: 2, y: 2, w: 1, h: 1 }])
  })

  // A moving line keeps its fractional origin: the pixel PATTERN is integral
  // (that is the blockiness), the placement is not (that is the smoothness).
  it('carries a fractional origin through to every pixel', () => {
    expect(rects({ op: 'line', x: 2.4, y: 1, x2: 4.4, y2: 1, tone: 'art' }))
      .toEqual([{ x: 2.4, y: 1, w: 3, h: 1 }])
  })

  it('survives a non-finite or absurd endpoint without hanging', () => {
    expect(rects({ op: 'line', x: 0, y: 0, x2: NaN, y2: 4, tone: 'art' })).toEqual([])
    const huge = rects({ op: 'line', x: 0, y: 0, x2: 1e9, y2: 0, tone: 'art' })
    expect(huge.length).toBeLessThan(100)
  })
})

describe('disc and circle', () => {
  it('is a blocky, filled blob that is wider than it is tall', () => {
    // Wider in PIXELS precisely because a pixel is taller than it is wide:
    // 7 across by 5 down is very nearly square on screen.
    expect(art({ op: 'disc', x: 3, y: 2, r: 3, tone: 'warm' }, 7, 5))
      .toBe([
        '.#####.',
        '#######',
        '#######',
        '#######',
        '.#####.',
      ].join('\n'))
  })

  it('is symmetric about its centre', () => {
    const rows = pixelArt(
      rasterizePixels([{ op: 'disc', x: 4, y: 4, r: 4, tone: 'warm' }], 9, 9),
    ).split('\n')
    for (const row of rows) expect(row).toBe([...row].reverse().join(''))
    expect(rows).toEqual([...rows].reverse())
  })

  it('draws a hollow ring for circle', () => {
    expect(art({ op: 'circle', x: 3, y: 2, r: 3, tone: 'warm' }, 7, 5))
      .toBe([
        '.#####.',
        '#.....#',
        '#.....#',
        '#.....#',
        '.#####.',
      ].join('\n'))
  })

  it('draws nothing for a radius below half a pixel, and never hangs on a huge one', () => {
    expect(rects({ op: 'disc', x: 2, y: 2, r: 0, tone: 'warm' })).toEqual([])
    expect(rects({ op: 'disc', x: 2, y: 2, r: NaN, tone: 'warm' })).toEqual([])
    expect(rects({ op: 'disc', x: 2, y: 2, r: 1e9, tone: 'warm' }).length)
      .toBeLessThan(5000)
  })
})

describe('sprite', () => {
  const FISH = [
    ' ## ',
    '####',
    ' ## ',
  ]

  it('reads a small array of strings: any character is on, a space is off', () => {
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: FISH, tone: 'cool', flipX: false, flipY: false, scale: 1 },
      4, 3,
    )).toBe(['.##.', '####', '.##.'].join('\n'))
  })

  it('merges a row into runs rather than one rectangle per pixel', () => {
    expect(rects({
      op: 'sprite', x: 1, y: 1, rows: ['# #'], tone: 'cool',
      flipX: false, flipY: false, scale: 1,
    })).toEqual([
      { x: 1, y: 1, w: 1, h: 1 },
      { x: 3, y: 1, w: 1, h: 1 },
    ])
  })

  it('mirrors horizontally, so a fish can swim both ways', () => {
    const swimmer = ['>># ', '####']
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: swimmer, tone: 'cool', flipX: true, flipY: false, scale: 1 },
      4, 2,
    )).toBe(['.###', '####'].join('\n'))
  })

  it('mirrors vertically', () => {
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: ['##', '  '], tone: 'cool', flipX: false, flipY: true, scale: 1 },
      2, 2,
    )).toBe(['..', '##'].join('\n'))
  })

  // ONLY a space is off. A contributor who reaches for '.' as a hole gets a
  // solid block, which is why the rule is stated this bluntly in the README:
  // any character at all — '#', 'o', '<' — is a lit pixel.
  it('treats a dot as a lit pixel, because only a space is off', () => {
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: ['.o<'], tone: 'cool', flipX: false, flipY: false, scale: 1 },
      3, 1,
    )).toBe('###')
  })

  it('pads a ragged row instead of misaligning the mirror', () => {
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: ['#', '###'], tone: 'cool', flipX: true, flipY: false, scale: 1 },
      3, 2,
    )).toBe(['..#', '###'].join('\n'))
  })

  it('scales by whole pixels', () => {
    expect(art(
      { op: 'sprite', x: 0, y: 0, rows: ['# '], tone: 'cool', flipX: false, flipY: false, scale: 2 },
      4, 2,
    )).toBe(['##..', '##..'].join('\n'))
  })

  it('keeps a fractional position while the pattern stays integral', () => {
    expect(rects({
      op: 'sprite', x: 2.5, y: 1.25, rows: ['##'], tone: 'cool',
      flipX: false, flipY: false, scale: 1,
    })).toEqual([{ x: 2.5, y: 1.25, w: 2, h: 1 }])
  })

  it('survives an empty, blank or absurd bitmap', () => {
    const blank = (rows: string[], scale = 1) => rects({
      op: 'sprite', x: 0, y: 0, rows, tone: 'cool', flipX: false, flipY: false, scale,
    })
    expect(blank([])).toEqual([])
    expect(blank(['   '])).toEqual([])
    expect(blank(['#'], 0)).toEqual([])
    expect(blank(['#'], NaN)).toEqual([])
  })
})

describe('rasterizePixels', () => {
  const grid = (cmds: DrawCmd[], w = 6, h = 3) => rasterizePixels(cmds, w, h)

  it('is the integer model of the pixel field, tones and all', () => {
    const g = grid([{ op: 'rect', x: 1, y: 1, w: 2, h: 1, tone: 'magic' }])
    expect(g[1]![1]).toBe<Tone>('magic')
    expect(g[1]![2]).toBe<Tone>('magic')
    expect(g[1]![3]).toBe(null)
    expect(g[0]![0]).toBe(null)
  })

  it('rounds a fractional edge to the nearest whole pixel', () => {
    expect(pixelArt(grid([{ op: 'rect', x: 1.4, y: 0, w: 2, h: 1, tone: 'warm' }], 6, 1)))
      .toBe('.##...')
    expect(pixelArt(grid([{ op: 'rect', x: 1.6, y: 0, w: 2, h: 1, tone: 'warm' }], 6, 1)))
      .toBe('..##..')
  })

  it('clips outside the field instead of throwing', () => {
    expect(() => grid([
      { op: 'rect', x: -20, y: -20, w: 4, h: 4, tone: 'warm' },
      { op: 'rect', x: 900, y: 900, w: 4, h: 4, tone: 'warm' },
      { op: 'rect', x: -2, y: -1, w: 40, h: 40, tone: 'warm' },
    ])).not.toThrow()
  })

  it('clear wipes the pixel field, exactly as it wipes the character grid', () => {
    expect(pixelArt(grid([
      { op: 'rect', x: 0, y: 0, w: 6, h: 3, tone: 'warm' },
      { op: 'clear' },
    ]))).toBe(['......', '......', '......'].join('\n'))
  })

  // The two models are deliberately separate: characters are not pixels and
  // pretending otherwise is how a game comes to look right in a test and
  // wrong on screen.
  it('ignores the character ops, which have their own model', () => {
    expect(pixelArt(grid([
      { op: 'text', x: 0, y: 0, text: 'hi', tone: 'plain' },
      { op: 'put', x: 1, y: 1, ch: 'o', tone: 'plain' },
      { op: 'box', x: 0, y: 0, w: 4, h: 3, tone: 'plain' },
      { op: 'emoji', x: 0, y: 0, emoji: '🐟' },
    ]))).toBe(['......', '......', '......'].join('\n'))
  })

  it('paints later commands over earlier ones', () => {
    const g = grid([
      { op: 'rect', x: 0, y: 0, w: 6, h: 3, tone: 'cool' },
      { op: 'rect', x: 1, y: 1, w: 1, h: 1, tone: 'win' },
    ])
    expect(g[1]![1]).toBe<Tone>('win')
    expect(g[0]![0]).toBe<Tone>('cool')
  })
})
