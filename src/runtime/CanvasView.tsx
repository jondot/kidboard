import { Fragment } from 'react'
import type { Cell, Tone } from '../types'
import { toneClass } from '../terminal/tones'
import { isWide } from '../terminal/wide'

type Run = { text: string; tone: Tone; wide?: boolean }

/**
 * Walks a row cell by cell, coalescing same-tone neighbours into one span.
 *
 * An emoji cell breaks the run and becomes its own `.kb-cell2` span, and the
 * empty continuation cell the rasterizer reserved beside it is skipped — the
 * span itself is exactly `2ch` wide, so the two-cell reservation survives
 * whatever font the browser picks for the glyph. See `terminal/wide.ts`.
 */
function runs(row: Cell[]): Run[] {
  const out: Run[] = []
  for (let i = 0; i < row.length; i++) {
    const cell = row[i]!

    if (isWide(cell.ch)) {
      out.push({ text: cell.ch, tone: cell.tone, wide: true })
      if (row[i + 1]?.ch === '') i += 1
      continue
    }

    const last = out[out.length - 1]
    if (last && !last.wide && last.tone === cell.tone) last.text += cell.ch
    else out.push({ text: cell.ch, tone: cell.tone })
  }
  return out
}

/**
 * The only path by which a game frame reaches the DOM. Always LTR and bidi
 * isolated, so an RTL page can never reorder a drawing.
 */
export function CanvasView({ cells }: { cells: Cell[][] }) {
  return (
    <pre dir="ltr" className="kb-art">
      {cells.map((row, y) => (
        <Fragment key={y}>
          {y > 0 ? '\n' : null}
          {runs(row).map((r, i) => (
            <span
              key={i}
              className={`${toneClass(r.tone)}${r.wide ? ' kb-cell2' : ''}`}
            >
              {r.text}
            </span>
          ))}
        </Fragment>
      ))}
    </pre>
  )
}
