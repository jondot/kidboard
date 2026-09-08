import { describe, it, expect } from 'vitest'
import maze from './cartridge'
import {
  PITCH_H, PITCH_W, WALL_X, WALL_Y,
  canWalk, generateMaze, mazeDims, mazeSize, wallRects,
} from './generate'
import type { Maze } from './generate'
import { testCtx, pixelsOf, cmdsOf, holdKey, press } from '../../testing/cartridgeHarness'
import { makeRng } from '../../runtime/rng'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(maze.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL
// The maze is laid out inside the STAGE, not the whole field: at the declared
// width the canvas is already field-shaped, so the stage is the field.
const DIMS = mazeDims(PW, PH)

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: maze.strings })
  return { ...h, inst: maze.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, maze.size, cols)

type Sprite = Extract<DrawCmd, { op: 'sprite' }>

/**
 * The two sprites, told apart the way the drawing code writes them: `draw`
 * paints HOME first and the CHILD second while the walk is on, and paints
 * only the child (inside two rings) once they are home. The child is the
 * SOLID figure and home is the HOLLOW house, which is also asserted, so the
 * ordering assumption cannot rot quietly.
 */
const sprites = (inst: LiveInstance, cols?: number): Sprite[] =>
  cmds(inst, cols).filter((c) => c.op === 'sprite') as Sprite[]
const atHome = (inst: LiveInstance, cols?: number): boolean =>
  cmds(inst, cols).some((c) => c.op === 'circle')
const child = (inst: LiveInstance, cols?: number): Sprite => {
  const s = sprites(inst, cols)
  return s[s.length - 1]!
}
const homeSprite = (inst: LiveInstance, cols?: number): Sprite | undefined =>
  atHome(inst, cols) ? undefined : sprites(inst, cols)[0]

/** Every drawing command, clipped against the real pixel field. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(maze.size, cols)
  const pw = g.w * PX_PER_CELL
  const ph = g.h * PX_PER_CELL
  for (const cmd of cmds(inst, cols)) {
    if (cmd.op === 'clear') continue
    let x0 = cmd.x
    let y0 = cmd.y
    let x1 = cmd.x
    let y1 = cmd.y
    if (cmd.op === 'rect' || cmd.op === 'outline') { x1 = cmd.x + cmd.w; y1 = cmd.y + cmd.h }
    if (cmd.op === 'disc' || cmd.op === 'circle') {
      x0 = cmd.x - cmd.r; x1 = cmd.x + cmd.r
      y0 = cmd.y - cmd.r * PIXEL_ASPECT; y1 = cmd.y + cmd.r * PIXEL_ASPECT
    }
    if (cmd.op === 'sprite') {
      x1 = cmd.x + Math.max(...cmd.rows.map((r) => r.length))
      y1 = cmd.y + cmd.rows.length
    }
    expect(x0, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(y0, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

const STEPS: { key: string; dx: number; dy: number }[] = [
  { key: 'ArrowRight', dx: 1, dy: 0 },
  { key: 'ArrowLeft', dx: -1, dy: 0 },
  { key: 'ArrowDown', dx: 0, dy: 1 },
  { key: 'ArrowUp', dx: 0, dy: -1 },
]

/**
 * Breadth-first search for a way home, written independently of the
 * generator's own bookkeeping: it only ever asks `canWalk`, exactly as a
 * child does. Returns the arrow keys to press, or null when the maze is
 * unsolvable — which is the thing the tests below prove never happens.
 */
const wayHome = (m: Maze): string[] | null => {
  const from = new Map<string, { prev: string; key: string }>()
  const id = (x: number, y: number): string => `${x},${y}`
  const goal = id(m.cw - 1, m.ch - 1)
  const queue: [number, number][] = [[0, 0]]
  const seen = new Set([id(0, 0)])

  while (queue.length > 0) {
    const [x, y] = queue.shift()!
    if (id(x, y) === goal) break
    for (const s of STEPS) {
      if (!canWalk(m, x, y, s.dx, s.dy)) continue
      const next = id(x + s.dx, y + s.dy)
      if (seen.has(next)) continue
      seen.add(next)
      from.set(next, { prev: id(x, y), key: s.key })
      queue.push([x + s.dx, y + s.dy])
    }
  }

  if (!seen.has(goal)) return null
  const keys: string[] = []
  let at = goal
  while (at !== id(0, 0)) {
    const step = from.get(at)!
    keys.unshift(step.key)
    at = step.prev
  }
  return keys
}

