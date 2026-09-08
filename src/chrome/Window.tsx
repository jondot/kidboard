import type { ReactNode } from 'react'
import type { Dir, Locale, T } from '../types'
import type { System, WindowKind } from '../systems/types'
import { SYSTEM_STRINGS } from '../systems/strings'

/**
 * THE WINDOW THE MACHINE LIVES IN.
 *
 * Kidboard used to sit in one generic box: a teal rule, a ✨, the word
 * "kidboard" and four emoji buttons, identical on all four machines. That is a
 * product's chrome, and it undid the whole point of having four machines —
 * the transcript below the line changed and the frame around it never did, so
 * every machine was the same computer wearing a different font.
 *
 * So the frame is the machine's too, and it is the machine's REAL one:
 *
 *   tv       a Kidtari is a cartridge slot plugged into a television, so the
 *            picture is inset in a moulded set with a wordmark and a power
 *            lamp. It has no windows because it had no operating system with
 *            windows in it.
 *   mac      kid code is a terminal, and a terminal lives in a macOS window:
 *            three traffic lights at the leading edge, a tab strip, a title.
 *   monitor  a Logo machine is a monochrome monitor on a desk. Same reason as
 *            the television: there is no window manager to imitate, so the
 *            bezel IS the window.
 *   tiling   Omarchy is Hyprland: a thin accent border, rounded corners, and a
 *            bar across the TOP carrying workspace pills and the window title.
 *
 * ONE SETTINGS MENU, and it rides in whichever bit of chrome that machine
 * would actually put it in — the tab strip, the top bar, the bezel. There used
 * to be four buttons here; there is one, and everything they did is inside it.
 *
 * NOTHING HERE MOVES. No clock, no animation, no wallpaper. A window frame
 * that redraws itself is a thing pulling a child's eye away from what they are
 * doing, and this project's standing rule is that nothing re-arms on a timer.
 *
 * WHICH WAY THE MENU OPENS IS THE FRAME'S TO SAY. Two of these four put their
 * chrome UNDER the picture, because that is where a television and a monitor
 * put their badge and their controls — and a menu that drops downward from a
 * strip at the foot of the screen opens straight off the bottom edge, where it
 * is clipped by the frame. So the menu slot carries `data-kb-menu-up` on those
 * two, and `styles.css` flips the popup and its submenus to hang upward. It is
 * decided here rather than measured at runtime because it is a fact about the
 * frame, not about the window size.
 */

/** Frames whose chrome sits under the picture, so their menu opens upward. */
const BAR_AT_FOOT: Record<WindowKind, boolean> = {
  tv: true,
  mac: false,
  monitor: true,
  tiling: false,
}

/** The settings menu, in a slot that knows which way it has room to open. */
function MenuSlot({ system, menu }: { system: System; menu: ReactNode }) {
  return (
    <span
      className="kb-win-menu"
      {...(BAR_AT_FOOT[system.window] ? { 'data-kb-menu-up': '' } : {})}
    >
      {menu}
    </span>
  )
}

export type WindowProps = {
  system: System
  locale: Locale
  dir: Dir
  t: T
  /** The product's own name, for the machines whose chrome shows a title. */
  title: string
  /** The running cartridge's name, or null. A window title says what is open. */
  liveTitle: string | null
  /** The one settings menu, already built. */
  menu: ReactNode
  children: ReactNode
}

/**
 * The machine's own name, never a raw i18n key.
 *
 * `makeT` falls back to the KEY when a lookup misses, which would put
 * "system.omarchy" on a title bar. So an unresolved key is treated as no
 * answer and the table is read directly. Never a key, never blank.
 */
export function machineName(system: System, locale: Locale, t: T): string {
  const named = t(system.name)
  if (named !== system.name) return named
  return SYSTEM_STRINGS[locale]?.[system.name]
    ?? SYSTEM_STRINGS.en[system.name]
    ?? system.id
}

/** What the window says it is showing: the game, or the playground itself. */
function windowTitle(title: string, liveTitle: string | null): string {
  return liveTitle ? `${liveTitle} — ${title}` : title
}

/* ---- the four frames --------------------------------------------------- */

/**
 * A TELEVISION SET.
 *
 * The picture is inset in moulded plastic; the wordmark and the power lamp are
 * on the bottom moulding, where a set's badge actually is, and the settings
 * menu is a button moulded into the same strip. Nothing is drawn ABOVE the
 * picture, because a television has nothing above the picture.
 */
