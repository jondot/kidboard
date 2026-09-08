import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { canSpeak, hush, readable, speak, speaking } from './speech'

type Utt = {
  text: string; lang: string; rate: number; pitch: number
  voice?: { lang: string; name: string }
  onend?: () => void
  onerror?: () => void
}

const spoken: Utt[] = []
let cancels = 0

/**
 * jsdom ships no Web Speech API at all, which is itself a case worth having:
 * the "no browser support" branch is the default here and every test that
 * wants a voice has to ask for one. This is the smallest stand-in that
 * behaves like the real thing for what this module actually uses.
 */
function fitSpeech(voices: { lang: string; name: string }[] = []): void {
  class Utterance {
    text: string
    lang = ''
    rate = 1
    pitch = 1
    voice: { lang: string; name: string } | undefined
    onend: (() => void) | undefined
    onerror: (() => void) | undefined
    constructor(text: string) { this.text = text }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true, writable: true, value: Utterance,
  })
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: {
      speaking: false,
      getVoices: () => voices,
      cancel: () => { cancels += 1 },
      speak: (u: Utt) => { spoken.push(u) },
    },
  })
}

beforeEach(() => {
  spoken.length = 0
  cancels = 0
  localStorage.clear()
})
afterEach(() => {
  Reflect.deleteProperty(window, 'speechSynthesis')
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
})

describe('reading a line out loud', () => {
  it('says nothing at all on a browser that cannot', () => {
    expect(canSpeak()).toBe(false)
    expect(speaking()).toBe(false)
    // …and every entry point is a no-op rather than a throw: the button is
    // absent on such a browser, but nothing here may depend on that.
    expect(() => hush()).not.toThrow()
    expect(speak('hello', 'en')).toBe(false)
  })

  /**
   * A line of pure emoji is a picture. A voice announcing "dog face dog face
   * dog face" is a worse answer than silence, so the speaker is not offered
   * there at all — which is why this is a separate, testable question rather
   * than something buried in the component.
   */
  it('offers itself only where there are letters to read', () => {
    for (const yes of ['hello', 'שלום', 'a', 'the cat 🐱', '1 duck']) {
      expect(readable(yes), yes).toBe(true)
    }
    for (const no of ['🐦🐦🐦', '', '   ', '▸', '123', '!!!']) {
      expect(readable(no), no).toBe(false)
    }
  })

  it('reads a line in the language of the session', () => {
    fitSpeech()
    expect(speak('here is a cat', 'en')).toBe(true)
    expect(speak('הנה חתול', 'he')).toBe(true)
    expect(spoken.map((u) => u.lang)).toEqual(['en-US', 'he-IL'])
    expect(spoken.map((u) => u.text)).toEqual(['here is a cat', 'הנה חתול'])
    // A shade under conversational: a child is reading along, not listening
    // to the news.
    expect(spoken.every((u) => u.rate < 1 && u.rate > 0.6)).toBe(true)
  })

  it('takes a voice for the language when the machine has one', () => {
    fitSpeech([
      { lang: 'en-GB', name: 'Daniel' },
      { lang: 'he-IL', name: 'Carmit' },
    ])
    speak('שלום', 'he')
    expect(spoken[0]!.voice?.name).toBe('Carmit')
  })

  it('lets the browser choose when the machine has no voice for it', () => {
    fitSpeech([{ lang: 'en-US', name: 'Samantha' }])
    speak('שלום', 'he')
    expect(spoken[0]!.voice).toBeUndefined()
    expect(spoken[0]!.lang, 'the tag is still set, so the browser can try')
      .toBe('he-IL')
  })

  /**
   * Pressing a second speaker SWAPS lines rather than queueing behind the
   * first. A queue is how a child ends up listening to four things they have
   * stopped caring about with no way to stop it.
   */
  it('cuts off whatever was being said before it starts', () => {
    fitSpeech()
    speak('one', 'en')
    speak('two', 'en')
    expect(cancels).toBe(2)
    expect(spoken).toHaveLength(2)
  })

  it('says nothing on a machine whose sound is off', () => {
    fitSpeech()
    localStorage.setItem('kb.muted', '1')
    expect(speak('hello', 'en')).toBe(false)
    expect(spoken).toHaveLength(0)
  })

  it('says nothing when there is nothing to say', () => {
    fitSpeech()
    expect(speak('   ', 'en')).toBe(false)
    expect(spoken).toHaveLength(0)
  })

  // A missing voice, a browser that gives up mid-sentence: the button must
  // not be left looking pressed forever, so BOTH ends are wired.
  it('tells the caller when it has finished, and when it has given up', () => {
    fitSpeech()
    const done = vi.fn()
    speak('hello', 'en', done)
    spoken[0]!.onend?.()
    spoken[0]!.onerror?.()
    expect(done).toHaveBeenCalledTimes(2)
  })
})
