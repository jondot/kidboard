import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState,
} from 'react'
import type { GameSize, Hint, Locale } from '../types'
import { EMPTY_FRAME } from '../types'
import { makeTranscriptReducer, emptyTranscript } from './transcriptStore'
import { InputLine, type InputLineHandle } from './InputLine'
import { GamePicker } from './GamePicker'
import { loadTextSize, saveTextSize, SCALE_OF, type TextSize } from '../chrome/textSize'
import { typeOut } from '../chrome/demoType'
import { demoWord } from '../cartridges/intro/card'
import { ThemePicker } from './ThemePicker'
import { SystemPicker } from './SystemPicker'
import { useDoubleTap } from './doubleTap'
import { Window } from '../chrome/Window'
import { Menu } from '../chrome/Menu'
import { useSettingsMenu } from '../chrome/menuModel'
import { dirFor, makeT, normalize, saveLocale } from '../i18n/locale'
import { ThemeContext } from '../theme/context'
import { toVars, type ThemeVars } from '../theme/palette'
import { DEFAULT_DARK, themeById, type Theme } from '../theme/themes'
import {
  initialSelection, pickSystem, saveSelection, selectTheme, switchSystem,
} from '../systems/store'
import { MONO_STACK, SYSTEMS } from '../systems/systems'
import { SYSTEM_STRINGS } from '../systems/strings'
import type { Selection, SystemId } from '../systems/types'
import { clearsTranscriptOnExit, keepsScrollback } from '../systems/behaviour'
import { shellFor } from '../systems/shells'
import { makeSession } from '../runtime/session'
import { makeFrameLoop } from '../runtime/frameLoop'
import { makeFrameChannel } from '../runtime/frameChannel'
import { layout } from '../runtime/GridCanvas'
import { loadMuted, makeAudio } from '../runtime/audio'
import { makeRng } from '../runtime/rng'
import { resolve } from '../runtime/resolve'
import { EMOJI, smashResponse } from '../content/smash'
import type { Cartridge } from '../types'
import { byId, forLocale } from '../cartridges'
import { makeNudger } from '../runtime/nudge'

/**
 * Shell commands, in both languages: english / hebrew / עברית / אנגלית, and
 * quiet / שקט.
 */
const ENGLISH = new Set(['english', 'אנגלית'])
const HEBREW = new Set(['hebrew', 'עברית'])
const SOUND = new Set(['quiet', 'sound', 'שקט', 'צליל'])
const CLEAR = new Set(['clear', 'cls', 'נקה'])

/**
 * Horizontal chrome between the measured transcript box and the inside of a
 * game's border: the transcript's own `p-4` (16px a side) plus the block's
 * border and `p-2` (9px a side). Only the column *count* depends on this, and
 * only at the boundaries where an extra column fits — the cell size itself is
 * measured directly by GameCanvas, so the two can never drift apart.
 */
const GAME_INSET = 2 * (16 + 9)

export type TerminalProps = {
  locale: Locale
  seed: number
  onLocaleChange(l: Locale): void
  className?: string
}

