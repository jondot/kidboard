import { useEffect, useMemo, useState } from 'react'
import type { Locale } from './types'
import { Terminal } from './terminal/Terminal'
import { Boundary } from './terminal/Boundary'
import { loadLocale } from './i18n/locale'

export type KidboardProps = {
  locale?: Locale
  seed?: number
  className?: string
}

/** The embeddable component. Everything else is an implementation detail. */
export function Kidboard({ locale, seed, className }: KidboardProps) {
  // A returning Hebrew child must never see a frame of English first, so the
  // persisted locale is read during the initial render, not in an effect.
  const [current, setCurrent] = useState<Locale>(() => locale ?? loadLocale())

  // Without an explicit `seed` the playground must feel different every time
  // it is opened — a constant default made `animals` deal the same elephant
  // on every mount, on every device. An explicitly passed `seed` is still
  // honored exactly, because demos and tests depend on it.
  const fallbackSeed = useMemo(
    () => (Math.floor(Math.random() * 0x7fffffff) >>> 0) || 1,
    [],
  )

  useEffect(() => {
    if (locale) setCurrent(locale)
  }, [locale])

  return (
    <Boundary locale={current}>
      <Terminal
        locale={current}
        seed={seed ?? fallbackSeed}
        onLocaleChange={setCurrent}
        className={className}
      />
    </Boundary>
  )
}
