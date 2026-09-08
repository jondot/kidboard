import { describe, it, expect } from 'vitest'
import piano, { currentTune } from './cartridge'
import { testCtx, frameOf, press, ticks } from '../../testing/cartridgeHarness'
import { gridFor } from '../../runtime/GridCanvas'
import { Canvas } from '../../runtime/Canvas'

// `piano.strings` must be wired into the ctx exactly as `session.ts` wires a
// cartridge's own strings in production — otherwise `ctx.t` can only see the
// shell catalog and `piano.souvenir` would render as the raw key.
const start = (locale: 'en' | 'he' = 'en') => {
  const h = testCtx({ locale, strings: piano.strings })
  const notes: number[] = []
  // The LENGTH matters now as well as the pitch, so both are kept.
  const lengths: number[] = []
  h.ctx.audio.note = (hz: number, ms: number) => { notes.push(hz); lengths.push(ms) }
  return { ...h, notes, lengths, inst: piano.create(h.ctx) }
}

/** Every cell the instrument lights, i.e. everything that is sounding. */
const litCells = (inst: { draw: (c: Canvas) => void }): number => {
  const g = gridFor(piano.size)
  const c = new Canvas(g.w, g.h)
  inst.draw(c)
  let n = 0
  for (const cmd of c.cmds()) {
    if (cmd.op === 'text' && cmd.tone === 'win') n += cmd.text.length
    if (cmd.op === 'put' && cmd.tone === 'win') n += 1
  }
  return n
}

/** The five letters the black keys wear. None of them is a white key's. */
const CAPS = /[WETYU]/

/** The case's own width in columns, read off its top rail. */
const caseWidth = (frame: string): number => {
  const top = frame.split('\n')[0]!
  return top.lastIndexOf('┐') - top.indexOf('┌') + 1
}

