import type {
  Audio, BlockSpec, Cartridge, Frame, GameSize, Hint, Key, Locale,
  LiveInstance, TurnInstance,
} from '../types'
import { Canvas } from './Canvas'
import { gridFor } from './GridCanvas'
import { makeCtx } from './ctx'
import { makeRng } from './rng'
import { makeT } from '../i18n/locale'

/**
 * FIX (S3): several cartridges were renamed to avoid trigger collisions, so
 * `c.id` and the word a child actually typed have drifted apart — a child who
 * types "aquarium" must not see "fish" in the collapsed souvenir row, and a
 * child who types נחשים must not see the Latin id "snake". The trigger a
 * child typed IS the name they know the game by, in the language they typed
 * it in, so it is the title — no interface change, no per-cartridge opt-in.
 *
 * Fallback order for a cartridge with nothing declared in the active locale
 * (still possible: `locales` gates which cartridges are OFFERED, not which
 * triggers exist per locale): the other locale's first trigger, then the
 * first emoji trigger, then — only as a last resort, and never a blank row —
 * the id.
 */
function titleFor(c: Cartridge, locale: Locale): string {
  const other: Locale = locale === 'en' ? 'he' : 'en'
  return (
    c.triggers[locale]?.[0] ??
    c.triggers[other]?.[0] ??
    c.triggers.emoji?.[0] ??
    c.id
  )
}

/**
 * Universal exit words, in both languages. No cartridge implements these —
 * quit is free to every turn cartridge, and that has to hold for a child
 * typing Hebrew too.
 */
const QUIT = new Set([
  'quit', 'exit', 'stop', 'bye',
  'יציאה', 'עצור', 'סיום', 'ביי', 'די',
])

export type SessionDeps = {
  locale: Locale
  audio: Audio
  seed: number
  /**
   * `group` is the paragraph the blocks belong to, minted here and understood
   * by the transcript: a later say carrying the same key supersedes the
   * earlier one. Absent means "append, and never be superseded". See
   * `SayOpts` in types.ts.
   */
  say(specs: BlockSpec[], o?: { group?: string }): void
  mount(cartridgeId: string, title: string): void
  /**
   * A finished frame: the recorded command buffer plus the grid it was drawn
   * against. NOT a rasterized `Cell[][]` — the commands still carry their
   * fractional positions, which is what lets the canvas painter place a ball
   * at 12.4 cells instead of snapping it to 12.
   */
  frame(f: Frame): void
  freeze(souvenir: string): void
  /**
   * Resolves a cartridge's declared `{ cols, aspect }` to the live grid for
   * the container it is being shown in, and is asked EVERY frame — so a
   * resize or a tablet rotation is picked up by the next draw. Optional so a
   * headless session (tests, a future Worker host) works without a layout.
   */
  grid?(size: GameSize): { w: number; h: number }
}

export type Session = {
  readonly busy: boolean
  readonly isLive: boolean
  start(c: Cartridge, o?: StartOpts): void
  submit(text: string): boolean
  key(k: Key): boolean
  tick(dt: number): void
  hints(): Hint[]
  stop(): void
}

export type StartOpts = { hasKeyboard?: boolean; input?: string }

type Active =
  | { kind: 'live'; cart: Extract<Cartridge, { kind: 'live' }>; inst: LiveInstance }
  | { kind: 'turn'; cart: Extract<Cartridge, { kind: 'turn' }>; inst: TurnInstance }

