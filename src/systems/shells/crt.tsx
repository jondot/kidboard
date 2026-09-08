import { useRef } from 'react'
import { BlockView } from '../../terminal/BlockView'
import { GameCanvas } from '../../runtime/GameCanvas'
import { EMPTY_FRAME, type Block, type Frame } from '../../types'
import type { ShellProps } from '../Shell'

/**
 * THE CRT / LOGO MACHINE.
 *
 * `scrollback: 'surface'` + `gameEntry: 'field'`. There is ONE SCREEN, and it
 * is split — not a transcript that runs forever:
 *
 * - The FIELD, upper and larger, is a permanent drawing area. A running game
 *   draws here, and when it ends the field KEEPS ITS LAST PICTURE. A P3
 *   phosphor had long persistence: what you drew stays glowing. That is the
 *   whole difference from the other three machines, where a finished game
 *   becomes a still in a scrollback you scroll past.
 * - The COMMAND AREA, lower and a few lines tall, scrolls on its own and
 *   always shows the newest lines plus the `?` prompt. The page never scrolls.
 *
 * `helpAt: 'onScreen'`: a running cartridge's hints are a strip at the foot of
 * the field, in the tube's own type. Nothing is running, no strip.
 *
 * NO SCANLINES, NO INTERLACE, NO FUZZ. There was an overlay drawing all three
 * over the picture and it is gone: imitating a tube's raster is imitating its
 * FAULTS, and the fault it imitates best is the one that makes small text hard
 * to read. What a phosphor machine actually is — one colour, one typeface, a
 * picture that stays on the glass after the game ends — is all still here, and
 * none of it needs a filter smeared over a child's drawing to say so.
 *
 * Everything else — the palette, the type — is `crt.css`. This file decides
 * only WHERE things go, as the contract says.
 */

type Live = Extract<Block, { kind: 'live' }>

const isRunning = (b: Block): b is Live => b.kind === 'live' && b.state === 'running'

/**
 * On this machine a finished game is a LINE in the log, because its picture is
 * already on the field and printing it twice is two screens, not one.
 *
 * `hoistLive` hides only a RUNNING block — a still is scrollback everywhere
 * else, and rightly so — so the frozen block is shown to `BlockView` as the
 * collapsed one it is a moment from becoming. A derived view object, never a
 * mutation: the transcript, the souvenir and everything the resolver sees are
 * untouched, and the one-line row (with its souvenir guard) stays in the one
 * component that owns it.
 */
function asEntry(b: Block): Block {
  return b.kind === 'live' && b.state === 'frozen' ? { ...b, state: 'collapsed' } : b
}

export function CrtShell({
  system, dir, locale, blocks, channel, hints, input, scrollRef, contentRef,
}: ShellProps) {
  const running = blocks.find(isRunning)

  /**
   * THE PERSISTENCE, and the one thing this shell remembers.
   *
   * It cannot be derived from the transcript, and that is not a shortcut: the
   * reducer's `collapseFrozen` replaces a frozen block's frame with
   * `EMPTY_FRAME` the moment anything else is said, so the child's first word
   * after a game would blank the field. So the last frame that actually
   * carried a drawing is held here.
   *
   * A ref, not state: it never causes a render, it starts no timer and it owns
   * no callback — it is written from the props during the render that already
   * had to happen, and reading it twice gives the same answer. A cleared
   * screen (`clear`, `cls`, `נקה` — the transcript goes empty) wipes it, which
   * is the one thing on this machine that ever should.
   */
  const persisted = useRef<Frame>(EMPTY_FRAME)
  if (blocks.length === 0) {
    persisted.current = EMPTY_FRAME
  } else {
    // Newest first: only a FROZEN block ever carries a frame — a running one's
    // frames go straight to its canvas, and a collapsed one's has been dropped.
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const b = blocks[i]!
      if (b.kind === 'live' && b.frame.cmds.length > 0) {
        persisted.current = b.frame
        break
      }
    }
  }

  /**
   * What the field is showing. The running game, else the last thing drawn,
   * else nothing at all — a warm empty screen, which is what a cold start
   * looks like and is not a missing element.
   */
  const picture = running ? (
    <BlockView block={running} dir={dir} locale={locale} channel={channel} />
  ) : persisted.current.cmds.length > 0 ? (
    // Painted directly, because this frame belongs to no block any more.
    // `dir="ltr"` for the same reason `BlockView` sets it on a game box: the
    // box is laid out left-to-right under Hebrew, and the canvas inside has no
    // bidi algorithm to reorder in the first place.
    <div dir="ltr" className="kb:w-full kb:opacity-90">
      <GameCanvas frame={persisted.current} frozen />
    </div>
  ) : null

  return (
    <div
      data-kb-shell={system.id}
      className="kb-crt kb:flex kb:flex-col kb:h-full kb:min-h-0 kb:overflow-hidden"
    >
      {/* The glass. Everything below it is inside one tube. There is no
          overlay of any kind on top of it — see the note on raster effects in
          `crt.css`. */}
      <div className="kb-crt-tube kb:relative kb:flex-1 kb:min-h-0 kb:flex kb:flex-col kb:overflow-hidden">
        {/* THE FIELD. Fixed: it does not scroll, and nothing about it is a
            transcript. It never sets its own `dir` — the hints are prose and
            read in the child's own direction, while the game box isolates
            itself structurally. */}
        <div
          data-kb-field=""
          className="kb-crt-field kb:flex-1 kb:min-h-0 kb:flex kb:flex-col kb:overflow-hidden"
        >
          <div className="kb:flex-1 kb:min-h-0 kb:flex kb:items-center kb:justify-center kb:overflow-hidden">
            {picture}
          </div>
          {/* `helpAt: 'onScreen'` — drawn on the tube at the foot of the
              field, under the picture. Not a bar under the page, and not a
              line in the command area. */}
          {hints.length > 0 ? (
            <div
              data-kb-hints=""
              className="kb-crt-hints kb:shrink-0 kb:flex kb:flex-wrap kb:gap-x-4 kb:gap-y-1 kb:text-sm"
            >
              {hints.map((h, i) => (
                <span key={i} className="kb:flex kb:gap-1 kb:items-center">
                  <span dir="ltr" className="kb:text-kb-prompt kb:font-bold">
                    {h.keys}
                  </span>
                  <span dir="auto">{h.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/*
          THE COMMAND AREA, and the only thing on this machine that scrolls.

          `scrollRef` and `contentRef` attach HERE, not to the field: they
          drive Terminal's follow-the-bottom, which must follow the newest
          command lines. A canvas learns its height a frame or more after
          React commits it, so the content wrapper is what is observed — see
          the `FOLLOW THE BOTTOM` comment in Terminal.tsx. Pointing either of
          them at the field would chase a picture that is not going anywhere
          and leave the prompt below the fold.

          It is also this machine's transcript, so it says so: the words a
          child typed are all still here, a few lines at a time.
        */}
        <div
          ref={scrollRef}
          data-kb-command=""
          data-kb-transcript=""
          className="kb-crt-command kb:shrink-0 kb:overflow-y-auto"
        >
          <div ref={contentRef}>
            {/* `hoistLive`: the running game is upstairs in the field, so the
                command area must not paint it a second time. */}
            {blocks.map((b) => (
              <BlockView
                key={b.id}
                block={asEntry(b)}
                dir={dir} locale={locale}
                channel={channel}
                hoistLive
              />
            ))}
            {input}
          </div>
        </div>
      </div>
    </div>
  )
}
