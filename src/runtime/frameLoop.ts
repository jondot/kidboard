export type FrameLoop = {
  start(): void
  stop(): void
  readonly running: boolean
}

/**
 * A backgrounded tab hands back one enormous delta on return. Clamp it, or a
 * ball integrates 10 seconds of motion in a single step and tunnels through a
 * wall. 50ms is two frames at 40Hz: generous enough that a slow frame is
 * simulated honestly, small enough that nothing teleports.
 */
export const MAX_DELTA_MS = 50

export type FrameLoopOpts = { maxDeltaMs?: number }

/**
 * A `requestAnimationFrame`-native loop: one step per displayed frame, at
 * whatever rate the display actually runs.
 *
 * v1 ran a fixed 24fps accumulator, which was a framerate below the threshold
 * where motion reads as continuous AND a second quantization on top of the
 * rounded positions. Both are gone: the step gets the real elapsed time, so a
 * 120Hz display simulates in 8ms slices and a 60Hz one in 16ms slices, and
 * either way the ball's position is a smooth function of wall-clock time.
 *
 * Tests still get determinism by calling a cartridge's `tick(dt)` directly
 * with a fixed delta (`ticks(inst, n, dt)` in the harness); nothing about a
 * cartridge's simulation depends on this loop.
 */
export function makeFrameLoop(
  step: (dt: number) => void,
  opts: FrameLoopOpts = {},
): FrameLoop {
  const maxDelta = Math.max(1, opts.maxDeltaMs ?? MAX_DELTA_MS)

  let handle = 0
  let last = 0
  let on = false

  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()

  const frame = (t: number): void => {
    if (!on) return
    const dt = Math.min(Math.max(t - last, 0), maxDelta)
    last = t
    handle = requestAnimationFrame(frame)
    // Scheduled BEFORE stepping, so a cartridge that throws (and is caught by
    // the session's guard) or a step that calls stop() still leaves the loop
    // in a coherent state — stop() cancels the handle we just took.
    step(dt / 1000)
  }

  return {
    get running() { return on },

    start() {
      if (on) return
      on = true
      last = now()
      handle = requestAnimationFrame(frame)
    },

    stop() {
      if (!on) return
      on = false
      cancelAnimationFrame(handle)
    },
  }
}
