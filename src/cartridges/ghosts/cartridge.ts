import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * GHOSTS — eat the dots, and mind the two that are looking for you.
 *
 * THE GAP THIS FILLS. It is the most famous game of the era and the box did
 * not have it. `maze` is the only other game here with corridors, and it is a
 * different verb entirely: `maze` is a walk you take one step at a time and
 * nothing in it is moving but you. This one never stops moving, and the maze
 * is not the puzzle — the maze is the board, and what is on it is the game.
 *
 * WHY THE AI IS THE WHOLE RISK, AND WHAT WAS DONE ABOUT IT. `tanks` was
 * removed from this box precisely because a computer player that does nothing
 * legible is indistinguishable from a broken one. Four ghosts with four
 * personalities is the trap in the same shape: a child cannot tell four kinds
 * of stupid apart, and four pursuers on a nine-by-seven board is not a chase,
 * it is a net.
 *
 * So there are TWO ghosts and each one is a sentence a child could say out
 * loud after a minute of watching:
 *
 *   the CHASER    at every corner it turns towards you. It is the reason
 *                 standing still is never the answer.
 *   the WANDERER  at every corner it picks a way at random. It is the reason
 *                 the chaser is not the only thing to look at, and it is the
 *                 one that turns up where nobody was expecting it.
 *
 * Legible beats clever. A ghost whose next turn a five-year-old can predict
 * is a ghost they can beat, and beating it is the point.
 *
 * WHAT WAS MADE KINDER THAN THE ARCADE, learned from frogger:
 *
 *   - Both ghosts are SLOWER than the child. You can always out-run them in
 *     a straight corridor; corners are what cost you.
 *   - Nothing is ever taken back. Being caught puts the child back at the
 *     bottom of the board with every dot they have already eaten still
 *     eaten. There is no lives count, nothing resets, and the board can only
 *     ever get emptier.
 *   - Nothing speeds up as the board empties. `frogger` used to get hardest
 *     exactly when a child was closest to finishing, which is the worst
 *     possible place to put the difficulty.
 *   - The second ghost stays in its alcove for the first few seconds of
 *     every round, in plain sight, so the board always opens calm.
 *
 * THE FILL RULE, doing its usual work:
 *
 *   the walls   HOLLOW blocks — outlined, not filled. They are the world.
 *   the child   the only SOLID figure on the board, with a mouth that opens
 *               and shuts as it goes. There is never any doubt which one is
 *               being steered.
 *   a ghost     HOLLOW, with two eyes, and the same height as the child so
 *               it is plainly a person-shaped thing rather than scenery.
 *   a dot       a small SOLID pip; a big dot is the same pip, much larger.
 *               Size, not colour, and the size is the promise.
 *   a scared    the same hollow ghost with its EYES GONE and a flat mouth
 *   ghost       where they were, blinking when the moment is nearly up. It
 *               is also, unmistakably, running away — which is the cue that
 *               actually lands.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/**
 * THE BOARD, written out. Nine by seven, which is the size `maze` settled on
 * for the same reason: a small board a child can see the shape of beats a big
 * one they have to scan. The arcade's was 28 by 31 and that is a map, not a
 * picture.
 *
 *   #  wall        o  big dot      G  where the ghosts wait
 *   .  dot         P  where the child starts
 *
 * Left-to-right symmetrical, and the middle row runs off both edges: walking
 * out of one side brings you back in at the other. The tunnel is the one
 * thing on the board that is pure delight rather than tactics, and it is the
 * first thing every child finds.
 */
const ROWS = [
  'o...#...o',
  '.##.#.##.',
  '.........',
  '.#.#G#.#.',
  '.........',
  '.##.#.##.',
  'o...P...o',
] as const

const GW = ROWS[0]!.length
const GH = ROWS.length
/** The row that runs off both edges and back on. */
const TUNNEL = 3

/** Cells per second. The child is faster than either ghost, always. */
const PAC_SPEED = 3.1
const GHOST_SPEED = 2.2
const SCARED_SPEED = 1.4

/** How long a big dot lasts, and how long it blinks before it runs out. */
const POWER_SECS = 7
const POWER_BLINK = 2
/** Seconds a ghost waits in its alcove: the first leaves at once, the second
 *  a few seconds later, so the board always opens calm. */
const RELEASE = [0, 4.5]
/** …and how long an eaten one sits there before coming back out. */
const EATEN_WAIT = 2.5

/** How near counts as touching, in cells. */
const TOUCH = 0.55

