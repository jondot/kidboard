import type { Frame } from '../types'

/**
 * The frame path for a RUNNING game, deliberately outside React.
 *
 * The transcript is a React reducer and should stay one: it is text, it needs
 * selection, RTL and reflow. A game frame is neither text nor a transcript
 * event — pushing 60 of them a second through the reducer would re-render the
 * whole transcript 60 times a second to mutate nothing but a bitmap.
 *
 * So a running block's frames go through here instead: the session emits, the
 * one mounted game canvas subscribes, and the paint happens synchronously
 * inside the same `requestAnimationFrame` callback that produced it. The
 * transcript store learns about the frame exactly once, when the block freezes
 * and the last frame becomes a still.
 *
 * Exactly one subscriber at a time, which is the same invariant the transcript
 * already holds: at most one live block is running.
 */
export type FrameChannel = {
  emit(f: Frame): void
  subscribe(fn: (f: Frame) => void): () => void
  latest(): Frame | null
  reset(): void
}

export function makeFrameChannel(): FrameChannel {
  let latest: Frame | null = null
  let sub: ((f: Frame) => void) | null = null

  return {
    emit(f) {
      latest = f
      sub?.(f)
    },

    subscribe(fn) {
      sub = fn
      // React mounts the new canvas before unmounting the old one, and the
      // session has usually already emitted its first frame by then. Replay it
      // so a game never shows one blank frame on start.
      if (latest) fn(latest)
      return () => {
        if (sub === fn) sub = null
      }
    },

    latest: () => latest,

    /**
     * A NEW GAME IS ABOUT TO MOUNT: forget the last frame AND the canvas that
     * was showing it.
     *
     * Dropping the subscriber is the fix for "click the same game twice and
     * strange things happen". `session.start` freezes the old block, mounts
     * the new one and renders its first frame — all synchronously, before
     * React has re-rendered anything — so at the moment that first frame was
     * emitted the only subscriber in existence was the OLD game's canvas, and
     * the new game's opening frame was painted into the still the child had
     * just finished playing. The picture in the scrollback was of a game that
     * had never been played there; the real game then appeared below it, and
     * the still repainted itself a beat later when its own frozen frame
     * arrived. Three separate wrongnesses, all from one stale subscriber.
     *
     * `latest` is kept for the replay in `subscribe` — the new canvas mounts a
     * moment later and asks for the frame it missed — so nothing is lost and
     * no game starts on a blank screen.
     */
    reset() {
      latest = null
      sub = null
    },
  }
}
