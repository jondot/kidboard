import { describe, it, expect } from 'vitest'
import rain, { WORDS, ZAP_MARK, capitals, joinNamed } from './cartridge'
import { registry } from '../index'
import { testCtx, frameOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { Canvas } from '../../runtime/Canvas'
import type { DrawCmd, LiveInstance } from '../../types'

const G = gridFor(rain.size)

// A local copy of the runtime's width rule, so this spec never couples itself
// to a module another task may be editing.
const WIDE = /\p{Extended_Pictographic}/u
const wide = (s: string): boolean => s !== '' && WIDE.test(s)

const start = (seed = 1) => {
  const h = testCtx({ seed, strings: rain.strings })
  return { ...h, inst: rain.create(h.ctx) }
}

const cmdsOf = (inst: LiveInstance, cols?: number): DrawCmd[] => {
  const g = gridFor(rain.size, cols)
  const c = new Canvas(g.w, g.h)
  inst.draw(c)
  return c.cmds()
}

const rowsOf = (inst: LiveInstance, cols?: number): string[] =>
  frameOf(inst, rain.size, cols).split('\n')

/**
 * The words the child can read on the sky, off the integer frame. The bottom
 * interior row is the typing line, not weather, so it is skipped.
 */
const falling = (
  inst: LiveInstance,
  cols?: number,
): { word: string; x: number; y: number }[] => {
  const out: { word: string; x: number; y: number }[] = []
  rowsOf(inst, cols).slice(1, G.h - 2).forEach((row, i) => {
    for (const m of row.matchAll(/[A-Z]+/g)) out.push({ word: m[0], x: m.index!, y: i + 1 })
  })
  return out
}

/** What the typing line is showing, as the child sees it. */
const buffer = (inst: LiveInstance, cols?: number): string => {
  const row = rowsOf(inst, cols)[G.h - 2] ?? ''
  const m = row.match(/>\s*([A-Z]*)/)
  return m?.[1] ?? ''
}

/** The raw, fractional heights the painter is handed — not the rounded model. */
const rawHeights = (inst: LiveInstance): number[] =>
  cmdsOf(inst)
    .filter((c): c is Extract<DrawCmd, { op: 'text' }> =>
      c.op === 'text' && /^[A-Z]+$/.test(c.text))
    .map((c) => c.y)

/** Every drawing command, clipped against the real grid — see catch.test.ts. */
const assertInside = (inst: LiveInstance, cols?: number): void => {
  const g = gridFor(rain.size, cols)
  const c = new Canvas(g.w, g.h)
  inst.draw(c)
  for (const cmd of c.cmds()) {
    if (cmd.op === 'clear') continue
    let x1 = cmd.x
    let y1 = cmd.y
    if (cmd.op === 'put') x1 = cmd.x + (wide(cmd.ch) ? 1 : 0)
    if (cmd.op === 'emoji') x1 = cmd.x + 1
    if (cmd.op === 'text') {
      x1 = cmd.x + [...cmd.text].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0) - 1
    }
    if (cmd.op === 'box') { x1 = cmd.x + cmd.w - 1; y1 = cmd.y + cmd.h - 1 }
    expect(cmd.x, `${cmd.op} starts left of the grid`).toBeGreaterThanOrEqual(0)
    expect(x1, `${cmd.op} runs past the right edge`).toBeLessThanOrEqual(g.w - 1)
    expect(cmd.y, `${cmd.op} starts above the grid`).toBeGreaterThanOrEqual(0)
    expect(y1, `${cmd.op} runs past the bottom edge`).toBeLessThanOrEqual(g.h - 1)
  }
}

const untilAWord = (inst: LiveInstance) => {
  for (let i = 0; i < 200 && falling(inst).length === 0; i++) ticks(inst, 6)
  const seen = falling(inst)
  expect(seen.length, 'no word ever fell').toBeGreaterThan(0)
  return seen
}

const type = (inst: LiveInstance, word: string): void => {
  for (const ch of word) press(inst, ch)
}

