import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DEFAULT_TEXT_SIZE, SCALE_OF, TEXT_SIZES, loadTextSize, saveTextSize,
} from './textSize'

describe('how big the words are', () => {
  beforeEach(() => localStorage.clear())

  it("starts at the machine's own size, with nothing written anywhere", () => {
    expect(loadTextSize()).toBe(DEFAULT_TEXT_SIZE)
    expect(SCALE_OF[DEFAULT_TEXT_SIZE], 'the default is not a multiplier of 1')
      .toBe(1)
    // A default is not a choice: reading one must never leave a key behind.
    expect(Object.keys(localStorage)).toEqual([])
  })

  it('remembers a chosen size, and reads it back', () => {
    saveTextSize('bigger')
    expect(localStorage.getItem('kb.text')).toBe('bigger')
    expect(loadTextSize()).toBe('bigger')
  })

  /**
   * A value from an older build, a newer one, or a child with the devtools
   * open. The answer to "that is not a size" is the machine's own size — never
   * a `calc()` with a word in it, which is a layout with no font size at all.
   */
  it('shrugs at a stored value that is not a size', () => {
    for (const junk of ['huge', '', '2', 'null', '{}']) {
      localStorage.setItem('kb.text', junk)
      expect(loadTextSize(), junk).toBe(DEFAULT_TEXT_SIZE)
    }
  })

  it('survives storage being switched off entirely', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new Error('denied') })
    const set = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('denied') })
    expect(loadTextSize()).toBe(DEFAULT_TEXT_SIZE)
    expect(() => saveTextSize('big')).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })

  /**
   * THE STEPS HAVE TO BE VISIBLE APART. Three sizes a nudge from each other
   * is three rows in a menu that all look the same and answer nothing — the
   * setting exists because someone could not read the screen, so each step
   * has to be a real answer to that.
   */
  it('puts real distance between one step and the next', () => {
    const scales = TEXT_SIZES.map((s) => SCALE_OF[s])
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]! / scales[i - 1]!, `${TEXT_SIZES[i]} is barely bigger`)
        .toBeGreaterThan(1.15)
    }
    expect(scales[scales.length - 1]).toBeLessThanOrEqual(2)
  })
})
