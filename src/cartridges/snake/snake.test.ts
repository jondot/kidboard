import { describe, it, expect } from 'vitest'
import snake, { FRUITS } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, holdKey, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const G = gridFor(snake.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: Locale = 'en') => {
  const h = testCtx({ seed, locale, strings: snake.strings })
  return { ...h, inst: snake.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, snake.size, cols)

type Rect = Extract<DrawCmd, { op: 'rect' }>

/**
 * The board is a pixel field now, so every question a test used to ask of a
 * character grid is asked of the command buffer instead — which is finer, not
 * coarser: it knows where a block is to the pixel.
 *
 * The drawing order is fixed and documented in `draw`: wall, fruit, body from
 * tail to neck, then the HEAD LAST so it paints on top. So the head is the
 * final `rect` of the snake, and it is also the only one drawn at full cell
 * size — both facts are asserted below, so neither can rot silently.
 */
const wallOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'outline') as Extract<DrawCmd, { op: 'outline' }> | undefined
const fruitOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'disc') as Extract<DrawCmd, { op: 'disc' }> | undefined
const bumpOf = (c: DrawCmd[]) =>
  c.find((x) => x.op === 'circle') as Extract<DrawCmd, { op: 'circle' }> | undefined
/** Every solid block: the body, the head and the fruit's little stalk. */
const rectsOf = (c: DrawCmd[]): Rect[] => c.filter((x) => x.op === 'rect') as Rect[]
/** The snake's blocks only — the stalk is 2 px wide, a segment never is. */
const snakeOf = (c: DrawCmd[]): Rect[] => rectsOf(c).filter((r) => r.w > 4)
const headOf = (c: DrawCmd[]): Rect => {
  const b = snakeOf(c)
  return b[b.length - 1]!
}

const head = (inst: LiveInstance, cols?: number) => headOf(cmds(inst, cols))
const fruit = (inst: LiveInstance, cols?: number) => fruitOf(cmds(inst, cols))

/**
 * One simulation step, with a little slack: the snake steps every 0.4s and a
 * test tick is 1/60s, so 25 ticks always crosses exactly one step boundary.
 */
const step = (inst: LiveInstance, n = 1): void => { ticks(inst, 25 * n) }

/** Wakes a still snake without turning it: it already heads right. */
const go = (inst: LiveInstance): void => { press(inst, 'ArrowRight') }

/**
 * Asserts that EVERY drawing command lands inside the pixel field. The old
 * version of this test counted emoji cells; there are no emoji on this board
 * any more, so it measures the real extent of each shape instead.
 */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(snake.size, cols)
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
    expect(x0, `${cmd.op} starts left of the field`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(pw)
    expect(y0, `${cmd.op} starts above the field`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(ph)
  }
}

/**
 * Plays the game the way a child does: look at the board, steer toward the
 * fruit, repeat. Returns the largest snake seen, so a test can prove eating
 * really grows it without ever reading private state.
 */
const chase = (inst: LiveInstance, steps = 240): number => {
  let biggest = 0
  let moved = { x: 1, y: 0 }
  let last = head(inst)
  go(inst)
  for (let i = 0; i < steps; i++) {
    const c = cmds(inst)
    biggest = Math.max(biggest, snakeOf(c).length)
    const h = headOf(c)
    const f = fruitOf(c)
    if (h && last && (h.x !== last.x || h.y !== last.y)) {
      moved = { x: Math.sign(h.x - last.x), y: Math.sign(h.y - last.y) }
    }
    if (h && f) {
      const dx = Math.sign(f.x - (h.x + h.w / 2))
      const dy = Math.sign(f.y - (h.y + h.h / 2))
      // Never ask for the exact reverse of the last move — the snake ignores
      // it — so fall back to the other axis when that is what we wanted.
      const wantX = dx !== 0 && dx !== -moved.x
      const wantY = dy !== 0 && dy !== -moved.y
      const key = wantX
        ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        : wantY
          ? (dy > 0 ? 'ArrowDown' : 'ArrowUp')
          : (moved.y === 0 ? 'ArrowUp' : 'ArrowRight')
      press(inst, key)
    }
    last = h
    step(inst)
  }
  return biggest
}

