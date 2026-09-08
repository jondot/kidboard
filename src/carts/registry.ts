import type { BlockSpec, Cartridge, LiveCartridge, Locale } from '../types'
import { makeT, normalize } from '../i18n/locale'
import { readCart } from './codec'
import { decodeGray } from './pixels'
import { BLANK_LABEL, halfBlockLabel, labelView } from './label'
import { settleNames, takenWords } from './naming'
import { BUILT_IN_PREFIX, type CartManifest } from './manifest'
import { makeCartCartridge } from './cartridge'
import { CART_STRINGS } from './strings'
import type { CartStore, StoredCart } from './store'
import type { Bytes } from './png'
import type { WorkerLike } from './host'

/**
 * The carts a child has loaded, and nothing else.
 *
 * The app ships with NONE. There is no gallery, nothing is fetched, and
 * nothing is pre-loaded: a cart is here because somebody chose a file on this
 * machine and dropped it in.
 *
 * Deliberately module-level and synchronously readable. `resolve()` is asked
 * "is this a word?" on the keystroke after a child is told to type it, and
 * that answer cannot be a promise.
 */
const loaded = new Map<string, StoredCart>()
const built = new Map<string, LiveCartridge>()
const listeners = new Set<() => void>()

/** Overridable so tests can run the real bootstrap without a real Worker. */
let spawn: (() => WorkerLike) | undefined

export function setCartSpawn(fn: (() => WorkerLike) | undefined): void {
  spawn = fn
  built.clear()
}

export function onCartsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const changed = (): void => { for (const fn of [...listeners]) fn() }

export function cartList(): StoredCart[] {
  return [...loaded.values()].sort((a, b) => a.addedAt - b.addedAt)
}

export function cartCartridges(): LiveCartridge[] {
  return cartList().map((c) => {
    let cart = built.get(c.id)
    if (!cart) {
      cart = makeCartCartridge(c.manifest, { names: c.names, spawn })
      built.set(c.id, cart)
    }
    return cart
  })
}

/** Test seam and locale switch: forget everything held in memory. */
export function resetCarts(): void {
  loaded.clear()
  built.clear()
  pictureTurn = 0
  changed()
}

export type AddResult =
  | {
      ok: true
      kind: 'loaded'
      cart: StoredCart
      renamed: { locale: Locale; from: string; to: string }[]
      /** True when this cart was already here and has just been refreshed. */
      again: boolean
    }
  /**
   * The cart IS a cartridge the child already has: one of the built-ins,
   * downloaded and brought home again. Nothing was loaded and nothing was
   * renamed — the words are the ones it already answers to.
   */
  | { ok: true; kind: 'builtIn'; names: Partial<Record<Locale, string>> }
  | { ok: false }

/**
 * Is this dropped cart a built-in the child already has?
 *
 * THE TEST IS THE MANIFEST'S OWN ID, and nothing else. `pack-carts` stamps
 * `kidboard-<cartridge id>` on every built-in it packs, so a file carrying
 * that id is claiming to BE that game — which is exactly the claim the
 * registry already believes when the same cart is dropped twice (`again`).
 * One rule, applied in both places.
 *
 * NOT id plus a content hash, though that was the obvious next thought: a
 * cart saved from an older version of the app hashes differently, and hashing
 * would rename it `pop2` — which is precisely the machinery this exists to
 * remove. The cost of trusting the id is a file that deliberately forges one
 * of ours, and even then the child gets a warm line and a game that plays. A
 * stranger's cart that merely collides on the WORD carries its own id, is
 * renamed, and is told so, exactly as before.
 */
export function sameBuiltIn(
  m: CartManifest, builtIns: readonly Cartridge[],
): Cartridge | undefined {
  if (!m.id.startsWith(BUILT_IN_PREFIX)) return undefined
  const id = m.id.slice(BUILT_IN_PREFIX.length)
  return builtIns.find((c) => c.id === id)
}

/** The words a built-in already answers to, per language. */
const wordsOf = (c: Cartridge): Partial<Record<Locale, string>> => {
  const out: Partial<Record<Locale, string>> = {}
  for (const l of ['en', 'he'] as Locale[]) {
    const w = c.triggers[l]?.[0]
    if (w) out[l] = w
  }
  return out
}

/**
 * Reads a dropped file and, if there is a game inside the picture, keeps it.
 *
 * `built` — the cartridges already shipped — is passed in rather than
 * imported, so this module never depends on the cartridge registry and the
 * two cannot form a cycle.
 */
export async function addCart(
  file: ArrayBuffer | Bytes,
  o: { builtIns: readonly Cartridge[]; store?: CartStore },
): Promise<AddResult> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file)
  const manifest = await readCart(bytes)
  if (!manifest) return { ok: false }

  const again = loaded.has(manifest.id)

  // A built-in, come home. It is already here and already has its word, so
  // there is nothing to load, nothing to rename and nothing to say except
  // that it is ready to play.
  if (!again) {
    const home = sameBuiltIn(manifest, o.builtIns)
    if (home) return { ok: true, kind: 'builtIn', names: wordsOf(home) }
  }

  // A cart being reloaded keeps the words it already had, so a child who
  // learned to type `meowmaze2` yesterday still types `meowmaze2` today.
  const taken = takenWords(o.builtIns)
  for (const other of loaded.values()) {
    if (other.id === manifest.id) continue
    for (const w of Object.values(other.names)) taken.add(normalize(w))
  }
  const settled = again
    ? { names: loaded.get(manifest.id)!.names, renamed: [] }
    : settleNames(manifest, taken)
  if (Object.keys(settled.names).length === 0) return { ok: false }

  // `labelView` crops one of OUR carts to its label window: the file is a
  // picture of a cartridge now, and the transcript wants the game's picture.
  const label = [...halfBlockLabel(labelView(await decodeGray(bytes)))]
  const cart: StoredCart = {
    id: manifest.id,
    manifest,
    names: settled.names,
    png: bytes,
    label,
    addedAt: loaded.get(manifest.id)?.addedAt ?? Date.now(),
  }

  loaded.set(cart.id, cart)
  built.delete(cart.id)
  changed()
  await o.store?.put(cart)
  return { ok: true, kind: 'loaded', cart, renamed: settled.renamed, again }
}

