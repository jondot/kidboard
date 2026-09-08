import type { CanvasLike, LiveCartridge } from '../../types'
import { NOTES } from '../../runtime/audio'
import { PX_PER_CELL } from '../../runtime/shapes'
import { WALL, court, sameStage, screenOf } from '../card'
import en from './en.json'
import he from './he.json'

const WHITE = [
  { key: 'a', label: 'A', hz: NOTES.C4! },
  { key: 's', label: 'S', hz: NOTES.D4! },
  { key: 'd', label: 'D', hz: NOTES.E4! },
  { key: 'f', label: 'F', hz: NOTES.F4! },
  { key: 'g', label: 'G', hz: NOTES.G4! },
  { key: 'h', label: 'H', hz: NOTES.A4! },
  { key: 'j', label: 'J', hz: NOTES.B4! },
] as const

/**
 * THE BLACK KEYS ARE ON THE ROW ABOVE, WHERE THEY PHYSICALLY ARE.
 *
 * They used to be `1`-`5` on the number row, which is a row of buttons rather
 * than a piano: nothing about `3` says "the black key between F and G". A
 * computer keyboard already IS a keyboard if you use the row above the home
 * row, so that is what this uses now:
 *
 *     W   E       T   Y   U      <- C# D#     F# G# A#
 *   A   S   D   F   G   H   J    <- C  D  E  F  G  A  B
 *
 * `R` is DEAD ON PURPOSE. A real piano has no black key between E and F, and
 * that gap is the whole reason the picture reads as a keyboard rather than as
 * ten evenly spaced buttons. It is a gap on the screen too — see `seam` in
 * `draw` — and a child who presses `R` gets silence, exactly as they would
 * reaching for a black key that is not there.
 *
 * `at` is the SEAM the key stands on: the pair of white keys it sits between,
 * counted from the left. The run is 0, 1, 3, 4, 5 — it skips 2 because seam 2
 * is the E-F gap.
 *
 * `name` is what the SOUVENIR calls it. A souvenir that named a sharp by the
 * key that played it ("you played W") would name the machine rather than the
 * music, so the souvenir always says C#.
 */
const BLACK = [
  { key: 'w', label: 'W', name: 'C#', hz: NOTES['C#4']!, at: 0 },
  { key: 'e', label: 'E', name: 'D#', hz: NOTES['D#4']!, at: 1 },
  { key: 't', label: 'T', name: 'F#', hz: NOTES['F#4']!, at: 3 },
  { key: 'y', label: 'Y', name: 'G#', hz: NOTES['G#4']!, at: 4 },
  { key: 'u', label: 'U', name: 'A#', hz: NOTES['A#4']!, at: 5 },
] as const

/**
 * FOUND IN A BROWSER, in Hebrew: `ניגנתם A S C# F#` rendered as
 * `#A S C# F` — the trailing sharp had walked to the far end of the line.
 *
 * A note name ends in "#", which Unicode classes as a NEUTRAL character. A
 * neutral at the END of a Latin run inside a right-to-left paragraph takes
 * the PARAGRAPH's direction rather than the run's, so it is placed on the
 * paragraph's trailing side — the far left — while the letters stay put. The
 * text was always correct; only its rendering was wrong, which is the kind of
 * bug no string comparison can see.
 *
 * FSI…PDI (U+2068…U+2069) isolates the run so its direction is resolved from
 * its own contents and cannot leak either way. Both are invisible and
 * zero-width; in English the whole question is moot and this is a no-op.
 *
 * Written as escapes on purpose. The project's rule is that HEBREW is spelled
 * out as literal characters and never as codepoints, because a reviewer has
 * to be able to read it. These two are the opposite case: they have no glyph
 * at all, and a literal FSI in the source would be an invisible character
 * nobody could see, review, or type back if it were lost.
 */
const isolate = (s: string): string => `\u2068${s}\u2069`

