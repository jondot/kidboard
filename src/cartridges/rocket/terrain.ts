import type { Rng } from '../../types'

/**
 * THE GROUND, and the one flat place on it.
 *
 * A landing game is a game about a surface, and a surface a child can read
 * has to say two things at a glance: where you cannot land, and where you
 * can. So the terrain is a jagged line of peaks with exactly ONE flat run in
 * it, and the flat run is drawn thicker than the rest — the pad is not
 * signposted, it IS a different-looking piece of ground.
 *
 * ONE PAD, NEVER TWO. The original had several, worth different scores. There
 * are no scores here, so a second pad would be a second identical
 * opportunity, which is not a choice — it is just a bigger target spread over
 * two places. One pad is a decision about where to be.
 *
 * THE PAD IS NEVER AT AN EDGE. A pad in the corner can be approached from one
 * side only, and a six-year-old drifting in from the wrong side has no way to
 * get round to it without climbing over a mountain first.
 *
 * Plain data and plain arithmetic: a `Rng` in, an array of heights out. No
 * DOM, nothing a sandbox would object to hosting.
 */

/** How many points the ground is made of. Fewer is blockier and easier to read. */
export const POINTS = 17
/** How wide the flat pad is, in points. */
export const PAD_POINTS = 3

/** Ground heights as fractions of the stage: 0 is the top, 1 the bottom. */
export type Ground = {
  /** One height per point, `POINTS` of them, evenly spaced across the stage. */
  readonly h: number[]
  /** The first point of the flat pad. `pad`..`pad + PAD_POINTS - 1` are level. */
  readonly pad: number
}

/** The highest the ground ever comes, and the lowest. Fractions from the top. */
const HIGH = 0.62
const LOW = 0.92

export function makeGround(rng: Rng): Ground {
  const h: number[] = []
  for (let i = 0; i < POINTS; i++) h.push(HIGH + rng.float() * (LOW - HIGH))

  // Never against either edge: a pad in the corner can be approached from one
  // side only, and a child drifting in from the wrong side would have to climb
  // a mountain to get round to it.
  const pad = 2 + rng.int(POINTS - PAD_POINTS - 4)
  // The pad sits LOW, so it is somewhere you descend into rather than a shelf
  // you have to clear a peak to reach.
  const level = LOW - rng.float() * 0.06
  for (let i = pad; i < pad + PAD_POINTS; i++) h[i] = level

  return { h, pad }
}

/** The ground's height directly under `x`, where `x` is 0..1 across the stage. */
export function groundAt(g: Ground, x: number): number {
  const t = Math.max(0, Math.min(1, x)) * (POINTS - 1)
  const i = Math.min(POINTS - 2, Math.floor(t))
  const k = t - i
  return g.h[i]! * (1 - k) + g.h[i + 1]! * k
}

/** True when `x` is over the flat pad, with a little room either side of it. */
export function onPad(g: Ground, x: number, slack = 0): boolean {
  const step = 1 / (POINTS - 1)
  return x >= g.pad * step - slack && x <= (g.pad + PAD_POINTS - 1) * step + slack
}
