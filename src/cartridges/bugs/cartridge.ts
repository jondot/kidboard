import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { sameStage, stageOf } from '../stage'

/**
 * BUGS — a long thing winding down through the mushrooms, and it comes apart.
 *
 * WHY THIS WHEN `invaders` EXISTS. Both point upwards and press one key, and
 * there the resemblance stops. An invader formation is a BLOCK: it steps
 * sideways in lockstep and the only question is which one you shoot first.
 * This thing WINDS — it takes the shape of the field it is crossing, so the
 * field is what you are really playing against, and the field is made of the
 * mushrooms YOU left behind. Shoot the middle of it and it does the thing
 * nothing else in this box does: it becomes two things, going opposite ways.
 * A five-year-old does not need that explained. They do it once and laugh.
 *
 * THE FIELD IS THE MEMORY. Every segment you hit leaves a mushroom where it
 * was, and mushrooms are what the next one has to wind around — so the board
 * gets more tangled the longer a child plays, and it is tangled with their
 * own doing. Nothing is counted anywhere; the picture is the record.
 *
 * THE FILL RULE, and the one hard case in it:
 *
 *   a mushroom    HOLLOW, and SQUARE, with a stalk. It is world: the thing
 *                 that is there rather than the thing you touch.
 *   a segment     HOLLOW, and ROUND. Also world — and told from a mushroom by
 *                 SHAPE, which is the lever the house style reaches for
 *                 before it reaches for a second colour. Round things move;
 *                 square things sit still. That holds on every screen here.
 *   the head      the same ring, drawn THICK. Size, not hue, and it is the
 *                 same trick `snake` uses to tell a head from a body.
 *   the blaster   SOLID, and the only solid thing on the board bar its own
 *                 shot. It is the child.
 *
 * WHAT WAS MADE EASIER THAN THE ARCADE. No spider, no flea, no scorpion; one
 * shot in the air at a time, and the blaster stays on its own line at the
 * bottom instead of roaming a five-row garden. What is left is the winding
 * and the splitting, which is the game.
 */

const COLS = 30
const ASPECT = 1
const INK = 'plain' as const

/** The garden, in cells. 13 x 12 lands every cell above the house floor of
 *  16 x 10 pixels at the narrowest screen a phone can hand us. */
const GW = 13
const GH = 12
/** Mushrooms never grow in the top row or in the two the blaster owns. */
const SOIL_TOP = 1
const SOIL_BOT = GH - 3
/** How many mushrooms a fresh garden starts with. */
const MUSHROOMS = 18

/** A centipede is this long, and it steps this often. */
const LENGTH = 8
const STEP_SLOW = 0.28
const STEP_FAST = 0.13
const STEP_QUICKER = 0.03

/** The blaster: its line, its width, and stage-widths per keypress. */
const BLASTER_Y = 0.94
const BLASTER_SPEED = 0.045
const BLASTER = [
  '      #      ',
  '     ###     ',
  '    #####    ',
  '  #########  ',
  ' ########### ',
  '#############',
  '##  #####  ##',
]
const BLASTER_COLS = 13
const BLASTER_ROWS = 7

/** The shot: one at a time, and quick enough to feel like a shot. */
const SHOT_SPEED = 1.5
const SHOT_W = 2
const SHOT_H = 0.05

/** A segment's ring, as a fraction of a cell's width. */
const SEG_R = 0.38

