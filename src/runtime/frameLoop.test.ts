import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeFrameLoop, MAX_DELTA_MS } from './frameLoop'

let now = 0
let cbs: FrameRequestCallback[] = []

const advance = (ms: number) => {
  now += ms
  const due = cbs
  cbs = []
  for (const cb of due) cb(now)
}

beforeEach(() => {
  now = 0
  cbs = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cbs.push(cb)
    return cbs.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => { cbs = [] })
  vi.stubGlobal('performance', { now: () => now })
})

afterEach(() => vi.unstubAllGlobals())

describe('makeFrameLoop', () => {
  it('does not step before start', () => {
    const step = vi.fn()
    makeFrameLoop(step)
    advance(1000)
    expect(step).not.toHaveBeenCalled()
  })

  it('steps once per displayed frame, whatever the display rate', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    for (let i = 0; i < 24; i++) advance(1000 / 24)
    expect(step).toHaveBeenCalledTimes(24)

    const fast = vi.fn()
    const l2 = makeFrameLoop(fast)
    l2.start()
    // A 120Hz display gets 120 steps in the same second, not 24.
    for (let i = 0; i < 120; i++) advance(1000 / 120)
    expect(fast).toHaveBeenCalledTimes(120)
    loop.stop(); l2.stop()
  })

  it('passes the real elapsed delta in seconds, not a fixed step', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    advance(1000 / 60)
    expect(step.mock.calls[0]![0]).toBeCloseTo(1 / 60, 4)
    advance(1000 / 24)
    expect(step.mock.calls[1]![0]).toBeCloseTo(1 / 24, 4)
    loop.stop()
  })

  it('stops stepping after stop()', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    advance(16)
    const before = step.mock.calls.length
    loop.stop()
    advance(1000)
    expect(step.mock.calls.length).toBe(before)
    expect(loop.running).toBe(false)
  })

  it('clamps a huge gap so a backgrounded tab cannot tunnel a ball through a wall', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    advance(10_000)
    expect(step).toHaveBeenCalledTimes(1)
    expect(step.mock.calls[0]![0]).toBeCloseTo(MAX_DELTA_MS / 1000, 4)
    loop.stop()
  })

  it('honours an explicit delta ceiling', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step, { maxDeltaMs: 20 })
    loop.start()
    advance(500)
    expect(step.mock.calls[0]![0]).toBeCloseTo(0.02, 4)
    loop.stop()
  })

  it('never hands out a negative delta if the clock goes backwards', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    now = -100
    const due = cbs
    cbs = []
    for (const cb of due) cb(now)
    expect(step.mock.calls[0]![0]).toBe(0)
    loop.stop()
  })

  it('start is idempotent', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    loop.start()
    loop.start()
    advance(1000 / 60)
    expect(step).toHaveBeenCalledTimes(1)
    loop.stop()
  })

  it('stop is idempotent and safe before start', () => {
    const step = vi.fn()
    const loop = makeFrameLoop(step)
    expect(() => { loop.stop(); loop.stop() }).not.toThrow()
    loop.start()
    loop.stop()
    loop.stop()
    advance(1000)
    expect(step).not.toHaveBeenCalled()
  })

  it('a step that stops the loop does not schedule another frame', () => {
    const step = vi.fn(() => loop.stop())
    const loop = makeFrameLoop(step)
    loop.start()
    advance(16)
    advance(16)
    expect(step).toHaveBeenCalledTimes(1)
    expect(loop.running).toBe(false)
  })
})
