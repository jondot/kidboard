import { BlockView } from '../../terminal/BlockView'
import type { Block } from '../../types'
import type { ShellProps } from '../Shell'

/**
 * THE KIDTARI.
 *
 * A game is a MODE. It takes the whole screen — no toolbar, no transcript, no
 * prompt — and the only thing above it is the cartridge label. When it exits,
 * `Terminal` wipes the transcript (that part is behaviour, and lives there),
 * so what a child is left with is a bare `READY`.
 *
 * Idle is the same machine at rest: upper case, a block cursor, a `READY`
 * prompt, no welcome box and no spinner. The transcript is the transcript.
 *
 * UPPER CASE IS CSS. `.kb-upper` is a `text-transform`, never a mutation of a
 * string — a mutated string would reach the resolver, the souvenir line and
 * the transcript a child scrolls back through, and would be wrong in all
 * three. The class is withheld under Hebrew: Hebrew is unicase, so
 * `uppercase` is a no-op there, but relying on a no-op is how a rule survives
 * until the day it is not one. It never reaches a canvas (pixels, not text)
 * and `styles.css` exempts `.kb-art` (a drawing is not prose).
 */

/** The one live block a fullscreen machine can be showing. */
function runningBlock(blocks: Block[]): Block | undefined {
  return blocks.find((b) => b.kind === 'live' && b.state === 'running')
}

export function KidtariShell({
  system, locale, dir, blocks, channel, hints, liveTitle, isLive,
  input, scrollRef, contentRef,
}: ShellProps) {
  const upper = locale === 'he' ? '' : 'kb-upper'

  /**
   * `helpAt: 'label'`. The cartridge's name and its keys, printed on a strip
   * above the game the way they were printed on the cartridge itself. It is
   * not a status bar: it exists only while something is running, and it is
   * gone the moment the machine is idle.
   */
  const label = hints.length > 0 || liveTitle ? (
    <div
      data-kb-label=""
      className={`kb-kidtari-label ${upper} kb:flex kb:flex-wrap kb:gap-x-4 kb:gap-y-1 kb:px-4 kb:py-1 kb:text-xs`}
    >
      {liveTitle ? <span className="kb:font-bold">{liveTitle}</span> : null}
      {hints.map((h, i) => (
        <span key={i} className="kb:flex kb:gap-1 kb:items-center">
          <span dir="ltr" className="kb:font-bold">{h.keys}</span>
          <span dir="auto">{h.label}</span>
        </span>
      ))}
    </div>
  ) : null

  if (isLive) {
    const live = runningBlock(blocks)
    return (
      <div
        data-kb-shell={system.id}
        data-kb-fullscreen=""
        className="kb-kidtari kb:flex kb:flex-col kb:h-full kb:min-h-0"
      >
        {label}
        {/*
          The scroll box and the content wrapper are attached HERE too, and
          exactly once, because `Terminal` measures this box for the column
          count a game is handed and observes the content for the
          follow-the-bottom effect. They are callback refs, so swapping
          between this tree and the idle one below re-attaches both observers
          rather than leaving them on a detached node.
        */}
        <div
          ref={scrollRef}
          className="kb:flex-1 kb:min-h-0 kb:overflow-hidden kb:p-4 kb:flex kb:items-center"
        >
          <div ref={contentRef} className="kb:w-full">
            {live ? <BlockView block={live} dir={dir} locale={locale} channel={channel} /> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-kb-shell={system.id}
      className="kb-kidtari kb:flex kb:flex-col kb:h-full kb:min-h-0"
    >
      {label}
      <div
        ref={scrollRef}
        data-kb-transcript=""
        className="kb:flex-1 kb:overflow-y-auto kb:p-4"
      >
        <div ref={contentRef} className={upper}>
          {/* `hoistLive`: on this machine a running game is never in the
              transcript — it is the screen. A frozen still never gets here
              either, because the transcript is wiped when a game exits. */}
          {blocks.map((b) => (
            <BlockView key={b.id} block={b} dir={dir} locale={locale} channel={channel} hoistLive />
          ))}
          {input}
        </div>
      </div>
    </div>
  )
}
