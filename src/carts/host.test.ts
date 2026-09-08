import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Audio, BlockSpec, Frame, LiveCartridge } from '../types'
import {
  START_DEADLINE_MS, TICK_DEADLINE_MS, makeLocalHost, makeWorkerHost,
  type CartridgeHost, type HostEvents, type WorkerLike,
} from './host'
import { makeLoopbackWorker } from './loopback'
import { rasterize, frameToString } from '../runtime/Canvas'
import type { CartManifest } from './manifest'

const silentAudio: Audio = { note: () => {}, noise: () => {}, blip: () => {}, hit: () => {} }

function spy() {
  const frames: Frame[] = []
  const said: BlockSpec[] = []
  const exits: string[] = []
  let hushed = 0
  const events: HostEvents = {
    frame: (f) => frames.push(f),
    say: (b) => said.push(...b),
    exit: (s) => exits.push(s),
    hush: () => { hushed += 1 },
  }
  return { events, frames, said, exits, hushed: () => hushed }
}

const deps = (events: HostEvents) => ({
  locale: 'en' as const, seed: 5, input: '', audio: silentAudio,
  grid: () => ({ w: 12, h: 4 }), events,
})

const picture = (f: Frame): string => frameToString(rasterize(f.cmds, f.w, f.h)).trim()

// ---- LocalHost ----------------------------------------------------------

const builtIn: LiveCartridge = {
  kind: 'live', apiVersion: 1, id: 'test-local',
  triggers: { en: ['local'] }, locales: ['en'],
  size: { cols: 12, aspect: 3 },
  hints: () => [],
  create(ctx) {
    let n = 0
    let key = ''
    return {
      onKey: (k) => { key = k.key; if (k.key === 'q') ctx.exit() },
      tick: (dt) => { n += dt },
      draw: (c) => { c.text(0, 0, `${key}${n}`) },
      souvenir: () => 'nice one',
    }
  },
}

describe('LocalHost runs a built-in cartridge directly', () => {
  it('draws on start, on a key, and on a tick', () => {
    const s = spy()
    const host = makeLocalHost(builtIn, deps(s.events))
    host.start()
    host.key({ key: 'a', shift: false, repeat: false })
    host.tick(0.5)
    expect(s.frames.map(picture)).toEqual(['0', 'a0', 'a0.5'])
  })

  it('hands back the souvenir when it is stopped', () => {
    const s = spy()
    const host = makeLocalHost(builtIn, deps(s.events))
    host.start()
    host.stop()
    expect(s.exits).toEqual(['nice one'])
  })

  it('ends when the cartridge ends itself, and stops drawing after', () => {
    const s = spy()
    const host = makeLocalHost(builtIn, deps(s.events))
    host.start()
    host.key({ key: 'q', shift: false, repeat: false })
    const after = s.frames.length
    host.tick(1)
    expect(s.exits).toEqual(['nice one'])
    expect(s.frames.length).toBe(after)
  })
})

// ---- WorkerHost ---------------------------------------------------------

const manifest = (code: string): CartManifest => ({
  apiVersion: 1, id: 'test-cart', name: { en: 'testcart' }, title: { en: 'Test' },
  author: '', locales: ['en'], hints: {}, strings: {}, code,
  size: { cols: 12, aspect: 3 },
})

const DRAWS = 'kb.game(function (ctx) { var k = ""; return { onKey: function (e) { k = e.key; if (e.key === "q") ctx.exit() }, draw: function (c) { c.text(0, 0, "cart" + k) }, souvenir: function () { return "played" } } })'

/** A worker that receives everything and answers nothing. A spinning cart. */
function silentWorker(): WorkerLike & { killed: () => boolean; got: unknown[] } {
  let killed = false
  const got: unknown[] = []
  return {
    onmessage: null, onerror: null,
    postMessage: (m) => { got.push(m) },
    terminate: () => { killed = true },
    killed: () => killed,
    got,
  }
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

describe('WorkerHost runs a cart behind postMessage', () => {
  it('draws the frame the cart posted back', async () => {
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events), manifest: manifest(DRAWS), spawn: makeLoopbackWorker,
    })
    host.start()
    await flush()
    expect(s.frames.map(picture)).toEqual(['cart'])
  })

  it('carries a key across and paints the answer', async () => {
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events), manifest: manifest(DRAWS), spawn: makeLoopbackWorker,
    })
    host.start()
    await flush()
    host.key({ key: 'a', shift: false, repeat: false })
    await flush()
    expect(s.frames.map(picture).at(-1)).toBe('carta')
  })

  it('ends with the cart\'s own souvenir when the cart exits', async () => {
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events), manifest: manifest(DRAWS), spawn: makeLoopbackWorker,
    })
    host.start()
    await flush()
    host.key({ key: 'q', shift: false, repeat: false })
    await flush()
    expect(s.exits).toEqual(['played'])
    expect(s.hushed()).toBe(0)
  })

  it('says what the cart says and plays what it plays', async () => {
    const notes: number[] = []
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events),
      audio: { ...silentAudio, note: (hz) => notes.push(hz) },
      manifest: manifest('kb.game(function (ctx) { ctx.say([{ kind: "text", text: "hi" }]); ctx.audio.note(440, 50); return { draw: function () {} } })'),
      spawn: makeLoopbackWorker,
    })
    host.start()
    await flush()
    expect(s.said).toEqual([{ kind: 'text', text: 'hi', tone: 'plain' }])
    expect(notes).toEqual([440])
  })

  it('paints nothing rather than rubbish when a cart posts nonsense', async () => {
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events),
      manifest: manifest('kb.game(function () { return { draw: function (c) { c.text(NaN, Infinity, "x", "nosuchtone") } } })'),
      spawn: makeLoopbackWorker,
    })
    host.start()
    await flush()
    expect(s.frames[0]!.cmds).toEqual([
      { op: 'text', x: 0, y: 0, text: 'x', tone: 'plain' },
    ])
  })
})

