import type { DrawCmd, Tone } from '../types'

/**
 * THE PIXEL FIELD.
 *
 * A character cell is subdivided into `PX_PER_CELL` x `PX_PER_CELL` logical
 * pixels, so a 40x20 cell grid is a 320x160 pixel field. Fixed, and the only
 * place the number lives. Character ops keep taking cell coordinates; shape
 * ops take pixel coordinates; both draw to the same surface.
 *
 * The subdivision is the same on both axes, so a logical pixel has exactly
 * the shape of a cell: taller than it is wide, by 1 / PIXEL_ASPECT. This is
 * not an accident to be corrected — a Kidtari pixel was not square either —
 * but anything that wants to read as ROUND has to know about it, which is
 * what `disc` and `circle` compensate for below.
 */
export const PX_PER_CELL = 8

/**
 * Width-to-height ratio of one logical pixel, which is the ratio of one cell.
 * Must equal `CELL_ASPECT` in `GridCanvas.ts`; `shapes.test.ts` asserts it,
 * because a drifted copy would silently turn every circle into an egg.
 * Duplicated rather than imported only to keep this module free of any
 * dependency on the layout code, which imports *this* one.
 */
export const PIXEL_ASPECT = 0.6

/** The subset of `DrawCmd` that lives in pixel space. */
export type ShapeCmd = Extract<
  DrawCmd,
  { op: 'rect' | 'outline' | 'line' | 'disc' | 'circle' | 'sprite' }
>

const SHAPE_OPS = new Set(['rect', 'outline', 'line', 'disc', 'circle', 'sprite'])

export const isShape = (cmd: DrawCmd): cmd is ShapeCmd => SHAPE_OPS.has(cmd.op)

/** Receives one axis-aligned rectangle of lit pixels, in pixel coordinates. */
export type RectSink = (x: number, y: number, w: number, h: number) => void

const ok = (...ns: number[]): boolean => ns.every((n) => Number.isFinite(n))

/** Nothing on a real field is this big; the caps exist so a bad number
 *  costs a blank shape rather than a hung frame. */
const MAX_STEPS = 4096
const MAX_R = 2048
const MAX_SPRITE = 256
const MAX_SCALE = 64

/**
 * THE ONE GEOMETRY.
 *
 * Every shape — on screen and in the test model alike — is decomposed here
 * into flat, axis-aligned rectangles of lit pixels. The canvas painter turns
 * each one into a device-snapped `fillRect`; `rasterizePixels` below turns
 * each one into cells of the integer model. Because both consume this single
 * function, a game cannot be geometrically right in a test and wrong on
 * screen: there is only one geometry to be right about.
 *
 * Rectangles come out with FRACTIONAL positions and INTEGRAL pixel extents.
 * That split is the whole look: the pattern of pixels is quantized (blocky by
 * construction) while where the pattern sits is not (motion stays smooth).
 */
