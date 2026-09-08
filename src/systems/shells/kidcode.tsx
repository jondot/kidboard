import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BlockView } from '../../terminal/BlockView'
import { makeRng } from '../../runtime/rng'
import type { Block, Hint, Locale } from '../../types'
import type { ShellProps } from '../Shell'

/**
 * THE KIDCODE CODE MACHINE.
 *
 * Not a chat. A transcript is a column of LEFT-GUTTER MARKERS — no avatar, no
 * name label, no rounded message card — and the whole point of this machine is
 * that starting a cartridge is a TOOL CALL:
 *
 *     ⏺ ball(bounce · ← → move · ESC done)
 *       ⎿  <the game>
 *
 * `helpAt: 'callLine'` is that parenthetical, so the cartridge's help and the
 * line announcing it are ONE thing rather than two bits of chrome that have to
 * be kept in step. `keep` + `inline` do the rest: the game is painted where the
 * child started it and, once it is over, the still stays exactly there — the
 * scrollback reads as "we played this, and then we stopped".
 *
 * Everything else is furniture, and all of it is driven off `system.chrome`
 * rather than off `system.id`, so a fifth machine that wants a welcome box
 * gets one by saying so.
 *
 * MONOCHROME. The ground plus one ink. `⏺`, `⎿`'s sibling markers, `>`, the
 * caret and the spinner's `✻` take the accent; every other thing this file
 * draws is ink, dim ink, or the border tone. Never a third colour.
 */

/**
 * The spinner's whole life, in ms, and the beat at which it re-reads the
 * clock.
 *
 * SHORT ON PURPOSE. The spinner is chrome, not a gate: it delays no cartridge
 * (a tool call never defers — see `deferrable` below), swallows no keystroke,
 * and is over before a six-year-old could decide to be bored by it. Long
 * enough that the elapsed counter is a real number and not a stuck zero.
 */
const THINK_MS = 1200
const TICK_MS = 250

/**
 * The nonsense. Kid Code's gerunds are a joke the terminal tells itself,
 * and the user named two of these himself.
 *
 * IT IS THE ONLY JOKE ON THIS SCREEN, so it has to land in both languages.
 * Latin nonsense in a Hebrew session is not the joke — it is a child being
 * shown letters they cannot read yet, which is the one thing this playground
 * is not allowed to do.
 *
 * The Hebrew side is therefore NOT a transliteration of the English, and not
 * invented Hebrew either. It is eighteen real reduplicated verbs — the
 * מְפַרְפֵּר / מְקַשְׁקֵשׁ / מְדַגְדֵּג family — every one of which a six-year-old
 * knows, every one of which is silly out loud, and every one of which sounds
 * like a machine making a noise it should not be making. Same joke, told in
 * the language it has to be funny in. This is the standing rule from
 * `docs/HEBREW-REVIEW.md`: onomatopoeia is CHOSEN, never transliterated.
 */
export const GERUNDS: Record<Locale, readonly string[]> = {
  en: [
    'Flabbering', 'Gazibling', 'Wobbulating', 'Snorfling', 'Bamboozling',
    'Kerfuffling', 'Noodling', 'Squibbling', 'Blorping', 'Whiffling',
    'Zonkering', 'Doodlebobbing', 'Jibberflopping', 'Mooshing', 'Zizzling',
    'Ploinking', 'Wumpling', 'Splonkering',
  ],
  he: [
    'מפרפר', 'מקשקש', 'מדגדג', 'מגמגם', 'מטרטר',
    'מזמזם', 'מפטפט', 'מגלגל', 'מנמנם', 'מרשרש',
    'מצקצק', 'מפכפך', 'מטפטף', 'מקרקר', 'משקשק',
    'מצפצף', 'מתנדנד', 'מבלבל',
  ],
}

/**
 * The chrome's own words. They live here, next to the only machine that says
 * them, for the same reason `systems/strings.ts` exists: this is a shell
 * string, not a cartridge string, and `en.json` is held by other work.
 *
 * The hint line under the prompt box is `? for shortcuts` in SHAPE — dim,
 * terse, key then action — but it never says "type", and it never promises a
 * shortcut menu that does not exist. Both halves are true of `InputLine`:
 * Enter sends, Escape empties the line.
 */
