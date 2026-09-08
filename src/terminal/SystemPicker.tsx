import { useCallback, useMemo } from 'react'
import type { Dir, T } from '../types'
import type { System, SystemId } from '../systems/types'
import { themeById } from '../theme/themes'
import { swatchOf } from '../chrome/menuModel'
import { Picker } from './Picker'

/**
 * THE MACHINE PICKER. Option, Option.
 *
 * The third of the same list, and the last: games, colours, machines. Each is
 * a "which one?" — the only kind of question that gets a box in the middle of
 * the screen — and each is opened by two taps of a key that types nothing. A
 * child who has learnt any one of them has learnt all three.
 *
 * A MACHINE IS NOT A SETTING, which is the reason it moved out of the menu
 * along with the colours. It is which computer you are sitting at: the
 * typeface changes, the frame changes, the prompt changes, what happens when
 * a game starts changes. That is not a preference filed next to the language.
 *
 * EACH ROW WEARS THE MACHINE'S OWN DEFAULT PALETTE, looked up globally rather
 * than in the palettes of the machine you are on — the other three rows would
 * have had no chip. It is what that computer looks like when you arrive at it,
 * which is the only honest thing a chip beside its name can say.
 */

export type SystemPickerProps = {
  t: T
  dir: Dir
  /** Every machine, in registry order. */
  systems: readonly System[]
  systemId: SystemId
  onPick(id: SystemId): void
  onClose(): void
}

export function SystemPicker(
  { t, dir, systems, systemId, onPick, onClose }: SystemPickerProps,
) {
  const items = useMemo(
    () =>
      systems.map((sys) => ({
        key: sys.id,
        label: t(sys.name),
        swatch: swatchOf(themeById(sys.defaultTheme)),
        checked: sys.id === systemId,
      })),
    // No `locale` of its own: a machine's name is an i18n key, so `t` is
    // both the translator and the thing that changes when the language does.
    [systems, systemId, t],
  )

  const start = useMemo(
    () => Math.max(0, systems.findIndex((sys) => sys.id === systemId)),
    [systems, systemId],
  )

  const pick = useCallback((key: string) => {
    const sys = systems.find((s) => s.id === key)
    if (sys) onPick(sys.id)
  }, [systems, onPick])

  return (
    <Picker
      title={t('pick.machines.title')}
      hint={t('pick.machines.hint')}
      dir={dir}
      items={items}
      start={start}
      onPick={pick}
      onClose={onClose}
    />
  )
}
