import type { Rng } from '../../types'

/**
 * A perfect maze: every cell reachable from every other, by exactly one path.
 * That property is the whole reason for using a real generator instead of
 * scattering walls at random — a child can never be handed a maze with no way
 * home, and nothing anywhere has to check whether one exists.
 *
 * Walls are stored per boundary rather than per cell:
 *   `right[y][x]` — a wall between (x, y) and (x + 1, y)
 *   `down[y][x]`  — a wall between (x, y) and (x, y + 1)
 * The last row/column of each array is the outer border and stays walled.
 */
export type Maze = {
  cw: number
  ch: number
  right: boolean[][]
  down: boolean[][]
}

// ---- the maze in LOGICAL PIXELS -----------------------------------------
//
// A logical pixel is 0.6 as wide as it is tall, so a corridor that reads
// SQUARE is 28 across and 17 down, and a wall that carries the same weight
// on both axes is 4 across and 3 down. Everything below is pixels; nothing
// here knows about characters any more.
//
// The corridor is deliberately generous: it makes a 9 x 7 maze on a desktop
// rather than a 13 x 9 one, and a maze a 6-year-old can see the whole shape
// of is a better maze than a maze with more turns in it.
export const CORR_W = 28
export const CORR_H = 17
export const WALL_X = 4
export const WALL_Y = 3
/** Corner post to corner post. */
export const PITCH_W = CORR_W + WALL_X
export const PITCH_H = CORR_H + WALL_Y

/**
 * How many maze cells fit in a live pixel field. Sized against the field the
 * canvas reports this frame, never against a module constant — the drawn maze
 * is `PITCH_W * cw + WALL_X` by `PITCH_H * ch + WALL_Y` pixels, which always
 * fits inside pw x ph.
 */
export function mazeDims(pw: number, ph: number): { cw: number; ch: number } {
  return {
    cw: Math.max(2, Math.floor((pw - WALL_X) / PITCH_W)),
    ch: Math.max(2, Math.floor((ph - WALL_Y) / PITCH_H)),
  }
}

/** Pixel size of a drawn maze, wall to wall. */
export function mazeSize(m: Maze): { w: number; h: number } {
  return { w: PITCH_W * m.cw + WALL_X, h: PITCH_H * m.ch + WALL_Y }
}

const grid = (w: number, h: number): boolean[][] =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => true))

/**
 * Recursive backtracker (depth-first carving), seeded from the cartridge's
 * `ctx.rng` alone. It visits every cell exactly once and only ever removes a
 * wall onto an unvisited cell, so what comes out is a spanning tree of the
 * grid: connected — hence always solvable — and loop-free.
 */
export function generateMaze(rng: Rng, cw: number, ch: number): Maze {
  const right = grid(cw, ch)
  const down = grid(cw, ch)
  const seen = grid(cw, ch).map((row) => row.map(() => false))

  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const stack: [number, number][] = [[0, 0]]
  seen[0]![0] = true

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1]!

    // Shuffle the four directions with the seeded rng, then take the first
    // that leads somewhere unvisited.
    const order = [...steps]
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }

    let moved = false
    for (const [dx, dy] of order) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
      if (seen[ny]![nx]) continue
      if (dx === 1) right[y]![x] = false
      if (dx === -1) right[y]![nx] = false
      if (dy === 1) down[y]![x] = false
      if (dy === -1) down[ny]![x] = false
      seen[ny]![nx] = true
      stack.push([nx, ny])
      moved = true
      break
    }
    if (!moved) stack.pop()
  }

  return { cw, ch, right, down }
}

/** True when a child standing on (x, y) can walk one step by (dx, dy). */
export function canWalk(m: Maze, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= m.cw || ny >= m.ch) return false
  if (dx === 1) return !m.right[y]![x]
  if (dx === -1) return !m.right[y]![nx]
  if (dy === 1) return !m.down[y]![x]
  if (dy === -1) return !m.down[ny]![x]
  return false
}

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The maze as flat rectangles of wall, in pixels relative to its own top-left
 * corner. Horizontal walls are merged into runs along each boundary row, and
 * every vertical wall carries the corner posts above and below it — so a
 * corner is never a one-pixel seam, and a straight corridor wall is one
 * rectangle rather than a dotted line of them.
 *
 * Pure, and it draws nothing itself: the cartridge turns each rectangle into
 * one `c.rect`. No language ever reaches the canvas.
 */
export function wallRects(m: Maze): Rect[] {
  const out: Rect[] = []

  for (let k = 0; k <= m.ch; k++) {
    let run = -1
    const flush = (endJ: number): void => {
      if (run < 0) return
      out.push({
        x: run * PITCH_W,
        y: k * PITCH_H,
        w: (endJ - run) * PITCH_W + WALL_X,
        h: WALL_Y,
      })
      run = -1
    }
    for (let j = 0; j < m.cw; j++) {
      // The top and bottom boundaries are always walled; between two cells,
      // only where the wall survived the carving.
      const walled = k === 0 || k === m.ch ? true : m.down[k - 1]![j]!
      if (walled) { if (run < 0) run = j } else flush(j)
    }
    flush(m.cw)
  }

  for (let k = 0; k < m.ch; k++) {
    for (let j = 0; j <= m.cw; j++) {
      const walled = j === 0 || j === m.cw ? true : m.right[k]![j - 1]!
      if (walled) {
        out.push({ x: j * PITCH_W, y: k * PITCH_H, w: WALL_X, h: PITCH_H + WALL_Y })
      }
    }
  }

  return out
}
