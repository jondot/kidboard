import type { DrawCmd, LiveCartridge, Locale } from '../types'
import { gridFor } from '../runtime/GridCanvas'
import { makeT } from '../i18n/locale'
import { DEFAULT_SIZE, type CartManifest } from './manifest'
import { makeWorkerHost, workerSourceUrl, type WorkerLike } from './host'
import { replay } from './protocol'
import { CART_STRINGS } from './strings'

/**
 * A cart, dressed as a `LiveCartridge`.
 *
 * This is what makes portable carts additive rather than a rewrite: the
 * session, the frame loop, the canvas, ESC, the souvenir row and the context
 * bar all keep working exactly as they do for a built-in, because from where
 * they stand a cart IS a built-in. Only the inside of `create` differs — the
 * instance is a thin shell over a `WorkerHost` instead of over cart code.
 *
 * The one visible difference is a single frame of latency: `draw()` replays
 * the most recent buffer the Worker posted rather than one recorded this
 * instant. At sixty frames a second nobody can see it.
 */
export type CartCartridgeOpts = {
  /** Final words per locale, after name clashes were settled. */
  names: Partial<Record<Locale, string>>
  /** Overridable so tests can run the bootstrap without a real Worker. */
  spawn?: () => WorkerLike
}

const defaultSpawn = (): WorkerLike => {
  const url = workerSourceUrl()
  const w = new Worker(url) as unknown as WorkerLike
  // The blob is compiled by now; holding the URL any longer only leaks it.
  URL.revokeObjectURL(url)
  return w
}


/** `cart.hint.0`, `cart.hint.1`, … — generated, never authored. */
const hintKey = (i: number): string => `cart.hint.${i}`

const hintCount = (m: CartManifest): number =>
  Math.min(4, Math.max(...(['en', 'he'] as Locale[]).map((l) => m.hints[l]?.length ?? 0), 0))

/** The cart's own strings, plus its hints, so `t` can reach both. */
function withHintKeys(m: CartManifest): CartManifest['strings'] {
  const out: CartManifest['strings'] = {}
  for (const l of ['en', 'he'] as Locale[]) {
    const list = m.hints[l]
    const base = m.strings[l]
    if (!list && !base) continue
    const table: Record<string, string> = { ...base }
    ;(list ?? []).slice(0, 4).forEach((h, i) => { table[hintKey(i)] = h })
    out[l] = table
  }
  return out
}

/**
 * `"SPACE jump"` reads as a key and a label; `"hold the arrow"` is all label.
 * The heuristic is deliberately narrow — a first token with no letters in it
 * (an arrow, a bracket) or one that is bare capitals and digits (ESC, SPACE,
 * A) is a key cap, and anything else is prose. Guessing wrong costs a hint
 * that is merely styled plainly, never a hint that is wrong.
 */
export function splitHint(raw: string): { keys: string; label: string } {
  const text = raw.trim()
  const gap = text.search(/\s/)
  if (gap <= 0) return { keys: '', label: text }
  const head = text.slice(0, gap)
  const looksLikeKeys = !/\p{L}/u.test(head) || /^[A-Z0-9]+$/.test(head)
  return looksLikeKeys
    ? { keys: head, label: text.slice(gap).trim() }
    : { keys: '', label: text }
}

export function makeCartCartridge(m: CartManifest, o: CartCartridgeOpts): LiveCartridge {
  const spawn = o.spawn ?? defaultSpawn
  const size = m.size ?? DEFAULT_SIZE
  const locales = (['en', 'he'] as Locale[]).filter((l) => o.names[l] !== undefined)

  return {
    kind: 'live',
    apiVersion: 1,
    id: `cart:${m.id}`,
    triggers: {
      ...(o.names.en ? { en: [o.names.en] } : {}),
      ...(o.names.he ? { he: [o.names.he] } : {}),
      ...(m.emoji ? { emoji: [m.emoji] } : {}),
    },
    locales: locales.length > 0 ? locales : m.locales,
    strings: withHintKeys(m),
    size,
    /**
     * `T` carries no locale, so a manifest's per-locale hint list is folded
     * into the cart's own string table under generated keys and looked up
     * through `t` like everything else. Same resolution order, same fallback
     * to English, no new machinery.
     *
     * No ESC hint ever survives: the shell appends exactly one whenever a
     * cartridge runs, and a cart that declares its own would make the context
     * bar read "ESC done   ESC done".
     */
    hints: (t) => Array.from({ length: hintCount(m) }, (_, i) => splitHint(t(hintKey(i))))
      .filter((h) => !h.keys.toUpperCase().includes('ESC')),

    create(ctx) {
      const t = makeT(ctx.locale, CART_STRINGS)
      const title = m.title[ctx.locale] ?? m.title.en ?? o.names[ctx.locale] ?? m.id

      let latest: DrawCmd[] = []
      let grid = gridFor(size)
      let souvenir = ''
      /** True once the shell is tearing this down, so exits do not echo back. */
      let ending = false

      const host = makeWorkerHost({
        locale: ctx.locale,
        seed: ctx.rng.int(0x7fffffff),
        input: ctx.input,
        audio: ctx.audio,
        grid: () => grid,
        manifest: m,
        spawn,
        events: {
          frame: (f) => { latest = f.cmds },
          say: (blocks) => ctx.say(blocks),
          exit: (s) => {
            souvenir = s
            if (ending) return
            ending = true
            ctx.exit()
          },
          // A cart that hung, threw, or was never runnable. One warm line,
          // in the child's language, and never the word "error".
          hush: () => { ctx.say([{ kind: 'text', text: t('carts.rest', { name: title }), tone: 'info' }]) },
        },
      })

      host.start()

      return {
        onKey: (k) => host.key(k),
        tick: (dt) => host.tick(dt),
        draw: (c) => {
          // The live grid, learned every frame — a resize reaches the cart on
          // its next tick, exactly as it reaches a built-in.
          grid = { w: c.w, h: c.h }
          replay(latest, c)
        },
        /**
         * The last call the shell makes, which is the only hook apiVersion 1
         * gives for "this is over" — so it is where the Worker is put away.
         * `ending` is set first: `stop()` must not bounce back through
         * `ctx.exit()` into a teardown that is already in progress.
         */
        souvenir: () => {
          ending = true
          host.stop()
          return souvenir
        },
      }
    },
  }
}
