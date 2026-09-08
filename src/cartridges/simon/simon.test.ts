import { describe, it, expect } from 'vitest'
import simon, { LIT_RIM, PADS, RIM, TIMING } from './cartridge'
import { testCtx, pixelsOf, cmdsOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, Locale, LiveInstance } from '../../types'
import en from './en.json'
import he from './he.json'

type Sound = { kind: 'note'; hz: number } | { kind: 'noise' } | { kind: 'blip' }

const start = (locale: Locale = 'en', seed = 1) => {
  const h = testCtx({ locale, seed, strings: simon.strings })
  const heard: Sound[] = []
  h.ctx.audio.note = (hz: number) => { heard.push({ kind: 'note', hz }) }
  h.ctx.audio.noise = () => { heard.push({ kind: 'noise' }) }
  h.ctx.audio.blip = () => { heard.push({ kind: 'blip' }) }
  return { ...h, heard, inst: simon.create(h.ctx) }
}

const cmds = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  cmdsOf(inst, simon.size, cols)
const pixels = (inst: LiveInstance, cols?: number): string =>
  pixelsOf(inst, simon.size, cols)

type Outline = Extract<DrawCmd, { op: 'outline' }>
type Sprite = Extract<DrawCmd, { op: 'sprite' }>

/** The four pad frames, in `PADS` order — that is the order they are drawn. */
const padsOf = (c: DrawCmd[]): Outline[] => c.filter((x) => x.op === 'outline') as Outline[]
const emblemsOf = (c: DrawCmd[]): Sprite[] => c.filter((x) => x.op === 'sprite') as Sprite[]
const ringsOf = (c: DrawCmd[]) =>
  c.filter((x) => x.op === 'circle') as Extract<DrawCmd, { op: 'circle' }>[]

/**
 * Which pad the GAME is flashing, or -1. A lit pad SWELLS: its frame grows
 * outward and its rim doubles. Reading it back off the command buffer keeps
 * these tests black-box — nothing here knows what the seeded sequence is, it
 * watches the game show it, exactly as a child does.
 */
const litPad = (inst: LiveInstance): number =>
  padsOf(cmds(inst)).findIndex((p) => p.t === LIT_RIM)

const outOfField = (c: DrawCmd[], w: number, h: number): string[] => {
  const bad: string[] = []
  const pw = w * PX_PER_CELL
  const ph = h * PX_PER_CELL
  for (const cmd of c) {
    if (cmd.op === 'rect' || cmd.op === 'outline') {
      if (cmd.x < 0 || cmd.y < 0 || cmd.x + cmd.w > pw || cmd.y + cmd.h > ph) {
        bad.push(`${cmd.op} at ${cmd.x},${cmd.y}`)
      }
    }
    if (cmd.op === 'disc' || cmd.op === 'circle') {
      if (cmd.x - cmd.r < 0 || cmd.x + cmd.r > pw
        || cmd.y - cmd.r * PIXEL_ASPECT < 0 || cmd.y + cmd.r * PIXEL_ASPECT > ph) {
        bad.push(`${cmd.op} at ${cmd.x},${cmd.y}`)
      }
    }
    if (cmd.op === 'sprite') {
      const sw = Math.max(...cmd.rows.map((r) => r.length)) * cmd.scale
      if (cmd.x < 0 || cmd.y < 0 || cmd.x + sw > pw
        || cmd.y + cmd.rows.length * cmd.scale > ph) {
        bad.push(`sprite at ${cmd.x},${cmd.y}`)
      }
    }
  }
  return bad
}

/** Runs the clock until the sequence has finished flashing, recording it. */
const watchSequence = (inst: LiveInstance, len: number): number[] => {
  const seen: number[] = []
  const dt = 1 / 120
  const total = TIMING.lead + len * (TIMING.on + TIMING.gap) + 0.3
  for (let t = 0; t < total; t += dt) {
    inst.tick?.(dt)
    const i = litPad(inst)
    if (i >= 0 && seen[seen.length - 1] !== i) seen.push(i)
  }
  return seen
}