type Dir = { x: number; y: number }
const DIRS: Dir[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
const STOP: Dir = { x: 0, y: 0 }

/**
 * A thing on the board, always travelling FROM one cell TO its neighbour.
 * `t` is how far along it is, 0 to 1. Positions are therefore always exact
 * at a cell and interpolated in between, which is what keeps a mover on the
 * lattice without ever making its motion look stepped.
 */
type Mover = { cx: number; cy: number; d: Dir; t: number }

const wrapX = (cx: number): number => ((cx % GW) + GW) % GW

/** Is the cell walkable? Off the top or bottom is never; off the sides is
 *  only on the tunnel row, where it means the other side. */
const open = (cx: number, cy: number): boolean => {
  if (cy < 0 || cy >= GH) return false
  if ((cx < 0 || cx >= GW) && cy !== TUNNEL) return false
  return ROWS[cy]![wrapX(cx)] !== '#'
}

/** The cell one step away, already wrapped, or null if that is a wall. */
const stepTo = (cx: number, cy: number, d: Dir): { x: number; y: number } | null =>
  open(cx + d.x, cy + d.y) ? { x: wrapX(cx + d.x), y: cy + d.y } : null

/** True when this step leaves the board and comes back on the far side. */
const wraps = (cx: number, cy: number, d: Dir): boolean =>
  cy === TUNNEL && (cx + d.x < 0 || cx + d.x >= GW)

const moving = (m: Mover): boolean => m.d.x !== 0 || m.d.y !== 0

/** Where a mover is, in cell coordinates. Fractional, and that is the point. */
const posOf = (m: Mover): { x: number; y: number } =>
  ({ x: m.cx + m.d.x * m.t, y: m.cy + m.d.y * m.t })

/** Distance between two board positions, the short way round the tunnel. */
const apart = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  let dx = a.x - b.x
  if (dx > GW / 2) dx -= GW
  if (dx < -GW / 2) dx += GW
  return Math.hypot(dx, a.y - b.y)
}

// ---- the pictures --------------------------------------------------------
//
// All 11 x 7, drawn at double size, which is the house minimum for a bitmap
// of a *thing* and lands the child at about a tenth of the board's width —
// the same figure `maze` walks home.

/** Mouth open, facing right. `flipX` faces it left. */
const PAC_OPEN_H = [
  '  #######  ',
  ' ######### ',
  '########   ',
  '######     ',
  '########   ',
  ' ######### ',
  '  #######  ',
]
/** Mouth open, facing up. `flipY` faces it down. */
const PAC_OPEN_V = [
  '  ##   ##  ',
  ' ###   ### ',
  '##### #####',
  '###########',
  ' ######### ',
  '  #######  ',
  '   #####   ',
]
/** Mid-chomp: no mouth at all, in any direction. */
const PAC_SHUT = [
  '  #######  ',
  ' ######### ',
  '###########',
  '###########',
  '###########',
  ' ######### ',
  '  #######  ',
]

/** Hollow, with eyes, and a scalloped hem. */
const GHOST = [
  '   #####   ',
  '  #     #  ',
  ' # #   # # ',
  ' #       # ',
  ' #       # ',
  ' #       # ',
  ' ## # # ## ',
]
/** The same ghost with its eyes gone and a flat mouth where they were. */
const GHOST_SCARED = [
  '   #####   ',
  '  #     #  ',
  ' #       # ',
  ' #       # ',
  ' # ##### # ',
  ' #       # ',
  ' ## # # ## ',
]
const ART_W = 11
const ART_H = 7

/** How far the child travels between one chomp and the next, in cells. */
const CHOMP = 0.34