describe('rain — the shape it declares', () => {
  it('is a live, apiVersion 1 cartridge that is honest about being English-only', () => {
    expect(rain.kind).toBe('live')
    expect(rain.apiVersion).toBe(1)
    expect(rain.locales).toEqual(['en'])
    expect(rain.triggers.he).toBeUndefined()
    expect(Object.keys(rain.strings?.en ?? {}).length).toBeGreaterThan(0)
  })

  it('claims no trigger another cartridge already owns', () => {
    const mine = new Set([...(rain.triggers.en ?? []), ...(rain.triggers.emoji ?? [])])
    for (const c of registry()) {
      if (c.id === 'rain') continue
      for (const w of [...(c.triggers.en ?? []), ...(c.triggers.emoji ?? [])]) {
        expect(mine.has(w), `"${w}" is claimed by both rain and ${c.id}`).toBe(false)
      }
    }
  })

  it('leaves the ESC hint to the shell', () => {
    for (const h of rain.hints((k) => k)) {
      expect(h.keys.toLowerCase()).not.toContain('esc')
    }
  })

  it('drops only short words a 6-year-old can read', () => {
    expect(WORDS.length).toBeGreaterThan(20)
    for (const w of WORDS) {
      expect(w.length, `"${w}" is not 3-4 letters`).toBeGreaterThanOrEqual(3)
      expect(w.length, `"${w}" is not 3-4 letters`).toBeLessThanOrEqual(4)
      expect(w, `"${w}" is not plain lowercase Latin`).toMatch(/^[a-z]+$/)
    }
    expect(new Set(WORDS).size, 'a word is listed twice').toBe(WORDS.length)
    // Words the rest of Kidboard already celebrates, so a word that falls
    // here is one the child has been cheered for elsewhere.
    for (const w of ['cat', 'dog', 'sun', 'bus']) expect(WORDS).toContain(w)
  })
})

describe('rain — what a child sees', () => {
  it('draws a bordered sky with falling words and a typing line', () => {
    const { inst } = start()
    untilAWord(inst)
    const rows = rowsOf(inst)
    expect(rows).toHaveLength(G.h)
    expect(rows[0]).toHaveLength(G.w)
    // The court's own corner. The sky is drawn in the character idiom's
    // shared frame now (`cartridges/card.ts`) rather than in `c.box`'s dashes.
    expect(rows[0]).toContain('┌')
    expect(rows.slice(1, G.h - 2).join('\n')).toMatch(/[A-Z]{3,4}/)
    expect(rows[G.h - 2]).toContain('>')
  })

  // THE SKY IS A COURT, NOT A STRIP. `rain` used to declare `aspect: 9/7` and
  // then draw edge to edge inside it, so a desktop stretched it to roughly
  // 1190 x 200 — a full-width dashed frame beside `pop`, which is the same
  // mechanic drawn as shapes in a proper field. It now pillarboxes into a
  // centred, field-shaped SCREEN exactly as the shape games do.
  it('pillarboxes into a centred field-shaped screen on a wide grid', () => {
    const { inst } = start()
    const rows = frameOf(inst, rain.size, 90).split('\n')
    const top = rows[0]!
    const l = top.indexOf('┌')
    const r = top.lastIndexOf('┐')
    expect(l).toBeGreaterThan(0)
    expect(top.length - 1 - r).toBeGreaterThan(0)
    // Centred, to within the odd column a rounding leaves over.
    expect(Math.abs(l - (top.length - 1 - r))).toBeLessThanOrEqual(1)
    // Field-shaped: a cell is 0.6 as wide as it is tall, so the court reads
    // as `0.6 * w : h` on screen and must never pass 4:3.
    const w = r - l + 1
    expect((0.6 * w) / rows.length).toBeLessThanOrEqual(4 / 3 + 0.01)
    // And it stands on the ground rail, like every other one.
    expect(rows.at(-1)).toContain('═')
  })

  it('paints no digit anywhere on the canvas, however long it is played', () => {
    const { inst } = start(7)
    for (let round = 0; round < 40; round++) {
      ticks(inst, 30)
      for (const w of falling(inst)) type(inst, w.word.toLowerCase())
      for (const cmd of cmdsOf(inst)) {
        const payload = cmd.op === 'text' ? cmd.text : cmd.op === 'put' ? cmd.ch : ''
        expect(/\d/.test(payload), `painted "${payload}"`).toBe(false)
      }
    }
  })
})

