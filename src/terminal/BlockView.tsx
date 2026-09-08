import { Fragment, memo, useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { Block, Dir, Locale, Scale, Tone } from '../types'
import { canSpeak, hush, readable, speak } from '../runtime/speech'
import { makeT } from '../i18n/locale'
import { Glyph } from '../ui/icons'
import { GameCanvas } from '../runtime/GameCanvas'
import type { FrameChannel } from '../runtime/frameChannel'
import { toneClass, scaleClass } from './tones'
import { promptKind } from './promptKind'
import { splitWide } from './wide'

/**
 * The ONLY path by which monospace art reaches the DOM. Art is always laid out
 * left-to-right and isolated from the surrounding bidi context, so an RTL page
 * can never reorder an ASCII drawing.
 *
 * Emoji graphemes are tokenized out and rendered in `.kb-cell2` spans of
 * exactly `2ch`, so an emoji on a grid occupies precisely two monospace cells
 * however the browser fonts it. That fixes `memory` without memory knowing,
 * and every future `{ kind: 'art' }` grid with it. Concatenating the tokens
 * reproduces `art` byte for byte — nothing is added or dropped.
 *
 * This is the LAST home of the `2ch` hack, and the reason it survives: art is
 * still DOM, so the browser still chooses the emoji advance. A game is a
 * canvas, where we choose it ourselves and the grid is square by construction.
 */
/**
 * The width of the widest line of a drawing, in GRID CELLS.
 *
 * Cells, not characters: an emoji occupies exactly two monospace cells (see
 * `splitWide` and the `.kb-cell2` note below), so counting characters would
 * under-measure every emoji board by half and let it overflow anyway.
 *
 * At least 1, so the stylesheet's `calc()` can never divide by zero.
 */
export function cellsWide(art: string): number {
  let widest = 1
  for (const line of art.split('\n')) {
    let w = 0
    for (const tok of splitWide(line)) w += tok.wide ? 2 : tok.text.length
    if (w > widest) widest = w
  }
  return widest
}

/**
 * A DRAWING MADE ONLY OF BLOCK ELEMENTS IS A BITMAP, AND A BITMAP MUST TILE.
 *
 * `.kb-art` carries `line-height: 1.15` — already tightened once, because a
 * drawing is a grid and 1.375 pulls its rows apart. For most art that is
 * right: an ASCII cat wants a little air, and an emoji board needs it, since
 * an emoji glyph is routinely taller than its em box and rows set solid would
 * collide.
 *
 * But 15% of leading between the rows of a SOLID drawing is 15% of white
 * across every row of it, and a five-row block letter then reads as five
 * stripes. `intro`'s marquee shipped that way and looked like a barcode.
 *
 * The tell is the characters themselves: Unicode's Block Elements
 * (U+2580..U+259F) are the full and half blocks that `bitmapLabel` and the
 * marquee are made of, and nothing else here draws with them alone. A drawing
 * with one letter, one box-drawing rule or one emoji in it fails this and
 * keeps its air, which is why this can be read off the art rather than
 * declared on the block — there is no way for it to guess wrong.
 */
const SOLID = /^[\u2580-\u259F\s]+$/

export function ArtView(
  { art, tone = 'art', scale }: { art: string; tone?: Tone; scale?: Scale },
) {
  // `.kb-art-row` is a plain block that never sets its own `dir` — it
  // inherits the page's, so `text-align: start` on it resolves against the
  // ACTUAL reading direction. The `pre` inside keeps `dir="ltr"` for glyph
  // order (never touch that) and becomes `display: inline-block` in CSS, so
  // this row's text-align has something to actually position: a narrow
  // drawing sits on the reading edge instead of always flush left, and a
  // drawing wider than the container still overflows toward the correct
  // side. See the comment on `.kb-art-row` in styles.css for why alignment
  // cannot live on the `pre` itself.
  return (
    <div className="kb-art-row">
      {/* A scale class is emitted ONLY when one was asked for. `normal` pins
          `font-size: 1rem`, and a drawing that pinned itself to 16px would be
          the wrong size on a machine whose own type is 22px — so "no scale"
          has to mean inheriting, not defaulting.

          `--kb-art-cells` is this drawing's own width, and it is what stops a
          drawing overflowing the terminal: the stylesheet clamps the font size
          to whatever makes THIS many cells span the container. Measured in
          cells rather than characters, because an emoji is two of them — the
          same fact `splitWide` exists for. */}
      <pre
        dir="ltr"
        style={{ '--kb-art-cells': cellsWide(art) } as CSSProperties}
        className={[
          'kb-art',
          SOLID.test(art) ? 'kb-art-solid' : '',
          toneClass(tone),
          scale && scale !== 'normal' ? scaleClass(scale) : '',
        ].filter(Boolean).join(' ')}
      >
        {splitWide(art).map((tok, i) =>
          tok.wide
            ? <span key={i} className="kb-cell2">{tok.text}</span>
            : <Fragment key={i}>{tok.text}</Fragment>,
        )}
      </pre>
    </div>
  )
}

/**
 * ANY CHARACTER THAT TELLS A BROWSER WHICH WAY A LINE RUNS.
 *
 * The Latin and Hebrew/Arabic ranges, which is all this playground can ever
 * be written in. Emoji, digits, spaces and punctuation are all NEUTRAL — they
 * carry no direction of their own — and that is the whole point of this
 * regex.
 */
const STRONG = /[A-Za-z\u00C0-\u024F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * WHAT `dir` A LINE OF PROSE GETS, AND WHY IT IS NOT ALWAYS `auto`.
 *
 * SHIPPED BUG: in a Hebrew session, a reply made only of emoji sat hard
 * against the LEFT edge while every other line sat on the right. `dir="auto"`
 * does not mean "use the page's direction" — it means "look at the first
 * STRONG character and take its direction, and if there is not one, use
 * left-to-right". An emoji is not a strong character. Neither is a digit, a
 * space or a full stop. So `🐦🐦🐦` is a line with no opinion at all, and
 * `auto` answered LTR every single time, in every language.
 *
 * `auto` is still right for a line that HAS an opinion: a Hebrew child who
 * types `cat` should see `cat` read left to right, and an English reply in a
 * Hebrew session should not be mirrored. So the rule is narrow — when the
 * text says nothing about its own direction, the session answers for it, and
 * the line lands on the same edge as everything around it.
 */
export const dirOf = (text: string, dir: Dir): 'auto' | Dir =>
  STRONG.test(text) ? 'auto' : dir

/**
 * READ THIS OUT LOUD — a small speaker on a line the machine said.
 *
 * A six-year-old learning to read gets stuck on a word with nobody beside
 * them. Pressing this says the line; pressing it again stops. It is never
 * automatic, and it is never on the child's OWN words — those they already
 * know, they just typed them.
 *
 * IT IS ABSENT RATHER THAN DEAD wherever it could not work: a browser with no
 * `speechSynthesis`, or a line with no letters in it (a row of emoji is a
 * picture, and "dog face dog face dog face" is a worse answer than silence).
 * A machine with its sound off hides it in CSS — see `--kb-speak` — which is
 * the same rule as the prompt that a running game takes off the screen: never
 * leave a control on screen that answers nothing.
 */
function Speak({ text, locale }: { text: string; locale: Locale }) {
  const [saying, setSaying] = useState(false)
  const stop = useCallback(() => setSaying(false), [])

  // A line scrolled away, a machine switched, a language changed: whatever was
  // being read goes with it rather than talking on over the next thing.
  useEffect(() => () => { if (saying) hush() }, [saying])

  if (!canSpeak() || !readable(text)) return null
  return (
    <button
      type="button"
      className="kb-speak"
      data-kb-saying={saying ? '' : undefined}
      aria-label={makeT(locale)('speak.aloud')}
      onClick={() => {
        if (saying) { hush(); setSaying(false); return }
        setSaying(speak(text, locale, stop))
      }}
    >
      <Glyph name="speak" />
    </button>
  )
}

// Memoized: the transcript array is rebuilt on every dispatch, and only the
// block whose object identity changed needs to re-render.
export const BlockView = memo(function BlockView({
  block, dir, locale = 'en', channel, hoistLive = false,
}: {
  block: Block
  dir: Dir
  /**
   * The session's language, for the one thing in here that has to SAY
   * something: the speaker's label, and which voice reads the line. Defaulted
   * rather than required so a test that only cares about a picture can render
   * a block with two props, exactly as it always could — every shell passes
   * the real one.
   */
  locale?: Locale
  channel?: FrameChannel
  /**
   * The shell is painting the RUNNING game somewhere else — full screen, in a
   * field, in a pane — so the transcript must not paint it a second time.
   *
   * Only `running` is hoisted. A still is scrollback: `frozen` and
   * `collapsed` belong in the transcript wherever the transcript is, whatever
   * the machine does with a game while it is being played. Default `false`,
   * so an omitted prop is exactly today's inline behaviour.
   */
  hoistLive?: boolean
}) {
  if (block.kind === 'echo') {
    return (
      /*
       * `kb-prose` on the ROW, never on the words alone.
       *
       * SHIPPED BUG: it was on the text span, so at any text size but the
       * default the machine's own prompt stayed put while the word beside it
       * grew — `מוכן חתול` came out with the `מוכן` at 18px and the `חתול` at
       * 31px, two type sizes on one line. `InputLine` had it right and this
       * did not, which is the whole reason it is stated twice.
       *
       * A prompt and the word after it are ONE line of a conversation. They
       * scale together or the line comes apart.
       */
      <div className="kb-prose kb:flex kb:gap-2 kb:items-start">
        {/* The same prompt the live line below is drawing, marked the same
            way: a chevron that mirrors under Hebrew in the input box and not
            in the lines above it would be worse than one that mirrors in
            neither. See `promptKind.ts`. */}
        <span
          data-kb-prompt={promptKind(block.prompt)}
          dir="ltr"
          className="kb:text-kb-prompt kb:font-bold kb:shrink-0"
        >
          {block.prompt}
        </span>
        <span
          dir={dirOf(block.text, dir)}
          className="kb:text-kb-plain kb:whitespace-pre-wrap kb:break-words"
        >
          {block.text}
        </span>
      </div>
    )
  }

  if (block.kind === 'static') {
    const { spec } = block
    if (spec.kind === 'art') {
      return <ArtView art={spec.art} tone={spec.tone} scale={spec.scale} />
    }
    return (
      <div
        dir={dirOf(spec.text, dir)}
        className={[
          // `kb-prose` is what the text-size setting reaches. It is on the
          // words the machine SAYS and never on a drawing — see `.kb-prose`
          // in styles.css.
          'kb-prose',
          toneClass(spec.tone),
          scaleClass(spec.scale),
          spec.rainbow ? 'kb-rainbow' : '',
          'kb:whitespace-pre-wrap kb:break-words',
        ].join(' ')}
      >
        {spec.text}
        <Speak text={spec.text} locale={locale} />
      </div>
    )
  }

  if (hoistLive && block.state === 'running') return null

  if (block.state === 'collapsed') {
    // The souvenir is GUARDED, exactly as the frozen block's own line below
    // is. `piano` and `story` legitimately return '' at zero progress — the
    // template and both docs sanction it — and building the row
    // unconditionally rendered "piano —  ▸", a dash pointing at nothing
    // (and "פסנתר — ▸" in Hebrew).
    const row = block.souvenir
      ? `${block.title} — ${block.souvenir} ▸`
      : `${block.title} ▸`
    return (
      <div dir={dirOf(row, dir)} className="kb-prose kb:text-kb-dim kb:text-sm">{row}</div>
    )
  }

  return (
    <div
      // Full width, not inline-block: a game fills the terminal and its cell
      // size is derived from that width. `dir=ltr` keeps the border box itself
      // laid out left-to-right under Hebrew; the canvas inside has no bidi.
      //
      // A game is a SCREEN, not a card: no rounding, no padding — and no
      // bezel either. THE COURT IS THE SCREEN. Every game centres a
      // field-shaped stage inside the canvas (see `cartridges/stage.ts`) and
      // draws its own court border at the stage edge; this element is the
      // full width of the transcript, so a border here framed the court AND
      // the empty margins either side of it. Two nested frames, the outer one
      // enclosing dead space — plainly wrong in `ball` (wide margins) and in
      // `maze` (walls at the stage edge) alike.
      //
      // So the only frame a child sees is the one the game drew, which is
      // already a tone and already re-tints with the theme. A frozen block is
      // told apart by its dimming, as it always was.
      dir="ltr"
      className={[
        'kb:my-1 kb:block kb:w-full',
        block.state === 'frozen' ? 'kb:opacity-70' : '',
      ].join(' ')}
      style={{ marginInlineStart: 0 }}
    >
      <GameCanvas
        frame={block.frame}
        frozen={block.state === 'frozen'}
        channel={block.state === 'running' ? channel : undefined}
      />
      {block.souvenir ? (
        <div
          dir={dirOf(block.souvenir, dir)}
          className="kb-prose kb:text-kb-win kb:text-sm kb:mt-1"
        >
          {block.souvenir}
        </div>
      ) : null}
    </div>
  )
})
