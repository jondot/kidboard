import { describe, it, expect } from 'vitest'
import sokoban from './cartridge'
import { LEVELS, parse, solved, step, snapshot, restore } from './levels'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { HOLD_IGNORE } from '../pacing'
import type { DrawCmd, LiveInstance, Locale } from '../../types'

const start = (locale: Locale = 'en') => {
  const h = testCtx({ locale, strings: sokoban.strings })
  return { ...h, inst: sokoban.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, sokoban.size, cols)

const op = (inst: LiveInstance, o: DrawCmd['op']): DrawCmd[] =>
  cmds(inst).filter((c) => c.op === o)

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const

/**
 * A breadth-first solver, in the test rather than in the game.
 *
 * This is the single most valuable assertion in the file. A hand-written
 * Sokoban room that cannot actually be finished is not a hard level — it is a
 * child pushing crates around a room with no way out of it, which is exactly
 * the stuck state the house style forbids and exactly the kind of mistake
 * that a human writing eight boards by eye will make. The boards are tiny
 * (nine by eight at the largest, three crates at the most), so an exhaustive
 * search costs milliseconds and settles the question completely.
 */
function solvable(rows: readonly string[]): boolean {
  const b0 = parse(rows)
  const key = (b: { crate: boolean[]; x: number; y: number }): string =>
    `${b.x},${b.y},${b.crate.map((c) => (c ? 1 : 0)).join('')}`
  const seen = new Set<string>([key(b0)])
  let edge = [snapshot(b0)]
  for (let depth = 0; depth < 200 && edge.length; depth++) {
    const next: ReturnType<typeof snapshot>[] = []
    for (const state of edge) {
      for (const [dx, dy] of DIRS) {
        const b = parse(rows)
        restore(b, state)
        if (!step(b, dx, dy).moved) continue
        if (solved(b)) return true
        const k = key(b)
        if (seen.has(k)) continue
        seen.add(k)
        next.push(snapshot(b))
      }
    }
    edge = next
  }
  return false
}

describe('the rooms', () => {
  it('every shipped room can actually be finished', () => {
    LEVELS.forEach((rows, i) => {
      expect(solvable(rows), `level ${i + 1} cannot be solved`).toBe(true)
    })
  })

  it('every room has as many crates as places to put them', () => {
    LEVELS.forEach((rows, i) => {
      const b = parse(rows)
      const crates = b.crate.filter(Boolean).length
      const goals = b.goal.filter(Boolean).length
      expect(crates, `level ${i + 1}`).toBe(goals)
      expect(crates, `level ${i + 1} has no crates`).toBeGreaterThan(0)
    })
  })

  it('every room starts unsolved, with the child inside a wall of its own', () => {
    LEVELS.forEach((rows, i) => {
      const b = parse(rows)
      expect(solved(b), `level ${i + 1} opens already finished`).toBe(false)
      expect(b.wall[b.y * b.w + b.x], `level ${i + 1} starts you in a wall`).toBe(false)
    })
  })

  it('gets easier to describe the earlier it is', () => {
    // A rough but real guard against reordering: the first rooms are smaller
    // and have fewer crates than the last ones.
    const first = parse(LEVELS[0]!)
    const last = parse(LEVELS[LEVELS.length - 1]!)
    expect(first.crate.filter(Boolean).length)
      .toBeLessThan(last.crate.filter(Boolean).length)
  })
})

describe('the rule', () => {
  it('walks into empty floor', () => {
    const b = parse(['#####', '#@  #', '#####'])
    expect(step(b, 1, 0)).toEqual({ moved: true, pushed: false })
    expect(b.x).toBe(2)
  })

  it('will not walk into a wall', () => {
    const b = parse(['#####', '#@  #', '#####'])
    expect(step(b, -1, 0)).toEqual({ moved: false, pushed: false })
    expect(b.x).toBe(1)
  })

  it('pushes one crate', () => {
    const b = parse(['#####', '#@$ #', '#####'])
    expect(step(b, 1, 0)).toEqual({ moved: true, pushed: true })
    expect(b.crate[1 * 5 + 3]).toBe(true)
    expect(b.crate[1 * 5 + 2]).toBe(false)
  })

  it('will not push a crate into a wall', () => {
    const b = parse(['####', '#@$#', '####'])
    expect(step(b, 1, 0)).toEqual({ moved: false, pushed: false })
  })

  it('will not push two crates at once — the only rule Sokoban has', () => {
    const b = parse(['######', '#@$$ #', '######'])
    expect(step(b, 1, 0)).toEqual({ moved: false, pushed: false })
  })

  it('undoes exactly one move at a time', () => {
    const b = parse(['######', '#@$  #', '######'])
    const back = snapshot(b)
    step(b, 1, 0)
    expect(b.x).toBe(2)
    restore(b, back)
    expect(b.x).toBe(1)
    expect(b.crate[1 * 6 + 2]).toBe(true)
  })
})

describe('sokoban', () => {
  it('solves room one by walking right, and holds the finished picture', () => {
    const { inst } = start()
    // `# @$ .#` — two pushes right puts the crate home.
    press(inst, 'ArrowRight')
    press(inst, 'ArrowRight')
    // A solved board wears two hollow rings; an unsolved one has one target.
    expect(op(inst, 'circle').length).toBe(2)
  })

  it('protects the beat after a solve from a held arrow', () => {
    const { inst } = start()
    const before = JSON.stringify(cmds(inst))
    press(inst, 'ArrowRight'); press(inst, 'ArrowRight')
    const won = JSON.stringify(cmds(inst))
    // A finger still on the key must not deal the next room over this one.
    press(inst, 'ArrowRight', 20)
    expect(JSON.stringify(cmds(inst))).toBe(won)
    ticks(inst, Math.ceil(HOLD_IGNORE * 60) + 2)
    press(inst, 'ArrowRight')
    const after = JSON.stringify(cmds(inst))
    expect(after).not.toBe(won)
    expect(after).not.toBe(before)
  })

  it('lets a child undo their way out of a corner', () => {
    const { inst } = start()
    const opening = JSON.stringify(cmds(inst))
    press(inst, 'ArrowRight')
    expect(JSON.stringify(cmds(inst))).not.toBe(opening)
    press(inst, 'u')
    expect(JSON.stringify(cmds(inst))).toBe(opening)
  })

  it('does nothing when there is nothing left to undo', () => {
    const { inst } = start()
    const opening = JSON.stringify(cmds(inst))
    press(inst, 'u', 5)
    expect(JSON.stringify(cmds(inst))).toBe(opening)
  })

  it('draws a done crate solid and an undone one hollow', () => {
    const { inst } = start()
    // Before: one crate, drawn as an outline; one target ring.
    expect(op(inst, 'outline').length).toBe(1)
    press(inst, 'ArrowRight'); press(inst, 'ArrowRight')
    // After: no outlined crate at all — it is filled in.
    expect(op(inst, 'outline').length).toBe(0)
  })

  it('is monochrome', () => {
    const { inst } = start()
    press(inst, 'ArrowRight')
    for (const cmd of cmds(inst)) {
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
    }
  })

  it('never returns a numeric souvenir, played or not', () => {
    const { inst, ctx } = start()
    expect(inst.souvenir?.()).toBe(ctx.t('sokoban.souvenir.none'))
    press(inst, 'ArrowRight')
    expect(inst.souvenir?.()).not.toMatch(/\d/)
    press(inst, 'ArrowRight')
    expect(inst.souvenir?.()).not.toMatch(/\d/)
  })

  it('draws the same room on a wide screen, centred', () => {
    const { inst } = start()
    expect(pixelsOf(inst, sokoban.size)).toMatchSnapshot()
    expect(pixelsOf(inst, sokoban.size, 60)).toMatchSnapshot()
  })
})
