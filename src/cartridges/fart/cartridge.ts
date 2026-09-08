import type { CanvasLike, LiveCartridge, Voice } from '../../types'
import en from './en.json'
import he from './he.json'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * THE FART MACHINE — four cushions, four sizes, one joke.
 *
 * It is `drum` with ruder numbers, and that is the entire design. The drum
 * machine had already worked out what a pad-and-keycap game looks like on a
 * single-ink screen, and the percussion bank in `runtime/audio.ts` had just
 * learnt how to build a sound out of a falling pitch and a filter. A fart is
 * a falling pitch and a filter. So this cartridge is mostly a picture.
 *
 * WHAT IT IS NOT. It is not a loop recorder — `drum` owns that, and a second
 * game with a second loop strip would be one game wearing two hats. Here you
 * press a thing and a thing happens, which at six is the whole appeal.
 *
 * WHY FOUR AND NOT ONE. One button is a doorbell. Four is a decision, and the
 * decision is the game: the child learns that the little flat cushion makes
 * the little high one and the fat one makes the long low one, and then they
 * start choosing. Size is the only thing that tells them apart — no colour,
 * no label, no word to read — because the sounds differ by size too, so the
 * picture and the noise are saying the same thing.
 */

// Wider than it is tall at the declared width, so four cushions sit in a row
// with room to breathe. Rows follow from the aspect; a wide screen gets more
// columns and the stage stays this shape.
const COLS = 34
const ASPECT = 4 / 3

const INK = 'plain' as const

/**
 * The four pads, small to large — which is also quiet to loud, high to low,
 * and short to long. One ordering, running through every property, so there is
 * nothing to learn twice.
 *
 * `key` is the physical key; `cap` is what is drawn on the key cap under the
 * cushion. A S D F, the same home-row four `drum` uses, because a child who
 * has played one already knows where to put their fingers.
 *
 * `r` is the cushion's horizontal radius as a fraction of the stage width.
 * `voice` is the bank entry in `runtime/audio.ts`.
 */
const PADS: readonly { key: string; cap: string; voice: Voice; r: number }[] = [
  { key: 'a', cap: '[A]', voice: 'squeak', r: 0.052 },
  { key: 's', cap: '[S]', voice: 'toot', r: 0.072 },
  { key: 'd', cap: '[D]', voice: 'rumble', r: 0.094 },
  { key: 'f', cap: '[F]', voice: 'blast', r: 0.120 },
]

/**
 * A WHOOPEE CUSHION, drawn as one.
 *
 * A disc with a stalk, because a disc on its own is a ball and this is not a
 * ball game. The stalk is the neck a cushion is blown up through, it points
 * the same way on all four, and it is the one detail that stops the row
 * reading as a set of increasingly large full stops.
 *
 * SOLID, all four of them: they are the things the child presses. The puff is
 * hollow. That is the whole of the fill rule here, and it means a still frame
 * can be read at a glance — solid things are pads, hollow things are noises.
 */
const NECK_W = 0.30   // of the cushion's own diameter
const NECK_H = 0.55   // of the cushion's own vertical radius

/** How long one puff lives, in seconds. Long enough to see, gone before the
 *  next press wants the space. */
const PUFF_SECS = 0.5
/** How far a puff grows, as a multiple of the cushion that made it. */
const PUFF_GROW = 2.6

/**
 * The pad that was just pressed SQUASHES, the way a cushion sat on does — it
 * loses size and keeps its bottom on the floor, so it settles rather than
 * shrinking on the spot. This is the whole of the press feedback and it needs
 * no second ink: the shape changes, briefly, and shape is what this house
 * tells things apart with.
 *
 * It is a shrink rather than a flatten because `disc` takes ONE radius and
 * squashes the vertical one itself, so there is no honest way to draw an
 * ellipse flatter than round. A pressed cushion that got smaller and lower
 * reads as "sat on" just as clearly, and it does not need a second primitive.
 */
const SQUASH_SECS = 0.14
const SQUASH = 0.78   // of its resting radius, at the bottom of the squash