describe('piano', () => {
  // `piano` used to have no `tick` at all, and its own comment said so on
  // purpose. Polyphony made that obsolete: a note that rings for a while
  // needs something to put it out. The clock is still not a transport — it
  // counts sounding notes down and does nothing else, so time alone can
  // never play a note, deal anything, or re-arm a round.
  it('has a tick that only counts notes down, and never makes anything happen', () => {
    const { inst, notes } = start()
    const before = frameOf(inst, piano.size)
    ticks(inst, 600)
    expect(notes).toHaveLength(0)
    expect(currentTune()!.notes).toHaveLength(0)
    expect(frameOf(inst, piano.size)).toBe(before)
  })

  it('draws a keyboard with the seven white keys', () => {
    const { inst } = start()
    const f = frameOf(inst, piano.size)
    for (const k of ['A', 'S', 'D', 'F', 'G', 'H', 'J']) expect(f).toContain(k)
  })

  it('plays an ascending note for each white key left to right', () => {
    const { inst, notes } = start()
    for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'j']) press(inst, k)
    expect(notes).toHaveLength(7)
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!).toBeGreaterThan(notes[i - 1]!)
    }
  })

  // THE BLACK KEYS ARE WHERE THEY PHYSICALLY ARE. They used to be `1`-`5`,
  // which is a row of buttons rather than a piano; they are now the row above
  // the home row, so a computer keyboard IS the keyboard on screen.
  it('plays sharps from the row above the white keys', () => {
    const { inst, notes } = start()
    for (const k of ['w', 'e', 't', 'y', 'u']) press(inst, k)
    expect(notes).toHaveLength(5)
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!).toBeGreaterThan(notes[i - 1]!)
    }
  })

  // A real piano has no black key between E and F. `R` sits exactly there, so
  // it plays nothing — the gap is what makes the row read as a keyboard.
  it('leaves R dead, because there is no black key between E and F', () => {
    const { inst, notes } = start()
    press(inst, 'r')
    expect(notes).toHaveLength(0)
    expect(inst.souvenir!()).toBe('')
  })

  // The old bindings are GONE, not merely superseded: a child who presses `3`
  // must not get an F# out of muscle memory nobody has.
  it('no longer plays a sharp from the number row', () => {
    const { inst, notes } = start()
    for (const k of ['1', '2', '3', '4', '5']) press(inst, k)
    expect(notes).toHaveLength(0)
    expect(inst.souvenir!()).toBe('')
    expect(currentTune()!.notes).toHaveLength(0)
  })

  // ---- how long a note rings --------------------------------------------

  it('sets how long every note rings from the number row, shortest to longest', () => {
    const { inst, lengths } = start()
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      press(inst, n)
      press(inst, 'a')
    }
    expect(lengths).toHaveLength(9)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThan(lengths[i - 1]!)
    }
  })

  // A child who never finds the control still gets a piano, so it starts in
  // the middle: either extreme is a worse instrument than the middle is.
  it('starts in the middle of the range, not at either end', () => {
    const { inst, lengths } = start()
    press(inst, 'a')
    press(inst, '1'); press(inst, 'a')
    press(inst, '9'); press(inst, 'a')
    const [byDefault, shortest, longest] = lengths as [number, number, number]
    expect(byDefault).toBeGreaterThan(shortest)
    expect(byDefault).toBeLessThan(longest)
  })

  // The overlap is the whole point of the setting: at `9` two keys struck a
  // second apart are both still ringing, which is what makes polyphony
  // audible rather than merely true. At `1` they do not smear together.
  it('is short enough to run and long enough to make a chord', () => {
    const fast = start()
    press(fast.inst, '1')
    press(fast.inst, 'a')
    ticks(fast.inst, 60)
    press(fast.inst, 'd')
    expect(fast.inst.souvenir!()).toContain('D')
    const lone = litCells(fast.inst)

    const slow = start()
    press(slow.inst, '9')
    press(slow.inst, 'a')
    ticks(slow.inst, 60)
    press(slow.inst, 'd')
    expect(litCells(slow.inst)).toBeGreaterThan(lone)
  })

  it('leaves a note that is already ringing at the length it was struck', () => {
    const { inst, lengths } = start()
    press(inst, '9')
    press(inst, 'a')
    press(inst, '1')
    // The setting changed; the note already sounding kept its own length.
    expect(lengths).toEqual([2000])
    ticks(inst, 60)
    expect(litCells(inst)).toBeGreaterThan(0)
  })

  it('draws the setting as a control, and never as a number', () => {
    const { inst } = start()
    // Rows from the bottom: the ground rail, the badge's three rows, the dial.
    const bar = () => frameOf(inst, piano.size).split('\n').at(-5)!
    const solid = (row: string) => (row.match(/▄/g) ?? []).length

    const middle = solid(bar())
    press(inst, '1')
    expect(solid(bar())).toBeLessThan(middle)
    press(inst, '9')
    expect(solid(bar())).toBeGreaterThan(middle)
    // …and the whole frame still carries no digit anywhere.
    expect(frameOf(inst, piano.size)).not.toMatch(/\d/)
  })

  it('ignores 0, which is not a setting', () => {
    const { inst, lengths } = start()
    press(inst, 'a')
    press(inst, '0')
    press(inst, 'a')
    expect(lengths[1]).toBe(lengths[0])
  })

  it('highlights the key that was just pressed', () => {
    const { inst } = start()
    const before = frameOf(inst, piano.size)
    press(inst, 'd')
    expect(frameOf(inst, piano.size)).not.toBe(before)
  })

  it('ignores keys that are not notes without erroring', () => {
    const { inst, notes } = start()
    expect(() => press(inst, 'z')).not.toThrow()
    expect(() => press(inst, 'ArrowUp')).not.toThrow()
    expect(notes).toHaveLength(0)
  })

  it('renders an identical keyboard under he, since art is language-neutral', () => {
    expect(frameOf(start('he').inst, piano.size))
      .toBe(frameOf(start('en').inst, piano.size))
  })

  /**
   * RECORD AND PLAY BACK. `P` puts the head down, `P` lifts it, SPACE plays
   * what was caught. It is the same pair of buttons `drum` has, so a child who
   * found one instrument's has found the other's.
   */
  describe('the recording head', () => {
    /** `ticks` counts FRAMES; a recording is measured in seconds. */
    const seconds = (inst: Parameters<typeof ticks>[0], s: number) =>
      ticks(inst, Math.round(s * 60))

    it('catches what is played while it is down, and nothing before it', () => {
      const { inst, notes } = start()
      press(inst, 'a')                     // before the head goes down
      press(inst, 'p')
      press(inst, 's')
      seconds(inst, 0.25)
      press(inst, 'd')
      press(inst, 'p')                     // head up
      notes.length = 0

      press(inst, ' ')                     // play it back
      seconds(inst, 2)
      expect(notes.map((hz) => Math.round(hz))).toEqual([294, 330])
    })

    it('plays the gaps a child left, not a metronome\'s', () => {
      const { inst, notes } = start()
      press(inst, 'p')
      press(inst, 'a')
      seconds(inst, 1.5)                   // a long pause, on purpose
      press(inst, 's')
      press(inst, 'p')
      notes.length = 0

      press(inst, ' ')
      seconds(inst, 0.5)
      expect(notes, 'the second note arrived early').toHaveLength(1)
      seconds(inst, 1.2)
      expect(notes).toHaveLength(2)
    })

    /**
     * IT SAYS WHAT IT IS DOING WITH A SYMBOL, under the keyboard: a fat dot
     * while it records, a fat triangle while it plays. This used to be a tint
     * on the case, which is a thing you notice once somebody points it out —
     * the opposite of what a record light is for. Two rows tall, in shapes,
     * because one character is the size of the letter on a key.
     */
    describe('the badge under the keyboard', () => {
      /** Every SHAPE the instrument draws in the second tone. */
      const badge = (inst: { draw: (c: Canvas) => void }) => {
        const g = gridFor(piano.size)
        const c = new Canvas(g.w, g.h)
        inst.draw(c)
        return c.cmds().filter((cmd) =>
          'tone' in cmd && cmd.tone === 'win'
          && (cmd.op === 'disc' || cmd.op === 'rect'))
      }

      it('shows nothing at all while the machine is just a piano', () => {
        const { inst } = start()
        expect(badge(inst)).toEqual([])
        press(inst, 'a')
        // A sounding key is a lit KEY, never the badge.
        expect(badge(inst)).toEqual([])
      })

      it('is a round dot while the head is down, and the only round thing', () => {
        const { inst } = start()
        press(inst, 'p')
        const marks = badge(inst)
        expect(marks.filter((m) => m.op === 'disc')).toHaveLength(1)
        press(inst, 'p')
        expect(badge(inst)).toEqual([])
      })

      it('is a triangle while it plays back, and goes out at the end', () => {
        const { inst } = start()
        press(inst, 'p'); press(inst, 'a'); press(inst, 'p')
        press(inst, ' ')
        const marks = badge(inst)
        expect(marks.some((m) => m.op === 'disc')).toBe(false)
        // Columns of falling height: a triangle, because the canvas has no
        // polygon op.
        const cols = marks.filter((m) => m.op === 'rect')
        expect(cols.length).toBeGreaterThan(4)
        expect(new Set(cols.map((r) => 'h' in r ? r.h : 0)).size).toBeGreaterThan(2)

        seconds(inst, 5)
        expect(badge(inst)).toEqual([])
      })

      it('draws it under the keyboard, never over it', () => {
        const { inst } = start()
        press(inst, 'p')
        const g = gridFor(piano.size)
        const c = new Canvas(g.w, g.h)
        inst.draw(c)
        const dot = c.cmds().find((cmd) => cmd.op === 'disc')!
        const letters = c.cmds().filter((cmd) => cmd.op === 'text' && /^[A-J]$/.test(cmd.text))
        expect(letters.length).toBeGreaterThan(0)
        // Pixels below the letters' own row, in cells.
        const lowest = Math.max(...letters.map((t) => 'y' in t ? t.y : 0))
        expect('y' in dot ? dot.y / 8 : 0).toBeGreaterThan(lowest)
      })

      it('carries no number, recording or not', () => {
        const { inst } = start()
        expect(frameOf(inst, piano.size)).not.toMatch(/[0-9]/)
        press(inst, 'p')
        expect(frameOf(inst, piano.size)).not.toMatch(/[0-9]/)
      })
    })

    it('starts a new recording empty, rather than adding to the last', () => {
      const { inst, notes } = start()
      press(inst, 'p'); press(inst, 'a'); press(inst, 'p')
      press(inst, 'p'); press(inst, 'j'); press(inst, 'p')
      notes.length = 0
      press(inst, ' ')
      seconds(inst, 1)
      expect(notes.map((hz) => Math.round(hz))).toEqual([494])
    })

    it('plays through once and stops, and only SPACE starts it again', () => {
      const { inst, notes } = start()
      press(inst, 'p'); press(inst, 'a'); press(inst, 'p')
      notes.length = 0
      press(inst, ' ')
      seconds(inst, 5)
      expect(notes).toHaveLength(1)
      seconds(inst, 5)
      expect(notes, 'it re-armed itself').toHaveLength(1)
      press(inst, ' ')
      seconds(inst, 1)
      expect(notes).toHaveLength(2)
    })

    it('does nothing on SPACE when nothing was recorded', () => {
      const { inst, notes } = start()
      press(inst, 'a')
      notes.length = 0
      press(inst, ' ')
      seconds(inst, 2)
      expect(notes).toEqual([])
    })

    /** The exporter saves the phrase when there is one, free play otherwise. */
    it('hands the recorded phrase to whoever saves a cart, with its timing', () => {
      const { inst } = start()
      press(inst, 'a')
      expect(currentTune()?.notes.map((n) => n.at)).toEqual([undefined])
      press(inst, 'p')
      press(inst, 's')
      seconds(inst, 0.5)
      press(inst, 'd')
      press(inst, 'p')
      const tune = currentTune()!
      expect(tune.notes.map((n) => n.label)).toEqual(['S', 'D'])
      expect(tune.notes[0]!.at).toBe(0)
      expect(tune.notes[1]!.at).toBeCloseTo(0.5, 1)
    })
  })

  it('declares columns and an aspect rather than a fixed box', () => {
    expect(piano.size.cols).toBeGreaterThan(0)
    expect(piano.size.aspect).toBeGreaterThan(0)
  })

  it('spreads the keyboard across a wider grid instead of leaving it stranded', () => {
    const { inst } = start()
    const narrow = frameOf(inst, piano.size)
    const wide = frameOf(inst, piano.size, 58)
    expect(wide.split('\n')[0]!).toHaveLength(58)
    // Every white key is still there, and the keyboard is genuinely wider.
    for (const k of ['A', 'S', 'D', 'F', 'G', 'H', 'J']) expect(wide).toContain(k)
    expect(caseWidth(wide)).toBeGreaterThan(caseWidth(narrow))
  })

  // THE CASE IS A COURT, NOT A STRIP. `piano` used to declare `aspect: 9/4`
  // and draw edge to edge, which on a desktop came out roughly 1150 x 140 —
  // an 8:1 slot with 700px of nothing under it, next to `drum`'s neat centred
  // court of four pads. It now pillarboxes into a centred, field-shaped
  // SCREEN, exactly as every shape game does.
  it('pillarboxes into a centred field-shaped case on a wide grid', () => {
    const { inst } = start()
    const rows = frameOf(inst, piano.size, 90).split('\n')
    const top = rows[0]!
    const l = top.indexOf('┌')
    const r = top.lastIndexOf('┐')
    expect(l).toBeGreaterThan(0)
    expect(top.length - 1 - r).toBeGreaterThan(0)
    // Centred, to within the odd column a rounding leaves over.
    expect(Math.abs(l - (top.length - 1 - r))).toBeLessThanOrEqual(1)
    // Field-shaped: a cell is 0.6 as wide as it is tall, so the case reads as
    // `0.6 * w : h` on screen and must never pass 4:3.
    expect((0.6 * caseWidth(rows.join('\n'))) / rows.length)
      .toBeLessThanOrEqual(4 / 3 + 0.01)
    // …and it stands on the same double ground rail every character-idiom
    // picture stands on.
    expect(rows.at(-1)).toContain('═')
  })

  // A KEYBOARD, NOT A GRID. The black keys are solid bars standing at the top
  // of the seams they belong to, and the seam continues below each one as the
  // divider between two white keys — which is what a real keyboard looks
  // like, and what tells a child which key the digit above it plays.
  it('stands the black keys at the top of the seams, over their own dividers', () => {
    const { inst } = start()
    const rows = frameOf(inst, piano.size, 58).split('\n')
    const capRow = rows.findIndex((r) => CAPS.test(r))
    expect(capRow).toBeGreaterThan(0)
    for (let x = 0; x < rows[capRow]!.length; x++) {
      if (!CAPS.test(rows[capRow]![x]!)) continue
      // Solid black under the letter…
      expect(rows[capRow + 1]![x], `no black key under the sharp at ${x}`).toBe('█')
      // …and, further down, the white keys' divider on the same column.
      const below = rows.slice(capRow + 1).map((r) => r[x])
      expect(below).toContain('│')
      expect(below.lastIndexOf('█')).toBeLessThan(below.indexOf('│'))
    }
  })

  // Rewritten: the old assertion (`toMatch(/2/)`) required a bare count in
  // the souvenir — that IS the scoring bug this cartridge shipped with. A
  // souvenir now names the notes actually played, never how many.
  it('names the notes played as its souvenir, never a count', () => {
    const { inst } = start()
    press(inst, 'a'); press(inst, 's')
    const s = inst.souvenir!()
    expect(s).toContain('A')
    expect(s).toContain('S')
    expect(s).not.toMatch(/\d/)
  })

  it('names sharps by note, never by the key that was typed', () => {
    const { inst } = start()
    press(inst, 'w')
    const s = inst.souvenir!()
    expect(s).toContain('C#')
    expect(s).not.toMatch(/\d/)
  })

  // A child who mounts `piano` and leaves without pressing a key gets a
  // friendly line or nothing at all — never a bare "0" and never a dangling
  // "you played ".
  it('gives no souvenir at all when no key was ever pressed', () => {
    const { inst } = start()
    expect(inst.souvenir!()).toBe('')
  })

  it('caps a long improvisation instead of spelling out every note', () => {
    const { inst } = start()
    for (let i = 0; i < 40; i++) press(inst, ['a', 's', 'd', 'f'][i % 4]!)
    const s = inst.souvenir!()
    expect(s.split(' ').length).toBeLessThan(40)
    expect(s).not.toMatch(/\d/)
  })

  it('no bare number is ever painted on the keyboard', () => {
    const { inst } = start()
    press(inst, 'a'); press(inst, 's'); press(inst, 'd')
    const g = gridFor(piano.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    for (const cmd of c.cmds()) {
      if (cmd.op === 'text' || cmd.op === 'put') {
        const s = cmd.op === 'text' ? cmd.text : cmd.ch
        expect(/^\d+$/.test(s)).toBe(false)
      }
    }
  })

  // MONOCHROME. The keyboard is one ink; the only second tone on the canvas
  // is the key the child just pressed. The project-wide floor for this lives
  // in src/invariants.test.ts — this one pins the *meaning* of the second
  // tone, which no generic check can see.
  it('draws the whole instrument in one ink, and lights only what was pressed', () => {
    const { inst } = start()
    const g = gridFor(piano.size)

    const tonesNow = () => {
      const c = new Canvas(g.w, g.h)
      inst.draw(c)
      return new Set(c.cmds().flatMap((cmd) => ('tone' in cmd ? [cmd.tone] : [])))
    }

    expect([...tonesNow()]).toEqual(['plain'])
    press(inst, 'd')
    expect([...tonesNow()].sort()).toEqual(['plain', 'win'])
  })

  it('a black key lights too, so every press shows on the keyboard', () => {
    const { inst } = start()
    expect(litCells(inst)).toBe(0)
    press(inst, 'w')
    expect(litCells(inst)).toBeGreaterThan(0)
  })

  // ---- polyphony ---------------------------------------------------------
  //
  // `ctx.audio.note` has always built a fresh oscillator per call, so the
  // SOUND was polyphonic for free. What was monophonic was the model and the
  // picture: a single lit index meant a second key stole the first one's
  // highlight, and a child pressing three keys saw one note while hearing
  // three.

  it('lights every key that is sounding, not just the last one pressed', () => {
    const { inst } = start()
    press(inst, 'a')
    const one = litCells(inst)
    press(inst, 'd')
    const two = litCells(inst)
    press(inst, 'w')
    expect(two).toBeGreaterThan(one)
    expect(litCells(inst)).toBeGreaterThan(two)
  })

  it('never cancels a ringing note when a new key is pressed', () => {
    const { inst } = start()
    // The shortest setting, so the arithmetic below is about the model
    // rather than about which length happens to be the default.
    press(inst, '1')
    press(inst, 'd')
    // Half of D's ring gone, then a second key: D must still be lit.
    ticks(inst, 4, 0.016)
    const alone = litCells(inst)
    expect(alone).toBeGreaterThan(0)
    press(inst, 'g')
    const both = litCells(inst)
    expect(both).toBeGreaterThan(alone)
    // …and each goes out on its OWN schedule. Past D's ring but not past G's,
    // the keyboard shows exactly one key still sounding.
    ticks(inst, 5, 0.016)
    expect(litCells(inst)).toBeGreaterThan(0)
    expect(litCells(inst)).toBeLessThan(both)
  })

  it('darkens a key once its note has stopped ringing', () => {
    const { inst } = start()
    press(inst, 'a')
    expect(litCells(inst)).toBeGreaterThan(0)
    ticks(inst, 600)
    expect(litCells(inst)).toBe(0)
  })

  // A finger resting on a key is auto-repeat, not forty presses. Sixty
  // oscillators on one finger is a mess to listen to, and forty A's in a
  // souvenir is a lie about what the child did.
  it('treats a held key as one note, not as one note per repeat', () => {
    const { inst, notes } = start()
    inst.onKey!({ key: 'a', shift: false, repeat: false })
    for (let i = 0; i < 40; i++) {
      inst.onKey!({ key: 'a', shift: false, repeat: true })
    }
    expect(notes).toHaveLength(1)
    expect(currentTune()!.notes).toHaveLength(1)
  })

  // ---- what a child takes home ------------------------------------------

  // `draw` keeps its picture as plain JSON so "save my drawing" is one read;
  // a melody is the same kind of thing, and this is the same hook.
  describe('the tune it keeps', () => {
    it('is empty until a key is pressed, so an untouched piano saves nothing', () => {
      start()
      expect(currentTune()?.notes).toEqual([])
    })

    it('keeps every note played, in order, as plain JSON', () => {
      const { inst } = start()
      for (const k of ['a', 'd', 'g']) press(inst, k)
      const tune = currentTune()!
      expect(tune.notes.map((n) => n.label)).toEqual(['A', 'D', 'G'])
      for (let i = 1; i < tune.notes.length; i++) {
        expect(tune.notes[i]!.hz).toBeGreaterThan(tune.notes[i - 1]!.hz)
      }
      // No functions, no closures, no class instances: it survives a round
      // trip through JSON exactly as it stands.
      expect(JSON.parse(JSON.stringify(tune))).toEqual(tune)
    })

    it('names a sharp by its note rather than by the key that played it', () => {
      const { inst } = start()
      press(inst, 'w')
      expect(currentTune()!.notes[0]!.label).toBe('C#')
    })

    it('ignores a key that is not a piano key', () => {
      const { inst } = start()
      press(inst, 'q')
      expect(currentTune()!.notes).toHaveLength(0)
    })

    it('starts a fresh tune each time the piano is opened', () => {
      const first = start()
      press(first.inst, 'a')
      expect(currentTune()!.notes).toHaveLength(1)
      start()
      expect(currentTune()!.notes).toHaveLength(0)
    })

    // The tune is a LIST OF NOTES, not a recording of time — the clock that
    // arrived with polyphony only puts notes out, and never writes one.
    it('is not a recording of time: the clock alone never adds a note', () => {
      const { inst } = start()
      press(inst, 'a')
      ticks(inst, 600)
      expect(currentTune()!.notes.map((n) => n.label)).toEqual(['A'])
    })

    // A chord lands here as its notes in the order the keys were struck. The
    // shape cannot say "these belong to one moment", and says so honestly.
    it('records a chord as its notes in sequence, the way the shape allows', () => {
      const { inst } = start()
      for (const k of ['a', 'd', 'g']) press(inst, k)
      expect(currentTune()!.notes.map((n) => n.label)).toEqual(['A', 'D', 'G'])
    })
  })

  // The labels used to be a fixed string at a fixed column, so they drifted
  // off the keys they name the moment the terminal got wider than 30.
  it("keeps each black key's own letter on the seam that key stands on", () => {
    const { inst } = start()
    for (const cols of [piano.size.cols, 44, 58]) {
      const rows = frameOf(inst, piano.size, cols).split('\n')
      const capRow = rows.findIndex((r) => CAPS.test(r))
      const caps = rows[capRow]!
      for (let x = 0; x < caps.length; x++) {
        if (!CAPS.test(caps[x]!)) continue
        // The seam is a black key here and a divider further down; either
        // way, the column under a sharp is never white key.
        const below = rows.slice(capRow + 1).map((r) => r[x])
        expect(below.includes('█') && below.includes('│'),
          `sharp at column ${x} of ${cols} is not on a seam`).toBe(true)
      }
      // Left to right, and with the E-F gap where `R` would be, this row IS
      // the top row of the child's own keyboard.
      expect(caps.replace(/[^WETYU]/g, '')).toBe('WETYU')
      expect(caps).toMatch(/W\s+E\s{5,}T\s+Y\s+U/)
    }
  })
})
