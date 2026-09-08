import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadThemeId, saveThemeId } from './store'

/**
 * All this module owns now is the SPELLING of `kb.theme`.
 *
 * CHOOSING a theme moved to `systems/store.ts` the day a palette stopped
 * being free-floating and became something a machine owns — `pickTheme`,
 * `prefersDark` and `initialTheme` went with it, and so did the tests that
 * covered them. See the note in `./store.ts` for why the operating system no
 * longer gets a vote.
 */
describe('the theme store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('persists to kb.theme and nowhere else', () => {
    const before = Object.keys(localStorage)
    saveThemeId('desert-noon')
    expect(loadThemeId()).toBe('desert-noon')
    expect(localStorage.getItem('kb.theme')).toBe('desert-noon')
    expect(Object.keys(localStorage).filter((k) => !before.includes(k)))
      .toEqual(['kb.theme'])
  })

  it('reads null when nothing is stored', () => {
    expect(loadThemeId()).toBeNull()
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(loadThemeId()).toBeNull()
    expect(() => saveThemeId('desert-noon')).not.toThrow()
  })
})
