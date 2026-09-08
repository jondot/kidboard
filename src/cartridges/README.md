# Add your own idea

Every idea is one folder. Drop it in, it registers itself, it shows up in `help`.

```bash
cp -r src/cartridges/_template src/cartridges/mygame
```

Then edit `cartridge.ts`: change the `id` to `mygame`, change the `triggers`,
write your `respond`. Put your text in `en.json` / `he.json` and read it with
`ctx.t('your.key')`. That is the whole process — there is no central file to
edit and no registration step.

**Your FIRST trigger is the name a child sees.** The title on the collapsed
transcript row is `triggers[<the child's locale>][0]` — never the `id`, and
there is nothing to override. The fallback chain, in `titleFor`
(`src/runtime/session.ts`), is: this locale's first trigger → the other
locale's first trigger → the first emoji trigger → the `id`, as a last resort
so the row is never blank. So **order matters** (`{ en: ['piano', 'music'] }`
shows *piano*; swap them and it shows *music*), and **renaming a trigger
renames the game** in every transcript a child looks back at. That is why
`fish` shows *aquarium* and `snake` shows *נחשים*: a child who typed
"aquarium" must never find "fish" in their own history.

## Three shapes

**`echo`** — type a word, get output. Most ideas are this.

```ts
respond(ctx) {
  ctx.say([{ kind: 'text', text: ctx.t('mygame.hi'), tone: 'win' }])
}
```

**`turn`** — a typed conversation that remembers things between lines.
`ESC` and `quit` always exit; you do not handle that.

```ts
create(ctx) {
  let answer = ''
  return {
    start: () => ctx.say([{ kind: 'text', text: ctx.t('mygame.ask') }]),
    onLine: (text) => { answer = text; ctx.exit() },
    souvenir: () => answer,
  }
}
```

**`live`** — a real-time game with a character canvas. `ESC` freezes the last
frame and exits; you do not handle that either. `size` and `hints` are
required alongside `create`:

```ts
// Columns and an aspect ratio — never pixels, never a fixed box. Rows follow
// (round(cols * 0.6 / aspect)); a wide screen gets MORE COLUMNS, not bigger
// cells, so read c.w / c.h every frame instead of hard-coding 30 and 18.
// `aspect: 1` is the house default for a game that draws shapes — see "The
// house style" below for why, and for the six lines that go with it.
size: { cols: 30, aspect: 1 },
// Do NOT declare an ESC hint — the shell appends one for you.
hints: (t) => [{ keys: '← →', label: t('mygame.move') }],
create(ctx) {
  let x = 5
  let speed = 8               // cells per second, never per frame
  return {
    onKey: (k) => {
      if (k.key === 'ArrowLeft') x -= 1
      if (k.key === 'ArrowRight') x += 1
    },
    // dt is real elapsed seconds, at the display's refresh rate. Omit tick
    // entirely if you only react to keys.
    tick: (dt) => { x += speed * dt },
    draw: (c) => {
      c.clear()
      c.box(0, 0, c.w, c.h, 'plain')  // fills whatever width you were given
      c.put(x, 3, 'o', 'plain')       // x may be 12.4 — that is the point
      // Never c.text(1, c.h - 1, `${x}`, ...) here — no bare number is ever
      // painted on a game's canvas. See "Souvenirs" below.
    },
    souvenir: () => (x <= 5 ? '' : t('mygame.souvenir')),
  }
}
```

## Two ways to draw: characters and shapes

A game draws with **characters** on the cell grid, with **shapes** in the pixel
field, or with both. Pick whichever fits what you are drawing — and when ASCII
is the right fit, ASCII is the right fit.

- **Characters** (`put`, `text`, `box`, `emoji`) take CELL coordinates. Right
  for letters, words, emoji, prompts and deliberate ASCII art.
- **Shapes** (`rect`, `outline`, `line`, `disc`, `circle`, `sprite`) take
  PIXEL coordinates. Right for anything that is a *picture*: a paddle, a
  court, maze walls, stars, a fish.

**Every cell is 8 x 8 logical pixels.** `c.pw` and `c.ph` are the field
(`c.w * 8` by `c.h * 8`) and, like `c.w` / `c.h`, they are live — read them
every frame.

A logical pixel is a cell, so it is taller than it is wide (by 1/0.6). A
visually square block is about 5 pixels wide by 3 tall. `disc(x, y, r)` takes
`r` as the *horizontal* radius and squashes the vertical one for you, so a
circle looks round.

