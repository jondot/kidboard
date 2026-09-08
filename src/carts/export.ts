import type { Locale, Tone } from '../types'
import { CELL_ASPECT } from '../runtime/GridCanvas'
import { PX_PER_CELL } from '../runtime/shapes'
import { packCart } from './codec'
import { encodeBitmap } from './pixels'
import { GROUND, INK, fromRows, type Bitmap } from './art'
import { cartridgeImage, titleFor } from './shell'
import { BLINK, BLINK_LABEL } from './samples'
import { PACKED } from './packed'
import { packedArt } from './packedArt'
import type { CartManifest } from './manifest'
import type { Bytes } from './png'
import { currentDrawing } from '../cartridges/draw/cartridge'
import { currentTune } from '../cartridges/piano/cartridge'
import { currentBeat } from '../cartridges/drum/cartridge'

/**
 * Saving a cart.
 *
 * One path, used by everything: a manifest plus a two-colour bitmap becomes a
 * PNG with the manifest in its `kbRT` chunk. What differs between a shipped
 * sample and a child's own drawing is only what goes into the two arguments.
 *
 * THE FILE IS A PICTURE OF A CARTRIDGE. It used to be the label art blown up
 * on a plain matte, so a folder of saved games was a folder of abstract
 * squares. `shell.ts` draws the object — shell, grip ridges, label window,
 * title, connector fingers — with the game's own picture in the window, which
 * is the PICO-8 idea and the reason a directory of carts reads as a shelf.
 */
export async function buildCartPng(
  manifest: CartManifest, label: Bitmap, locale: Locale = 'en',
): Promise<Bytes | null> {
  const art = cartridgeImage(label, titleFor(manifest, locale))
  const png = await encodeBitmap(art, GROUND, INK)
  if (!png) return null
  return packCart(png, manifest)
}

/** A filename a six-year-old can find again. */
export function cartFilename(m: CartManifest, locale: Locale): string {
  const word = m.name[locale] ?? m.name.en ?? m.id
  return `${word.replace(/[^\p{L}\p{N}_-]+/gu, '') || 'cart'}.png`
}

// ---- a child's own drawing ----------------------------------------------

/**
 * What this module needs a drawing to be, and no more.
 *
 * `draw` keeps its picture as plain JSON precisely so it can be saved, but
 * the exact type of a mark is that cartridge's business and has already
 * changed once — a semantic tone at first, a bare `1` later. Reading the
 * shape structurally rather than importing the type means a change there
 * costs nothing here, and an unrecognised mark simply draws in the first
 * crayon rather than failing to draw at all.
 */
export type SavedDrawing = {
  w: number
  h: number
  /**
   * One dot's size in LOGICAL PIXELS, when the pad draws a lattice of dots
   * rather than a grid of character cells. Optional, because a picture that
   * does not carry it is a grid of squares — which is what the pad used to be.
   */
  dot?: { w: number; h: number }
  marks: Record<string, Tone>
}

const TONES: readonly Tone[] = ['plain', 'art', 'info', 'win', 'magic', 'warm', 'cool']

export function asDrawing(x: unknown): SavedDrawing | null {
  if (typeof x !== 'object' || x === null) return null
  const d = x as { w?: unknown; h?: unknown; marks?: unknown }
  if (typeof d.w !== 'number' || typeof d.h !== 'number') return null
  if (typeof d.marks !== 'object' || d.marks === null) return null

  const marks: Record<string, Tone> = {}
  for (const [key, value] of Object.entries(d.marks as Record<string, unknown>)) {
    if (!/^-?\d+,-?\d+$/.test(key)) continue
    marks[key] = TONES.includes(value as Tone) ? (value as Tone) : 'warm'
  }
  const w = Math.max(1, Math.round(d.w))
  const h = Math.max(1, Math.round(d.h))
  if (Object.keys(marks).length === 0) return null

  const raw = (x as { dot?: unknown }).dot as { w?: unknown; h?: unknown } | undefined
  const dot = typeof raw?.w === 'number' && typeof raw.h === 'number'
    && raw.w > 0 && raw.h > 0 && raw.w <= 64 && raw.h <= 64
    ? { w: Math.round(raw.w), h: Math.round(raw.h) }
    : undefined
  return dot ? { w, h, dot, marks } : { w, h, marks }
}