/**
 * Dismisses a HOLD the way a child does: wait out the ignore window, then
 * press something. Nothing in this game advances on its own any more.
 */
const goOn = (inst: LiveInstance): void => {
  ticks(inst, Math.ceil(TIMING.ignore * 120) + 4, 1 / 120)
  press(inst, ' ')
}

/** Watches one round and answers it correctly, leaving the game in its hold. */
const playRound = (inst: LiveInstance, len: number): number[] => {
  const seq = watchSequence(inst, len)
  for (const i of seq) press(inst, PADS[i]!.keys[1]!)
  return seq
}

/** …and then asks for the next one. */
const playOn = (inst: LiveInstance, len: number): number[] => {
  const seq = playRound(inst, len)
  goOn(inst)
  return seq
}

describe('simon', () => {
  it('draws four hollow pads in a diamond, each with a picture of its own', () => {
    const { inst } = start()
    const c = cmds(inst)
    const pads = padsOf(c)
    const emblems = emblemsOf(c)
    expect(pads).toHaveLength(PADS.length)
    expect(emblems).toHaveLength(PADS.length)
    for (const p of pads) expect(p.t).toBe(RIM)

    // A diamond: up is above left and right, which are above down. That is
    // what makes the arrow keys mean what they look like, in every language.
    const mid = (o: Outline) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 })
    const [up, left, right, down] = pads.map(mid)
    expect(up!.y).toBeLessThan(left!.y)
    expect(down!.y).toBeGreaterThan(left!.y)
    expect(left!.x).toBeLessThan(up!.x)
    expect(right!.x).toBeGreaterThan(up!.x)
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2)
  })

  it('tells the pads apart by PICTURE, not by colour', () => {
    // The whole problem monochrome created here, and the answer to it: four
    // silhouettes that share no outline. Every one of them is drawn in the
    // one ink, and no two are the same bitmap.
    const { inst } = start()
    const c = cmds(inst)
    const shapes = emblemsOf(c).map((s) => s.rows.join('|'))
    expect(new Set(shapes).size).toBe(PADS.length)
    for (const cmd of c) {
      if (cmd.op === 'clear') continue
      if ('tone' in cmd) expect(cmd.tone, `${cmd.op} used a second tone`).toBe('plain')
      expect(cmd.op).not.toBe('text')
      expect(cmd.op).not.toBe('put')
      expect(cmd.op).not.toBe('emoji')
    }
    // Big enough to read across a room: a scaled bitmap, never a shrunken one.
    for (const s of emblemsOf(c)) expect(s.scale).toBeGreaterThanOrEqual(2)
  })

  it('flashes the sequence by itself, with a note per flash', () => {
    const { inst, heard } = start()
    expect(litPad(inst)).toBe(-1)
    const seq = watchSequence(inst, 1)
    expect(seq).toHaveLength(1)
    expect(heard.filter((s) => s.kind === 'note')).toHaveLength(1)
  })

  it('makes a lit pad SWELL, and the child\'s own press a ring', () => {
    // The two must never look the same: one is the game talking, the other is
    // the child answering.
    const { inst } = start()
    const seq = watchSequence(inst, 1)         // now listening
    const i = seq[0]!
    press(inst, PADS[i]!.keys[0]!)
    const c = cmds(inst)
    const pad = padsOf(c)[i]!
    const ring = ringsOf(c).find((r) =>
      Math.abs(r.x - (pad.x + pad.w / 2)) < 1 && Math.abs(r.y - (pad.y + pad.h / 2)) < 1)
    expect(ring, 'the press left no ring on the pad it touched').toBeDefined()
    expect(padsOf(c).every((p) => p.t === RIM), 'a press lit a pad like the game does')
      .toBe(true)
  })

  it('sounds the pad the child presses, and every pad has its own pitch', () => {
    const pitches = PADS.map((p) => {
      const s = start()
      watchSequence(s.inst, 1)
      s.heard.length = 0
      press(s.inst, p.keys[1]!)
      const first = s.heard[0]
      // A pad answers to touch whether or not it was the pad being asked for.
      expect(first?.kind).toBe('note')
      return (first as { hz: number }).hz
    })
    expect(new Set(pitches).size).toBe(PADS.length)
  })

  it('accepts arrows and the number row for the same pads', () => {
    const arrows = start()
    const digits = start()
    watchSequence(arrows.inst, 1)
    watchSequence(digits.inst, 1)
    arrows.heard.length = 0
    digits.heard.length = 0
    press(arrows.inst, PADS[2]!.keys[0]!)
    press(digits.inst, PADS[2]!.keys[1]!)
    expect(digits.heard).toEqual(arrows.heard)
    expect(pixels(digits.inst)).toBe(pixels(arrows.inst))
  })

  it('grows the sequence by one each round', () => {
    const { inst } = start()
    expect(playOn(inst, 1)).toHaveLength(1)
    expect(playOn(inst, 2)).toHaveLength(2)
    expect(playOn(inst, 3)).toHaveLength(3)
  })

  it('keeps the sequence it already showed, only adding to it', () => {
    const { inst } = start()
    const first = playOn(inst, 1)
    const second = playOn(inst, 2)
    expect(second.slice(0, 1)).toEqual(first)
  })

  // Rule 4 of the house style: a round ends when the CHILD says it ends.
  it('holds the celebration until the child asks for the next round', () => {
    const { inst } = start()
    playRound(inst, 1)                          // answered: now cheering
    ticks(inst, 60, 1 / 60)                     // the child's own press fades
    const cheering = pixels(inst)
    expect(ringsOf(cmds(inst)).length, 'no firework').toBeGreaterThan(1)

    // Ten seconds of clock change nothing at all. Nothing re-arms on a timer.
    ticks(inst, 600, 1 / 60)
    expect(pixels(inst)).toBe(cheering)

    press(inst, PADS[0]!.keys[0]!)              // …and the child asks
    expect(watchSequence(inst, 2)).toHaveLength(2)
  })

  it('ignores the first half second of a hold, so a masher cannot blow through it', () => {
    const { inst } = start()
    playRound(inst, 1)
    // A key inside the ignore window does nothing: the picture is still the
    // one that says what just happened.
    const cheering = pixels(inst)
    ticks(inst, 6, 1 / 60)
    press(inst, PADS[0]!.keys[0]!)
    press(inst, PADS[1]!.keys[0]!)
    expect(pixels(inst)).toBe(cheering)
    // Past it, the same key works.
    ticks(inst, Math.ceil(TIMING.ignore * 60) + 2, 1 / 60)
    press(inst, PADS[0]!.keys[0]!)
    expect(watchSequence(inst, 2)).toHaveLength(2)
  })

  // The heart of it: a wrong repeat is not a loss. Nothing ends, nothing
  // shrinks, the same sequence simply plays again.
  it('replays the sequence after a mismatched repeat instead of ending', () => {
    const { inst, exited, heard } = start()
    const seq = watchSequence(inst, 1)
    const other = PADS[(seq[0]! + 1) % PADS.length]!
    heard.length = 0
    press(inst, other.keys[1]!)
    expect(exited()).toBe(false)
    // It holds, with one quiet ring in the middle — never a word, never a
    // cross, never anything that says a child got something wrong.
    ticks(inst, 30, 1 / 60)                     // the child's own press fades
    expect(ringsOf(cmds(inst))).toHaveLength(1)
    ticks(inst, 600, 1 / 60)
    expect(litPad(inst), 'it restarted on a timer').toBe(-1)

    // And when the child asks, it plays the very same sequence over again.
    goOn(inst)
    const replay = watchSequence(inst, 1)
    expect(replay).toEqual(seq)

    // …and the child can still get it, after as many tries as they like.
    for (const i of replay) press(inst, PADS[i]!.keys[1]!)
    expect(inst.souvenir!()).toContain(PADS[seq[0]!]!.id)
  })

  it('runs on accumulated seconds, not on frames', () => {
    const slow = start(); ticks(slow.inst, 60, 1 / 60)
    const fast = start(); ticks(fast.inst, 120, 1 / 120)
    expect(pixels(fast.inst)).toBe(pixels(slow.inst))
    expect(fast.heard).toEqual(slow.heard)
  })

  it('keeps everything inside the field across a mid-play resize', () => {
    const { inst } = start()
    for (const cols of [simon.size.cols, 33, 44, 60, 100]) {
      ticks(inst, 37, 1 / 60)
      const g = gridFor(simon.size, cols)
      expect(outOfField(cmds(inst, cols), g.w, g.h), `at ${cols} columns`).toEqual([])
    }
  })

  it('is a FIELD, not a slot: the diamond pillarboxes on a wide screen', () => {
    const { inst } = start()
    const narrow = padsOf(cmds(inst))
    const wide = padsOf(cmds(inst, 100))
    const span = (ps: Outline[]): number =>
      Math.max(...ps.map((p) => p.x + p.w)) - Math.min(...ps.map((p) => p.x))
    expect(span(wide)).toBeGreaterThan(span(narrow))
    // …but never past 4:3, so there is ground either side rather than a
    // diamond stretched across a desktop.
    expect(span(wide)).toBeLessThan(100 * PX_PER_CELL * 0.7)
  })

  it('names the shapes remembered, never how many rounds', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, ctx } = start(locale)
      const seq = playRound(inst, 1)
      const s = inst.souvenir!()
      expect(s).toContain(ctx.t(`simon.shape.${PADS[seq[0]!]!.id}`))
      expect(s).not.toMatch(/\d/)
    }
  })

  it('caps a long memory instead of spelling out every flash', () => {
    const { inst } = start()
    for (let round = 1; round <= 9; round++) playOn(inst, round)
    const s = inst.souvenir!()
    expect(s).not.toMatch(/\d/)
    expect(s.split(/\s+/).length).toBeLessThan(20)
  })

  it('reads warmly, never as a zero, before a single pad is remembered', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      const { inst, ctx } = start(locale)
      const s = inst.souvenir!()
      expect(s).toBe(ctx.t('simon.souvenir.none'))
      expect(s).not.toMatch(/\d/)
      expect(s.length).toBeGreaterThan(0)
    }
  })

  it('never paints a bare number on the canvas', () => {
    const { inst } = start()
    for (let round = 1; round <= 4; round++) {
      playOn(inst, round)
      for (const cmd of cmds(inst)) {
        const s = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
        expect(/^\d+$/.test(s.trim())).toBe(false)
      }
    }
  })

  it('never tells a child they lost, in either language', () => {
    const banned = [
      /lose/i, /lost/i, /fail/i, /wrong/i, /game over/i, /oops/i, /miss/i,
      'הפסד', 'הפסדת', 'נכשל', 'טעות', 'לא נכון', 'סוף המשחק',
    ]
    for (const cat of [en, he]) {
      for (const v of Object.values(cat as Record<string, string>)) {
        for (const b of banned) {
          expect(typeof b === 'string' ? v.includes(b) : b.test(v), `"${v}"`).toBe(false)
        }
      }
    }
  })

  it('draws the same picture in both languages', () => {
    expect(pixels(start('he').inst)).toBe(pixels(start('en').inst))
    const g = gridFor(simon.size)
    expect(pixels(start('en').inst).split('\n')).toHaveLength(g.h * PX_PER_CELL)
  })

  it('never flashes the same pad twice in a row, so a young child can follow', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { inst } = start('en', seed)
      let seq: number[] = []
      for (let round = 1; round <= 5; round++) seq = playOn(inst, round)
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
    }
  })
})
