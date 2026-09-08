import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * CASTLES — four corners, four walls, one ball, and only one of them is yours.
 *
 * WHY THIS AND NOT ANOTHER PADDLE GAME. `ball` and `bricks` already own the
 * paddle and the bounce, and this is not a third helping of them: it is the
 * one thing neither can be, which is a game with SOMEBODY ELSE IN IT. Three
 * other castles are being defended at the same time as yours, by paddles that
 * are visibly trying and visibly not very good at it, and the ball that just
 * came off your bat is on its way to one of them.
 *
 * WHY IT SURVIVES BEING PLAYED ALONE, when `tanks` did not. Combat's second
 * tank did nothing a child could distinguish from a broken one. Here there is
 * exactly ONE ball and it is always somewhere: every player in the game,
 * computer or not, is either about to be hit by it or watching it go. Nothing
 * about the picture depends on a second person being in the room.
 *
 * THE FILL RULE DOES ALL OF THE WORK, and it has more to do here than
 * anywhere else in this box — four of everything, and the child has to know
 * at a glance which four are theirs:
 *
 *   your bat        a THICK bar. Same length and same place as everybody
 *                   else's, and twice across.
 *   their bats      the same bar, THIN. Size rather than fill, and that is a
 *                   correction: they were drawn hollow first — two rails with
 *                   the arena showing between them — and a bat with a gap
 *                   down the middle of it says the ball can go through, which
 *                   is a lie about the one object in the game whose whole job
 *                   is stopping the ball. Nothing here is told apart by
 *                   anything a child could mistake for a rule.
 *   your king       SOLID. The one figure on the board that is filled in.
 *   their kings     HOLLOW, the same drawing. Plainly people, plainly not you.
 *   the walls       HOLLOW bricks, all four alike. They are world, and a
 *                   hollow wall visibly THINS as it comes apart, which a grid
 *                   of solid blocks does not (see `bricks` for the same
 *                   finding, arrived at the hard way).
 *   the ball        SOLID and round. The only thing on the board that is
 *                   nobody's.
 *
 * THE ARENA IS SQUARE ON PURPOSE. `stageOf` is asked for 1:1 rather than the
 * house 3:4..4:3, because four corners that are not the same shape as each
 * other is four different games. A logical pixel is 0.6 as wide as it is
 * tall, so a square arena is a WIDE block of pixels; the conversion lives in
 * `stageOf` and nowhere here.
 *
 * WHEN THE ROUND ENDS. When your king goes, or when yours is the last one
 * left. Being knocked out and left to watch the other three finish is dead
 * air, and dead air is the one thing a five-year-old will not sit through.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** Four corners, and the sign of each one's local axes. */
const CX = [0, 1, 0, 1]
const CY = [0, 0, 1, 1]
const SX = [1, -1, 1, -1]
const SY = [1, 1, -1, -1]
/** The child's own. Bottom left, where a left hand expects it. */
const MINE = 2

/** A brick cell, as a fraction of the arena. The wall is the band of cells
 *  whose `i + j` falls between the two layers below — nine bricks a castle,
 *  two deep on every approach. */
const B = 0.05
const LAYER_MIN = 3
const LAYER_MAX = 4
const BRICK_T = 2

/**
 * THE KING IS BEHIND THE WALL, AND THAT IS MEASURED IN THE WALL'S OWN UNITS.
 *
 * The wall is a band of CELLS (`i + j` between the two layers above); the
 * king's box is every cell INSIDE that band, `i + j < LAYER_MIN`. It used to
 * be a distance in arena fractions instead, and the mismatch left a hole you
 * could not see: a ball on the exact diagonal crossed a cell the band did not
 * cover, and arrived at a king it had never touched a brick to reach. A
 * castle fell in the first second of the round, with a wall that was still
 * completely intact drawn around it.
 *
 * The band is TWO layers thick, and that is what makes it airtight rather
 * than merely likely: the ball never moves a whole cell in one frame, so
 * `i + j` can fall by at most two between one look and the next, and falling
 * from outside the band to inside it without landing on either layer would
 * take three.
 */