```ts
// A paddle game, entire. Three flat shapes, one ink, no glyphs. (`ball` draws
// into a centred stage rather than the whole field — see "The house style".)
draw: (c) => {
  c.clear()
  c.outline(0, 0, c.pw, c.ph, 'plain', 3)    // a thick, HOLLOW court rail
  c.rect(paddleX, c.ph - 22, 64, 8, 'plain') // a SOLID bar; paddleX may be 91.4
  c.disc(ballX, ballY, 9, 'plain')           // a SOLID blocky ball
}
```

### Sprites

A sprite is an array of strings, written inline where anyone can read it:

```ts
const FISH = [
  '  ##   ',
  ' ##### ',
  '#######',
  ' ##### ',
  '  ##   ',
]

draw: (c) => {
  c.clear()
  // One bitmap, both directions: flipX mirrors it.
  c.sprite(x, y, FISH, 'plain', { flipX: goingLeft })
  c.sprite(x2, y2, FISH, 'plain', { flipY: true, scale: 2 })  // twice as big
}
```

**Any character is a lit pixel; only a space is off.** Use `#`, `o`, `<` —
whatever makes the picture readable in the source. Watch out for `.`: it is a
character, so a row of dots is a solid bar, not a gap. Ragged rows are padded
to the widest row, so mirroring reflects the picture you drew.

## The house style for a game that draws shapes

Five rules. Follow them and your game will look like the others without your
having to have an eye for it. `ball`, `snake`, `catch`, `maze`, `pop`, `fish`,
`stars`, `draw`, `drum`, `simon` and `mole` are the worked examples — read any
of them. (`maze` and `simon` are the two to read first: `maze` for a world
made of flat shapes, `simon` for telling four things apart without a colour.)

### 1. A play field is FIELD-shaped, never a slot

Rows are fixed by the `aspect` you declare, and a wide screen hands you extra
**columns**. So the canvas only ever gets *wider* than you asked for, and a
court drawn edge to edge on a desktop turns into a 3:1 horizon.

**Declare `size: { cols: 30, aspect: 1 }`** — square at the declared width,
which is what buys the height a 4:3 field needs once the screen gets wide —
**and draw into a centred STAGE rather than into the whole field. There is one
`stageOf`, shared, in `src/cartridges/stage.ts`:**

```ts
import { sameStage, stageOf } from '../stage'

// In `create`, before anything else:
let stage = stageOf(30 * 8, 18 * 8)      // a stage exists before the first draw

// …and at the top of `draw`, every frame:
const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
if (!sameStage(s, stage)) { stage = s; /* re-lay anything that depends on it */ }
```

`stageOf(pw, ph)` returns the largest centred rectangle of the pixel field
whose ON-SCREEN proportions stay between 3:4 and 4:3 — a logical pixel is 0.6
as wide as it is tall, so a `pw x ph` block reads as `0.6 * pw : ph`, and that
conversion lives in exactly one place now rather than in a copy per game. Pass
your own `{ min, max }` third argument if your picture is genuinely another
shape (`rocket` wants a tall screen, `robot` a square one).

The module is plain arithmetic — no DOM, no React, no state — so importing it
keeps your cartridge the "plain data and functions" a sandbox can host, and it
re-exports `PIXEL_ASPECT` so you need one import rather than two.

Simulate in stage coordinates and add `stage.x` / `stage.y` once, in `draw`.
On a phone the stage *is* the canvas; on a desktop your game settles at a
640 x 480 screen in the middle of the terminal with the theme's ground either
side, the way a 4:3 game sits in a wide television. **Never let a play field
go past 4:3 in either direction.**

### 2. MONOCHROME: the theme's ground, plus one ink

**This rule binds every cartridge, not just the ones that draw shapes.** It
governs `tone` on a canvas op and `tone` on a `ctx.say` block alike.

**Use `plain`.** It is the theme's own foreground — the ink the terminal
writes its prose in — so it re-tints with the theme and can never clash with
it. Pong was white on black, and that constraint is most of why those games
look like machines rather than colouring books.

**A second tone is earned by one thing only: telling what the child CONTROLS,
or what the child just DID, from everything around it — and only after shape
has been tried and failed.** There is never a third, and **never
`rainbow: true`**, which is every tone at once.

The six text cartridges all landed on the same pair: `plain` for the world and
`win` for the one block that belongs to the child — the pair they matched, the
count they got, the story they made, the key they just pressed.

`src/invariants.test.ts` now enforces the count for every cartridge: at most
two distinct tones, and if there are two, one must be `plain`. It cannot judge
*which* second tone you chose, only that there is at most one.