/** Every cell the maze can reach from its start corner. */
const reachable = (m: Maze): number => {
  const seen = new Set(['0,0'])
  const queue: [number, number][] = [[0, 0]]
  while (queue.length > 0) {
    const [x, y] = queue.shift()!
    for (const s of STEPS) {
      if (!canWalk(m, x, y, s.dx, s.dy)) continue
      const next = `${x + s.dx},${y + s.dy}`
      if (seen.has(next)) continue
      seen.add(next)
      queue.push([x + s.dx, y + s.dy])
    }
  }
  return seen.size
}

describe('maze generation', () => {
  it('is always solvable — a way home exists for every seed and size', () => {
    const sizes: [number, number][] = [[2, 2], [3, 3], [9, 6], [19, 6], [12, 9]]
    for (const [cw, ch] of sizes) {
      for (let seed = 1; seed <= 200; seed++) {
        const m = generateMaze(makeRng(seed), cw, ch)
        const path = wayHome(m)
        expect(path, `no way home in a ${cw}x${ch} maze at seed ${seed}`).not.toBeNull()
        expect(path!.length).toBeGreaterThanOrEqual(cw - 1 + ch - 1)
      }
    }
  })

  it('reaches every single cell, so no corner is ever walled off', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const m = generateMaze(makeRng(seed), 9, 6)
      expect(reachable(m), `seed ${seed} walled a cell off`).toBe(9 * 6)
    }
  })

  it('is the same maze for the same seed, and different across seeds', () => {
    const draw = (seed: number): string =>
      JSON.stringify(wallRects(generateMaze(makeRng(seed), 9, 6)))
    expect(draw(42)).toBe(draw(42))
    expect(new Set([1, 2, 3, 4, 5].map(draw)).size).toBe(5)
  })

  // v2: the maze is rectangles of wall in the PIXEL field, not rows of
  // characters. Same two properties as before — it fills the space it claims,
  // and it is walled all the way round.
  it('walls a rectangle of the size the field can hold, all the way round', () => {
    const m = generateMaze(makeRng(1), DIMS.cw, DIMS.ch)
    const rects = wallRects(m)
    const size = mazeSize(m)
    expect(size.w).toBeLessThanOrEqual(PW)
    expect(size.h).toBeLessThanOrEqual(PH)
    // Solid top and bottom edges, edge to edge.
    const spans = (y: number) => rects.filter((r) => r.y === y && r.h === WALL_Y)
    for (const y of [0, PITCH_H * m.ch]) {
      const row = spans(y)
      expect(row, `no wall run along y=${y}`).toHaveLength(1)
      expect(row[0]!.x).toBe(0)
      expect(row[0]!.w).toBe(size.w)
    }
    // Solid left and right edges, top to bottom.
    for (const x of [0, PITCH_W * m.cw]) {
      const col = rects.filter((r) => r.x === x && r.w === WALL_X)
      expect(col, `no wall down x=${x}`).toHaveLength(m.ch)
    }
    // Nothing is drawn outside the maze's own box.
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(size.w)
      expect(r.y + r.h).toBeLessThanOrEqual(size.h)
    }
  })

  it('opens a passage exactly where the carving left one', () => {
    const m = generateMaze(makeRng(7), 6, 5)
    const rects = wallRects(m)
    const hasVertical = (j: number, k: number): boolean =>
      rects.some((r) => r.w === WALL_X && r.x === j * PITCH_W && r.y === k * PITCH_H)
    for (let k = 0; k < m.ch; k++) {
      for (let j = 1; j < m.cw; j++) {
        expect(hasVertical(j, k), `wall at ${j},${k} disagrees with the maze`)
          .toBe(m.right[k]![j - 1]!)
      }
    }
  })

  it('sizes itself to the live pixel field rather than to a constant', () => {
    expect(mazeDims(240, 144)).toEqual({ cw: 7, ch: 7 })
    expect(mazeDims(480, 144).cw).toBeGreaterThan(mazeDims(240, 144).cw)
    // Never smaller than a maze that can actually be walked.
    expect(mazeDims(8, 8)).toEqual({ cw: 2, ch: 2 })
  })
})

