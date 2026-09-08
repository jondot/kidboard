import type { EchoCartridge } from '../../types'
import { ANIMALS } from '../../content/animals'
import { makeItemLookup } from '../../content/lookup'
import en from './en.json'
import he from './he.json'

/**
 * Hebrew trigger word -> English ANIMALS key, so typing a specific Hebrew
 * animal name shows that animal, not a random one. This table IS the Hebrew
 * trigger list (see `triggers.he` below), so there is no second array to keep
 * in step with it.
 */
export const HE_KEYS: Record<string, string> = {
  'חתול': 'cat',
  'כלב': 'dog',
  'דג': 'fish',
  'ציפור': 'bird',
  'נחש': 'snake',
  'צפרדע': 'frog',
  'פרה': 'cow',
  'חזיר': 'pig',
  'ברווז': 'duck',
  'כריש': 'shark',
  'דינוזאור': 'dinosaur',
  'לובסטר': 'lobster',
  'פיל': 'elephant',
  'קוף': 'monkey',
  'דוב': 'bear',
  'ארנב': 'rabbit',
  'ינשוף': 'owl',
  'צב': 'turtle',
  'פינגווין': 'penguin',
  'אריה': 'lion',
}

const lookup = makeItemLookup(ANIMALS, HE_KEYS)

/**
 * Triggers are every animal name in both languages plus every animal's emoji,
 * so `cat`, חתול and 🐱 all land here. The animal is recovered from the
 * matched word by the shared lookup, which folds both sides through
 * `normalize()` and indexes emoji too.
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'animals',
  triggers: {
    en: ['animals', ...Object.keys(ANIMALS)],
    he: ['חיות', ...Object.keys(HE_KEYS)],
    emoji: Object.values(ANIMALS).map((a) => a.emoji),
  },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    // Typing the collective trigger `animals`/`חיות` is not in the index, so
    // it falls through to a surprise animal — which is the point of it.
    const { key, item } = lookup(ctx.input, ctx.rng)
    ctx.say([
      { kind: 'text', text: item.emoji.repeat(3), scale: 'big' },
      { kind: 'art', art: item.art },
      { kind: 'text', text: ctx.t(`animal.${key}.sound`), tone: 'win' },
    ])
  },
}

export default cartridge