const KING = [
  '#    #    #',
  '###  #  ###',
  '###########',
  '###########',
  ' ######### ',
  ' ######### ',
  '###########',
]
const KING_HOLLOW = [
  '#    #    #',
  '###  #  ###',
  '#         #',
  '#         #',
  ' #       # ',
  ' #       # ',
  '###########',
]
const KING_COLS = 11
const KING_ROWS = 7
const KING_AT = 0.055

/** The paddle rides the diagonal this far out from its corner. */
const D = 0.42
/** Half its length, in the diagonal's own units (which run -D .. D). */
const PADDLE_H = 0.075
/** How far off the diagonal counts as touching it. */
const PADDLE_T = 0.022
/** How far short of its diagonal's end the bat stops — far enough that the
 *  END BLOCK of the bar, which is drawn centred on the diagonal, still lands
 *  wholly inside the arena. */
const PADDLE_LIP = 0.06
/** The bat is drawn as this many overlapping blocks, this far across. */
const BAT_BLOCKS = 14
const BAT_THICK = 7
const BAT_THIN = 3
/** Diagonal-units per keypress, and per second for the other three. */
const PADDLE_STEP = 0.024
/**
 * Diagonal-units per second for the other three. Deliberately slower than the
 * ball can move along a diagonal, so they are plainly TRYING and plainly
 * beatable — a bat that never misses is a wall, and a wall is not an
 * opponent a child can beat.
 */
const AI_SPEED = 0.16
/**
 * ...and they aim a little off the middle, freshly each time the ball turns
 * their way. This is not flavour, it is what keeps the game from seizing up.
 *
 * The bat reflects around WHERE ON IT the ball landed, so a bat that parks
 * itself dead centre under the ball returns it at exactly the angle it
 * arrived. Three bats doing that in a symmetrical arena is a closed orbit:
 * measured, a round could run five minutes without a brick moving. Aiming
 * off-centre is also simply what a person does, and it is why these three
 * read as opponents rather than as walls with a delay.
 */
const AI_AIM = 0.40

/** The ball, in arena fractions and fractions per second. */
const BALL_R = 0.023
const BALL_SPEED = 0.72
/**
 * THE BALL GETS QUICKER, and this is what makes the round END.
 *
 * Four bats around a symmetrical arena are very good at their job: measured
 * before this existed, a round left alone lost four bricks in two minutes and
 * was heading nowhere. A ball that speeds up outruns the three computer bats
 * first — they are the slowest thing on the board — so the walls start coming
 * apart on their own, and no round can go on for ever.
 *
 * It RESETS to 1 whenever a brick falls or a castle goes, so the speed a
 * child actually plays at is the base one — the climb only ever happens while
 * nothing is happening, which is the only time nobody minds.
 */