const marksOf = (d: SavedDrawing): { x: number; y: number }[] =>
  Object.keys(d.marks).map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x: x ?? 0, y: y ?? 0 }
  })

/** How long the picture takes to draw itself back. Never hurried. */
const REVEAL_SECONDS = 2.5

/**
 * The cart code for a saved drawing: the picture draws itself back, one mark
 * at a time, and then rests. It never re-arms and never asks for anything —
 * the round ends when the child says it ends.
 */
export function drawingCode(d: SavedDrawing): string {
  const picture = JSON.stringify({ w: d.w, h: d.h, dot: d.dot ?? null, marks: d.marks })
  return [
    `var D = ${picture};`,
    'var order = Object.keys(D.marks);',
    `var RATE = Math.max(1, order.length / ${REVEAL_SECONDS});`,
    'var t = 0;',
    'kb.game(function (ctx) {',
    '  return {',
    '    tick: function (dt) { t += dt; },',
    '    draw: function (c) {',
    '      c.clear();',
    '      var shown = Math.min(order.length, Math.floor(t * RATE) + 1);',
    // Two pads have existed: a lattice of dots in the PIXEL field, and a grid
    // of character cells. A saved picture says which it was, and this replays
    // it the way it was drawn rather than translating between the two.
    '      var ox, oy;',
    '      if (D.dot) {',
    '        ox = Math.max(0, Math.floor((c.pw - D.w * D.dot.w) / 2));',
    '        oy = Math.max(0, Math.floor((c.ph - D.h * D.dot.h) / 2));',
    '      } else {',
    '        ox = Math.max(0, Math.floor((c.w - D.w) / 2));',
    '        oy = Math.max(0, Math.floor((c.h - D.h) / 2));',
    '      }',
    '      for (var i = 0; i < shown; i++) {',
    '        var at = order[i].split(",");',
    '        var x = Number(at[0]);',
    '        var y = Number(at[1]);',
    '        var ink = D.marks[order[i]];',
    '        if (D.dot) c.rect(ox + x * D.dot.w, oy + y * D.dot.h, D.dot.w, D.dot.h, ink);',
    '        else c.put(ox + x, oy + y, "█", ink);',
    '      }',
    '    },',
    '    souvenir: function () { return ctx.t("done"); }',
    '  };',
    '});',
  ].join('\n')
}

/** The `{ cols, aspect }` that resolves back to exactly `w` by `h` cells. */
export function sizeForGrid(w: number, h: number): { cols: number; aspect: number } {
  const cols = Math.max(8, Math.round(w))
  const rows = Math.max(4, Math.round(h))
  return { cols, aspect: (cols * CELL_ASPECT) / rows }
}

/**
 * The grid a saved picture needs. A dot pad is measured in logical pixels —
 * `PX_PER_CELL` of them to a cell — so its cell count is its pixel size
 * divided by that, and a cell pad is already in cells.
 */
export function sizeForDrawing(d: SavedDrawing): { cols: number; aspect: number } {
  if (!d.dot) return sizeForGrid(d.w, d.h)
  return sizeForGrid(
    Math.ceil((d.w * d.dot.w) / PX_PER_CELL),
    Math.ceil((d.h * d.dot.h) / PX_PER_CELL),
  )
}

/**
 * The picture on the front of a saved drawing, CROPPED to what was drawn.
 *
 * The pad is a 62 x 46 lattice of dots and a child's first drawing is usually
 * a small thing somewhere inside it. Rendering the whole empty page would put
 * a few specks on a card sixteen half-cells wide — a label that is honestly
 * the picture and yet shows nothing of it. So the label is the drawing's own
 * bounding box, with one dot of margin so nothing touches the edge.
 *
 * Only the LABEL is cropped. The cart replays every mark at the position it
 * was drawn in; a child's picture is theirs, and moving it would not be.
 */
