import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GamePicker, playable } from './GamePicker'
import { DOUBLE_MS } from './doubleTap'
import { makeT } from '../i18n/locale'
import { forLocale } from '../cartridges'
import { artFor } from '../carts/packedArt'
import { bitmapLabel } from '../carts/label'
import { addCart, cartCartridges, resetCarts, setCartSpawn } from '../carts/registry'
import { makeLoopbackWorker } from '../carts/loopback'
import { buildCartPng } from '../carts/export'
import { fromRows } from '../carts/art'
import { BLINK } from '../carts/samples'
import type { Cartridge } from '../types'

/**
 * THE GAME PICKER. Shift, Shift.
 *
 * Choosing what to play is not a setting, so it is not a dropdown filed in the
 * title bar next to the language. It is a list the machine opens in the middle
 * of the screen, the way every terminal tool a grown-up uses opens its own.
 * What is borrowed from ncurses is the BEHAVIOUR — one bordered box, one
 * highlighted row that inverts, ↑↓, ⏎, Esc, and a hint line saying so — never
 * the look, which is each machine's.
 */

const carts = forLocale('en')

const props = (over: Partial<Parameters<typeof GamePicker>[0]> = {}) => ({
  t: makeT('en'),
  locale: 'en' as const,
  dir: 'ltr' as const,
  cartridges: carts,
  onPick: vi.fn(),
  onClose: vi.fn(),
  ...over,
})

const rows = (c: HTMLElement) =>
  [...c.querySelectorAll('.kb-picker-word')].map((e) => e.textContent ?? '')

/** The highlighted row's word, without the `▸` the highlight also draws. */
const active = (c: HTMLElement) =>
  c.querySelector('[data-kb-active="true"] .kb-picker-word')?.textContent ?? ''

