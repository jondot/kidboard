import type { CanvasLike, LiveCartridge } from '../../types'
import { NOTES } from '../../runtime/audio'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'
import en from './en.json'
import he from './he.json'

// The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra columns
// follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a 3 x 3 of holes needs. See `stageOf` in `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain`. Everything here is told apart by FILL: a hole is a RING
// (hollow, part of the world), a mole is a SOLID little creature that fills
// it, and a hello is two rings thrown around them. The busy cell's own frame
// simply gets thicker — no second tone anywhere.
const INK = 'plain' as const
/** The walls of the 3 x 3, which neighbouring cells share. */
const WALL = 3
/** Breathing room between the grid and the edge of the stage. */
const MARGIN = 6
/** Logical pixels to a character cell. The key caps are characters, so the
 *  board is laid out in whole multiples of this — see `draw`. */
const CELL = 8

/**
 * Who lives in the holes. 11 x 7 source pixels drawn at double size, which is
 * the house minimum for a bitmap of a *thing*. The two gaps in the middle row
 * are eyes and the two notches on top are ears — holes in a solid shape,
 * which is how you draw a face in one ink.
 */
export const MOLE = [
  '  ##   ##  ',
  ' ######### ',
  '###########',
  '## ##### ##',
  '###########',
  ' ######### ',
  '  #######  ',
]
/**
 * The mole a SOUVENIR draws. That is prose in the transcript, not paint on a
 * canvas, so an emoji is exactly right there and exactly wrong on the board —
 * see src/cartridges/README.md on why no emoji goes on a one-ink field.
 */
export const MOLE_FACE = '🐹'
const MOLE_W = 11
const MOLE_H = 7

/**
 * Seconds, all of them — the whole game advances on accumulated `dt`, never
 * on a frame count. A mole that stayed up "for 90 frames" would be twice as
 * hard to greet on a 120Hz display as on a 60Hz one.
 */
export const TIMING = {
  /** Quiet between one mole going down and the next coming up. */
  gap: 0.55,
  /** How long a mole waits to be greeted. Unhurried: this is not a reflex test. */
  up: 1.9,
  /** How long the rings sit around the hole after a hello. */
  greet: 0.5,
} as const

