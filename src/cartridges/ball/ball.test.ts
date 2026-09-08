import { describe, it, expect } from 'vitest'
import type { DrawCmd } from '../../types'
import ball from './cartridge'
import { testCtx, pixelsOf, cmdsOf, holdKey, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'

const G = gridFor(ball.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL

/** On-screen width-to-height ratio of a `w x h` block of logical pixels. A
 *  pixel is 0.6 as wide as it is tall, so the pixel counts are not the
 *  picture's proportions — this is the number the eye actually sees. */
const seen = (w: number, h: number): number => (PIXEL_ASPECT * w) / h

// `ball.strings` must be wired into the ctx exactly as `session.ts` wires a
// cartridge's own strings in production — otherwise `ctx.t` can only see the
// shell catalog and `ball.souvenir` would render as the raw key.
const start = (seed = 1) => {
  const h = testCtx({ seed, strings: ball.strings })
  return { ...h, inst: ball.create(h.ctx) }
}

/** The paddle is the only `rect`; the ball is the only `disc`. */
const paddleOf = (cmds: DrawCmd[]) =>
  cmds.find((c) => c.op === 'rect') as
    Extract<DrawCmd, { op: 'rect' }> | undefined
const ballOf = (cmds: DrawCmd[]) =>
  cmds.find((c) => c.op === 'disc') as
    Extract<DrawCmd, { op: 'disc' }> | undefined
const courtOf = (cmds: DrawCmd[]) =>
  cmds.find((c) => c.op === 'outline') as
    Extract<DrawCmd, { op: 'outline' }> | undefined

const rows = (inst: Parameters<typeof pixelsOf>[0], cols?: number) =>
  pixelsOf(inst, ball.size, cols).split('\n')

describe('ball', () => {
  it('declares a live cartridge with both locales', () => {
    expect(ball.kind).toBe('live')
    expect(ball.apiVersion).toBe(1)
    expect(ball.locales).toEqual(['en', 'he'])
  })

  // v2: this game is drawn in the PIXEL field, not with characters. A 1977
  // paddle game is three flat shapes — a bordered court, a bar, a ball — and
  // nothing on screen is a glyph.
  it('draws the court, the paddle and the ball as shapes, with no characters at all', () => {
    const cmds = cmdsOf(start().inst, ball.size)
    expect(courtOf(cmds)).toBeDefined()
    expect(paddleOf(cmds)).toBeDefined()
    expect(ballOf(cmds)).toBeDefined()
    for (const cmd of cmds) {
      expect(['clear', 'outline', 'rect', 'disc'], `unexpected op ${cmd.op}`)
        .toContain(cmd.op)
    }
  })

  // THE CONVENTION, first rule: a play field is field-shaped, never a slot.
  // At the declared width the canvas already is one, so the court fills it.
  it('fills the whole field at the declared width, because that field is already field-shaped', () => {
    const court = courtOf(cmdsOf(start().inst, ball.size))!
    expect([court.x, court.y]).toEqual([0, 0])
    expect(court.w).toBe(PW)
    expect(court.h).toBe(PH)
    expect(court.t).toBeGreaterThan(1)      // a rail, not a hairline
    expect(seen(court.w, court.h)).toBeGreaterThanOrEqual(3 / 4)
    expect(seen(court.w, court.h)).toBeLessThanOrEqual(4 / 3)
  })

  it('paints a solid rail all the way across the top and both sides', () => {
    const r = rows(start().inst)
    expect(r).toHaveLength(PH)
    expect(r[0]).toBe('#'.repeat(PW))
    const middle = r[Math.floor(PH / 2)]!
    expect(middle.startsWith('###')).toBe(true)
    expect(middle.endsWith('###')).toBe(true)
    expect(middle.slice(6, -6)).toBe('.'.repeat(PW - 12))
  })

  // THE CONVENTION, second rule: MONOCHROME. The theme's ground plus ONE ink,
  // for everything. What tells the court from the paddle is fill, not hue —
  // the court is hollow, the two solid things are the things. A second tone
  // is only ever earned by "the thing the child controls", and here it is not
  // needed at all, so it is not spent.
  it('is monochrome: the theme ground plus exactly one ink', () => {
    const { inst } = start()
    press(inst, ' ')
    ticks(inst, 120)
    const cmds = cmdsOf(inst, ball.size).filter((c) => c.op !== 'clear')
    const tones = new Set(cmds.map((c) => (c as { tone: string }).tone))
    expect(tones.size).toBe(1)
    expect([...tones][0]).toBe('plain')
  })

  it('tells the court from the things by fill, not by colour', () => {
    const cmds = cmdsOf(start().inst, ball.size)
    expect(courtOf(cmds)!.op).toBe('outline')     // the world is hollow
    expect(paddleOf(cmds)!.op).toBe('rect')       // the things are solid
    expect(ballOf(cmds)!.op).toBe('disc')
  })

  // NOTHING RE-ARMS ON A TIMER. The ball waits on the paddle until the child
  // sends it off, and goes back there when it is missed. A pause a child
  // chooses to end is the difference between a game and a stampede.
  it('starts at rest on the paddle and stays there until a key is pressed', () => {
    const { inst } = start()
    const at = () => ballOf(cmdsOf(inst, ball.size))!
    const first = at()
    ticks(inst, 600)
    expect(at().x).toBe(first.x)
    expect(at().y).toBe(first.y)
    // ...and it is sitting ON the bar, so the picture says what will happen.
    const p = paddleOf(cmdsOf(inst, ball.size))!
    expect(first.x).toBeCloseTo(p.x + p.w / 2, 5)
    expect(first.y).toBeLessThan(p.y)
    expect(first.y + first.r).toBeGreaterThanOrEqual(p.y - 2)
  })

  it('rides the paddle while it waits, so the serve can be aimed', () => {
    const { inst } = start()
    const before = ballOf(cmdsOf(inst, ball.size))!.x
    // ArrowLeft both moves the bar and sends the ball off, so read the ball
    // on the very frame the key lands: it has moved with the bar.
    press(inst, 'ArrowLeft')
    expect(ballOf(cmdsOf(inst, ball.size))!.x).toBeLessThan(before)
  })

  it('serves upward, away from the bar, so the first thing a child sees is a rally', () => {
    const { inst } = start()
    const y0 = ballOf(cmdsOf(inst, ball.size))!.y
    press(inst, ' ')
    ticks(inst, 20)
    expect(ballOf(cmdsOf(inst, ball.size))!.y).toBeLessThan(y0)
  })

  it('comes to rest after a miss instead of re-serving itself', () => {
    const { inst } = start(2)
    press(inst, ' ')
    // Long enough that a miss has certainly happened at least once.
    ticks(inst, 900)
    const a = ballOf(cmdsOf(inst, ball.size))!
    ticks(inst, 300)
    const b = ballOf(cmdsOf(inst, ball.size))!
    const p = paddleOf(cmdsOf(inst, ball.size))!
    // Either the rally is still going (the ball moved) or it is resting on
    // the bar — and if it is resting, it is STILL resting 300 ticks later.
    const moved = a.x !== b.x || a.y !== b.y
    if (!moved) {
      expect(b.x).toBeCloseTo(p.x + p.w / 2, 5)
      expect(b.y).toBeLessThan(p.y)
    }
    // And a key always gets it going again — there is no way to be stuck.
    press(inst, ' ')
    const c1 = ballOf(cmdsOf(inst, ball.size))!
    ticks(inst, 10)
    expect(ballOf(cmdsOf(inst, ball.size))!.y).not.toBe(c1.y)
  })

  /**
   * C1. The pause above is only real if it survives a HELD key, and holding
   * the arrow down IS how a six-year-old plays this game — they chase the
   * ball with the key pressed. Measured in Chrome before this test existed:
   * with the hands off the keyboard the ball parked for the full nine
   * seconds; with ArrowLeft held at the OS repeat rate it never parked for
   * more than TWO FRAMES. The pause was there the whole time and the child
   * never saw it once.
   *
   * So the assertion is the browser measurement: sample the ball every frame
   * for nine seconds with the key down, and the longest run of frames it
   * spends parked on the bar must be about half a second.
   */
  it('holds the pause for half a second even while an arrow is held down', () => {
    const { inst } = start(2)
    press(inst, ' ')
    let run = 0
    let longest = 0
    let served = false
    holdKey(inst, 'ArrowLeft', 9, {
      each: () => {
        const cmds = cmdsOf(inst, ball.size)
        const b = ballOf(cmds)!
        const p = paddleOf(cmds)!
        // The resting ball sits dead on top of the bar; `disc` squashes its
        // vertical radius by the pixel aspect, so this is an exact equality.
        const parked = Math.abs(b.y - (p.y - b.r * PIXEL_ASPECT - 1)) < 1e-9
        if (parked) { run += 1; longest = Math.max(longest, run) } else { run = 0; served = true }
      },
    })
    // Half a second is 30 frames at 60Hz; the miss itself costs one or two.
    expect(longest, 'a held arrow blew straight through the pause')
      .toBeGreaterThanOrEqual(25)
    // ...and the very same held key still serves it again once the moment
    // has landed, so a child holding a key is never stuck either.
    expect(served, 'the held key never got the ball going again').toBe(true)
  })

  // THE CONVENTION, third rule: a 6-year-old has to be able to track the
  // moving thing without effort. The ball is a real fraction of the court,
  // not a speck adrift in it.
  it('draws a ball big enough to follow across a room', () => {
    const cmds = cmdsOf(start().inst, ball.size)
    const b = ballOf(cmds)!
    const court = courtOf(cmds)!
    expect(b.r * 2).toBeGreaterThanOrEqual(12)
    expect(b.r * 2 / court.w).toBeGreaterThan(0.03)
    const p = paddleOf(cmds)!
    expect(p.h).toBeGreaterThanOrEqual(6)
    expect(p.w / court.w).toBeGreaterThan(0.1)
  })

  it('moves the paddle left on ArrowLeft in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ locale, strings: ball.strings })
      const inst = ball.create(h.ctx)
      const before = paddleOf(cmdsOf(inst, ball.size))!.x
      press(inst, 'ArrowLeft', 2)
      const after = paddleOf(cmdsOf(inst, ball.size))!.x
      expect(after, `paddle did not move left under ${locale}`).toBeLessThan(before)
    }
  })

  it('keeps the paddle inside the court however hard a child mashes', () => {
    const { inst } = start()
    press(inst, 'ArrowLeft', 200)
    let cmds = cmdsOf(inst, ball.size)
    let court = courtOf(cmds)!
    expect(paddleOf(cmds)!.x).toBeGreaterThanOrEqual(court.x + court.t)
    press(inst, 'ArrowRight', 400)
    cmds = cmdsOf(inst, ball.size)
    court = courtOf(cmds)!
    const p = paddleOf(cmds)!
    expect(p.x + p.w).toBeLessThanOrEqual(court.x + court.w - court.t)
  })

  it('moves the ball over time', () => {
    const { inst } = start()
    press(inst, ' ')
    const before = rows(inst).join('\n')
    ticks(inst, 6)
    expect(rows(inst).join('\n')).not.toBe(before)
  })

  it('is deterministic for a seed', () => {
    const a = start(7); const b = start(7)
    press(a.inst, ' '); press(b.inst, ' ')
    ticks(a.inst, 40); ticks(b.inst, 40)
    expect(rows(a.inst).join('\n')).toBe(rows(b.inst).join('\n'))
  })

  it('never leaves the ball outside the court over a long run', () => {
    const { inst } = start(3)
    for (let i = 0; i < 600; i++) {
      // A serve every so often, because a missed ball now WAITS rather than
      // re-arming itself — exactly what a child pressing a key does.
      if (i % 60 === 0) press(inst, ' ')
      ticks(inst, 1)
      const cmds = cmdsOf(inst, ball.size)
      const b = ballOf(cmds)!
      const court = courtOf(cmds)!
      expect(b.x - b.r).toBeGreaterThanOrEqual(court.x + court.t)
      expect(b.x + b.r).toBeLessThanOrEqual(court.x + court.w - court.t)
      expect(b.y).toBeGreaterThan(court.y)
      expect(b.y).toBeLessThan(court.y + court.h)
    }
  })

  // Rewritten: the old assertion (`toMatch(/\d/)`) required a bare number in
  // the souvenir — that IS the scoring bug this cartridge shipped with. A
  // souvenir now names what happened (a sound), never how many times.
  it('reports a qualitative souvenir, never a count, and never a loss', () => {
    const { inst } = start()
    press(inst, ' ')
    ticks(inst, 400)
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
    expect(s.toLowerCase()).not.toMatch(/lose|lost|fail|game over|wrong/)
  })

  // A child who mounts `ball` and leaves immediately, without ever hitting
  // the paddle, must still get a warm line — never a dangling or numeric one.
  it('reads warmly even with zero paddle hits', () => {
    const { inst } = start()
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toMatch(/\d/)
  })

  it('no bare number is ever painted on the court', () => {
    const { inst } = start()
    press(inst, ' ')
    ticks(inst, 400)
    for (const cmd of cmdsOf(inst, ball.size)) {
      expect(cmd.op === 'text' || cmd.op === 'put').toBe(false)
    }
  })

  // v2: a game declares columns and an aspect, and reads the REAL grid off
  // the canvas each frame. The court has to fill whatever it is handed.
  it('declares columns and an aspect rather than pixels or a fixed box', () => {
    expect(ball.size.cols).toBeGreaterThan(0)
    expect(ball.size.aspect).toBeGreaterThan(0)
    expect(ball.size).not.toHaveProperty('w')
  })

  // THE PILLARBOX. A wide screen hands a game extra COLUMNS at the same row
  // count, so a court that filled it edge to edge would become a horizon. It
  // grows to 4:3 and then stops, centred, with the theme's own ground either
  // side — the way a 4:3 game sits in the middle of a wide television.
  it('grows to 4:3 on a wide screen and then stops, centred, instead of becoming a horizon', () => {
    const cmds = cmdsOf(start().inst, ball.size, 75)
    const widePW = 75 * PX_PER_CELL
    const court = courtOf(cmds)!
    expect(court.h).toBe(PH)                      // full height, always
    expect(court.w).toBeLessThan(widePW)          // but NOT full width
    expect(seen(court.w, court.h)).toBeCloseTo(4 / 3, 1)
    // Centred: the ground left of the court equals the ground right of it.
    expect(court.x).toBeCloseTo(widePW - (court.x + court.w), 0)
    // And the picture really is pillarboxed in the pixel model, not just in
    // the command buffer: the top row has background at both ends.
    const r = rows(start().inst, 75)
    expect(r[0]!.startsWith('.')).toBe(true)
    expect(r[0]!.endsWith('.')).toBe(true)
    expect(r[0]).toContain('#')
    // Height is a property of the game, so it does not stretch with width.
    expect(r).toHaveLength(PH)
  })

  it('keeps the ball and paddle inside a court that was resized mid-rally', () => {
    const { inst } = start(5)
    press(inst, ' ')
    ticks(inst, 30)
    cmdsOf(inst, ball.size)                     // running narrow
    const cmds = cmdsOf(inst, ball.size, 60)    // ...then the window is dragged
    const court = courtOf(cmds)!
    const b = ballOf(cmds)!
    const p = paddleOf(cmds)!
    expect(b.x - b.r).toBeGreaterThanOrEqual(court.x + court.t)
    expect(b.x + b.r).toBeLessThanOrEqual(court.x + court.w - court.t)
    expect(p.x).toBeGreaterThanOrEqual(court.x + court.t)
    expect(p.x + p.w).toBeLessThanOrEqual(court.x + court.w - court.t)
    ticks(inst, 200)
    expect(() => cmdsOf(inst, ball.size, 60)).not.toThrow()
  })

  // THE MOTION. The ball's recorded position is fractional and changes every
  // single frame; the painter snaps it to whole DEVICE pixels, which are far
  // finer than the logical ones, so it glides rather than lurching.
  it('draws the ball at a fractional position, a new one every frame', () => {
    const { inst } = start(1)
    press(inst, ' ')
    cmdsOf(inst, ball.size)
    const xs: number[] = []
    for (let i = 0; i < 30; i++) {
      ticks(inst, 1, 1 / 60)
      xs.push(ballOf(cmdsOf(inst, ball.size))!.x)
    }
    expect(new Set(xs).size).toBe(30)
    expect(xs.some((x) => !Number.isInteger(x))).toBe(true)
  })

  it('offers hints for the context bar', () => {
    const { ctx } = start()
    const hints = ball.hints(ctx.t)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0]!.keys.length).toBeGreaterThan(0)
  })
})