describe('the game picker', () => {
  it('lists things you can START, never things you say', () => {
    const { container } = render(<GamePicker {...props()} />)
    const list = within(container)
    expect(list.getByText('ball')).toBeTruthy()
    // `help`, `greet` and `animals` are things you SAY, not things you start,
    // and a list of games that opens with `?` teaches the wrong thing.
    expect(list.queryByText('help')).toBeNull()
    expect(playable(carts).every((c) => c.kind !== 'echo')).toBe(true)
    expect(rows(container)).toHaveLength(playable(carts).length)
  })

  /**
   * The word the child would have TYPED, in their own language. A child who
   * finds a game in this list learns how to reach it by hand next time.
   */
  it('names each game by the word a child would type in their language', () => {
    const he = forLocale('he')
    const { container } = render(
      <GamePicker {...props({ locale: 'he', dir: 'rtl', cartridges: he })} />,
    )
    const first = playable(he)[0]!
    expect(container.textContent).toContain(first.triggers.he![0])
  })

  describe('the keyboard, which is the whole point', () => {
    it('moves the highlight with the arrows and wraps at both ends', async () => {
      const u = userEvent.setup()
      const { container } = render(<GamePicker {...props()} />)
      const words = rows(container)
      expect(active(container)).toBe(words[0])
      await u.keyboard('{ArrowDown}')
      expect(active(container)).toBe(words[1])
      await u.keyboard('{ArrowUp}{ArrowUp}')
      expect(active(container)).toBe(words[words.length - 1])
    })

    it('runs the highlighted game on enter', async () => {
      const u = userEvent.setup()
      const onPick = vi.fn()
      render(<GamePicker {...props({ onPick })} />)
      await u.keyboard('{ArrowDown}{Enter}')
      expect(onPick).toHaveBeenCalledOnce()
      expect((onPick.mock.calls[0]![0] as Cartridge).id)
        .toBe(playable(carts)[1]!.id)
    })

    it('closes on escape without starting anything', async () => {
      const u = userEvent.setup()
      const onPick = vi.fn()
      const onClose = vi.fn()
      render(<GamePicker {...props({ onPick, onClose })} />)
      await u.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledOnce()
      expect(onPick).not.toHaveBeenCalled()
    })

    /**
     * WHILE THE LIST IS UP IT OWNS THE KEYBOARD — including from a running
     * game, which is the one and only thing that ever takes keys off a
     * cartridge, and it does so because the child asked for it by name. A
     * child typing into a game they cannot see is the failure this prevents.
     */
    it('swallows ordinary keys so nothing reaches the game behind it', async () => {
      const u = userEvent.setup()
      const seen: string[] = []
      const spy = (e: KeyboardEvent) => seen.push(e.key)
      window.addEventListener('keydown', spy)
      try {
        render(<GamePicker {...props()} />)
        await u.keyboard('abc')
      } finally {
        window.removeEventListener('keydown', spy)
      }
      // The listener below the picker's capturing one sees none of it.
      expect(seen).toEqual([])
    })
  })

  it('says exactly what the keys do, in the child\'s language', () => {
    const { container } = render(<GamePicker {...props()} />)
    const hint = container.querySelector('.kb-picker-hint')!.textContent ?? ''
    expect(hint).toContain('esc')
    expect(container.querySelector('.kb-picker-title')!.textContent)
      .toBe(makeT('en')('pick.title'))
  })

  it('closes when the child clicks outside the box', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<GamePicker {...props({ onClose })} />)
    await u.click(container.querySelector('.kb-picker-scrim')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reads in the child\'s own direction', () => {
    const { container } = render(<GamePicker {...props({ dir: 'rtl' })} />)
    expect(container.querySelector('[data-kb-picker]')!.getAttribute('dir'))
      .toBe('rtl')
  })

  /**
   * IT IS A SHELF, NOT A LIST.
   *
   * Every game has a picture — the very one on the front of its cartridge —
   * and a six-year-old who cannot read yet chooses by picture. A column of
   * words never let them do that. The word stays under the drawing, so the
   * child who is learning to read has both.
   */
  describe('the shelf', () => {
    it('gives every game a tile with its own picture on it', () => {
      const { container } = render(<GamePicker {...props()} />)
      const tiles = [...container.querySelectorAll('.kb-picker-tile')]
      expect(tiles).toHaveLength(playable(carts).length)
      for (const tile of tiles) {
        const art = tile.querySelector('.kb-tile-art')!
        expect(art, 'a tile with no picture').toBeTruthy()
        // Never a blank card: a shelf of blanks says these games are the
        // leftovers, and the turn cartridges are not leftovers.
        expect(art.textContent!.trim().length, tile.textContent ?? '')
          .toBeGreaterThan(0)
      }
    })

    it('draws the cartridge\'s own drawing, not a generated one', () => {
      const { container } = render(<GamePicker {...props()} />)
      const first = playable(carts)[0]!
      const tile = container.querySelector('.kb-picker-tile')!
      expect(tile.querySelector('.kb-tile-art')!.textContent)
        .toBe(bitmapLabel(artFor(first.id)!).join('\n'))
    })

    /** A drawing has no reading order, so it is never re-ordered by bidi. */
    it('isolates the drawing, and mirrors only the shelf', () => {
      const { container } = render(<GamePicker {...props({ dir: 'rtl' })} />)
      expect(container.querySelector('.kb-tile-art')!.getAttribute('dir')).toBe('ltr')
      expect(container.querySelector('[data-kb-picker]')!.getAttribute('dir')).toBe('rtl')
    })

    /**
     * A CART SHOWS WHAT IS ON THE CART. The label came in with the file and
     * was sampled once, on arrival — so a child's own drawing is on its tile,
     * and a stranger's cart shows what the stranger drew.
     */
    it('shows a loaded cart its own label', async () => {
      resetCarts()
      setCartSpawn(makeLoopbackWorker)
      const face = fromRows([
        'xxxxxxxx',
        'x      x',
        'x x  x x',
        'x      x',
        'x xxxx x',
        'xxxxxxxx',
      ])
      const png = (await buildCartPng(BLINK, face, 'en'))!
      const res = await addCart(png, { builtIns: [] })
      expect(res.ok).toBe(true)

      const loaded = cartCartridges()[0]!
      const { container } = render(
        <GamePicker {...props({ cartridges: [...carts, loaded] })} />,
      )
      const tiles = [...container.querySelectorAll('.kb-picker-tile')]
      const mine = tiles[tiles.length - 1]!
      expect(mine.querySelector('.kb-picker-word')!.textContent)
        .toBe(loaded.triggers.en![0])
      // Its own picture, not a built-in's and not a blank card.
      const art = mine.querySelector('.kb-tile-art')!.textContent!
      expect(art.trim().length).toBeGreaterThan(0)
      expect(art).not.toBe(bitmapLabel(artFor('ball')!).join('\n'))
      resetCarts()
    })

    /**
     * The arrows are PHYSICAL: right is the next tile along the shelf, and
     * under Hebrew the shelf itself runs the other way, so right is the one
     * before. Up and down move a ROW at a time — in a test environment nothing
     * has a layout, so every tile reports one row and they move by one, which
     * is what a single row of tiles should do anyway.
     */
    it('walks the shelf with all four arrows', async () => {
      const u = userEvent.setup()
      const { container } = render(<GamePicker {...props()} />)
      const words = rows(container)
      await u.keyboard('{ArrowRight}')
      expect(active(container)).toBe(words[1])
      await u.keyboard('{ArrowLeft}{ArrowLeft}')
      expect(active(container)).toBe(words[words.length - 1])
    })

    it('turns the shelf arrows round under Hebrew', async () => {
      const u = userEvent.setup()
      const he = forLocale('he')
      const { container } = render(
        <GamePicker {...props({ locale: 'he', dir: 'rtl', cartridges: he })} />,
      )
      const words = rows(container)
      await u.keyboard('{ArrowRight}')
      expect(active(container)).toBe(words[words.length - 1])
    })
  })

  /**
   * THE SHELF IS HOW YOU SWAP GAMES, NOT ONLY HOW YOU START ONE.
   *
   * A child who opens it mid-game was looking at that game a second ago.
   * Landing the highlight on whatever happens to be first makes them find
   * their place before they can go anywhere, and hides the fact that they are
   * already somewhere on this shelf.
   */
  describe('opening it out of a running game', () => {
    it('opens on the game that is running, and ticks it', () => {
      const games = playable(carts)
      const current = games[4]!
      const { container } = render(
        <GamePicker {...props({ currentId: current.id })} />,
      )
      const word = current.triggers.en?.[0] ?? current.id
      expect(active(container)).toBe(word)
      const ticked = container.querySelector('[data-kb-active="true"] .kb-picker-check')
      expect(ticked, 'the running game is not marked as the one you are on').toBeTruthy()
    })

    it('opens on the first tile when nothing is running', () => {
      const { container } = render(<GamePicker {...props()} />)
      expect(active(container)).toBe(rows(container)[0])
      expect(container.querySelector('.kb-picker-check')).toBeNull()
    })

    it('picks a different game from where it opened', async () => {
      const u = userEvent.setup()
      const games = playable(carts)
      const onPick = vi.fn()
      render(<GamePicker {...props({ currentId: games[4]!.id, onPick })} />)
      await u.keyboard('{ArrowRight}{Enter}')
      expect(onPick).toHaveBeenCalledTimes(1)
      expect(onPick.mock.calls[0]![0].id).toBe(games[5]!.id)
    })
  })

  /**
   * A double tap has to be long enough for a six-year-old's hands and short
   * enough that two deliberate shifts a second apart are not one gesture.
   */
  it('gives a double tap a window a child can actually hit', () => {
    expect(DOUBLE_MS).toBeGreaterThanOrEqual(300)
    expect(DOUBLE_MS).toBeLessThanOrEqual(800)
  })
})