describe('rain — the ground, one ink, and the child\'s own', () => {
  it('paints the weather in one ink and the child\'s letters in the other', () => {
    const { inst } = start(3)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    press(inst, target[0]!)
    ticks(inst, 30)
    const tones = new Set<string>()
    for (const cmd of cmdsOf(inst)) {
      if (cmd.op === 'clear') continue
      // An emoji is full colour that no theme can re-tint: on a one-ink sky
      // it would be the only colour on screen. There are none left.
      expect(cmd.op, 'an emoji on a one-ink canvas').not.toBe('emoji')
      if ('tone' in cmd) tones.add(cmd.tone)
    }
    expect(tones.size, `painted ${[...tones].join(', ')}`).toBeLessThanOrEqual(2)
    expect(tones.has('plain'), 'the ground\'s own ink is not one of them').toBe(true)

    // And the second tone is only ever on what the CHILD put there: the
    // letters typed so far, on the word and on the typing line.
    for (const cmd of cmdsOf(inst)) {
      if (cmd.op !== 'text' || cmd.tone === 'plain') continue
      const mine = cmd.text.startsWith('>') || capitals(target).startsWith(cmd.text)
      expect(mine, `"${cmd.text}" is not something the child typed`).toBe(true)
    }
  })

  it('gives a fresh sky a whole empty beat before the first word', () => {
    // A game with no ending gets a rhythm instead of a pause, and the rhythm
    // starts with nothing happening: a child needs a moment to look at the
    // thing before it starts raining.
    const { inst } = start(3)
    expect(falling(inst), 'it rained immediately').toHaveLength(0)
    ticks(inst, 30)
    expect(falling(inst), 'half a second in, and already raining').toHaveLength(0)
  })

  it('lets a landed word settle into lower case rather than dimming it', () => {
    // The one thing a second colour was doing for the weather: saying which
    // words can still be typed. Case says it instead, and case is legible in
    // any theme and in one ink.
    const { inst } = start(4)
    const target = untilAWord(inst)[0]!.word
    let landed = ''
    for (let i = 0; i < 200 && !landed; i++) {
      ticks(inst, 6)
      const row = rowsOf(inst).find((r) => r.includes(target.toLowerCase()))
      if (row) landed = row
    }
    expect(landed, `${target} never landed`).not.toBe('')
    expect(falling(inst).some((w) => w.word === target),
      'a landed word is still shouting').toBe(false)
  })
})

describe('rain — typing a word', () => {
  it('zaps the word that was typed, and only that one', () => {
    const { inst, said } = start(3)
    const before = untilAWord(inst)
    const target = before[0]!
    type(inst, target.word.toLowerCase())
    const after = falling(inst)

    expect(after.some((w) => w.word === target.word),
      `${target.word} was typed but is still falling`).toBe(false)
    for (const w of before.slice(1)) {
      expect(after.some((x) => x.word === w.word),
        `${w.word} vanished even though ${target.word} was typed`).toBe(true)
    }
    // The zap leaves a mark for a third of a second. Latin, not an emoji: an
    // emoji is full colour that no theme can re-tint, and this sky has one ink.
    expect(frameOf(inst, rain.size)).toContain(ZAP_MARK)
    expect(buffer(inst), 'the buffer kept the word after zapping it').toBe('')
    expect(said, 'zapping said something instead of just zapping').toEqual([])
  })

  it('shows the letters typed so far, on the word and on the typing line', () => {
    const { inst } = start(5)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    press(inst, target[0]!)
    expect(buffer(inst)).toBe(capitals(target[0]!))
    press(inst, target[1]!)
    expect(buffer(inst)).toBe(capitals(target.slice(0, 2)))
    // The word is still up there — a partial word zaps nothing.
    expect(falling(inst).some((w) => w.word === capitals(target))).toBe(true)
  })

  it('accepts the word in either case, because a child may be holding shift', () => {
    const { inst } = start(5)
    const target = untilAWord(inst)[0]!.word
    type(inst, target)                     // capitals, as if shift were held
    expect(falling(inst).some((w) => w.word === target)).toBe(false)
  })
})

