import type {
  Audio, BlockSpec, Frame, Key, LiveCartridge, LiveInstance, Locale,
} from '../types'
import { Canvas } from '../runtime/Canvas'
import { makeCtx } from '../runtime/ctx'
import { makeRng } from '../runtime/rng'
import { sanitizeBlocks, sanitizeCmds, type FromWorker, type ToWorker } from './protocol'
import { WORKER_SOURCE, looksImportable } from './workerSource'
import type { CartManifest } from './manifest'

/**
 * THE SEAM.
 *
 * A cartridge is a thing that is started, fed keys and time, and answers with
 * frames. Where the code that does that actually runs is a separate question,
 * and `CartridgeHost` is where the two questions come apart.
 *
 *   LocalHost   built-in cartridge, direct calls, same tick
 *   WorkerHost  a cart from a PNG, postMessage, one round-trip of latency
 *
 * Additive on purpose: the built-in path is untouched, and `LocalHost` is the
 * shape the runtime would talk to if and when it stops calling cartridges
 * directly. Both are held to the same test.
 */
export type CartridgeHost = {
  start(): void
  key(k: Key): void
  tick(dt: number): void
  stop(): void
}

export type HostEvents = {
  /** A finished frame. */
  frame(f: Frame): void
  say(blocks: BlockSpec[]): void
  /** The cartridge ended itself, or was ended. */
  exit(souvenir: string): void
  /**
   * The cart had to be put down — it hung, it threw, or it was never
   * runnable. Separate from `exit` because the shell says something warm
   * here, and because a host must never make that decision look like a crash.
   */
  hush(): void
}

export type HostDeps = {
  locale: Locale
  seed: number
  input: string
  audio: Audio
  /** Asked every frame, so a resize reaches a cart on the next one. */
  grid(): { w: number; h: number }
  events: HostEvents
}

// ---- LocalHost ----------------------------------------------------------

export function makeLocalHost(cart: LiveCartridge, d: HostDeps): CartridgeHost {
  let inst: LiveInstance | null = null
  const rng = makeRng(d.seed)
  let over = false

  const finish = (): void => {
    if (over) return
    over = true
    const souvenir = inst?.souvenir?.() ?? ''
    inst = null
    d.events.exit(souvenir)
  }

  const render = (): void => {
    if (!inst) return
    const g = d.grid()
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    d.events.frame({ cmds: c.cmds(), w: c.w, h: c.h })
  }

  return {
    start() {
      const ctx = makeCtx({
        locale: d.locale, rng, audio: d.audio, strings: cart.strings,
        input: d.input, say: d.events.say, exit: finish,
      })
      inst = cart.create(ctx)
      render()
    },
    key(k) { if (!inst) return; inst.onKey?.(k); render() },
    tick(dt) { if (!inst) return; inst.tick?.(dt); render() },
    stop() { finish() },
  }
}

// ---- WorkerHost ---------------------------------------------------------

/**
 * The slice of `Worker` this host uses. Named so tests can drive a fake one:
 * jsdom has no `Worker` at all, and a watchdog you cannot test is a watchdog
 * that does not work.
 */
export type WorkerLike = {
  postMessage(m: unknown): void
  terminate(): void
  onmessage: ((e: { data: unknown }) => void) | null
  onerror: ((e: unknown) => void) | null
}

export type Timers = {
  set(fn: () => void, ms: number): number
  clear(id: number): void
}

/** A cart that has not answered in this long has stopped answering. */
export const TICK_DEADLINE_MS = 100
/** Compiling a blob and evaluating a stranger's code is allowed to be slow. */
export const START_DEADLINE_MS = 2000

export type WorkerHostDeps = HostDeps & {
  manifest: CartManifest
  spawn(): WorkerLike
  timers?: Timers
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clear: (id) => { clearTimeout(id) },
}

