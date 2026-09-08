import type { EchoCartridge } from '../../types'
import { forLocale } from '../index'
import en from './en.json'
import he from './he.json'

/**
 * `forLocale` is only called from inside `respond`, never at module load
 * time — it is called long after the registry has finished building, which
 * keeps this safe despite `../index` importing this very file back.
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'help',
  triggers: { en: ['help', '?'], he: ['עזרה', '?'] },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    const words = forLocale(ctx.locale)
      .filter((c) => c.id !== 'help')
      .map((c) => c.triggers[ctx.locale]?.[0])
      .filter((w): w is string => Boolean(w))

    ctx.say([
      { kind: 'text', text: ctx.t('help.title'), tone: 'info', scale: 'big' },
      { kind: 'text', text: ctx.t('help.intro'), tone: 'plain' },
      { kind: 'text', text: words.join('   '), tone: 'plain' },
    ])
  },
}

export default cartridge
