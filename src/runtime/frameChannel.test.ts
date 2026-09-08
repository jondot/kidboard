import { describe, it, expect, vi } from 'vitest'
import { makeFrameChannel } from './frameChannel'
import type { Frame } from '../types'

const f = (ch: string): Frame =>
  ({ cmds: [{ op: 'put', x: 0, y: 0, ch, tone: 'plain' }], w: 1, h: 1 })

describe('makeFrameChannel', () => {
  it('delivers a frame to the subscriber', () => {
    const c = makeFrameChannel()
    const seen = vi.fn()
    c.subscribe(seen)
    c.emit(f('a'))
    expect(seen).toHaveBeenCalledWith(f('a'))
  })

  it('drops frames with nobody listening instead of throwing', () => {
    const c = makeFrameChannel()
    expect(() => c.emit(f('a'))).not.toThrow()
    expect(c.latest()).toEqual(f('a'))
  })

  // The session emits its first frame during mount(), before React has
  // committed the canvas that will show it. Without a replay the game would
  // start on one blank frame.
  it('replays the latest frame to a late subscriber', () => {
    const c = makeFrameChannel()
    c.emit(f('a'))
    const seen = vi.fn()
    c.subscribe(seen)
    expect(seen).toHaveBeenCalledWith(f('a'))
  })

  it('unsubscribing stops delivery', () => {
    const c = makeFrameChannel()
    const seen = vi.fn()
    const off = c.subscribe(seen)
    off()
    c.emit(f('a'))
    expect(seen).not.toHaveBeenCalled()
  })

  // React mounts the replacement before unmounting the old one, so the old
  // block's cleanup must not silence the new block's canvas.
  it('a stale unsubscribe cannot silence the canvas that replaced it', () => {
    const c = makeFrameChannel()
    const old = vi.fn()
    const offOld = c.subscribe(old)
    const fresh = vi.fn()
    c.subscribe(fresh)
    offOld()
    c.emit(f('a'))
    expect(fresh).toHaveBeenCalledWith(f('a'))
    expect(old).not.toHaveBeenCalled()
  })

  it('reset forgets the previous game, so a new one never replays its frame', () => {
    const c = makeFrameChannel()
    c.emit(f('a'))
    c.reset()
    expect(c.latest()).toBeNull()
    const seen = vi.fn()
    c.subscribe(seen)
    expect(seen).not.toHaveBeenCalled()
  })
})