export function eachRect(cmd: ShapeCmd, out: RectSink): void {
  switch (cmd.op) {
    case 'rect':
      if (!ok(cmd.x, cmd.y, cmd.w, cmd.h)) return
      if (cmd.w <= 0 || cmd.h <= 0) return
      out(cmd.x, cmd.y, cmd.w, cmd.h)
      return

    case 'outline': {
      if (!ok(cmd.x, cmd.y, cmd.w, cmd.h, cmd.t)) return
      const { x, y, w, h } = cmd
      if (w <= 0 || h <= 0) return
      const t = Math.max(1, Math.round(cmd.t))
      // Walls that meet in the middle are just a filled rectangle. Cheaper
      // than four overlapping bars and, more to the point, it never leaves a
      // one-pixel seam down the centre.
      if (t * 2 >= w || t * 2 >= h) {
        out(x, y, w, h)
        return
      }
      out(x, y, w, t)                       // top
      out(x, y + h - t, w, t)               // bottom
      out(x, y + t, t, h - t * 2)           // left
      out(x + w - t, y + t, t, h - t * 2)   // right
      return
    }

    case 'line': {
      if (!ok(cmd.x, cmd.y, cmd.x2, cmd.y2)) return
      // The WALK is integral — that is what makes a line blocky — and the
      // fractional part of the start is added back to every pixel, so a
      // moving line still glides.
      const sx = Math.round(cmd.x)
      const sy = Math.round(cmd.y)
      const ex = Math.round(cmd.x2)
      const ey = Math.round(cmd.y2)
      const offX = cmd.x - sx
      const offY = cmd.y - sy
      const dx = Math.abs(ex - sx)
      const dy = Math.abs(ey - sy)
      if (Math.max(dx, dy) > MAX_STEPS) return

      const stepX = sx < ex ? 1 : -1
      const stepY = sy < ey ? 1 : -1
      let x = sx
      let y = sy
      let err = dx - dy

      const pts: number[][] = []
      for (;;) {
        pts.push([x, y])
        if ((x === ex && y === ey) || pts.length > MAX_STEPS) break
        const e2 = err * 2
        if (e2 > -dy) { err -= dy; x += stepX }
        if (e2 < dx) { err += dx; y += stepY }
      }

      // Consecutive pixels on the same row become ONE rectangle, so a
      // horizontal line is a single fill rather than hundreds of them.
      let i = 0
      while (i < pts.length) {
        const row = pts[i]![1]!
        let j = i
        while (
          j + 1 < pts.length &&
          pts[j + 1]![1] === row &&
          Math.abs(pts[j + 1]![0]! - pts[j]![0]!) === 1
        ) j += 1
        const from = Math.min(pts[i]![0]!, pts[j]![0]!)
        out(from + offX, row + offY, j - i + 1, 1)
        i = j + 1
      }
      return
    }

    case 'disc':
    case 'circle': {
      if (!ok(cmd.x, cmd.y, cmd.r)) return
      const r = Math.min(Math.abs(cmd.r), MAX_R)
      const half = Math.round(r)
      if (half < 1) return
      // Vertical radius is scaled by the pixel aspect, so a `disc` reads as a
      // circle on screen even though a logical pixel is taller than it is
      // wide. `r` is therefore the HORIZONTAL radius, always.
      const ry = Math.max(1, Math.round(r * PIXEL_ASPECT))
      const denom = ry + 0.5

      // Half-width of each row, top to bottom. One pass, reused by both ops.
      const rows: number[] = []
      for (let j = -ry; j <= ry; j++) {
        rows.push(Math.round(r * Math.sqrt(Math.max(0, 1 - (j / denom) ** 2))))
      }

      const span = (i: number, from: number, to: number): void => {
        out(cmd.x + from - 0.5, cmd.y + (i - ry) - 0.5, to - from + 1, 1)
      }

      for (let i = 0; i < rows.length; i++) {
        const hw = rows[i]!
        if (cmd.op === 'disc') { span(i, -hw, hw); continue }
        // A ring: every pixel of the row that the rows above and below do not
        // both already cover, plus the two end caps.
        const up = rows[i - 1]
        const dn = rows[i + 1]
        if (up === undefined || dn === undefined) { span(i, -hw, hw); continue }
        const innerFrom = Math.max(-hw + 1, -up, -dn)
        const innerTo = Math.min(hw - 1, up, dn)
        if (innerFrom > innerTo) { span(i, -hw, hw); continue }
        span(i, -hw, innerFrom - 1)
        span(i, innerTo + 1, hw)
      }
      return
    }

    case 'sprite': {
      if (!ok(cmd.x, cmd.y, cmd.scale)) return
      const scale = Math.max(1, Math.min(MAX_SCALE, Math.floor(cmd.scale)))
      if (!Number.isFinite(cmd.scale) || cmd.scale < 1) return
      const src = cmd.rows.slice(0, MAX_SPRITE)
      if (src.length === 0) return
      const width = Math.min(MAX_SPRITE, Math.max(...src.map((r) => r.length)))
      if (width === 0) return

      for (let j = 0; j < src.length; j++) {
        // Ragged rows are padded to the sprite's full width, so a mirror
        // reflects the bitmap the author drew rather than each row's own
        // length — otherwise short rows slide sideways when flipped.
        const raw = (src[cmd.flipY ? src.length - 1 - j : j] ?? '').padEnd(width, ' ')
        const row = cmd.flipX ? [...raw].reverse() : [...raw]
        let run = 0
        for (let i = 0; i <= width; i++) {
          const on = i < width && row[i] !== ' ' && row[i] !== undefined
          if (on) { run += 1; continue }
          if (run > 0) {
            out(cmd.x + (i - run) * scale, cmd.y + j * scale, run * scale, scale)
            run = 0
          }
        }
      }
      return
    }
  }
}

// ---- the integer pixel model -------------------------------------------

/** One lit pixel's tone, or `null` for background. */
export type PixelGrid = (Tone | null)[][]

const blankPixels = (w: number, h: number): PixelGrid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => null))

/**
 * Host-side, pure. Turns a command buffer into the integer PIXEL model, the
 * same way `rasterize` turns one into the integer CHARACTER model.
 *
 * This is what a shape-drawing cartridge's snapshot tests compare, and it is
 * deliberately at the full resolution of the field: a coarser model could
 * hide a real error, which is exactly the test/screen divergence this project
 * has paid for three times already. Character ops are ignored here and shape
 * ops are ignored by `rasterize`; neither model pretends to hold the other's
 * ops, because characters are not pixels.
 *
 * Edges round to the nearest whole pixel, precisely as the painter rounds
 * them to the nearest whole DEVICE pixel — the same rule, one quantization
 * step coarser.
 */
export function rasterizePixels(
  cmds: DrawCmd[],
  w: number,
  h: number,
): PixelGrid {
  let px = blankPixels(w, h)

  for (const cmd of cmds) {
    if (cmd.op === 'clear') { px = blankPixels(w, h); continue }
    if (!isShape(cmd)) continue
    const { tone } = cmd
    eachRect(cmd, (x, y, rw, rh) => {
      const x0 = Math.max(0, Math.round(x))
      const y0 = Math.max(0, Math.round(y))
      const x1 = Math.min(w, Math.round(x + rw))
      const y1 = Math.min(h, Math.round(y + rh))
      for (let j = y0; j < y1; j++) {
        const row = px[j]
        if (!row) continue
        for (let i = x0; i < x1; i++) row[i] = tone
      }
    })
  }
  return px
}

/** The pixel model as art: `#` for a lit pixel, `.` for background. */
export function pixelArt(px: PixelGrid, on = '#', off = '.'): string {
  return px.map((row) => row.map((t) => (t ? on : off)).join('')).join('\n')
}
