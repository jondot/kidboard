import { useEffect, useRef, useState } from 'react'
import type { Dir } from '../types'
import { Glyph } from '../ui/icons'

/**
 * THE LIST THE MACHINE OPENS IN THE MIDDLE OF THE SCREEN.
 *
 * One component, two lists: the games (Shift, Shift) and the colours (Ctrl,
 * Ctrl). They are the same gesture and the same list because they are the same
 * KIND of question — "which one?" — and a child who has learnt to drive one of
 * them has learnt to drive the other. What they are not is settings: a setting
 * is filed in a menu behind a pointer, and these are things the machine does
 * when you ask it by name.
 *
 * NCURSES IS THE UX, NOT THE STYLE. What is borrowed is the behaviour — one
 * bordered box, one highlighted row that inverts, ↑↓ to move, ⏎ to choose, Esc
 * to leave, and a hint line at the foot saying exactly that. What it LOOKS
 * like is the machine's, decided in each shell's stylesheet: the Kidtari's box is
 * chunky and upper case, the tube's is drawn in one phosphor, kid code's is a
 * thin rounded rule.
 *
 * WHILE IT IS OPEN IT OWNS THE KEYBOARD — including from a running game, which
 * is the one and only thing that ever takes keys off a cartridge, and it does
 * so because the child asked for it by name.
 */

export type PickerItem = {
  key: string
  /** What the row says. For a game, the word a child would have typed. */
  label: string
  /** A 2x2 colour chip, for a row that names a palette. */
  swatch?: readonly string[]
  /** The one that is already chosen — a check at the trailing edge. */
  checked?: boolean
  /**
   * The game's own picture, in half-blocks, for a list drawn as TILES. The
   * same rows a cart's label is drawn with — see `bitmapLabel` in
   * `carts/label.ts`.
   */
  art?: readonly string[]
}

export type PickerProps = {
  /** The box's own label, e.g. `pick a game`. */
  title: string
  /** The line at the foot: what the keys do. */
  hint: string
  dir: Dir
  items: readonly PickerItem[]
  /** Where the highlight starts. Clamped, so a bad index is not an error. */
  start?: number
  /**
   * A SHELF INSTEAD OF A LIST.
   *
   * Games have pictures — the same ones on the front of their cartridges — and
   * a six-year-old who cannot read chooses by picture. So the games are laid
   * out as tiles and the arrows move in two dimensions. Palettes and machines
   * stay a list: their answers are a word and a colour chip, and a grid of
   * those would be a shelf of nothing.
   */
  tiles?: boolean
  onPick(key: string): void
  onClose(): void
}

export function Picker(
  { title, hint, dir, items, start = 0, tiles = false, onPick, onClose }: PickerProps,
) {
  const n = items.length
  const [active, setActive] = useState(() =>
    n === 0 ? 0 : Math.min(Math.max(0, start), n - 1))
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // The list takes focus so a screen reader announces it and so Tab cannot
  // wander off into the transcript behind it.
  useEffect(() => { box.current?.focus() }, [])

  // Keep the highlight on screen in a list longer than the box — which the
  // colours are on every machine, and the games are on a short one.
  useEffect(() => {
    const el = list.current?.children[active]
    if (el instanceof HTMLElement && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  /**
   * HOW MANY TILES ARE ON A ROW, asked of the layout rather than declared.
   *
   * The grid is `auto-fill`, so the answer depends on how wide the playground
   * is — and the playground is embeddable, so it is not the window's width
   * either. The tiles that share the first one's `offsetTop` are its row. In a
   * test environment nothing has a layout and every tile answers 0, which
   * comes back as "one row" and is exactly right: with one row, up and down
   * are the previous and next tile.
   */
  const columns = (): number => {
    if (!tiles) return 1
    const kids = [...(list.current?.children ?? [])] as HTMLElement[]
    if (kids.length === 0) return 1
    const top = kids[0]!.offsetTop
    return Math.max(1, kids.filter((k) => k.offsetTop === top).length)
  }

  /**
   * Captured on `window`, so this beats the terminal's own global handler and
   * takes the keys off a running cartridge for as long as the list is up.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); onClose(); return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        if (n === 0) return
        // A row at a time in a grid, one at a time in a list — and one at a
        // time in a grid that fits on a single row, where a row's worth of
        // movement would land back where it started.
        const cols = columns()
        const by = cols >= n ? 1 : cols
        const step = (e.key === 'ArrowDown' ? 1 : -1) * by
        setActive((i) => (((i + step) % n) + n) % n)
        return
      }
      if (tiles && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault(); e.stopPropagation()
        if (n === 0) return
        // The arrows are PHYSICAL: right is the next tile along the shelf in
        // English and the previous one in Hebrew, because the shelf itself is
        // laid out the other way round there.
        const forward = (e.key === 'ArrowRight') === (dir !== 'rtl')
        setActive((i) => (((i + (forward ? 1 : -1)) % n) + n) % n)
        return
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); e.stopPropagation()
        setActive(e.key === 'Home' ? 0 : Math.max(0, n - 1))
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation()
        const item = items[active]
        if (item) onPick(item.key)
        return
      }
      // Everything else is swallowed while the list is up: a child typing
      // into a game they cannot see is the failure this prevents.
      if (e.key.length === 1) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items, n, active, tiles, dir, onPick, onClose])

  return (
    <div
      data-kb-picker=""
      className="kb-picker-scrim"
      dir={dir}
      // A click outside the box closes it, and never reaches the terminal's
      // own click-to-focus handler behind it.
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        ref={box}
        role="listbox"
        aria-label={title}
        tabIndex={-1}
        className="kb-picker"
        {...(tiles ? { 'data-kb-tiles': '' } : {})}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kb-picker-title" dir="auto">{title}</div>

        <div ref={list} className="kb-picker-list">
          {items.map((item, i) => (
            <div
              key={item.key}
              role="option"
              aria-selected={i === active}
              data-kb-active={i === active ? 'true' : 'false'}
              className={tiles ? 'kb-picker-tile' : 'kb-picker-row'}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(item.key)}
            >
              {tiles ? (
                /*
                  THE GAME'S OWN PICTURE, in half-blocks — the same rows a
                  cart's label is drawn with, and for a cart the very same
                  rows. `dir="ltr"` and isolated, because a drawing has no
                  reading order and Hebrew must not reorder its columns; the
                  SHELF still mirrors, so the first tile is at the reading
                  edge.
                */
                <span dir="ltr" aria-hidden="true" className="kb-tile-art">
                  {(item.art ?? []).join('\n')}
                </span>
              ) : (
                <span className="kb-picker-mark" aria-hidden="true">
                  {i === active ? '▸' : ' '}
                </span>
              )}
              {item.swatch ? (
                <span className="kb-swatch" aria-hidden="true">
                  {item.swatch.map((c, k) => <i key={k} style={{ background: c }} />)}
                </span>
              ) : null}
              <span dir="auto" className="kb-picker-word">{item.label}</span>
              {item.checked ? (
                <Glyph name="check" className="kb-picker-check" />
              ) : null}
            </div>
          ))}
        </div>

        <div className="kb-picker-hint" dir="auto">{hint}</div>
      </div>
    </div>
  )
}
