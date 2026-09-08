import type { EchoCartridge } from '../../types'
import { LETTER_ANIMALS } from '../../content/letters'
import { caseFor } from '../../i18n/locale'

const ALPHABET = Object.keys(LETTER_ANIMALS)

/**
 * The letter-animal table is a-z only, so this cartridge is English-only —
 * shipping it to a Hebrew reader would show Latin letters they cannot read.
 * No en.json/he.json: a single letter plus its emoji needs no translated
 * prose, so there is nothing to localize.
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'letters',
  triggers: { en: ['letters', ...ALPHABET] },
  locales: ['en'],
  respond(ctx) {
    const letter = LETTER_ANIMALS[ctx.input] ? ctx.input : ctx.rng.pick(ALPHABET)
    const emoji = LETTER_ANIMALS[letter]!
    ctx.say([
      { kind: 'text', text: caseFor(ctx.locale)(letter), scale: 'giant' },
      { kind: 'text', text: emoji.repeat(3), scale: 'big' },
    ])
  },
}

export default cartridge
