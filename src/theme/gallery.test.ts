import { describe, it, expect } from 'vitest'
import { contrast } from './color'
import { MIN_BORDER_CONTRAST, MIN_TEXT_CONTRAST, toVars } from './palette'
import { GALLERY } from './gallery'
import { LAST_RESORT } from './theme'

/**
 * The contrast table for the report: for every gallery theme, the ink
 * (`--kb-plain`, i.e. `foreground` after the guard) against the ground, and
 * the border (`--kb-border`, i.e. `muted` after the guard) against the
 * ground. `npx vitest run src/theme/gallery.test.ts` prints it.
 */
describe('the Omarchy gallery: contrast table', () => {
  it('holds ink at AA and the border at the non-text floor, for all 22', () => {
    const rows = GALLERY.map((t) => {
      const v = toVars(t.palette)
      return {
        id: t.id,
        mode: t.palette.mode,
        ink: contrast(v['--kb-plain']!, v['--kb-bg']!),
        border: contrast(v['--kb-border']!, v['--kb-bg']!),
      }
    })

    // eslint-disable-next-line no-console
    console.log(
      '\n| theme | mode | ink:ground | border:ground |\n|---|---|---|---|\n' +
        rows
          .map((r) => `| ${r.id} | ${r.mode} | ${r.ink.toFixed(2)} | ${r.border.toFixed(2)} |`)
          .join('\n'),
    )

    for (const r of rows) {
      expect(r.ink, `${r.id} ink`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      expect(r.border, `${r.id} border`).toBeGreaterThanOrEqual(MIN_BORDER_CONTRAST)
    }
  })

  it('never silently falls back — every one of the 22 files actually parses', () => {
    for (const t of GALLERY) {
      // themeFrom() falls back to LAST_RESORT — sunset-arcade, written out by
      // hand — on any parse failure. Equality with it here would mean a real
      // Omarchy file failed to parse and nobody noticed.
      expect(t.palette, `${t.id} fell back to LAST_RESORT`).not.toEqual(LAST_RESORT)
    }
  })
})
