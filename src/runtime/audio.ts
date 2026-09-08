import type { Audio, Voice } from '../types'
import { playSample } from './samples'

const KEY = 'kb.muted'

export type { Voice }

export type AudioController = Audio & {
  readonly muted: boolean
  setMuted(m: boolean): void
  unlock(): void
}

/** Equal temperament from A4 = 440Hz. */
function freq(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12)
}

export const NOTES: Record<string, number> = {
  C4: freq(-9), D4: freq(-7), E4: freq(-5), F4: freq(-4),
  G4: freq(-2), A4: freq(0), B4: freq(2),
  C5: freq(3), D5: freq(5), E5: freq(7), F5: freq(8),
  G5: freq(10), A5: freq(12), B5: freq(14),
  'C#4': freq(-8), 'D#4': freq(-6), 'F#4': freq(-3),
  'G#4': freq(-1), 'A#4': freq(1),
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(m: boolean): void {
  try {
    localStorage.setItem(KEY, m ? '1' : '0')
  } catch {
    // Persistence is a nicety. Muting still works for the session.
  }
}

/** Picks up a vendor-prefixed constructor on older WebKit; undefined anywhere else. */
function findAudioContextCtor(): (new () => AudioContext) | undefined {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  return g.AudioContext ?? g.webkitAudioContext
}

export function makeAudio(): AudioController {
  let ctx: AudioContext | null = null
  let muted = loadMuted()

  const unlock = (): void => {
    if (ctx) return
    const Ctor = findAudioContextCtor()
    if (!Ctor) return
    try {
      const created = new Ctor()
      // Browsers hand back a suspended context until a gesture resumes it;
      // this call *is* that resume, so fire it immediately and ignore
      // failure — worst case the child gets silence, not a crash.
      if (created.state !== 'running') {
        try {
          // .catch is not redundant with the try/catch: the try only catches
          // a synchronous throw, and a REJECTED resume() promise would
          // escape as an unhandled rejection.
          void created.resume().catch(() => {})
        } catch {
          // Ignored: audio is decoration.
        }
      }
      ctx = created
    } catch {
      ctx = null
    }
  }

  const envelope = (c: AudioContext, ms: number): AudioNode | null => {
    try {
      const gain = c.createGain()
      const now = c.currentTime
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(ms, 1) / 1000)
      gain.connect(c.destination)
      return gain
    } catch {
      return null
    }
  }

  const note = (hz: number, ms: number): void => {
    if (muted || !ctx) return
    try {
      const gain = envelope(ctx, ms)
      if (!gain) return
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(hz, ctx.currentTime)
      osc.connect(gain)
      osc.start()
      osc.stop(ctx.currentTime + ms / 1000)
    } catch {
      // Audio is decoration. It must never break the terminal.
    }
  }

  const noise = (ms: number): void => {
    if (muted || !ctx) return
    try {
      const rate = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? ctx.sampleRate : 44100
      const frames = Math.max(1, Math.floor((rate * ms) / 1000))
      const buffer = ctx.createBuffer(1, frames, rate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const gain = envelope(ctx, ms)
      if (!gain) return
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      src.start()
    } catch {
      // See above.
    }
  }


  // ---- PERCUSSION ---------------------------------------------------------
  //
  // WHY `note` AND `noise` ARE NOT DRUMS. A drum is not a pitch and it is not
  // a hiss; it is a pitch that COLLAPSES and a hiss that is FILTERED. The drum
  // machine used to strike a flat 90Hz sine for its kick and raw white noise
  // for everything else, and that is exactly what it sounded like: a doorbell
  // and three lengths of television static. No amount of tuning the lengths
  // fixes it, because the two things that make a drum a drum were missing.
  //
  //   1. A PITCH ENVELOPE. A real drumhead is tight at the moment of the
  //      strike and slack a heartbeat later, so its note falls. A kick that
  //      sweeps 150Hz -> 48Hz in seventy milliseconds is the whole difference
  //      between "thump" and "beep"; it is also, not by accident, how the 808
  //      did it.
  //   2. A FILTER. White noise is every frequency at once, which is a hiss. A
  //      snare is that hiss with the bottom cut away and a short pitched body
  //      underneath it; a hat is the same hiss with almost everything BUT the
  //      top cut away. One `BiquadFilterNode` per voice is the entire recipe.
  //
  // The bank lives here rather than in the cartridge on purpose. A cartridge
  // is plain data and functions — the kind of thing a sandbox can host — and
  // scheduling filter curves on a live audio graph is not that. `drum` asks
  // for `kick`; how a kick is built is the runtime's business, and a second
  // cartridge that wants one gets the same drum rather than its own guess.
  //
  // Every voice is a one-shot: nodes are created, scheduled, and left to be
  // collected when they stop. Nothing is pooled and nothing is reused, because
  // a six-year-old drumming with both hands makes perhaps ten of these a
  // second and the browser does not notice.

  /** One second of white noise, made once and shared by every noise voice. */
  let noiseBuf: AudioBuffer | null = null
  const sharedNoise = (c: AudioContext): AudioBuffer | null => {
    if (noiseBuf) return noiseBuf
    try {
      const rate = Number.isFinite(c.sampleRate) && c.sampleRate > 0 ? c.sampleRate : 44100
      const buf = c.createBuffer(1, Math.max(1, Math.floor(rate)), rate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      noiseBuf = buf
      return buf
    } catch {
      return null
    }
  }

  /**
   * A decaying gain stage. `peak` is where the strike starts and `secs` is how
   * long it takes to fall to silence — exponentially, because that is how a
   * struck thing actually loses energy and a linear fade sounds like a
   * volume knob being turned down.
   *
   * The tiny `setValueAtTime(0.0001)` before the peak is not a formality:
   * `exponentialRampToValueAtTime` cannot start from, or reach, zero, and a
   * ramp that starts at the node's default 1.0 clicks.
   */
  const decay = (c: AudioContext, at: number, peak: number, secs: number): GainNode => {
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(secs, 0.01))
    return g
  }

  /** A pitched body whose note falls away under it: the drumhead going slack. */
  const body = (
    c: AudioContext, at: number,
    type: OscillatorType, from: number, to: number, bend: number,
    peak: number, secs: number, out: AudioNode,
  ): void => {
    const osc = c.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), at + bend)
    const g = decay(c, at, peak, secs)
    osc.connect(g)
    g.connect(out)
    osc.start(at)
    osc.stop(at + secs + 0.02)
  }

  /** Filtered noise: the hiss with most of it taken away. */
  const hiss = (
    c: AudioContext, at: number,
    filter: BiquadFilterType, hz: number, q: number,
    peak: number, secs: number, out: AudioNode,
  ): void => {
    const buf = sharedNoise(c)
    if (!buf) return
    const src = c.createBufferSource()
    src.buffer = buf
    // Start somewhere random in the second, so ten hats in a row are ten
    // different hats rather than one sample retriggered.
    const off = Math.random() * 0.5
    const f = c.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(hz, at)
    f.Q.setValueAtTime(q, at)
    const g = decay(c, at, peak, secs)
    src.connect(f)
    f.connect(g)
    g.connect(out)
    src.start(at, off, secs + 0.05)
    src.stop(at + secs + 0.05)
  }

  /**
   * A BRAP.
   *
   * Physically this is a reed: a slack flap of something being forced open and
   * shut many times a second. Three things make it, and leaving out any one of
   * them gets you a kazoo instead:
   *
   *   1. A SAWTOOTH, not a sine. A sine is one frequency and a fart is dozens
   *      of them stacked in a buzz; a saw has the whole harmonic series in it
   *      for free.
   *   2. A FREQUENCY THAT WOBBLES ON THE WAY DOWN. A steady glide is a slide
   *      whistle. Real ones stutter, so the pitch is walked down through a few
   *      stepped waypoints that jitter either side of the line — and the
   *      jitter is what the ear hears as "flapping".
   *   3. A RESONANT LOWPASS. The buzz on its own is an electric razor. A
   *      lowpass with a high Q, parked low and sweeping lower, is the body
   *      cavity around it, and the resonance is the honk.
   */
  const sputter = (
    c: AudioContext, at: number,
    from: number, to: number, wobble: number,
    cut: number, q: number,
    peak: number, secs: number, out: AudioNode,
  ): void => {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    // Eight waypoints down the glide, each nudged off the line by up to
    // `wobble` of itself. `setValueAtTime` rather than a ramp on purpose: the
    // STEP between waypoints is the flap, and a smooth ramp erases it.
    const steps = 8
    for (let i = 0; i <= steps; i++) {
      const k = i / steps
      const line = from + (to - from) * k
      const jitter = 1 + (Math.random() * 2 - 1) * wobble
      osc.frequency.setValueAtTime(Math.max(20, line * jitter), at + secs * k * 0.9)
    }
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(cut, at)
    f.frequency.exponentialRampToValueAtTime(Math.max(cut * 0.45, 60), at + secs)
    f.Q.setValueAtTime(q, at)
    const g = decay(c, at, peak, secs)
    osc.connect(f)
    f.connect(g)
    g.connect(out)
    osc.start(at)
    osc.stop(at + secs + 0.02)
  }

  /**
   * THE WET BIT, and it is the difference between a fart and a kazoo.
   *
   * A reed on its own is dry and buzzy — a duck call. What makes the real
   * thing unmistakable is that the reed is not dry: there is a second, higher
   * resonance sitting on top of the buzz that wobbles independently of it,
   * and the ear reads that pair as "something soft and damp is doing this".
   * One narrow bandpass on noise, swept downward over the same window as the
   * sputter it accompanies, is enough.
   */
  const wet = (
    c: AudioContext, at: number, hz: number, peak: number, secs: number, out: AudioNode,
  ): void => {
    const buf = sharedNoise(c)
    if (!buf) return
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(hz, at)
    f.frequency.exponentialRampToValueAtTime(Math.max(hz * 0.35, 60), at + secs)
    f.Q.setValueAtTime(7, at)
    const g = decay(c, at, peak, secs)
    src.connect(f)
    f.connect(g)
    g.connect(out)
    src.start(at, Math.random() * 0.5, secs + 0.05)
    src.stop(at + secs + 0.05)
  }

  /**
   * A NUMBER, WOBBLED. `vary(440, 0.03)` is 440Hz give or take three percent.
   *
   * This is the single biggest thing between a synthesised kit and a played
   * one, and it is not about the timbre at all. Nobody hits a drum twice the
   * same way: every real snare is a few cents off the last one and a decibel
   * louder or quieter, and a machine that reproduces one sample exactly is
   * heard as a machine within about four hits. A child drumming with both
   * hands makes a great many hits.
   */
  const vary = (v: number, amount: number): number =>
    v * (1 + (Math.random() * 2 - 1) * amount)

  /**
   * A RING OF DETUNED SQUARES, which is what a cymbal actually is.
   *
   * Filtered noise makes a passable hat and an obviously fake one: noise is
   * smooth, and a cymbal is a lump of metal with a fistful of loud inharmonic
   * partials in it. Six squares at deliberately non-musical ratios, run
   * through a highpass and then a narrow bandpass, is how the 808 did it and
   * it is still the shortest route to something that reads as METAL rather
   * than as hiss.
   */
  const RATIOS = [1, 1.4472, 1.6170, 1.9265, 2.5028, 2.6637] as const
  const metal = (
    c: AudioContext, at: number,
    base: number, cut: number, peak: number, secs: number, out: AudioNode,
  ): void => {
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(cut, at)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(cut * 1.35, at)
    bp.Q.setValueAtTime(1.1, at)
    const g = decay(c, at, peak, secs)
    hp.connect(bp)
    bp.connect(g)
    g.connect(out)
    for (const r of RATIOS) {
      const osc = c.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(vary(base * r, 0.01), at)
      osc.connect(hp)
      osc.start(at)
      osc.stop(at + secs + 0.02)
    }
  }

  /**
   * The bank. Numbers here are ordinary drum-machine numbers and the comment
   * beside each says what it is doing to the SOUND, not to the graph.
   */
  const VOICES: Record<Voice, (c: AudioContext, at: number, out: AudioNode) => void> = {
    // Sine, because a kick is nearly a pure tone; the sweep is what you hear.
    // 0.42s of tail is long for a drum and right for this one — the low end is
    // where "big" lives, and a short kick reads as a tap on a table.
    kick: (c, at, out) => {
      body(c, at, 'sine', vary(150, 0.04), vary(48, 0.03), 0.07, vary(0.9, 0.08), 0.42, out)
      hiss(c, at, 'highpass', 2000, 0.7, vary(0.14, 0.2), 0.012, out)  // the beater
    },
    // Two layers, and both are needed: the noise alone is a hiss, the body
    // alone is a tom. Highpass at 1.2k takes the mud out from under the snares.
    // THREE layers, and the third is the one that was missing. A snare is a
    // drum (the body), a set of wires rattling under it (the broad noise) and
    // a CRACK where the stick meets the skin, which lives around four
    // kilohertz and is most of what makes it sound close rather than distant.
    snare: (c, at, out) => {
      body(c, at, 'triangle', vary(190, 0.03), 120, 0.09, vary(0.30, 0.1), 0.13, out)
      hiss(c, at, 'highpass', 1200, 0.7, vary(0.5, 0.12), 0.19, out)
      hiss(c, at, 'bandpass', 4200, 1.4, vary(0.35, 0.15), 0.055, out)
    },
    // Almost nothing but the top, and almost no time. 45ms is a closed hat;
    // any longer and it turns into a cymbal.
    hat: (c, at, out) => {
      metal(c, at, 320, 7800, vary(0.26, 0.15), 0.045, out)
    },
    // A clap is not one sound — it is four hands not quite together. Three
    // short bursts a few milliseconds apart, then a tail. Bandpass, because a
    // clap has a distinct pitch to it, around a kilohertz.
    clap: (c, at, out) => {
      // The gaps between the three bursts are what makes it a room full of
      // hands rather than one pair, so they are never the same twice.
      for (let i = 0; i < 3; i++) {
        hiss(c, at + i * vary(0.011, 0.25), 'bandpass', vary(1100, 0.06), 1.6, 0.5, 0.022, out)
      }
      hiss(c, at + 0.033, 'bandpass', 1100, 1.4, vary(0.4, 0.12), 0.17, out)
    },
    // The kick's bigger, slower cousin, kept for whatever asks next.
    tom: (c, at, out) => {
      body(c, at, 'sine', vary(220, 0.04), 90, 0.12, vary(0.7, 0.1), 0.3, out)
    },

    // ---- the other kit ---------------------------------------------------
    //
    // Four sizes of the same event. They are told apart the way the pads that
    // strike them are told apart on screen — by SIZE — so the ordering here is
    // pitch down and length up, and nothing in the middle overlaps.

    // Small, high and over in a blink. The one that makes a child look up.
    squeak: (c, at, out) => {
      sputter(c, at, vary(340, 0.12), 190, 0.06, 1500, 6, vary(0.5, 0.1), vary(0.17, 0.2), out)
      wet(c, at, 1900, vary(0.13, 0.2), 0.14, out)
    },
    // The everyday one: mid, short, unmistakable.
    toot: (c, at, out) => {
      sputter(c, at, vary(155, 0.1), 105, 0.10, 720, 9, vary(0.7, 0.1), vary(0.36, 0.18), out)
      wet(c, at, 900, vary(0.16, 0.2), 0.3, out)
    },
    // Long, low and slow. Nearly a second, which is most of the joke.
    rumble: (c, at, out) => {
      sputter(c, at, vary(74, 0.09), 46, 0.14, 300, 11, vary(0.85, 0.08), vary(0.95, 0.15), out)
      wet(c, at, 420, vary(0.2, 0.2), 0.8, out)
    },
    // The big one. It starts where the squeak starts and ends below the
    // rumble, so it sounds like all three at once.
    blast: (c, at, out) => {
      sputter(c, at, vary(240, 0.1), 55, 0.18, 950, 7, 0.9, vary(0.55, 0.15), out)
      wet(c, at, 620, 0.3, 0.5, out)
      hiss(c, at, 'bandpass', 420, 1.2, 0.28, 0.5, out)
    },
  }

  /**
   * Strike one voice. Like everything else here it is decoration: a browser
   * without `BiquadFilterNode`, a suspended context, a mute — all of them end
   * in silence, never in a thrown error reaching the terminal.
   */
  const hit = (voice: Voice): void => {
    if (muted || !ctx) return
    try {
      const make = VOICES[voice]
      if (!make) return
      const master = ctx.createGain()
      // The old blanket level for everything. Voice peaks above are relative
      // to it, so the drums sit exactly where they always sat in the mix.
      master.gain.setValueAtTime(0.18, ctx.currentTime)
      master.connect(ctx.destination)
      // A RECORDING WINS IF THERE IS ONE. There is no file shipped for any
      // voice, so in practice this is always false and the synthesiser plays
      // — see `samples.ts` for how to drop one in, and for why none is here.
      if (playSample(ctx, voice, master)) return
      make(ctx, ctx.currentTime, master)
    } catch {
      // Audio is decoration. It must never break the terminal.
    }
  }

  const blip = (): void => note(880, 60)

  return {
    get muted() {
      return muted
    },

    setMuted(m: boolean) {
      muted = m
      saveMuted(m)
    },

    unlock,
    note,
    noise,
    blip,
    hit,
  }
}
