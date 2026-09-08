import type {
  BlockSpec, Cartridge, Ctx, DrawCmd, GameSize, LiveInstance, Locale,
} from '../types'
import { Canvas, rasterize, frameToString } from '../runtime/Canvas'
import { PX_PER_CELL, isShape, pixelArt, rasterizePixels } from '../runtime/shapes'
import { gridFor } from '../runtime/GridCanvas'
import { makeCtx } from '../runtime/ctx'
import { makeRng } from '../runtime/rng'

/**
 * Shared harness for testing `live` (and later `turn`) cartridges without a
 * DOM or a real session. Every mini-game task builds its tests on this.
 */
export function testCtx(o: {
  locale?: Locale
  seed?: number
  input?: string
  strings?: Cartridge['strings']
} = {}): { ctx: Ctx; said: BlockSpec[]; exited: () => boolean } {
  const said: BlockSpec[] = []
  let exited = false
  const ctx: Ctx = makeCtx({
    locale: o.locale ?? 'en',
    rng: makeRng(o.seed ?? 1),
    audio: { note: () => {}, noise: () => {}, blip: () => {}, hit: () => {} },
    strings: o.strings,
    input: o.input ?? '',
    say: (specs) => said.push(...specs),
    exit: () => { exited = true },
  })
  return { ctx, said, exited: () => exited }
}

/**
 * The integer model of one frame, as a string.
 *
 * `size` is what the cartridge declares (`{ cols, aspect }`); `gridFor`
 * resolves it to the grid the game gets at its *minimum* width, which is what
 * makes a snapshot stable. Pass an explicit `cols` to test a game at a wider
 * layout, exactly as a wide browser window would hand it one.
 */
export function frameOf(
  inst: LiveInstance,
  size: GameSize,
  cols?: number,
): string {
  const g = gridFor(size, cols)
  const cmds = cmdsOf(inst, size, cols)
  const out = frameToString(rasterize(cmds, g.w, g.h))

  // THE ANTI-DIVERGENCE GUARD.
  //
  // Shape ops live in the pixel field and are not in the character model, so
  // a game drawn entirely with shapes rasterizes to a blank grid here — and a
  // blank grid is precisely the shape of a test that stays green while the
  // screen is wrong. That divergence has cost this project three times. Rather
  // than return the lie, say what to use instead. Test-time only: nothing a
  // child can reach ever calls this.
  if (cmds.some(isShape) && out.trim() === '') {
    throw new Error(
      'frameOf: this cartridge drew only shapes, so the character model is ' +
      'blank. Snapshot it with pixelsOf(inst, size) — the full-resolution ' +
      'pixel model — or assert on cmdsOf(inst, size).',
    )
  }
  return out
}

/**
 * The integer PIXEL model of one frame, as art: `#` for a lit pixel, `.` for
 * background, one character per logical pixel (so `8 * cols` wide and
 * `8 * rows` tall). This is what a shape-drawing cartridge snapshots.
 *
 * Full resolution on purpose. A coarser view would let a real error hide.
 */
export function pixelsOf(
  inst: LiveInstance,
  size: GameSize,
  cols?: number,
): string {
  const g = gridFor(size, cols)
  return pixelArt(
    rasterizePixels(cmdsOf(inst, size, cols), g.w * PX_PER_CELL, g.h * PX_PER_CELL),
  )
}

/** The raw command buffer one `draw` records. Neither model, just the truth. */
export function cmdsOf(
  inst: LiveInstance,
  size: GameSize,
  cols?: number,
): DrawCmd[] {
  const g = gridFor(size, cols)
  const c = new Canvas(g.w, g.h)
  inst.draw(c)
  return c.cmds()
}

export function press(inst: LiveInstance, key: string, times = 1): void {
  for (let i = 0; i < times; i++) {
    inst.onKey?.({ key, shift: false, repeat: false })
  }
}

/**
 * Feeds a cartridge a fixed delta, n times. The frame loop is
 * requestAnimationFrame-native and hands out real wall-clock deltas, but a
 * cartridge's simulation never depends on that — so every cartridge test stays
 * deterministic by driving `tick` directly.
 */
export function ticks(inst: LiveInstance, n: number, dt = 1 / 60): void {
  for (let i = 0; i < n; i++) inst.tick?.(dt)
}

/**
 * A key HELD DOWN, delivered the way a browser delivers one.
 *
 * This is the only honest way to test the pause a game holds after a round
 * ends. A key held down is not one `onKey` — it is the operating system's
 * auto-repeat stream, a fresh keydown roughly every 30 ms with `repeat: true`
 * on every one after the first, arriving BETWEEN frames. `press` + `ticks`
 * cannot reproduce that, which is exactly how four cartridges shipped with a
 * pause that no child holding an arrow ever saw.
 *
 * Runs the clock for `seconds` at `dt`, injecting a repeat every `every`
 * seconds. Defaults are Chrome's on a Mac with the repeat delay already
 * elapsed.
 */
export function holdKey(
  inst: LiveInstance,
  key: string,
  seconds: number,
  o: { every?: number; dt?: number; each?: () => void } = {},
): void {
  const dt = o.dt ?? 1 / 60
  const every = o.every ?? 0.03
  let sinceKey = every
  let first = true
  for (let t = 0; t < seconds; t += dt) {
    sinceKey += dt
    if (sinceKey >= every) {
      sinceKey = 0
      inst.onKey?.({ key, shift: false, repeat: !first })
      first = false
    }
    inst.tick?.(dt)
    o.each?.()
  }
}
