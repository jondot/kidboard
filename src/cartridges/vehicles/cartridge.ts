import type { EchoCartridge } from '../../types'
import { VEHICLES } from '../../content/vehicles'
import { makeItemLookup } from '../../content/lookup'
import en from './en.json'
import he from './he.json'

/**
 * Hebrew trigger word -> English VEHICLES key, so typing a specific Hebrew
 * vehicle name shows that vehicle, not a random one. מטוס maps to `airplane`
 * (its `plane` twin is identical content, so either key works). This table IS
 * the Hebrew trigger list (see `triggers.he` below).
 */
export const HE_KEYS: Record<string, string> = {
  'מטוס': 'airplane',
  'משאית': 'truck',
  'מחפר': 'excavator',
  'טיל': 'rocket',
  'רכבת': 'train',
  'מסוק': 'helicopter',
  'דחפור': 'bulldozer',
  'מנוף': 'crane',
  'סירה': 'boat',
  'מכונית': 'car',
  'אוטובוס': 'bus',
}

const lookup = makeItemLookup(VEHICLES, HE_KEYS)

const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'vehicles',
  triggers: {
    en: ['vehicles', 'cars', 'trucks', ...Object.keys(VEHICLES)],
    he: ['רכבים', ...Object.keys(HE_KEYS)],
    emoji: Object.values(VEHICLES).map((v) => v.emoji),
  },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    const { key, item } = lookup(ctx.input, ctx.rng)
    ctx.say([
      { kind: 'text', text: item.emoji.repeat(3), scale: 'big' },
      { kind: 'art', art: item.art },
      { kind: 'text', text: ctx.t(`vehicle.${key}.sound`), tone: 'win' },
    ])
  },
}

export default cartridge