describe('the watchdog', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const hung = (code = DRAWS) => {
    const s = spy()
    const w = silentWorker()
    const host = makeWorkerHost({
      ...deps(s.events), manifest: manifest(code), spawn: () => w,
    })
    return { s, w, host }
  }

  it('terminates a cart that never answers its first frame', () => {
    const { s, w, host } = hung()
    host.start()
    expect(w.killed()).toBe(false)
    vi.advanceTimersByTime(START_DEADLINE_MS + 1)
    expect(w.killed()).toBe(true)
    expect(s.hushed()).toBe(1)
    expect(s.exits).toEqual([''])
  })

  it('terminates a cart that stops answering ticks — while(true) cannot hang the page', () => {
    const { s, w, host } = hung()
    host.start()
    // It answered the first frame, so it was alive.
    w.onmessage?.({ data: { m: 'draw', seq: 1, cmds: [], w: 12, h: 4 } })
    expect(s.frames).toHaveLength(1)

    host.tick(1 / 60)
    vi.advanceTimersByTime(TICK_DEADLINE_MS - 1)
    expect(w.killed()).toBe(false)
    vi.advanceTimersByTime(2)
    expect(w.killed()).toBe(true)
    expect(s.hushed()).toBe(1)
  })

  it('says nothing more once it has bitten', () => {
    const { s, w, host } = hung()
    host.start()
    vi.advanceTimersByTime(START_DEADLINE_MS + 1)
    w.onmessage?.({ data: { m: 'draw', seq: 1, cmds: [{ op: 'clear' }], w: 12, h: 4 } })
    host.tick(1)
    host.key({ key: 'a', shift: false, repeat: false })
    vi.advanceTimersByTime(10000)
    expect(s.frames).toEqual([])
    expect(s.exits).toEqual([''])
    expect(s.hushed()).toBe(1)
  })

  it('never lets ticks pile up on a cart that is already behind', () => {
    const { w, host } = hung()
    host.start()
    w.onmessage?.({ data: { m: 'draw', seq: 1, cmds: [], w: 12, h: 4 } })
    for (let i = 0; i < 20; i++) host.tick(1 / 60)
    expect(w.got.filter((m) => (m as { m: string }).m === 'tick')).toHaveLength(1)
  })

  it('puts down a cart that mentions import without ever spawning a worker', () => {
    const s = spy()
    let spawned = 0
    const host = makeWorkerHost({
      ...deps(s.events),
      manifest: manifest('import("https://example.invalid")'),
      spawn: () => { spawned += 1; return silentWorker() },
    })
    host.start()
    expect(spawned).toBe(0)
    expect(s.hushed()).toBe(1)
    expect(s.exits).toEqual([''])
  })

  it('puts down a cart whose worker cannot even be made', () => {
    const s = spy()
    const host = makeWorkerHost({
      ...deps(s.events), manifest: manifest(DRAWS),
      spawn: () => { throw new Error('no workers here') },
    })
    host.start()
    expect(s.hushed()).toBe(1)
  })

  it('puts down a cart whose worker errors', () => {
    const { s, w, host } = hung()
    host.start()
    w.onerror?.(new Error('syntax'))
    expect(w.killed()).toBe(true)
    expect(s.hushed()).toBe(1)
  })
})

describe('both hosts answer the same questions', () => {
  it('expose exactly the same surface', () => {
    const s = spy()
    const local: CartridgeHost = makeLocalHost(builtIn, deps(s.events))
    const remote: CartridgeHost = makeWorkerHost({
      ...deps(s.events), manifest: manifest(DRAWS), spawn: makeLoopbackWorker,
    })
    for (const host of [local, remote]) {
      expect(Object.keys(host).sort()).toEqual(['key', 'start', 'stop', 'tick'])
    }
  })
})
