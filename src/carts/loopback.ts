import { WORKER_SOURCE } from './workerSource'
import type { WorkerLike } from './host'

/**
 * TEST DOUBLE. A `WorkerLike` that runs the real worker bootstrap in this
 * thread instead of in a Worker.
 *
 * jsdom has no `Worker`, so without this the bootstrap — the recorder, the
 * shadowing, the error containment, the whole cart-facing API — would only
 * ever be exercised by hand in a browser. Running the SAME source string a
 * `blob:` URL would run is what makes the unit tests mean something.
 *
 * What it deliberately does not model: real isolation. It cannot, because it
 * is in-process. Termination is modelled as "stop delivering messages", which
 * is what the host observes; only a real browser can prove that a real
 * spinning worker is really terminated.
 */
export function makeLoopbackWorker(): WorkerLike {
  const bag: Record<string, unknown> = {}
  let dead = false

  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(m: unknown) {
      if (dead) return
      const handler = bag.onmessage as ((e: { data: unknown }) => void) | null
      // Asynchronous on purpose: a real worker never answers within the same
      // turn, and a host that quietly depends on a synchronous reply would
      // work here and deadlock in a browser.
      queueMicrotask(() => { if (!dead) handler?.({ data: m }) })
    },
    terminate() { dead = true },
  }

  bag.postMessage = (m: unknown) => {
    if (dead) return
    queueMicrotask(() => { if (!dead) worker.onmessage?.({ data: m }) })
  }

  const run = new Function('self', WORKER_SOURCE) as (s: unknown) => void
  run(bag)
  return worker
}

/** The bootstrap running against a bag you control, for testing it directly. */
export function runWorkerSource(): {
  send(m: unknown): void
  sent: unknown[]
  /** The object the bootstrap treated as its global. */
  bag: Record<string, unknown>
} {
  const sent: unknown[] = []
  const bag: Record<string, unknown> = { postMessage: (m: unknown) => sent.push(m) }
  const run = new Function('self', WORKER_SOURCE) as (s: unknown) => void
  run(bag)
  return {
    send: (m) => (bag.onmessage as (e: { data: unknown }) => void)({ data: m }),
    sent,
    bag,
  }
}
