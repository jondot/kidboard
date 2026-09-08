import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputLine } from './InputLine'

const setup = () => {
  const onSubmit = vi.fn()
  render(<InputLine prompt="type>" dir="ltr" locale="en" disabled={false} onSubmit={onSubmit} />)
  return { onSubmit, box: screen.getByRole('textbox') as HTMLTextAreaElement }
}

describe('InputLine', () => {
  it('submits on Enter and clears', async () => {
    const u = userEvent.setup()
    const { onSubmit, box } = setup()
    await u.type(box, 'cat{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('cat')
    expect(box.value).toBe('')
  })

  it('does not submit empty or whitespace-only input', async () => {
    const u = userEvent.setup()
    const { onSubmit, box } = setup()
    await u.type(box, '   {Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('inserts a newline on Shift+Enter without submitting', async () => {
    const u = userEvent.setup()
    const { onSubmit, box } = setup()
    await u.type(box, 'a{Shift>}{Enter}{/Shift}b')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(box.value).toBe('a\nb')
  })

  it('walks history with ArrowUp and ArrowDown', async () => {
    const u = userEvent.setup()
    const { box } = setup()
    await u.type(box, 'cat{Enter}')
    await u.type(box, 'dog{Enter}')
    await u.type(box, '{ArrowUp}')
    expect(box.value).toBe('dog')
    await u.type(box, '{ArrowUp}')
    expect(box.value).toBe('cat')
    await u.type(box, '{ArrowDown}')
    expect(box.value).toBe('dog')
    await u.type(box, '{ArrowDown}')
    expect(box.value).toBe('')
  })

  it('clears the line on Escape', async () => {
    const u = userEvent.setup()
    const { box } = setup()
    await u.type(box, 'abc{Escape}')
    expect(box.value).toBe('')
  })

  /**
   * A PROMPT NOBODY CAN TYPE INTO IS NOT DRAWN AT ALL.
   *
   * `disabled` means a live cartridge is running and owns every key. This line
   * used to stay on screen at 40% opacity with the caret still blinking in it,
   * which is not a message — it is a prompt that looks like a prompt and
   * answers nothing. A grown-up trying to swap games by typing the next
   * game's name got no letters, no sound and no reason at all.
   *
   * The Kidtari has always removed the prompt for a full-screen game. The other
   * three machines keep the transcript, so they kept the prompt too, and that
   * is where the lie lived. Now every machine agrees, and the game's own hint
   * line — which ends `ESC done` — is what is on screen instead.
   */
  it('takes itself off the screen while a game has the keyboard', () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <InputLine prompt="type>" dir="ltr" locale="en" disabled onSubmit={onSubmit} />,
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(container.querySelector('[data-kb-input-line]')).toBeNull()
    expect(container.textContent).toBe('')
  })

  /**
   * And it is a NULL RENDER, not an unmount: the component stays mounted
   * through the game, so the half-typed line and the ArrowUp history are
   * still there when the game ends. A child who was midway through a word
   * when they started a game does not lose it.
   */
  it('still has its history when the game gives the keyboard back', async () => {
    const u = userEvent.setup()
    const onSubmit = vi.fn()
    const view = render(
      <InputLine prompt="type>" dir="ltr" locale="en" disabled={false} onSubmit={onSubmit} />,
    )
    await u.type(screen.getByRole('textbox'), 'cat{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('cat')

    view.rerender(<InputLine prompt="type>" dir="ltr" locale="en" disabled onSubmit={onSubmit} />)
    expect(screen.queryByRole('textbox')).toBeNull()

    view.rerender(
      <InputLine prompt="type>" dir="ltr" locale="en" disabled={false} onSubmit={onSubmit} />,
    )
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await u.click(box)
    await u.keyboard('{ArrowUp}')
    expect(box.value, 'the history did not survive the game').toBe('cat')
  })

  /**
   * `dir="auto"` decides from the first strong character in the VALUE, so an
   * empty box has none and falls back to left-to-right. In Hebrew that put the
   * caret at the wrong end of the line, made the prompt and the box disagree
   * about where the line starts, and threw the whole field across the moment a
   * letter was typed. Every Hebrew session began that way. The locale already
   * knows the answer, so it is passed in.
   */
  it('takes the reading direction from the locale, never from the value', () => {
    const onSubmit = vi.fn()
    render(<InputLine prompt="מוכן" dir="rtl" locale="en" disabled={false} onSubmit={onSubmit} />)
    const box = screen.getByRole('textbox')
    expect(box.getAttribute('dir')).toBe('rtl')
  })

  /**
   * A `<textarea>` does not inherit type from its ancestors — every UA
   * stylesheet gives form controls their own `font: 400 13.33px monospace` —
   * so the machine's `--kb-font` reached every character on screen EXCEPT the
   * ones a child was typing. `.kb-input` carries `font: inherit`, and jsdom
   * computes no fonts, so the class is what is asserted and `styles.css` is
   * where the declaration is checked.
   */
  it('carries the class that lets the machine\'s typeface reach it', () => {
    const { box } = setup()
    expect(box.classList.contains('kb-input')).toBe(true)
    // The old spelling pinned the box to ONE machine's typeface: `font-kb-mono`
    // resolves to the literal JetBrains stack, so the Kidtari's Silkscreen and
    // the tube's VT323 were visible everywhere except the line being typed on.
    expect(box.className).not.toContain('font-kb-mono')
  })

  /** The prompt is a sigil, and it is drawn as itself in both languages. */
  it('marks the prompt so a machine can style it without forking this file', () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <InputLine prompt="READY" dir="rtl" locale="en" disabled={false} onSubmit={onSubmit} />,
    )
    const prompt = container.querySelector('[data-kb-prompt]')!
    expect(prompt.textContent).toBe('READY')
    expect(prompt.getAttribute('dir')).toBe('ltr')
  })
})


/**
 * `dir` says which way the words run; `lang` says what the words ARE. Three
 * different things read it off a form control: a screen reader, so Hebrew is
 * pronounced rather than spelled out as Latin; the browser's own spelling and
 * autocorrect, which otherwise fight a five-year-old's Hebrew; and the
 * platform's keyboard, as a hint — honoured by some Android IMEs, ignored by
 * iOS, which picks from the keyboards the child has installed.
 */
describe('the box says what language is being typed into it', () => {
  it('carries the session language, not the direction', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <InputLine prompt="❯" dir="ltr" locale="en" disabled={false} onSubmit={onSubmit} />,
    )
    expect(screen.getByRole('textbox').getAttribute('lang')).toBe('en')

    rerender(
      <InputLine prompt="❯" dir="rtl" locale="he" disabled={false} onSubmit={onSubmit} />,
    )
    expect(screen.getByRole('textbox').getAttribute('lang')).toBe('he')
  })
})
