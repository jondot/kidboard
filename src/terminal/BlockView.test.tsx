import { describe, it, expect, vi, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')
import { BlockView, ArtView, cellsWide, dirOf } from './BlockView'
import { TITLE } from '../cartridges/intro/card'
import { Boundary } from './Boundary'
import type { Block } from '../types'
import { EMPTY_FRAME } from '../types'

describe('ArtView', () => {
  /**
   * A drawing's SIZE. `spot`'s board is five emoji and `maze`'s is a thousand
   * canvas pixels; they are the same game to a child and were nowhere near the
   * same size on screen. Omitting `scale` still means "the machine's own type
   * size" — pinning every drawing to `kb-scale-normal`'s 1rem would be the
   * wrong size on a machine whose own type is 22px.
   */
  it('takes no scale class at all when none was asked for', () => {
    const { container } = render(<ArtView art={'ab'} />)
    expect(container.querySelector('pre')!.className).not.toMatch(/kb-scale-/)
  })

  it('takes no scale class for an explicit `normal` either', () => {
    const { container } = render(<ArtView art={'ab'} scale="normal" />)
    expect(container.querySelector('pre')!.className).not.toMatch(/kb-scale-/)
  })

  it('carries the scale it was given', () => {
    const { container } = render(<ArtView art={'ab'} scale="giant" />)
    expect(container.querySelector('pre')!.className).toContain('kb-scale-giant')
  })

  // A drawing is a GRID. The scale classes are built for a shout of prose and
  // set a weight and a looser line-height; a bold, loosely-set monospace face
  // re-spaces a grid and the picture comes apart.
  it('is never bold or loosely set, however large it is drawn', () => {
    expect(CSS).toMatch(/\.kb-art\.kb-scale-giant\s*\{[^}]*font-weight:\s*inherit/)
    const art = CSS.slice(CSS.indexOf('.kb-art {'))
    expect(art.slice(0, art.indexOf('}'))).toContain('line-height: 1.15')
  })

  /**
   * A drawing's scale is a MULTIPLE of the machine's own type. `.kb-scale-*`
   * are in `rem`, which would pin a drawing to 16px on a machine set in 22px —
   * the exact failure the comment above `ArtView` says the design avoids.
   */
  it('scales in em, so a machine set in 22px type gets a 22px-relative drawing', () => {
    for (const s of ['big', 'giant']) {
      const rule = CSS.match(new RegExp(`\\.kb-art\\.kb-scale-${s}\\s*\\{[^}]*\\}`))![0]
      expect(rule, s).toMatch(/--kb-art-size:\s*[\d.]+em/)
      expect(rule, s).not.toMatch(/rem/)
    }
  })

  /**
   * THE CLIPPING GUARD. Art is `white-space: pre` in a transcript that scrolls
   * vertically only, so a drawing wider than the terminal is not wrapped and
   * not scrolled — it is clipped, and the child loses the right of their own
   * picture. `spot` hit this the day it asked to be drawn `giant`.
   */
  it('publishes its own width so the stylesheet can clamp it to fit', () => {
    const { container } = render(<ArtView art={'abcd\nab'} />)
    expect(container.querySelector('pre')!.style.getPropertyValue('--kb-art-cells'))
      .toBe('4')
    expect(CSS).toContain('container-type: inline-size')
    const art = CSS.slice(CSS.indexOf('.kb-art {'))
    expect(art.slice(0, art.indexOf('\n}'))).toContain('100cqi')
  })

  it('counts an emoji as the two cells it actually occupies', () => {
    // Three fish are six cells wide, not three: `splitWide` exists because the
    // browser gives an emoji a double advance. Measuring characters here would
    // under-measure every emoji board by half and let it overflow anyway.
    expect(cellsWide('🐟🐟🐟')).toBe(6)
    expect(cellsWide('ab🐟')).toBe(4)
    expect(cellsWide('')).toBe(1)
  })


  it('always renders LTR with bidi isolation, even under rtl', () => {
    const { container } = render(<ArtView art={'  /\\_/\\\n ( o.o )'} />)
    const pre = container.querySelector('pre')!
    expect(pre.getAttribute('dir')).toBe('ltr')
    expect(pre.className).toContain('kb-art')
  })

  it('preserves art whitespace verbatim', () => {
    const art = '  a\n b'
    const { container } = render(<ArtView art={art} />)
    expect(container.querySelector('pre')!.textContent).toBe(art)
  })

  // memory draws its 4x4 grid through {kind:'art'}, so this is the path that
  // was drifting ~4px per revealed emoji in a real browser. Tokenizing the
  // emoji into 2ch spans fixes it without memory knowing anything about it.
  it('wraps each emoji grapheme in a 2ch cell without altering the art', () => {
    const art = '   1  2\n a  ? 🐟\n b 🐱  ?'
    const { container } = render(<ArtView art={art} />)
    expect(container.querySelector('pre')!.textContent).toBe(art)
    expect(container.querySelectorAll('.kb-cell2').length).toBe(2)
    expect([...container.querySelectorAll('.kb-cell2')].map((e) => e.textContent))
      .toEqual(['🐟', '🐱'])
  })

  it('leaves emoji-free art as it was', () => {
    const { container } = render(<ArtView art={'  /\\_/\\\n ( o.o )'} />)
    expect(container.querySelectorAll('.kb-cell2').length).toBe(0)
  })
})

describe('BlockView', () => {
  it('renders an echo block as prompt plus text', () => {
    const b: Block = { id: '1', kind: 'echo', prompt: 'type>', text: 'cat' }
    render(<BlockView block={b} dir="ltr" />)
    expect(screen.getByText('type>')).toBeTruthy()
    expect(screen.getByText('cat')).toBeTruthy()
  })

  it('renders user text as a text node, never as markup', () => {
    const b: Block = {
      id: '1', kind: 'echo', prompt: 'type>', text: '<img src=x onerror=1>',
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=1>')
  })

  it('marks prose dir=auto so mixed-script lines read correctly', () => {
    const b: Block = {
      id: '1', kind: 'static', spec: { kind: 'text', text: 'שלום cat' },
    }
    const { container } = render(<BlockView block={b} dir="rtl" />)
    expect(container.querySelector('[dir="auto"]')).toBeTruthy()
  })

  it('applies tone and scale classes', () => {
    const b: Block = {
      id: '1', kind: 'static',
      spec: { kind: 'text', text: 'hi', tone: 'magic', scale: 'giant' },
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    const el = container.querySelector('[dir="auto"]')!
    expect(el.className).toContain('kb-tone-magic')
    expect(el.className).toContain('kb-scale-giant')
  })

  it('renders a collapsed live block as a single souvenir row', () => {
    const b: Block = {
      id: '1', kind: 'live', cartridgeId: 'ball', title: 'bounce',
      state: 'collapsed', frame: EMPTY_FRAME, souvenir: '14 bounces!',
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    expect(container.textContent).toContain('bounce')
    expect(container.textContent).toContain('14 bounces!')
    expect(container.querySelector('pre')).toBeNull()
  })

  /**
   * I7. `piano` and `story` legitimately return `''` at zero progress — the
   * template and both docs sanction it, and the frozen block's own souvenir
   * line already guards for it a few lines down in BlockView. The collapsed
   * row did not, so it read "piano —  ▸", and "פסנתר — ▸" in Hebrew: a dash
   * pointing at nothing.
   */
  it('drops the dash when a collapsed block has no souvenir to show', () => {
    for (const title of ['piano', 'פסנתר']) {
      const b: Block = {
        id: '1', kind: 'live', cartridgeId: 'piano', title,
        state: 'collapsed', frame: EMPTY_FRAME, souvenir: '',
      }
      const { container } = render(<BlockView block={b} dir="ltr" />)
      expect(container.textContent).toContain(title)
      expect(container.textContent, `a dangling dash under ${title}`)
        .not.toContain('—')
    }
  })

  // jsdom has no 2D context, so a live block renders through GameCanvas's DOM
  // fallback here — which is exactly the path a browser without canvas takes,
  // and the reason a missing context is never an error a child can see.
  it('renders a running live block as a frame', () => {
    const b: Block = {
      id: '1', kind: 'live', cartridgeId: 'ball', title: 'bounce',
      state: 'running',
      frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
      souvenir: '',
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    expect(container.querySelector('[data-kb-game]')).toBeTruthy()
    expect(container.querySelector('pre')!.textContent).toBe('o')
  })

  // A live game wears exactly ONE frame, and it is its own.
  //
  // S3 removed the card rounding and padding but kept a hairline bezel on the
  // wrapper. The wrapper is the full width of the transcript; the canvas is
  // too, and every game centres a field-shaped STAGE inside it (see
  // `cartridges/stage.ts`) and draws its own court border at the stage edge.
  // So the bezel was a second frame enclosing the empty margins either side
  // of the court — two nested frames with dead space between them, in `ball`
  // (wide margins) and `maze` (walls at the stage edge) alike.
  //
  // The court is the screen. No bezel: the border the child sees is the one
  // the game drew, and it re-tints with the theme because it is a tone.
  it('gives a live game no frame of its own — the court it draws IS the screen', () => {
    const b: Block = {
      id: '1', kind: 'live', cartridgeId: 'ball', title: 'bounce',
      state: 'running',
      frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
      souvenir: '',
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    const wrapper = container.querySelector('[data-kb-game]')!.parentElement!
    expect(wrapper.className).not.toMatch(/kb:border/)
    expect(wrapper.className).not.toMatch(/kb:rounded/)
    expect(wrapper.className).not.toMatch(/kb:p-\d/)
  })

  /**
   * `hoistLive`. Three of the four systems draw the running game somewhere
   * other than where the transcript sits — full screen, in a field, in a pane
   * — so the shell paints it and the transcript must not paint it twice.
   *
   * A STILL IS SCROLLBACK. `frozen` and `collapsed` are untouched by the flag:
   * whatever a system does with a running game, a finished one belongs in the
   * transcript, wherever the transcript is.
   */
  describe('hoistLive', () => {
    const live = (state: 'running' | 'frozen' | 'collapsed'): Block => ({
      id: '1', kind: 'live', cartridgeId: 'ball', title: 'bounce', state,
      frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
      souvenir: '14 bounces!',
    })

    it('renders nothing for a RUNNING block when the shell paints the game', () => {
      const { container } = render(
        <BlockView block={live('running')} dir="ltr" hoistLive />,
      )
      expect(container.innerHTML).toBe('')
    })

    it('still renders a frozen still — a still is scrollback', () => {
      const { container } = render(
        <BlockView block={live('frozen')} dir="ltr" hoistLive />,
      )
      expect(container.querySelector('[data-kb-game]')).toBeTruthy()
      expect(container.textContent).toContain('14 bounces!')
    })

    it('still renders a collapsed row', () => {
      const { container } = render(
        <BlockView block={live('collapsed')} dir="ltr" hoistLive />,
      )
      expect(container.textContent).toContain('bounce')
    })

    it('paints the running game inline when the prop is omitted', () => {
      const { container } = render(<BlockView block={live('running')} dir="ltr" />)
      expect(container.querySelector('[data-kb-game]')).toBeTruthy()
    })
  })

  // Frozen is marked by dimming alone, which is what already told a
  // finished-but-not-yet-collapsed game apart. Removing the bezel must not
  // touch that, nor the souvenir line under it.
  it('keeps the frozen dimming and the souvenir line', () => {
    const b: Block = {
      id: '1', kind: 'live', cartridgeId: 'ball', title: 'bounce',
      state: 'frozen',
      frame: { cmds: [{ op: 'put', x: 0, y: 0, ch: 'o', tone: 'warm' }], w: 1, h: 1 },
      souvenir: '14 bounces!',
    }
    const { container } = render(<BlockView block={b} dir="ltr" />)
    const wrapper = container.querySelector('[data-kb-game]')!.parentElement!
    expect(wrapper.className).toContain('kb:opacity-70')
    expect(wrapper.className).not.toMatch(/kb:rounded/)
    expect(wrapper.className).not.toMatch(/kb:p-\d/)
    expect(container.textContent).toContain('14 bounces!')
  })
})

// A render-time throw would otherwise unmount the whole app and leave a
// six-year-old looking at a blank white page — the one error state this
// project promises never to show.
describe('Boundary', () => {
  const Boom = (): never => { throw new Error('render exploded') }

  it('shows one warm line instead of a blank page, in the child\'s language', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<Boundary locale="he"><Boom /></Boundary>)
    expect(container.textContent).toContain('אופס')
    for (const bad of ['Error', 'exploded', 'undefined', 'stack']) {
      expect(container.textContent).not.toContain(bad)
    }
    spy.mockRestore()
  })

  it('renders its children untouched when nothing throws', () => {
    const { container } = render(<Boundary locale="en"><span>hi</span></Boundary>)
    expect(container.textContent).toBe('hi')
  })
})


/**
 * SHIPPED BUG: in a Hebrew session, a reply made only of emoji sat hard
 * against the LEFT edge while every other line sat on the right.
 *
 * `dir="auto"` does not mean "use the page's direction". It means "take the
 * direction of the first STRONG character, and if there is not one, use
 * left-to-right". Emoji, digits, spaces and punctuation are all neutral — so
 * a line like `🐦🐦🐦` has no opinion at all and `auto` answered LTR every
 * time, in every language. Measured in a real Chromium before this was
 * written: the emoji row's computed direction was `ltr` at x=16 while the
 * lines around it sat at x=1225 in a 1260px-wide Hebrew session.
 */
describe('a line with no direction of its own takes the session\'s', () => {
  const EMOJI_ONLY = ['🐦🐦🐦', '🎈', '⭐ ⭐ ⭐', '123', '!!!', '  ']

  it('hands an emoji-only line the reading direction of the session', () => {
    for (const text of EMOJI_ONLY) {
      expect(dirOf(text, 'rtl'), `"${text}" under Hebrew`).toBe('rtl')
      expect(dirOf(text, 'ltr'), `"${text}" under English`).toBe('ltr')
    }
  })

  // …and leaves `auto` alone wherever it has something to go on. A Hebrew
  // child who types `cat` must still see `cat` read left to right.
  it('still asks the text itself when the text has an opinion', () => {
    for (const text of ['cat', 'שלום', '🐱 cat', '🐱 חתול', 'a']) {
      expect(dirOf(text, 'rtl'), `"${text}"`).toBe('auto')
      expect(dirOf(text, 'ltr'), `"${text}"`).toBe('auto')
    }
  })

  it('puts it on the block a child actually reads', () => {
    const block: Block = {
      id: '1', kind: 'static', spec: { kind: 'text', text: '🐦🐦🐦' },
    }
    const { container } = render(<BlockView block={block} dir="rtl" />)
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy()
    expect(container.querySelector('[dir="auto"]')).toBeNull()
  })

  it('and on the echo of what the child typed', () => {
    const block: Block = { id: '1', kind: 'echo', prompt: '>', text: '🎈' }
    const { container } = render(<BlockView block={block} dir="rtl" />)
    const said = container.querySelector('.kb\\:text-kb-plain')
      ?? container.querySelectorAll('span')[1]
    expect(said?.getAttribute('dir')).toBe('rtl')
  })
})


/**
 * READ THIS OUT LOUD. A six-year-old learning to read gets stuck on a word
 * with nobody beside them; this is the machine offering to say it, one line
 * at a time, never automatically.
 */
describe('the speaker on a line the machine said', () => {
  const spoken: { text: string; lang: string }[] = []
  let cancels = 0

  const fitSpeech = (): void => {
    class Utterance {
      text: string
      lang = ''
      rate = 1
      pitch = 1
      onend: (() => void) | undefined
      onerror: (() => void) | undefined
      constructor(text: string) { this.text = text }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true, writable: true, value: Utterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      writable: true,
      value: {
        speaking: false,
        getVoices: () => [],
        cancel: () => { cancels += 1 },
        speak: (u: { text: string; lang: string }) => { spoken.push(u) },
      },
    })
  }

  const said = (text: string): Block =>
    ({ id: '1', kind: 'static', spec: { kind: 'text', text } })

  afterEach(() => {
    spoken.length = 0
    cancels = 0
    localStorage.clear()
    Reflect.deleteProperty(window, 'speechSynthesis')
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
  })

  // ABSENT, NEVER DEAD. A browser with no Web Speech API gets no speaker at
  // all — the same rule as the prompt a running game takes off the screen.
  it('is not there at all on a browser that cannot speak', () => {
    render(<BlockView block={said('here is a cat')} dir="ltr" locale="en" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appears on a line with words in it', () => {
    fitSpeech()
    render(<BlockView block={said('here is a cat')} dir="ltr" locale="en" />)
    expect(screen.getByRole('button', { name: /out loud/i })).toBeTruthy()
  })

  // A row of emoji is a picture. "dog face dog face dog face" is a worse
  // answer than silence.
  it('stays away from a line that is only a picture', () => {
    fitSpeech()
    render(<BlockView block={said('🐦🐦🐦')} dir="ltr" locale="en" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says the line, in the language of the session', async () => {
    fitSpeech()
    const u = userEvent.setup()
    render(<BlockView block={said('הנה חתול')} dir="rtl" locale="he" />)
    await u.click(screen.getByRole('button'))
    expect(spoken).toHaveLength(1)
    expect(spoken[0]!.text).toBe('הנה חתול')
    expect(spoken[0]!.lang).toBe('he-IL')
  })

  it('stops when it is pressed again', async () => {
    fitSpeech()
    const u = userEvent.setup()
    render(<BlockView block={said('here is a cat')} dir="ltr" locale="en" />)
    const btn = screen.getByRole('button')
    await u.click(btn)
    expect(btn.hasAttribute('data-kb-saying')).toBe(true)
    await u.click(btn)
    expect(btn.hasAttribute('data-kb-saying')).toBe(false)
    expect(spoken, 'a second press started it again').toHaveLength(1)
  })

  // The label is the only text in the chrome that has to be a WORD, so it
  // comes out of the catalog like every other one.
  it('names itself in the child\'s own language', () => {
    fitSpeech()
    const { rerender } = render(
      <BlockView block={said('cat')} dir="ltr" locale="en" />,
    )
    const en = screen.getByRole('button').getAttribute('aria-label')
    rerender(<BlockView block={said('cat')} dir="rtl" locale="he" />)
    const he = screen.getByRole('button').getAttribute('aria-label')
    expect(en).toBeTruthy()
    expect(he).toBeTruthy()
    expect(he).not.toBe(en)
  })

  /**
   * A muted machine is hidden by `--kb-speak`, which is presentation — but
   * presentation is not a lock, so the module refuses as well. Both are
   * needed: one keeps the control off the screen, the other makes sure that
   * reaching it anyway still says nothing.
   */
  it('says nothing on a machine whose sound is off, however it is reached', async () => {
    fitSpeech()
    localStorage.setItem('kb.muted', '1')
    const u = userEvent.setup()
    render(<BlockView block={said('here is a cat')} dir="ltr" locale="en" />)
    await u.click(screen.getByRole('button'))
    expect(spoken).toHaveLength(0)
    expect(CSS).toContain('display: var(--kb-speak, inline-flex)')
  })
})


/**
 * A DRAWING MADE ONLY OF BLOCK ELEMENTS IS A BITMAP, AND A BITMAP MUST TILE.
 *
 * `.kb-art` carries 15% of leading, which is right for a drawing with letters
 * or emoji in it and wrong for a solid one: 15% of white across every row of
 * a five-row block letter turns it into five stripes. `intro`'s marquee
 * shipped that way and read as a barcode — caught at four times magnification
 * in a real browser, which is the only place it is visible at all.
 */
describe('a bitmap drawing tiles, and everything else keeps its air', () => {
  const solid = (art: string): boolean => {
    const { container } = render(<ArtView art={art} />)
    const on = container.querySelector('.kb-art')!.classList.contains('kb-art-solid')
    cleanup()
    return on
  }

  it('tiles a drawing made only of blocks', () => {
    expect(solid(TITLE)).toBe(true)
    expect(solid('███\n█ █\n███')).toBe(true)
    // The half-blocks a cart label is drawn in, which are the same case.
    expect(solid('▛▀▜\n▌ ▐\n▙▄▟')).toBe(true)
  })

  it('leaves a drawing with anything else in it alone', () => {
    expect(solid(' /\\_/\\ \n( o.o )'), 'an ascii cat').toBe(false)
    expect(solid('🐱🐱🐱'), 'an emoji board').toBe(false)
    expect(solid('┌───┐\n│ a │\n└───┘'), 'box drawing with a letter').toBe(false)
    expect(solid('███ A'), 'one letter is enough to want the air').toBe(false)
  })

  it('says so in the stylesheet, where the line-height actually lives', () => {
    expect(CSS).toContain('.kb-art.kb-art-solid { line-height: 1; }')
  })
})


/**
 * A PROMPT AND THE WORD AFTER IT ARE ONE LINE, so they take one type size.
 *
 * SHIPPED BUG: `kb-prose` — the class the text-size setting reaches — was on
 * the echo's text span rather than on its row, so at any size but the default
 * the machine's own prompt stayed put while the word beside it grew. Measured
 * in a real Chromium at `bigger`: `מוכן` at 18px next to `חתול` at 31px, two
 * type sizes on one line of one sentence.
 *
 * jsdom has no cascade to measure, so what is asserted here is the SHAPE of
 * the fix — that every prompt sits inside the element the size lands on, the
 * same way `artAlign.test.tsx` asserts where alignment has to live.
 */
describe('a prompt is the same size as the words beside it', () => {
  const rows: Block[] = [
    { id: '1', kind: 'echo', prompt: 'READY', text: 'cat' },
    { id: '2', kind: 'echo', prompt: '❯', text: 'חתול' },
  ]

  it('puts the size on the row, so the prompt grows with the word', () => {
    for (const block of rows) {
      const { container } = render(<BlockView block={block} dir="ltr" locale="en" />)
      const mark = container.querySelector('[data-kb-prompt]')!
      expect(mark, `${block.kind}: no prompt drawn`).toBeTruthy()
      expect(
        mark.closest('.kb-prose'),
        'the prompt is outside the element the text size reaches',
      ).toBeTruthy()
      cleanup()
    }
  })

  it('never puts it on the words alone, which is what came apart', () => {
    const { container } = render(
      <BlockView block={rows[0]!} dir="ltr" locale="en" />,
    )
    const proses = container.querySelectorAll('.kb-prose')
    expect(proses).toHaveLength(1)
    expect(proses[0]!.querySelector('[data-kb-prompt]'),
      'the size landed below the prompt rather than above it').toBeTruthy()
  })
})
