import type { EchoCartridge } from '../../types'
import en from './en.json'
import he from './he.json'

/** A handful of simple emoji to count with — language-neutral. */
const NUMBER_EMOJI = ['⭐', '🎈', '🍎', '🐱', '🚗', '🌸', '🎵', '🦋'] as const

/**
 * `numbers` cannot list `/^\d+$/` as a trigger, so `Terminal` routes bare
 * digit input to this cartridge directly, passing the digits as `ctx.input`.
 * The `numbers` / Hebrew word triggers below exist only so a child who types
 * the *word* "numbers" also lands here (and gets a surprise count).
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'numbers',
  triggers: { en: ['numbers'], he: ['מספרים'] },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    const digits = /^\d+$/.test(ctx.input) ? ctx.input : String(ctx.rng.int(10) + 1)
    const n = Number.parseInt(digits, 10)
    const emoji = ctx.rng.pick(NUMBER_EMOJI)

    if (n === 0) {
      ctx.say([{ kind: 'text', text: '0️⃣', scale: 'giant' }])
      return
    }
    if (n <= 10) {
      ctx.say([{ kind: 'text', text: emoji.repeat(n), scale: 'big' }])
      return
    }
    if (n <= 100) {
      ctx.say([{ kind: 'text', text: `${n} ${emoji.repeat(15)}`, scale: 'big' }])
      return
    }
    ctx.say([
      { kind: 'text', text: String(n), scale: 'giant' },
      { kind: 'text', text: emoji.repeat(10), scale: 'big' },
      { kind: 'text', text: ctx.t('numbers.big'), tone: 'info' },
    ])
  },
}

export default cartridge