export function drawingBitmap(d: SavedDrawing): Bitmap {
  const pw = Math.max(1, d.w)
  const ph = Math.max(1, d.h)
  const marks = marksOf(d).filter((m) => m.x >= 0 && m.y >= 0 && m.x < pw && m.y < ph)
  if (marks.length === 0) return { w: pw, h: ph, on: new Uint8Array(pw * ph) }

  const pad = 1
  const x0 = Math.max(0, Math.min(...marks.map((m) => m.x)) - pad)
  const y0 = Math.max(0, Math.min(...marks.map((m) => m.y)) - pad)
  const x1 = Math.min(pw - 1, Math.max(...marks.map((m) => m.x)) + pad)
  const y1 = Math.min(ph - 1, Math.max(...marks.map((m) => m.y)) + pad)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const on = new Uint8Array(w * h)
  for (const { x, y } of marks) on[(y - y0) * w + (x - x0)] = 1
  return { w, h, on }
}

/**
 * The manifest for a saved drawing. The id carries a stamp so two pictures
 * saved on two days are two carts rather than one overwriting the other.
 */
export function drawingManifest(d: SavedDrawing, stamp: number): CartManifest {
  const tag = Math.abs(Math.round(stamp)).toString(36).slice(-4)
  return {
    apiVersion: 1,
    id: `my-drawing-${tag}`,
    name: { en: `mypicture${tag}`, he: `הציורשלי${tag}` },
    title: { en: 'my picture', he: 'הציור שלי' },
    author: '',
    locales: ['en', 'he'],
    hints: {},
    strings: {
      en: { done: 'that is your picture' },
      he: { done: 'זה הציור שלך' },
    },
    code: drawingCode(d),
    // The saved picture must come back the shape it was drawn: `rowsFor`
    // computes rows as `cols * CELL_ASPECT / aspect`, so inverting it here is
    // what makes the cart's grid the drawing's own grid rather than an
    // approximation of it.
    size: sizeForDrawing(d),
  }
}

// ---- a child's own tune --------------------------------------------------

/**
 * What this module needs a melody to be, and no more.
 *
 * `piano` keeps its tune as plain JSON for exactly this reason, and it is
 * read STRUCTURALLY rather than by importing the type — the same choice, for
 * the same reason, as `asDrawing` above: that cartridge is free to change
 * shape without breaking a saved cart.
 *
 * A TUNE CARRIES ITS RHYTHM WHEN IT WAS RECORDED, and not otherwise. `piano`
 * has a recording head now (`P`), and a phrase taken through it timestamps
 * every note — `at`, in seconds from the moment recording began. Free play
 * still has no timestamps, because nobody was recording it, and saves as the
 * even beat it always did. So `at` is optional here and the cart plays the
 * real gaps only when EVERY note has one: a half-timed melody would be a
 * rhythm nobody played.
 */
export type SavedTune = {
  notes: { hz: number; label: string; at?: number }[]
  /** True when every note came out of a recording. */
  timed?: boolean
}

/** Longest melody a cart keeps. Past this it is a file, not a tune. */
const MAX_NOTES = 64
/** Longest a recorded phrase may run, in seconds. A nap is not a tune. */
const MAX_AT = 300
/** Hearable, roughly. Anything outside is not a note somebody played. */
const MIN_HZ = 20
const MAX_HZ = 8000

