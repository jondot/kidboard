import { describe, it, expect } from 'vitest'
import pop, { LETTER_BAG, LETTER_TIERS, capital, joinNamed } from './cartridge'
import { registry } from '../index'
import { testCtx, pixelsOf, cmdsOf as bufferOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { PIXEL_ASPECT, PX_PER_CELL } from '../../runtime/shapes'
import type { DrawCmd, LiveInstance } from '../../types'

const G = gridFor(pop.size)
const PW = G.w * PX_PER_CELL
const PH = G.h * PX_PER_CELL

const start = (seed = 1) => {
  const h = testCtx({ seed, strings: pop.strings })
  return { ...h, inst: pop.create(h.ctx) }
}

const cmdsOf = (inst: LiveInstance, cols?: number): DrawCmd[] =>
  bufferOf(inst, pop.size, cols)

/**
 * Every balloon the child can actually see.
 *
 * v2: a balloon is a HOLLOW ring in the pixel field with its letter drawn
 * inside it, so the letter is read off the `text` command and its position
 * off the ring — finer than the character grid this used to scrape, and it
 * asks the same question.
 */
const airborne = (
  inst: LiveInstance,
  cols?: number,
): { letter: string; x: number; y: number }[] =>
  cmdsOf(inst, cols)
    .filter((c): c is Extract<DrawCmd, { op: 'text' }> =>
      c.op === 'text' && /^[A-Z]$/.test(c.text))
    .map((c) => ({ letter: c.text, x: c.x, y: c.y }))

/** The raw, fractional heights the painter is handed — not a rounded model. */
const rawHeights = (inst: LiveInstance): number[] =>
  airborne(inst).map((b) => b.y)

/** Every drawing command, clipped against the real pixel field. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(pop.size, cols)
  const pw = g.w * PX_PER_CELL
  const ph = g.h * PX_PER_CELL
  for (const cmd of cmdsOf(inst, cols)) {
    if (cmd.op === 'clear') continue
    if (cmd.op === 'text') {
      // A character op is in CELL coordinates; one glyph is one cell.
      expect(cmd.x * PX_PER_CELL, 'a letter starts left of the field')
        .toBeGreaterThanOrEqual(0)
      expect((cmd.x + 1) * PX_PER_CELL, 'a letter runs past the right edge')
        .toBeLessThanOrEqual(pw)
      expect(cmd.y * PX_PER_CELL, 'a letter starts above the field')
        .toBeGreaterThanOrEqual(0)
      expect((cmd.y + 1) * PX_PER_CELL, 'a letter runs past the bottom edge')
        .toBeLessThanOrEqual(ph)
      continue
    }
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

/** Runs until at least one balloon is on screen, then hands them over. */
const untilABalloon = (inst: LiveInstance) => {
  for (let i = 0; i < 400 && airborne(inst).length === 0; i++) ticks(inst, 6)
  const seen = airborne(inst)
  expect(seen.length, 'no balloon ever appeared').toBeGreaterThan(0)
  return seen
}

describe('pop — the shape it declares', () => {
  it('is a live, apiVersion 1 cartridge that is honest about being English-only', () => {
    expect(pop.kind).toBe('live')
    expect(pop.apiVersion).toBe(1)
    expect(pop.locales).toEqual(['en'])
    expect(pop.triggers.he).toBeUndefined()
    expect(Object.keys(pop.strings?.en ?? {}).length).toBeGreaterThan(0)
  })

  it('claims no trigger another cartridge already owns', () => {
    const mine = new Set([...(pop.triggers.en ?? []), ...(pop.triggers.emoji ?? [])])
    for (const c of registry()) {
      if (c.id === 'pop') continue
      for (const w of [...(c.triggers.en ?? []), ...(c.triggers.emoji ?? [])]) {
        expect(mine.has(w), `"${w}" is claimed by both pop and ${c.id}`).toBe(false)
      }
    }
  })

  it('leaves the ESC hint to the shell', () => {
    for (const h of pop.hints((k) => k)) {
      expect(h.keys.toLowerCase()).not.toContain('esc')
    }
  })
})

describe('pop — what a child sees', () => {
  // v2: the sky is a pixel field. A balloon is a hollow ring with a real
  // letter inside it and a one-pixel string hanging below.
  it('draws a bordered sky with lettered balloons on strings', () => {
    const { inst } = start()
    untilABalloon(inst)
    ticks(inst, 60)
    const c = cmdsOf(inst)
    expect(c.some((x) => x.op === 'outline')).toBe(true)      // the sky's wall
    expect(c.some((x) => x.op === 'circle')).toBe(true)       // a balloon
    expect(c.some((x) => x.op === 'rect' && x.w === 1)).toBe(true)  // its string
    expect(airborne(inst).length).toBeGreaterThan(0)          // wearing a letter
    const rows = pixelsOf(inst, pop.size).split('\n')
    expect(rows).toHaveLength(PH)
    expect(rows[0]).toHaveLength(PW)
    expect(rows.join('')).toContain('#')
  })

  // THE CONVENTION: monochrome. The balloon is HOLLOW precisely so the letter
  // inside it is legible in the very same ink — this is the one place in the
  // project where text on top of a shape is right, because the letter IS the
  // content of the game.
  it('is monochrome: the theme ground plus exactly one ink, letter included', () => {
    const { inst } = start()
    untilABalloon(inst)
    const tones = new Set(
      cmdsOf(inst).filter((c) => c.op !== 'clear').map((c) => (c as { tone: string }).tone),
    )
    expect(tones.size).toBe(1)
    expect([...tones][0]).toBe('plain')
    // Hollow, not filled: a `circle`, never a `disc`.
    expect(cmdsOf(inst).some((c) => c.op === 'disc')).toBe(false)
  })

  it('sits each letter inside its own balloon', () => {
    const { inst } = start()
    untilABalloon(inst)
    const rings = cmdsOf(inst)
      .filter((c): c is Extract<DrawCmd, { op: 'circle' }> => c.op === 'circle')
    for (const b of airborne(inst)) {
      // A glyph is one cell, so its centre is half a cell past its corner.
      const cx = (b.x + 0.5) * PX_PER_CELL
      const cy = (b.y + 0.5) * PX_PER_CELL
      const home = rings.find((r) =>
        Math.abs(r.x - cx) < r.r && Math.abs(r.y - cy) < r.r * PIXEL_ASPECT)
      expect(home, `the letter ${b.letter} is not inside any balloon`).toBeDefined()
      // ...and the ring is genuinely bigger than the glyph it holds.
      expect(home!.r * 2).toBeGreaterThan(PX_PER_CELL)
      expect(home!.r * 2 * PIXEL_ASPECT).toBeGreaterThan(PX_PER_CELL * 0.6)
    }
  })

  // HUMANE PACING. Balloons arrive on a rhythm, not in a stream: an empty sky
  // for the first beat, and never more than a handful up at once.
  it('lets balloons go at a rhythm, never a stream', () => {
    const { inst } = start(5)
    expect(airborne(inst)).toHaveLength(0)
    let most = 0
    for (let i = 0; i < 3000; i++) {
      ticks(inst, 1)
      most = Math.max(most, airborne(inst).length)
    }
    expect(most).toBeLessThanOrEqual(5)
  })

  it('paints no digit anywhere on the canvas, however long it is played', () => {
    const { inst } = start(7)
    for (let round = 0; round < 40; round++) {
      ticks(inst, 20)
      for (const seen of airborne(inst)) press(inst, seen.letter.toLowerCase())
      for (const cmd of cmdsOf(inst)) {
        const payload = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
        expect(/\d/.test(payload), `painted "${payload}"`).toBe(false)
      }
    }
  })

  it('favours the letters a child is learning over the ones they are not', () => {
    // Not a uniform draw over the alphabet: the first phonics set must come
    // up far more often than q/x/z, or the game spends its time on letters a
    // 6-year-old has barely met.
    const early = new Set(LETTER_TIERS[0]!)
    const late = new Set(LETTER_TIERS[2]!)
    const tickets = (s: Set<string>): number =>
      LETTER_BAG.filter((l) => s.has(l)).length
    expect(tickets(early)).toBeGreaterThan(tickets(late) * 3)

    // …and the rare ones are still real balloons, not removed from the game.
    expect(tickets(late)).toBeGreaterThan(0)

    // Across many seeds, an early letter genuinely shows up more often.
    const counts = new Map<string, number>()
    for (let seed = 1; seed <= 40; seed++) {
      const { inst } = start(seed)
      ticks(inst, 400)
      for (const b of airborne(inst)) {
        const l = b.letter.toLowerCase()
        counts.set(l, (counts.get(l) ?? 0) + 1)
      }
    }
    const sum = (s: Set<string>): number =>
      [...counts].reduce((n, [l, c]) => n + (s.has(l) ? c : 0), 0)
    expect(sum(early)).toBeGreaterThan(sum(late))
  })
})

describe('pop — pressing a letter', () => {
  it('pops the balloon wearing that letter, and only that one', () => {
    const { inst, said } = start(3)
    const before = untilABalloon(inst)
    const target = before[0]!
    press(inst, target.letter.toLowerCase())
    const after = airborne(inst)

    expect(after.some((b) => b.letter === target.letter),
      `${target.letter} was pressed but its balloon is still up`).toBe(false)
    for (const b of before.slice(1)) {
      expect(after.some((x) => x.letter === b.letter),
        `${b.letter} popped even though ${target.letter} was pressed`).toBe(true)
    }
    // A pop is a little burst ring where the balloon was — wider than any
    // balloon, so it cannot be mistaken for one.
    const rings = cmdsOf(inst)
      .filter((c): c is Extract<DrawCmd, { op: 'circle' }> => c.op === 'circle')
    expect(rings.length).toBeGreaterThan(after.length)
    expect(said, 'popping said something instead of just popping').toEqual([])
  })

  it('accepts the letter in either case, because a child may be holding shift', () => {
    for (const shifted of [false, true]) {
      const { inst } = start(5)
      const seen = untilABalloon(inst)
      const target = seen[0]!
      press(inst, shifted ? target.letter : target.letter.toLowerCase())
      expect(airborne(inst).some((b) => b.letter === target.letter)).toBe(false)
    }
  })

  it('does nothing at all for a letter no balloon is wearing', () => {
    const { inst, said } = start(11)
    const seen = untilABalloon(inst)
    const up = new Set(seen.map((b) => b.letter.toLowerCase()))
    const absent = [...'abcdefghijklmnopqrstuvwxyz'].find((l) => !up.has(l))!

    const before = pixelsOf(inst, pop.size)
    const souvenirBefore = inst.souvenir?.()
    press(inst, absent)
    expect(pixelsOf(inst, pop.size), 'an unmatched letter changed the picture')
      .toBe(before)
    expect(inst.souvenir?.(), 'an unmatched letter changed the souvenir')
      .toBe(souvenirBefore)
    expect(said, 'an unmatched letter said something').toEqual([])
  })

  it('ignores every non-letter key in the same silence', () => {
    const { inst, said } = start(13)
    untilABalloon(inst)
    const before = pixelsOf(inst, pop.size)
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', ' ', '1', '9', ';', 'Shift', 'Backspace']) {
      press(inst, k)
    }
    expect(pixelsOf(inst, pop.size)).toBe(before)
    expect(said).toEqual([])
  })

  it('never lets two balloons wear the same letter, so a press is unambiguous', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { inst } = start(seed)
      for (let i = 0; i < 60; i++) {
        ticks(inst, 12)
        const letters = airborne(inst).map((b) => b.letter)
        expect(new Set(letters).size, `duplicate letter in ${letters.join('')}`)
          .toBe(letters.length)
      }
    }
  })
})

