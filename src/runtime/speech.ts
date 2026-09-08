import type { Locale } from '../types'

/**
 * READING A LINE OUT LOUD.
 *
 * A six-year-old learning to read gets stuck on a word and there is nobody
 * beside them. This is the machine offering to say it — a small speaker on
 * the line, pressed on purpose, one line at a time. It is never automatic:
 * a playground that reads itself aloud unasked is a playground nobody can
 * think in.
 *
 * THE BROWSER ALREADY HAS THIS. `speechSynthesis` is the Web Speech API,
 * shipped in every current browser, and it costs this project no bytes and no
 * network — the voices are the operating system's own. What it does NOT
 * guarantee is which voices are installed: Hebrew is Carmit on a Mac and Asaf
 * on Windows, and on a stripped-down Linux there may be no Hebrew voice at
 * all. So every part of this degrades: no API, no button; no voice for the
 * language, the browser picks what it has; nothing installed, nothing is said
 * and nothing breaks.
 *
 * NO STATE OF ITS OWN. The only thing worth remembering across a press is
 * whatever the browser is already saying, and the browser is holding that.
 */

/** Whether this browser can say anything at all. */
export function canSpeak(): boolean {
  return (
    typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function'
  )
}

/**
 * Is there anything here worth reading out?
 *
 * A line of pure emoji is a picture, and a voice announcing "dog face dog
 * face dog face" is a worse answer than silence. A `▸` is furniture. So the
 * speaker only appears where there are LETTERS — in any alphabet, which is
 * what `\p{Letter}` means and why it is not a Latin range.
 */
export function readable(text: string): boolean {
  return /\p{Letter}/u.test(text)
}

/** The BCP-47 tag for each of the two languages this playground speaks. */
const TAG: Record<Locale, string> = { en: 'en-US', he: 'he-IL' }

/**
 * The mute switch, read at the moment of speaking rather than passed in.
 *
 * `runtime/audio.ts` owns this key and writes it the instant a child chooses,
 * so reading it here cannot go stale — and it means a line cannot be spoken
 * out of a machine whose sound is off, however the button was reached. The
 * button itself is hidden by `--kb-speak` (see `styles.css`); this is the
 * second lock on the same door, because the first one is presentation.
 */
function muted(): boolean {
  try {
    return localStorage.getItem('kb.muted') === '1'
  } catch {
    return false
  }
}

/**
 * A voice for this language, if the machine has one. `getVoices()` is empty
 * on a browser's very first call — Chrome fills it asynchronously — and that
 * is not worth waiting for: an utterance with `lang` set and no voice chosen
 * is answered by the browser's own default for that language, which is the
 * same voice we would have picked.
 */
function voiceFor(tag: string): SpeechSynthesisVoice | undefined {
  const lang = tag.slice(0, 2)
  const all = window.speechSynthesis.getVoices()
  return all.find((v) => v.lang.replace('_', '-') === tag)
    ?? all.find((v) => v.lang.slice(0, 2) === lang)
}

/** Stop whatever is being said. Safe to call when nothing is. */
export function hush(): void {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
}

/**
 * Say one line. Anything already being said is cut off first, so pressing a
 * second speaker swaps lines rather than queueing behind the first — a queue
 * is how a child ends up listening to four things they have stopped caring
 * about with no way to stop it.
 */
export function speak(text: string, locale: Locale, onEnd?: () => void): boolean {
  if (!canSpeak() || muted()) return false
  const said = text.trim()
  if (!said) return false
  window.speechSynthesis.cancel()
  const u = new window.SpeechSynthesisUtterance(said)
  u.lang = TAG[locale]
  const v = voiceFor(u.lang)
  if (v) u.voice = v
  // A shade under conversational. A child following the words on screen is
  // reading along, not listening to the news.
  u.rate = 0.9
  u.pitch = 1
  // `cancel()` above ends whatever was being said, and the browser fires the
  // ended utterance's own `onend` — which is how the OTHER speaker on screen
  // learns to stop looking pressed. `onerror` too: a missing voice must not
  // leave a button stuck on.
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.speak(u)
  return true
}

/** True while the browser is in the middle of saying something. */
export function speaking(): boolean {
  return canSpeak() && window.speechSynthesis.speaking
}
