import type { Audio, CanvasLike, LiveCartridge, Voice } from '../../types'
import { sameStage, stageOf } from '../stage'
import en from './en.json'
import he from './he.json'

// The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra columns
// follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height four pads and a loop need on a desktop. See `stageOf` in `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain` — the theme's own foreground. A drum kit was the easiest
// of the six to argue about colour for and the easiest to do without: a pad
// is HOLLOW until it is struck, and a struck pad is unmistakable because its
// whole skin shakes. Colour was never what said "that one just went bang".
const INK = 'plain' as const
/** A pad's rim. It doubles when the pad is struck. */
const RIM = 3

/** Steps in the loop a child records. Eight is one bar a 6-year-old can hold. */
export const STEPS = 8
/** Seconds per step, so the loop is 2.7s long — unhurried, danceable. */
export const STEP = 0.34
/** Seconds a struck pad stays lit. Short: a drum hit is an instant, not a state. */
const FLASH = 0.18
/** How many sound-words the souvenir spells out before it trails off. */
const CAP = 8

/**
 * The four pads, left to right, on the four keys a left hand already rests on.
 *
 * `id` names the sound-word the souvenir uses — "boom", "tss" — so a beat is
 * remembered by how it SOUNDED, never by how many hits it had. `icon` is the
 * shape drawn on the pad's skin: a disc, three bars, a cross and a triangle
 * are four silhouettes a child can tell apart across a room, in one ink,
 * which is exactly what four colours used to be for. `weight` is how tall
 * that pad's mark stands in the loop strip, so a recorded bar reads as a
 * picture of its own rhythm — heavy kick, light hat.
 */
export const PADS = [
  { key: 'a', cap: '[A]', id: 'kick', icon: 'disc', weight: 1 },
  { key: 's', cap: '[S]', id: 'snare', icon: 'bars', weight: 0.75 },
  { key: 'd', cap: '[D]', id: 'hat', icon: 'cross', weight: 0.35 },
  { key: 'f', cap: '[F]', id: 'clap', icon: 'wedge', weight: 0.55 },
] as const

/**
 * THE BAR A CHILD RECORDED, in the shape something outside this cartridge can
 * use — the same hook `draw` and `piano` grew for the same reason.
 *
 * A pad index per step, or a rest. Nothing else: no tempo, because `STEP` is
 * this cartridge's own constant and a saved beat is played back at the pace it
 * was recorded at, and no count of anything.
 */
export type Beat = { steps: (number | null)[] }

let latest: Beat | null = null

/** The bar recorded in this session, or null before `drum` was ever opened. */
export const currentBeat = (): Beat | null => latest

/** The playback arrow in the margin. A picture, so it needs no language. */
const PLAY = [
  '#    ',
  '###  ',
  '#####',
  '###  ',
  '#    ',
]

/**
 * A drum has to sound like a drum, and for a long time these did not.
 *
 * The kick was a flat 90Hz sine and the other three were raw white noise cut
 * to three lengths — which is a doorbell followed by three lengths of
 * television static. The lengths were not the problem and no amount of tuning
 * them was going to be the fix: a drum is a pitch that COLLAPSES and a hiss
 * that is FILTERED, and this file had neither to hand.
 *
 * So the recipes moved to the runtime and this became a lookup. `audio.hit`
 * takes a voice by name; `runtime/audio.ts` holds what each one is built from
 * and why. The pads keep their order — kick, snare, hat, clap — because that
 * order is drawn on screen and a child has learnt where each one lives.
 *
 * Audio is decoration and already wrapped so a failure is silent, so nothing
 * here assumes a sound actually played.
 */
const PAD_VOICE: readonly Voice[] = ['kick', 'snare', 'hat', 'clap']