export function makeSession(deps: SessionDeps): Session {
  let active: Active | null = null

  // ONE rng for the whole session, seeded once. Re-seeding per start() from
  // the same constant made every echo cartridge return the identical result
  // forever (an elephant five times running); the rng's *lifetime* is the
  // session, not the call.
  const rng = makeRng(deps.seed)

  /**
   * PARAGRAPHS. Every start gets a run of its own and every plain `ctx.say`
   * opens a new paragraph inside that run, so a key is unique to one
   * cartridge, one start, one paragraph — a cartridge can never supersede
   * something an earlier cartridge (or an earlier round) left behind.
   */
  let runs = 0

  const ctxFor = (c: Cartridge, input: string, exit: () => void) => {
    const run = ++runs
    let paragraph = 0
    return makeCtx({
      locale: deps.locale,
      rng,
      audio: deps.audio,
      strings: c.strings,
      input,
      say: (specs, opts) => {
        if (opts?.replace) {
          deps.say(specs, { group: `${c.id}#${run}.${paragraph}` })
          return
        }
        // A plain say seals whatever is standing and starts the next
        // paragraph: nothing already on screen can be replaced from here on.
        paragraph += 1
        deps.say(specs)
      },
      exit,
    })
  }

  /**
   * ERROR CONTAINMENT. The premise of this project is that strangers drop
   * folders in, so "a bad cartridge bricks the terminal" is the real error
   * state — and the one the child must never see. Every call into cartridge
   * code goes through here: if it throws, the child gets one warm line and
   * the cartridge is torn down, and the shell carries on.
   *
   * This is not a licence for cartridges to throw. docs/CARTRIDGE-API.md
   * still says respond/onLine/draw are not expected to throw as part of
   * normal operation; this is the net under that, not a control-flow path.
   */
  const guard = <R,>(fn: () => R, fallback: R): R => {
    try {
      return fn()
    } catch (err) {
      // Visible to a developer, never to the child.
      console.error('[kidboard] a cartridge threw; ending it safely', err)
      active = null
      deps.say([{ kind: 'text', text: makeT(deps.locale)('oops'), tone: 'info' }])
      return fallback
    }
  }

  /**
   * The grid the last painted frame was drawn against. `tick` compares
   * against it so a cartridge WITHOUT a clock still notices a resize; see
   * `tick` below for why that is not academic.
   */
  let painted = { w: 0, h: 0 }

  /** The live grid for this frame: a resize is picked up here and nowhere. */
  const gridNow = (cart: Extract<Cartridge, { kind: 'live' }>) =>
    deps.grid ? deps.grid(cart.size) : gridFor(cart.size)

  const render = (): void => {
    if (active?.kind !== 'live') return
    const cart = active.cart
    // Asked fresh every frame: `CanvasLike.w`/`h` are live values, so a game
    // that lays itself out against them reflows on the very next frame after
    // a resize without any notification plumbing. (True of a game with a
    // clock because `tick` renders every frame, and true of one without
    // because `tick` renders it whenever this grid changes.)
    const g = gridNow(cart)
    painted = { w: g.w, h: g.h }
    const canvas = new Canvas(g.w, g.h)
    const inst = active.inst
    if (!guard(() => { inst.draw(canvas); return true }, false)) return
    if (active?.kind !== 'live') return // exited during draw()
    deps.frame({ cmds: canvas.cmds(), w: canvas.w, h: canvas.h })
  }

  const finish = (): void => {
    if (!active) return
    const kind = active.kind
    const inst = active.inst
    const souvenir = guard(() => inst.souvenir?.() ?? '', '')
    if (!active) return   // souvenir() threw; guard already tore the block down
    // Clear `active` BEFORE dispatching, so anything the host does in
    // response cannot re-enter a half-finished cartridge.
    active = null

    if (kind === 'live') {
      deps.freeze(souvenir)
      return
    }
    // A turn cartridge has no frame to freeze, so its souvenir used to be
    // computed and thrown away — dead code in a FROZEN api that both shipped
    // turn cartridges implement and src/cartridges/README.md teaches. It is
    // the turn-cartridge analogue of the live block's collapsed souvenir row
    // row, so say it: ctx.exit(), ESC and a quit word all land here.
    if (souvenir.trim()) {
      deps.say([{ kind: 'text', text: souvenir, tone: 'win' }])
    }
  }

  return {
    get busy() { return active !== null },
    get isLive() { return active?.kind === 'live' },

    start(c, o) {
      const input = o?.input ?? ''

      /**
       * WHATEVER IS RUNNING ENDS FIRST, whatever is starting.
       *
       * This used to sit below the two early returns, so an ECHO cartridge
       * started while a game was running left the game running: `help` typed
       * mid-`ball` printed the help under a ball that was still bouncing, both
       * of them live, with the transcript's one-running-block invariant
       * quietly broken. Ending first is also what makes the needs-keyboard
       * message honest — it is a refusal to start something, not a reason to
       * leave the last thing running.
       */
      finish()

      if (c.kind === 'echo') {
        guard(() => c.respond(ctxFor(c, input, finish)), undefined)
        return
      }

      if (c.kind === 'live' && c.needsKeyboard !== false && o?.hasKeyboard === false) {
        const t = makeT(deps.locale, c.strings)
        deps.say([{ kind: 'text', text: t('needs.keyboard'), tone: 'info' }])
        return
      }

      // A cartridge that calls ctx.exit() synchronously from inside its own
      // create() — before this session has anything mounted for it — would
      // otherwise slip past `finish()` (which no-ops while `active` is still
      // null) and end up mounted anyway once control returns here. This flag
      // catches that case so a self-cancelling cartridge never gets mounted.
      let exited = false
      const ctx = ctxFor(c, input, () => { exited = true; finish() })

      if (c.kind === 'turn') {
        const made = guard(() => c.create(ctx), null)
        if (exited || !made) return
        active = { kind: 'turn', cart: c, inst: made }
        guard(() => made.start(), undefined)
        return
      }

      const inst = guard(() => c.create(ctx), null)
      if (exited || !inst) return
      active = { kind: 'live', cart: c, inst }
      deps.mount(c.id, titleFor(c, deps.locale))
      render()
    },

    submit(text) {
      if (active?.kind !== 'turn') return false
      if (QUIT.has(text.trim().toLowerCase())) {
        finish()
        return true
      }
      const inst = active.inst
      guard(() => inst.onLine(text), undefined)
      return true
    },

    key(k) {
      if (!active) return false
      if (k.key === 'Escape') {
        finish()
        return true
      }
      if (active.kind !== 'live') return false
      const inst = active.inst
      if (!guard(() => { inst.onKey?.(k); return true }, false)) return true
      render()
      return true
    },

    tick(dt) {
      if (active?.kind !== 'live') return
      const inst = active.inst

      /**
       * A CARTRIDGE WITHOUT A CLOCK STILL HAS TO SEE THE WINDOW MOVE.
       *
       * `piano` has no `tick` — nothing in it happens because time passed —
       * and this used to return here, so nothing re-rendered it either. A
       * child who widened the browser got a game frozen at its old size with
       * dead space beside it, indefinitely, until they happened to press a
       * key. `render()`'s own comment claimed the opposite.
       *
       * The size is the only thing that can have changed for such a
       * cartridge, so that is what is checked: a still picture is not
       * repainted sixty times a second, and a resize lands on the very next
       * frame, exactly as it does for a game with a clock.
       */
      if (!inst.tick) {
        const g = gridNow(active.cart)
        if (g.w !== painted.w || g.h !== painted.h) render()
        return
      }

      if (!guard(() => { inst.tick!(dt); return true }, false)) return
      render()
    },

    hints() {
      if (!active) return []
      const cart = active.cart
      return guard(() => cart.hints(makeT(deps.locale, cart.strings)), [])
    },

    stop() { finish() },
  }
}
