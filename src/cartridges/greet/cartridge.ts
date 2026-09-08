import type { EchoCartridge } from '../../types'
import en from './en.json'
import he from './he.json'

const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'greet',
  triggers: {
    en: ['hello', 'hi', 'hey'],
    he: ['שלום', 'היי', 'אהלן'],
    emoji: ['👋'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    ctx.say([{ kind: 'text', text: ctx.t('greet.hello'), tone: 'win', scale: 'big' }])
  },
}

export default cartridge
