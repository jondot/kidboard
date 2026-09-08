import { describe, it, expect, vi } from 'vitest'
import { HOLD_MS, LEAD_MS, LETTER_MS, typeOut } from './demoType'

/**
 * A tiny scheduler, so the timing is a fact this test can read rather than a
 * wall-clock it has to wait for. Every delay `typeOut` asks for is recorded,
 * which is what lets the test check the SHAPE of the sequence — lead, letter,
 * letter, letter, hold — and not merely its result.
 */
function clock() {
  const queue: { fn: () => void; ms: number }[] = []
  const delays: number[] = []
  return {
    delays,
    wait: (fn: () => void, ms: number) => {
      delays.push(ms)
      queue.push({ fn, ms })
      return queue.length - 1
    },
    clear: () => { queue.length = 0 },
    /** Run whatever is pending, `n` times. */
    tick(n = 1): void {
      for (let i = 0; i < n; i++) {
        const next = queue.shift()
        if (!next) return
        next.fn()
      }
    },
    get pending() { return queue.length },
  }
}

describe('the machine typing for itself', () => {
  it('types a word one letter at a time and then runs it', () => {
    const c = clock()
    const frames: string[] = []
    const done = vi.fn()
    typeOut('cat', { onFrame: (s) => frames.push(s), onDone: done, wait: c.wait, clear: c.clear })

    // Nothing at all until the lead has passed: the card is read first.
    expect(frames).toEqual([])
    c.tick(6)
    expect(frames).toEqual(['', 'c', 'ca', 'cat'])
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('waits before it starts, moves at a reading pace, and holds at the end', () => {
    const c = clock()
    typeOut('cat', { onFrame: () => {}, onDone: () => {}, wait: c.wait, clear: c.clear })
    c.tick(6)
    // lead, then one wait per letter, then the HOLD — a word that vanished
    // the instant it was complete was never on screen long enough to copy.
    expect(c.delays).toEqual([LEAD_MS, LETTER_MS, LETTER_MS, LETTER_MS, HOLD_MS])
    expect(LETTER_MS, 'faster than a child can follow').toBeGreaterThanOrEqual(120)
    expect(LEAD_MS + 3 * LETTER_MS + HOLD_MS,
      'the whole demo outstays its welcome').toBeLessThan(4000)
  })

  /** THE COIN GOING IN. Whatever the child does, the cabinet hands over. */
  it('stops dead when it is cancelled, and never runs the word', () => {
    const c = clock()
    const frames: string[] = []
    const done = vi.fn()
    const cancel = typeOut('cat', {
      onFrame: (s) => frames.push(s), onDone: done, wait: c.wait, clear: c.clear,
    })
    c.tick(2)
    expect(frames).toEqual(['', 'c'])
    cancel()
    c.tick(9)
    expect(frames, 'it went on typing after it was stopped').toEqual(['', 'c'])
    expect(done, 'a cancelled demo still ran its word').not.toHaveBeenCalled()
  })

  it('is safe to cancel twice, and before it has started', () => {
    const c = clock()
    const cancel = typeOut('cat', {
      onFrame: () => {}, onDone: () => {}, wait: c.wait, clear: c.clear,
    })
    expect(() => { cancel(); cancel() }).not.toThrow()
  })

  it('handles a word of one letter, and a word of none', () => {
    const c = clock()
    const done = vi.fn()
    typeOut('', { onFrame: () => {}, onDone: done, wait: c.wait, clear: c.clear })
    c.tick(4)
    expect(done).toHaveBeenCalledTimes(1)
  })

  // Hebrew is typed the same way it is read: one character at a time, in the
  // order the string holds them. Nothing here reverses anything.
  it('types a Hebrew word in its own order', () => {
    const c = clock()
    const frames: string[] = []
    typeOut('חתול', {
      onFrame: (s) => frames.push(s), onDone: () => {}, wait: c.wait, clear: c.clear,
    })
    c.tick(8)
    expect(frames).toEqual(['', 'ח', 'חת', 'חתו', 'חתול'])
  })
})
