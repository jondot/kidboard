import type { Rng } from '../types'
import { normalize } from '../i18n/locale'

/**
 * One shared item resolver for every content table (animals, vehicles,
 * colors). It replaces three copies of a five-line ladder that each got the
 * same two things wrong:
 *
 *  1. They compared `ctx.input` against RAW keys. `ctx.input` has been through
 *     `normalize()`, which folds Hebrew final letters — so אדום arrives as
 *     אדומ and missed a `HE_KEYS` entry spelled with the sofit. Eight Hebrew
 *     triggers fell through to a random item. Here BOTH sides go through
 *     `normalize()`, so the folding can never separate them again.
 *  2. They had no emoji branch at all, so all 42 declared emoji triggers
 *     reached the right cartridge and then picked a random item — 🐱 gave an
 *     elephant. That is the single most important path for a child who cannot
 *     yet read, so the emoji of every item indexes to that item.
 *
 * A collective trigger (`animals` / `חיות`) and anything unrecognized still
 * fall through to a random pick, which is the intended surprise.
 *
 * Returns the table KEY alongside the item, because every caller needs it to
 * build a translation key (`animal.cat.sound`).
 */
export function makeItemLookup<T extends { emoji: string }>(
  table: Record<string, T>,
  heKeys: Record<string, string>,
) {
  const index = new Map<string, string>()
  for (const k of Object.keys(table)) index.set(normalize(k), k)
  for (const [he, k] of Object.entries(heKeys)) index.set(normalize(he), k)
  for (const [k, v] of Object.entries(table)) index.set(normalize(v.emoji), k)

  return (input: string, rng: Rng): { key: string; item: T } => {
    const key = index.get(normalize(input)) ?? rng.pick(Object.keys(table))
    return { key, item: table[key]! }
  }
}
