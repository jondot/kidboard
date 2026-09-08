import type { ComponentType } from 'react'
import {
  Check, ChevronRight, Gamepad2, Globe, Monitor, Palette, Settings,
  Volume2, VolumeX, Package, Upload, Download, Sparkles, Play, Type,
} from 'lucide-react'

/**
 * EVERY ICON IN THE CHROME, AND THE REASON THERE ARE NO EMOJI LEFT IN IT.
 *
 * The menus used to be labelled 🎮 🎨 🌍 🃏. On a monochrome machine that was
 * unreadable: an emoji is a full-colour bitmap the font vendor chose, so it
 * ignores the palette entirely, and four saturated glyphs sitting on a single
 * phosphor ramp are four smudges a child has to squint at. `🎨` and `🃏` at
 * 18px are the same beige-and-red blob.
 *
 * Lucide is stroked SVG: it inherits `currentColor`, so an icon is drawn in
 * whatever ink the machine is wearing and nothing else — amber on the P3 tube,
 * ivory on kid code, the console blue's foreground on the Kidtari. Same shape at
 * every size, sharp on every screen, and one colour by construction, which is
 * the house monochrome rule that emoji could never keep.
 *
 * EMOJI ARE NOT BANNED FROM KIDBOARD. They stay where they are content rather
 * than chrome — a cartridge's own trigger glyph, the animals, the drawings a
 * game paints. This module is the frame, and the frame is ink.
 */

export type Icon = ComponentType<{ size?: number | string; className?: string }>

/** The chrome's whole vocabulary, by ROLE. No component names a glyph. */
export const Icons = {
  settings: Settings,
  system: Monitor,
  theme: Palette,
  language: Globe,
  /** How big the words are — a letter, at two sizes. */
  textsize: Type,
  /**
   * Read this out loud — deliberately the SAME speaker as `soundOn`.
   *
   * A speech bubble was tried first and, at the fourteen pixels this is drawn
   * at beside a line of prose, it reads as two commas. The two uses are never
   * confusable in context — one is a row in a settings menu, the other sits
   * at the end of a sentence — and both mean the same thing to a child, which
   * is "this makes a sound".
   */
  speak: Volume2,
  games: Gamepad2,
  carts: Package,
  load: Upload,
  save: Download,
  soundOn: Volume2,
  soundOff: VolumeX,
  check: Check,
  submenu: ChevronRight,
  spark: Sparkles,
  play: Play,
} satisfies Record<string, Icon>

export type IconName = keyof typeof Icons

/**
 * An icon at the size of the text beside it.
 *
 * `1em` rather than a px value so an icon scales with the machine: the CRT
 * sets 22px type and the Kidtari 18px, and an icon frozen at 16 would be a
 * different size relative to its label on each of the four. `shrink-0` because
 * an icon in a flex row must never be squeezed into an ellipse by a long
 * Hebrew label.
 */
export function Glyph(
  { name, className }: { name: IconName; className?: string },
) {
  const C = Icons[name]
  return (
    <C
      size="1em"
      className={`kb-glyph kb:shrink-0 ${className ?? ''}`}
    />
  )
}