describe('pop — motion and the grid', () => {
  it('rises continuously rather than snapping cell to cell', () => {
    const { inst } = start(2)
    untilABalloon(inst)
    const a = rawHeights(inst)
    ticks(inst, 1)
    const b = rawHeights(inst)
    ticks(inst, 1)
    const c = rawHeights(inst)
    expect(a.length).toBeGreaterThan(0)
    expect(b).not.toEqual(a)
    expect(c).not.toEqual(b)
    // …and it is going UP, one small fraction of a cell at a time.
    expect(b[0]!).toBeLessThan(a[0]!)
    expect(a[0]! - b[0]!).toBeLessThan(1)
    expect(a.some((y) => !Number.isInteger(y))).toBe(true)
  })

  it('a balloon that reaches the top is simply gone, and nothing marks it', () => {
    const { inst, said } = start(4)
    untilABalloon(inst)
    // Long enough that many balloons have crossed the whole sky untouched.
    for (let i = 0; i < 60; i++) {
      ticks(inst, 30)
      assertInside(inst)
    }
    expect(said, 'a balloon getting away said something').toEqual([])
    expect(inst.souvenir?.()).toBe('the balloons are still floating — every one of them is wearing a letter!')
  })

  it('lays out against the live grid, at any width', () => {
    for (const cols of [G.w, 40, 55, 72, 96]) {
      const { inst } = start(6)
      for (let i = 0; i < 30; i++) {
        ticks(inst, 15)
        assertInside(inst, cols)
      }
      const rows = pixelsOf(inst, pop.size, cols).split('\n')
      expect(rows).toHaveLength(PH)
      expect(rows[0]).toHaveLength(cols * PX_PER_CELL)
    }
  })

  it('survives a resize mid-play with nothing outside the grid', () => {
    const { inst } = start(8)
    untilABalloon(inst)
    // A child dragging the browser window, or rotating a tablet: the grid
    // changes between one frame and the next, repeatedly.
    for (const cols of [G.w, 88, 34, 61, G.w, 120, 30]) {
      assertInside(inst, cols)
      ticks(inst, 40)
      assertInside(inst, cols)
      const rows = pixelsOf(inst, pop.size, cols).split('\n')
      const want = Math.max(G.w, cols) * PX_PER_CELL
      expect(rows[0]).toHaveLength(want)
      for (const row of rows) expect(row).toHaveLength(want)
    }
  })

  it('is still poppable after a resize', () => {
    const { inst } = start(9)
    untilABalloon(inst)
    cmdsOf(inst, 90)                     // the resize happens on a draw
    ticks(inst, 30)
    const seen = airborne(inst, 90)
    expect(seen.length).toBeGreaterThan(0)
    press(inst, seen[0]!.letter.toLowerCase())
    expect(airborne(inst, 90).some((b) => b.letter === seen[0]!.letter)).toBe(false)
  })
})