function TvWindow({ system, locale, t, menu, children }: WindowProps) {
  return (
    <div data-kb-window="tv" className="kb-win kb-win-tv">
      <div className="kb-win-tv-screen">{children}</div>
      <div data-kb-titlebar="" className="kb-win-tv-plate">
        <span className="kb-win-tv-lamp" aria-hidden="true" />
        <span dir="ltr" className="kb-win-tv-mark">
          {machineName(system, locale, t)}
        </span>
        <span className="kb:flex-1" />
        <MenuSlot system={system} menu={menu} />
      </div>
    </div>
  )
}

/**
 * A macOS TERMINAL WINDOW.
 *
 * Traffic lights at the leading edge, then a tab strip: one tab, which is this
 * session, carrying the same `✻` the machine's own welcome box uses. The
 * lights are `aria-hidden` and are not buttons — a close button that closed
 * nothing would be a lie, and one that worked would leave a six-year-old
 * looking at a blank page with no way back.
 */
function MacWindow({ system, title, liveTitle, menu, children }: WindowProps) {
  return (
    <div data-kb-window="mac" className="kb-win kb-win-mac">
      <div data-kb-titlebar="" className="kb-win-mac-bar">
        <span className="kb-win-mac-lights" aria-hidden="true">
          <i className="kb-win-mac-light kb-win-mac-close" />
          <i className="kb-win-mac-light kb-win-mac-min" />
          <i className="kb-win-mac-light kb-win-mac-zoom" />
        </span>
        <span className="kb-win-mac-tab" data-kb-tab="">
          <span className="kb-win-mac-star" aria-hidden="true">✻</span>
          <span dir="auto" className="kb-win-mac-title">
            {windowTitle(title, liveTitle)}
          </span>
        </span>
        <span className="kb:flex-1" />
        <MenuSlot system={system} menu={menu} />
      </div>
      <div className="kb-win-mac-body">{children}</div>
    </div>
  )
}

/**
 * A MONOCHROME MONITOR.
 *
 * A deep bezel with the glass inset in it, a brand plate and a power lamp
 * along the bottom moulding. No scanlines, no interlace and no fuzz: this is a
 * piece of furniture, not a filter over the picture — see `crt.css` for why
 * every one of those was taken out.
 */
function MonitorWindow({ system, locale, t, menu, children }: WindowProps) {
  return (
    <div data-kb-window="monitor" className="kb-win kb-win-monitor">
      <div className="kb-win-monitor-glass">{children}</div>
      <div data-kb-titlebar="" className="kb-win-monitor-plate">
        <span className="kb-win-monitor-lamp" aria-hidden="true" />
        <span dir="ltr" className="kb-win-monitor-mark">
          {machineName(system, locale, t)}
        </span>
        <span className="kb:flex-1" />
        <MenuSlot system={system} menu={menu} />
      </div>
    </div>
  )
}

/**
 * A TILING COMPOSITOR'S WINDOW.
 *
 * Rounded corners, a thin accent border and a bar across the top: workspace
 * pills at the leading edge with the current one lit, the window title in the
 * middle, the settings menu at the trailing edge. That is Hyprland with a bar,
 * which is what Omarchy is.
 *
 * The workspaces are `aria-hidden` scenery and are not buttons. There is one
 * window here and there always will be, so a workspace that could be switched
 * to would switch to nothing.
 */
const WORKSPACES = [1, 2, 3]

function TilingWindow({ system, title, liveTitle, menu, children }: WindowProps) {
  return (
    <div data-kb-window="tiling" className="kb-win kb-win-tiling">
      <div data-kb-titlebar="" className="kb-win-tiling-bar">
        <span className="kb-win-tiling-spaces" aria-hidden="true">
          {WORKSPACES.map((n) => (
            <i key={n} className="kb-win-tiling-space" data-kb-on={n === 1 ? 'true' : 'false'}>
              {n}
            </i>
          ))}
        </span>
        <span className="kb:flex-1" />
        <span dir="auto" className="kb-win-tiling-title">
          {windowTitle(title, liveTitle)}
        </span>
        <span className="kb:flex-1" />
        <MenuSlot system={system} menu={menu} />
      </div>
      <div className="kb-win-tiling-body">{children}</div>
    </div>
  )
}

/**
 * id -> frame. Total over `WindowKind`, so a fifth machine that declares a new
 * window is a TYPE ERROR here rather than a blank frame a child finds later.
 */
const WINDOWS: Record<WindowKind, (p: WindowProps) => ReactNode> = {
  tv: TvWindow,
  mac: MacWindow,
  monitor: MonitorWindow,
  tiling: TilingWindow,
}

export function Window(props: WindowProps) {
  const Frame = WINDOWS[props.system.window]
  return <>{Frame(props)}</>
}
