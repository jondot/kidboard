import type { EchoCartridge } from '../../types'
import { COLORS } from '../../content/colors'
import { makeItemLookup } from '../../content/lookup'
import en from './en.json'
import he from './he.json'

/**
 * Hebrew trigger word -> English COLORS key, so typing a specific Hebrew
 * color name shows that color, not a random one. This table IS the Hebrew
 * trigger list (see `triggers.he` below).
 */
export const HE_KEYS: Record<string, string> = {
  'אדום': 'red',
  'כחול': 'blue',
  'ירוק': 'green',
  'צהוב': 'yellow',
  'כתום': 'orange',
  'סגול': 'purple',
  'ורוד': 'pink',
  'שחור': 'black',
  'לבן': 'white',
  'חום': 'brown',
}

const lookup = makeItemLookup(COLORS, HE_KEYS)

const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'colors',
  triggers: {
    en: ['colors', 'colours', ...Object.keys(COLORS)],
    he: ['צבעים', ...Object.keys(HE_KEYS)],
    emoji: Object.values(COLORS).map((c) => c.emoji),
  },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    const { key, item } = lookup(ctx.input, ctx.rng)
    ctx.say([
      { kind: 'text', text: item.emoji.repeat(3), scale: 'big' },
      { kind: 'text', text: item.things, scale: 'big' },
      { kind: 'text', text: ctx.t(`color.${key}.name`), tone: 'win' },
    ])
  },
}

export default cartridge
