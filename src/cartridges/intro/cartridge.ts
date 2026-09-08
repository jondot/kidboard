import type { EchoCartridge } from '../../types'
import { introBlocks } from './card'
import en from './en.json'
import he from './he.json'

/**
 * THE CARD A CHILD ARRIVES AT, and the word that fetches it again.
 *
 * The card itself is in `card.ts`, because two things say it: this cartridge,
 * for a child (or a grown-up) who types the word, and the terminal, which
 * runs this very cartridge on a child's first ever visit. One card, one
 * catalog, said the same way both times — the alternative was the terminal
 * carrying a second copy of the same four lines in two languages.
 *
 * It is an ECHO and not a `turn`, deliberately. A conversation would own the
 * prompt: a child who read `cat` on the card and typed it would be handing
 * that word to the tour rather than to the machine, and the tour would have
 * to hand it on somehow — there is no API for that and there should not be.
 * An echo says its piece and gets out of the way, so the very next thing the
 * child types is a real word doing a real thing, which is the entire lesson.
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'intro',
  triggers: {
    en: ['intro', 'begin'],
    he: ['התחלה', 'הדרכה'],
    emoji: ['🎬'],
  },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    ctx.say(introBlocks(ctx.t, ctx.locale))
  },
}

export default cartridge
