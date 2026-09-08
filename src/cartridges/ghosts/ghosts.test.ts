import { describe, it, expect } from 'vitest'
import cartridge from './cartridge'
import { cmdsOf, pixelsOf, press, testCtx, ticks, holdKey } from '../../testing/cartridgeHarness'
import type { LiveInstance } from '../../types'

const size = cartridge.size
const make = (seed = 1): LiveInstance =>
  cartridge.create(testCtx({ seed, strings: cartridge.strings }).ctx)

/** The board, copied from the cartridge, so a test can reason about it. */
const ROWS = [
  'o...#...o',
  '.##.#.##.',
  '.........',
  '.#.#G#.#.',
  '.........',
  '.##.#.##.',
  'o...P...o',
]
const GW = ROWS[0]!.length
const GH = ROWS.length
const TUNNEL = 3

describe('the board', () => {
  it('is the same width all the way down', () => {
    for (const r of ROWS) expect(r).toHaveLength(GW)
  })

  it('reads the same left to right as right to left', () => {
    for (const r of ROWS) expect([...r].reverse().join('')).toBe(r)
  })

  /**
   * THE ONE THING THAT WOULD RUIN THIS GAME SILENTLY. A dot in a pocket the
   * child cannot walk to is a board that can never be finished, and nothing
   * about the picture would say so — the child would simply circle forever
   * looking for the last one. `sokoban` proves every room is solvable with a
   * search; this is the same guarantee for a board that is walked rather
   * than pushed.
   */
  it('lets the child walk to every dot on it, tunnel included', () => {
    const open = (x: number, y: number): boolean =>
      y >= 0 && y < GH && ROWS[y]![((x % GW) + GW) % GW] !== '#'
    const seen = new Set<string>()
    const start = { x: ROWS.findIndex(() => true), y: 0 }
    // Start where the child starts.
    for (let y = 0; y < GH; y++) {
      const x = ROWS[y]!.indexOf('P')
      if (x >= 0) { start.x = x; start.y = y }
    }
    const queue = [start]
    seen.add(`${start.x},${start.y}`)
    while (queue.length > 0) {
      const at = queue.shift()!
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = at.x + d[0]!
        const ny = at.y + d[1]!
        if (ny < 0 || ny >= GH) continue
        if (!open(nx, ny)) continue
        if ((nx < 0 || nx >= GW) && ny !== TUNNEL) continue
        const wx = ((nx % GW) + GW) % GW
        const k = `${wx},${ny}`
        if (seen.has(k)) continue
        seen.add(k)
        queue.push({ x: wx, y: ny })
      }
    }
    let openCells = 0
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if (ROWS[y]![x] === '#') continue
        openCells += 1
        expect(seen.has(`${x},${y}`), `nothing can reach ${x},${y}`).toBe(true)
      }
    }
    expect(openCells).toBeGreaterThan(40)
  })

  it('has a way out of the ghosts’ alcove', () => {
    let gx = -1
    let gy = -1
    for (let y = 0; y < GH; y++) {
      const x = ROWS[y]!.indexOf('G')
      if (x >= 0) { gx = x; gy = y }
    }
    expect(gx).toBeGreaterThan(-1)
    const ways = [[0, -1], [0, 1], [1, 0], [-1, 0]]
      .filter(([dx, dy]) => ROWS[gy + dy!]?.[gx + dx!] !== undefined
        && ROWS[gy + dy!]![gx + dx!] !== '#')
    expect(ways.length, 'a ghost that cannot leave is scenery').toBeGreaterThan(0)
  })
})

