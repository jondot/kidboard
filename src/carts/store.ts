import type { Locale } from '../types'
import type { CartManifest } from './manifest'
import type { Bytes } from './png'

/**
 * Where a child's carts live between visits.
 *
 * THE PROJECT RULE is that only `kb.locale`, `kb.muted`, `kb.theme`,
 * `kb.system` and `kb.text` are
 * persisted, and they live in `localStorage`. Carts are the sanctioned
 * exception named by the design: a PNG is tens of kilobytes and a handful of
 * them blows past `localStorage`'s quota, so they go in IndexedDB — a
 * different store, holding a different kind of thing, and still nothing about
 * the child.
 *
 * Every operation is best-effort. A browser in private mode, a locked-down
 * embedder, a quota that is already full: all of them degrade to an in-memory
 * store that works perfectly for this visit and forgets afterwards. None of
 * them is an error a child can see.
 */
export type StoredCart = {
  id: string
  manifest: CartManifest
  names: Partial<Record<Locale, string>>
  png: Bytes
  /** The half-block label, kept so a reload does not re-decode every picture. */
  label: string[]
  addedAt: number
}

export type CartStore = {
  list(): Promise<StoredCart[]>
  put(cart: StoredCart): Promise<void>
  remove(id: string): Promise<void>
}

export const DB_NAME = 'kidboard'
export const DB_VERSION = 1
export const STORE_NAME = 'carts'

export function makeMemoryStore(seed: readonly StoredCart[] = []): CartStore {
  const held = new Map<string, StoredCart>(seed.map((c) => [c.id, c]))
  return {
    list: async () => [...held.values()].sort((a, b) => a.addedAt - b.addedAt),
    put: async (cart) => { held.set(cart.id, cart) },
    remove: async (id) => { held.delete(id) },
  }
}

const ask = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error ?? new Error('idb'))
  })

/**
 * IndexedDB, with the memory store as its floor.
 *
 * `factory` is injectable because jsdom has no IndexedDB at all: passing
 * `null` is exactly the "this browser will not store anything" case, and it
 * has to keep working rather than throw.
 */
export function makeCartStore(
  factory: IDBFactory | null | undefined = typeof indexedDB === 'undefined' ? null : indexedDB,
): CartStore {
  const memory = makeMemoryStore()
  let db: Promise<IDBDatabase | null> | null = null

  const open = (): Promise<IDBDatabase | null> => {
    if (!factory) return Promise.resolve(null)
    db ??= new Promise<IDBDatabase | null>((res) => {
      try {
        const req = factory.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const it = req.result
          if (!it.objectStoreNames.contains(STORE_NAME)) {
            it.createObjectStore(STORE_NAME, { keyPath: 'id' })
          }
        }
        req.onsuccess = () => res(req.result)
        req.onerror = () => res(null)
        req.onblocked = () => res(null)
      } catch {
        res(null)
      }
    })
    return db
  }

  const tx = async <T,>(
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> => {
    const it = await open()
    if (!it) return fallback()
    try {
      return await run(it.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
    } catch {
      // A store that has stopped working is a store we stop using. The
      // in-memory one takes over for the rest of the visit.
      return fallback()
    }
  }

  return {
    list: () => tx('readonly',
      async (s) => {
        const all = await ask(s.getAll() as IDBRequest<StoredCart[]>)
        return all.sort((a, b) => a.addedAt - b.addedAt)
      },
      () => memory.list()),

    put: (cart) => tx('readwrite',
      async (s) => { await ask(s.put(cart)); await memory.put(cart) },
      () => memory.put(cart)),

    remove: (id) => tx('readwrite',
      async (s) => { await ask(s.delete(id)); await memory.remove(id) },
      () => memory.remove(id)),
  }
}
