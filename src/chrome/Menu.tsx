import {
  useCallback, useEffect, useId, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { Dir } from '../types'
import { Glyph, type IconName } from '../ui/icons'

/**
 * ONE MENU, THE WAY EVERY DESKTOP DOES IT.
 *
 * There used to be four buttons in the title bar — games, theme, language,
 * carts — each with its own flat popup, and the theme one had grown two
 * headings inside it because a machine and its palette are two questions
 * wearing one button. Four buttons is four things to explain; a title bar has
 * a settings menu, and a settings menu has submenus.
 *
 * So: one entry point, and a real hierarchical menu behind it. A submenu opens
 * to the side, on hover or on the arrow key that points at it, and closes when
 * the pointer or the highlight leaves. Picking anything closes the whole
 * stack, which is what a menu bar has done since 1984 and is therefore the one
 * behaviour nobody has to be taught.
 *
 * WHO OWNS THE KEYBOARD. Unchanged and non-negotiable: a running cartridge
 * owns every key. Opening this with the pointer does NOT move focus (see
 * `onMouseDown`), so a game keeps receiving keys while the menu is driven by
 * the pointer that opened it. Only a deliberate Tab or a keyboard activation
 * moves focus in, and `Terminal` treats a key aimed inside the menu as the
 * menu's — the single narrow exemption, and still the only one.
 *
 * DIRECTION. The popup is laid out with logical properties, so under Hebrew it
 * hangs off the other edge and its submenus open the other way, with no
 * mirrored copy of anything. Only the ARROW KEYS need to know: `→` means
 * "inwards" in English and "outwards" in Hebrew, so the two are swapped from
 * `dir` rather than hard-coded.
 */

export type MenuNode =
  | {
      kind: 'item'
      key: string
      label: string
      icon?: IconName
      /** A 2x2 colour chip, for rows that name a palette or a machine. */
      swatch?: readonly string[]
      /** Shown dim at the end of the row: the current answer, if it has one. */
      value?: string
      /** Draws the check. A radio group is just several rows, one checked. */
      checked?: boolean
      run(): void
    }
  | {
      kind: 'sub'
      key: string
      label: string
      icon?: IconName
      swatch?: readonly string[]
      /** Shown dim at the end of the row: the current value, if it has one. */
      value?: string
      children: MenuNode[]
    }
  /** A line to READ, never a thing to press: "no carts yet", "or drop one". */
  | { kind: 'note'; key: string; label: string }
  | { kind: 'sep'; key: string }

/** Everything the highlight is allowed to land on. */
type Pickable = Extract<MenuNode, { kind: 'item' | 'sub' }>

const isPickable = (n: MenuNode): n is Pickable =>
  n.kind !== 'sep' && n.kind !== 'note'

/** The next pickable row in `step`'s direction, wrapping. */
function nextAt(nodes: MenuNode[], from: number, step: number): number {
  const n = nodes.length
  for (let k = 1; k <= n; k += 1) {
    const j = (((from + step * k) % n) + n) % n
    if (isPickable(nodes[j]!)) return j
  }
  return from
}

function firstAt(nodes: MenuNode[]): number {
  const i = nodes.findIndex(isPickable)
  return i === -1 ? 0 : i
}

type ListProps = {
  nodes: MenuNode[]
  dir: Dir
  label: string
  /** Close the WHOLE stack — an item was picked, or Escape reached the root. */
  onDone(focusOpener: boolean): void
  /** Close just this level and put the highlight back on its parent row. */
  onBack?: () => void
  /** True for the level a keyboard is actually driving. */
  focused: boolean
}

function MenuList({ nodes, dir, label, onDone, onBack, focused }: ListProps) {
  const [active, setActive] = useState(() => firstAt(nodes))
  const [openSub, setOpenSub] = useState<string | null>(null)
  /** Whether the OPEN submenu is the one the keyboard is driving. */
  const [subFocused, setSubFocused] = useState(false)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  // `→` steps into a submenu in English and out of one in Hebrew.
  const inward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const outward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'

  // Focus follows the highlight, but only on the level the keyboard is on:
  // stealing it back from an open submenu would make `→` un-navigable.
  useEffect(() => {
    if (!focused || subFocused) return
    rows.current[active]?.focus()
  }, [focused, subFocused, active, nodes.length])

  const enterSub = useCallback((key: string, byKeyboard: boolean) => {
    setOpenSub(key)
    setSubFocused(byKeyboard)
  }, [])

  const leaveSub = useCallback(() => {
    setOpenSub(null)
    setSubFocused(false)
  }, [])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // A key inside an OPEN, keyboard-driven submenu is that submenu's; React
    // bubbles it up here afterwards, and acting on it again would move two
    // highlights with one press.
    if (subFocused) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      leaveSub()
      setActive((i) => nextAt(nodes, i, e.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      leaveSub()
      setActive(e.key === 'Home' ? nextAt(nodes, -1, 1) : nextAt(nodes, 0, -1))
      return
    }
    if (e.key === inward) {
      const node = nodes[active]
      if (node?.kind !== 'sub') return
      e.preventDefault()
      e.stopPropagation()
      enterSub(node.key, true)
      return
    }
    if (e.key === outward) {
      if (!onBack) return
      e.preventDefault()
      e.stopPropagation()
      onBack()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (onBack) onBack()
      else onDone(true)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const node = nodes[active]
      if (!node || !isPickable(node)) return
      e.preventDefault()
      e.stopPropagation()
      if (node.kind === 'sub') { enterSub(node.key, true); return }
      node.run()
      onDone(true)
      return
    }
    if (e.key === 'Tab') onDone(false)
  }

  return (
    <div
      className="kb-menu"
      role="menu"
      aria-label={label}
      dir={dir}
      /**
       * ONLY A LEAF LIST SCROLLS, and this is not a nicety.
       *
       * `overflow-y: auto` makes a scroll container, and a scroll container
       * CLIPS its absolutely-positioned descendants — so a level with
       * submenus in it that could scroll would swallow every submenu that
       * opened out of it. The top level is five rows and never needs to
       * scroll; the palette list on Omarchy is twenty-two and always does,
       * and it has no submenus of its own to lose.
       */
      data-kb-scrolls={nodes.some((n) => n.kind === 'sub') ? 'false' : 'true'}
      onKeyDown={onKeyDown}
    >
      {nodes.map((node, i) => {
        if (node.kind === 'sep') {
          return <div key={node.key} className="kb-menu-sep" role="separator" />
        }
        if (node.kind === 'note') {
          return (
            <div key={node.key} dir="auto" className="kb-menu-note">
              {node.label}
            </div>
          )
        }
        const isSub = node.kind === 'sub'
        const open = isSub && openSub === node.key
        return (
          <div
            key={node.key}
            className="kb-menu-slot"
            // Hover is how a pointer walks an OS menu: moving onto a submenu
            // row opens it, moving onto any other row closes whatever was open.
            onMouseEnter={() => {
              setActive(i)
              if (isSub) enterSub(node.key, false)
              else leaveSub()
            }}
          >
            <button
              type="button"
              ref={(el) => { rows.current[i] = el }}
              className="kb-menu-row"
              role={node.kind === 'item' && node.checked !== undefined
                ? 'menuitemradio' : isSub ? 'menuitem' : 'menuitem'}
              aria-haspopup={isSub ? 'menu' : undefined}
              aria-expanded={isSub ? open : undefined}
              aria-checked={node.kind === 'item' && node.checked !== undefined
                ? node.checked : undefined}
              // Roving tabindex: one tab stop per level, arrows move inside it.
              tabIndex={i === active ? 0 : -1}
              data-kb-active={focused && !subFocused && i === active ? 'true' : 'false'}
              // Never steal focus on a click: a running cartridge owns the
              // keyboard and a button that takes it would strand the game.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (isSub) { enterSub(node.key, false); return }
                node.run()
                onDone(false)
              }}
            >
              {node.swatch ? (
                <span className="kb-swatch" aria-hidden="true">
                  {node.swatch.map((c, k) => <i key={k} style={{ background: c }} />)}
                </span>
              ) : node.icon ? (
                <Glyph name={node.icon} />
              ) : (
                <span className="kb-menu-gap" aria-hidden="true" />
              )}

              <span dir="auto" className="kb-menu-label">{node.label}</span>

              {/* A row that OPENS something can carry its current answer too:
                  `machines … kidtari` says what you are on without opening
                  anything, exactly as the submenu it replaced did. */}
              {node.value ? (
                <span dir="auto" className="kb-menu-value">{node.value}</span>
              ) : null}
              {isSub ? (
                // Mirrored under Hebrew along with the popup it points at.
                <Glyph name="submenu" className="kb-menu-arrow" />
              ) : node.checked ? (
                <Glyph name="check" className="kb-menu-check" />
              ) : (
                <span className="kb-menu-gap" aria-hidden="true" />
              )}
            </button>

            {open && isSub ? (
              <div className="kb-menu-sub" id={`${id}-${node.key}`}>
                <MenuList
                  nodes={node.children}
                  dir={dir}
                  label={node.label}
                  onDone={onDone}
                  onBack={() => { leaveSub(); rows.current[i]?.focus() }}
                  focused={subFocused}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export type MenuProps = {
  /** The opener's accessible name. The button itself is an icon. */
  label: string
  icon: IconName
  nodes: MenuNode[]
  dir: Dir
  /** True while a cartridge is running: Escape then belongs to the game. */
  busy: boolean
  /** Extra classes for the opener, so each machine can dress its own bar. */
  buttonClassName?: string
}

export function Menu({ label, icon, nodes, dir, busy, buttonClassName }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [byKeyboard, setByKeyboard] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  const close = useCallback((focusOpener: boolean) => {
    setOpen(false)
    setByKeyboard(false)
    if (focusOpener) button.current?.focus()
  }, [])

  // A pointer anywhere else closes it. `pointerdown` rather than `click`, so
  // the menu is gone before the terminal's own click handler refocuses input.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      const el = root.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, close])

  /**
   * Escape from OUTSIDE the menu. While a cartridge runs, Escape is the
   * cartridge's — that is the ownership rule — so this only claims a stray
   * Escape when nothing is running to claim it. An Escape aimed INSIDE the
   * menu is handled by `MenuList`, which walks back out one level at a time.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = root.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      if (busy) return
      e.stopPropagation()
      close(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, busy, close])

  return (
    <div
      ref={root}
      data-kb-menu=""
      className="kb-menu-root"
      // The terminal refocuses its input on any click; a click on the menu is
      // not a click on the terminal.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={button}
        type="button"
        className={`kb-menu-open ${buttonClassName ?? ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const keyboard = e.detail === 0
          setOpen((was) => !was)
          setByKeyboard(keyboard)
          if (keyboard) requestAnimationFrame(() => {})
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
            setByKeyboard(true)
          }
        }}
      >
        <Glyph name={icon} />
      </button>

      {open ? (
        <div className="kb-menu-pop">
          <MenuList
            nodes={nodes}
            dir={dir}
            label={label}
            onDone={close}
            focused={byKeyboard}
          />
        </div>
      ) : null}
    </div>
  )
}
