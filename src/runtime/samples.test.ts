import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { playSample, resetSamples } from './samples'

class FakeCtx {
  currentTime = 0
  destination = {}
  createBufferSource() {
    return { buffer: null as unknown, connect: vi.fn(), start: vi.fn() }
  }
  decodeAudioData = vi.fn(async () => ({ duration: 1 }))
}

const ctx = () => new FakeCtx() as unknown as AudioContext
const out = {} as AudioNode

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => { resetSamples() })
afterEach(() => { vi.unstubAllGlobals() })

describe('recordings, when there are any', () => {
  it('synthesises when there is no manifest at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    expect(playSample(ctx(), 'kick', out)).toBe(false)
    await flush()
    // And it does not go on asking: one 404 in a console, not one per press.
    expect(playSample(ctx(), 'kick', out)).toBe(false)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('never blocks the first press waiting for a file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ voices: ['kick'] }),
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    // The manifest has not arrived yet, so this press synthesises — which is
    // the whole point: a pad must make a noise the instant it is hit.
    expect(playSample(ctx(), 'kick', out)).toBe(false)
  })

  it('plays the recording once it has arrived, and only for named voices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ voices: ['kick'] }),
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    const c = ctx()
    playSample(c, 'kick', out)
    await flush()
    playSample(c, 'kick', out)          // starts the decode
    await flush()
    expect(playSample(c, 'kick', out)).toBe(true)
    // A voice with no file keeps its synthesised version. The two mix freely.
    expect(playSample(c, 'snare', out)).toBe(false)
  })

  it('falls back to the synthesiser when a file will not decode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ voices: ['hat'] }),
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    const c = ctx()
    ;(c as unknown as FakeCtx).decodeAudioData = vi.fn(async () => {
      throw new Error('not audio this browser knows')
    })
    playSample(c, 'hat', out)
    await flush()
    playSample(c, 'hat', out)
    await flush()
    expect(playSample(c, 'hat', out)).toBe(false)
  })

  it('never throws, whatever the network does', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(() => playSample(ctx(), 'clap', out)).not.toThrow()
    await flush()
    expect(playSample(ctx(), 'clap', out)).toBe(false)
  })

  it('ignores a manifest that is not the shape it should be', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ voices: 'kick' }),
    })))
    playSample(ctx(), 'kick', out)
    await flush()
    expect(playSample(ctx(), 'kick', out)).toBe(false)
  })
})