/**
 * The tune, and NOTHING but the tune: plain JSON, no functions, no closures,
 * no class instances.
 *
 * This is the export hook, and it is deliberately the same shape of thing as
 * `draw`'s `currentDrawing()` — held here in the open rather than buried in a
 * closure, so "save the melody I played" is one read and a `JSON.stringify`.
 *
 * WHAT IT KEEPS, AND WHAT IT DOES NOT. The notes, in the order they were
 * played, each with the pitch that sounded and the name shown on the key.
 *
 * IT KEEPS THE RHYTHM WHEN THERE IS A RHYTHM TO KEEP, and not otherwise.
 *
 * This comment used to explain, at length, that a saved tune plays back at an
 * even beat because nothing here timestamps a key press. That was true while
 * the only clock was the one putting ringing notes out. There is a RECORDING
 * HEAD now (`P`), and a phrase recorded through it carries `at` — seconds from
 * the moment recording began — on every note, so the cart a child saves plays
 * their rhythm rather than a metronome's.
 *
 * Free play still has no timestamps and still saves as an even beat, which is
 * the honest thing to say about notes nobody was recording. `at` is therefore
 * OPTIONAL, and `src/carts/export.ts` reads it that way: every note timed, and
 * the cart plays the real gaps; any note untimed, and it falls back to the
 * even beat it always used.
 *
 * A CHORD IS RECORDED AS ITS NOTES, ONE AFTER ANOTHER. Three keys held down
 * together sound together and light together, but they land here as three
 * entries in the order the keys were struck, indistinguishable from a run of
 * three separate notes. `notes` is a LIST and has no way to say "these three
 * belong to one moment". That is deliberate rather than overlooked: this
 * shape is read structurally by `src/carts/export.ts`, which plays a saved
 * tune back at an even beat, so widening it would be a change to the saved
 * cart format and not to this cartridge.
 */
export type Tune = {
  notes: { hz: number; label: string; at?: number }[]
}

let latest: Tune | null = null

/** The melody played in this session, or null before `piano` was ever opened. */
export const currentTune = (): Tune | null => latest

/**
 * The DESIGN size: 30 columns at its narrowest and, at that width, exactly as
 * wide as it is tall. Rows follow from the aspect (18 of them); extra columns
 * follow from how wide the browser viewport is.
 *
 * THIS USED TO BE `9 / 4`, which made piano the sharpest outlier in the whole
 * playground. Rows are FIXED by the aspect a game declares and a wide screen
 * is handed extra COLUMNS, so a 9:4 declaration bought 8 rows and then let a
 * desktop stretch them to roughly 1150 x 140 — an 8:1 strip drawn edge to
 * edge with 700px of nothing underneath it, next to `drum`'s neat centred
 * court of four pads. Same category, same instrument metaphor, two different
 * products. `aspect: 1` buys the height a field-shaped screen needs, and
 * `screenOf` (`../card`) centres that screen in whatever grid arrives — the
 * character idiom's half of the rule the shape games get from `stageOf`.
 */
const COLS = 30
const ASPECT = 1

/**
 * A black key, drawn. The Block Elements are the one non-box-drawing glyph
 * family the canvas already paints in (its degraded renderer squeezes the
 * pixel field into quadrant blocks), they are language-neutral, and a solid
 * bar standing at the top of a seam is what a black key IS. A `#` would have
 * been a hash sitting on a piano.
 */
const BLACK_KEY = '█'

/**
 * HOW LONG EVERY NOTE RINGS, in milliseconds — one entry per number key,
 * `1` shortest to `9` longest.
 *
 * This is what the number row does now. It used to play the sharps, which is
 * the complaint this cartridge is answering; a length control is what those
 * keys are actually good for, since it is the one thing about a note a child
 * can want to change without wanting a different note.
 *
 * THE RANGE, and why. Geometric rather than linear: each step is about 1.42x
 * the one before, so every press is an audible change instead of eight
 * indistinguishable ones bunched at the top. 120ms at `1` is a staccato you
 * can run the whole keyboard in without the notes smearing into each other.
 * 2s at `9` is long enough that two keys struck a second apart are BOTH still
 * ringing — which is the point, because that overlap is what makes polyphony
 * audible rather than merely true.
 *
 * It starts in the MIDDLE, not at an end. A child who never finds this
 * control should still get a piano, and either extreme is a worse piano than
 * the middle is.
 */
const LENGTHS = [120, 170, 245, 345, 490, 700, 990, 1410, 2000] as const
const START = 4

/**
 * The length control's own track. HALF-height blocks, where a key is a whole
 * one: a control and a key must not read as the same kind of object at a
 * glance, and half a block against a thin rule reads as a level in a slot.
 */
const DIAL_ON = '▄'
const DIAL_OFF = '─'