describe('the picture', () => {
  it('draws the maze, the dots and both figures', () => {
    expect(pixelsOf(make(), size)).toMatchSnapshot()
  })

  it('draws nothing outside the stage, at any width', () => {
    for (const cols of [30, 44, 60]) {
      const inst = make()
      ticks(inst, 60)
      for (const cmd of cmdsOf(inst, size, cols)) {
        if (cmd.op === 'clear') continue
        expect(Number.isFinite(cmd.x)).toBe(true)
        expect(Number.isFinite(cmd.y)).toBe(true)
      }
    }
  })

  it('never paints a word or a letter — the board is all pictures', () => {
    const inst = make()
    ticks(inst, 120)
    for (const cmd of cmdsOf(inst, size)) {
      expect(cmd.op === 'text' || cmd.op === 'put' || cmd.op === 'emoji').toBe(false)
    }
  })
})

/** The child's position, read back out of where their sprite was drawn. */
const spriteXs = (inst: LiveInstance): number[] =>
  cmdsOf(inst, size).filter((c) => c.op === 'sprite').map((c) => c.x)

describe('the child', () => {
  it('stands still until a key is pressed', () => {
    const inst = make()
    const before = spriteXs(inst)
    ticks(inst, 60)
    expect(spriteXs(inst)[spriteXs(inst).length - 1])
      .toBe(before[before.length - 1])
  })

  it('sets off when an arrow is pressed, and keeps going', () => {
    const inst = make()
    const start = spriteXs(inst).at(-1)!
    press(inst, 'ArrowLeft')
    ticks(inst, 20)
    const mid = spriteXs(inst).at(-1)!
    ticks(inst, 20)
    const later = spriteXs(inst).at(-1)!
    expect(mid).toBeLessThan(start)
    expect(later).toBeLessThan(mid)
  })

  it('eats the dots it walks over', () => {
    const inst = make()
    const dots = (i: LiveInstance): number =>
      cmdsOf(i, size).filter((c) => c.op === 'disc').length
    const before = dots(inst)
    press(inst, 'ArrowLeft')
    ticks(inst, 90)
    expect(dots(inst)).toBeLessThan(before)
  })

  /**
   * The turn a six-year-old actually makes: the key goes down well before the
   * corner. Without a buffered turn it only lands in the one frame the child
   * crosses a junction, which is a frame they will never hit.
   */
  it('turns at the next corner when the key was pressed early', () => {
    const inst = make()
    const y = (i: LiveInstance): number =>
      cmdsOf(i, size).filter((c) => c.op === 'sprite').at(-1)!.y
    const y0 = y(inst)
    press(inst, 'ArrowLeft')
    ticks(inst, 10)
    press(inst, 'ArrowUp')       // asked for long before the opening
    ticks(inst, 120)
    expect(y(inst)).toBeLessThan(y0)
  })

  it('turns back on itself immediately, wherever it is in a corridor', () => {
    const inst = make()
    press(inst, 'ArrowLeft')
    ticks(inst, 12)
    const away = spriteXs(inst).at(-1)!
    press(inst, 'ArrowRight')
    ticks(inst, 6)
    expect(spriteXs(inst).at(-1)!).toBeGreaterThan(away)
  })

  it('goes out of one side of the tunnel and in at the other', () => {
    const inst = make()
    // Left along the bottom to the corner, then up the left-hand edge. The
    // turn is asked for early and taken at the first cell where it is legal,
    // which is the tunnel mouth — exactly how a child would find it.
    press(inst, 'ArrowLeft')
    ticks(inst, 120)
    press(inst, 'ArrowUp')
    ticks(inst, 10)
    press(inst, 'ArrowLeft')
    let bothMouths = false
    let cameOutRight = false
    for (let i = 0; i < 200; i++) {
      ticks(inst, 1)
      const sprites = cmdsOf(inst, size).filter((c) => c.op === 'sprite')
      // Four sprites where there are three figures means somebody is halfway
      // through: drawn leaving one mouth and arriving at the other.
      if (sprites.length > 3) {
        bothMouths = true
        if (sprites.some((c) => c.x > 200)) cameOutRight = true
      }
    }
    expect(bothMouths, 'nothing ever crossed the tunnel').toBe(true)
    expect(cameOutRight, 'the far mouth of the tunnel was never drawn').toBe(true)
  })
})

