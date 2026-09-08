import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  clearsTranscriptOnExit, gameEntryOf, gameIsFullscreen, helpAtOf,
  helpRendersOverTheGame, isSingleSurface, keepsScrollback,
  transcriptStaysVisibleDuringGame,
} from './behaviour'
import { KIDTARI, KIDCODE, CRT, OMARCHY, SYSTEMS } from './systems'

describe('system behaviour', () => {
  describe('clearsTranscriptOnExit', () => {
    it('is true for kidtari only', () => {
      expect(clearsTranscriptOnExit(KIDTARI)).toBe(true)
      expect(clearsTranscriptOnExit(KIDCODE)).toBe(false)
      expect(clearsTranscriptOnExit(CRT)).toBe(false)
      expect(clearsTranscriptOnExit(OMARCHY)).toBe(false)
    })

    it('answers for every system, without throwing', () => {
      for (const s of SYSTEMS) expect(typeof clearsTranscriptOnExit(s)).toBe('boolean')
    })
  })

  describe('keepsScrollback and isSingleSurface', () => {
    it('splits the four machines the way the table does', () => {
      expect(SYSTEMS.filter(keepsScrollback).map((s) => s.id)).toEqual(['kidcode', 'omarchy'])
      expect(SYSTEMS.filter(isSingleSurface).map((s) => s.id)).toEqual(['crt'])
    })

    it('never says a system both keeps and clears', () => {
      for (const s of SYSTEMS) {
        expect(keepsScrollback(s) && clearsTranscriptOnExit(s)).toBe(false)
      }
    })

    it('gives every system exactly one of keep / clear / surface', () => {
      for (const s of SYSTEMS) {
        const n = [keepsScrollback(s), clearsTranscriptOnExit(s), isSingleSurface(s)]
          .filter(Boolean).length
        expect(n).toBe(1)
      }
    })
  })

  describe('helpAtOf', () => {
    it('places hints per system', () => {
      expect(helpAtOf(KIDTARI)).toBe('label')
      expect(helpAtOf(KIDCODE)).toBe('callLine')
      expect(helpAtOf(CRT)).toBe('onScreen')
      expect(helpAtOf(OMARCHY)).toBe('paneTitle')
    })

    /**
     * `'contextBar'` is not in the `HelpAt` union, so asserting no system uses
     * it could never fail. The bottom bar being gone is not a fact about this
     * data at all — it is a fact about the FILE TREE, so that is what is
     * checked. Four distinct placements is the other half: if two machines
     * chose the same one, `helpAt` would be describing three machines.
     */
    it('never places hints in a global bottom bar — there is no longer one', () => {
      expect(new Set(SYSTEMS.map(helpAtOf)).size).toBe(SYSTEMS.length)
      for (const f of ['ContextBar.tsx', 'ContextBar.test.tsx']) {
        expect(existsSync(join(process.cwd(), 'src/terminal', f)), f).toBe(false)
      }
    })

    it('renders help over the game only where the game owns the screen', () => {
      expect(SYSTEMS.filter(helpRendersOverTheGame).map((s) => s.id))
        .toEqual(['kidtari', 'crt'])
    })
  })

  describe('gameEntryOf', () => {
    it('is the system entry mode', () => {
      expect(gameEntryOf(KIDTARI)).toBe('fullscreen')
      expect(gameEntryOf(KIDCODE)).toBe('inline')
      expect(gameEntryOf(CRT)).toBe('field')
      expect(gameEntryOf(OMARCHY)).toBe('pane')
    })

    it('gives all four systems a distinct entry', () => {
      expect(new Set(SYSTEMS.map(gameEntryOf)).size).toBe(4)
    })

    it('takes the screen only on kidtari', () => {
      expect(SYSTEMS.filter(gameIsFullscreen).map((s) => s.id)).toEqual(['kidtari'])
    })

    it('keeps the transcript visible everywhere except kidtari', () => {
      expect(SYSTEMS.filter(transcriptStaysVisibleDuringGame).map((s) => s.id))
        .toEqual(['kidcode', 'crt', 'omarchy'])
    })
  })

  it('is total: every helper answers for every system', () => {
    for (const s of SYSTEMS) {
      expect(() => [
        clearsTranscriptOnExit(s), keepsScrollback(s), isSingleSurface(s),
        helpAtOf(s), helpRendersOverTheGame(s), gameEntryOf(s),
        gameIsFullscreen(s), transcriptStaysVisibleDuringGame(s),
      ]).not.toThrow()
    }
  })

  it('throws loudly rather than guessing for a shape that is not a system', () => {
    const alien = { ...KIDTARI, scrollback: 'teleport' } as unknown as typeof KIDTARI
    expect(() => clearsTranscriptOnExit(alien)).toThrow()
    const alien2 = { ...KIDTARI, gameEntry: 'hologram' } as unknown as typeof KIDTARI
    expect(() => gameEntryOf(alien2)).toThrow()
  })
})