/**
 * THE TRANSPORT BADGE: A FAT DOT WHILE IT RECORDS, A FAT TRIANGLE WHILE IT
 * PLAYS, under the keyboard, and nothing at all the rest of the time.
 *
 * The first attempt lit the whole CASE while the head was down, and a tint on
 * a border is a thing you notice once somebody points it out — the opposite of
 * what a record light is for. So the state is a SYMBOL, in the two shapes
 * every machine a child will ever meet uses for exactly this.
 *
 * DRAWN IN SHAPES, not characters, and that is not a stylistic choice: `●`
 * and `▶` are one character tall, which is the size of the letter on a key.
 * These are two rows tall, and while one is up it is the loudest thing on the
 * screen — which is the whole job.
 *
 * NO WORDS. "REC" is English, and Latin prose never reaches a canvas here (the
 * standing rule). A dot needs no language.
 *
 * IT IS DRUM'S IDIOM, moved next door. The kit has drawn a disc while it
 * records and an arrow while it plays since it was written — in the margin
 * beside its loop strip — and the two instruments share their transport keys,
 * so they had better share the way they say what those keys just did.
 */
const BADGE_ROWS = 3
/**
 * The dot's radius in logical pixels, so the symbol is 20 across in a band 24
 * tall — about the size of the letter on a white key, and three of these were
 * worth taking off the key bodies for. A smaller one was drawn first and it
 * was a speck: the point of a record light is that you cannot miss it.
 */
