import { PIXEL_ASPECT } from '../runtime/shapes'

/**
 * THE STAGE: a screen inside the canvas.
 *
 * Shared by every game that draws shapes, and the reason it is shared: this
 * was copy-pasted into five cartridges before a sixth wanted it. It is plain
 * arithmetic — no DOM, no React, no runtime state — so a cartridge that
 * imports it is still the "plain data and functions" a sandbox can host.
 *
 * WHY A STAGE AT ALL. Rows are fixed by the `aspect` a game declares and a
 * wide screen is handed extra COLUMNS, so the canvas can only ever get
 * *wider* than what was declared. A court drawn edge to edge on a desktop is
 * therefore a 3:1 horizon. Games declare `{ cols: 30, aspect: 1 }` and draw
 * into a centred sub-rectangle of the field instead: on a phone the stage IS
 * the canvas, and on a desktop the game settles into a 4:3 screen in the
 * middle of the terminal with the theme's own ground either side, the way a
 * 4:3 picture sits in a wide television.
 *
 * THE ARITHMETIC THAT MATTERS. A logical pixel has the shape of a character
 * cell: `PIXEL_ASPECT` (0.6) as wide as it is tall. So a `pw x ph` block of
 * pixels does NOT read as `pw:ph` on screen — it reads as `0.6 * pw : ph`. A
 * 4:3 picture is `pw/ph = 2.22`, not 1.33. Getting this backwards is how you
 * get an egg, so every ratio here is the ON-SCREEN one and the conversion
 * happens in exactly this one place.
 *
 * Re-exported so a cartridge needs one import rather than two, and so the
 * number can never drift: `runtime/shapes.ts` is where it actually lives, and
 * `shapes.test.ts` pins it to the canvas painter's own cell aspect.
 */
export { PIXEL_ASPECT }

/** A rectangle of the pixel field, in pixels. `x`/`y` are its top-left. */
export type Stage = { x: number; y: number; w: number; h: number }

/** Widest a play field may read on screen. Past this it is a slot, not a field. */
export const MAX_ASPECT = 4 / 3
/** Tallest a play field may read on screen. */
export const MIN_ASPECT = 3 / 4

/** How square a stage is allowed to be, in ON-SCREEN width-to-height. */
export type Bounds = { min: number; max: number }

/** The on-screen width-to-height ratio of a `w x h` block of logical pixels. */
export const seenAspect = (w: number, h: number): number =>
  (PIXEL_ASPECT * w) / h

/**
 * The largest field-shaped rectangle that fits inside a `pw x ph` pixel field,
 * centred. Whole pixels: a stage is scenery, and scenery snaps.
 *
 * `bounds` defaults to 3:4 .. 4:3, which is the house style. A game whose
 * picture is genuinely another shape (a tall rocket, a square robot floor)
 * passes its own — the centring, the rounding and the pixel-aspect conversion
 * are the same whatever the numbers are.
 *
 * Simulate in stage coordinates (0..w across, 0..h down) and add `stage.x` /
 * `stage.y` ONCE, in `draw`. The simulation then never has to know where on
 * the canvas the screen happens to sit, and a mid-play resize is one call.
 */
export const stageOf = (
  pw: number,
  ph: number,
  bounds: Bounds = { min: MIN_ASPECT, max: MAX_ASPECT },
): Stage => {
  const a = seenAspect(pw, ph)
  const w = a > bounds.max ? Math.round((ph * bounds.max) / PIXEL_ASPECT) : pw
  const h = a < bounds.min ? Math.round((pw * PIXEL_ASPECT) / bounds.min) : ph
  return { x: Math.round((pw - w) / 2), y: Math.round((ph - h) / 2), w, h }
}

/** True when two stages describe the same rectangle in the same place. */
export const sameStage = (a: Stage, b: Stage): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
