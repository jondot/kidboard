import { themeFrom, type Theme } from './theme'

import catppuccin from './gallery/catppuccin.toml?raw'
import catppuccinLatte from './gallery/catppuccin-latte.toml?raw'
import ethereal from './gallery/ethereal.toml?raw'
import everforest from './gallery/everforest.toml?raw'
import flexokiLight from './gallery/flexoki-light.toml?raw'
import gruvbox from './gallery/gruvbox.toml?raw'
import hackerman from './gallery/hackerman.toml?raw'
import kanagawa from './gallery/kanagawa.toml?raw'
import lastHorizon from './gallery/last-horizon.toml?raw'
import lumon from './gallery/lumon.toml?raw'
import lupine from './gallery/lupine.toml?raw'
import matteBlack from './gallery/matte-black.toml?raw'
import miasma from './gallery/miasma.toml?raw'
import nord from './gallery/nord.toml?raw'
import osakaJade from './gallery/osaka-jade.toml?raw'
import retro82 from './gallery/retro-82.toml?raw'
import ristretto from './gallery/ristretto.toml?raw'
import rosePine from './gallery/rose-pine.toml?raw'
import solitude from './gallery/solitude.toml?raw'
import tokyoNight from './gallery/tokyo-night.toml?raw'
import vantablack from './gallery/vantablack.toml?raw'
import white from './gallery/white.toml?raw'

/**
 * Omarchy's own 22 `colors.toml` files (`quattro` branch), copied verbatim
 * into `./gallery/` — see `./gallery/README.md` for attribution (MIT,
 * © Basecamp / David Heinemeier Hansson).
 *
 * This is the answer to "i'm not seeing the many themes from omarchy": the
 * schema was adopted specifically so these would drop in as data, and this is
 * the drop-in. `sunset-arcade` and `desert-noon` (see `./themes.ts`) stay the
 * defaults — this is a gallery to choose from, not a replacement for them.
 *
 * These are proper names, not descriptive phrases like "sunset arcade", so
 * they are left in Latin script for both locales rather than guessed at in
 * Hebrew. A real Hebrew rendering of them is a judgement call for a native
 * speaker, and is deliberately not guessed at here.
 */
const RAW: readonly [id: string, en: string, src: string][] = [
  ['catppuccin', 'catppuccin', catppuccin],
  ['catppuccin-latte', 'catppuccin latte', catppuccinLatte],
  ['ethereal', 'ethereal', ethereal],
  ['everforest', 'everforest', everforest],
  ['flexoki-light', 'flexoki light', flexokiLight],
  ['gruvbox', 'gruvbox', gruvbox],
  ['hackerman', 'hackerman', hackerman],
  ['kanagawa', 'kanagawa', kanagawa],
  ['last-horizon', 'last horizon', lastHorizon],
  ['lumon', 'lumon', lumon],
  ['lupine', 'lupine', lupine],
  ['matte-black', 'matte black', matteBlack],
  ['miasma', 'miasma', miasma],
  ['nord', 'nord', nord],
  ['osaka-jade', 'osaka jade', osakaJade],
  ['retro-82', 'retro 82', retro82],
  ['ristretto', 'ristretto', ristretto],
  ['rose-pine', 'rose pine', rosePine],
  ['solitude', 'solitude', solitude],
  ['tokyo-night', 'tokyo night', tokyoNight],
  ['vantablack', 'vantablack', vantablack],
  ['white', 'white', white],
]

/** The gallery, in the fixed order it is shipped and grouped in. */
export const GALLERY: readonly Theme[] = RAW.map(([id, en, src]) =>
  themeFrom(id, { en, he: en }, src))
