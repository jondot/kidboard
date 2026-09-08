import { BlockView } from '../../terminal/BlockView'
import type { Block, Hint, Locale } from '../../types'
import type { ShellProps } from '../Shell'

/**
 * THE OMARCHY: A TILING WINDOW MANAGER, SIMULATED.
 *
 * The other three machines have ONE window and put a game somewhere inside it.
 * This one has a window manager, so starting a game does what a window manager
 * does: a second window opens, the compositor TILES the two of them, and each
 * one keeps its own full chrome — its own border, its own title bar, its own
 * focus ring. Pressing ESC closes the game window and the terminal goes
 * fullscreen again. That is the whole idea, and it is behavioural: on this
 * machine a game is not a pane inside your terminal, it is a neighbour beside
 * it.
 *
 * WHAT IT REPLACED. The game used to open in a bordered strip under the
 * transcript with a title on it — a pane, which is what a tabbed editor does,
 * not what a compositor does. The terminal above it had no chrome of its own,
 * so the two never read as two windows: one had a title bar and the other was
 * just the rest of the screen.
 *
 * TILING DIRECTION follows the space, the way `dwindle` does: side by side in
 * a wide window, stacked in a tall one. It is a container query in
 * `omarchy.css`, so it answers to the size of the playground rather than to
 * the size of the browser — this is an embeddable component and the host may
 * have given it a column.
 *
 * FOCUS. The game window is the focused one whenever there is a game, and it
 * says so with the accent border every compositor draws on the active window;
 * the terminal drops to the inactive border. When the game closes there is one
 * window again and it is focused. Nothing here is a control: the titles are
 * labels, exactly as a bar's window title is a label.
 *
 * `keep` + `pane`: nothing is ever removed. A running game is HOISTED out of
 * the transcript (`hoistLive`) into its own window; when it ends, the window
 * closes and the still it left behind is already sitting in the transcript, in
 * the place it was started from. There is never a moment where the game is in
 * both places, and never one where it is in neither — the second window is
 * opened by the presence of a running block, which is the same fact
 * `hoistLive` hides on.
 *
 * `helpAt: 'paneTitle'`: the game's keys ride on the game window's own title
 * bar, which is where a compositor puts what a window is.
 */

/**
 * WHAT THE TERMINAL WINDOW IS CALLED, and it is not the machine.
 *
 * It said `omarchy` — the name of the whole computer, printed on the title bar
 * of one window inside it, which is a thing no compositor has ever done. A
 * window bar names the APPLICATION: the file manager window says files, the
 * browser window says the page, and the window with a shell in it says
 * terminal. The machine's own name belongs where a machine's name belongs —
 * on the bar across the top of the screen, and in the settings menu that
 * switches between the four of them.
 *
 * Both languages, for the same reason every other shell string is in both: a
 * Hebrew-reading child is not shown a Latin word they cannot read yet.
 */
const TERMINAL: Record<Locale, string> = {
  en: 'terminal',
  he: 'מסוף',
}

/** The one live block a tiling machine can be showing. */
function runningBlock(blocks: Block[]): Block | undefined {
  return blocks.find((b) => b.kind === 'live' && b.state === 'running')
}

/**
 * One window's title bar.
 *
 * Every window in a compositor has the same furniture, so both of these are
 * drawn by one component: a name at the reading edge, then whatever that
 * window has to say about itself. `aria-hidden` is deliberately NOT set — a
 * window title is real information, and "snakes" is the name of the thing a
 * child is playing.
 */
function TitleBar(
  { name, hints, focused }: { name: string; hints?: Hint[]; focused: boolean },
) {
  return (
    <div
      data-kb-pane-title=""
      data-kb-focused={focused ? 'true' : 'false'}
      className="kb-omarchy-title"
    >
      <span dir="auto" className="kb-omarchy-pane-name">{name}</span>
      {hints && hints.length > 0 ? (
        // Never sets a direction of its own: it is a flex row, so under Hebrew
        // it starts from the other end with the rest of the frame. Only the
        // key glyphs stay `ltr`, because `← →` is a picture of two keys.
        <span data-kb-hints="" className="kb-omarchy-hints">
          {hints.map((h, i) => (
            <span key={i} className="kb-omarchy-hint">
              <span dir="ltr" className="kb-omarchy-key">{h.keys}</span>
              <span dir="auto">{h.label}</span>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

export function OmarchyShell({
  system, locale, dir, blocks, channel, hints,
  liveTitle, input, scrollRef, contentRef,
}: ShellProps) {
  const live = runningBlock(blocks)
  const tiled = live !== undefined

  return (
    <div data-kb-shell={system.id} className="kb-omarchy">
      {/*
        THE TILES, in a box of their own.
        `.kb-omarchy` is the query CONTAINER and this is what the query styles:
        an element cannot be laid out by a container query on itself, so the
        two have to be different elements. See the note in `omarchy.css`.
      */}
      <div data-kb-tiled={tiled ? 'true' : 'false'} className="kb-omarchy-tiles">
      {/*
        THE TERMINAL WINDOW. It has chrome of its own whether or not it is
        sharing the screen — a compositor does not grow a title bar onto a
        window the moment a second one appears — and it is the focused window
        only while it is the only one.
      */}
      <div data-kb-window-tile="terminal" className="kb-omarchy-tile">
        <TitleBar name={TERMINAL[locale] ?? TERMINAL.en} focused={!tiled} />
        {/*
          The scroll box and its content, attached exactly once. `Terminal`
          watches the box for its width (the column count a game is handed) and
          the CONTENT for its height — a canvas has no height until it has
          measured itself, a frame or more after React commits it, and watching
          the box instead is the follow-the-bottom regression recorded in
          `Terminal.tsx`. Both stay on the transcript here, in a game and out
          of one: this window is never unmounted, only re-tiled.
        */}
        <div
          ref={scrollRef}
          data-kb-transcript=""
          className="kb-omarchy-body kb:overflow-y-auto kb:p-4"
        >
          <div ref={contentRef}>
            {blocks.map((b) => (
              <BlockView key={b.id} block={b} dir={dir} locale={locale} channel={channel} hoistLive />
            ))}
            {input}
          </div>
        </div>
      </div>

      {/*
        THE GAME WINDOW, opened by the RUNNING block itself rather than by
        `isLive`, so the one thing that must never happen — a game hoisted out
        of the transcript with no window to land in — cannot: the same fact
        decides both. It closes on its own when the block freezes, the terminal
        goes fullscreen again, and the still is already in the transcript.
      */}
      {live ? (
        <div data-kb-window-tile="game" data-kb-pane="" className="kb-omarchy-tile">
          <TitleBar name={liveTitle ?? ''} hints={hints} focused />
          <div className="kb-omarchy-body kb-omarchy-game">
            <BlockView block={live} dir={dir} locale={locale} channel={channel} />
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
