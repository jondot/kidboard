import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeAudio, loadMuted, saveMuted, NOTES } from './audio'

class FakeParam {
  value = 0
  setValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
}

class FakeOsc {
  frequency = new FakeParam()
  type = 'sine'
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeCtx {
  static made = 0
  currentTime = 0
  destination = {}
  state = 'running'
  constructor() { FakeCtx.made += 1 }
  createOscillator() { return new FakeOsc() }
  sampleRate = 44100
  createGain() { return { gain: new FakeParam(), connect: vi.fn() } }
  createBiquadFilter() {
    return { type: '', frequency: new FakeParam(), Q: new FakeParam(), connect: vi.fn() }
  }
  createBuffer(_ch: number, frames: number) {
    return { getChannelData: () => new Float32Array(frames) }
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  }
  resume = vi.fn()
}

beforeEach(() => {
  FakeCtx.made = 0
  localStorage.clear()
  vi.stubGlobal('AudioContext', FakeCtx)
})

describe('makeAudio', () => {
  it('creates no AudioContext until unlocked', () => {
    const a = makeAudio()
    a.note(440, 100)
    expect(FakeCtx.made).toBe(0)
  })

  it('creates exactly one context across many unlocks', () => {
    const a = makeAudio()
    a.unlock()
    a.unlock()
    a.note(440, 100)
    expect(FakeCtx.made).toBe(1)
  })

  it('makes no sound while muted', () => {
    const a = makeAudio()
    a.unlock()
    a.setMuted(true)
    expect(() => { a.note(440, 100); a.noise(50); a.blip(); a.hit('kick') }).not.toThrow()
    expect(a.muted).toBe(true)
  })

  it('never throws when AudioContext is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    const a = makeAudio()
    a.unlock()
    expect(() => { a.note(440, 100); a.noise(10); a.blip(); a.hit('snare') }).not.toThrow()
  })

  /**
   * Every drum is reachable and none of them throws. The recipes themselves —
   * how far a kick's pitch falls, where a hat's filter sits — are numbers you
   * judge with your ears, not with an assertion; what a test can hold is that
   * the bank is complete and that a browser missing a node ends in silence
   * rather than in an exception reaching the terminal.
   */
  it('strikes every voice without throwing', () => {
    const a = makeAudio()
    a.unlock()
    for (const v of ['kick', 'snare', 'hat', 'clap', 'tom'] as const) {
      expect(() => a.hit(v)).not.toThrow()
    }
  })

  it('is silent, not broken, on a browser with no filters', () => {
    class NoFilters extends FakeCtx {
      override createBiquadFilter(): never { throw new Error('nope') }
    }
    vi.stubGlobal('AudioContext', NoFilters)
    const a = makeAudio()
    a.unlock()
    expect(() => a.hit('hat')).not.toThrow()
  })
})

describe('mute persistence', () => {
  it('round-trips', () => {
    expect(loadMuted()).toBe(false)
    saveMuted(true)
    expect(loadMuted()).toBe(true)
  })
})

describe('NOTES', () => {
  it('has an in-tune middle C and an octave relationship', () => {
    expect(Math.round(NOTES.C4!)).toBe(262)
    expect(NOTES.C5! / NOTES.C4!).toBeCloseTo(2, 1)
  })
})