export function asTune(x: unknown): SavedTune | null {
  if (typeof x !== 'object' || x === null) return null
  const raw = (x as { notes?: unknown }).notes
  if (!Array.isArray(raw)) return null

  const notes: SavedTune['notes'] = []
  for (const n of raw) {
    if (typeof n !== 'object' || n === null) continue
    const hz = (n as { hz?: unknown }).hz
    if (typeof hz !== 'number' || !Number.isFinite(hz)) continue
    if (hz < MIN_HZ || hz > MAX_HZ) continue
    const label = (n as { label?: unknown }).label
    const at = (n as { at?: unknown }).at
    const timed = typeof at === 'number' && Number.isFinite(at)
      && at >= 0 && at <= MAX_AT
    notes.push({
      hz,
      label: typeof label === 'string' ? label.slice(0, 4) : '',
      ...(timed ? { at: at as number } : {}),
    })
    if (notes.length >= MAX_NOTES) break
  }
  if (notes.length === 0) return null
  // EVERY note, or none: a melody where half the notes know when they were
  // played is a rhythm nobody performed, and the even beat is the honest
  // reading of it.
  const timed = notes.every((n) => n.at !== undefined)
  return timed ? { notes, timed } : { notes: notes.map(({ hz, label }) => ({ hz, label })) }
}

/** Seconds a note is held. A walking pace: fast enough to be a tune, slow
 *  enough for a six-year-old to hear each note as its own. */
const BEAT = 0.42
/** …and how long the note is actually sounded for, in milliseconds. */
const NOTE_MS = 320

/**
 * The cart code for a saved tune: the melody plays itself back once, as a
 * little roll of bars, and then rests. SPACE plays it again — which is the
 * child asking for it, not a timer re-arming.
 *
 * MONOCHROME: the roll and the note names are one ink. The only second tone
 * is on the line that invites the child to press space, because pressing
 * space is the one thing here the child controls.
 */
export function tuneCode(t: SavedTune): string {
  // A recorded phrase already knows when each note falls; free play does not,
  // and gets the even beat. The cart reads `at` if it is there, so ONE piece
  // of code plays both and there is no second player to keep in step.
  const melody = JSON.stringify(
    t.timed
      ? t.notes
      : t.notes.map((n, i) => ({ ...n, at: Number((i * BEAT).toFixed(3)) })),
  )
  return [
    `var N = ${melody};`,
    `var BEAT = ${BEAT};`,
    `var MS = ${NOTE_MS};`,
    'var lo = N[0].hz, hi = N[0].hz;',
    'for (var i = 0; i < N.length; i++) {',
    '  if (N[i].hz < lo) lo = N[i].hz;',
    '  if (N[i].hz > hi) hi = N[i].hz;',
    '}',
    'var span = hi - lo;',
    'kb.game(function (ctx) {',
    '  var t = 0;',
    '  var next = 0;',
    '  return {',
    '    onKey: function (e) {',
    '      // The child asking to hear it again. Nothing else restarts it.',
    '      if (e.key === " ") { t = 0; next = 0; }',
    '    },',
    '    tick: function (dt) {',
    '      t += dt;',
    '      while (next < N.length && t >= N[next].at) {',
    '        ctx.audio.note(N[next].hz, MS);',
    '        next++;',
    '      }',
    '    },',
    '    draw: function (c) {',
    '      c.clear();',
    '      var floorY = (c.h - 2) * 8;',
    '      var top = 4;',
    '      var colw = Math.max(2, Math.floor(c.pw / N.length));',
    '      for (var i = 0; i < next; i++) {',
    '        var f = span > 0 ? (N[i].hz - lo) / span : 0.5;',
    '        var bar = Math.max(2, Math.round(f * (floorY - top)) + 2);',
    '        c.rect(i * colw + 1, floorY - bar, Math.max(1, colw - 2), bar, "plain");',
    '      }',
    '      if (next > 0) c.text(0, c.h - 2, N[next - 1].label, "plain");',
    '      if (next >= N.length) c.text(0, c.h - 1, ctx.t("again"), "win");',
    '    },',
    '    souvenir: function () { return ctx.t("done"); }',
    '  };',
    '});',
  ].join('\n')
}

/** How tall the little roll on the label is, in bitmap rows. */
const LABEL_ROWS = 12
/** Widest a label roll gets. A long improvisation is shown, not spelled out. */
const LABEL_NOTES = 24

