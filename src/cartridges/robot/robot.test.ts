import { describe, it, expect } from 'vitest'
import type { DrawCmd, LiveInstance } from '../../types'
import robot from './cartridge'
import { testCtx, pixelsOf, cmdsOf, holdKey, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'

const G = gridFor(robot.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

const start = (seed = 1, locale: 'en' | 'he' = 'en') => {
  const h = testCtx({ seed, locale, strings: robot.strings })
  return { ...h, inst: robot.create(h.ctx) }
}

const sprites = (cmds: DrawCmd[]) =>
  cmds.filter((c): c is Extract<DrawCmd, { op: 'sprite' }> => c.op === 'sprite')

const wide = (s: Extract<DrawCmd, { op: 'sprite' }>) =>
  Math.max(...s.rows.map((r) => r.length))

/** The two board pieces are thirteen columns wide and differ in height; every
 *  arrow in the tray is narrower than either. */
const robotOf = (cmds: DrawCmd[]) =>
  sprites(cmds).find((s) => wide(s) === 13 && s.rows.length === 8)
const starOf = (cmds: DrawCmd[]) =>
  sprites(cmds).find((s) => wide(s) === 13 && s.rows.length === 7)
const arrowsOf = (cmds: DrawCmd[]) => sprites(cmds).filter((s) => wide(s) < 13)

const rows = (inst: LiveInstance, cols?: number) =>
  pixelsOf(inst, robot.size, cols).split('\n')

/** Queue a program, then commit it and let it run to a standstill. */
const program = (inst: LiveInstance, keys: string[]): void => {
  for (const k of keys) press(inst, `Arrow${k}`)
}
const run = (inst: LiveInstance, extraSecs = 8): void => {
  press(inst, 'Enter')
  ticks(inst, Math.round(extraSecs * 60))
}

describe('robot', () => {
  it('declares a live cartridge with both locales', () => {
    expect(robot.kind).toBe('live')
    expect(robot.apiVersion).toBe(1)
    expect(robot.locales).toEqual(['en', 'he'])
  })

  // Nothing in the registry claimed the plain noun or the emoji, so this game
  // keeps both. (Checked against every trigger table, generated ones too.)
  it('keeps the plain noun and the robot emoji, which nothing else claimed', () => {
    expect(robot.triggers.en).toContain('robot')
    expect(robot.triggers.he?.length).toBeGreaterThan(0)
    expect(robot.triggers.emoji).toContain('🤖')
  })

  it('draws entirely with shapes — not one character anywhere', () => {
    const cmds = cmdsOf(start().inst, robot.size)
    expect(robotOf(cmds)).toBeDefined()
    expect(starOf(cmds)).toBeDefined()
    for (const cmd of cmds) {
      expect(['clear', 'rect', 'outline', 'circle', 'sprite'], `unexpected op ${cmd.op}`)
        .toContain(cmd.op)
    }
  })

  // MONOCHROME. One ink, from the theme. The robot is told from its world by
  // silhouette and by mass — solid sprites against a two-pixel frame — never
  // by a second colour.
  it('uses exactly one tone for everything it draws', () => {
    const { inst } = start()
    const tones = new Set<string>()
    const drives = [
      () => {},
      () => program(inst, ['Right', 'Up']),
      () => { press(inst, 'Enter'); ticks(inst, 30) },
      () => ticks(inst, 300),
    ]
    for (const drive of drives) {
      drive()
      for (const c of cmdsOf(inst, robot.size)) {
        if (c.op !== 'clear') tones.add((c as { tone: string }).tone)
      }
    }
    expect([...tones]).toEqual(['plain'])
  })

  it('plays on a square-ish stage on any canvas, board above and tray below', () => {
    for (const cols of [undefined, 40, 80]) {
      const cmds = cmdsOf(start().inst, robot.size, cols)
      const frames = cmds.filter(
        (c): c is Extract<DrawCmd, { op: 'outline' }> => c.op === 'outline',
      )
      expect(frames, `at cols=${String(cols)}`).toHaveLength(2)
      const [board, tray] = frames as [typeof frames[0], typeof frames[0]]
      expect(seen(board.w, board.h)).toBeGreaterThan(0.7)
      expect(seen(board.w, board.h)).toBeLessThan(2)
      // The tray is a strip under the board, never overlapping it.
      expect(tray.y).toBeGreaterThanOrEqual(board.y + board.h)
      expect(tray.y + tray.h).toBeLessThanOrEqual(PH)
    }
  })

  it('draws a robot and a star big enough to tell apart across a room', () => {
    const cmds = cmdsOf(start().inst, robot.size)
    const r = robotOf(cmds)!
    const s = starOf(cmds)!
    for (const sp of [r, s]) {
      const w = Math.max(...sp.rows.map((row) => row.length)) * sp.scale
      expect(w).toBeGreaterThanOrEqual(16)
      expect(w / PW).toBeGreaterThan(0.07)
    }
    // Different silhouettes, which is what carries the difference when there
    // is only one colour to go round.
    expect(r.rows).not.toEqual(s.rows)
  })

  it('draws something sensible before anything is pressed', () => {
    const r = rows(start().inst)
    expect(r).toHaveLength(PH)
    expect(r[0]!).toHaveLength(PW)
    const lit = r.join('').split('#').length - 1
    expect(lit).toBeGreaterThan(300)
  })

  // THE CORE RULE: an arrow is not a move. It queues a step, and the robot
  // does not budge until ENTER. This holds in both languages, because a
  // direction key is a physical direction in both.
  it('queues arrows into a program without moving the robot, in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = start(1, locale)
      const before = robotOf(cmdsOf(inst, robot.size))!
      expect(arrowsOf(cmdsOf(inst, robot.size)), `${locale}: tray not empty`)
        .toHaveLength(0)

      program(inst, ['Right', 'Right', 'Up'])
      const cmds = cmdsOf(inst, robot.size)
      expect(arrowsOf(cmds), `${locale}: arrows not queued`).toHaveLength(3)
      const after = robotOf(cmds)!
      expect([after.x, after.y], `${locale}: the robot moved before ENTER`)
        .toEqual([before.x, before.y])
      ticks(inst, 120)
      const still = robotOf(cmdsOf(inst, robot.size))!
      expect([still.x, still.y], `${locale}: the robot moved on its own`)
        .toEqual([before.x, before.y])
    }
  })

  it('runs the program on ENTER and walks the robot, in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = start(1, locale)
      const before = robotOf(cmdsOf(inst, robot.size))!.x
      program(inst, ['Right', 'Right'])
      run(inst)
      expect(robotOf(cmdsOf(inst, robot.size))!.x, `${locale}: robot did not walk right`)
        .toBeGreaterThan(before)
    }
  })

  it('moves screen-left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = start(1, locale)
      const before = robotOf(cmdsOf(inst, robot.size))!.x
      program(inst, ['Left'])
      run(inst)
      expect(robotOf(cmdsOf(inst, robot.size))!.x, `${locale}: left was not left`)
        .toBeLessThan(before)
    }
  })

  // Step timing is integrated from `dt`, not counted in frames: two different
  // deltas covering the same span must leave the robot in the same place.
  it('steps on elapsed time, not on frames', () => {
    const a = start(3).inst
    const b = start(3).inst
    for (const inst of [a, b]) program(inst, ['Right', 'Down', 'Right'])
    press(a, 'Enter'); press(b, 'Enter')
    ticks(a, 64, 1 / 64)          // one second
    ticks(b, 32, 1 / 32)          // ...the same second, half as often
    const ra = robotOf(cmdsOf(a, robot.size))!
    const rb = robotOf(cmdsOf(b, robot.size))!
    expect(rb.x).toBeCloseTo(ra.x, 9)
    expect(rb.y).toBeCloseTo(ra.y, 9)
    // Mid-walk, so this really is comparing an interpolated position.
    expect(Number.isInteger(ra.x) && Number.isInteger(ra.y)).toBe(false)
  })

  it('never queues more steps than the tray can hold', () => {
    const { inst } = start()
    program(inst, Array.from({ length: 40 }, () => 'Right'))
    expect(arrowsOf(cmdsOf(inst, robot.size)).length).toBeLessThanOrEqual(6)
  })

  it('ignores a held arrow, so a program is made of decisions', () => {
    const { inst } = start()
    for (let i = 0; i < 5; i++) {
      inst.onKey?.({ key: 'ArrowRight', shift: false, repeat: true })
    }
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(0)
  })

  // THE EDITING AFFORDANCE. A child who was one step short must be able to
  // add that step, not retype the whole plan.
  it('keeps the program after a run, and lets a child edit and re-run it', () => {
    const { inst } = start(5)
    program(inst, ['Right', 'Right'])
    run(inst)
    // The plan is still on the tray, untouched.
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(2)
    // One more step goes on the end...
    program(inst, ['Up'])
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(3)
    // ...and Backspace takes one back off it.
    press(inst, 'Backspace')
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(2)
    // ...and it runs again, from home, so the program means the same thing.
    const parked = robotOf(cmdsOf(inst, robot.size))!.x
    press(inst, 'Enter')
    ticks(inst, 12)
    expect(robotOf(cmdsOf(inst, robot.size))!.x).toBeLessThan(parked)
  })

  it('does nothing at all on ENTER with an empty tray', () => {
    const { inst } = start()
    const before = rows(inst).join('\n')
    press(inst, 'Enter')
    ticks(inst, 120)
    expect(rows(inst).join('\n')).toBe(before)
  })

  // NOTHING RESTARTS ITSELF. A finished run holds — the robot parked where it
  // got to, the program still on the tray, the screen completely still — for
  // as long as the child wants to look at it.
  it('stops and holds when a run ends, with nothing moving afterwards', () => {
    const { inst } = start(2)
    program(inst, ['Right', 'Up'])
    run(inst)
    const parked = rows(inst).join('\n')
    ticks(inst, 600)                        // ten more seconds of nothing
    expect(rows(inst).join('\n')).toBe(parked)
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(2)
  })

  /**
   * C1. Mid-run the keyboard is inert, which hides a gap: the instant the
   * flourish ended, every key that had been held down the whole time landed
   * at once. A leaned-on Backspace ate the program the child had just watched
   * run, before they had looked up from the board.
   */
  it('protects the moment a run ends, even with a key still held down', () => {
    const { inst } = start(2)
    program(inst, ['Right', 'Up'])
    press(inst, 'Enter')
    // Two steps at 0.45s plus the 0.9s flourish: the run is over at 1.8s, and
    // the child has been leaning on Backspace the whole way.
    holdKey(inst, 'Backspace', 1.8 + 0.4)
    expect(arrowsOf(cmdsOf(inst, robot.size)), 'a held key ate the plan')
      .toHaveLength(2)
    // ...and once the moment has landed, that same held key edits again.
    holdKey(inst, 'Backspace', 0.4)
    expect(arrowsOf(cmdsOf(inst, robot.size)).length).toBeLessThan(2)
  })

  /**
   * I5 — the RULING on robot's star, which was decided and then dropped.
   *
   * The star was a `const` for the life of the instance, so `robot` was the
   * only game in the set handing a child ONE PUZZLE PER SESSION: `count`,
   * `spot` and `rhyme` all deal the next one on the child's next line. The
   * ruling: reaching the star HOLDS (per the pacing rule), and then the
   * child's next key gives a NEW star and clears the program. That satisfies
   * both rules at once — nothing re-arms on a timer, and a solver gets
   * another puzzle without ESC-and-retype.
   */
  const walkToStar = (inst: LiveInstance, cmds: DrawCmd[]): string[] => {
    // Read the star's tile off the picture and write the program that gets
    // there: the board is 7x5 and the robot starts at column 1, row 3.
    const g = cmdsOf(inst, robot.size)
    const board = g.find((c): c is Extract<DrawCmd, { op: 'outline' }> => c.op === 'outline')!
    const st = starOf(g)!
    const rb = robotOf(g)!
    const tileW = (board.w - 10) / 7
    const tileH = (board.h - 10) / 5
    const dc = Math.round((st.x - rb.x) / tileW)
    const dr = Math.round((st.y + st.rows.length * st.scale / 2
      - (rb.y + rb.rows.length * rb.scale / 2)) / tileH)
    const keys: string[] = []
    for (let i = 0; i < Math.abs(dc); i++) keys.push(dc > 0 ? 'ArrowRight' : 'ArrowLeft')
    for (let i = 0; i < Math.abs(dr); i++) keys.push(dr > 0 ? 'ArrowDown' : 'ArrowUp')
    for (const k of keys) press(inst, k)
    return keys
  }

  it('holds on the star, then deals a NEW one on the next key and clears the plan', () => {
    const { inst, exited } = start(3)
    const keys = walkToStar(inst, cmdsOf(inst, robot.size))
    const firstStar = starOf(cmdsOf(inst, robot.size))!
    run(inst)
    expect(exited(), 'reaching the star must never end the cartridge').toBe(false)
    // It HOLDS: the same star, the same plan, for as long as the child likes.
    expect(starOf(cmdsOf(inst, robot.size))!.x).toBe(firstStar.x)
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(keys.length)
    ticks(inst, 600)
    expect(starOf(cmdsOf(inst, robot.size))!.x).toBe(firstStar.x)

    // ...and then the child's next key asks for another puzzle: a new star,
    // an empty tray, the robot home. No ESC, no retyping.
    press(inst, 'ArrowUp')
    const next = starOf(cmdsOf(inst, robot.size))!
    expect(arrowsOf(cmdsOf(inst, robot.size)), 'the tray was not cleared')
      .toHaveLength(0)
    expect(next.x !== firstStar.x || next.y !== firstStar.y,
      'the same star came back').toBe(true)
    // The souvenir still remembers the walk that reached the first one.
    expect(inst.souvenir!()).toContain('star')
  })

  it('keeps the plan after a run that MISSED, so it can be edited', () => {
    // The other half of the ruling, and the behaviour it must not cost:
    // a child one step short adds one arrow rather than retyping.
    const { inst } = start(3)
    press(inst, 'ArrowUp')          // one step, nowhere near any star
    run(inst)
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(1)
    press(inst, 'ArrowUp')
    expect(arrowsOf(cmdsOf(inst, robot.size))).toHaveLength(2)
  })

  it('is deterministic for a seed', () => {
    const a = start(11).inst
    const b = start(11).inst
    for (const inst of [a, b]) { program(inst, ['Up', 'Right', 'Right']); run(inst) }
    expect(rows(b).join('\n')).toBe(rows(a).join('\n'))
  })

  it('never walks the robot off the board, however the program is written', () => {
    for (const seed of [1, 2, 3]) {
      const { inst } = start(seed)
      for (const dirs of [
        ['Left', 'Left', 'Left', 'Left', 'Left', 'Left'],
        ['Up', 'Up', 'Up', 'Up', 'Up', 'Up'],
        ['Down', 'Down', 'Down', 'Down', 'Down', 'Down'],
        ['Right', 'Right', 'Right', 'Right', 'Right', 'Right'],
      ]) {
        for (let i = 0; i < 8; i++) press(inst, 'Backspace')
        program(inst, dirs)
        run(inst)
        const cmds = cmdsOf(inst, robot.size)
        const board = cmds.find(
          (c): c is Extract<DrawCmd, { op: 'outline' }> => c.op === 'outline',
        )!
        const r = robotOf(cmds)!
        const w = Math.max(...r.rows.map((row) => row.length)) * r.scale
        const h = r.rows.length * r.scale
        expect(r.x).toBeGreaterThanOrEqual(board.x - 2)
        expect(r.x + w).toBeLessThanOrEqual(board.x + board.w + 2)
        expect(r.y).toBeGreaterThanOrEqual(board.y - 2)
        expect(r.y + h).toBeLessThanOrEqual(board.y + board.h + 2)
      }
    }
  })

  it('survives a resize mid-run and keeps everything inside the new field', () => {
    const { inst } = start(4)
    program(inst, ['Right', 'Down', 'Right', 'Up'])
    press(inst, 'Enter')
    ticks(inst, 30)
    cmdsOf(inst, robot.size)                    // running narrow
    const widePW = 70 * PX_PER_CELL
    const cmds = cmdsOf(inst, robot.size, 70)   // ...then the window is dragged
    expect(rows(inst, 70)[0]).toHaveLength(widePW)
    for (const cmd of cmds) {
      if (cmd.op === 'clear') continue
      expect(cmd.x).toBeGreaterThanOrEqual(0)
      expect(cmd.x).toBeLessThanOrEqual(widePW)
      expect(cmd.y).toBeGreaterThanOrEqual(0)
      expect(cmd.y).toBeLessThanOrEqual(PH)
    }
    expect(() => { ticks(inst, 300); cmdsOf(inst, robot.size, 70) }).not.toThrow()
  })

  it('walks between tiles at fractional positions rather than snapping', () => {
    const { inst } = start()
    program(inst, ['Right', 'Right'])
    press(inst, 'Enter')
    const xs: number[] = []
    for (let i = 0; i < 20; i++) {
      inst.tick?.(1 / 60)
      xs.push(robotOf(cmdsOf(inst, robot.size))!.x)
    }
    expect(new Set(xs).size).toBe(20)
    expect(xs.some((x) => !Number.isInteger(x))).toBe(true)
  })

  // THE SOUVENIR replays the plan in words, joined by "then" — which is what
  // a sequence means, and which also keeps "right right up" from reading as
  // a stutter in either language.
  it('replays the program in words, with no digit anywhere, in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const { inst } = start(1, locale)
      program(inst, ['Right', 'Right', 'Up'])
      run(inst)
      const s = inst.souvenir!()
      expect(s, locale).not.toMatch(/\d/)
      expect(s.length, locale).toBeGreaterThan(8)
      const dir = robot.strings?.[locale]?.['robot.dir.right'] ?? ''
      const then = robot.strings?.[locale]?.['robot.then'] ?? ''
      expect(s, `${locale}: does not name the direction`).toContain(dir)
      expect(s, `${locale}: does not sequence the steps`).toContain(then)
      // No step is numbered and no total is given: the words are the whole
      // record of what happened.
      expect(s).not.toMatch(/\b(one|two|three|four|five|six)\b/)
    }
  })

  it('reads warmly at zero progress, in both languages', () => {
    for (const locale of ['en', 'he'] as const) {
      const s = start(1, locale).inst.souvenir!()
      expect(s.length).toBeGreaterThan(6)
      expect(s).not.toMatch(/\d/)
      expect(s).not.toBe('robot.souvenir.none')
    }
  })

  // A program that misses is not a failure. It ends warmly, it says where the
  // robot went, and it never uses the language of losing.
  it('ends warmly when the program misses the star', () => {
    const bad = /lose|lost|fail|wrong|miss|game over|nope|נכשל|הפסד|טעות|פספ/i
    for (const locale of ['en', 'he'] as const) {
      const { inst } = start(1, locale)
      // Six steps into a corner: whatever seed placed the star, this is not
      // where it is (a star is always two to five steps from home).
      program(inst, ['Left', 'Left', 'Left', 'Up', 'Up', 'Up'])
      run(inst)
      const cmds = cmdsOf(inst, robot.size)
      const r = robotOf(cmds)!
      const st = starOf(cmds)!
      expect(Math.abs(r.x - st.x) + Math.abs(r.y - st.y),
        `${locale}: the corner run happened to land on the star`).toBeGreaterThan(4)
      const s = inst.souvenir!()
      expect(s, locale).not.toMatch(bad)
      expect(s.length, locale).toBeGreaterThan(8)
      expect(s, locale).not.toMatch(/\d/)
    }
  })

  it('never says a child lost, failed or got it wrong, in either catalog', () => {
    const bad = /lose|lost|fail|wrong|game over|nope|נכשל|הפסד|טעות/i
    for (const locale of ['en', 'he'] as const) {
      for (const [key, value] of Object.entries(robot.strings?.[locale] ?? {})) {
        expect(value, `${locale}:${key}`).not.toMatch(bad)
      }
    }
  })

  it('paints no character and therefore no step number, ever', () => {
    const { inst } = start()
    program(inst, ['Right', 'Up', 'Left'])
    press(inst, 'Enter')
    for (let i = 0; i < 200; i++) {
      inst.tick?.(1 / 60)
      for (const cmd of cmdsOf(inst, robot.size)) {
        expect(['text', 'put', 'box', 'emoji']).not.toContain(cmd.op)
      }
    }
  })

  it('offers hints for the context bar', () => {
    const { ctx } = start()
    const hints = robot.hints(ctx.t)
    expect(hints.length).toBe(3)
    for (const h of hints) {
      expect(h.keys.length).toBeGreaterThan(0)
      expect(h.label.length).toBeGreaterThan(0)
    }
  })
})
