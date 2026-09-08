import type { CanvasLike, Locale, LiveCartridge } from '../../types'
import { NOTES } from '../../runtime/audio'
import { sameStage, stageOf } from '../stage'
import { HOLD_IGNORE } from '../pacing'
import en from './en.json'
import he from './he.json'

// The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
// wide as it is tall. Rows follow from the aspect (18 of them); extra columns
// follow from how wide the browser viewport is.
//
// Why `aspect: 1`: rows are FIXED by the declared aspect and a wide screen is
// handed extra COLUMNS, so the canvas can only ever get wider than what is
// declared, never taller. Declaring a square canvas at 30 columns buys the
// height a diamond of four pads needs. See `stageOf` in `../stage`.
const COLS = 30
const ASPECT = 1

// ---- the picture, in LOGICAL PIXELS (8 to a character cell) --------------
//
// ONE INK, `plain`. This is the game that had the most to lose from
// monochrome, because COLOUR was doing the identifying: four coloured
// squares, and a souvenir that said "you remembered red and blue".
//
// What replaces it is a GLYPH PER PAD — a star, a heart, a moon and a
// flower — chosen because their silhouettes share no outline at all: spiky,
// round-with-a-point, a crescent, four lobes. A 6-year-old who cannot yet
// read tells them apart instantly, and can SAY them ("the heart!"), which
// four colours also allowed and four abstract shapes would not.
//
// The identification is doubled, not replaced: each emblem keeps its fixed
// corner of the diamond, so the arrow keys still mean what they look like —
// up is the top pad in every language — and a child can go by position, by
// picture, or by both.
const INK = 'plain' as const
/** A pad's rim, and what it swells to when the game lights it. */
export const RIM = 3
export const LIT_RIM = 6

/** Spiky. Nothing else on the board has a point on it. */
const STAR = [
  '     #     ',
  '    ###    ',
  '    ###    ',
  '###########',
  ' ######### ',
  '  #######  ',
  '  ##   ##  ',
  ' ##     ## ',
  '##       ##',
]

/** Round on top, one point at the bottom. */
const HEART = [
  ' ###   ### ',
  '###########',
  '###########',
  '###########',
  ' ######### ',
  '  #######  ',
  '   #####   ',
  '    ###    ',
  '     #     ',
]

/** A crescent: the one shape here with a bite out of it. */
const MOON = [
  '    ####   ',
  '  #####    ',
  ' ####      ',
  ' ###       ',
  ' ###       ',
  ' ###       ',
  ' ####      ',
  '  #####    ',
  '    ####   ',
]

/** Four lobes and a stem. */
const FLOWER = [
  '  ##   ##  ',
  ' #### #### ',
  ' ######### ',
  '  #######  ',
  ' ######### ',
  ' #### #### ',
  '  ##   ##  ',
  '     #     ',
  '   #####   ',
]

const EM_W = 11
const EM_H = 9

/**
 * Every duration here is SECONDS, and the whole machine advances on
 * accumulated `dt`. A frame count would make the sequence flash at half speed
 * on a 60Hz display and full speed on a 120Hz one — for a call-and-response
 * game, that is the difference between followable and impossible.
 */
export const TIMING = {
  /** Quiet beat before a sequence starts, so the child looks up. */
  lead: 0.6,
  /** How long one pad stays lit. */
  on: 0.5,
  /** Darkness between two flashes, so two pads never blur into one. */
  gap: 0.22,
  /**
   * How long a HOLD ignores the keyboard. Nothing in this game re-arms on a
   * timer any more: after a round ends the picture holds until the child asks
   * for the next one. But a pause a child can dismiss by accident is not a
   * pause — this is the beat during which a key-masher's next key does not
   * blow straight through the moment.
   *
   * The house number, shared with `ball`, `snake`, `maze`, `rocket` and
   * `robot` rather than copied five more times. See `../pacing`.
   */
  ignore: HOLD_IGNORE,
} as const

/** How long the child's own press lights its pad. */
const PRESS = 0.22
/** How many pads the souvenir names before it says "more". */
const NAME_CAP = 5

/**
 * The four pads, laid out as a diamond so the arrow keys mean what they look
 * like: up is the top pad in every language. The number row does the same
 * four pads for a child who has not found the arrows yet.
 *
 * `id` is what the souvenir names — the picture on the pad, not a colour it
 * no longer has.
 */
export const PADS = [
  { id: 'star', art: STAR, keys: ['ArrowUp', '1'], hz: NOTES.C5!, at: 'up' },
  { id: 'heart', art: HEART, keys: ['ArrowLeft', '2'], hz: NOTES.G4!, at: 'left' },
  { id: 'moon', art: MOON, keys: ['ArrowRight', '3'], hz: NOTES.E4!, at: 'right' },
  { id: 'flower', art: FLOWER, keys: ['ArrowDown', '4'], hz: NOTES.C4!, at: 'down' },
] as const