describe('rain — a letter that fits nothing is never a rebuke', () => {
  it('a letter that starts no falling word changes nothing and says nothing', () => {
    const { inst, said } = start(11)
    const up = falling(inst).length > 0 ? falling(inst) : untilAWord(inst)
    const firsts = new Set(up.map((w) => w.word[0]!.toLowerCase()))
    const dud = [...'abcdefghijklmnopqrstuvwxyz'].find((l) => !firsts.has(l))!

    const before = frameOf(inst, rain.size)
    const souvenirBefore = inst.souvenir?.()
    press(inst, dud)
    expect(frameOf(inst, rain.size), 'a letter that fits nothing changed the picture')
      .toBe(before)
    expect(buffer(inst)).toBe('')
    expect(inst.souvenir?.()).toBe(souvenirBefore)
    expect(said, 'a letter that fits nothing said something').toEqual([])
  })

  it('re-anchors a partial word instead of punishing it', () => {
    // The child is halfway through a word and fumbles a key. The buffer keeps
    // the longest tail of itself that still begins a word on screen — so the
    // fumble costs nothing and there is nothing to clear before trying again.
    const { inst, said } = start(11)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    press(inst, target[0]!)
    expect(buffer(inst)).toBe(capitals(target[0]!))

    // A letter that cannot follow it. Silence, and the buffer lets go.
    const stray = [...'abcdefghijklmnopqrstuvwxyz']
      .find((l) => !falling(inst).some((w) => w.word.toLowerCase().startsWith(target[0]! + l)))!
    press(inst, stray)
    expect(said, 'a fumble said something').toEqual([])

    // The word is still there, and typing it from the top still works.
    type(inst, target)
    expect(falling(inst).some((w) => w.word === capitals(target))).toBe(false)
    expect(inst.souvenir?.()).toContain(capitals(target))
  })

  it('lets a stray letter be absorbed mid-word, so q-c-a-t still zaps CAT', () => {
    const { inst } = start(11)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    // A key mashed before the word begins is simply absorbed: the buffer
    // re-anchors onto the real word as its letters arrive.
    const noise = [...'abcdefghijklmnopqrstuvwxyz']
      .find((l) => !falling(inst).some((w) => w.word.toLowerCase().startsWith(l)))!
    press(inst, noise)
    type(inst, target)
    expect(falling(inst).some((w) => w.word === capitals(target))).toBe(false)
  })

  it('ignores every non-letter key in the same silence', () => {
    const { inst, said } = start(13)
    untilAWord(inst)
    const before = frameOf(inst, rain.size)
    for (const k of ['ArrowLeft', 'ArrowUp', 'Tab', '1', '9', ';', 'Shift', 'Control']) {
      press(inst, k)
    }
    expect(frameOf(inst, rain.size)).toBe(before)
    expect(said).toEqual([])
  })

  it('backspace takes a letter back, space puts the whole attempt down', () => {
    const { inst } = start(5)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    press(inst, target[0]!)
    press(inst, target[1]!)
    press(inst, 'Backspace')
    expect(buffer(inst)).toBe(capitals(target[0]!))
    press(inst, ' ')
    expect(buffer(inst)).toBe('')
  })

  it('never lets two identical words fall at once, so typing is unambiguous', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { inst } = start(seed)
      for (let i = 0; i < 60; i++) {
        ticks(inst, 12)
        const words = falling(inst).map((w) => w.word)
        expect(new Set(words).size, `duplicate word in ${words.join(' ')}`)
          .toBe(words.length)
      }
    }
  })
})

