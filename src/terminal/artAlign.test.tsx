// Regression for the RTL art-alignment bug: a `{kind:'art'}` block must keep
// its glyphs in LTR order (dir="ltr" + unicode-bidi: isolate — structural,
// enforced in ArtView, never touched here) while the BLOCK ITSELF sits on the
// reading edge of the page: left under English, right under Hebrew.
//
// jsdom has no layout engine, so it cannot tell us which physical side a box
// actually renders on — that was checked by hand in a real Chromium (see
// S3-report.md) for a narrow art block, a wide one, and one wider than the
// container, in both languages. What THIS file checks is the source-level
// shape of the fix, the same way chrome.invariants.test.ts does: that
// alignment lives where it can actually see the ambient direction, and that
// the structural bidi-isolation guarantee on the drawing itself never moves.
//
// `text-align: match-parent` on `.kb-art` looked like the fix and was tried
// first — it reads correctly in the spec — but was verified in a real
// Chromium (via getClientRects()) to be a no-op once an element's own
// `direction` already differs from its parent's, which is exactly this
// element's situation. That is why the rule below lives on a wrapper
// (`.kb-art-row`) that never sets its own `dir`, not on `.kb-art` itself.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { ArtView } from './BlockView'

const css = () => readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no rule for ${selector}`)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('art block alignment follows the reading edge, not its own forced LTR', () => {
  it('keeps the structural bidi-isolation guarantee on the drawing untouched', () => {
    const artRule = rule(css(), '.kb-art')
    expect(artRule).toContain('direction: ltr')
    expect(artRule).toContain('unicode-bidi: isolate')
  })

  // The bug: `.kb-art` forces `direction: ltr` on itself, and CSS `start`/
  // `end` keywords resolve against an element's OWN direction — so ANY
  // text-align set on `.kb-art` itself (however "logical" the keyword looks)
  // resolves against the LTR just forced onto it, not the page's. Alignment
  // has to live on an ancestor that never overrides its own direction.
  it('never sets text-align on .kb-art itself — that would resolve against its own forced ltr', () => {
    const artRule = rule(css(), '.kb-art')
    expect(artRule).not.toMatch(/text-align/)
  })

  it('aligns the drawing via a wrapper that inherits the ambient/page direction', () => {
    const rowRule = rule(css(), '.kb-art-row')
    expect(rowRule).toContain('text-align: start')
  })

  it('gives .kb-art something for the wrapper to actually position', () => {
    // A default block fills 100% of its container regardless of the
    // container's text-align — only an inline-level (or inline-block) box
    // can be positioned by an ancestor's text-align at all.
    const artRule = rule(css(), '.kb-art')
    expect(artRule).toMatch(/display:\s*inline-block/)
  })

  it('never hardcodes a physical alignment or margin for art', () => {
    const css_ = css()
    expect(rule(css_, '.kb-art')).not.toMatch(/text-align:\s*(left|right)\b/)
    expect(rule(css_, '.kb-art-row')).not.toMatch(/text-align:\s*(left|right)\b/)
    expect(rule(css_, '.kb-art')).not.toMatch(/margin-(left|right)\s*:/)
  })

  // The wrapper must never fix its OWN `dir` — that would defeat the whole
  // point, pinning every art block to one physical side no matter the
  // locale, exactly like the original bug.
  it('renders the art wrapper without an explicit dir, so it mirrors with the page', () => {
    const { container } = render(<ArtView art={'  /\\_/\\\n ( o.o )'} />)
    const row = container.querySelector('.kb-art-row')!
    expect(row.getAttribute('dir')).toBeNull()
    const pre = row.querySelector('pre')!
    expect(pre.getAttribute('dir')).toBe('ltr')
  })
})
