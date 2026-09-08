import type { EchoCartridge } from '../../types'
import en from './en.json'
import he from './he.json'

/**
 * Copy this folder, rename it, change the id, and you are done — the registry
 * picks it up automatically. There is no central file to edit.
 *
 * THE SIX RULES A COPY OF THIS FILE HAS TO LAND ON. Each one is a page in
 * src/cartridges/README.md; this is the short version, and it is short on
 * purpose.
 *
 * 1. SHAPES OR CHARACTERS, and the choice is not about being retro. Shapes
 *    (`rect`, `disc`, `sprite`, pixel coordinates) are for PICTURES: a ball, a
 *    maze, a fish. Characters (`put`, `text`, `box`, cell coordinates) are for
 *    CHARACTERS: a keyboard diagram, a card grid, falling words, anything
 *    whose content is language. `ball` and `maze` are the worked examples for
 *    the first; `piano` and `memory` for the second.
 *
 * 2. MONOCHROME. The theme's ground plus ONE ink, and `plain` is that ink —
 *    it is the terminal's own foreground, so it re-tints with the theme and
 *    can never clash with it. A second tone is earned by exactly one thing:
 *    marking what the CHILD controls (the key they pressed, the answer they
 *    got). Never a third, and never `rainbow` — a rainbow is every tone at
 *    once. Tell things apart by shape instead: solid versus hollow, big
 *    versus small, where it sits. src/invariants.test.ts enforces the count.
 *
 * 3. A ROUND ENDS WHEN THE CHILD SAYS IT ENDS. Nothing re-arms on a timer and
 *    nothing deals a new puzzle over a good moment. When something concludes,
 *    HOLD — leave the picture up — and carry on when the child presses a key
 *    or types a line. A `live` game that holds should ignore input for the
 *    first ~500 ms, so a key-masher does not blow straight through the beat.
 *
 * 4. SOUVENIRS ARE QUALITATIVE. There are no scores. `souvenir()` names what
 *    happened — "you played A S D F", "you found the cat and the rocket" —
 *    never how many times. Zero progress is the FIRST thing every child sees:
 *    return a warm fixed line or `''`, never a bare "0" and never a template
 *    with an empty gap in it.
 *
 * 5. DECLARE `locales` HONESTLY. No Hebrew? Say `['en']` and the cartridge is
 *    simply absent from Hebrew `help` — far better than showing a Hebrew
 *    reader English. See `rhyme`, which cannot have a Hebrew rhyme set.
 *
 * 6. HEBREW'S "AND" IS A GLUED PREFIX (ו), not a separate word. If you join a
 *    list, exactly ONE place may add the conjunction — the join function, and
 *    never a string it joins. Two places produced "the cat, and and more!" in
 *    English and, in Hebrew, the invisible "וועוד". Also: multi-line art is
 *    `{ kind: 'art' }`, NEVER `{ kind: 'text' }` — prose is bidi-reordered
 *    under Hebrew and would run your drawing backwards.
 *
 * One more thing that is easy to miss: the title on the collapsed transcript
 * row is your FIRST TRIGGER in the child's locale. Renaming or reordering
 * `triggers` changes what a child sees; put the word you want on that row
 * first.
 *
 * This template is an `echo` (type a word, get output) because that is the
 * smallest thing that works. For a typed conversation use `kind: 'turn'`
 * (`create`, `start`, `onLine`, `souvenir`), and for a real-time game
 * `kind: 'live'` (`size`, `hints`, `create`, `draw`). Both are documented in
 * src/cartridges/README.md and docs/CARTRIDGE-API.md.
 */
const cartridge: EchoCartridge = {
  kind: 'echo',
  apiVersion: 1,
  id: 'template',
  // Hebrew as literal characters, never a transliteration and never an
  // escape. The first word here is the one the transcript row will show.
  triggers: { en: ['template'], he: ['תבנית'], emoji: ['🧩'] },
  locales: ['en', 'he'],
  strings: { en, he },
  respond(ctx) {
    ctx.say([
      // `win` is the second tone, and it is here because this line is the
      // answer to what the child typed. Everything else is `plain`.
      { kind: 'text', text: ctx.t('template.hello'), tone: 'win', scale: 'giant' },
      // Multi-line drawing: `art`, never `text`.
      { kind: 'art', art: '  /\\_/\\\n ( o.o )', tone: 'plain' },
    ])
  },
}

export default cartridge
