import { useCallback, useMemo } from 'react'
import type { Cartridge, Dir, Locale, T } from '../types'
import { Picker } from './Picker'
import { artFor } from '../carts/packedArt'
import { bitmapLabel } from '../carts/label'
import { cartLabel } from '../carts/registry'

/**
 * THE GAME PICKER. Shift, Shift.
 *
 * Choosing what to play is not a setting, so it does not live in the settings
 * menu and it is not a dropdown hanging off a title bar. It is a thing the
 * machine does: two taps on Shift and a list appears in the middle of the
 * screen, the way every terminal tool a grown-up uses opens its own list.
 *
 * The box, the highlight and the keys are `Picker`, shared with the colours
 * list that Ctrl, Ctrl opens — same gesture, same box, different question.
 * All this file decides is WHAT IS IN IT.
 *
 * IT IS A SHELF, NOT A LIST. Every game has a picture — the very one on the
 * front of its cartridge — so the games are laid out as TILES with that
 * picture on each, drawn in half-blocks in the machine's own ink. A
 * six-year-old who cannot read yet can still pick `snake` out of a shelf,
 * which a column of words never let them do; the word stays under the picture
 * so that the child who is learning to read has both.
 *
 * SHIFT IS THE RIGHT KEY and it is safe on all four machines. It types
 * nothing, so a child holding it to make a capital letter cannot summon this;
 * a double TAP is two presses inside `DOUBLE_MS` with nothing typed between
 * them (see `doubleTap.ts`), and a cartridge reads shift as a modifier flag on
 * the keys it is given, never as a key of its own. So the playground's global
 * gestures cost no cartridge a keystroke.
 */

export type GamePickerProps = {
  t: T
  locale: Locale
  dir: Dir
  /** Already filtered to the current locale by the caller. */
  cartridges: readonly Cartridge[]
  /**
   * The game that is running right now, if one is. The shelf then OPENS ON
   * IT — highlighted and ticked — rather than on whatever happens to be
   * first alphabetically.
   *
   * This is what makes the shelf a way to SWAP games rather than only a way
   * to start one. A child who opens it mid-game was looking at that game a
   * second ago; landing the highlight anywhere else makes them find their
   * place before they can go anywhere, and hides the fact that they are
   * already somewhere.
   */
  currentId?: string
  onPick(c: Cartridge): void
  onClose(): void
}

/**
 * What a child can START.
 *
 * Echo cartridges are left out on purpose — `help`, `greet` and `animals` are
 * things you SAY, not things you start, and a list of games that opens with
 * `?` teaches the wrong thing.
 */
export function playable(cartridges: readonly Cartridge[]): Cartridge[] {
  return cartridges.filter((c) => c.kind === 'live' || c.kind === 'turn')
}

export function GamePicker(
  { t, locale, dir, cartridges, currentId, onPick, onClose }: GamePickerProps,
) {
  const games = useMemo(() => playable(cartridges), [cartridges])
  const at = games.findIndex((c) => c.id === currentId)

  const items = useMemo(
    () =>
      games.map((c) => ({
        key: c.id,
        // The word the child would have TYPED. A child who finds a game in
        // this list learns how to reach it by hand next time.
        label: c.triggers[locale]?.[0] ?? c.id,
        /*
          THE PICTURE, from wherever that game keeps one.
          A cart brought its own label in with it and it was sampled once, on
          arrival — so a child's own drawing is on its tile, and a stranger's
          cart shows what the stranger drew. A built-in's picture is the
          bitmap in `packedArt.ts`, which is the same drawing that goes on the
          front of the cartridge when it is saved. One picture per game, in
          one place, whatever it is being drawn for.
        */
        art: cartLabel(c.id) ?? bitmapLabel(artFor(c.id) ?? { w: 0, h: 0, on: new Uint8Array(0) }),
        // The tick the colours and machines lists already use for "this is
        // the one you are on". A shelf is the same question about games.
        checked: c.id === currentId,
      })),
    [games, locale, currentId],
  )

  const pick = useCallback((key: string) => {
    const game = games.find((c) => c.id === key)
    if (game) onPick(game)
  }, [games, onPick])

  return (
    <Picker
      title={t('pick.title')}
      hint={t('pick.hint')}
      dir={dir}
      items={items}
      start={at < 0 ? 0 : at}
      tiles
      onPick={pick}
      onClose={onClose}
    />
  )
}
