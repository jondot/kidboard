import { useEffect, useRef } from 'react'

/**
 * THE PLAYGROUND'S TWO GESTURES: Shift, Shift and Ctrl, Ctrl.
 *
 * Both are the same idea — tap a key that types nothing, twice — and both have
 * to work from anywhere, including out of a running game, which is why they
 * are bound in the CAPTURE phase ahead of the terminal's own key router. On
 * the Kidtari a game is the whole screen and this is the only way back to a list
 * without leaving the game first.
 *
 * WHY THEY COST A CARTRIDGE NOTHING: neither key produces a character, and a
 * cartridge is handed shift and control as modifier FLAGS on the keys it
 * receives, never as keys of their own.
 *
 * ANY OTHER KEY BREAKS THE RUN, and that is not a nicety either. A child
 * typing `Hi There` presses Shift twice, and a grown-up pressing Ctrl+C then
 * Ctrl+V presses Control twice — in both cases with something in between. So
 * the run is armed by a bare tap and disarmed by anything else, which is what
 * makes a double tap mean "I asked for this" rather than "I was typing".
 */

/** Two taps inside this window are a double-tap. */
export const DOUBLE_MS = 500

export function useDoubleTap(key: string, run: () => void): void {
  /** When the first tap landed, or 0 for "no run in progress". */
  const last = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key !== key) { last.current = 0; return }
      const now = Date.now()
      const twice = now - last.current <= DOUBLE_MS
      last.current = twice ? 0 : now
      if (twice) run()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [key, run])
}