/**
 * The picture a loaded cart arrived with, for whoever needs to show it again —
 * the game picker draws it on the cart's tile. Already half-blocks: it was
 * sampled once when the cart came in and is not re-sampled per render.
 */
export function cartLabel(id: string): readonly string[] | undefined {
  return loaded.get(id)?.label
}

export async function forgetCart(id: string, store?: CartStore): Promise<void> {
  loaded.delete(id)
  built.delete(id)
  changed()
  await store?.remove(id)
}

/** Fills the registry from whatever survived the last visit. */
export async function hydrateCarts(store: CartStore): Promise<void> {
  let saved: StoredCart[] = []
  try {
    saved = await store.list()
  } catch {
    saved = []
  }
  let added = 0
  for (const c of saved) {
    if (c?.manifest?.apiVersion !== 1) continue
    loaded.set(c.id, { ...c, label: c.label?.length ? c.label : [...BLANK_LABEL] })
    added += 1
  }
  // Nothing came back, so nothing changed. Telling everyone otherwise costs a
  // render on every single start-up, which is the usual case: the app ships
  // with no carts.
  if (added === 0) return
  built.clear()
  changed()
}

/**
 * What a child sees when a cart arrives.
 *
 *   🃏 new cart!
 *
 *   ▄▄▀▀▄▄   Meow Maze
 *   ▀▄▄▄▄▀   by somebody
 *
 *   type meowmaze to play!
 *
 * MONOCHROME: the picture, the name and the author are all one ink. The only
 * second tone in the block is on the line that tells the child what to do,
 * because that line is the one thing here they need to act on.
 */
export function announce(cart: StoredCart, locale: Locale): BlockSpec[] {
  const t = makeT(locale, CART_STRINGS)
  const word = cart.names[locale] ?? Object.values(cart.names)[0] ?? ''
  const title = cart.manifest.title[locale] ?? cart.manifest.title.en ?? word
  const out: BlockSpec[] = [
    { kind: 'text', text: `🃏 ${t('carts.new')}`, tone: 'plain' },
    { kind: 'art', art: cart.label.join('\n'), tone: 'plain' },
    { kind: 'text', text: title, tone: 'plain' },
  ]
  if (cart.manifest.author) {
    out.push({ kind: 'text', text: t('carts.by', { author: cart.manifest.author }), tone: 'plain' })
  }
  out.push({ kind: 'text', text: t('carts.play', { word }), tone: 'win' })
  return out
}

/**
 * The line said when a picture turns out to be only a picture — and it is not
 * the same line twice running.
 *
 * A child dragging a folder in drops several files at once, and four
 * identical lines stop reading as "that is fine" and start reading as
 * disapproval. `count`, `spot` and `rhyme` learned this the same way and
 * varied their miss lines with `ctx.rng`; there is no rng down here, so the
 * three wordings simply take turns. Deterministic, which also makes it
 * testable, and `resetCarts` puts the turn back to the start so no test can
 * depend on another test's leftovers.
 */
const PICTURE_LINES = [
  'carts.justapicture', 'carts.justapicture.2', 'carts.justapicture.3',
] as const
let pictureTurn = 0

export function justAPicture(locale: Locale): BlockSpec[] {
  const key = PICTURE_LINES[pictureTurn % PICTURE_LINES.length]!
  pictureTurn += 1
  return [{ kind: 'text', text: makeT(locale, CART_STRINGS)(key), tone: 'info' }]
}

/**
 * …and the one said when a cart is already here — dropped twice, or a
 * built-in brought home. Two lines and no machinery: it is here, and here is
 * the word. MONOCHROME, with the second tone only on the line that tells the
 * child what to do.
 */
export function welcomeBack(
  names: Partial<Record<Locale, string>>, locale: Locale,
): BlockSpec[] {
  const t = makeT(locale, CART_STRINGS)
  const word = names[locale] ?? Object.values(names)[0] ?? ''
  return [
    { kind: 'text', text: t('carts.again', { name: word }), tone: 'plain' },
    { kind: 'text', text: t('carts.play', { word }), tone: 'win' },
  ]
}

/** …and the one said when a cart was already here. */
export function alreadyHere(cart: StoredCart, locale: Locale): BlockSpec[] {
  return welcomeBack(cart.names, locale)
}

export function renamedLine(
  renamed: { locale: Locale; from: string; to: string }[], locale: Locale,
): BlockSpec[] {
  const one = renamed.find((r) => r.locale === locale) ?? renamed[0]
  if (!one) return []
  const t = makeT(locale, CART_STRINGS)
  return [{ kind: 'text', text: t('carts.renamed', { old: one.from, name: one.to }), tone: 'info' }]
}
