import {
  forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent,
} from 'react'
import type { Dir, Locale } from '../types'
import { promptKind } from './promptKind'

export type InputLineHandle = { focus(): void }

type Props = {
  prompt: string
  /** What language the child is typing. See the `lang` note on the box. */
  locale: Locale
  /**
   * The child's reading direction, from the locale — NOT `auto`.
   *
   * `dir="auto"` decides from the first strong character in the value, so an
   * EMPTY box has no strong character and falls back to LTR. In Hebrew that
   * meant the caret sat at the left edge of the line, the prompt and the box
   * disagreed about which end the line starts at, and the first letter typed
   * made the whole field jump across. Every Hebrew session began that way.
   * The locale already knows the answer, so it is passed in.
   */
  dir: Dir
  disabled: boolean
  /**
   * A WORD THE MACHINE IS TYPING FOR ITSELF.
   *
   * Non-null while the welcome demo is running (see `chrome/demoType.ts`).
   * It is the real prompt with a phantom at it, not a picture of one, so
   * what a child watches happen is exactly the thing they are about to do.
   *
   * IT ARRIVES AS THE PLACEHOLDER, and that is the whole trick. Showing it as
   * the VALUE was the obvious way and cost a keystroke every time: the box
   * had to go `readOnly` so the phantom could not be edited, and the key that
   * cancelled the demo was therefore also the key that got swallowed. As a
   * placeholder the box stays empty and fully live — the child's first letter
   * lands in it normally and hides the phantom by itself, and the terminal
   * cancels the demo on the same keystroke. Nothing is ever eaten.
   */
  ghost?: string | null
  onSubmit(text: string): void
}

export const InputLine = forwardRef<InputLineHandle, Props>(
  function InputLine({ prompt, dir, locale, disabled, ghost = null, onSubmit }, ref) {
    const box = useRef<HTMLTextAreaElement>(null)
    const [value, setValue] = useState('')
    const history = useRef<string[]>([])
    // -1 means "at the live line", 0 is the most recent entry.
    const cursor = useRef(-1)

    useImperativeHandle(ref, () => ({ focus: () => box.current?.focus() }))

    /**
     * A RUNNING GAME TAKES THE PROMPT OFF THE SCREEN.
     *
     * `disabled` means a live cartridge is running and owns every key, and
     * this line used to stay on screen at 40% opacity with a caret still
     * blinking in it. It looked exactly like somewhere to type, and it was
     * not: a grown-up trying to swap games by typing the next game's name got
     * no letters, no sound and no reason — the same shape of bug as a ladder
     * that swallowed two of the four arrow keys.
     *
     * Forty per cent opacity is not a message. The Kidtari has always removed
     * the prompt for a full-screen game; the other three machines keep the
     * transcript, so they kept the prompt too, and that is where the lie was.
     * Now every machine says the same thing, and the game's own hint line —
     * which ends `ESC done` — is what is on screen instead.
     *
     * The component stays MOUNTED (this is a null render, not an unmount), so
     * the ArrowUp history and the half-typed line survive the game and are
     * still there when it ends. `Terminal` refocuses the box on the commit
     * after a game exits, by which point it is back.
     */
    if (disabled) return null

    const grow = () => {
      const el = box.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }

    const setAndGrow = (v: string) => {
      setValue(v)
      queueMicrotask(grow)
    }

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const text = value.trim()
        if (!text) return
        history.current.unshift(text)
        cursor.current = -1
        setAndGrow('')
        onSubmit(text)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        cursor.current = -1
        setAndGrow('')
        return
      }

      if (e.key === 'ArrowUp') {
        if (cursor.current + 1 >= history.current.length) return
        e.preventDefault()
        cursor.current += 1
        setAndGrow(history.current[cursor.current]!)
        return
      }

      if (e.key === 'ArrowDown') {
        if (cursor.current < 0) return
        e.preventDefault()
        cursor.current -= 1
        setAndGrow(cursor.current < 0 ? '' : history.current[cursor.current]!)
      }
    }

    return (
      <div
        data-kb-input-line=""
        /* `kb-prose` on the ROW, so the machine's prompt in front of the box
           grows with the words the child is typing into it. */
        className="kb-prose kb:flex kb:gap-2 kb:items-start"
      >
        <span
          data-kb-prompt={promptKind(prompt)}
          dir="ltr"
          className="kb-glow kb:text-kb-prompt kb:font-bold kb:shrink-0"
        >
          {prompt}
        </span>
        <textarea
          ref={box}
          dir={dir}
          /*
           * Stated again on the box itself rather than left to inherit from
           * the frame. A form control is where `lang` actually earns its
           * keep — spelling, autocorrect and the platform's keyboard hint all
           * read it off the focused element, and an inherited value is not
           * something every engine looks up.
           */
          lang={locale}
          rows={1}
          value={value}
          placeholder={ghost ?? undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setAndGrow(e.target.value)}
          onKeyDown={onKeyDown}
          /*
           * `.kb-input` carries `font: inherit`, and that is the whole fix for
           * "the input does not use the machine's font".
           *
           * A `<textarea>` does NOT inherit type from its ancestors — the UA
           * stylesheet gives every form control its own `font: 400 13.33px
           * monospace` — so the frame's `--kb-font` never reached it. It used
           * to carry `kb:font-kb-mono` instead, which made it worse: that
           * resolves to the LITERAL JetBrains stack in `@theme`, so the box a
           * child types into was pinned to one machine's typeface while the
           * transcript above it changed with every machine. The Kidtari's
           * Silkscreen, the tube's VT323 and Fira Code were all visible
           * everywhere EXCEPT the one line the child was looking at.
           */
          className="kb-input kb:flex-1 kb:bg-transparent kb:border-0 kb:outline-none kb:resize-none kb:overflow-hidden kb:text-kb-plain"
          style={{ caretColor: 'var(--kb-prompt)' }}
        />
      </div>
    )
  },
)