describe('rain — motion and the grid', () => {
  it('falls continuously rather than snapping cell to cell', () => {
    const { inst } = start(2)
    untilAWord(inst)
    const a = rawHeights(inst)
    ticks(inst, 1)
    const b = rawHeights(inst)
    ticks(inst, 1)
    const c = rawHeights(inst)
    expect(a.length).toBeGreaterThan(0)
    expect(b).not.toEqual(a)
    expect(c).not.toEqual(b)
    expect(b[0]!).toBeGreaterThan(a[0]!)
    expect(b[0]! - a[0]!).toBeLessThan(1)
  })

  it('a word that lands just fades, and nothing marks it', () => {
    const { inst, said } = start(4)
    untilAWord(inst)
    for (let i = 0; i < 60; i++) {
      ticks(inst, 30)
      assertInside(inst)
    }
    expect(said, 'a word landing said something').toEqual([])
    expect(inst.souvenir?.()).toBe('the words are still falling — type one to zap it!')
  })

  it('a word that has landed can no longer be typed, and the buffer lets go', () => {
    const { inst } = start(4)
    const target = untilAWord(inst)[0]!.word.toLowerCase()
    press(inst, target[0]!)
    expect(buffer(inst)).toBe(capitals(target[0]!))
    ticks(inst, 60 * 30)                  // long enough for everything to land
    expect(buffer(inst)).toBe('')
  })

  it('lays out against the live grid, at any width', () => {
    for (const cols of [G.w, 40, 55, 72, 96]) {
      const { inst } = start(6)
      for (let i = 0; i < 30; i++) {
        ticks(inst, 15)
        assertInside(inst, cols)
      }
      const rows = rowsOf(inst, cols)
      expect(rows).toHaveLength(G.h)
      expect(rows[0]).toHaveLength(cols)
    }
  })

  it('survives a resize mid-play with nothing outside the grid', () => {
    const { inst } = start(8)
    untilAWord(inst)
    for (const cols of [G.w, 88, 34, 61, G.w, 120, 30]) {
      assertInside(inst, cols)
      ticks(inst, 40)
      assertInside(inst, cols)
      for (const row of rowsOf(inst, cols)) {
        expect(row).toHaveLength(Math.max(G.w, cols))
      }
    }
  })

  it('is still typeable after a resize', () => {
    const { inst } = start(9)
    untilAWord(inst)
    frameOf(inst, rain.size, 90)          // the resize happens on a draw
    ticks(inst, 30)
    const seen = falling(inst, 90)
    expect(seen.length).toBeGreaterThan(0)
    type(inst, seen[0]!.word.toLowerCase())
    expect(falling(inst, 90).some((w) => w.word === seen[0]!.word)).toBe(false)
  })
})

describe('rain — the souvenir', () => {
  it('reads warmly at zero progress and carries no digit', () => {
    const { inst } = start()
    const s = inst.souvenir?.() ?? ''
    expect(s).toBe('the words are still falling — type one to zap it!')
    expect(/\d/.test(s)).toBe(false)
    expect(s.trim().length).toBeGreaterThan(0)
  })

  it('names the words that were zapped, never how many', () => {
    const { inst } = start(21)
    const done: string[] = []
    for (let i = 0; i < 20 && done.length < 2; i++) {
      ticks(inst, 40)
      for (const w of falling(inst)) {
        type(inst, w.word.toLowerCase())
        if (!done.includes(w.word)) done.push(w.word)
      }
    }
    expect(done.length).toBeGreaterThanOrEqual(2)
    const s = inst.souvenir?.() ?? ''
    expect(s).toMatch(/^you zapped .+!$/)
    expect(s).toContain(done[0]!)
    expect(s).toContain(' and ')
    expect(/\d/.test(s), `souvenir counted: "${s}"`).toBe(false)
  })

  it('caps a long list with a bare "more" and exactly one conjunction', () => {
    expect(joinNamed(['CAT'])).toBe('CAT')
    expect(joinNamed(['CAT', 'SUN'])).toBe('CAT and SUN')
    expect(joinNamed(['CAT', 'SUN', 'BUS'])).toBe('CAT, SUN, and BUS')
    expect(joinNamed(['CAT', 'SUN', 'BUS', 'more'])).toBe('CAT, SUN, BUS, and more')

    const { inst } = start(33)
    for (let i = 0; i < 60; i++) {
      ticks(inst, 40)
      for (const w of falling(inst)) type(inst, w.word.toLowerCase())
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
    for (const s of Object.values(rain.strings?.en ?? {})) {
      expect(BAD.test(s), `rain string says "${s}"`).toBe(false)
    }
    for (const h of rain.hints((k) => rain.strings?.en?.[k] ?? k)) {
      expect(BAD.test(h.label)).toBe(false)
    }
    const { inst, said } = start(17)
    for (let i = 0; i < 30; i++) {
      ticks(inst, 20)
      type(inst, 'zqx')
      expect(BAD.test(inst.souvenir?.() ?? '')).toBe(false)
    }
    expect(said, 'the game narrated something at the child').toEqual([])
  })
})

describe('rain — determinism', () => {
  it('the same seed plays the same game, and different seeds differ', () => {
    const play = (seed: number): string => {
      const { inst } = start(seed)
      ticks(inst, 300)
      return frameOf(inst, rain.size)
    }
    expect(play(1)).toBe(play(1))
    expect(new Set([1, 2, 3, 4, 5].map(play)).size).toBeGreaterThan(1)
  })

  it('capitalises by table, so no locale-sensitive casing is involved', () => {
    expect(capitals('cat')).toBe('CAT')
    expect(capitals('')).toBe('')
  })
})