const strike = (audio: Audio, i: number): void => {
  const voice = PAD_VOICE[i]
  if (voice) audio.hit(voice)
}

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'drum',
  // `drum`/`drums` and תופים are free: no content cartridge claims a
  // percussion word, so the game keeps the plain noun. 🥁 is likewise unused.
  triggers: { en: ['drum', 'drums'], he: ['תופים'], emoji: ['🥁'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [
    { keys: 'A S D F', label: t('drum.play') },
    { keys: 'P', label: t('drum.loop') },
  ],

  create(ctx) {
    /** Seconds of light left on each pad. Decays on real time, not on frames. */
    const flash = PADS.map(() => 0)
    /** The recorded bar: a pad index per step, or a rest. */
    const steps: (number | null)[] = Array.from({ length: STEPS }, () => null)
    // Held BY REFERENCE, so the exporter reads the bar as it is recorded
    // rather than a copy taken at some arbitrary moment. `steps` is filled in
    // place and emptied in place, so this stays the same array for the life of
    // the session — exactly how `piano` hands over its melody.
    latest = { steps }
    /** Pads struck in free play, in order — the souvenir's fallback material. */
    const played: number[] = []

    let mode: 'idle' | 'rec' | 'play' = 'idle'
    let step = 0
    let stepT = 0

    // The live stage, learned from the canvas every frame.
    let stage = stageOf(COLS * 8, 18 * 8)

    const hit = (i: number): void => {
      flash[i] = FLASH
      strike(ctx.audio, i)
    }

    return {
      onKey(k) {
        const key = k.key.toLowerCase()

        if (key === 'p') {
          if (mode === 'idle') {
            mode = 'rec'
            step = 0
            stepT = 0
            steps.fill(null)
          } else {
            mode = 'idle'
          }
          ctx.audio.blip()
          return
        }

        const i = PADS.findIndex((p) => p.key === key)
        if (i < 0) return
        hit(i)
        played.push(i)
        // While recording, a hit also lands in the step the bar is on, which
        // is how the loop gets written without anybody counting anything.
        if (mode === 'rec') steps[step] = i
      },

      /**
       * Everything here moves on accumulated SECONDS. A frame count would put
       * the loop at half speed on a 60Hz display and full speed on a 120Hz
       * one, which for a rhythm toy is the whole ballgame.
       */
      tick(dt) {
        for (let i = 0; i < flash.length; i++) {
          if (flash[i]! > 0) flash[i] = Math.max(0, flash[i]! - dt)
        }
        if (mode === 'idle') return

        stepT += dt
        while (stepT >= STEP) {
          stepT -= STEP
          step += 1
          if (step >= STEPS) {
            step = 0
            // The bar filled up: it turns itself around and plays back, so a
            // child hears their own pattern without pressing anything.
            if (mode === 'rec') mode = 'play'
          }
          if (mode === 'play') {
            const s = steps[step] ?? null
            if (s !== null) hit(s)
          }
        }
      },

      draw(c: CanvasLike) {
        // Live stage every frame: a window drag re-lays the whole kit out.
        const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
        if (!sameStage(s, stage)) stage = s
        const { x: ox, y: oy, w: W, h: H } = stage

        c.clear()

        // ---- the four pads -------------------------------------------------
        const gap = Math.max(4, Math.round(W / 44))
        const padW = Math.floor((W - 2 * RIM - gap * 3) / PADS.length)
        const padH = Math.round(H * 0.44)
        const padY = RIM + Math.round(H * 0.06)
        const left = Math.round((W - (padW * PADS.length + gap * 3)) / 2)

        PADS.forEach((p, i) => {
          const x = ox + left + i * (padW + gap)
          const y = oy + padY
          const on = flash[i]! > 0

          // A struck pad does not merely change: its rim DOUBLES and two bands
          // slam across its skin. On a rhythm toy the hit has to be unmissable
          // from across a room, and that was true when the bands were rows of
          // `=` characters — this is the same fix, in shapes.
          c.outline(x, y, padW, padH, INK, on ? RIM * 2 : RIM)
          if (on) {
            const bw = padW - RIM * 4
            const bh = Math.max(3, Math.round(padH * 0.08))
            c.rect(x + RIM * 2, y + Math.round(padH * 0.2), bw, bh, INK)
            c.rect(x + RIM * 2, y + Math.round(padH * 0.8) - bh, bw, bh, INK)
          }

          // The skin's own mark: four silhouettes rather than four colours.
          const cx = x + padW / 2
          const cy = y + padH / 2
          const r = Math.max(4, Math.round(padW * 0.22))
          if (p.icon === 'disc') c.disc(cx, cy, r, INK)
          if (p.icon === 'bars') {
            // Three bars with a clear gap between them: at a tighter spacing
            // they merge into one block and the snare reads as a solid slab.
            const bh = Math.max(2, Math.round(r * 0.28))
            for (const k of [-1, 0, 1]) {
              c.rect(cx - r, cy + k * bh * 2.2 - bh / 2, r * 2, bh, INK)
            }
          }
          if (p.icon === 'cross') {
            const ry = r * 0.6
            for (let t = 0; t < 3; t++) {
              c.line(cx - r + t, cy - ry, cx + r + t, cy + ry, INK)
              c.line(cx - r + t, cy + ry, cx + r + t, cy - ry, INK)
            }
          }
          if (p.icon === 'wedge') {
            const ry = Math.round(r * 0.6)
            for (let j = 0; j <= ry * 2; j++) {
              const half = Math.round((r * j) / (ry * 2))
              c.rect(cx - half, cy - ry + j, Math.max(1, half * 2), 1, INK)
            }
          }

          // The key CAP, the way a keyboard wears one — a label naming the key
          // to press, never a score and never a tally. Characters, because a
          // key cap is a character: see src/cartridges/README.md, rule 5.
          c.text((x + padW / 2) / 8 - 1.5, (y + padH + 6) / 8, p.cap, INK)
        })

        // ---- the loop strip -------------------------------------------------
        //
        // Eight slots, one per step. A hit stands up from the baseline as a
        // solid bar whose HEIGHT is the pad that made it — a heavy kick, a
        // light hat — so a recorded bar is a picture of its own rhythm and no
        // step is ever numbered. A rest is a single dot on the line.
        const barMax = Math.max(8, Math.round(H * 0.18))
        const baseY = oy + H - RIM - Math.round(H * 0.08)
        const slotW = Math.max(6, Math.floor((W - 2 * RIM - 40) / STEPS))
        const stripW = slotW * STEPS
        const stripX = ox + Math.round((W - stripW) / 2)

        c.rect(stripX, baseY, stripW, 2, INK)

        for (let i = 0; i < STEPS; i++) {
          const sx = stripX + i * slotW
          const s = steps[i] ?? null
          const here = mode !== 'idle' && i === step
          const bw = Math.max(4, slotW - 4)
          if (s === null) {
            c.rect(sx + slotW / 2 - 2, baseY - 4, 4, 3, INK)
          } else {
            const bh = Math.max(4, Math.round(barMax * PADS[s]!.weight))
            c.rect(sx + (slotW - bw) / 2, baseY - bh, bw, bh, INK)
          }
          // Where the bar is now: a RING rolling along under the line. Hollow,
          // so it can never be mistaken for a beat of its own.
          if (here) c.circle(sx + slotW / 2, baseY + 8, 4, INK)
        }

        // Recording is a solid dot, playing is an arrow. Pictures, so they
        // need no language and no number.
        const markY = baseY - 10
        if (mode === 'rec') c.disc(ox + RIM + 8, markY, 5, INK)
        if (mode === 'play') c.sprite(ox + RIM + 3, markY - 5, PLAY, INK, { scale: 2 })
      },

      /**
       * Names the beat, never counts it. A recorded loop is read out as the
       * sounds it makes — "boom tss boom boom" — and free play falls back to
       * the pads that were struck. A child who leaves before touching a pad
       * gets a warm line, never a bare "0".
       */
      souvenir: () => {
        const loop = steps.filter((s): s is number => s !== null)
        const seq = loop.length > 0 ? loop : played
        if (seq.length === 0) return ctx.t('drum.souvenir.none')
        const words = seq.slice(0, CAP).map((i) => ctx.t(`drum.sound.${PADS[i]!.id}`))
        const beat = words.join(' ') + (seq.length > CAP ? ' …' : '')
        return ctx.t('drum.souvenir', { beat })
      },
    }
  },
}

export default cartridge