/**
 * Joins names the way a person says them aloud. Same idiom as `catch` and
 * `memory`, including the correction made there: the conjunction is added
 * HERE and only here. Hebrew's "and" is the prefix ו glued to the next word,
 * never a standalone token — and the overflow marker
 * (`simon.souvenir.more`) is the bare word "more" / "עוד", so a capped list
 * can never come out as "and and more" / "וועוד".
 */
export function joinNamed(names: string[], locale: Locale): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  const head = names.slice(0, -1)
  const last = names[names.length - 1]!
  if (locale === 'he') return `${head.join(', ')} ו${last}`
  return names.length === 2 ? `${names[0]} and ${last}` : `${head.join(', ')}, and ${last}`
}

/**
 * `lead` and `show` are the game's turn; `listen` is the child's.
 * `again` and `cheer` are HOLDS — they end when the child presses a key, not
 * when a clock runs out.
 */
type Phase = 'lead' | 'show' | 'listen' | 'again' | 'cheer'

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'simon',
  // `colors` owns every colour word and every colour emoji, so this game takes
  // a name of its own instead: `simon` / `copycat`, and חקיין ("mimic") in
  // Hebrew.
  //
  // The emoji was 🚦, picked when the pads were four coloured squares and a
  // traffic light read as "lights taking turns". There is no colour and there
  // are no lights in this game any more: the pads are a star, a heart, a moon
  // and a flower, and the souvenir names them. ⭐ is one of the game's own
  // four emblems and the one a child is most likely to say out loud, so the
  // picture in the 🎮 menu is now a picture of what is actually on screen. It
  // is claimed by no other cartridge's trigger table (`stars`, the sky game,
  // answers to 🌌).
  triggers: { en: ['simon', 'copycat'], he: ['חקיין'], emoji: ['⭐'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // No ESC hint: the shell appends exactly one whenever a cartridge runs.
  hints: (t) => [
    { keys: '↑ ← ↓ →', label: t('simon.pads') },
    { keys: '1-4', label: t('simon.also') },
  ],

  create(ctx) {
    const seq: number[] = []
    /** The longest sequence the child has repeated all the way through. */
    let remembered: number[] = []

    let phase: Phase = 'lead'
    let t = 0
    let showIdx = 0
    let showOn = false
    let inputIdx = 0
    /** The pad the GAME is flashing right now, or -1. */
    let showLit = -1
    /** The pad the CHILD just pressed, which looks different on purpose. */
    let pressLit = -1
    let pressT = 0

    // The live stage, learned from the canvas every frame.
    let stage = stageOf(COLS * 8, 18 * 8)

    /**
     * Never the same pad twice running: two identical flashes in a row are
     * indistinguishable to a 6-year-old watching, and they would also make a
     * souvenir read "a star, a star". Seeded rng only.
     */
    const nextPad = (): number => {
      const prev = seq[seq.length - 1]
      if (prev === undefined) return ctx.rng.int(PADS.length)
      const n = ctx.rng.int(PADS.length - 1)
      return n >= prev ? n + 1 : n
    }

    const light = (i: number): void => {
      showLit = i
      ctx.audio.note(PADS[i]!.hz, 300)
    }

    const enterShow = (): void => {
      phase = 'show'
      showIdx = 0
      showOn = true
      t = 0
      light(seq[0]!)
    }

    seq.push(nextPad())

    /** A hold is over when the child says it is — but not in the first half
     *  second, or a key-masher never sees what happened. */
    const holding = (): boolean => phase === 'again' || phase === 'cheer'

    return {
      onKey(k) {
        // NOTHING RE-ARMS ON A TIMER. When a round ends — the whole sequence
        // came back, or the child pressed a different pad — the picture holds
        // and the next key is what asks for the next round. Any key at all:
        // there is no key to learn and no way to be stuck.
        if (holding()) {
          if (t < TIMING.ignore) return
          if (phase === 'cheer') seq.push(nextPad())
          inputIdx = 0
          phase = 'lead'
          t = 0
          return
        }

        const key = k.key.length === 1 ? k.key.toLowerCase() : k.key
        const i = PADS.findIndex((p) => (p.keys as readonly string[]).includes(key))
        if (i < 0) return

        // A pad always answers to touch, whichever phase the game is in —
        // an instrument that ignores you is not an instrument.
        pressLit = i
        pressT = PRESS
        ctx.audio.note(PADS[i]!.hz, 260)

        if (phase !== 'listen') return

        if (i === seq[inputIdx]) {
          inputIdx += 1
          if (inputIdx >= seq.length) {
            // The whole sequence came back. Celebrate — and HOLD there, for
            // as long as the child likes, before the sequence grows.
            remembered = [...seq]
            phase = 'cheer'
            t = 0
            showLit = -1
            ctx.audio.note(NOTES.C5!, 320)
            ctx.audio.note(NOTES.E5!, 320)
            ctx.audio.note(NOTES.G5!, 320)
          }
          return
        }

        // NOT a loss. Nothing ends, nothing shrinks, nothing is counted: the
        // same sequence simply plays again, from the top, as many times as
        // the child likes — and it waits for them to ask.
        phase = 'again'
        t = 0
        inputIdx = 0
        showLit = -1
        ctx.audio.note(NOTES.G4! / 2, 300)
      },

      tick(dt) {
        if (pressT > 0) {
          pressT = Math.max(0, pressT - dt)
          if (pressT === 0) pressLit = -1
        }

        t += dt

        // A hold has no clock of its own: `t` runs only so the ignore window
        // can end. Six hundred ticks change nothing here.
        if (holding()) return

        if (phase === 'lead') {
          if (t >= TIMING.lead) enterShow()
          return
        }

        if (phase !== 'show') return

        if (showOn) {
          if (t >= TIMING.on) {
            showOn = false
            showLit = -1
            t = 0
          }
          return
        }

        if (t < TIMING.gap) return
        showIdx += 1
        t = 0
        if (showIdx >= seq.length) {
          phase = 'listen'
          inputIdx = 0
          return
        }
        showOn = true
        light(seq[showIdx]!)
      },

      draw(c: CanvasLike) {
        // Live stage, every frame: a window drag re-lays the diamond out and
        // nothing is ever left outside it.
        const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
        if (!sameStage(s, stage)) stage = s
        const { x: ox, y: oy, w: W, h: H } = stage

        c.clear()

        const padW = Math.round(W * 0.24)
        const padH = Math.round(H * 0.31)
        const cx = ox + W / 2
        const cy = oy + H / 2
        const dx = W * 0.28
        const dy = H * 0.29
        // The emblem is as big as the pad will hold. Whole multiples only:
        // a bitmap drawn at a fractional scale is a smeared bitmap.
        const scale = Math.max(1, Math.min(
          Math.floor((padW - 10) / EM_W),
          Math.floor((padH - 8) / EM_H),
        ))

        PADS.forEach((p, i) => {
          const px = p.at === 'left' ? cx - dx : p.at === 'right' ? cx + dx : cx
          const py = p.at === 'up' ? cy - dy : p.at === 'down' ? cy + dy : cy
          const lit = showLit === i
          const pressed = pressLit === i

          // A lit pad SWELLS: the frame grows outward and thickens. That is
          // the same idea the two-colour flash had — bigger and brighter —
          // and it survives having no second colour to be brighter in.
          const grow = lit ? 4 : 0
          c.outline(
            px - padW / 2 - grow, py - padH / 2 - grow * 0.6,
            padW + grow * 2, padH + grow * 1.2,
            INK, lit ? LIT_RIM : RIM,
          )

          // The emblem: the whole reason a child can tell one pad from
          // another without a colour to go on.
          c.sprite(px - (EM_W * scale) / 2, py - (EM_H * scale) / 2,
            p.art, INK, { scale })

          // The child's own touch is a RING around the pad — hollow, so it
          // reads as something happening TO the pad rather than as the game
          // lighting it. The two can never be confused.
          if (pressed && !lit) c.circle(px, py, padW * 0.62, INK)
        })

        // The middle of the diamond says what the game is waiting for, in
        // rings, which are never a piece of the board:
        //   three rings   the whole sequence came back — a firework
        //   one ring      here we go again, from the top
        // Both HOLD until the child presses something.
        if (phase === 'cheer') {
          for (const r of [14, 24, 34]) c.circle(cx, cy, (r / 100) * W, INK)
        } else if (phase === 'again') {
          c.circle(cx, cy, 0.07 * W, INK)
        }
      },

      /**
       * Names the pads the child actually remembered — never how many
       * rounds, never which round they are on. A child who leaves before the
       * first sequence comes back gets a warm line, never a bare "0".
       */
      souvenir: () => {
        if (remembered.length === 0) return ctx.t('simon.souvenir.none')
        const names = remembered.map((i) => ctx.t(`simon.shape.${PADS[i]!.id}`))
        const shown = names.length > NAME_CAP
          ? [...names.slice(0, NAME_CAP - 1), ctx.t('simon.souvenir.more')]
          : names
        return ctx.t('simon.souvenir', { shapes: joinNamed(shown, ctx.locale) })
      },
    }
  },
}

export default cartridge