/** The melody as the picture on the front of the cart: one bar per note. */
export function tuneBitmap(t: SavedTune): Bitmap {
  const notes = t.notes.slice(0, LABEL_NOTES)
  const hzs = notes.map((n) => n.hz)
  const lo = Math.min(...hzs)
  const span = Math.max(...hzs) - lo
  const w = Math.max(1, notes.length * 2)
  const on = new Uint8Array(w * LABEL_ROWS)
  notes.forEach((n, i) => {
    const f = span > 0 ? (n.hz - lo) / span : 0.5
    const bar = Math.max(1, Math.round(f * (LABEL_ROWS - 3)) + 2)
    for (let y = LABEL_ROWS - bar; y < LABEL_ROWS; y++) {
      on[y * w + i * 2] = 1
      on[y * w + i * 2 + 1] = 1
    }
  })
  return { w, h: LABEL_ROWS, on }
}

/**
 * The manifest for a saved tune. Same stamped id as a drawing, for the same
 * reason: two melodies saved on two days are two carts.
 */
export function tuneManifest(t: SavedTune, stamp: number): CartManifest {
  const tag = Math.abs(Math.round(stamp)).toString(36).slice(-4)
  // Wide enough that every note gets a bar of its own, and never so wide that
  // a four-note tune is four specks in a field.
  const cols = Math.max(20, Math.min(64, t.notes.length * 2 + 4))
  return {
    apiVersion: 1,
    id: `my-tune-${tag}`,
    name: { en: `mytune${tag}`, he: `הלחןשלי${tag}` },
    title: { en: 'my tune', he: 'הלחן שלי' },
    author: '',
    locales: ['en', 'he'],
    hints: { en: ['SPACE play it again'], he: ['SPACE לנגן שוב'] },
    strings: {
      en: { done: 'that is your tune', again: 'space to play it again' },
      he: { done: 'זה הלחן שלך', again: 'רווח כדי לנגן שוב' },
    },
    code: tuneCode(t),
    size: sizeForGrid(cols, 14),
    emoji: '🎹',
  }
}

// ---- a child's own beat --------------------------------------------------

/**
 * What this module needs a recorded bar to be, and no more.
 *
 * `drum` keeps its loop as a plain array for exactly this reason, and it is
 * read STRUCTURALLY rather than by importing the type — the same choice, for
 * the same reason, as `asDrawing` and `asTune` above.
 *
 * A REST IS A REAL STEP, so `null` survives. A bar of eight kicks and a bar of
 * four kicks and four rests are different beats, and flattening the rests out
 * would turn the second into the first played twice as fast.
 */
export type SavedBeat = { steps: (number | null)[] }

/** The four pads, in the order `drum` lays them out. */
const PAD_COUNT = 4
/** Steps in a bar, and seconds per step: `drum`'s own two constants. */
const BEAT_STEPS = 8
const BEAT_STEP = 0.34

export function asBeat(x: unknown): SavedBeat | null {
  if (typeof x !== 'object' || x === null) return null
  const raw = (x as { steps?: unknown }).steps
  if (!Array.isArray(raw)) return null

  const steps: (number | null)[] = []
  for (const v of raw.slice(0, BEAT_STEPS)) {
    const i = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1
    steps.push(i >= 0 && i < PAD_COUNT ? i : null)
  }
  while (steps.length < BEAT_STEPS) steps.push(null)
  // A bar of nothing is not a beat somebody recorded. Nothing to save, so no
  // row appears — the same rule an empty drawing and a silent piano follow.
  return steps.some((v) => v !== null) ? { steps } : null
}

/**
 * The cart code for a saved beat: the bar plays itself through ONCE, drawing
 * the same strip `drum` draws — a bar per hit, its height the pad that made it
 * — and then rests. SPACE plays it again, which is the child asking rather
 * than a timer re-arming. Exactly the shape a saved tune already has.
 *
 * The four sounds are written out here rather than imported, for the same
 * reason the shape is read structurally: this string has to run in a Worker
 * with no modules, and a cart is a standalone thing.
 */
