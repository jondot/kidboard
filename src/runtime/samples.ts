import type { Voice } from '../types'

/**
 * REAL RECORDINGS, WHEN THERE ARE ANY.
 *
 * Synthesis is what this box does and it is most of why the drums sound like
 * drums, but there is a ceiling on it: a recorded snare has a room in it and a
 * synthesised one never will. So a recording wins whenever one exists, and the
 * synthesiser is what plays when it does not.
 *
 * HOW TO ADD ONE. Drop the file at `public/sounds/<voice>.wav` and name it in
 * `public/sounds/index.json`:
 *
 *     { "voices": ["kick", "snare", "hat", "clap"] }
 *
 * That is the whole procedure. There is no code to change and nothing to
 * rebuild beyond the usual, and a voice with no file simply keeps its
 * synthesised version — the two can be mixed freely, and often should be:
 * a recorded kick under a synthesised hat is a perfectly ordinary kit.
 *
 * NOTHING IS SHIPPED HERE, and that is deliberate rather than an oversight.
 * Audio you find on the internet comes with a licence, and which licence a
 * child's toy may carry is not a decision this file gets to make quietly on
 * somebody else's behalf. The mechanism is here; the files are a choice.
 *
 * ONE MANIFEST REQUEST, EVER. Probing for nine files would put eight 404s in
 * the console of a machine that has none; asking once for an index that is
 * usually absent puts one there, and only until the answer is cached.
 */

/** Where the files live, relative to the page. Vite serves `public/` at `/`. */
const DIR = 'sounds'

type Manifest = { voices?: string[] }

/** `null` until asked, then the set of voices that have a file. */
let named: Set<string> | null = null
let asking: Promise<void> | null = null

/** Decoded buffers, by voice. A voice that failed to decode is not retried. */
const buffers = new Map<string, AudioBuffer | null>()

/**
 * Asks for the manifest, once. Never throws and never blocks a sound: the
 * first press of a pad always plays the synthesised voice, and a recording
 * takes over from the second press onwards if there is one.
 */
function ask(): void {
  if (named || asking) return
  asking = (async () => {
    try {
      const res = await fetch(`${DIR}/index.json`, { cache: 'force-cache' })
      if (!res.ok) { named = new Set(); return }
      const body = (await res.json()) as Manifest
      named = new Set(Array.isArray(body.voices) ? body.voices : [])
    } catch {
      named = new Set()
    }
  })()
}

function load(ctx: AudioContext, voice: string): void {
  if (buffers.has(voice)) return
  buffers.set(voice, null)
  void (async () => {
    try {
      const res = await fetch(`${DIR}/${voice}.wav`, { cache: 'force-cache' })
      if (!res.ok) return
      buffers.set(voice, await ctx.decodeAudioData(await res.arrayBuffer()))
    } catch {
      // A file that will not decode is a file this browser cannot play.
      // Silence is not the answer; the synthesiser is, and it is already there.
    }
  })()
}

/**
 * Plays the recording for `voice` into `out`, and says whether it did.
 *
 * `false` means "synthesise it" — because there is no file, because the
 * manifest has not arrived yet, or because the decode has not finished. All
 * three are the same answer from where the caller is standing.
 */
export function playSample(ctx: AudioContext, voice: Voice, out: AudioNode): boolean {
  ask()
  if (!named || !named.has(voice)) return false
  load(ctx, voice)
  const buf = buffers.get(voice)
  if (!buf) return false
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(out)
  src.start(ctx.currentTime)
  return true
}

/** Test seam: forgets the manifest and every decoded buffer. */
export function resetSamples(): void {
  named = null
  asking = null
  buffers.clear()
}