const DOT_R = 10

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'piano',
  // he: real Hebrew for "piano" and "music" (not a transliteration) — a
  // Hebrew-speaking child types Hebrew, not romanised Hebrew.
  triggers: { en: ['piano', 'music'], he: ['פסנתר', 'מוזיקה'], emoji: ['🎹'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // The shell owns the ESC hint; see invariants.test.ts.
  hints: (t) => [
    { keys: 'A-J', label: t('piano.white') },
    { keys: 'W E T Y U', label: t('piano.black') },
    { keys: '1-9', label: t('piano.length') },
    { keys: 'P', label: t('piano.record') },
    { keys: 'SPACE', label: t('piano.play') },
  ],

  create(ctx) {
    /**
     * THE NOTES THAT ARE SOUNDING, keyed by the key that plays them, valued
     * by the seconds each has left to ring.
     *
     * This used to be `litWhite` / `litBlack`, two single indices — so a
     * second key STOLE the first key's highlight and a child pressing three
     * keys saw one lit while hearing three. `ctx.audio.note` has always built
     * a fresh oscillator per call, so the sound was polyphonic all along; it
     * was the model and the picture that were not.
     *
     * A set rather than a pointer, and a countdown rather than a flag: a key
     * stays lit for exactly as long as its own note rings, and a new press
     * never cancels an existing one.
     */
    const sounding = new Map<string, number>()

    /** Which entry of `LENGTHS` every note currently rings for. */
    let length = START
    // The souvenir names the notes actually played — not how many. White
    // keys keep the on-screen letter (A-J); black keys are named by their
    // sharp (C#, D#, ...) rather than by the key that played them.
    const played: string[] = []
    // The same list, in the shape something outside this cartridge can use.
    // Held by reference, so the exporter reads the melody as it grows rather
    // than a copy taken at some arbitrary moment.
    const tune: Tune = { notes: [] }
    latest = tune

    /**
     * THE RECORDING HEAD, and the two things it is not.
     *
     * It is not a metronome: nothing counts a bar, nothing quantises, and a
     * child who leaves four seconds between two notes gets four seconds back.
     * And it does not re-arm: a phrase plays through once and stops, and the
     * only thing that ever starts it again is SPACE, which is the child
     * asking. `drum` records the same way and for the same reasons — one bar,
     * one button — so a child who has found one instrument's P has found the
     * other's.
     */
    type Struck = { key: string; hz: number; name: string; at: number }
    const phrase: Struck[] = []
    let recording = false
    /** Seconds since recording began. Only ever moves while recording. */
    let recAt = 0
    let playing = false
    let playAt = 0
    /** How much of the phrase has been played back so far. */
    let playHead = 0

    /** What the exporter should save: the recorded phrase if there is one. */
    const publish = (): void => {
      latest = phrase.length > 0
        ? { notes: phrase.map((n) => ({ hz: n.hz, label: n.name, at: n.at })) }
        : tune
    }

    // The live screen, learned from the grid every frame. It exists before
    // the first draw so the cartridge is safe whatever order a host calls it
    // in; 18 rows is what `aspect: 1` at 30 columns comes to.
    let screen = screenOf(COLS, 18)

    /** One note struck: it starts ringing, and it is remembered. */
    const strike = (key: string, hz: number, name: string): void => {
      const ms = LENGTHS[length]!
      sounding.set(key, ms / 1000)
      played.push(name)
      tune.notes.push({ hz, label: name })
      // A note struck while the head is down goes onto the phrase, at the
      // moment it was actually struck. Notes played back are struck through
      // here too, so the keys light for them exactly as they light for a
      // finger — but the head is never down during playback, so a phrase can
      // never record itself.
      if (recording) phrase.push({ key, hz, name, at: recAt })
      ctx.audio.note(hz, ms)
    }

    return {
      onKey(k) {
        // A HELD KEY IS ONE NOTE, NOT FORTY. Auto-repeat arrives as a fresh
        // keydown roughly every 30ms for as long as a finger rests on a key,
        // and a child WILL rest a finger on a key. Letting those through
        // stacks a new oscillator on each one and writes each one into the
        // souvenir, so a leaned-on `A` reads back as forty A's. A real piano
        // key held down is one note; so is this one.
        if (k.repeat) return

        const key = k.key.toLowerCase()

        /**
         * P — THE RECORD BUTTON, and it works like the one on a tape machine
         * a child's grandparent had: press it and it listens, press it again
         * and it stops. Starting a new recording throws the last one away,
         * because two phrases would need a way to choose between them and
         * this instrument is a piano.
         */
        if (key === 'p') {
          if (recording) {
            recording = false
          } else {
            recording = true
            playing = false
            recAt = 0
            phrase.length = 0
          }
          publish()
          return
        }

        // SPACE — play the phrase back, from the top. Pressing it again
        // restarts it, which is a child asking to hear it again; nothing else
        // ever starts it, and it stops itself at the end.
        if (k.key === ' ' || key === 'spacebar') {
          if (phrase.length === 0) return
          recording = false
          playing = true
          playAt = 0
          playHead = 0
          return
        }

        const white = WHITE.find((w) => w.key === key)
        if (white) {
          strike(white.key, white.hz, white.label)
          return
        }

        const black = BLACK.find((b) => b.key === key)
        if (black) {
          strike(black.key, black.hz, black.name)
          return
        }

        // The number row sets how long every note rings, shortest to longest.
        // It does not sound anything of its own: a child is in the middle of
        // playing, and an unpitched click between two notes is noise. The
        // track under the keyboard moves, and that is the answer.
        //
        // A length set mid-chord leaves the notes already ringing alone —
        // they were struck at the length that was set then, and re-timing
        // them under a child's fingers is exactly the cancellation this
        // cartridge just stopped doing.
        const n = LENGTHS.length
        if (key.length === 1 && key >= '1' && key <= '9') {
          length = Math.min(n - 1, Number(key) - 1)
        }
      },

      /**
       * THE ONLY CLOCK THIS CARTRIDGE HAS, and all it does is let notes stop.
       *
       * `piano` deliberately had no `tick` while a key's highlight was a
       * single index that the next press overwrote — there was nothing time
       * could change. A set of notes that each ring for a while is a
       * different thing: something has to put them out. Nothing here decides
       * anything, nothing re-arms, and the frame loop is already running for
       * every live cartridge, so this costs nothing new.
       *
       * Seconds, not frames: a note must last as long on a 120Hz display as
       * it does on a 60Hz one, and `ctx.audio.note` was given milliseconds.
       */
      tick(dt) {
        for (const [key, left] of sounding) {
          const next = left - dt
          if (next <= 0) sounding.delete(key)
          else sounding.set(key, next)
        }

        // The recording head, which only ever counts.
        if (recording) recAt += dt

        // Playback: every note whose moment has arrived, struck exactly as a
        // finger strikes it — so the key lights and the note rings at the
        // length it is set to now. It ends when the phrase does and re-arms
        // nothing.
        if (!playing) return
        playAt += dt
        while (playHead < phrase.length && phrase[playHead]!.at <= playAt) {
          const note = phrase[playHead]!
          playHead += 1
          strike(note.key, note.hz, note.name)
        }
        if (playHead >= phrase.length) playing = false
      },

      draw(c: CanvasLike) {
        // THE SCREEN, learned live from the grid every frame: a window drag
        // or a tablet rotation re-lays the whole instrument. Everything below
        // is read off `screen`, never off COLS/ASPECT, so a wider terminal
        // gets a bigger keyboard in the middle of it rather than a keyboard
        // stretched across it.
        const s = screenOf(Math.max(20, c.w), Math.max(12, c.h))
        if (!sameStage(s, screen)) screen = s
        const { x: ox, y: oy, w: W, h: H } = screen

        c.clear()

        // The case the keyboard sits in: the character idiom's own court —
        // box-drawing walls and the double ground rail along the foot, which
        // is the same frame `memory`, `count` and `spot` draw in the
        // transcript, glyph for glyph.
        // The case, and only ever the case. It was briefly the record lamp —
        // lit in the second tone while the head was down — and a tinted border
        // is not something a six-year-old notices. The badge under the
        // keyboard says what the machine is doing now.
        court(c, screen, 'plain')

        // Seven white keys, spread across the case's interior and centred in
        // whatever remainder is left over.
        const cell = Math.max(2, Math.floor((W - 2) / WHITE.length))
        const span = cell * WHITE.length
        const left = ox + 1 + Math.floor((W - 2 - span) / 2)
        /** The seam between white key i and white key i+1, as a column. */
        const seam = (i: number): number => left + (i + 1) * cell
        /**
         * A white key's own columns: from the seam on its left (or the case
         * wall, for the first) to the seam on its right (or the case wall,
         * for the last) — the seam belongs to neither key it divides.
         *
         * Derived rather than assumed. A letter placed at `i * cell` drifts
         * against its own key as soon as the remainder makes one key a column
         * wider than the rest, which is exactly what the leftmost key is.
         */
        const keyL = (i: number): number => (i === 0 ? left : seam(i - 1) + 1)
        const keyR = (i: number): number =>
          (i === WHITE.length - 1 ? left + span - 1 : seam(i) - 1)
        const keyMid = (i: number): number => Math.floor((keyL(i) + keyR(i)) / 2)

        // The rows of the case, top to bottom: the black keys' own letters,
        // the keys themselves, the letter on each white key, the length
        // control, and then the floor. There is no pointer row any more — a pointer was how a
        // MONOPHONIC keyboard said which single key was last pressed, and a
        // keyboard where three keys can sound at once says it by lighting all
        // three instead.
        const caps = oy + 1
        const top = oy + 2
        // The badge takes the two rows above the case's ground rail, so the
        // keys give up two of their thirteen and the transport is UNDER the
        // instrument, where the transport on an instrument is.
        const bottom = oy + H - 4 - BADGE_ROWS
        const letters = oy + H - 3 - BADGE_ROWS
        const dial = oy + H - 2 - BADGE_ROWS
        const badgeTop = oy + H - 1 - BADGE_ROWS
        const body = Math.max(1, bottom - top + 1)
        /** How far down the seam a black key reaches. A real piano's do not
         *  reach the front edge, and that is what makes a keyboard read as a
         *  keyboard rather than as a grid. */
        const blackH = Math.max(2, Math.round(body * 0.45))
        const blackW = Math.max(1, cell - 2)

        // Each black key's own letter, sitting ON the seam that key stands on
        // rather than at a hard-coded spacing that drifted apart from the keys
        // as soon as the terminal got wider. One `text` op with the gaps built
        // in, so what a child reads is the keyboard itself:
        //
        //     W   E       T   Y   U
        //
        // — including the hole where `R` would be. Latin letters on a canvas
        // are the house rule (README rule 4); Hebrew never reaches one.
        const blackL = (i: number): number => seam(i) - Math.floor(blackW / 2)
        /**
         * Where a black key's letter goes: the SEAM column itself, which is
         * always inside the bar however wide the bar came out. So one column
         * carries the whole story of that key top to bottom — its letter, the
         * black key under the letter, and the white keys' divider under that.
         */
        const blackMid = (i: number): number => seam(i)

        const strip = Array.from({ length: span + 1 }, () => ' ')
        BLACK.forEach((b) => { strip[blackMid(b.at) - left] = b.label })
        c.text(left, caps, strip.join('').replace(/\s+$/, ''), 'plain')

        // The seams. A seam that carries a black key starts BELOW it, so the
        // black key and the divider are one continuous line down the
        // keyboard; the two seams with no black key (E-F, and the far right)
        // run the whole way, exactly as they do on a real one.
        for (let i = 0; i < WHITE.length - 1; i++) {
          const black = BLACK.some((b) => b.at === i)
          const from = black ? top + blackH : top
          // The same wall glyph the court is drawn with, so a seam and the
          // case around it are one continuous line of the same weight.
          for (let y = from; y <= bottom; y++) c.put(seam(i), y, WALL, 'plain')
        }

        // The black keys: solid bars standing at the top of their seams.
        // MONOCHROME — the one second tone is the key the child just pressed,
        // and this is the black keys' half of that.
        BLACK.forEach((b) => {
          const on = sounding.has(b.key)
          const x0 = blackL(b.at)
          for (let y = top; y < top + blackH; y++) {
            for (let dx = 0; dx < blackW; dx++) {
              c.put(x0 + dx, y, BLACK_KEY, on ? 'win' : 'plain')
            }
          }
        })

        WHITE.forEach((w, i) => {
          const on = sounding.has(w.key)

          // A SOUNDING WHITE KEY IS A KEY THAT IS DOWN: its front section —
          // the part of it no black key stands on — fills solid for as long
          // as its note rings. A lit letter alone was legible enough when
          // exactly one key could be lit at a time; three lit letters in a
          // row of seven are not, and the thing a child is looking for is the
          // KEY, not the label under it.
          //
          // MONOCHROME: `plain` is the whole instrument, and the one second
          // tone marks what is sounding right now — which is the only thing
          // on this canvas the child is doing.
          if (on) {
            const bar = BLACK_KEY.repeat(Math.max(1, keyR(i) - keyL(i) + 1))
            for (let y = top + blackH; y <= bottom; y++) {
              c.text(keyL(i), y, bar, 'win')
            }
          }
          c.text(keyMid(i), letters, w.label, on ? 'win' : 'plain')
        })

        // ---- how long a note rings, drawn as a CONTROL --------------------
        //
        // A short track under the keyboard whose SOLID length is the setting.
        // Not a digit, not a percentage, not a counter: nothing on a canvas
        // here is ever a number painted as a value, and a child who wanted a
        // readout would have asked for a calculator.
        //
        // `plain`, deliberately. The one second tone belongs to what is
        // SOUNDING; a setting that sits there all game long would compete
        // with the keys for it and win, just by never going out.
        const segW = Math.max(1, Math.min(
          Math.floor(cell / 2),
          Math.floor((W - 2) / LENGTHS.length),
        ))
        const track = segW * LENGTHS.length
        const dialX = Math.max(ox + 1, ox + Math.round((W - track) / 2))
        const lit = (length + 1) * segW
        c.text(dialX, dial,
          DIAL_ON.repeat(lit) + DIAL_OFF.repeat(Math.max(0, track - lit)),
          'plain')

        // ---- what the machine is doing, under the keyboard ---------------
        //
        // PIXELS, so the symbol can be two rows tall: the shape ops measure in
        // logical pixels (`PX_PER_CELL` to a cell) while everything above this
        // line is characters. It is the one thing on this canvas that is not a
        // key, a letter or a rule, which is exactly why it is the thing a child
        // sees first while it is up.
        const midX = (ox + W / 2) * PX_PER_CELL
        const midY = (badgeTop + BADGE_ROWS / 2) * PX_PER_CELL

        if (recording) {
          // The record dot. Filled, round, and the only round thing here.
          c.disc(midX, midY, DOT_R, 'win')
        } else if (playing) {
          // The play triangle, pointing the way the sound is going. Built out
          // of columns because the canvas has no polygon — the same way
          // `drum` draws the wedge on its clap pad.
          const h = DOT_R * 2
          const w = DOT_R * 2
          for (let i = 0; i < w; i++) {
            const t = Math.max(1, Math.round(h * (1 - i / w)))
            c.rect(midX - Math.round(w / 2) + i, midY - t / 2, 1, t, 'win')
          }
        }
      },

      // Names the notes played, never how many. A child who mounts `piano`
      // and leaves without pressing a key gets no souvenir at all — never a
      // bare "0" — and a long improvisation is capped rather than spelled
      // out in full, with an ellipsis marking what was left off.
      souvenir: () => {
        if (played.length === 0) return ''
        const CAP = 8
        const notes = played.slice(0, CAP).join(' ') + (played.length > CAP ? ' …' : '')
        return ctx.t('piano.souvenir', { notes: isolate(notes) })
      },
    }
  },
}

export default cartridge