Shape does the job better than a second colour, and there are four levers —
reach for them in this order: **fill** (solid vs hollow), **size**, **shape**,
**position**.

| the question | the answer, which is not colour |
|---|---|
| the world vs a thing | the world is **hollow** (`outline`, `circle`); things are **solid** (`rect`, `disc`) |
| the snake vs its fruit | squares vs a round thing with a stalk |
| the snake's head vs its body | the head keeps its whole square; body blocks are trimmed a pixel |
| the child vs their home | a solid figure vs a hollow house, the same size |
| a balloon vs its letter | the balloon is a ring, so the letter shows through it |
| a bump, a burst, a cheer | a **ring** — hollow, so it can never be mistaken for a piece of the game |
| a question vs an answer, in prose | `scale: 'big'` on the question — **size**, not hue |
| where a thing sits in a grid | **position**, plus a header row of coordinates |

If you are reaching for a colour, you are usually one bitmap — or one `scale`
— away from a better picture.

**Emoji are the exception, and only in the text idiom.** An emoji carries its
own colours and no tone can re-tint it. Inside a `{ kind: 'art' }` block that
is exactly the point: `memory`'s cards, `count`'s ducks and `spot`'s row are
pictures made of emoji, with a single ink around them. On a canvas of flat
single-tone shapes an emoji IS a second palette, and the invariant counts it
as its own tone.

### 3. Make it big enough for a six-year-old

| | at least | why |
|---|---|---|
| a wall or rail | `3` px thick | thinner is a hairline at phone cell sizes |
| the thing that moves | `10` px across, and more than 3% of the field's width | a speck adrift in a court is not a ball |
| the thing the child steers | more than `10%` of the field's width | findable at a glance |
| a lattice square (snake, maze) | `16 x 10` px | reads as a square; 32 CSS px on a desktop |
| a maze corridor | `28 x 17` px | a 9 x 7 maze a child can see the shape of beats a 13 x 9 one |
| a bitmap of a *thing* | `11 x 7` source pixels **at `{ scale: 2 }`** | doubling is free, unmistakably pixel art, twice as legible |

### 4. A round ends when the CHILD says it ends

**Nothing re-arms on a timer.** When something concludes — a ball missed, a
snake bumped, a maze walked home — the game **holds**, shows what happened,
and waits for a key press. A still picture is not dead air; it is the beat in
which a small child works out what happened and decides to go again. A game
that restarts itself the instant something ends is a stampede.

- `ball` puts the ball back **on the paddle** and rides it there. The picture
  says what will happen without a word in any language.
- `snake` stops and leaves the bump ring on the board.
- `maze` holds the party on the doorstep; the next key asks for a new maze.
- A game with no ending (`catch`, `pop`) has a **rhythm** instead: an empty
  screen for the first beat, then one thing every couple of seconds, and only
  a handful on screen at once.

**Any key resumes.** Never a key a child has to be told about, and never a
state a child can be stuck in.

**Ignore input for the first ~500 ms of a hold.** A child mashing a key, or
just holding one down, will otherwise blow straight through the moment the
hold exists to give them: the ball is missed and re-served inside one
keypress, and nothing was ever seen. Note when the hold began and drop `onKey`
until the window has passed — long enough to break a key repeat, short enough
that a deliberate press still feels instant.

**A `turn` cartridge holds the same way, one line later.** It has no key loop,
so the hold is a flag and the resume is the next `onLine`, whatever it says:

```ts
if (holding) { holding = false; deal(); show(); return }   // any line at all
```