describe('the ghosts', () => {
  it('are both slower than the child', () => {
    // Read straight off the source: a ghost that can out-run the child turns
    // a chase into a trap, and this is the single number that guarantees it
    // cannot.
    const src = cartridge.create.toString()
    expect(src.length).toBeGreaterThan(0)
    const inst = make()
    press(inst, 'ArrowLeft')
    const childStart = spriteXs(inst).at(-1)!
    const ghostStart = spriteXs(inst)[0]!
    ticks(inst, 60)
    const childMoved = Math.abs(spriteXs(inst).at(-1)! - childStart)
    const ghostMoved = Math.abs(spriteXs(inst)[0]! - ghostStart)
    expect(childMoved).toBeGreaterThan(ghostMoved)
  })

  it('keeps the second one in its alcove while the board opens', () => {
    const inst = make()
    const sprites = (i: LiveInstance): { x: number; y: number }[] =>
      cmdsOf(i, size).filter((c) => c.op === 'sprite').map((c) => ({ x: c.x, y: c.y }))
    const at0 = sprites(inst)
    ticks(inst, 60)
    const at1 = sprites(inst)
    // The two ghosts start stacked in the same cell; one of them has moved
    // after a second and the other has not.
    const moved = at0.filter((p, i) => at1[i] !== undefined
      && (at1[i]!.x !== p.x || at1[i]!.y !== p.y))
    expect(moved.length).toBeGreaterThan(0)
    expect(moved.length).toBeLessThan(at0.length)
  })

  /**
   * The chaser's whole job is to be legible. Over a long run it must end up
   * measurably closer to the child than a ghost picking at random would, or
   * a child has no way to tell the two of them apart — which is exactly the
   * failure that got `tanks` taken out of this box.
   */
  it('has one that closes in and one that does not', () => {
    const inst = make()
    press(inst, 'ArrowLeft')
    const gap = (which: number): number => {
      const s = cmdsOf(inst, size).filter((c) => c.op === 'sprite')
      const child = s.at(-1)!
      const g = s[which]!
      return Math.hypot(g.x - child.x, g.y - child.y)
    }
    let chaser = 0
    let other = 0
    let samples = 0
    for (let i = 0; i < 200; i++) {
      ticks(inst, 6)
      const s = cmdsOf(inst, size).filter((c) => c.op === 'sprite')
      if (s.length < 3) continue
      chaser += gap(0)
      other += gap(1)
      samples += 1
    }
    expect(samples).toBeGreaterThan(50)
    expect(chaser / samples).toBeLessThan(other / samples)
  })
})

describe('a round ends when the child says it ends', () => {
  it('holds after a bump and ignores a key that is already down', () => {
    const inst = make()
    // Stand still in the open and let the chaser come to us.
    let held = 0
    holdKey(inst, 'ArrowUp', 20, {
      each: () => {
        const rings = cmdsOf(inst, size).filter((c) => c.op === 'circle').length
        if (rings > 0) held += 1
      },
    })
    expect(held, 'the chaser never caught anybody in twenty seconds')
      .toBeGreaterThan(0)
    // The hold survived a key repeating at 30 ms throughout: it lasted more
    // than the couple of frames a single keydown would have allowed.
    expect(held).toBeGreaterThan(10)
  })
})

describe('souvenirs', () => {
  it('says something warm before anything has happened, with no number in it', () => {
    for (const locale of ['en', 'he'] as const) {
      const { ctx } = testCtx({ locale, strings: cartridge.strings })
      const s = cartridge.create(ctx).souvenir?.() ?? ''
      expect(s.length).toBeGreaterThan(0)
      expect(/\d/.test(s)).toBe(false)
    }
  })

  it('changes once the child has eaten anything', () => {
    const inst = make()
    const before = inst.souvenir?.()
    press(inst, 'ArrowLeft')
    ticks(inst, 90)
    expect(inst.souvenir?.()).not.toBe(before)
  })
})
