import type { Audio, BlockSpec, Cartridge, Ctx, Locale, Rng, SayOpts } from '../types'
import { dirFor, makeT } from '../i18n/locale'

export type CtxDeps = {
  locale: Locale
  rng: Rng
  audio: Audio
  strings?: Cartridge['strings']
  input?: string
  say(specs: BlockSpec[], opts?: SayOpts): void
  exit(): void
}

/**
 * Every member takes JSON-serializable arguments only. That constraint is what
 * lets a cartridge one day run behind a postMessage boundary unchanged.
 */
export function makeCtx(d: CtxDeps): Ctx {
  return {
    t: makeT(d.locale, d.strings),
    locale: d.locale,
    dir: dirFor(d.locale),
    rng: d.rng,
    audio: d.audio,
    input: d.input ?? '',
    say: d.say,
    exit: d.exit,
  }
}