`count`, `spot`, `rhyme`, `story` and `memory` all do this — a right answer, a
finished story or a solved board leaves the good moment standing on its own,
and the next line brings the next one. The invitation goes in the copy ("want
another group? type more!") and **any** line is accepted, so there is no word
to learn. The shell drops an empty Enter (`InputLine.tsx`: `if (!text)
return`), so "press Enter to continue" is not available here — ask for a word,
then accept anything.

**Nothing may rearrange itself merely because the screen was redrawn.**
`count` shipped a version whose `scatter()` dealt a fresh random layout every
time it was called, and every redraw called it again — so typing a stray word
at a group of three ducks shuffled the ducks under a child who was counting
them. Lay a picture out once, keep it in a variable, and change it only when
the child does something.

### 5. When ASCII is still the right answer

Shapes are for *pictures*. Characters are for *characters* — reaching for a
sprite there makes a worse thing, not a more retro one. Keep the character ops
for a keyboard diagram (`mole`'s key caps), a card or board grid (`memory`),
falling or spelled-out words (`rhyme`, `story`, `letters`), a musical keyboard
(`piano`), and anything whose content is language.

One hybrid is correct, exactly once: **`pop` paints a letter inside a hollow
balloon.** Text on top of a shape is right when *the letter is the content of
the game*. It is never right for a number — see "Souvenirs" below.

Two things about `draw` that are easy to get wrong:

- **Fractional positions are yours to keep.** `c.put(12.4, 3, 'o')` draws at
  12.4 cell-widths. Never round a moving thing yourself: at 0.58 cells a frame
  rounding renders the same cell twice and then jumps one, which is exactly
  the stutter the canvas renderer exists to remove. Round *scenery* (a border,
  a label) if you like — whole coordinates get snapped to whole pixels and
  stay crisp.
- **`c.w` and `c.h` are live.** They change under a window drag or a tablet
  rotation. `tick` gets no canvas, so if your physics needs the size, stash it
  during `draw` — the runtime always draws before it ticks.

A `turn` cartridge needs `hints` too, and its `souvenir()` is shown to the
child as a closing line when the cartridge ends.

## Souvenirs

There are no scores. A score invites comparison, and comparison invites
losing — a 6-year-old who bounced the ball 3 times must never see `3` next to
a sibling's `14`. This binds two separate things:

- **Nothing is ever counted onto a canvas.** No `c.text(x, y, \`${n}\`)`, no
  bare digit `c.put`, anywhere a game draws — not shrunk into a corner, not
  behind a label. If you find yourself painting a running tally so the child
  can watch it climb, that tally is the thing to delete.
- **A `souvenir()` is qualitative and specific: it names what happened, not
  how many times.** "boing boing boing!" is fine; "3 boings" is not. "you
  played A S D F" is fine; "4 notes!" is not. "you found the cat and the
  rocket!" is fine; "2 pairs found" is not. Internal counters are still fine
  to *keep* — `memory` has to know when all eight pairs are found, `piano`
  can track a running list of keys pressed — the rule is about what a child
  *sees* returned from `souvenir()`, never about what your closure holds.

Two shapes cover almost every game:

- **A short, fixed set of outcomes.** Bucket the count into 2-4 named tiers
  and give each its own string, the way `ball` picks between
  `ball.souvenir.1` / `.2` / `.3` by capping `bounces` at 3 before indexing —
  no template, no `{n}`, so there is no number to leak.
- **A list of specific things.** Collect the names of what happened (notes
  played, pairs found, animals met) and join them naturally, capped at a
  sensible length with an ellipsis or an overflow marker like "...and more!"
  for a long session — see `piano.souvenir` (`{notes}`, capped at 8) and
  `memory.souvenir` (`{list}`, capped at 4 names).

  **The conjunction belongs in exactly one place: the join function, never in
  a string it joins.** `memory`'s overflow marker for a capped list used to
  be the string `"and more"` (en) / `"ועוד"` (he) — already carrying its own
  conjunction — and the join function then prepended *another* one
  unconditionally, producing `"the cat, and and more!"` in English and, in
  Hebrew, a literal doubled letter: `"...הכדורסל וועוד!"`. That second one is
  not a typo you can spot by reading English rules — **Hebrew's "and" (ו) is
  a prefix glued directly onto the next word, not a standalone word**, so a
  doubled conjunction there is not a repeated *word* (`"and and"`, easy to
  eyeball) but a repeated *letter* at a word's start (`וו`, easy to miss,
  and not a typo a spell-checker or a "fewer than N words" test will ever
  catch). The fix: the overflow marker holds only the bare word (`"more"` /
  `"עוד"`), and the join function supplies the conjunction uniformly for
  *every* final slot, real name or overflow marker alike. If your cartridge's
  join has more than one place that can prepend "and"/ו, one of them is
  wrong — collapse it to one.

**Zero progress is not an edge case, it is the first thing every child sees.**
A child who opens your cartridge and presses ESC immediately must get either
a warm, fixed line (`memory.souvenir.none`: "no pairs yet — the cards are
still a mystery!") or nothing at all (`inst.souvenir()` returning `''`, which
the shell simply does not display) — never a bare `"0"`, and never a template
interpolated with an empty or missing value. That last shape shipped once
already: `story.souvenir` used to read `"a story about a {animal}"`, and
answering nothing before ESC rendered the dangling `"a story about a "`.
`story.souvenir` now returns `''` until every one of its three prompts is
answered, precisely because its title needs all three to make sense — check
what your own template needs *all* of before you interpolate it with
anything, not just whether the count is exactly zero.

## Saying the same thing three times is a rebuke

Every line a child can see twice in a row needs a sibling. Three identical
misses read as disapproval even when each one is warm on its own — the game
stops sounding like it is waiting and starts sounding like a machine that has
noticed.

**Alternate, do not randomise.** `count` and `spot` shipped
`ctx.rng.chance(0.5)` between two wordings, which still repeated itself one
turn in four; a counter and `% 2` makes an immediate repeat impossible instead
of merely unlikely:

```ts
show(ctx.t(misses++ % 2 === 0 ? 'mygame.again' : 'mygame.again.b'))
```

Check both catalogs. And check what your branches print *together*: `rhyme`
answered an unconfirmed word with "what else sounds like CAT?" and then, on
the very next line, re-stated the standing prompt — "what rhymes with CAT?".
Two questions, one turn. **If a branch ends by re-asking, nothing it says
first may ask anything.**

## Rules

1. **Never tell the child they are wrong.** There are no failure states here. A
   miss is "boing!", not "you lose". No scores, ever — see "Souvenirs" above.
2. **No React, no `document`, no `window`.** Your cartridge is plain data and
   functions so it can one day run inside a sandbox.
3. **Use `ctx.rng`, never `Math.random()`.** It is seeded, which is what makes
   your game snapshot-testable.
4. **Canvas art is Latin, box-drawing and emoji only.** Hebrew belongs in prose
   lines via `ctx.say` — Hebrew glyph widths break the monospace grid.
   **Multi-line ASCII art must use `{ kind: 'art' }`, never `{ kind: 'text' }`:**
   text is bidi-reordered under Hebrew and will scramble a drawing.
   An `art` block takes an optional `scale` (`big` / `giant`) — a real size,
   not an emphasis. A board made of five emoji and a board made of a thousand
   canvas pixels are the same game to a child; if yours draws small, say so
   here rather than padding it out with spaces.
   **An emoji is two grid cells wide, everywhere** — in `put`, `text` and
   `emoji` alike, and in both the snapshot model and the picture the child
   sees. `c.text(x, y, '🐟🐟🐟')` lays out three fish, one per two columns;
   you never need to space them out by hand. **Shapes have none of this to
   think about** — a pixel is a pixel in every language, and a canvas has no
   bidi algorithm at all.
5. **Never call `.toUpperCase()`.** Hebrew is caseless. Use `caseFor(ctx.locale)`
   if you need display case.
6. **Left is left.** `ArrowLeft` moves screen-left in every language.
7. **Declare `locales` honestly.** If you have no Hebrew, say `['en']` — the
   cartridge is then simply absent from Hebrew `help` rather than showing
   English text to a Hebrew reader.

## Testing yours

`draw()` is pure, so a game is a snapshot test:

```ts
const inst = mygame.create(testCtx({ seed: 1 }))
inst.onKey?.({ key: 'ArrowRight', shift: false, repeat: false })
expect(frameOf(inst, mygame.size)).toMatchInlineSnapshot()
```

`frameOf` rasterizes to the integer `Cell[][]` model, so a snapshot is stable
even though the painter places things at fractional positions. Pass a third
argument to test the same game on a wider screen — this is the cheapest way to
find out that you hard-coded a constant somewhere:

```ts
expect(frameOf(inst, mygame.size, 60).split('\n')[0]).toHaveLength(60)
```

`ticks(inst, n, dt)` feeds a fixed delta so time is deterministic, whatever
the real display is doing.

### Testing a game that draws shapes

`frameOf` is the CHARACTER model and it cannot see the pixel field at all — so
a shape game snapshots `pixelsOf`, the pixel model, at full resolution (`#`
for a lit pixel, `.` for background, one character per logical pixel):

```ts
const rows = pixelsOf(inst, mygame.size).split('\n')
expect(rows[0]).toBe('#'.repeat(mygame.size.cols * 8))   // a solid top rail
```

`cmdsOf(inst, size)` hands back the raw command buffer, which is usually the
clearest thing to assert on: *the paddle rect never leaves the court*, *the
ball's x is different on every frame*.

If you call `frameOf` on a game that drew only shapes it **throws**, on
purpose. A blank character grid is exactly what a test looks like when it has
stopped seeing the game — and a game that looks right in tests and wrong on
screen has cost this project dearly, three separate times.
