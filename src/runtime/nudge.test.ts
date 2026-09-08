import { describe, it, expect } from 'vitest'
import { makeNudger } from './nudge'
import { makeRng } from './rng'

const nudger = (seed = 1, locale: 'en' | 'he' = 'en') =>
  makeNudger({ rng: makeRng(seed), locale })

const feed = (n: ReturnType<typeof nudger>, times: number) => {
  let first = null
  for (let i = 0; i < times; i++) {
    const r = n.onInput(false)
    if (r && !first) first = r
  }
  return first
}

describe('makeNudger', () => {
  it('stays quiet for the first couple of unrecognized inputs', () => {
    const n = nudger()
    expect(n.onInput(false)).toBeNull()
    expect(n.onInput(false)).toBeNull()
  })

  it('offers a challenge after a few unrecognized inputs', () => {
    expect(feed(nudger(), 6)).not.toBeNull()
  })

  it('never offers a challenge while inputs are recognized', () => {
    const n = nudger()
    for (let i = 0; i < 20; i++) expect(n.onInput(true)).toBeNull()
  })

  it('resets the run when an input is recognized', () => {
    const n = nudger()
    n.onInput(false); n.onInput(false); n.onInput(false)
    n.onInput(true)
    // Clear out any challenge that happened to fire during the three
    // unrecognized calls above (the threshold is randomized 3-4, so a
    // low draw can fire on the third call). Without this, a fired-but-
    // unanswered challenge would make the assertions below pass because
    // `pending` blocks further offers — not because the run was reset,
    // which is what this test claims to prove.
    n.tryAnswer('')
    expect(n.onInput(false)).toBeNull()
    expect(n.onInput(false)).toBeNull()
  })

  it('accepts a correct answer and clears the challenge', () => {
    const n = nudger()
    const c = feed(n, 6)!
    expect(n.tryAnswer(c.answers[0]!)).toBe(true)
    expect(n.pending).toBeNull()
  })

  it('is case and whitespace tolerant', () => {
    const n = nudger()
    const c = feed(n, 6)!
    expect(n.tryAnswer(`  ${c.answers[0]!.toUpperCase()} `)).toBe(true)
  })

  it('SILENTLY clears on a wrong answer — never a rebuke, never a retry', () => {
    const n = nudger()
    feed(n, 6)
    expect(n.tryAnswer('banana')).toBe(false)
    expect(n.pending).toBeNull()
  })

  it('returns false when nothing is pending', () => {
    expect(nudger().tryAnswer('cat')).toBe(false)
  })

  it('never offers a second challenge while one is pending', () => {
    const n = nudger()
    feed(n, 6)
    for (let i = 0; i < 10; i++) expect(n.onInput(false)).toBeNull()
  })

  it('is deterministic for a seed', () => {
    expect(feed(nudger(9), 6)!.prompt).toBe(feed(nudger(9), 6)!.prompt)
  })

  it('every challenge has a prompt and at least one answer, in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const c = feed(nudger(seed, locale), 6)!
        expect(c.prompt.length).toBeGreaterThan(0)
        expect(c.answers.length).toBeGreaterThan(0)
        for (const a of c.answers) expect(a.trim()).toBe(a.toLowerCase().trim())
      }
    }
  })
})