type Puff = { pad: number; t: number }

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'fart',
  triggers: {
    en: ['fart', 'farts', 'parp'],
    he: ['נאד', 'פלוצים'],
    emoji: ['💨'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },
  hints: (t) => [{ keys: 'A S D F', label: t('fart.press') }],

  create(ctx) {
    let stage = stageOf(COLS * 8, Math.round((COLS * 8 * 0.6) / ASPECT))

    /** Seconds since each pad was last struck, or `null` for never. */
    const since: (number | null)[] = PADS.map(() => null)
    const puffs: Puff[] = []
    /** Which pads have been pressed at all, for the souvenir. Never counted. */
    const used = new Set<number>()

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
      if (!sameStage(s, stage)) stage = s
    }

    /**
     * The floor every cushion rests on, in stage coordinates. Low enough that
     * a puff has sky above it, high enough that the key cap below is not
     * against the bottom of the screen.
     */
    const floor = (): number => stage.h * 0.70

    /**
     * Where a pad's cushion sits, in stage coordinates. `r` is the HORIZONTAL
     * radius, which is what `disc` takes; the vertical one is `PIXEL_ASPECT`
     * of it, because a logical pixel is 0.6 as wide as it is tall and `disc`
     * squashes for you. Getting that backwards is what left the small
     * cushions hovering a few pixels off their own floor.
     */
    const padAt = (i: number): { x: number; r: number } => ({
      // Four equal columns; the cushion is centred in its own.
      x: stage.w * ((i + 0.5) / PADS.length),
      r: stage.w * PADS[i]!.r,
    })

    return {
      onKey(k) {
        const i = PADS.findIndex((p) => p.key === k.key.toLowerCase())
        if (i < 0) return
        // A held key repeats, and a held fart is funnier than it is annoying,
        // so repeats are allowed through — but the puff list is capped so a
        // child leaning on F cannot fill the screen with rings.
        since[i] = 0
        used.add(i)
        puffs.push({ pad: i, t: 0 })
        if (puffs.length > 8) puffs.shift()
        ctx.audio.hit(PADS[i]!.voice)
      },

      tick(dt) {
        for (let i = 0; i < since.length; i++) {
          const s = since[i]
          if (s !== null && s !== undefined) since[i] = s + dt
        }
        for (const p of puffs) p.t += dt
        while (puffs.length && puffs[0]!.t > PUFF_SECS) puffs.shift()
      },

      draw(c) {
        refit(c)
        c.clear()

        // The floor the cushions sit on: one thin rail, world, hollow enough
        // at three pixels that nothing mistakes it for a thing to press.
        const floorY = stage.y + floor()
        c.rect(stage.x + stage.w * 0.04, floorY, stage.w * 0.92, 3, INK)

        for (let i = 0; i < PADS.length; i++) {
          const p = padAt(i)
          const s = since[i]
          // The squash, eased back out over its own window.
          const k = s != null && s < SQUASH_SECS ? 1 - s / SQUASH_SECS : 0
          const r = p.r * (1 - (1 - SQUASH) * k)

          const cx = stage.x + p.x
          // Every cushion's BOTTOM is on the rail, whatever its size, so the
          // four of them read as one row of objects rather than four objects
          // floating at four heights.
          const ry = r * PIXEL_ASPECT
          const cy = floorY - ry

          // The neck first, so the cushion is drawn over its root: a cushion
          // is blown up through a neck, and without one a row of four discs
          // is a row of increasingly large full stops.
          const nw = r * 2 * NECK_W
          const nh = ry * NECK_H
          c.rect(cx - nw / 2, cy - ry - nh, nw, nh + ry, INK)
          // The cushion: solid, because the child presses it.
          c.disc(cx, cy, r, INK)

          // The key cap, in characters — a key cap is language, and language
          // is what the character ops are for.
          // Centred UNDER the cushion: a three-character cap is one and a
          // half cells wide either side of its middle, so a bare `- 1` sits
          // it half a cell to the right of everything it is labelling.
          const capY = Math.round((floorY + stage.h * 0.14) / 8)
          c.text(Math.round(cx / 8 - 1.5), capY, PADS[i]!.cap, INK)
        }

        // The puffs, over everything: hollow rings growing away from the pad
        // that made them. Hollow is the whole reason they can never be
        // mistaken for a cushion, and it is why they need no second ink.
        for (const puff of puffs) {
          const p = padAt(puff.pad)
          const k = puff.t / PUFF_SECS
          const r = p.r * (1 + PUFF_GROW * k)
          // Rising off the neck, which is where it came out.
          const cx = stage.x + p.x
          const top = stage.y + floor() - p.r * PIXEL_ASPECT * 2 - p.r * PIXEL_ASPECT * NECK_H
          c.circle(cx, top - stage.h * 0.06 - stage.h * 0.22 * k, r, INK)
        }
      },

      /**
       * Which ones they found, never how many times. A child who opens this
       * and presses ESC gets the warm fixed line, not an empty list.
       */
      souvenir: () => {
        if (used.size === 0) return ctx.t('fart.souvenir.none')
        if (used.size === PADS.length) return ctx.t('fart.souvenir.all')
        return ctx.t(used.has(3) ? 'fart.souvenir.big' : 'fart.souvenir.some')
      },
    }
  },
}

export default cartridge