describe('snake', () => {
  it('declares a live cartridge in both locales', () => {
    expect(snake.kind).toBe('live')
    expect(snake.apiVersion).toBe(1)
    expect(snake.locales).toEqual(['en', 'he'])
    expect(snake.size.cols).toBeGreaterThan(0)
    expect(snake.size.aspect).toBeGreaterThan(0)
  })

  // v2: the board is drawn in the PIXEL field, not with characters. A wall, a
  // ribbon of blocks and a small round fruit — and not one glyph anywhere.
  it('draws a bordered board with a snake and a fruit on it, all as shapes', () => {
    const { inst } = start()
    const c = cmds(inst)
    expect(wallOf(c)).toBeDefined()
    expect(snakeOf(c).length).toBeGreaterThanOrEqual(3)
    expect(fruitOf(c)).toBeDefined()
    for (const cmd of c) {
      expect(['clear', 'outline', 'rect', 'disc', 'circle'], `unexpected op ${cmd.op}`)
        .toContain(cmd.op)
    }
    // ...and the pixel model really has ink in it, so this is not a blank lie.
    const rows = pixelsOf(inst, snake.size).split('\n')
    expect(rows).toHaveLength(PH)
    expect(rows.join('')).toContain('#')
  })

  // THE CONVENTION: monochrome. One ink for the whole board; the wall is
  // hollow, the snake is square, the fruit is round.
  it('is monochrome: the theme ground plus exactly one ink', () => {
    const { inst } = start()
    chase(inst, 30)
    const tones = new Set(
      cmds(inst).filter((c) => c.op !== 'clear').map((c) => (c as { tone: string }).tone),
    )
    expect(tones.size).toBe(1)
    expect([...tones][0]).toBe('plain')
  })

  it('tells the wall, the snake and the fruit apart by shape alone', () => {
    const { inst } = start()
    const c = cmds(inst)
    expect(wallOf(c)!.op).toBe('outline')          // the world is hollow
    expect(fruitOf(c)!.op).toBe('disc')            // the goal is round
    // The head keeps its whole square; every body block is trimmed.
    const body = snakeOf(c)
    const h = headOf(c)
    for (const b of body.slice(0, -1)) expect(b.w).toBeLessThan(h.w)
  })

  // THE CONVENTION: the board is field-shaped, and pillarboxed on a wide one.
  it('lays the board out field-shaped, and centres it on a wide screen', () => {
    const narrow = wallOf(cmds(start().inst))!
    expect([narrow.x, narrow.y]).toEqual([0, 0])
    expect(narrow.w).toBe(PW)
    expect(seen(narrow.w, narrow.h)).toBeLessThanOrEqual(4 / 3 + 0.01)

    const widePW = 75 * PX_PER_CELL
    const wide = wallOf(cmds(start().inst, 75))!
    expect(wide.w).toBeLessThan(widePW)
    expect(seen(wide.w, wide.h)).toBeCloseTo(4 / 3, 1)
    expect(wide.x).toBeCloseTo(widePW - (wide.x + wide.w), 0)
  })

  it('draws squares a 6-year-old can see, not a fine mesh', () => {
    const { inst } = start()
    const h = head(inst)
    expect(h.w).toBeGreaterThanOrEqual(12)
    // A board square reads as a square: 0.6 * w vs h, to within a pixel.
    expect(seen(h.w, h.h)).toBeCloseTo(1, 1)
  })

  it('steers screen-relative — up is up and left is left — in both locales', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst } = start(1, locale)
      const a = head(inst)
      press(inst, 'ArrowUp')
      step(inst)
      const b = head(inst)
      expect(b.y, `ArrowUp did not go up under ${locale}`).toBeLessThan(a.y)

      press(inst, 'ArrowLeft')
      step(inst)
      const c = head(inst)
      expect(c.x, `ArrowLeft did not go left under ${locale}`).toBeLessThan(b.x)

      press(inst, 'ArrowDown')
      step(inst)
      expect(head(inst).y, `ArrowDown did not go down under ${locale}`)
        .toBeGreaterThan(c.y)
    }
  })

  // NOTHING RE-ARMS ON A TIMER. The snake is still until it is steered.
  it('waits, perfectly still, until the child steers it', () => {
    const { inst } = start()
    const before = head(inst)
    step(inst, 20)
    expect(head(inst).x).toBe(before.x)
    expect(head(inst).y).toBe(before.y)
    go(inst)
    step(inst, 1)
    expect(head(inst).x).not.toBe(before.x)
  })

  it('turns a wall into an oops that HOLDS, never an ending and never a stampede', () => {
    const { inst, exited } = start(2)
    go(inst)
    // Straight ahead, far past the right wall, and then some.
    step(inst, 60)
    expect(exited()).toBe(false)
    const c = cmds(inst)
    expect(wallOf(c)).toBeDefined()
    expect(snakeOf(c).length).toBeGreaterThanOrEqual(2)
    // The bump left a mark, and the board is holding still under it.
    expect(bumpOf(c)).toBeDefined()
    const at = headOf(c)
    step(inst, 20)
    expect(headOf(cmds(inst)).x).toBe(at.x)
    expect(headOf(cmds(inst)).y).toBe(at.y)
    assertInside(inst)
    // ...and one arrow puts it back on the road, mark cleared.
    go(inst)
    step(inst, 1)
    expect(bumpOf(cmds(inst))).toBeUndefined()
    expect(headOf(cmds(inst)).x).not.toBe(at.x)
  })

  /**
   * C1. A child steers this snake with the arrow HELD DOWN, and the wall it
   * bumps into is usually the one it was being driven at. Before this, the
   * very next auto-repeat — some 30 ms later — cleared the mark and set the
   * snake off again, so the "oops" the game holds for was never on screen at
   * all. Measured the way it is played: hold the key and watch every frame.
   */
  it('holds the oops for half a second even with the arrow still held down', () => {
    const { inst } = start(2)
    let run = 0
    let longest = 0
    let steered = false
    holdKey(inst, 'ArrowRight', 12, {
      each: () => {
        if (bumpOf(cmds(inst))) { run += 1; longest = Math.max(longest, run) }
        else { run = 0; steered = true }
      },
    })
    // Half a second is 30 frames at 60Hz; the bump itself costs one or two.
    expect(longest, 'a held arrow wiped the oops off the board')
      .toBeGreaterThanOrEqual(25)
    // ...and that same held key still gets the snake going again, so a child
    // holding an arrow is never stuck looking at a mark.
    expect(steered, 'the held key never got the snake going again').toBe(true)
  })

  it('never draws a sprite outside the field, however long it plays', () => {
    const { inst } = start(3)
    for (let i = 0; i < 40; i++) {
      press(inst, ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][i % 4]!)
      step(inst)
      assertInside(inst)
    }
  })

  it('survives a resize mid-play with everything still inside the field', () => {
    const { inst } = start(4)
    go(inst)
    step(inst, 5)
    cmds(inst)                         // playing narrow...
    assertInside(inst, 60)             // ...then the window is dragged wide
    go(inst)
    step(inst, 12)
    assertInside(inst, 60)
    const wide60 = pixelsOf(inst, snake.size, 60).split('\n')
    expect(wide60[0]!).toHaveLength(60 * PX_PER_CELL)
    expect(wide60).toHaveLength(PH)
    assertInside(inst, 24)             // ...and dragged back narrow again
    go(inst)
    step(inst, 12)
    assertInside(inst)
  })

  it('is deterministic for a seed', () => {
    const a = start(9); const b = start(9)
    press(a.inst, 'ArrowDown'); press(b.inst, 'ArrowDown')
    step(a.inst, 20); step(b.inst, 20)
    expect(pixelsOf(a.inst, snake.size)).toBe(pixelsOf(b.inst, snake.size))
  })

  it('deals a different board to a different seed', () => {
    const frames = [1, 2, 3, 4, 5].map((s) => pixelsOf(start(s).inst, snake.size))
    expect(new Set(frames).size).toBeGreaterThan(1)
  })

  it('grows the snake when it eats, and the souvenir names the fruit', () => {
    const { inst } = start(11)
    const before = snakeOf(cmds(inst)).length
    const biggest = chase(inst)
    expect(biggest).toBeGreaterThan(before)
    const s = inst.souvenir!()
    expect(s).toMatch(/^you ate the \w+!$/)
    expect(s).not.toMatch(/\d/)
  })

  it('names the fruit in Hebrew too', () => {
    const { inst } = start(11, 'he')
    chase(inst)
    const s = inst.souvenir!()
    expect(s.startsWith('אכלתם את ')).toBe(true)
    expect(s).not.toMatch(/\{|\}/)
    expect(s).not.toMatch(/\d/)
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
      ...Object.values(snake.strings!.en!),
      ...Object.values(snake.strings!.he!),
    ]
    for (const s of all) {
      expect(s.toLowerCase()).not.toMatch(/lose|lost|fail|game over|wrong|dead|die/)
      expect(s).not.toMatch(/הפסד|נכשל|טעות|טעית|מת |מוות|סוף המשחק/)
    }
  })

  it('paints no character at all on the board, let alone a number', () => {
    const { inst } = start(6)
    chase(inst, 30)
    for (const cmd of cmds(inst)) {
      expect(cmd.op === 'text' || cmd.op === 'put' || cmd.op === 'emoji').toBe(false)
    }
  })

  it('keeps FRUITS as the table that names what was eaten', () => {
    expect(FRUITS.length).toBeGreaterThan(1)
    expect(new Set(FRUITS.map((f) => f.id)).size).toBe(FRUITS.length)
  })

  it('offers a movement hint and no ESC hint', () => {
    const { ctx } = start()
    const hints = snake.hints(ctx.t)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0]!.keys.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.keys.toLowerCase()).not.toContain('esc')
  })
})