export function Terminal({ locale, seed, onLocaleChange, className }: TerminalProps) {
  /**
   * The machine and its palette, as one pair — declared first, because the
   * transcript's own rules now depend on it.
   *
   * Read during the first render, exactly like the locale and the mute flag:
   * a returning child must never see a frame of the wrong machine, any more
   * than a frame of the wrong language. `initialSelection` also does the
   * validating — an unknown system falls back to Kidtari and the theme is then
   * judged against the system that actually won — so what lands here is always
   * a pair that exists.
   */
  const [selection, setSelection] = useState<Selection>(initialSelection)
  const system = useMemo(() => pickSystem(selection.system), [selection.system])

  /**
   * WHETHER A FINISHED GAME LEAVES A PICTURE BEHIND is the machine's call.
   *
   * On a machine that keeps its scrollback, the still IS the history — "leave
   * the game snapshot there so it would look like we visually played it and
   * stopped". Elsewhere a frozen block collapses to a one-line entry, which is
   * right for a machine that wipes the screen on exit and for one that keeps
   * the picture on its field instead.
   *
   * React uses the reducer from the latest render for the next dispatch, so
   * switching machine changes this from the next line onwards and leaves
   * everything already said exactly as it is.
   */
  const reducer = useMemo(
    () => makeTranscriptReducer(keepsScrollback(system)),
    [system],
  )
  const [blocks, dispatch] = useReducer(reducer, emptyTranscript)
  const [hints, setHints] = useState<Hint[]>([])
  // makeAudio() reads the persisted value, so seeding this from `false` made
  // a child who muted last session see 🔊 and un-mute with their first
  // `quiet`. Same class of bug as Kidboard's one-frame flash of English.
  const [muted, setMuted] = useState(loadMuted)
  /**
   * WHICH LIST IS UP, if any: the games (Shift, Shift), the colours (Ctrl,
   * Ctrl) or the machines (Option, Option). ONE piece of state rather than
   * three booleans, because two lists in the middle of the same screen is not
   * a state that exists.
   *
   * It lives here rather than in a shell because it is the same list on all
   * four machines and because it takes keys off a running cartridge, which
   * only the component that routes keys is allowed to arrange.
   */
  const [picking, setPicking] = useState<null | 'games' | 'themes' | 'systems'>(null)
  /**
   * HOW BIG THE PROSE IS. Read once, on the very first render, so a returning
   * child never sees one frame at the wrong size — the same rule the machine
   * and the palette are read under. See `chrome/textSize.ts`.
   */
  const [textSize, setTextSize] = useState<TextSize>(loadTextSize)
  /**
   * THE WORD THE MACHINE IS TYPING FOR ITSELF, or null.
   *
   * The last third of an arcade cabinet's attract loop is the machine playing
   * itself, and this is that for a machine whose verb is typing. See
   * `chrome/demoType.ts`; it runs once, ever, on a child's first visit.
   */
  const [ghost, setGhost] = useState<string | null>(null)
  const stopDemo = useRef<null | (() => void)>(null)

  const input = useRef<InputLineHandle>(null)
  const menuBox = useRef<HTMLDivElement>(null)
  /**
   * The transcript's scroll box and, inside it, its CONTENT — the one watched
   * for width, the other for height (see the scroll effect below).
   *
   * They are STATE behind callback refs rather than `useRef`, because a shell
   * may move them: the Kidtari swaps its whole tree when a game takes the
   * screen, and an observer attached once on mount would be left watching a
   * detached node and silently measuring nothing. State makes the two effects
   * below re-run and re-observe whatever is currently mounted.
   */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  // Read synchronously by `grid()` on every frame, so a resize is picked up by
  // the very next draw without a re-render.
  const boxWidth = useRef(0)
  const channel = useMemo(makeFrameChannel, [])
  const audio = useMemo(() => makeAudio(), [])
  const rng = useMemo(() => makeRng(seed), [seed])
  /**
   * The shell's strings, plus the four machine names. `SYSTEM_STRINGS` lives
   * beside the registry rather than in `i18n/en.json` because a machine name
   * is part of the machine's definition; `makeT`'s `extra` table is exactly
   * this shape, so merging it costs nothing and the keys (`system.*`) collide
   * with nothing.
   */
  const t = useMemo(() => makeT(locale, SYSTEM_STRINGS), [locale])
  const nudger = useMemo(() => makeNudger({ rng, locale }), [rng, locale])
  const dir = dirFor(locale)

  /**
   * A theme id is scoped to its system and `initialSelection` has already
   * refused any pair that is not, so this resolves. The two fallbacks are
   * belt and braces for the one case data cannot rule out — a palette file
   * that failed to parse — because a machine with no colours is still not an
   * error a child may see.
   */
  const theme = useMemo(
    (): Theme =>
      themeById(selection.theme) ?? themeById(system.defaultTheme) ?? DEFAULT_DARK,
    [selection.theme, system],
  )
  /** Only this machine's palettes. Picking a phosphor on a Kidtari is not a choice. */
  const themes = useMemo(
    () => system.themes.map((id) => themeById(id)).filter((th): th is Theme => !!th),
    [system],
  )
  /**
   * The palette and the typeface go onto the SAME element, the Kidboard root,
   * and never onto the document: everything below inherits both, the `2ch`
   * emoji cells in `.kb-art` included, and the host page is left exactly as it
   * was found.
   */
  const vars = useMemo(
    (): ThemeVars => ({
      ...toVars(theme.palette),
      '--kb-font': system.font.stack,
      /**
       * The face a DRAWING is set in, which is the machine's own only when
       * that face can hold a grid. See `SystemFont.monospaced` for the
       * measurements; the short version is that Silkscreen and VT323 give
       * `0`, `M` and a space three different widths, so every character grid
       * on those two machines came out ragged.
       */
      '--kb-art-font': system.font.monospaced ? system.font.stack : MONO_STACK,
      '--kb-font-size': `${system.font.size}px`,
      '--kb-line-height': String(system.font.lineHeight),
      /**
       * A MULTIPLIER ON THE MACHINE'S OWN TYPE, never a size of its own.
       * It reaches the prose and the prompt (`.kb-prose` in styles.css) and
       * nothing else: a game measures itself in the width of its container
       * and a drawing is a picture, so neither moves when this does.
       */
      '--kb-text-scale': String(SCALE_OF[textSize]),
      /**
       * WHETHER THE MACHINE OFFERS TO READ A LINE OUT LOUD.
       *
       * A muted machine must not, so the speaker on every line is hidden —
       * `display: none`, which takes it out of the tab order too. Doing it
       * with a variable rather than a prop is what keeps the sound switch out
       * of four shells and nine `BlockView` call sites: the frame already
       * re-renders when sound is toggled, and every speaker below it follows
       * in the same frame. `speech.ts` refuses on a muted machine as well;
       * this is the presentation half of the same rule.
       */
      '--kb-speak': muted ? 'none' : 'inline-flex',
    }),
    [theme, system, textSize, muted],
  )
  const cartridges = useMemo(() => forLocale(locale), [locale])
  /**
   * The running cartridge's own name, for whichever bit of chrome a machine
   * puts it on — the Kidtari's cartridge label, Kid Code's call line. Read
   * off the transcript rather than off the session, because the transcript is
   * what already holds the localised title (see `titleFor` in session.ts).
   */
  const liveTitle = useMemo(() => {
    const b = blocks.find((x) => x.kind === 'live' && x.state === 'running')
    return b && b.kind === 'live' ? b.title : null
  }, [blocks])
  /** …and which cartridge that is, so the shelf can open on it. */
  const liveId = useMemo(() => {
    const b = blocks.find((x) => x.kind === 'live' && x.state === 'running')
    return b && b.kind === 'live' ? b.cartridgeId : undefined
  }, [blocks])
  const hasKeyboard = typeof window !== 'undefined' && !('ontouchstart' in window)

  const session = useMemo(
    () =>
      makeSession({
        locale,
        audio,
        seed,
        say: (specs, o) => dispatch({ type: 'say', specs, group: o?.group }),
        mount: (cartridgeId, title) => {
          channel.reset()
          dispatch({ type: 'mount', cartridgeId, title })
        },
        // Straight to the canvas, not through the reducer. See frameChannel.
        frame: (f) => channel.emit(f),
        freeze: (souvenir) =>
          dispatch({ type: 'freeze', souvenir, frame: channel.latest() ?? EMPTY_FRAME }),
        // Live layout. A game declares columns and an aspect; the real column
        // count comes from the container it is actually being shown in.
        grid: (size: GameSize) => {
          const l = layout(Math.max(0, boxWidth.current - GAME_INSET), size.cols, size.aspect)
          return { w: l.cols, h: l.rows }
        },
      }),
    [locale, seed, audio, channel],
  )

  /**
   * The hints for the RUNNING cartridge, and nothing else.
   *
   * There is no global bottom bar any more: per-game help is a system's
   * decision, so an idle machine offers `[]` and each shell decides
   * where a running one's hints go — on the Kidtari's cartridge label, under the
   * game inline, on the screen, in a status bar. The ESC hint is appended
   * here, once, so no cartridge and no shell ever declares one.
   */
  const refreshHints = useCallback(() => {
    setHints(
      session.busy
        ? [...session.hints(), { keys: 'ESC', label: t('bar.esc') }]
        : [],
    )
  }, [session, t])

  /**
   * The current machine, readable from callbacks that outlive a render.
   * `loop`'s step function is built once per session and would otherwise
   * close over the machine that happened to be active when the game started.
   */
  const systemRef = useRef(system)
  systemRef.current = system
  /** Whether a live cartridge was running the last time we looked. */
  const wasLive = useRef(false)

  /**
   * Called wherever the session may have just changed hands.
   *
   * KIDTARI'S RULE lives here, and not in a shell, because it is behaviour: on a
   * machine whose scrollback is `clearOnExit`, a live cartridge ENDING empties
   * the transcript, and the child is left with a bare `READY`. Nothing is
   * re-said — `chrome.welcome` is false for that machine, so there is nothing
   * to re-say. Driven off `clearsTranscriptOnExit`, never off `system.id`, so
   * a fifth machine gets the behaviour by declaring it.
   */
  const syncSession = useCallback(() => {
    const live = session.isLive
    if (wasLive.current && !live && clearsTranscriptOnExit(systemRef.current)) {
      dispatch({ type: 'clear' })
    }
    wasLive.current = live
    refreshHints()
  }, [session, refreshHints])

  // The frame loop must run only while a live cartridge is running. A live
  // cartridge can end itself mid-tick (ctx.exit() called from its own
  // tick()), so the step function re-checks `session.busy` after every tick
  // and stops itself rather than relying solely on the key handler to notice.
  const loop = useMemo(
    () =>
      makeFrameLoop((dt) => {
        session.tick(dt)
        if (!session.busy) {
          loop.stop()
          syncSession()
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  )

  /**
   * Whether this machine greets you at all. A ref, so that switching machine
   * does not re-run the effect below and wipe a transcript (a switch is
   * immediate and clears nothing) — only a locale change does that, exactly
   * as it did before systems existed.
   */
  const welcomes = useRef(system.chrome.welcome)
  welcomes.current = system.chrome.welcome

  /**
   * What the arrival needs, held in a ref because it is used by the effect
   * below and defined further down the file. Assigned during render, like
   * `welcomes` above and for the same reason: putting these in the effect's
   * dependency list would re-run it — and re-CLEAR the transcript — on every
   * unrelated change.
   */
  const arriving = useRef<{
    start(c: Cartridge): void
    run(text: string): void
    carts: readonly Cartridge[]
  } | null>(null)

  /**
   * THE WELCOME SCREEN, said on every boot and re-said when the locale
   * changes.
   *
   * It is a SCREEN, not a one-off: a child arriving at this machine sees the
   * same face every time, the way an arcade cabinet has the same marquee
   * every time somebody walks up to it. It was tried as a first-visit-only
   * card behind a `kb.seen` flag and that is worse in two ways at once —
   * whoever needs it is exactly the child who will not remember it from last
   * week, and once-only state is invisible: there is no way to look at the
   * screen and know why the thing you were shown yesterday has gone.
   *
   * `chrome.welcome` still says whether a machine greets you in its OWN
   * voice — Kid Code's `hello!` sits above the card and a Kidtari's does not,
   * and that difference is half of what makes them different machines. What
   * it no longer carries is the instruction, because the card says it better
   * and two invitations in a row is one too many.
   *
   * It runs the `intro` cartridge rather than carrying a second copy of its
   * card, so typing `intro` gives back exactly what is on the boot screen —
   * one card, one catalog, one place to change it.
   */
  useEffect(() => {
    dispatch({ type: 'clear' })
    if (welcomes.current) {
      dispatch({
        type: 'say',
        specs: [
          { kind: 'text', text: t('welcome'), tone: 'win', scale: 'giant', rainbow: true },
        ],
      })
    }

    const arrival = arriving.current
    const intro = arrival?.carts.find((c) => c.id === 'intro')
    if (arrival && intro) arrival.start(intro)

    // …and then the cabinet plays itself: a word types itself into the prompt
    // and runs. Anything the child does stops it dead — that is the coin
    // going in, and it is why this can happen every boot without ever being
    // in anybody's way. A child who knows what they want types immediately
    // and never sees it. See `chrome/demoType.ts`.
    const word = demoWord(locale)
    const cancel = typeOut(word, {
      onFrame: setGhost,
      onDone: () => {
        setGhost(null)
        arriving.current?.run(word)
        /*
         * AND THEN THE MACHINE HANDS THE KEYBOARD OVER.
         *
         * The demonstration ends with a word having been typed and answered,
         * which is the exact moment a child wants to try one of their own —
         * and the caret was nowhere, so the next thing they typed went into
         * the page and vanished. A cabinet finishing its attract loop is
         * saying "your turn"; the caret is how this machine says it.
         *
         * Unconditional, touch devices included: a browser only raises a soft
         * keyboard for a focus it can trace to a user gesture, so this puts
         * the caret in the box on a desktop and does nothing visible on a
         * tablet, which is the right answer on both.
         */
        input.current?.focus()
      },
    })
    stopDemo.current = () => { cancel(); setGhost(null) }
    return () => { cancel(); setGhost(null); stopDemo.current = null }
  }, [t, locale])

  /**
   * FOLLOW THE BOTTOM.
   *
   * Scrolling when `blocks` changes is not enough, and this is a v2
   * regression: v1's game block was ~800 spans whose height existed the
   * moment React committed them, so the scroll target was right. A canvas has
   * no height until `GameCanvas` has measured its container through a
   * `ResizeObserver` and sized it — which happens a frame or more LATER, on a
   * commit of its own. Measured from a cold reload, eight games typed in a
   * row: once the transcript first overflowed, `scrollTop` stayed at 0 while
   * `scrollHeight - clientHeight` grew to 388px, so the running game AND the
   * input prompt were both below the fold and the child was looking at
   * "hello!".
   *
   * So the trigger is the CONTENT'S OWN HEIGHT, whatever caused it to change
   * — a new block, a canvas that has just learned how tall it is, a font that
   * finished loading, a wrapped line after a window drag. The `blocks` effect
   * stays as the immediate path; this is the one that catches up afterwards.
   */
  const toBottom = useCallback(() => {
    // jsdom (our test environment) does not implement Element.scrollTo.
    if (scrollEl && typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight })
    }
  }, [scrollEl])

  useEffect(toBottom, [blocks, toBottom])

  useEffect(() => {
    if (!contentEl) return
    const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (!RO) return
    const ro = new RO(toBottom)
    ro.observe(contentEl)
    return () => ro.disconnect()
  }, [contentEl, toBottom])

  // Responsive. Dragging a window or rotating a tablet changes the column
  // count a game is handed on its next frame; the canvas re-measures itself.
  useEffect(() => {
    if (!scrollEl) return
    const read = () => { boxWidth.current = scrollEl.clientWidth || 0 }
    read()
    const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (!RO) return
    const ro = new RO(read)
    ro.observe(scrollEl)
    return () => ro.disconnect()
  }, [scrollEl])

  useEffect(refreshHints, [refreshHints])

  // Global key routing. A running live cartridge owns every key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      audio.unlock()
      // THE COIN GOING IN. Whatever the child does — a key, a tap, a click —
      // the cabinet stops showing off and hands the machine over. This is
      // above every early return on purpose: the demo runs at an idle prompt,
      // where every one of them would have bailed first.
      stopDemo.current?.()
      // The one narrow exemption to "a running live cartridge owns every
      // key": a key aimed at the settings menu belongs to the menu. Reaching
      // it takes a deliberate Tab — clicking the menu never moves focus — so
      // a running game can never be stranded by a stray tap.
      const el = menuBox.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      if (!session.isLive && e.key !== 'Escape') return
      if (!session.busy) return
      const consumed = session.key({
        key: e.key, shift: e.shiftKey, repeat: e.repeat,
      })
      if (!consumed) return
      if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
      if (!session.busy) loop.stop()
      syncSession()
    }
    const onPointerDown = (): void => { stopDemo.current?.() }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [session, loop, audio, syncSession])

  useEffect(() => () => loop.stop(), [loop])

  /**
   * GIVE THE KEYBOARD BACK WHEN A GAME ENDS.
   *
   * The Kidtari unmounts the prompt for a full-screen game, so when the child
   * presses ESC the element that had focus no longer exists and focus lands on
   * `<body>`. The global key handler then bails — it routes to the session,
   * and the session is idle — so the machine looks alive and does nothing
   * until the child thinks to click. That is the DEFAULT machine, after EVERY
   * game, and it also lost ArrowUp history, which survives on the other three.
   *
   * Refocusing after every exit is right on all four rather than only where a
   * shell swaps its tree: a game has just ended, and the next thing a child
   * does is type. This runs after the commit that brought the prompt back,
   * which is why it cannot live in `syncSession` — that is called from event
   * handlers, before React has re-rendered anything.
   */
  const liveNow = session.isLive
  const wasLiveAtRender = useRef(liveNow)
  useEffect(() => {
    if (wasLiveAtRender.current && !liveNow) input.current?.focus()
    wasLiveAtRender.current = liveNow
  })

  /**
   * The single path by which a cartridge is started, whether the child typed
   * its name or picked it out of the 🎮 panel. Duplicating it was how the
   * panel would have quietly forgotten to start the frame loop.
   */
  const startCartridge = useCallback(
    (c: Cartridge, spoken?: string) => {
      audio.unlock()
      session.start(c, { hasKeyboard, input: spoken ?? c.triggers[locale]?.[0] ?? '' })
      // `else` on `isLive`, not on `busy`: starting a TURN cartridge while a
      // game was running left the frame loop spinning with nothing live in it
      // — `busy` was still true, so neither branch fired — until the turn
      // cartridge happened to end. The loop belongs to a live cartridge and
      // to nothing else.
      if (session.isLive) loop.start()
      else loop.stop()
      syncSession()
    },
    [session, loop, audio, hasKeyboard, locale, syncSession],
  )

  const onPickLocale = useCallback(
    (l: Locale) => { saveLocale(l); onLocaleChange(l) },
    [onLocaleChange],
  )

  /** Bigger words, and only words. Written only when a child actually picks. */
  const onPickTextSize = useCallback((size: TextSize) => {
    saveTextSize(size)
    setTextSize(size)
  }, [])

  /**
   * A palette, inside the current machine. `selectTheme` refuses one the
   * machine does not own rather than rendering from a palette that does not
   * exist here, and `saveSelection` is the only writer of the two keys, so
   * `kb.system` and `kb.theme` cannot drift apart.
   */
  const onPickTheme = useCallback((next: Theme) => {
    // Computed OUTSIDE the updater on purpose. Persisting is a side effect,
    // and StrictMode double-invokes a `setState` updater in development — an
    // updater that writes is a function that is no longer safe to call twice.
    const sel = selectTheme(selection, next.id)
    saveSelection(sel)
    setSelection(sel)
  }, [selection])

  /**
   * A whole machine.
   *
   * The transcript is NOT cleared — a switch is immediate and clears nothing — except that on a machine whose scrollback is `clearOnExit`, the
   * NEXT game to end will wipe it, which is that machine's own rule arriving
   * on schedule rather than a switch pretending to be one.
   *
   * `switchSystem` carries the palette across when the target machine also
   * owns it and falls back to the target's default otherwise, so a child never
   * lands on a machine showing a palette it does not have.
   */
  const onPickSystem = useCallback((id: SystemId) => {
    const sel = switchSystem(selection, id)
    saveSelection(sel)
    setSelection(sel)
  }, [selection])

  const onSubmit = useCallback(
    (text: string) => {
      audio.unlock()
      dispatch({ type: 'echo', prompt: system.prompt[locale] ?? system.prompt.en, text })

      if (session.submit(text)) {
        if (!session.busy) loop.stop()
        syncSession()
        return
      }

      if (nudger.tryAnswer(text)) {
        dispatch({
          type: 'say',
          specs: [
            { kind: 'text', text: t('nudge.yes'), tone: 'win', scale: 'giant', rainbow: true },
          ],
        })
        return
      }

      const lower = text.trim().toLowerCase()

      if (CLEAR.has(lower)) {
        dispatch({ type: 'clear' })
        return
      }
      // These are promised in BOTH languages, and the README documents
      // עברית / אנגלית as working. A Hebrew-reading child cannot be asked to
      // type an English word to get back to Hebrew.
      if (ENGLISH.has(lower)) { saveLocale('en'); onLocaleChange('en'); return }
      if (HEBREW.has(lower)) { saveLocale('he'); onLocaleChange('he'); return }
      if (SOUND.has(lower)) {
        const next = !audio.muted
        audio.setMuted(next)
        setMuted(next)
        dispatch({
          type: 'say',
          specs: [{ kind: 'text', text: t(next ? 'sound.off' : 'sound.on'), tone: 'info' }],
        })
        return
      }

      if (/^\d+$/.test(lower)) {
        const numbers = byId('numbers')
        if (numbers) startCartridge(numbers, lower)
        // A digit is a real, recognized input, not mashing — reset the
        // nudge run the same as any other recognized word.
        nudger.onInput(true)
        return
      }

      const res = resolve(text, { locale, cartridges })

      if (res.kind === 'cartridge') {
        if (res.corrected) {
          dispatch({
            type: 'say',
            specs: [{ kind: 'text', text: res.corrected, tone: 'win', scale: 'giant' }],
          })
        }
        startCartridge(res.cartridge, res.corrected ?? normalize(text))
        // A recognized cartridge match — including a forgiven typo — means
        // the child typed a real word. Reset the nudge run so alternating
        // real words with mashing never silently accumulates toward a
        // challenge.
        nudger.onInput(true)
        return
      }

      // Both remaining outcomes (`smash` and `echo`) fall through to the
      // nudge tail below instead of returning early, so a run of
      // unrecognized input can be tracked and, eventually, gently nudged.
      if (res.kind === 'smash') {
        dispatch({ type: 'say', specs: smashResponse(res.text, rng, t) })
      } else {
        const e = rng.pick(EMOJI)
        dispatch({
          type: 'say',
          specs: [{ kind: 'text', text: `${e} ${res.text} ${e}`, tone: 'cool' }],
        })
      }

      // A recognized cartridge match returns above, so by construction
      // every path reaching here is an unrecognized input (`smash` or
      // `echo`) — TypeScript narrows `res` accordingly, which is why this
      // isn't spelled out as `res.kind === 'cartridge'` as the brief shows.
      const challenge = nudger.onInput(false)
      if (challenge) {
        dispatch({
          type: 'say',
          specs: [
            { kind: 'text', text: challenge.prompt, scale: 'giant' },
            { kind: 'text', text: t(challenge.hintKey), tone: 'magic' },
          ],
        })
      }
    },
    [
      session, loop, audio, t, locale, rng, cartridges, onLocaleChange,
      syncSession, nudger, startCartridge, system,
    ],
  )

  /**
   * SOUND, from the menu. Typing `quiet` still does the same thing through
   * `onSubmit`; this is the pointer's path to it and they share one writer.
   */
  const onToggleSound = useCallback(() => {
    const next = !audio.muted
    audio.setMuted(next)
    setMuted(next)
  }, [audio])

  /**
   * The arrival's three moving parts, wired up now that all three exist.
   * Assigned during render, never in an effect: the effect that reads it runs
   * after this render has committed, so it can never see a stale one.
   */
  arriving.current = { start: startCartridge, run: onSubmit, carts: cartridges }

  const openPicker = useCallback(() => setPicking('games'), [])
  const openThemes = useCallback(() => setPicking('themes'), [])
  const openSystems = useCallback(() => setPicking('systems'), [])
  const closePicker = useCallback(() => {
    setPicking(null)
    input.current?.focus()
  }, [])

  /**
   * SHIFT, SHIFT for the games. CTRL, CTRL for the colours. OPTION, OPTION for
   * the machines.
   *
   * Three keys that type nothing, tapped twice, from anywhere: an idle prompt,
   * a running game, a Hebrew session. Each toggles — the same gesture that
   * opened a list closes it — and each closes another's list on the way, which
   * is what asking a different question means. See `doubleTap.ts` for why a
   * key pressed in between breaks the run.
   */
  useDoubleTap(
    'Shift',
    useCallback(() => setPicking((was) => (was === 'games' ? null : 'games')), []),
  )
  useDoubleTap(
    'Control',
    useCallback(() => setPicking((was) => (was === 'themes' ? null : 'themes')), []),
  )
  // Option on a Mac, Alt everywhere else — one key, and the browser calls it
  // `Alt` on both.
  useDoubleTap(
    'Alt',
    useCallback(() => setPicking((was) => (was === 'systems' ? null : 'systems')), []),
  )

  /** Picking a game from the list starts it and puts the list away. */
  const onPickFromPicker = useCallback((c: Cartridge) => {
    setPicking(null)
    startCartridge(c)
  }, [startCartridge])

  /**
   * A palette from the list, and it closes on the way out exactly as the game
   * list does. Two lists that open the same way and behave differently once
   * they are open would be two things to learn rather than one.
   */
  const onPickFromThemes = useCallback((th: Theme) => {
    setPicking(null)
    onPickTheme(th)
    input.current?.focus()
  }, [onPickTheme])

  /** A whole machine, from the list. Same shape, for the same reason. */
  const onPickFromSystems = useCallback((id: SystemId) => {
    setPicking(null)
    onPickSystem(id)
    input.current?.focus()
  }, [onPickSystem])

  const menuNodes = useSettingsMenu({
    t,
    locale,
    systems: SYSTEMS,
    systemId: system.id,
    themes,
    themeId: theme.id,
    muted,
    textSize,
    cartridges,
    onOpenPicker: openPicker,
    onOpenThemes: openThemes,
    onOpenSystems: openSystems,
    onPickCartridge: startCartridge,
    onPickLocale,
    onPickTextSize,
    onToggleSound,
  })

  /**
   * The one place a machine becomes pixels. A shell is PURE PRESENTATION: it
   * is handed the transcript, the hints and an already-built input line, and
   * decides only where they go. Every piece of state and every callback stayed
   * up here — and the FRAME around the shell is `Window`'s, so a machine's
   * face and the window it lives in are two files rather than one.
   */
  const Shell = shellFor(system.id)

  return (
    <ThemeContext.Provider value={theme.id}>
    <div
      dir={dir}
      /*
       * THE LANGUAGE OF EVERYTHING INSIDE THIS FRAME.
       *
       * On the frame and never on `<html>`: Kidboard is embeddable and leaves
       * the host page exactly as it found it, which is the same rule the
       * palette and the typeface already follow.
       *
       * `dir` says which way the words run; `lang` says what the words ARE,
       * and three different things read it. A screen reader pronounces the
       * transcript in the right language instead of spelling Hebrew out as
       * Latin. The browser's own spelling and autocorrect stop fighting a
       * five-year-old's Hebrew. And an input carrying it is a HINT to the
       * platform's keyboard — honoured by some Android IMEs, ignored by iOS,
       * which picks from the keyboards the child has installed — so it is
       * worth setting and worth not relying on.
       */
      lang={locale}
      data-kb-system={system.id}
      // Clicking ANYWHERE focuses the input, as the README promises;
      // the handler used to be bound only to the transcript, so the window
      // chrome and the padding around it did nothing.
      onClick={() => input.current?.focus()}
      // The palette and the typeface are written onto THIS element, never onto
      // the document: Kidboard is embeddable, so it themes itself and leaves
      // the host page exactly as it found it. Everything below inherits the
      // custom properties, the canvas included.
      style={vars}
      className={`kb-frame kb:relative kb:flex kb:flex-col kb:h-full kb:bg-kb-bg kb:text-kb-plain kb:overflow-hidden ${className ?? ''}`}
    >
      <Window
        system={system}
        locale={locale}
        dir={dir}
        t={t}
        title={t('title')}
        liveTitle={liveTitle}
        menu={
          // The wrapper is not decoration: the global key handler treats a key
          // whose target is inside it as the menu's, which is the single
          // narrow exemption to "a running live cartridge owns every key".
          <div ref={menuBox} className="kb:flex kb:items-center">
            <Menu
              label={t('menu.settings')}
              icon="settings"
              nodes={menuNodes}
              dir={dir}
              busy={session.busy}
            />
          </div>
        }
      >
        <Shell
          system={system}
          locale={locale}
          dir={dir}
          t={t}
          blocks={blocks}
          channel={channel}
          hints={hints}
          liveTitle={liveTitle}
          busy={session.busy}
          isLive={session.isLive}
          input={
            <InputLine
              ref={input}
              // The machine's own prompt, in the child's own language —
              // `READY` / `מוכן` on a Kidtari, `?` on a Logo.
              prompt={system.prompt[locale] ?? system.prompt.en}
              dir={dir}
              locale={locale}
              disabled={session.isLive}
              ghost={ghost}
              onSubmit={onSubmit}
            />
          }
          scrollRef={setScrollEl}
          contentRef={setContentEl}
        />
      </Window>

      {picking === 'games' ? (
        <GamePicker
          t={t}
          locale={locale}
          dir={dir}
          cartridges={cartridges}
          currentId={liveId}
          onPick={onPickFromPicker}
          onClose={closePicker}
        />
      ) : null}

      {picking === 'themes' ? (
        <ThemePicker
          t={t}
          locale={locale}
          dir={dir}
          themes={themes}
          themeId={theme.id}
          onPick={onPickFromThemes}
          onClose={closePicker}
        />
      ) : null}

      {picking === 'systems' ? (
        <SystemPicker
          t={t}
          dir={dir}
          systems={SYSTEMS}
          systemId={system.id}
          onPick={onPickFromSystems}
          onClose={closePicker}
        />
      ) : null}
    </div>
    </ThemeContext.Provider>
  )
}