export function beatCode(b: SavedBeat): string {
  const bar = JSON.stringify(b.steps)
  return [
    `var B = ${bar};`,
    `var STEP = ${BEAT_STEP};`,
    // Heavy kick, light hat: the same weights the drum kit draws its loop with.
    'var WEIGHT = [1, 0.75, 0.35, 0.55];',
    'kb.game(function (ctx) {',
    '  var t = 0;',
    '  var at = -1;',
    '  function strike(i) {',
    '    if (i === 0) { ctx.audio.note(90, 170); return; }',
    '    ctx.audio.noise([0, 130, 26, 62][i]);',
    '  }',
    '  return {',
    '    onKey: function (e) {',
    '      // The child asking to hear it again. Nothing else restarts it.',
    '      if (e.key === " ") { t = 0; at = -1; }',
    '    },',
    '    tick: function (dt) {',
    '      t += dt;',
    '      var step = Math.floor(t / STEP);',
    '      while (at < step && at < B.length - 1) {',
    '        at += 1;',
    '        if (B[at] !== null) strike(B[at]);',
    '      }',
    '    },',
    '    draw: function (c) {',
    '      c.clear();',
    '      var baseY = Math.round(c.ph * 0.72);',
    '      var slot = Math.max(6, Math.floor(c.pw / B.length));',
    '      var wide = slot * B.length;',
    '      var x0 = Math.round((c.pw - wide) / 2);',
    '      var tall = Math.max(8, Math.round(c.ph * 0.4));',
    '      c.rect(x0, baseY, wide, 2, "plain");',
    '      for (var i = 0; i < B.length; i++) {',
    '        var sx = x0 + i * slot;',
    '        if (B[i] === null) { c.rect(sx + slot / 2 - 2, baseY - 4, 4, 3, "plain"); }',
    '        else {',
    '          var bh = Math.max(4, Math.round(tall * WEIGHT[B[i]]));',
    '          c.rect(sx + 2, baseY - bh, Math.max(4, slot - 4), bh, "plain");',
    '        }',
    '      }',
    // The playhead: a ring rolling along under the line, and it stops where
    // the bar stops. Nothing about this re-arms.
    '      if (at >= 0 && at < B.length) {',
    '        c.circle(x0 + at * slot + slot / 2, baseY + 6, 3, "plain");',
    '      }',
    '      if (at >= B.length - 1) c.text(0, c.h - 1, ctx.t("again"), "win");',
    '    },',
    '    souvenir: function () { return ctx.t("done"); }',
    '  };',
    '});',
  ].join('\n')
}

/** How tall the bar chart on the label stands. */
const BEAT_ROWS = 12

/**
 * The beat as the picture on the front of the cart: the recorded bar, drawn
 * the way the kit draws it — a column per step, its height the pad that made
 * it, a single dot for a rest. A child recognises their own rhythm by shape.
 */
export function beatBitmap(b: SavedBeat): Bitmap {
  const weight = [1, 0.75, 0.35, 0.55]
  const w = Math.max(1, b.steps.length * 2)
  const on = new Uint8Array(w * BEAT_ROWS)
  b.steps.forEach((s, i) => {
    const bar = s === null ? 1 : Math.max(2, Math.round(weight[s]! * (BEAT_ROWS - 2)))
    for (let y = BEAT_ROWS - bar; y < BEAT_ROWS; y++) {
      on[y * w + i * 2] = 1
      on[y * w + i * 2 + 1] = 1
    }
  })
  return { w, h: BEAT_ROWS, on }
}