/** How many moles the souvenir draws before it stops — a picture, not a tally. */
const FACE_CAP = 3

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'mole',
  // Checked against the live registry: `animals` owns twenty animal nouns and
  // every one of their emoji, but no mole and no 🐹 — so this game keeps the
  // plain noun rather than inventing one it does not need. חפרפרת is likewise
  // unclaimed by `animals`' Hebrew table.
  triggers: { en: ['mole', 'moles'], he: ['חפרפרת'], emoji: ['🐹'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [{ keys: '1-9', label: t('mole.press') }],

  create(ctx) {
    let state: 'gap' | 'up' | 'greet' = 'gap'
    let t = 0
    /** Which hole is busy, or -1. */
    let at = -1
    /** The hole used last, so the same one never comes up twice running. */
    let prev = -1
    /** Internal only. Nothing is ever drawn from this, and the souvenir
     *  turns it into a row of moles rather than a number. */
    let greeted = 0

    // The live stage, learned from the canvas every frame.
    let stage = stageOf(COLS * 8, 18 * 8)

    const pop = (): void => {
      // Seeded rng only, and never the hole we just used: a child needs to
      // look somewhere new to find the next mole.
      let n: number
      if (prev < 0) {
        n = ctx.rng.int(9)
      } else {
        n = ctx.rng.int(8)
        if (n >= prev) n += 1
      }
      at = n
      prev = n
      state = 'up'
      t = 0
      ctx.audio.note(NOTES.E4!, 90)
    }

    return {
      onKey(k) {
        if (k.key.length !== 1 || k.key < '1' || k.key > '9') return
        if (state !== 'up' || at < 0) return

        const n = k.key.charCodeAt(0) - '1'.charCodeAt(0)
        if (n !== at) {
          // Another number is not a mistake — nothing scolds, nothing ends,
          // and the mole waits right where it is for another try.
          ctx.audio.blip()
          return
        }

        greeted += 1
        state = 'greet'
        t = 0
        ctx.audio.note(NOTES.G5!, 110)
        ctx.audio.note(NOTES.C5!, 110)
      },

      tick(dt) {
        t += dt

        if (state === 'gap') {
          if (t >= TIMING.gap) pop()
          return
        }

        if (state === 'up') {
          if (t >= TIMING.up) {
            // The mole ducks back down by itself. A soft low note, a wave
            // goodbye — never a buzzer, because nothing here can be lost.
            ctx.audio.note(NOTES.C4! / 2, 150)
            state = 'gap'
            t = 0
            at = -1
          }
          return
        }

        if (t >= TIMING.greet) {
          state = 'gap'
          t = 0
          at = -1
        }
      },

      draw(c: CanvasLike) {
        // Live stage every frame: a window drag re-measures the whole board
        // and no hole is ever left hanging outside it.
        const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
        if (!sameStage(s, stage)) stage = s
        const { x: ox, y: oy, w: W, h: H } = stage

        c.clear()

        // Neighbouring cells SHARE a wall, so a 3-wide row of cells spans
        // `3 * cellW + WALL` pixels rather than `3 * (cellW + WALL)`.
        //
        // The board's HEIGHT is snapped to whole character cells, and so is
        // its top edge. This board wears key caps, and a cap is a character:
        // it can only ever land on one of the 8-pixel character rows. Without
        // the snap each row of holes met that grid at a different offset, and
        // the middle row's caps came out sitting on the wall below them —
        // legible in one row of the same picture and clipped in the next.
        const cellW = Math.floor((W - WALL - MARGIN * 2) / 3)
        const cellH = Math.floor((H - WALL - MARGIN * 2) / 3 / CELL) * CELL
        const gx = ox + Math.round((W - (cellW * 3 + WALL)) / 2)
        const gy = oy + Math.round((H - (cellH * 3 + WALL)) / 2 / CELL) * CELL
        // The key cap takes the last whole character row inside the cell; the
        // hole takes the space above it. A hole as wide as that space will
        // hold and as tall as it will hold — `circle` squashes the vertical
        // radius, so the limit is nearly always the height.
        const capY = cellH - CELL
        const r = Math.max(6, Math.min(
          Math.round(cellW * 0.3),
          Math.round(((capY - WALL * 2) / 2) / PIXEL_ASPECT),
        ))
        // A mole big enough to FILL its hole. Whole multiples only: a bitmap
        // drawn at a fractional scale is a smeared bitmap.
        const scale = Math.max(2, Math.min(
          Math.floor((r * 2) / MOLE_W),
          Math.floor((r * 2 * PIXEL_ASPECT) / MOLE_H),
        ))

        // The busy cell's frame is drawn AGAIN at the end. In one ink nothing
        // can actually clip it — ink over ink is ink — but the order is kept
        // deliberately: neighbours share walls, and the moment anything here
        // paints a wall in a second tone, the last writer wins and the
        // highlight comes out half-finished. It cost a bug once already.
        let busy: { x: number; y: number } | null = null

        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const n = j * 3 + i
            const bx = gx + i * cellW
            const by = gy + j * cellH
            const here = at === n
            if (here) busy = { x: bx, y: by }

            c.outline(bx, by, cellW + WALL, cellH + WALL, INK, here ? WALL * 2 : WALL)

            const cx = bx + (cellW + WALL) / 2
            const cy = by + WALL + (capY - WALL) / 2

            if (here) {
              // Somebody is home: a solid little creature filling the hole.
              c.sprite(cx - (MOLE_W * scale) / 2, cy - (MOLE_H * scale) / 2,
                MOLE, INK, { scale })
              // A hello is rings thrown around them — hollow, so they can
              // never be mistaken for a piece of the board.
              if (state === 'greet') {
                c.circle(cx, cy, r, INK)
                c.circle(cx, cy, r * 1.5, INK)
              }
            } else {
              // An empty hole: a RING. Hollow is what makes it a hole.
              c.circle(cx, cy, r, INK)
            }

            // A key CAP, the way a keyboard wears one — never a score and
            // never a tally. It is the whole point of the game: the child
            // reads the number and finds it under their finger. Characters,
            // because a key cap IS a character: see the README, rule 5.
            c.text((cx - 12) / CELL, (by + capY) / CELL, `[${n + 1}]`, INK)
          }
        }

        if (busy) {
          c.outline(busy.x, busy.y, cellW + WALL, cellH + WALL, INK, WALL * 2)
        }
      },

      /**
       * Says who was greeted, in moles, never how many. Three is as many as
       * it ever draws, so a long session and a lucky one look equally good —
       * there is nothing here to compare. A child who leaves before the first
       * hello gets a warm line, never a bare "0".
       */
      souvenir: () => {
        if (greeted === 0) return ctx.t('mole.souvenir.none')
        return ctx.t('mole.souvenir', { moles: MOLE_FACE.repeat(Math.min(greeted, FACE_CAP)) })
      },
    }
  },
}

export default cartridge
