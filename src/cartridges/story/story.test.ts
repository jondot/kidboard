import { describe, it, expect } from 'vitest'
import story from './cartridge'
import { testCtx } from '../../testing/cartridgeHarness'

const play = (answers: string[], locale: 'en' | 'he' = 'en') => {
  const h = testCtx({ locale, strings: story.strings })
  const inst = story.create(h.ctx)
  inst.start()
  for (const a of answers) inst.onLine(a)
  return { ...h, inst }
}

const text = (said: { kind: string }[]) =>
  said.map((b) => (b as { text?: string; art?: string }).text ?? '').join('\n')

describe('story', () => {
  it('is a turn cartridge available in both locales', () => {
    expect(story.kind).toBe('turn')
    expect(story.locales).toEqual(['en', 'he'])
  })

  it('asks a question on start', () => {
    const { said } = play([])
    expect(said.length).toBeGreaterThan(0)
  })

  it('asks three questions then tells a story', () => {
    const { said, exited } = play(['cat', 'blue', 'pizza'])
    const all = text(said)
    expect(all).toContain('cat')
    expect(all).toContain('blue')
    expect(all).toContain('pizza')
    // THE PACING RULE: the finished story HOLDS. It used to call ctx.exit()
    // in the same breath as the last line, so the shell collapsed the tale
    // into a one-line row the instant it appeared.
    expect(exited()).toBe(false)
  })

  it('holds on a finished story, then starts another when asked', () => {
    const h = testCtx({ strings: story.strings })
    const inst = story.create(h.ctx)
    inst.start()
    for (const a of ['cat', 'blue', 'pizza']) inst.onLine(a)
    const after = h.said.length
    expect(h.exited()).toBe(false)

    // Any line at all begins a new story, back at the first question.
    inst.onLine('more')
    expect(h.said.length).toBeGreaterThan(after)
    expect(h.exited()).toBe(false)
    for (const a of ['dog', 'green', 'cake']) inst.onLine(a)
    const all = text(h.said)
    expect(all).toContain('dog')
    expect(all).toContain('cake')
    // The souvenir names the story that was last FINISHED, never a fragment
    // of one half told.
    expect(inst.souvenir!()).toContain('dog')
  })

  it('never paints a rainbow: a rainbow is every tone at once', () => {
    const { said } = play(['cat', 'blue', 'pizza'])
    for (const b of said) expect(b.kind === 'text' && b.rainbow).toBeFalsy()
  })

  it('does not exit early', () => {
    expect(play(['cat']).exited()).toBe(false)
    expect(play(['cat', 'blue']).exited()).toBe(false)
  })

  it('accepts absolutely any answer, including nonsense', () => {
    const { said, exited } = play(['zzxqw', '!!!', '123'])
    expect(exited()).toBe(false)
    expect(text(said)).toContain('zzxqw')
  })

  it('never tells the child they are wrong', () => {
    const all = text(play(['x', 'y', 'z']).said).toLowerCase()
    for (const bad of ['wrong', 'invalid', 'error', 'try again', 'no,']) {
      expect(all).not.toContain(bad)
    }
  })

  it('never tells the child they are wrong, in Hebrew either', () => {
    const all = text(play(['x', 'y', 'z'], 'he').said)
    for (const bad of ['שגוי', 'טעות', 'לא נכון', 'נסה שוב']) {
      expect(all).not.toContain(bad)
    }
  })

  it('tells the story in Hebrew under he', () => {
    const all = text(play(['x', 'y', 'z'], 'he').said)
    expect(/[֐-׿]/.test(all)).toBe(true)
  })

  it('returns a souvenir that IS the story\'s own title, not a description of it', () => {
    const { inst } = play(['cat', 'blue', 'pizza'])
    const s = inst.souvenir!()
    expect(s.length).toBeGreaterThan(0)
    expect(s).toContain('cat')
    expect(s).toContain('blue')
    expect(s).toContain('pizza')
    // The same string is what headlines the story on screen, so the
    // collapsed transcript line names the tale by its actual title.
    expect(text(play(['cat', 'blue', 'pizza']).said)).toContain(s)
  })

  it('souvenir is empty, not a dangling sentence, before any answer was given', () => {
    const h = testCtx({ locale: 'en', strings: story.strings })
    const inst = story.create(h.ctx)
    inst.start()
    expect(() => inst.souvenir!()).not.toThrow()
    expect(inst.souvenir!()).toBe('')
  })

  it('souvenir is empty before any answer was given, in Hebrew too', () => {
    const h = testCtx({ locale: 'he', strings: story.strings })
    const inst = story.create(h.ctx)
    inst.start()
    expect(inst.souvenir!()).toBe('')
  })

  // `story.title` needs {animal, color, food} together. Answering only the
  // animal and pressing ESC used to produce a dangling souvenir once
  // (interpolating the missing vars as ''); now the souvenir is withheld
  // entirely until the story is actually complete, so there is no template
  // left half-filled to render.
  it('gives no souvenir at all while the story is only partly answered', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ locale, strings: story.strings })
      const inst = story.create(h.ctx)
      inst.start()
      inst.onLine('cat')
      let s = inst.souvenir!()
      expect(s).toBe('')
      expect(s).not.toContain('{')
      expect(s).not.toContain('undefined')

      inst.onLine('blue')
      s = inst.souvenir!()
      expect(s).toBe('')
    }
  })

  // A child who starts `story` and presses ESC before answering anything
  // must not see a dangling "a story about a " (en) or "סיפור על " (he) —
  // the exact malformed shape this cartridge used to produce when it
  // interpolated an unanswered {animal} with ''.
  it('never renders a dangling souvenir when ESC ends the turn immediately', () => {
    for (const locale of ['en', 'he'] as const) {
      const h = testCtx({ locale, strings: story.strings })
      const inst = story.create(h.ctx)
      inst.start()
      // Nothing answered yet — this is the ESC-before-anything path.
      const souvenir = inst.souvenir!()
      expect(souvenir).toBe('')
    }
  })
})
