/**
 * The flat `key = "value"` subset of TOML — nothing more.
 *
 * Omarchy's `colors.toml` is exactly that shape, so a real Omarchy file can be
 * pasted in unmodified and becomes a Kidboard theme. Arrays, tables, dates and
 * multi-line strings are deliberately unsupported: a theme is a palette, and a
 * parser that only knows palettes cannot be surprised by anything else.
 *
 * NEVER THROWS. Every malformed line is skipped, not reported. The caller
 * decides whether what came back is usable; a child must never meet a parse
 * error, so there is no channel here for one to travel through.
 */

/** Escape sequences a double-quoted TOML basic string may carry. */
const ESCAPES: Record<string, string> = {
  n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\', '0': '\0',
}

/**
 * Trims a trailing `# comment`, but only one that is outside a quoted string.
 * This is not pedantry: every value in a palette file is `"#faa968"`, so a
 * quote-blind comment stripper would delete every colour in the file and leave
 * a theme of empty strings.
 */
function stripComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote !== null) {
      // Only a basic (double-quoted) string honours backslash escapes; in a
      // literal (single-quoted) string a backslash is just a backslash.
      if (c === '\\' && quote === '"') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '#') return line.slice(0, i)
  }
  return line
}

/**
 * Unwraps a value. Returns `null` for anything that is not a value we can
 * trust — an unterminated quote, or nothing at all — so the caller drops the
 * key rather than storing a half-read string.
 */
function unquote(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null

  const q = v[0]
  if (q === '"' || q === "'") {
    if (v.length < 2 || v[v.length - 1] !== q) return null   // unterminated
    const inner = v.slice(1, -1)
    if (q === "'") return inner                              // literal string
    return inner.replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c)
  }

  // A bare value (`border-alpha = 0.8`). A bare `#` cannot occur: stripComment
  // has already removed everything from the first unquoted `#` onwards.
  return v
}

/** A TOML bare key, plus the dotted/`-` forms Omarchy's own keys use. */
const KEY = /^[A-Za-z0-9_.-]+$/

/**
 * Parses the flat subset. Unknown keys are kept — deciding which keys matter
 * is the palette's job, not the parser's — but table headers and every kind of
 * malformed line are skipped in silence.
 */
export function parseToml(src: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof src !== 'string') return out

  for (const rawLine of src.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim()
    if (!line) continue
    // `[table]` / `[[array]]`: out of the subset. Skipping the header rather
    // than bailing means a file that ends with an unsupported section still
    // yields the palette that came before it.
    if (line.startsWith('[')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!KEY.test(key)) continue

    const value = unquote(line.slice(eq + 1))
    if (value === null) continue

    out[key] = value
  }
  return out
}
