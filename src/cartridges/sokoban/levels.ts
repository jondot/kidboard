/**
 * THE PUZZLES, and the reason they are hand-written.
 *
 * A generated Sokoban is a famous way to produce boards that are technically
 * solvable and joyless: the generator has no idea which of its rooms teaches
 * something. These eight are written in order, and each one is the smallest
 * board that can teach exactly one new fact.
 *
 *   1. a crate moves when you walk into it
 *   2. you must get BEHIND a crate to push it the other way
 *   3. two crates, so the order you do them in starts to matter
 *   4. a crate in a corner is stuck forever — met here in a room where it is
 *      obvious, and survivable, rather than on level six
 *   5. a corridor: the long way round is the only way round
 *   6. three crates and a choice
 *   7. the first board where a wrong first push costs the level
 *   8. a real little puzzle
 *
 * They are TINY on purpose. A six-year-old reads a 7x6 room at a glance and a
 * 12x10 one not at all, and the fun of Sokoban has never been in its size.
 *
 * THE NOTATION is the one every Sokoban file has used since 1982, so a level
 * pasted from anywhere works and a level written here reads as what it is:
 *
 *   `#` wall   ` ` floor   `.` target   `$` crate
 *   `@` you    `*` crate already on a target   `+` you, standing on a target
 *
 * Plain data and plain functions: no DOM, no randomness, nothing a sandbox
 * would object to hosting.
 */

export const LEVELS: readonly string[][] = [
  // 1. Walk into it and it moves. One crate, one target, nothing to get wrong.
  [
    '#######',
    '#     #',
    '# @$ .#',
    '#     #',
    '#######',
  ],
  // 2. The target is BEHIND you. You cannot pull, so you must walk around.
  [
    '#######',
    '#  .  #',
    '#  $  #',
    '#  @  #',
    '#     #',
    '#######',
  ],
  // 3. Two crates, and they are done one at a time.
  [
    '########',
    '#      #',
    '# $  . #',
    '#  @   #',
    '# $  . #',
    '#      #',
    '########',
  ],
  // 4. Corners. The room is open enough that a careless push puts the crate
  //    in the top-right corner and stuck there forever — which is the point:
  //    it happens early, on a board with one crate, while U is still new.
  [
    '#######',
    '#.    #',
    '#     #',
    '#  $  #',
    '#  @  #',
    '#     #',
    '#######',
  ],
  // 5. A wall down the middle with one gap in it. Everything has to go
  //    through the gap, which is the first time the room itself is in the way.
  [
    '#########',
    '#   #   #',
    '# $ # $ #',
    '#@      #',
    '#   # . #',
    '#   #  .#',
    '#########',
  ],
  // 6. Three crates and a choice about which to start with.
  [
    '########',
    '#  ..  #',
    '# $$$  #',
    '#  @  .#',
    '#      #',
    '########',
  ],
  // 7. Two rooms with one doorway, and a crate standing in it. The doorway
  //    can only be cleared one way, so the order is forced — which is how a
  //    child meets "the order matters" before having to work it out.
  [
    '########',
    '#   #  #',
    '# $ # .#',
    '# @ $  #',
    '#   #  #',
    '#  .#  #',
    '########',
  ],
  // 8. Three crates, two rooms and one doorway. The last one before the set
  //    starts again from the beginning.
  [
    '#########',
    '#   #   #',
    '# $ # . #',
    '# @$    #',
    '# . # $ #',
    '#   #  .#',
    '#########',
  ],
]

export type Board = {
  readonly w: number
  readonly h: number
  /** `true` where a wall stands. Never changes while a level is played. */
  readonly wall: boolean[]
  /** `true` where a crate must end up. Never changes either. */
  readonly goal: boolean[]
  /** `true` where a crate is now. This is the half that moves. */
  crate: boolean[]
  x: number
  y: number
}

const at = (b: { w: number }, x: number, y: number): number => y * b.w + x

/** Reads one level's rows into a board. Ragged rows are padded with wall. */
export function parse(rows: readonly string[]): Board {
  const w = Math.max(1, ...rows.map((r) => r.length))
  const h = rows.length
  const wall = new Array<boolean>(w * h).fill(true)
  const goal = new Array<boolean>(w * h).fill(false)
  const crate = new Array<boolean>(w * h).fill(false)
  let x = 0
  let y = 0
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < w; rx++) {
      const ch = row[rx] ?? '#'
      const i = ry * w + rx
      wall[i] = ch === '#'
      if (ch === '.' || ch === '*' || ch === '+') goal[i] = true
      if (ch === '$' || ch === '*') crate[i] = true
      if (ch === '@' || ch === '+') { x = rx; y = ry }
    }
  })
  return { w, h, wall, goal, crate, x, y }
}

/** Every crate standing on a target. */
export function solved(b: Board): boolean {
  return b.crate.every((c, i) => !c || b.goal[i])
}

/** What one step does, without doing it. */
export type Move = { moved: boolean; pushed: boolean }

/**
 * Walks one cell, pushing at most one crate.
 *
 * MUTATES the board and returns what happened, because the caller needs to
 * know whether to make a noise and whether the level is now finished. A step
 * into a wall, or into a crate with something behind it, changes nothing and
 * reports `moved: false` — there is no illegal state to get into and nothing
 * to validate afterwards.
 */
export function step(b: Board, dx: number, dy: number): Move {
  const nx = b.x + dx
  const ny = b.y + dy
  if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) return { moved: false, pushed: false }
  const n = at(b, nx, ny)
  if (b.wall[n]) return { moved: false, pushed: false }

  if (b.crate[n]) {
    const bx = nx + dx
    const by = ny + dy
    if (bx < 0 || by < 0 || bx >= b.w || by >= b.h) return { moved: false, pushed: false }
    const beyond = at(b, bx, by)
    // A crate will not go through a wall and will not go through another
    // crate. Sokoban's whole difficulty is that this is the only rule.
    if (b.wall[beyond] || b.crate[beyond]) return { moved: false, pushed: false }
    b.crate[n] = false
    b.crate[beyond] = true
    b.x = nx
    b.y = ny
    return { moved: true, pushed: true }
  }

  b.x = nx
  b.y = ny
  return { moved: true, pushed: false }
}

/** A copy that can be handed back to `restore` later. */
export function snapshot(b: Board): { crate: boolean[]; x: number; y: number } {
  return { crate: [...b.crate], x: b.x, y: b.y }
}

export function restore(b: Board, s: { crate: boolean[]; x: number; y: number }): void {
  b.crate = [...s.crate]
  b.x = s.x
  b.y = s.y
}
