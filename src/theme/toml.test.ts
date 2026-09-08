import { describe, it, expect } from 'vitest'
import { parseToml } from './toml'

describe('parseToml', () => {
  it('reads the flat key = "value" subset', () => {
    expect(parseToml('mode = "dark"\naccent = "#faa968"')).toEqual({
      mode: 'dark',
      accent: '#faa968',
    })
  })

  it('accepts both quote styles', () => {
    expect(parseToml(`a = "one"\nb = 'two'`)).toEqual({ a: 'one', b: 'two' })
  })

  it('accepts a bare, unquoted value', () => {
    expect(parseToml('border-alpha = 0.8')).toEqual({ 'border-alpha': '0.8' })
  })

  it('ignores comments and blank lines', () => {
    const src = `
# a whole-line comment

mode = "dark"   # a trailing one

  # indented
accent = "#ff7a59"
`
    expect(parseToml(src)).toEqual({ mode: 'dark', accent: '#ff7a59' })
  })

  // The bug this exists to prevent: every value in a palette file is
  // "#rrggbb", so a quote-blind comment stripper deletes every colour and
  // leaves a theme of empty strings.
  it('does not treat a # inside a quoted string as a comment', () => {
    expect(parseToml('accent = "#faa968" # the hot one')).toEqual({
      accent: '#faa968',
    })
    expect(parseToml(`accent = '#faa968'`)).toEqual({ accent: '#faa968' })
  })

  it('tolerates whitespace anywhere around the =', () => {
    expect(parseToml('   accent="#fff"   ')).toEqual({ accent: '#fff' })
    expect(parseToml('accent   =   "#fff"')).toEqual({ accent: '#fff' })
  })

  it('handles CRLF line endings', () => {
    expect(parseToml('a = "1"\r\nb = "2"\r\n')).toEqual({ a: '1', b: '2' })
  })

  it('keeps keys it does not know', () => {
    expect(parseToml('wallpaper = "x.png"')).toEqual({ wallpaper: 'x.png' })
  })

  it('skips a table header without losing what came before it', () => {
    const src = 'accent = "#111111"\n[notifications]\nborder = "#222222"'
    // The header is skipped; the keys after it are still flat `key = value`
    // lines, so they are read too. Losing them would be worse than a
    // namespace collision we do not have.
    expect(parseToml(src).accent).toBe('#111111')
  })

  it('skips malformed lines rather than throwing', () => {
    const src = [
      'garbage',
      '= "no key"',
      'bad key = "spaces"',
      'unterminated = "oh no',
      'empty =',
      'accent = "#ff7a59"',
    ].join('\n')
    expect(parseToml(src)).toEqual({ accent: '#ff7a59' })
  })

  it('never throws, whatever it is handed', () => {
    const hostile: unknown[] = [
      '', '\0', '=', '"', "'", '#'.repeat(1000), 'a'.repeat(100000),
      '[[[[', 'a = "b" = "c"', '\n\n\n', null, undefined, 42, {}, [],
    ]
    for (const src of hostile) {
      expect(() => parseToml(src), String(src).slice(0, 20)).not.toThrow()
    }
  })

  it('returns an empty object for a non-string', () => {
    expect(parseToml(null)).toEqual({})
    expect(parseToml(undefined)).toEqual({})
    expect(parseToml(123)).toEqual({})
  })

  it('unescapes a basic string and leaves a literal string alone', () => {
    expect(parseToml('a = "x\\ty"').a).toBe('x\ty')
    expect(parseToml(`a = 'x\\ty'`).a).toBe('x\\ty')
  })

  it('takes the last value when a key repeats', () => {
    expect(parseToml('a = "1"\na = "2"').a).toBe('2')
  })

  // The point of the whole exercise: a real Omarchy file, pasted in.
  it('parses a real Omarchy colors.toml verbatim', () => {
    const src = `mode = "dark"

accent = "#faa968"
selection = "#134e5a"
muted = "#2a6b78"

background = "#05182e"
dark_background = "#031222"
darker_background = "#020c17"
lighter_background = "#0a2540"

foreground = "#f6dcac"
dark_foreground = "#3f8f8a"
light_foreground = "#a7c9c6"
bright_foreground = "#f6dcac"

red = "#f85525"
yellow = "#e97b3c"
orange = "#faa968"
green = "#028391"
cyan = "#8cbfb8"
blue = "#3f8f8a"
magenta = "#3f8f8a"
brown = "#743d1e"

bright_red = "#f85525"
bright_blue = "#faa968"
`
    const t = parseToml(src)
    expect(t.mode).toBe('dark')
    expect(t.background).toBe('#05182e')
    expect(t.foreground).toBe('#f6dcac')
    expect(t.bright_blue).toBe('#faa968')
    expect(Object.keys(t)).toHaveLength(22)
  })
})
