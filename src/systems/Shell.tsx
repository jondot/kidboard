import type { ReactElement, ReactNode, Ref } from 'react'
import type { Block, Dir, Hint, Locale, T } from '../types'
import type { FrameChannel } from '../runtime/frameChannel'
import type { System } from './types'

/**
 * THE SHELL CONTRACT.
 *
 * A shell is the machine's face and nothing else: given a transcript, a
 * toolbar and an input line, it decides WHERE they go and what the frame
 * around them looks like. It holds no state, owns no callback, and starts no
 * timer.
 *
 * `Terminal` keeps every piece of state and every behaviour it had before the
 * seam existed — the session, the frame loop, key routing, the nudger, the
 * clear-on-exit rule — because those are the same on all four machines even
 * where the answers differ, and a behaviour duplicated across four
 * presentation components is a behaviour that will drift in three of them.
 *
 * So the props below are all *derived* values. A shell that wants to know
 * something not in this list is a shell asking a question `Terminal` should
 * be answering.
 */
export type ShellProps = {
  system: System
  locale: Locale
  dir: Dir
  t: T
  /** The transcript, oldest first. */
  blocks: Block[]
  channel: FrameChannel
  /**
   * Hints for the RUNNING cartridge, or `[]` when nothing is running. The ESC
   * hint is already appended, so a shell never adds one of its own.
   */
  hints: Hint[]
  /** The running cartridge's title, or null. */
  liveTitle: string | null
  busy: boolean
  isLive: boolean
  /**
   * The input line, already built and already carrying this machine's prompt
   * in the child's own language. A shell decides WHERE it goes, never what it
   * is.
   *
   * THE SETTINGS MENU IS NOT HERE ANY MORE. It belongs to the WINDOW, not to
   * the face inside it — `chrome/Window.tsx` puts it in the tab strip, the top
   * bar or the bezel moulding, whichever that machine would actually have —
   * so a shell neither receives it nor has to find somewhere to put it.
   */
  input: ReactNode
  /**
   * The scroll box and its content wrapper.
   *
   * `Terminal` observes BOTH for the follow-the-bottom behaviour (the scroll
   * box for its width, the content for its height — a canvas learns how tall
   * it is a frame or more after React commits it), so a shell MUST attach both,
   * exactly once, even in a layout that does not scroll. They are callback
   * refs, so a shell may move them between two different elements as its
   * layout changes and the observers will follow.
   */
  scrollRef: Ref<HTMLDivElement>
  contentRef: Ref<HTMLDivElement>
}

/** Every machine's face has the same signature. */
export type Shell = (props: ShellProps) => ReactElement