type Ghost = {
  m: Mover
  kind: 'chaser' | 'wanderer'
  /** Seconds left in the alcove. Nothing about it moves or touches while > 0. */
  wait: number
  scared: boolean
}

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'ghosts',
  triggers: {
    en: ['ghosts', 'dots'],
    he: ['רוחות', 'נקודות'],
    emoji: ['👻'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: '← ↑ → ↓', label: t('ghosts.move') }],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    const findCell = (ch: string): { x: number; y: number } => {
      for (let y = 0; y < GH; y++) {
        const x = ROWS[y]!.indexOf(ch)
        if (x >= 0) return { x, y }
      }
      return { x: 0, y: 0 }
    }
    const START = findCell('P')
    const HOUSE = findCell('G')

    /** 0 nothing, 1 a dot, 2 a big dot. One row per board row. */
    let food: number[][] = []
    const fill = (): void => {
      food = ROWS.map((row) =>
        [...row].map((ch) => (ch === '.' ? 1 : ch === 'o' ? 2 : 0)))
    }
    const foodLeft = (): boolean => food.some((row) => row.some((f) => f > 0))

    const pac: Mover = { cx: START.x, cy: START.y, d: STOP, t: 0 }
    /** The direction the child has asked for, kept until it can be taken. */
    let want: Dir = STOP
    /** Which way the child is facing while stopped, so the picture never
     *  loses its mouth. */
    let face: Dir = { x: -1, y: 0 }
    let chomp = 0

    let ghosts: Ghost[] = []
    let power = 0
    let done: 'caught' | 'clear' | null = null
    let holdT = HOLD_IGNORE

    // What the souvenir is made of: four yes/no memories, never a count.
    let ateAny = false
    let atePower = false
    let ateGhost = false
    let cleared = false

    const newGhosts = (): Ghost[] => ([
      { m: { cx: HOUSE.x, cy: HOUSE.y, d: STOP, t: 0 }, kind: 'chaser', wait: RELEASE[0]!, scared: false },
      { m: { cx: HOUSE.x, cy: HOUSE.y, d: STOP, t: 0 }, kind: 'wanderer', wait: RELEASE[1]!, scared: false },
    ])

    /** Everyone back where they started. The board is NOT refilled: a child
     *  who has eaten half the dots keeps every one of them. */
    const regroup = (): void => {
      pac.cx = START.x
      pac.cy = START.y
      pac.d = STOP
      pac.t = 0
      want = STOP
      face = { x: -1, y: 0 }
      ghosts = newGhosts()
      power = 0
      done = null
    }

    const restart = (): void => {
      fill()
      regroup()
    }

    fill()
    ghosts = newGhosts()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /** The ways out of a cell, minus the way we came, unless that is the
     *  only one — which is what stops a ghost jittering on the spot. */
    const choices = (m: Mover): Dir[] => {
      const all = DIRS.filter((d) => stepTo(m.cx, m.cy, d) !== null)
      const on = all.filter((d) => !(d.x === -m.d.x && d.y === -m.d.y))
      return on.length > 0 ? on : all
    }

    /**
     * The way out of this cell that gets nearest to `to` — or, when `away`,
     * furthest from it. `DIRS` is walked in a fixed order and a tie keeps the
     * first, so the chaser's next turn is the same every time it is in the
     * same place. That determinism IS the design: a ghost a child can predict
     * is a ghost a child can beat, and a randomised tie-break would have made
     * the chaser read as a second wanderer.
     */
    const nearest = (from: Mover, to: { x: number; y: number }, away: boolean): Dir => {
      const opts = choices(from)
      if (opts.length === 0) return STOP
      let best = opts[0]!
      let bestD = away ? -Infinity : Infinity
      for (const d of opts) {
        const gap = apart(stepTo(from.cx, from.cy, d)!, to)
        if (away ? gap > bestD : gap < bestD) { bestD = gap; best = d }
      }
      return best
    }

    const eatAt = (cx: number, cy: number): void => {
      const f = food[cy]?.[cx] ?? 0
      if (f === 0) return
      food[cy]![cx] = 0
      ateAny = true
      if (f === 2) {
        atePower = true
        power = POWER_SECS
        for (const g of ghosts) if (g.wait <= 0) g.scared = true
        ctx.audio.hit('tom')
      } else {
        // Two pitches, alternating: the sound a mouth makes going along.
        ctx.audio.note(chomp % 2 < 1 ? 400 : 520, 30)
      }
      if (!foodLeft()) {
        cleared = true
        done = 'clear'
        holdT = 0
        ctx.audio.note(660, 110)
        ctx.audio.note(880, 110)
        ctx.audio.note(1050, 190)
      }
    }

    /** Walks a mover forward, letting `arrive` pick the next way at each cell. */
    const advance = (m: Mover, dist: number, arrive: (m: Mover) => void): void => {
      if (!moving(m)) return
      m.t += dist
      let guard = 0
      while (m.t >= 1 && guard++ < 8) {
        const step = stepTo(m.cx, m.cy, m.d)!
        m.cx = step.x
        m.cy = step.y
        m.t -= 1
        arrive(m)
        if (!moving(m)) { m.t = 0; return }
      }
    }

    const bump = (): void => {
      done = 'caught'
      holdT = 0
      ctx.audio.hit('kick')
      ctx.audio.hit('snare')
    }

    return {
      onKey(k) {
        if (done) {
          if (holdT < HOLD_IGNORE) return
          if (done === 'clear') restart()
          else regroup()
          return
        }
        const d =
          k.key === 'ArrowLeft' ? { x: -1, y: 0 }
            : k.key === 'ArrowRight' ? { x: 1, y: 0 }
              : k.key === 'ArrowUp' ? { x: 0, y: -1 }
                : k.key === 'ArrowDown' ? { x: 0, y: 1 }
                  : null
        if (!d) return
        want = d
        face = d

        // Turning back the way you came happens THERE AND THEN, wherever you
        // are in a corridor. Everything else waits for a corner. This is the
        // one piece of the arcade's feel that cannot be left out: a child who
        // sees a ghost ahead and presses back must turn round now, not at the
        // next junction, which by then is behind the ghost.
        if (moving(pac) && d.x === -pac.d.x && d.y === -pac.d.y) {
          const step = stepTo(pac.cx, pac.cy, pac.d)!
          pac.cx = step.x
          pac.cy = step.y
          pac.t = 1 - pac.t
          pac.d = d
          return
        }
        // Just left a cell? Step back into it and take the new way. Without
        // this a turn only lands if the key is pressed in the exact frame the
        // child crosses a junction, and a six-year-old never manages that.
        if (pac.t < 0.3 && stepTo(pac.cx, pac.cy, d)) {
          pac.d = d
          pac.t = 0
          return
        }
        if (!moving(pac) && stepTo(pac.cx, pac.cy, d)) {
          pac.d = d
          pac.t = 0
        }
      },

      tick(dt) {
        if (done) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        if (power > 0) {
          power = Math.max(0, power - dt)
          if (power === 0) for (const g of ghosts) g.scared = false
        }

        advance(pac, PAC_SPEED * dt, (m) => {
          eatAt(m.cx, m.cy)
          if (done) return
          // The asked-for way if it is there, otherwise straight on, and a
          // dead end simply stops. `want` is kept rather than cleared, so a
          // key pressed a whole corridor early still turns at the corner.
          if ((want.x !== 0 || want.y !== 0) && stepTo(m.cx, m.cy, want)) m.d = want
          else if (!stepTo(m.cx, m.cy, m.d)) m.d = STOP
        })
        // The mouth is driven by DISTANCE, not by time: it opens and shuts
        // as the child goes along and holds still when they hold still.
        if (moving(pac)) chomp += PAC_SPEED * dt
        if (done) return

        const pp = posOf(pac)

        for (const g of ghosts) {
          if (g.wait > 0) {
            g.wait -= dt
            if (g.wait <= 0) {
              g.m = { cx: HOUSE.x, cy: HOUSE.y, d: { x: 0, y: -1 }, t: 0 }
              g.scared = power > 0
            }
            continue
          }
          if (!moving(g.m)) {
            const opts = choices(g.m)
            if (opts.length > 0) g.m.d = opts[0]!
          }
          const speed = g.scared ? SCARED_SPEED : GHOST_SPEED
          advance(g.m, speed * dt, (m) => {
            m.d = g.scared
              ? nearest(m, pp, true)
              : g.kind === 'chaser'
                ? nearest(m, pp, false)
                : ctx.rng.pick(choices(m))
          })

          if (apart(posOf(g.m), pp) < TOUCH) {
            if (g.scared) {
              ateGhost = true
              g.scared = false
              g.wait = EATEN_WAIT
              g.m = { cx: HOUSE.x, cy: HOUSE.y, d: STOP, t: 0 }
              ctx.audio.note(520, 70)
              ctx.audio.note(700, 70)
              ctx.audio.note(920, 110)
            } else {
              bump()
              return
            }
          }
        }
      },

      draw(c) {
        refit(c)
        c.clear()

        const cw = stage.w / GW
        const ch = stage.h / GH
        const T = Math.max(3, Math.round(ch * 0.14))
        const X = (cx: number): number => stage.x + cx * cw
        const Y = (cy: number): number => stage.y + cy * ch

        // ---- the maze ----------------------------------------------------
        //
        // A wall is a SOLID block, inset from every side that faces a
        // corridor and flush against every side it shares with another wall.
        // Two things fall out of that one rule. Islands merge with no seam
        // down the middle, so a two-cell wall is one block rather than two.
        // And the corridors come out visibly wider than the walls are thick,
        // which is the proportion this kind of board has always had — and the
        // reason the walls are not hollow: an outlined wall cell leaves a
        // hole bigger than the corridor beside it, and a child reads that
        // hole as somewhere to walk.
        //
        // `maze` fills its walls for the same reason, and pays the same
        // price: the world here is solid rather than hollow. What tells the
        // child from the board is not fill but SHAPE and SIZE — a small
        // round thing with a mouth, in the middle of a corridor, moving.
        const ix = cw * 0.20
        const iy = ch * 0.24
        const tx = Math.max(3, Math.round(ix))
        const ty = Math.max(3, Math.round(iy))
        const rail = (x: number, y: number, w: number, h: number): void => {
          if (w > 0 && h > 0) c.rect(x, y, w, h, INK)
        }
        rail(stage.x, stage.y, stage.w, ty)
        rail(stage.x, stage.y + stage.h - ty, stage.w, ty)
        // …with a gap on both sides of the tunnel row, which is the only way
        // off this board and back on to it.
        for (const rx of [stage.x, stage.x + stage.w - tx]) {
          rail(rx, stage.y, tx, Y(TUNNEL) - stage.y)
          rail(rx, Y(TUNNEL + 1), tx, stage.y + stage.h - Y(TUNNEL + 1))
        }
        for (let cy = 0; cy < GH; cy++) {
          for (let cx = 0; cx < GW; cx++) {
            if (ROWS[cy]![cx] !== '#') continue
            const l = open(cx - 1, cy) ? ix : 0
            const r = open(cx + 1, cy) ? ix : 0
            const t = open(cx, cy - 1) ? iy : 0
            const b = open(cx, cy + 1) ? iy : 0
            c.rect(X(cx) + l, Y(cy) + t, cw - l - r, ch - t - b, INK)
          }
        }

        // ---- the dots ----------------------------------------------------
        const pip = Math.max(2, Math.round(cw * 0.10))
        const big = Math.max(5, Math.round(cw * 0.22))
        for (let cy = 0; cy < GH; cy++) {
          for (let cx = 0; cx < GW; cx++) {
            const f = food[cy]![cx]!
            if (f === 0) continue
            c.disc(X(cx + 0.5), Y(cy + 0.5), f === 2 ? big : pip, INK)
          }
        }

        const scale = Math.max(1, Math.floor(Math.min(cw / ART_W, ch / ART_H)))
        const aw = ART_W * scale
        const ah = ART_H * scale

        /** Draws a bitmap centred on a board position — twice while the thing
         *  is halfway through the tunnel, so it leaves one side exactly as
         *  fast as it arrives on the other. */
        const at = (
          m: Mover, rows: string[], opts: { flipX?: boolean; flipY?: boolean },
        ): void => {
          const put = (bx: number): void =>
            c.sprite(
              X(bx + 0.5) - aw / 2, Y(m.cy + m.d.y * m.t + 0.5) - ah / 2,
              rows, INK, { ...opts, scale },
            )
          put(m.cx + m.d.x * m.t)
          if (moving(m) && wraps(m.cx, m.cy, m.d)) {
            const far = wrapX(m.cx + m.d.x)
            put(far + m.d.x * (m.t - 1))
          }
        }

        for (const g of ghosts) {
          // The last couple of seconds of a big dot: the scared ghost blinks,
          // which is the only warning a child needs that it is nearly over.
          const blinking = g.scared && power < POWER_BLINK && Math.floor(power * 6) % 2 === 0
          if (blinking) continue
          at(g.m, g.scared ? GHOST_SCARED : GHOST, {})
        }

        // The child, last, so nothing is ever drawn over them.
        const d = moving(pac) ? pac.d : face
        // Open at rest, so a child who has not touched a key yet is still
        // plainly looking at a mouth rather than at a ball.
        const shut = chomp % (CHOMP * 2) >= CHOMP
        const rows = shut ? PAC_SHUT : d.y !== 0 ? PAC_OPEN_V : PAC_OPEN_H
        at(pac, rows, d.y !== 0 ? { flipY: d.y > 0 } : { flipX: d.x < 0 })

        // A conclusion is a ring, hollow, the same mark every game here uses.
        if (done) {
          const p = posOf(pac)
          const cx = X(p.x + 0.5)
          const cy = Y(p.y + 0.5)
          c.circle(cx, cy, cw * 0.55, INK)
          if (done === 'clear') c.circle(cx, cy, cw * 0.85, INK)
        }
      },

      souvenir: () => {
        if (cleared) return ctx.t('ghosts.souvenir.clear')
        if (ateGhost) return ctx.t('ghosts.souvenir.chased')
        if (atePower) return ctx.t('ghosts.souvenir.big')
        if (ateAny) return ctx.t('ghosts.souvenir.some')
        return ctx.t('ghosts.souvenir.none')
      },
    }
  },
}

export default cartridge
