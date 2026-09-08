// Mechanical enforcement of the two rules the chrome (toolbar, bars, panels,
// theme engine) is easiest to break by accident, and hardest to notice: a
// physical-direction utility that silently stops mirroring under Hebrew, and a
// codepoint escape where an emoji should be.
//
// These are grep-shaped on purpose. A rule you can only check by looking at
// the app in two languages is a rule that will be broken by the sixteen
// cartridges landing next.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'src')

function sources(dir: string, out: { file: string; src: string }[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sources(full, out)
      continue
    }
    if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push({ file: full.slice(ROOT.length + 1), src: readFileSync(full, 'utf8') })
    }
  }
  return out
}

/**
 * Every Tailwind utility and CSS property that names a physical side. Under
 * Hebrew the whole interface mirrors, and a single `ml-2` or `border-l` is a
 * button that drifts to the wrong edge in one language only — the kind of bug
 * that ships because the person who wrote it does not read Hebrew.
 */
const PHYSICAL_CLASS =
  /\bkb:(?:-?(?:ml|mr|pl|pr|left|right|inset-l|inset-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|(?:border|rounded|text)-(?:l|r)\b|text-(?:left|right)\b|(?:border|rounded)-(?:l|r)-)/

const PHYSICAL_CSS =
  /(?<![-\w])(?:margin|padding|border|inset)?-?(?:left|right)\s*:/

describe('the chrome mirrors without special cases', () => {
  it('uses no physical-direction Tailwind utility anywhere in src', () => {
    for (const { file, src } of sources(ROOT)) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      const hit = PHYSICAL_CLASS.exec(src)
      expect(hit?.[0], `${file} uses the physical utility "${hit?.[0]}"`)
        .toBeUndefined()
    }
  })

  // EVERY sheet, not just the main one: each machine now owns a stylesheet of
  // its own (`src/systems/shells/*.css`), and a rule that only guards
  // `styles.css` is a rule three machines are exempt from.
  it('uses no physical-direction CSS property in ANY stylesheet', () => {
    const sheets = sources(ROOT).filter(({ file }) => file.endsWith('.css'))
    expect(sheets.length, 'no stylesheets found — the walker missed them')
      .toBeGreaterThan(1)
    for (const { file, src } of sheets) {
      const hit = PHYSICAL_CSS.exec(src)
      expect(hit?.[0], `${file} uses "${hit?.[0]}" instead of a logical property`)
        .toBeUndefined()
    }
  })

  it('positions the settings menu with logical inset properties', () => {
    const css = readFileSync(join(ROOT, 'styles.css'), 'utf8')
    expect(css).toContain('inset-inline-end')
    expect(css).toContain('inset-block-start')
  })
})

describe('emoji are written as emoji', () => {
  // A codepoint escape is unreadable in review, invisible in a diff, and makes
  // it impossible to tell at a glance which picture a child will see. The
  // needle is assembled rather than written out, so that this file does not
  // itself become the one hit `grep -rn` finds.
  const NEEDLE = String.raw`\u` + '{'

  it('never uses a codepoint escape', () => {
    for (const { file, src } of sources(ROOT)) {
      expect(src.includes(NEEDLE), `${file} writes an emoji as a codepoint escape`)
        .toBe(false)
    }
  })
})

/**
 * THE CHROME IS INK, AND THE CHROME IS THE FRAME.
 *
 * The menus used to be labelled 🎮 🎨 🌍 🃏, and the rows inside them 📂 💾 👋
 * ↩ 🃏. On a monochrome machine that was unreadable: an emoji is a full-colour
 * bitmap the font vendor chose, so it ignores the palette entirely, and four
 * saturated glyphs on a single phosphor ramp are four smudges a child has to
 * squint at. `🎨` and `🃏` at 18px are the same beige-and-red blob.
 *
 * Lucide is stroked SVG drawn in `currentColor`, so an icon is the machine's
 * own ink and nothing else — amber on the P3 tube, ivory on kid code.
 *
 * EMOJI ARE NOT BANNED FROM KIDBOARD. They stay wherever they are CONTENT: a
 * cartridge's own trigger glyph, the animals, the pictures a game draws. Only
 * the frame is ink, so only the frame's files are checked.
 */
describe('the chrome carries no emoji', () => {
  const CHROME = [
    'chrome/Menu.tsx',
    'chrome/Window.tsx',
    'chrome/menuModel.ts',
    'terminal/GamePicker.tsx',
    'terminal/InputLine.tsx',
    'ui/icons.tsx',
  ]

  /**
   * `Emoji_Presentation`, and NOT `Extended_Pictographic`, which is the
   * distinction that matters here.
   *
   * A character with emoji presentation is drawn by the platform as a
   * full-colour picture whatever the surrounding style says — that is the
   * property that makes it ignore the palette. `✻`, `⏺`, `⎿`, `▸` and the
   * block characters kid code draws its logo out of are pictographic but
   * TEXT-presentation: they take the machine's ink like any letter, and they
   * are the machine's own furniture rather than a vendor's picture.
   *
   * Comments are stripped first: the note above names the very emoji it says
   * were removed.
   */
  const EMOJI = /\p{Emoji_Presentation}/u
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('draws every chrome icon as an SVG, never as an emoji', () => {
    for (const file of CHROME) {
      const hit = code(readFileSync(join(ROOT, file), 'utf8')).match(EMOJI)
      expect(hit?.[0], `${file} still labels the chrome with ${hit?.[0]}`)
        .toBeUndefined()
    }
  })

  it('takes its icons from one place, so no component names a glyph', () => {
    for (const file of CHROME) {
      if (file === 'ui/icons.tsx') continue
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src, `${file} imports an icon directly`)
        .not.toMatch(/from '.*lucide-react'/)
    }
  })
})