export function makeWorkerHost(d: WorkerHostDeps): CartridgeHost {
  const timers = d.timers ?? realTimers
  let worker: WorkerLike | null = null
  let seq = 0
  let watchdog: number | null = null
  let over = false
  /** The last frame the cart sent, replayed until it sends another. */
  let latest: Frame | null = null
  /**
   * The souvenir as of the last frame. `LiveInstance.souvenir()` is
   * synchronous and postMessage is not, so the worker volunteers it with
   * every frame rather than being asked for it at the one moment it cannot
   * answer.
   */
  let souvenir = ''

  const disarm = (): void => {
    if (watchdog !== null) { timers.clear(watchdog); watchdog = null }
  }

  const kill = (): void => {
    disarm()
    if (worker) { try { worker.terminate() } catch { /* already gone */ } }
    worker = null
  }

  /**
   * THE WATCHDOG. A cart that misses its deadline is terminated, and the
   * child gets a warm line rather than a frozen tab. `while (true)` inside a
   * cart cannot hang the page because the page is not where it runs.
   */
  const bite = (): void => {
    if (over) return
    over = true
    kill()
    d.events.hush()
    d.events.exit('')
  }

  const arm = (ms: number): void => {
    disarm()
    watchdog = timers.set(bite, ms)
  }

  const finish = (souvenir: string): void => {
    if (over) return
    over = true
    kill()
    d.events.exit(souvenir)
  }

  const onMessage = (raw: unknown): void => {
    if (over) return
    const msg = raw as FromWorker
    if (typeof msg !== 'object' || msg === null) return

    switch (msg.m) {
      case 'draw': {
        disarm()
        if (typeof msg.sv === 'string') souvenir = msg.sv.slice(0, 200)
        const g = d.grid()
        latest = { cmds: sanitizeCmds(msg.cmds), w: g.w, h: g.h }
        d.events.frame(latest)
        break
      }
      case 'say':
        d.events.say(sanitizeBlocks(msg.blocks))
        break
      case 'audio':
        if (msg.kind === 'note') d.audio.note(Number(msg.hz) || 0, Number(msg.ms) || 0)
        else if (msg.kind === 'noise') d.audio.noise(Number(msg.ms) || 0)
        else d.audio.blip()
        break
      case 'exit':
        finish(typeof msg.souvenir === 'string' ? msg.souvenir.slice(0, 200) : '')
        break
      default:
        break
    }
  }

  const post = (m: ToWorker, deadline: number): void => {
    if (over || !worker) return
    arm(deadline)
    try { worker.postMessage(m) } catch { bite() }
  }

  return {
    start() {
      if (looksImportable(d.manifest.code)) { bite(); return }
      try {
        worker = d.spawn()
      } catch {
        bite()
        return
      }
      worker.onmessage = (e) => onMessage(e.data)
      // A worker that fails to compile at all is a cart that cannot play.
      worker.onerror = () => { bite() }
      seq += 1
      const g = d.grid()
      post({
        m: 'init', code: d.manifest.code, seed: d.seed, locale: d.locale,
        input: d.input, strings: d.manifest.strings, seq, w: g.w, h: g.h,
      }, START_DEADLINE_MS)
    },

    key(k) {
      seq += 1
      const g = d.grid()
      post({ m: 'key', key: k.key, shift: k.shift, repeat: k.repeat, seq, w: g.w, h: g.h }, TICK_DEADLINE_MS)
    },

    tick(dt) {
      // One outstanding frame at a time. Piling ticks onto a worker that is
      // already behind is how a slow cart becomes an unkillable one.
      if (watchdog !== null) return
      seq += 1
      const g = d.grid()
      post({ m: 'tick', dt, seq, w: g.w, h: g.h }, TICK_DEADLINE_MS)
    },

    stop() { finish(souvenir) },
  }
}

/** The frame the worker most recently sent, for a host that draws on demand. */
export const workerSourceUrl = (): string => {
  const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' })
  return URL.createObjectURL(blob)
}