const CHROME: Record<Locale, { interrupt: string; idle: string; live: string }> = {
  en: {
    interrupt: 'esc to interrupt',
    idle: '⏎ to send · esc to clear',
    live: 'esc to stop',
  },
  he: {
    interrupt: 'esc להפסקה',
    idle: '⏎ לשליחה · esc לניקוי',
    live: 'esc לעצירה',
  },
}

/**
 * THE HEADER, and it is a copy of a real one because the child's grown-up has
 * that real one open on the next desk.
 *
 *     ▗▚▖  Kid Code  v2
 *     ▝▚▘  Kidboard 1 · nothing to lose
 *          ~/projects/kidboard
 *
 * A logo tile, a bold name with a dim version beside it, a subtitle and a
 * working directory — the four-line shape a terminal tool greets you with,
 * in this machine's own words. Both numbers are CONSTANTS and neither is a
 * real one: a number that ticks would be a thing on screen that changes for
 * no reason a child can see.
 */
const HEADER = {
  name: 'Kid Code',
  version: 'v2',
  subtitle: 'Kidboard 1 · nothing to lose',
  cwd: '~/projects/kidboard',
} as const

/**
 * The logo tile: a five-by-five block mosaic, drawn in half-block characters
 * in the accent. Not an image and not an SVG — this machine draws with
 * characters, so its own mark is drawn with characters too.
 */
const LOGO = ['▗▄▖', '▐▚▟', '▝▀▘'] as const

/**
 * A turn, as the gutter draws it.
 *
 * `said` swallows a RUN of consecutive static blocks, because one `ctx.say`
 * of three lines is one thing Kid Code said and gets exactly one `⏺` — three
 * bullets down the side of one answer is the tell that gives a chat component
 * away.
 */
type Turn =
  | { key: string; kind: 'said'; blocks: Block[] }
  | { key: string; kind: 'echo'; block: Block }
  | { key: string; kind: 'call'; block: Extract<Block, { kind: 'live' }> }

function turnsOf(blocks: Block[]): Turn[] {
  const out: Turn[] = []
  for (const b of blocks) {
    if (b.kind === 'static') {
      const last = out[out.length - 1]
      if (last && last.kind === 'said') {
        last.blocks.push(b)
        continue
      }
      out.push({ key: b.id, kind: 'said', blocks: [b] })
      continue
    }
    if (b.kind === 'echo') out.push({ key: b.id, kind: 'echo', block: b })
    else out.push({ key: b.id, kind: 'call', block: b })
  }
  return out
}

/** Index of the newest thing the CHILD said, or -1. */
function lastEchoAt(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]!.kind === 'echo') return i
  return -1
}

/**
 * A stable seed from a block id. Ids are minted `b1`, `b2`, … so this is
 * deterministic per turn and different between turns — which is all the
 * rotation needs, and is why the global random source is nowhere in this file:
 * a seeded `Rng` makes the gerund reproducible in a test and identical on two
 * screens showing the same transcript.
 */
function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** One gutter cell. Its own box, so no bidi run can ever reorder the marker. */
function Gutter({ mark }: { mark: string }) {
  return (
    <span data-kb-gutter="" aria-hidden="true" className="kb-kc-gutter">
      {mark}
    </span>
  )
}

/**
 * THE RESULT RAIL, which is what `⎿` grew into.
 *
 * A single `⎿` glyph is an L one character tall sitting beside a game that is
 * four hundred pixels tall — it marks where the result STARTS and then abandons
 * it, so a tall result had nothing tying it to the call above. This is the same
 * L, drawn rather than typed: it runs the full height of whatever it
 * introduces, then turns and stops. Two borders on an empty box, so it is
 * exactly as tall as its content by construction and can never be a glyph that
 * disagrees with the thing beside it.
 *
 * `aria-hidden`, like every other marker here: it is structure a sighted reader
 * follows, and the transcript reads perfectly without it.
 */
function Rail() {
  return <span data-kb-gutter="" aria-hidden="true" className="kb-kc-rail" />
}