describe('pop — the souvenir', () => {
  // M7. A souvenir is what the child takes AWAY, shown after they have
  // already left — so an instruction in it ("press a letter to pop one!")
  // is addressed to somebody who is no longer there. Every other zero
  // -progress line in the project describes the scene left behind, `maze`'s
  // "home is waiting around a corner!" being the shape to copy.
  it('reads warmly at zero progress, describing rather than instructing', () => {
    const { inst } = start()
    const s = inst.souvenir?.() ?? ''
    expect(s, 'the souvenir tells a child who has left what to press')
      .not.toMatch(/\bpress\b|\btype\b|\bcome back\b/i)
    expect(s).toBe('the balloons are still floating — every one of them is wearing a letter!')
    expect(/\d/.test(s)).toBe(false)
    expect(s.trim().length).toBeGreaterThan(0)
  })

  it('names the letters that were popped, never how many', () => {
    const { inst } = start(21)
    const popped: string[] = []
    for (let i = 0; i < 12 && popped.length < 2; i++) {
      ticks(inst, 25)
      for (const b of airborne(inst)) {
        press(inst, b.letter.toLowerCase())
        if (!popped.includes(b.letter)) popped.push(b.letter)
      }
    }
    expect(popped.length).toBeGreaterThanOrEqual(2)
    const s = inst.souvenir?.() ?? ''
    expect(s).toMatch(/^you popped .+!$/)
    expect(s).toContain(popped[0]!)
    expect(s).toContain(' and ')
    expect(/\d/.test(s), `souvenir counted: "${s}"`).toBe(false)
  })

  it('caps a long list with a bare "more" and exactly one conjunction', () => {
    expect(joinNamed(['B'])).toBe('B')
    expect(joinNamed(['B', 'K'])).toBe('B and K')
    expect(joinNamed(['B', 'K', 'S'])).toBe('B, K, and S')
    expect(joinNamed(['B', 'K', 'S', 'more'])).toBe('B, K, S, and more')

    const { inst } = start(33)
    for (let i = 0; i < 40; i++) {
      ticks(inst, 25)
      for (const b of airborne(inst)) press(inst, b.letter.toLowerCase())
      const s = inst.souvenir?.() ?? ''
      expect(s.match(/\band\b/g)?.length ?? 0, `two conjunctions in "${s}"`)
        .toBeLessThanOrEqual(1)
      expect(/and and|, ,|^and\b|\band$/.test(s.replace(/!$/, '')),
        `malformed souvenir "${s}"`).toBe(false)
      expect(/\d/.test(s)).toBe(false)
    }
    expect(inst.souvenir?.()).toContain('more')
  })

  it('never says lose, fail, wrong, miss or game over — anywhere', () => {
    const BAD = /\b(lose|lost|loser|fail|failed|wrong|miss|missed|error|oops|game ?over|score|points?)\b/i
    for (const s of Object.values(pop.strings?.en ?? {})) {
      expect(BAD.test(s), `pop string says "${s}"`).toBe(false)
    }
    for (const h of pop.hints((k) => pop.strings?.en?.[k] ?? k)) {
      expect(BAD.test(h.label)).toBe(false)
    }
    const { inst, said } = start(17)
    for (let i = 0; i < 30; i++) {
      ticks(inst, 20)
      press(inst, 'q')
      press(inst, 'z')
      expect(BAD.test(inst.souvenir?.() ?? '')).toBe(false)
    }
    expect(said, 'the game narrated something at the child').toEqual([])
  })
})

describe('pop — determinism', () => {
  it('the same seed plays the same game, and different seeds differ', () => {
    const play = (seed: number): string => {
      const { inst } = start(seed)
      ticks(inst, 400)
      return pixelsOf(inst, pop.size)
    }
    expect(play(1)).toBe(play(1))
    expect(new Set([1, 2, 3, 4, 5].map(play)).size).toBeGreaterThan(1)
  })

  it('capitalises by table, so no locale-sensitive casing is involved', () => {
    expect(capital('a')).toBe('A')
    expect(capital('z')).toBe('Z')
    expect(capital('?')).toBe('?')
  })
})