describe('maze', () => {
  it('declares a live cartridge in both locales', () => {
    expect(maze.kind).toBe('live')
    expect(maze.apiVersion).toBe(1)
    expect(maze.locales).toEqual(['en', 'he'])
    expect(maze.size.cols).toBeGreaterThan(0)
    expect(maze.size.aspect).toBeGreaterThan(0)
  })

  it('draws walls, a child and a home — all as shapes, no glyphs at all', () => {
    const { inst } = start()
    const c = cmds(inst)
    expect(c.filter((x) => x.op === 'rect').length).toBeGreaterThan(4)
    expect(sprites(inst)).toHaveLength(2)
    for (const cmd of c) {
      expect(['clear', 'rect', 'sprite', 'circle'], `unexpected op ${cmd.op}`)
        .toContain(cmd.op)
    }
    const rows = pixelsOf(inst, maze.size).split('\n')
    expect(rows).toHaveLength(PH)
    expect(rows.join('')).toContain('#')
    assertInside(inst)
  })

  // THE CONVENTION: monochrome, told apart by fill. The child is solid; home
  // is a hollow house; the walls are solid blocks that are plainly not either.
  it('is monochrome: the theme ground plus exactly one ink', () => {
    const { inst } = start()
    press(inst, 'ArrowRight', 3)
    const tones = new Set(
      cmds(inst).filter((c) => c.op !== 'clear').map((c) => (c as { tone: string }).tone),
    )
    expect(tones.size).toBe(1)
    expect([...tones][0]).toBe('plain')
  })

  it('tells the child from home by fill: one is solid, the other is hollow', () => {
    const { inst } = start()
    const kid = child(inst)
    const house = homeSprite(inst)!
    const lit = (s: Sprite) =>
      s.rows.join('').split('').filter((ch) => ch !== ' ').length
    expect(lit(kid)).toBeGreaterThan(lit(house))
    // ...and they are the same size, so it really is fill doing the work.
    expect(kid.rows.length).toBe(house.rows.length)
  })

  it('centres a field-shaped maze on a wide screen instead of stretching it', () => {
    const widePW = 75 * PX_PER_CELL
    const { inst } = start()
    const rects = cmds(inst, 75).filter((c) => c.op === 'rect') as
      Extract<DrawCmd, { op: 'rect' }>[]
    const left = Math.min(...rects.map((r) => r.x))
    const right = Math.max(...rects.map((r) => r.x + r.w))
    expect(right).toBeLessThan(widePW)
    expect(left).toBeCloseTo(widePW - right, -1)
  })

  it('walks screen-relative — right is right and left is left — in both locales', () => {
    // A seed whose start corner opens to the right, so there is a step to
    // take in both directions. The cartridge draws its first maze from the
    // same seeded rng, so this is the maze the child will see.
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((s) =>
      canWalk(generateMaze(makeRng(s), DIMS.cw, DIMS.ch), 0, 0, 1, 0))
    expect(seed, 'no seed in 1..10 opens rightward from the start').toBeDefined()

    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(seed!, locale)
      const home = homeSprite(inst)!
      const a = child(inst)
      press(inst, 'ArrowRight')
      const b = child(inst)
      expect(b.x, `ArrowRight did not go right under ${locale}`).toBeGreaterThan(a.x)
      expect(b.y).toBe(a.y)
      press(inst, 'ArrowLeft')
      expect(child(inst).x, `ArrowLeft did not come back under ${locale}`).toBe(a.x)
      expect(child(inst).y).toBe(a.y)
      // Home is down and to the right of the start: the child begins in the
      // top-left corner of the maze in every language.
      expect(home.x).toBeGreaterThan(a.x)
      expect(home.y).toBeGreaterThan(a.y)
    }
  })

  it('bumps softly into a wall instead of ending anything', () => {
    const { inst, exited } = start(3)
    const a = child(inst)
    press(inst, 'ArrowUp', 5)     // the top border, from the start corner
    press(inst, 'ArrowLeft', 5)   // and the left one
    expect(child(inst).x).toBe(a.x)
    expect(child(inst).y).toBe(a.y)
    expect(exited()).toBe(false)
    expect(inst.souvenir!()).not.toMatch(/\d/)
  })

  it('celebrates arriving home, in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, exited } = start(12, locale)
      const path = wayHome(generateMaze(makeRng(12), DIMS.cw, DIMS.ch))!
      for (const key of path) press(inst, key)
      expect(atHome(inst), 'arriving did not throw a party').toBe(true)
      expect(exited(), 'arriving must not end the cartridge').toBe(false)
      const s = inst.souvenir!()
      expect(s).toBe(locale === 'en'
        ? 'you found the way home!'
        : 'מצאתם את הדרך הביתה!')
      expect(s).not.toMatch(/\d/)
    }
  })

  // NOTHING RE-ARMS ON A TIMER. Arriving used to start a countdown and deal a
  // fresh maze out from under the child. The party now HOLDS: it lasts until
  // the child presses a key, and that press is what asks for the next maze.
  it('holds the party until the child asks for another maze', () => {
    const { inst } = start(12)
    const before = pixelsOf(inst, maze.size)
    const path = wayHome(generateMaze(makeRng(12), DIMS.cw, DIMS.ch))!
    for (const key of path) press(inst, key)
    expect(atHome(inst)).toBe(true)

    // Time passes. Nothing happens — this cartridge has no clock at all.
    for (let i = 0; i < 600; i++) inst.tick?.(1 / 60)
    expect(atHome(inst), 'the party ended on a timer').toBe(true)

    // Now the child asks, and gets a brand-new maze rather than a replay.
    press(inst, 'ArrowRight')
    expect(atHome(inst)).toBe(false)
    expect(sprites(inst)).toHaveLength(2)
    const after = pixelsOf(inst, maze.size)
    expect(after).not.toBe(before)
    expect(inst.souvenir!()).toBe('you found the way home!')
    assertInside(inst)
  })

  /**
   * C1. Arriving home is what a child arrives home WITH — an arrow key held
   * down. Before this, `onKey` re-laid the maze on the first auto-repeat that
   * landed after the last step, which is roughly 30 ms later: the party was
   * drawn over by a brand-new maze inside the same press, and the child was
   * back at the start corner having never seen the rings.
   */
  it('keeps the party standing while the arrow that got there is still held', () => {
    const { inst } = start(12)
    const path = wayHome(generateMaze(makeRng(12), DIMS.cw, DIMS.ch))!
    for (const key of path) press(inst, key)
    expect(atHome(inst)).toBe(true)

    // The last arrow, still down, repeating — for less than the window.
    holdKey(inst, path[path.length - 1]!, 0.4)
    expect(atHome(inst), 'a held arrow dismissed the party').toBe(true)

    // ...and once the moment has landed, that same held key asks for the
    // next maze. Nobody has to let go and press again.
    holdKey(inst, path[path.length - 1]!, 0.4)
    expect(atHome(inst), 'the held key never asked for another maze').toBe(false)
  })

  it('survives a resize mid-walk with everything still inside the grid', () => {
    const { inst } = start(4)
    press(inst, 'ArrowRight', 3)
    press(inst, 'ArrowDown', 3)
    cmds(inst)                             // walking narrow...
    assertInside(inst, 60)                 // ...then the window is dragged wide
    const wide60 = pixelsOf(inst, maze.size, 60).split('\n')
    expect(wide60).toHaveLength(PH)
    expect(sprites(inst, 60).length).toBeGreaterThan(0)
    press(inst, 'ArrowRight', 10)
    assertInside(inst, 60)
    assertInside(inst)                     // ...and dragged back to narrowest
    press(inst, 'ArrowDown', 10)
    assertInside(inst)
  })

  it('reads warmly at zero progress, in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const s = inst.souvenir!()
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/\d/)
      expect(s).not.toMatch(/\{|\}/)
    }
  })

  it('never says the child lost, in either language', () => {
    const all = [
      ...Object.values(maze.strings!.en!),
      ...Object.values(maze.strings!.he!),
    ]
    for (const s of all) {
      expect(s.toLowerCase()).not.toMatch(/lose|lost|fail|game over|wrong|stuck|trapped/)
      expect(s).not.toMatch(/הפסד|נכשל|טעות|טעית|תקוע|סוף המשחק/)
    }
  })

  it('paints no bare number and no Hebrew on the canvas', () => {
    const { inst } = start(2, 'he')
    press(inst, 'ArrowRight', 4)
    for (const cmd of cmds(inst)) {
      expect(cmd.op === 'text' || cmd.op === 'put' || cmd.op === 'emoji').toBe(false)
    }
  })

  it('offers a movement hint and no ESC hint', () => {
    const { ctx } = start()
    const hints = maze.hints(ctx.t)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys.toLowerCase()).not.toContain('esc')
  })
})