export function KidCodeShell({
  system, locale, dir, blocks, channel, hints, busy, isLive,
  input, scrollRef, contentRef,
}: ShellProps) {
  const words = CHROME[locale] ?? CHROME.en
  const echoAt = lastEchoAt(blocks)
  const lastEcho = echoAt === -1 ? null : blocks[echoAt]!.id

  /**
   * Whether this turn's answer may be held back behind the spinner.
   *
   * Only when the tail is prose. A cartridge starting is a TOOL CALL and a
   * tool call is instant — deferring one would hold a canvas out of the DOM,
   * which is the frame loop's own mount point, so the spinner would stop being
   * chrome and start being a bug.
   */
  const tail = blocks.slice(echoAt + 1)
  const deferrable = tail.length > 0 && tail.every((b) => b.kind === 'static')

  const [thinking, setThinking] = useState<{ id: string; gerund: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  /**
   * Read by the effect below, which depends on the ECHO alone: a dependency on
   * any of these would tear the timers down mid-thought and leave a spinner
   * standing forever.
   *
   * `busy` is the second half of "never be the reason a child waits". While a
   * cartridge is running, every line the child types is the CARTRIDGE's turn —
   * a guess in `count`, a letter in `memory` — and its board must come back
   * the instant it is redrawn. The spinner belongs to the conversation, not to
   * a game in progress.
   */
  const armable = useRef(false)
  /**
   * `busy` as of the PREVIOUS render, and the reason it is needed: a turn
   * cartridge that ends on the line it answers with — the cheer that closes a
   * round — lands in the same commit that flips `busy` to false. Reading only
   * the current value would arm the spinner on it and hold a child's winning
   * line back for a beat and a bit. A game answering a guess is never Kid Code
   * thinking; it is the game, and it has to be instant.
   */
  const wasBusy = useRef(busy)
  armable.current = system.chrome.spinner && deferrable && !busy && !wasBusy.current

  useEffect(() => {
    if (!lastEcho || !armable.current) return
    setThinking({ id: lastEcho, gerund: makeRng(seedOf(lastEcho)).pick(GERUNDS[locale]) })
    setElapsed(0)
    const started = Date.now()
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      TICK_MS,
    )
    // ONE shot. When it fires it kills the readout with it, so nothing here
    // re-arms and nothing keeps ticking behind a spinner that is already gone.
    const done = setTimeout(() => {
      clearInterval(tick)
      setThinking(null)
    }, THINK_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(done)
    }
  }, [lastEcho, locale])

  // Declared after the arming effect on purpose: effects run in source order,
  // so by the time this overwrites the flag the spinner has already asked.
  useEffect(() => { wasBusy.current = busy })

  /**
   * While the spinner is up, the prose of THIS turn is not on screen yet — it
   * lands under the spinner when the beat is over. Live blocks are never
   * withheld, whatever else is going on.
   */
  const held = thinking !== null && thinking.id === lastEcho
  const shown = held
    ? blocks.filter((b, i) => !(i > echoAt && b.kind === 'static'))
    : blocks

  const turns = turnsOf(shown)

  /** The parenthetical: the cartridge's own name, then its keys. */
  const callArgs = (block: Extract<Block, { kind: 'live' }>): ReactNode => {
    const live = block.state === 'running'
    const parts: ReactNode[] = []
    if (block.title && block.title !== block.cartridgeId) {
      parts.push(<span key="t" dir="auto">{block.title}</span>)
    }
    if (live) {
      for (const h of hints as Hint[]) {
        parts.push(
          <span key={`h${h.keys}${h.label}`} className="kb-kc-hint">
            <span dir="ltr" className="kb-kc-keys">{h.keys}</span>
            <span dir="auto">{h.label}</span>
          </span>,
        )
      }
    }
    if (parts.length === 0) return null
    return (
      <span {...(live ? { 'data-kb-hints': '' } : {})} className="kb-kc-args">
        {parts.map((p, i) => (
          <span key={i} className="kb-kc-arg">
            {i > 0 ? <span className="kb-kc-mid"> · </span> : null}
            {p}
          </span>
        ))}
      </span>
    )
  }

  return (
    <div
      data-kb-shell={system.id}
      className="kb-kc kb:flex kb:flex-col kb:h-full kb:min-h-0"
    >
      <div
        ref={scrollRef}
        data-kb-transcript=""
        className="kb:flex-1 kb:overflow-y-auto kb:p-4"
      >
        {/* One plain wrapper, so the CONTENT's height can be observed. The
            scroll box's own height never changes when a canvas grows inside
            it, which is why the follow-the-bottom observer cannot watch that
            instead. See the `FOLLOW THE BOTTOM` note in `Terminal.tsx`. */}
        <div ref={contentRef}>
          {/* `chrome.welcome`, never the id. Latin end to end, so it is
              isolated LTR rather than mirrored into nonsense under Hebrew. */}
          {system.chrome.welcome ? (
            <div data-kb-welcome="" dir="ltr" className="kb-kc-header">
              <div className="kb-kc-logo" aria-hidden="true">
                {LOGO.map((row, i) => <div key={i}>{row}</div>)}
              </div>
              <div className="kb-kc-header-lines">
                <div className="kb-kc-header-name">
                  {HEADER.name}{' '}
                  <span className="kb-kc-header-version">{HEADER.version}</span>
                </div>
                <div className="kb-kc-header-sub">{HEADER.subtitle}</div>
                <div className="kb-kc-header-cwd">{HEADER.cwd}</div>
              </div>
            </div>
          ) : null}

          {turns.map((turn, i) => (
            <div key={turn.key}>
              {/* An ANSI rule between turns — the child speaking is what
                  starts a new one — and never one above the first thing on
                  the screen. */}
              {turn.kind === 'echo' && i > 0 ? (
                <div data-kb-sep="" />
              ) : null}

              {turn.kind === 'echo' ? (
                <div data-kb-echo="" className="kb-kc-echo">
                  <BlockView block={turn.block} dir={dir} locale={locale} channel={channel} />
                </div>
              ) : null}

              {turn.kind === 'said' ? (
                <div data-kb-say="" className="kb-kc-row">
                  <Gutter mark="⏺" />
                  <div className="kb-kc-body">
                    {turn.blocks.map((b) => (
                      <BlockView key={b.id} block={b} dir={dir} locale={locale} channel={channel} />
                    ))}
                  </div>
                </div>
              ) : null}

              {turn.kind === 'call' ? (
                <div className="kb-kc-call-turn">
                  <div className="kb-kc-row">
                    <Gutter mark="⏺" />
                    {/* `dir="ltr"` on the LINE, never on the row: the gutter
                        column must keep mirroring with every other marker in
                        the transcript, while the line itself is CODE — under
                        Hebrew, `ball(…)` would have its brackets mirrored and
                        its arrow keys re-ordered. A Hebrew title or hint
                        inside this still reads right-to-left on its own.

                        Same shape as `.kb-art-row` in `styles.css`, and for
                        the same reason: `start` resolves against an element's
                        OWN direction, so the alignment has to sit on the
                        wrapper that never sets one, and the LTR box has to
                        shrink to fit for that alignment to have anything to
                        position. Without it the call line pins itself to the
                        left of the terminal while its own `⏺` sits at the
                        right, under Hebrew. */}
                    <div className="kb-kc-body kb-kc-callrow">
                      <span data-kb-call="" dir="ltr" className="kb-kc-callline">
                        <span className="kb-kc-tool">{turn.block.cartridgeId}</span>
                        <span>(</span>
                        {callArgs(turn.block)}
                        <span>)</span>
                      </span>
                    </div>
                  </div>
                  {/* `hoistLive={false}`: on this machine the game stays in
                      the transcript, running and frozen alike. */}
                  <div data-kb-result="" className="kb-kc-row kb-kc-result">
                    <Rail />
                    <div className="kb-kc-body">
                      <BlockView
                        block={turn.block}
                        dir={dir} locale={locale}
                        channel={channel}
                        hoistLive={false}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {/* Elapsed seconds and nothing else. There are no tokens here, and
              a counter with an invented number in it is exactly the counting
              this playground does not do. */}
          {held ? (
            <div data-kb-spinner="" dir="ltr" className="kb-kc-spinner">
              {/* The star TURNS and the dots FILL, and both are CSS — no
                  timer, no re-render, and nothing left running when the
                  spinner is unmounted a beat later. See `kidcode.css`. */}
              <span className="kb-kc-star" aria-hidden="true">✻</span>{' '}
              <span className="kb-kc-gerund">{thinking!.gerund}</span>
              <span data-kb-dots="" className="kb-kc-dots" aria-hidden="true">
                <i>.</i><i>.</i><i>.</i>
              </span>{' '}
              <span className="kb-kc-meta">({elapsed}s · {words.interrupt})</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="kb-kc-foot">
        {system.chrome.promptBox ? (
          <div data-kb-promptbox="" className="kb-kc-promptbox">{input}</div>
        ) : (
          input
        )}
        <div data-kb-shortcuts="" dir="auto" className="kb-kc-shortcuts">
          {isLive ? words.live : words.idle}
        </div>
      </div>
    </div>
  )
}