/** One centipede. `cells[0]` is the head; the rest follow where it went. */
type Bug = { cells: { x: number; y: number }[]; dir: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'bugs',
  triggers: {
    en: ['bugs', 'centipede', 'mushrooms'],
    he: ['חרקים', 'פטריות'],
    emoji: ['🐛'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [
    { keys: '← →', label: t('bugs.move') },
    { keys: '␣', label: t('bugs.shoot') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, 18 * 8)

    /** `"x,y"` for every cell a mushroom stands in. */
    const soil = new Set<string>()
    let bugs: Bug[] = []
    let blaster = 0.5
    let shot: { x: number; y: number } | null = null
    let sinceStep = 0
    let cleared = 0
    let bumped = false
    let holdT = HOLD_IGNORE
    let everSplit = false
    let everCleared = false
    let clearedTwice = false

    const key = (x: number, y: number): string => `${x},${y}`

    const sow = (): void => {
      for (let i = 0; i < MUSHROOMS; i++) {
        const x = ctx.rng.int(GW)
        const y = SOIL_TOP + ctx.rng.int(SOIL_BOT - SOIL_TOP + 1)
        soil.add(key(x, y))
      }
    }

    const hatch = (): void => {
      const cells = []
      for (let i = 0; i < LENGTH; i++) cells.push({ x: -i, y: 0 })
      bugs = [{ cells, dir: 1 }]
      sinceStep = 0
    }

    sow()
    hatch()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    const stepEvery = (): number =>
      Math.max(STEP_FAST, STEP_SLOW - STEP_QUICKER * cleared)

    const bump = (): void => {
      bumped = true
      holdT = 0
      shot = null
      ctx.audio.hit('kick')
      ctx.audio.hit('snare')
    }

    const again = (): void => {
      bumped = false
      shot = null
      hatch()
    }

    /** Move every centipede on one cell, winding around whatever is there. */
    const crawl = (): void => {
      for (const bug of bugs) {
        const head = bug.cells[0]!
        const nx = head.x + bug.dir
        const blocked =
          nx < 0 || nx >= GW || soil.has(key(nx, head.y))
        const was = bug.cells.map((c) => ({ ...c }))
        if (blocked) {
          bug.dir = -bug.dir
          head.y += 1
        } else {
          head.x = nx
        }
        for (let i = 1; i < bug.cells.length; i++) bug.cells[i] = was[i - 1]!
        // Down at the blaster's own level: that is as far as it gets.
        if (head.y >= GH - 2) { bump(); return }
      }
    }

    /**
     * A shot lands. The segment it hit becomes a mushroom and the centipede
     * comes apart there — the front half carries on, the back half turns
     * round. Two things going opposite ways out of one is the whole reason
     * this game is remembered.
     */
    const split = (b: number, i: number): void => {
      const bug = bugs[b]!
      const hit = bug.cells[i]!
      soil.add(key(hit.x, hit.y))
      const front = bug.cells.slice(0, i)
      const back = bug.cells.slice(i + 1)
      const made: Bug[] = []
      if (front.length > 0) made.push({ cells: front, dir: bug.dir })
      if (back.length > 0) {
        made.push({ cells: back, dir: -bug.dir })
        everSplit = true
      }
      bugs.splice(b, 1, ...made)
      ctx.audio.note(520, 45)
      if (bugs.length === 0) {
        cleared += 1
        if (everCleared) clearedTwice = true
        everCleared = true
        ctx.audio.note(760, 100)
        ctx.audio.note(1020, 160)
        hatch()
      }
    }

    return {
      onKey(k) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) return
          again()
          return
        }
        if (k.key === 'ArrowLeft') blaster = Math.max(0.06, blaster - BLASTER_SPEED)
        else if (k.key === 'ArrowRight') blaster = Math.min(0.94, blaster + BLASTER_SPEED)
        else if (!shot) {
          // ANY other key shoots, the up arrow included: the bar is on the
          // hint line for a child who reads and every other key works for
          // one who does not.
          shot = { x: blaster, y: BLASTER_Y - 0.05 }
          ctx.audio.blip()
        }
      },

      tick(dt) {
        if (bumped) {
          if (holdT < HOLD_IGNORE) holdT += dt
          return
        }

        sinceStep += dt
        if (sinceStep >= stepEvery()) {
          sinceStep = 0
          crawl()
          if (bumped) return
        }

        if (shot) {
          shot.y -= SHOT_SPEED * dt
          if (shot.y < 0) { shot = null } else {
            const col = Math.floor(shot.x * GW)
            const row = Math.floor(shot.y * GH)
            let landed = false
            for (let b = 0; b < bugs.length && !landed; b++) {
              const cells = bugs[b]!.cells
              for (let i = 0; i < cells.length; i++) {
                if (cells[i]!.x === col && cells[i]!.y === row) {
                  shot = null
                  split(b, i)
                  landed = true
                  break
                }
              }
            }
            if (!landed && soil.has(key(col, row))) {
              soil.delete(key(col, row))
              shot = null
              ctx.audio.hit('hat')
            }
          }
        }
      },

      draw(c) {
        refit(c)
        c.clear()
        const cw = stage.w / GW
        const ch = stage.h / GH
        const CX = (col: number): number => stage.x + (col + 0.5) * cw
        const CY = (row: number): number => stage.y + (row + 0.5) * ch
        const X = (f: number): number => stage.x + f * stage.w
        const Y = (f: number): number => stage.y + f * stage.h

        // The mushrooms: hollow, square, with a stalk. World that sits still.
        const mw = cw * 0.72
        const mh = ch * 0.60
        for (const at of soil) {
          const [sx, sy] = at.split(',')
          const col = Number(sx)
          const row = Number(sy)
          c.outline(CX(col) - mw / 2, CY(row) - mh / 2 - ch * 0.1, mw, mh, INK, 2)
          c.rect(CX(col) - 1, CY(row) + mh / 2 - ch * 0.1, 2, ch * 0.25, INK)
        }

        // The centipedes: hollow, round, winding. The head is the thick ring.
        const r = cw * SEG_R
        for (const bug of bugs) {
          for (let i = 0; i < bug.cells.length; i++) {
            const cell = bug.cells[i]!
            if (cell.x < 0 || cell.x >= GW) continue
            c.circle(CX(cell.x), CY(cell.y), r, INK)
            if (i === 0) c.circle(CX(cell.x), CY(cell.y), r - 2, INK)
          }
        }

        if (shot) c.rect(X(shot.x) - SHOT_W / 2, Y(shot.y), SHOT_W, SHOT_H * stage.h, INK)

        // The blaster: solid, and the child's.
        const scale = Math.max(1, Math.round((stage.w * 0.11) / BLASTER_COLS))
        c.sprite(
          X(blaster) - (BLASTER_COLS * scale) / 2,
          Y(BLASTER_Y) - (BLASTER_ROWS * scale) / 2,
          BLASTER, INK, { scale },
        )

        if (bumped) {
          const cx = X(blaster)
          const cy = Y(BLASTER_Y)
          c.circle(cx, cy, stage.w * 0.06, INK)
          c.circle(cx, cy, stage.w * 0.085, INK)
        }
      },

      souvenir: () => {
        if (clearedTwice) return ctx.t('bugs.souvenir.clears')
        if (everCleared) return ctx.t('bugs.souvenir.clear')
        if (everSplit) return ctx.t('bugs.souvenir.split')
        return ctx.t('bugs.souvenir.none')
      },
    }
  },
}

export default cartridge