/** The manifest for a saved beat. Stamped, like a drawing and a tune. */
export function beatManifest(b: SavedBeat, stamp: number): CartManifest {
  const tag = Math.abs(Math.round(stamp)).toString(36).slice(-4)
  return {
    apiVersion: 1,
    id: `my-beat-${tag}`,
    name: { en: `mybeat${tag}`, he: `הקצבשלי${tag}` },
    title: { en: 'my beat', he: 'הקצב שלי' },
    author: '',
    locales: ['en', 'he'],
    hints: { en: ['SPACE play it again'], he: ['SPACE לנגן שוב'] },
    strings: {
      en: { done: 'that is your beat', again: 'space to play it again' },
      he: { done: 'זה הקצב שלך', again: 'רווח כדי לנגן שוב' },
    },
    code: beatCode(b),
    size: sizeForGrid(Math.max(20, b.steps.length * 3), 12),
    emoji: '🥁',
  }
}

// ---- what the panel can offer -------------------------------------------

export type Savable = {
  key: string
  /** Shown on the row. Already in the child's language. */
  label: string
  build(): Promise<{ png: Bytes; filename: string } | null>
}

/**
 * What there is to save right now.
 *
 * The sample cart is always here. A drawing appears the moment a child has
 * drawn one — `draw` was written to keep its picture as plain JSON for
 * exactly this, so saving is one read and a `JSON.stringify`.
 */
export function savables(locale: Locale, now: number = Date.now()): Savable[] {
  const out: Savable[] = [{
    key: 'sample',
    label: BLINK.title[locale] ?? BLINK.title.en ?? 'blink',
    build: async () => {
      const png = await buildCartPng(BLINK, BLINK_LABEL, locale)
      return png ? { png, filename: cartFilename(BLINK, locale) } : null
    },
  }]

  const drawing = asDrawing(currentDrawing())
  if (drawing) {
    const manifest = drawingManifest(drawing, now)
    out.push({
      key: 'drawing',
      label: manifest.title[locale] ?? manifest.title.en ?? 'my picture',
      build: async () => {
        const png = await buildCartPng(manifest, drawingBitmap(drawing), locale)
        return png ? { png, filename: cartFilename(manifest, locale) } : null
      },
    })
  }

  const tune = asTune(currentTune())
  if (tune) {
    const manifest = tuneManifest(tune, now)
    out.push({
      key: 'tune',
      label: manifest.title[locale] ?? manifest.title.en ?? 'my tune',
      build: async () => {
        const png = await buildCartPng(manifest, tuneBitmap(tune), locale)
        return png ? { png, filename: cartFilename(manifest, locale) } : null
      },
    })
  }

  const beat = asBeat(currentBeat())
  if (beat) {
    const manifest = beatManifest(beat, now)
    out.push({
      key: 'beat',
      label: manifest.title[locale] ?? manifest.title.en ?? 'my beat',
      build: async () => {
        const png = await buildCartPng(manifest, beatBitmap(beat), locale)
        return png ? { png, filename: cartFilename(manifest, locale) } : null
      },
    })
  }

  /**
   * The built-in games, as real carts.
   *
   * `npm run pack-carts` bundled each one into a standalone script at build
   * time, so the file a child gets really contains the game — the same code
   * that runs when they drop it back in. Nothing is pre-loaded: these are
   * offered, and a cart exists only once somebody chooses to put one back.
   *
   * Offered LAST, after the child's own picture and their own tune, because
   * what a child made themselves is the thing worth reaching first.
   *
   * Only in a language the game actually speaks: a Hebrew-reading child is
   * not offered `pop`, whose whole mechanic is pressing a Latin letter.
   */
  for (const manifest of PACKED) {
    if (!manifest.locales.includes(locale)) continue
    out.push({
      key: `packed:${manifest.id}`,
      label: manifest.title[locale] ?? manifest.title.en ?? manifest.id,
      build: async () => {
        const png = await buildCartPng(manifest, packedArt(manifest.id) ?? PLAIN_LABEL, locale)
        return png ? { png, filename: cartFilename(manifest, locale) } : null
      },
    })
  }
  return out
}

/** A blank card, for anything that has no picture of its own to show. */
export const PLAIN_LABEL = fromRows([
  'xxxxxxxx',
  'x      x',
  'x xxxx x',
  'x x  x x',
  'x xxxx x',
  'x      x',
  'xxxxxxxx',
])