const SPEED_CREEP = 0.02
const SPEED_CAP = 1.6

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'castles',
  triggers: {
    en: ['castles', 'warlords', 'kings'],
    he: ['טירות', 'מלכים'],
    emoji: ['🏰'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: '← →', label: t('castles.move') }],

  create(ctx) {
    // 1:1 rather than the house 3:4..4:3 — four corners have to be the same
    // shape as each other or they are four different games.
    const square = { min: 1, max: 1 }
    let stage = stageOf(COLS * 8, 18 * 8, square)

    /** Every brick cell of a castle, as `"i,j"`. */
    const wallCells: string[] = []
    for (let i = 0; i <= LAYER_MAX; i++) {
      for (let j = 0; j <= LAYER_MAX; j++) {
        const layer = i + j
        if (layer >= LAYER_MIN && layer <= LAYER_MAX) wallCells.push(`${i},${j}`)
      }
    }

    let walls: Set<string>[] = []
    let alive: boolean[] = []
    let paddles: number[] = []
    /** Where each computer bat is aiming, relative to the ball. */
    let bias = [0, 0, 0, 0]
    /** Whether the ball was last seen heading towards each castle. */
    let coming = [false, false, false, false]
    let bx = 0.5
    let by = 0.5
    let vx = 0
    let vy = 0
    /** Multiplies the ball's speed, and climbs while a round is running. */
    let urgency = 1
    let over: 'won' | 'fell' | null = null
    let holdT = HOLD_IGNORE
    let everBrick = false
    let everOutlasted = false
    let everWon = false

    const serve = (): void => {
      bx = 0.5
      by = 0.5
      const rx = ctx.rng.chance(0.5) ? 1 : -1
      const ry = ctx.rng.chance(0.5) ? 1 : -1
      vx = BALL_SPEED * 0.7071 * rx
      vy = BALL_SPEED * 0.7071 * ry
      urgency = 1
    }

    const fresh = (): void => {
      walls = [0, 1, 2, 3].map(() => new Set(wallCells))
      alive = [true, true, true, true]
      paddles = [0, 0, 0, 0]
      bias = [0, 0, 0, 0]
      coming = [false, false, false, false]
      over = null
      serve()
    }

    fresh()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph), square)
      if (!sameStage(s, stage)) stage = s
    }

    /** The ball, seen from castle `c`: distance out along each of its edges. */
    const uOf = (c: number, x = bx): number => SX[c]! * (x - CX[c]!)
    const vOf = (c: number, y = by): number => SY[c]! * (y - CY[c]!)

    /**
     * The far end of the bat's travel. It stops a little short of the end of
     * its own diagonal: the bar is drawn as several parallel lines slightly
     * blocks centred on the diagonal, so its end block reaches the arena's
     * edge half a block before the diagonal itself does. Without the margin,
     * a bat pushed all the way into its corner painted part of itself off the
     * board.
     */
    const qMax = D - PADDLE_H - PADDLE_LIP

    const finish = (how: 'won' | 'fell'): void => {
      over = how
      holdT = 0
      if (how === 'won') { everWon = true; everOutlasted = true }
      if (how === 'won') {
        ctx.audio.note(700, 110)
        ctx.audio.note(950, 170)
      } else {
        ctx.audio.hit('kick')
        ctx.audio.hit('snare')
      }
    }

    const topple = (c: number): void => {
      alive[c] = false
      urgency = 1
      ctx.audio.hit('tom')
      ctx.audio.note(300, 140)
      if (c === MINE) { finish('fell'); return }
      everOutlasted = true
      if (alive.filter(Boolean).length === 1) finish('won')
    }

    return {
      onKey(k) {
        if (over) {
          if (holdT < HOLD_IGNORE) return
          fresh()
          return
        }
        // Left is left: the child's castle is the bottom left one, so a
        // bigger `q` is a bigger `u`, which is further to the right.
        if (k.key === 'ArrowLeft') paddles[MINE] = Math.max(-qMax, paddles[MINE]! - PADDLE_STEP)
        else if (k.key === 'ArrowRight') paddles[MINE] = Math.min(qMax, paddles[MINE]! + PADDLE_STEP)
      },

      tick(dt) {
        if (over) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        // The other three follow the ball along their own diagonal, slowly
        // enough to be beatable and steadily enough to be plainly trying.
        for (let c = 0; c < 4; c++) {
          if (c === MINE || !alive[c]) continue
          const inbound = SX[c]! * vx + SY[c]! * vy < 0
          if (inbound && !coming[c]) bias[c] = (ctx.rng.float() - 0.5) * AI_AIM
          coming[c] = inbound
          const aim = uOf(c) - vOf(c) + bias[c]!
          const want = Math.max(-qMax, Math.min(qMax, aim))
          const step = AI_SPEED * dt
          const gap = want - paddles[c]!
          paddles[c] = paddles[c]! + Math.max(-step, Math.min(step, gap))
        }

        // ...and it settles back down the moment something DOES happen. So
        // during ordinary play the ball stays at the speed a six-year-old can
        // read, and only a stalemate ever winds it up.
        if (urgency < SPEED_CAP) urgency = Math.min(SPEED_CAP, urgency + SPEED_CREEP * dt)
        const speed = BALL_SPEED * urgency
        const now = Math.hypot(vx, vy) || speed
        vx = (vx / now) * speed
        vy = (vy / now) * speed

        bx += vx * dt
        by += vy * dt

        // The arena rails.
        if (bx < BALL_R) { bx = BALL_R; vx = Math.abs(vx); ctx.audio.note(440, 35) }
        if (bx > 1 - BALL_R) { bx = 1 - BALL_R; vx = -Math.abs(vx); ctx.audio.note(440, 35) }
        if (by < BALL_R) { by = BALL_R; vy = Math.abs(vy); ctx.audio.note(520, 35) }
        if (by > 1 - BALL_R) { by = 1 - BALL_R; vy = -Math.abs(vy); ctx.audio.note(520, 35) }

        for (let c = 0; c < 4; c++) {
          if (!alive[c]) continue
          const u = uOf(c)
          const v = vOf(c)
          const s = u + v
          const q = u - v

          // The paddle. A bat lying at 45 degrees reflects by swapping the
          // two velocity components and turning both round — which is the
          // whole of the arithmetic, once, rather than a page of it.
          if (Math.abs(s - D) < PADDLE_T + BALL_R && s < D + PADDLE_T) {
            if (Math.abs(q - paddles[c]!) < PADDLE_H + BALL_R) {
              const inward = SX[c]! * vx + SY[c]! * vy
              if (inward < 0) {
                // In the castle's own axes, where a bat lying at 45 degrees
                // reflects by swapping the two components and turning both
                // round. That is the whole of the arithmetic, written once.
                const du = SX[c]! * vx
                const dv = SY[c]! * vy
                const sp = Math.hypot(du, dv) || BALL_SPEED
                let ndu = -dv
                let ndv = -du

                /**
                 * WHERE ON THE BAT IT LANDED DECIDES WHERE IT GOES — the ends
                 * throw the ball out sideways, the middle sends it straight
                 * back. `bricks` earns the same line for the same reason, but
                 * here it is not a nicety, it is the only thing that makes
                 * the game finish.
                 *
                 * A plain 45-degree reflection maps a ball travelling at 45
                 * degrees to another ball travelling at 45 degrees. Serve one
                 * from the middle of a symmetrical arena and it traces a
                 * closed diamond that all four bats meet dead centre, for
                 * ever: no wall is ever reached, no brick is ever touched,
                 * and nothing on screen says that the game has stopped being
                 * a game. Two minutes of that was measured before this line
                 * existed.
                 */
                const off = (q - paddles[c]!) / PADDLE_H
                ndu += sp * 0.5 * off
                ndv -= sp * 0.5 * off

                // ...and it must still leave. A ball kicked almost parallel
                // to the bat would otherwise crawl along it.
                const outward = ndu + ndv
                if (outward < sp * 0.6) {
                  const lift = (sp * 0.6 - outward) / 2
                  ndu += lift
                  ndv += lift
                }
                const n = Math.hypot(ndu, ndv) || 1
                vx = SX[c]! * (ndu / n) * sp
                vy = SY[c]! * (ndv / n) * sp

                // Out past the bat, so one bounce cannot become two.
                const push = D + PADDLE_T + BALL_R - s
                bx += SX[c]! * push * 0.5
                by += SY[c]! * push * 0.5
                ctx.audio.note(c === MINE ? 660 : 520, 50)
                break
              }
            }
          }

          if (u < -BALL_R || v < -BALL_R || u > (LAYER_MAX + 1) * B || v > (LAYER_MAX + 1) * B) continue

          const i = Math.floor(Math.max(0, u) / B)
          const j = Math.floor(Math.max(0, v) / B)
          const cell = `${i},${j}`
          if (walls[c]!.has(cell)) {
            walls[c]!.delete(cell)
            if (c !== MINE) everBrick = true
            // Reflect off whichever face of the brick the ball is nearest —
            // a diagonal staircase needs the axis chosen, not assumed.
            const inU = Math.min(u - i * B, (i + 1) * B - u)
            const inV = Math.min(v - j * B, (j + 1) * B - v)
            // Put the ball fully OUTSIDE the brick it just took, on the axis
            // it bounced off. Nudging it by a fraction of its own radius left
            // it sitting in the rubble, and a ball sitting in the rubble eats
            // a whole wall in about a second — which turns one missed save
            // into a lost castle, when the three layers exist precisely so
            // that it costs bricks instead.
            if (inU < inV) {
              vx = -vx
              const outU = u < (i + 0.5) * B ? i * B - BALL_R : (i + 1) * B + BALL_R
              bx = CX[c]! + SX[c]! * outU
            } else {
              vy = -vy
              const outV = v < (j + 0.5) * B ? j * B - BALL_R : (j + 1) * B + BALL_R
              by = CY[c]! + SY[c]! * outV
            }
            ctx.audio.hit('hat')
            break
          }

          if (i + j < LAYER_MIN) {
            topple(c)
            // The ball carries on out of the corner it just emptied.
            vx = -vx
            vy = -vy
            break
          }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h
        /** A point in castle `k`'s own frame, in arena fractions. */
        const PX = (k: number, u: number): number => X(CX[k]! + SX[k]! * u)
        const PY = (k: number, v: number): number => Y(CY[k]! + SY[k]! * v)

        // The arena. Hollow, thin, world — and it has to be DRAWN: the ball
        // bounces off these four edges, and a ball bouncing off nothing at
        // all is the picture telling a child that the game is broken.
        c.outline(stage.x, stage.y, stage.w, stage.h, INK, 3)

        for (let k = 0; k < 4; k++) {
          if (!alive[k]) continue

          for (const cell of walls[k]!) {
            const [si, sj] = cell.split(',')
            const i = Number(si)
            const j = Number(sj)
            const x0 = Math.min(PX(k, i * B), PX(k, (i + 1) * B))
            const y0 = Math.min(PY(k, j * B), PY(k, (j + 1) * B))
            c.outline(x0 + 1, y0 + 1, B * stage.w - 2, B * stage.h - 2, INK, BRICK_T)
          }

          const scale = Math.max(1, Math.round((stage.w * 0.075) / KING_COLS))
          c.sprite(
            PX(k, KING_AT) - (KING_COLS * scale) / 2,
            PY(k, KING_AT) - (KING_ROWS * scale) / 2,
            k === MINE ? KING : KING_HOLLOW, INK, { scale },
          )

          // The bat: a run of blocks stepping along the diagonal, overlapping
          // so it reads as one bar. Thick for the child, thin for the other
          // three. Drawn as parallel LINES first, which came out as a hatched
          // smudge — a diagonal of one-pixel strokes offset by a pixel and a
          // half is a dotted stripe, not a bat.
          const q = paddles[k]!
          const thick = k === MINE ? BAT_THICK : BAT_THIN
          for (let n = 0; n <= BAT_BLOCKS; n++) {
            const along = q - PADDLE_H + (2 * PADDLE_H * n) / BAT_BLOCKS
            const bu = (D + along) / 2
            const bv = (D - along) / 2
            c.rect(PX(k, bu) - thick / 2, PY(k, bv) - thick / 2, thick, thick, INK)
          }
        }

        c.disc(X(bx), Y(by), BALL_R * stage.w, INK)

        if (over) {
          const cx = PX(MINE, KING_AT)
          const cy = PY(MINE, KING_AT)
          c.circle(cx, cy, stage.w * 0.07, INK)
          c.circle(cx, cy, stage.w * 0.095, INK)
        }
      },

      souvenir: () => {
        if (everWon) return ctx.t('castles.souvenir.won')
        if (everOutlasted) return ctx.t('castles.souvenir.outlast')
        if (everBrick) return ctx.t('castles.souvenir.brick')
        return ctx.t('castles.souvenir.none')
      },
    }
  },
}

export default cartridge
