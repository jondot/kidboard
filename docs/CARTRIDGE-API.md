# Cartridge API — `apiVersion: 1` (frozen)

This is the reference for Kidboard's extension API: the exact shapes a
cartridge is built from. It documents what is **frozen**, not how to get
started — for a tutorial, see [`src/cartridges/README.md`](../src/cartridges/README.md).

The full type definitions live in [`src/types.ts`](../src/types.ts); this
document is a guided reference to that file, not a substitute for it.

## Freeze policy

`apiVersion: 1` is stable as of this document. The registry
(`src/runtime/registry.ts`) checks every cartridge's `apiVersion` and
**rejects anything that is not exactly `1`**:

```ts
if (c.apiVersion !== 1) {
  throw new Error(`${path}: unsupported apiVersion ${String(c.apiVersion)}`)
}
```

A change that is not backward-compatible with everything documented here
requires shipping `apiVersion: 2` and teaching the registry to accept it
explicitly. There is no silent version-drift path.

The gate is a **hard failure in the test suite**, which builds the registry
with `{ strict: true }` — an unsupported `apiVersion`, a duplicate id, a
missing default export or an empty `locales` list all fail `npm test`, so a
contribution cannot land with one. At runtime the same check *skips the bad
module and warns* instead of throwing, because `buildRegistry` runs at module
evaluation: a throw there would blank the entire page and the child would
never see a terminal at all. A bad cartridge costs its own cartridge.

## Three cartridge kinds

Every cartridge is one member of the `Cartridge` union
(`EchoCartridge | TurnCartridge | LiveCartridge`), discriminated by `kind`.
All three share a `Base`:

```ts
type Base = {
  apiVersion: 1
  id: string
  triggers: TriggerTable          // { en?: string[]; he?: string[]; emoji?: string[] }
  locales: Locale[]                // 'en' | 'he', declared honestly
  strings?: Partial<Record<Locale, Record<string, string>>>
}
```

#### Your first trigger is the name a child sees

**The title on the collapsed transcript row is `triggers[locale][0]`** — the
cartridge's FIRST trigger in the language the child is reading, not its `id`
and not anything you can override. `titleFor` in `src/runtime/session.ts`
resolves it, and the fallback chain is exact:

1. `triggers[<active locale>][0]`
2. `triggers[<the other locale>][0]`
3. `triggers.emoji[0]`
4. `id` — a last resort, so the row is never blank

Two consequences worth knowing before you write the array:

- **Order matters.** `{ en: ['piano', 'music'] }` puts *piano* on the row;
  swapping them puts *music* there. Put the word you want a child to see
  first, and the synonyms after it.
- **Renaming a trigger renames the game** everywhere a child looks back at
  what they did. This is why `fish` shows *aquarium* and `snake` shows
  *נחשים*: a child who typed "aquarium" must never find "fish" in their own
  transcript.

### `echo` — one-shot

Type a word, get output, done. No state survives the call.

```ts
type EchoCartridge = Base & {
  kind: 'echo'
  respond(ctx: Ctx): void
}
```

### `turn` — a typed conversation

Holds state across multiple typed lines but owns no frame and no canvas.
Added after `story` and `memory` proved that "type a word, get output"
wasn't enough for a mini-conversation. `ESC` and `quit` always exit; the
cartridge never has to handle either itself.

```ts
type TurnInstance = {
  start(): void
  onLine(text: string): void
  souvenir?(): string
}

type TurnCartridge = Base & {
  kind: 'turn'
  hints(t: T): Hint[]
  create(ctx: Ctx): TurnInstance
}
```

### `live` — a real-time frame loop

Owns a character canvas and, optionally, raw keys and a tick callback. `ESC`
freezes the current frame and exits; the cartridge never handles that either.

```ts
type LiveInstance = {
  onKey?(k: Key): void
  tick?(dt: number): void
  draw(c: CanvasLike): void
  souvenir?(): string
}

/** Columns and a width-to-height ratio. Never pixels, never a fixed box. */
type GameSize = { cols: number; aspect: number }

type LiveCartridge = Base & {
  kind: 'live'
  needsKeyboard?: boolean          // default true
  size: GameSize
  hints(t: T): Hint[]
  create(ctx: Ctx): LiveInstance
}
```

`size` declares a **minimum column count** and the **aspect ratio** of the
play area. Rows follow from the two (`round(cols * 0.6 / aspect)`), so a
game's proportions are a property of the game. The runtime sizes cells from
the container it is being shown in, and on a wide screen it hands the game
*more columns* rather than bigger cells — which is why `CanvasLike.w`/`h` are
live values, read fresh every frame.

`ball`'s `{ cols: 30, aspect: 1 }` is a 30 x 18 canvas at its narrowest; on a
wide window it is the same 18 rows across ~75 columns. That is why a game that
draws shapes does not paint edge to edge — see **The house style**, rule 1: it
draws into a centred, field-shaped stage and lets the surplus be background.

`tick(dt)` receives the real elapsed time, in seconds, clamped to 50ms so a
backgrounded tab cannot integrate ten seconds of motion in one step. The loop
runs at the display's refresh rate, not a fixed 24fps.

## The `Ctx` surface

Every cartridge callback that needs runtime services receives a `Ctx`. It is
a plain object of data and functions:

```ts
type Ctx = {
  t: T                              // (key, vars?) => string — locale-aware lookup
  locale: Locale                    // 'en' | 'he'
  dir: Dir                          // 'ltr' | 'rtl'
  rng: Rng                          // seeded — never Math.random()
  audio: Audio                      // note/noise/blip — synthesized only
  input: string                     // the word that triggered this cartridge
  say(blocks: BlockSpec[],          // output to the transcript
      opts?: SayOpts): void         // { replace: true } supersedes the last
  exit(): void                      // end this cartridge (ESC or explicit)
}
```

Notes on individual members:

- **`t`** resolves a key against the cartridge's own `strings`, then shell
  strings, then falls back to the key itself — it never throws and never
  renders blank. `vars` are interpolated by **name** (`{n}`, `{animal}`, …),
  not by position, so an `en.json` / `he.json` pair must agree on placeholder
  *names* even when word order differs between the languages.
- **`rng`** (`Rng`) is seeded so every cartridge is snapshot-testable:
  `float()`, `int(maxExclusive)`, `pick(xs)`, `chance(p)`.
- **`audio`** (`Audio`) is synthesis-only (`note(hz, ms)`, `noise(ms)`,
  `blip()`) — cartridges never load audio files.
- **`input`** is the normalized word the child typed to reach this
  cartridge (or the corrected word after typo-forgiveness). It is empty for
  a programmatic start.
- **`say`** takes `BlockSpec[]` — plain data (`{ kind: 'text', ... }` or
  `{ kind: 'art', ... }`), never JSX. Content picks a `Tone`
  (semantic meaning: `plain | art | info | win | magic | warm | cool`), never
  a color. **Multi-line ASCII art must use `{ kind: 'art' }`, never
  `{ kind: 'text' }`:** `text` renders `dir="auto"` and is bidi-reordered
  under Hebrew, which will scramble a drawing; `art` is a `dir="ltr"` bidi
  isolate that also renders emoji at exactly two monospace cells.

  An `art` block also takes an optional **`scale`** (`big` / `giant`), which
  is a real size and not an emphasis: a board of five emoji and a board of a
  thousand canvas pixels are the same game to a child, and `spot` was drawing
  at about a quarter of `maze`'s height until it asked for one. Leave it off
  and the drawing takes the machine's own type size, which is what every
  drawing wanted before boards existed — do not reach for `normal`, which
  pins 16px and would be the wrong size on a machine set in 22px type.

  `say` takes a second, optional argument, and it is a paragraph model:

  ```ts
  ctx.say(blocks, { replace: true })   // supersede what I last said with
                                       // `replace` — one board that updates
                                       // in place
  ctx.say(blocks)                      // a new paragraph: everything before
                                       // it is scrollback for good
  ```

  A board-drawing turn cartridge redraws on every line, and appending each
  redraw stacked four grids after three misses. Redraw with
  `{ replace: true }` and say the cheer for a finished round plainly — the
  plain say seals the board the child just solved into the transcript, and
  the next round opens a paragraph of its own. The child's typed lines are
  never touched either way. `memory`, `count` and `spot` all do this.

  `SayOpts` is plain JSON, like every other `Ctx` argument, so it crosses a
  `postMessage` boundary unchanged. A cart running in a Worker says things
  through the sandbox's own `kb.say`, which appends today: `replace` is a
  built-in turn-cartridge affordance and the cart protocol does not carry it.

## The `CanvasLike` surface

`live` cartridges draw through a structural interface, never the `Canvas`
class directly:

```ts
type CanvasLike = {
  readonly w: number      // LIVE: the real cell grid this frame
  readonly h: number
  readonly pw: number     // LIVE: the pixel field, w * 8
  readonly ph: number     // h * 8

  // Character ops. CELL coordinates.
  clear(): void
  put(x: number, y: number, ch: string, tone?: Tone): void
  text(x: number, y: number, text: string, tone?: Tone): void
  box(x: number, y: number, w: number, h: number, tone?: Tone): void
  emoji(x: number, y: number, emoji: string): void

  // Shape ops. PIXEL coordinates.
  rect(x, y, w, h, tone?): void                       // filled
  outline(x, y, w, h, tone?, t?): void                // hollow, t px thick
  line(x, y, x2, y2, tone?): void
  disc(x, y, r, tone?): void                          // filled circle
  circle(x, y, r, tone?): void
  sprite(x, y, rows: readonly string[], tone?, opts?): void
}

type SpriteOpts = { flipX?: boolean; flipY?: boolean; scale?: number }
```

### Two coordinate spaces, one surface

A cartridge draws with characters, with shapes, or with both, and the two
kinds of op differ in exactly one way: **what a coordinate means.**

| | ops | one unit is | good for |
|---|---|---|---|
| characters | `put` `text` `box` `emoji` | one CELL | letters, words, emoji, prompts, ASCII art |
| shapes | `rect` `outline` `line` `disc` `circle` `sprite` | one PIXEL, 8 to a cell on both axes | paddles, courts, mazes, starfields, fish |

**A cell is 8 x 8 logical pixels**, fixed. A 40 x 20 cell grid is a 320 x 160
pixel field, and `c.pw` / `c.ph` report it live, exactly as `c.w` / `c.h`
report the cell grid. Lay out against them and a resize costs nothing.

Because the subdivision is the same on both axes, **a logical pixel has the
shape of a cell: taller than it is wide, by 1 / 0.6.** A Kidtari pixel was not
square either. Two consequences:

- A visually square block is wider than it is tall in pixels — `c.rect(x, y,
  5, 3, ...)` is roughly a square on screen.
- `disc` and `circle` take `r` as the **horizontal** radius and scale the
  vertical one themselves, so a circle reads round rather than as an egg. At
  small radii they are frankly crude, which is correct: Kidtari circles were.

Shapes are **flat, single-tone fills.** There is no gradient, no shadow, no
alpha and no blending between shapes anywhere in the painter — a frame of
shapes touches exactly two members of the 2D context, `clearRect` and
`fillRect`, and a test asserts it. One object, one `Tone`.

### The sprite format

A sprite is an array of strings the cartridge writes inline:

```ts
const FISH = [
  '  ##   ',
  ' ##### ',
  '#######',
  ' ##### ',
  '  ##   ',
]

c.sprite(x, y, FISH, 'plain', { flipX: swimmingLeft })
```

**Any character is a lit pixel; only a space is off.** `'#'`, `'o'`, `'<'` all
paint — reach for whichever makes the bitmap easiest to read in source. (A
contributor who uses `'.'` for a hole gets a solid block; that is the one
gotcha.) Rows may be ragged; short ones are padded to the widest row, so a
mirror reflects the picture rather than each row's own length.

`opts` are `flipX`, `flipY` (mirroring — a fish swimming both ways is one
bitmap) and `scale` (whole-pixel magnification). The array is **copied** into
the command buffer, so a cartridge that mutates its bitmap between frames can
never reach back into a frame it already recorded.

## The house style for a game that draws shapes

Twelve more games get written against this. These are rules, not taste — a
contributor can follow every one of them without having an eye, and `ball`,
`snake`, `catch`, `maze`, `pop`, `fish`, `stars`, `draw`, `drum`, `simon` and
`mole` are the worked examples.

### 1. The field is field-shaped. Pillarbox the rest.

A game declares `{ cols, aspect }`. **Rows are fixed by that pair, and a wide
screen is handed extra COLUMNS** — never bigger cells and never more rows. So
the canvas can only ever be *wider* than what you declared, and a court drawn
edge to edge on a 1200 px terminal becomes a 3:1 horizon.

Two rules together fix it:

- **Declare `aspect: 1` at `cols: 30`** (18 rows) unless you have a reason not
  to. It is square at the declared width, which is what buys the height a 4:3
  field needs once the screen gets wide.
- **Draw into a centred STAGE, not into `c.pw` x `c.ph`.** One import:

  ```ts
  import { sameStage, stageOf } from '../stage'

  let stage = stageOf(30 * 8, 18 * 8)   // a stage exists before the first draw

  // …at the top of `draw`, every frame:
  const s = stageOf(Math.max(64, c.pw), Math.max(48, c.ph))
  if (!sameStage(s, stage)) { stage = s; /* re-lay what depends on it */ }
  ```

  `stageOf(pw, ph, bounds?)` (in `src/cartridges/stage.ts`) returns the largest
  centred rectangle whose ON-SCREEN proportions stay inside `bounds`, which
  defaults to 3:4 .. 4:3. It lived as six copy-pasted lines in five cartridges
  — each with its own `PIXEL_ASPECT = 0.6` beside it, five chances for the one
  number that keeps a circle from being an egg to drift — until a sixth game
  wanted it. `rocket` and `robot` pass their own bounds; everything else takes
  the default.

  It is plain arithmetic: no DOM, no React, no state, so a cartridge that
  imports it is still the plain data and functions a sandbox can host. It
  re-exports `PIXEL_ASPECT` from `runtime/shapes`, which is where that number
  actually lives, so there is one of it in the project.

  Simulate in stage coordinates (`0..w`, `0..h`) and add `stage.x` / `stage.y`
  once, in `draw`. The physics never has to know where on the canvas the
  screen happens to sit.

**Remember that a logical pixel is 0.6 as wide as it is tall.** A `pw x ph`
block of pixels reads as `0.6 * pw : ph` on screen, so a 4:3 picture is
`pw / ph = 2.22`, not `1.33`. Every ratio in this section is the on-screen one.

At the declared width (phone, tablet) the stage IS the canvas and nothing is
wasted. On a desktop the game settles at a 640 x 480 screen centred in the
terminal, with the theme's own ground either side — exactly the way a 4:3 game
sits in a wide television. **Never let a play field exceed 4:3 in either
direction.**

### 2. Monochrome. The theme's ground, plus ONE ink.

**This rule binds EVERY cartridge, not only the ones that draw shapes.** It
governs `tone` on a `DrawCmd` and `tone` on a `BlockSpec` alike — `memory`'s
card grid, `story`'s prose and `ball`'s court are all under it.

**Use `plain`** — the theme's own foreground, the ink the terminal writes its
prose in. It re-tints with the theme, it can never clash with it, and it is
what makes a game read as a machine rather than as a colouring book. Pong was
white on black.

**A second tone is earned by exactly one thing and nothing else: telling what
the child CONTROLS, or what the child just DID, from everything around it —
and only after shape has been tried and failed.** There is never a third, and
**never `rainbow: true`**, which is every tone at once.

The six text cartridges all landed on the same pair: `plain` for the world,
and `win` for the one block that belongs to the child — the pair they matched,
the count they got, the story they made, the key they just pressed. Everything
else is `plain`.

For a picture, shape does the work better than a second colour ever did:

| the question | the answer that is not colour |
|---|---|
| world vs thing | the world is **hollow** (`outline`, `circle`), things are **solid** (`rect`, `disc`) |
| the snake vs its fruit | squares vs a round thing with a stalk |
| the snake's head vs its body | the head keeps its whole square; every body block is trimmed a pixel |
| the child vs their home | a solid little figure vs a hollow house, the same size |
| a balloon vs its letter | the balloon is a ring, so the letter shows *through* it |
| a bump / a burst | a **ring** — hollow, so it is never mistaken for a piece of the game |
| a question vs an answer (prose) | `scale: 'big'` on the question — **size**, not hue |
| where you are in a grid | **position**, and a header row of coordinates |

Four levers, in the order to reach for them: **fill** (solid vs hollow),
**size**, **shape**, **position**. If you find yourself reaching for a colour,
you are usually one bitmap — or one `scale` — away from a better picture.

`src/invariants.test.ts` enforces the count mechanically, for live cartridges
(distinct tones in the command buffer) and for turn/echo cartridges (distinct
tones on the blocks they say). At most two, and if there are two, one of them
must be `plain`. It cannot judge *which* second tone you picked, only that
there is at most one — that part is still yours.

**Emoji are the exception, and only in the text idiom.** An emoji carries its
own colours and no tone can re-tint it. Inside a `{ kind: 'art' }` block that
is the point — `memory`'s cards, `count`'s ducks, `spot`'s row are pictures
made of emoji, and the ink around them is still one ink. On a canvas of flat
single-tone shapes an `emoji` op IS a second palette, and the invariant counts
it as its own tone.

### 3. Minimum sizes, in logical pixels

A 6-year-old has to track the moving thing without effort, from across a room.

| | at least | why |
|---|---|---|
| a wall or rail | `3` px thick | thinner is a hairline at phone cell sizes |
| the thing that moves (ball, fruit) | `10` px across, and > 3% of the field's width | a speck adrift in a court is not a ball |
| the thing the child steers | `> 10%` of the field's width | it has to be findable at a glance |
| a lattice square (snake, maze) | `16 x 10` px | reads as a square, and is 32 CSS px on a desktop |
| a maze corridor | `28 x 17` px | a 9 x 7 maze a child can see the shape of beats a 13 x 9 one |
| a bitmap of a *thing* (fruit, gift, house) | `11 x 7` source pixels **at `scale: 2`** | doubling is free, unmistakably pixel art, and twice as legible |

Sizes are in pixels because pixels are what `c.pw`/`c.ph` are in; on a desktop
one logical pixel is 2 CSS px across and 3.3 down.

### 4. A round ends when the child says it ends

**Nothing re-arms on a timer.** After anything concludes — a missed ball, a
bumped snake, a maze walked home — the game **holds**, showing what happened,
and waits for a key. A visible pause where nothing moves is not dead air; it
is the beat in which a small child works out what just happened and decides to
go again.

- `ball` puts the ball back **on the paddle** and rides it there until a key
  is pressed. The picture says what will happen, in no language at all.
- `snake` stops and leaves the bump ring on the board until an arrow is
  pressed.
- `maze` holds the party on the doorstep; the next key asks for a new maze.
- `catch` and `pop` never conclude, so instead they have a **rhythm**: an
  empty sky for the first beat, one thing every 1.7-1.9 seconds, and at most
  two or five in the air at once.

**Any key resumes.** Never a key a child has to be told about, and never a
state a child can be stuck in.

**Ignore input for the first ~500 ms of a hold.** A six-year-old holding a key
down, or mashing one, will otherwise blow straight through the moment the hold
exists to give them — the ball is missed and re-served inside a single
keypress and nothing was ever seen. Record the time the hold began and drop
`onKey` until the window has passed. Half a second is long enough to break a
key repeat and short enough that a deliberate press feels instant.

**A `turn` cartridge holds the same way, one line later.** It has no key loop,
so the hold is a flag and the resume is the next `onLine`, whatever it says:

```ts
if (holding) { holding = false; deal(); show(); return }   // any line at all
```

`count`, `spot`, `rhyme`, `story` and `memory` all do exactly this — a right
answer, a finished story or a solved board leaves the good moment standing on
its own, and the next line brings the next one. The invitation goes in the
copy ("want another group? type more!") and **any** line is accepted, so there
is no word to learn. Note that the shell drops an empty Enter
(`InputLine.tsx`: `if (!text) return`), so "press Enter to continue" is not
available to a turn cartridge — ask for a word, then accept anything.

**And nothing may rearrange itself just because the screen was redrawn.**
`count` shipped a version whose `scatter()` dealt a fresh random layout on
every call, and every redraw called it again — so typing a stray word at a
group of three ducks shuffled the ducks. Lay a picture out once, keep it in a
variable, and change it only when the child does something.

### 5. When ASCII is still right

Shapes are for *pictures*. Characters are for *characters*, and reaching for a
sprite there makes a worse thing, not a more retro one. Stay with the
character ops for:

- **a keyboard diagram** (`mole`'s key caps) — the child is being shown a key,
  and a key has a letter on it;
- **a card or board grid** (`memory`) — a lattice of glyphs *is* the picture,
  and `box` already draws it;
- **falling or spelled-out words** (`rhyme`, `story`, `letters`) — the content
  is language;
- **a musical keyboard** (`piano`) — the same argument as `mole`;
- **anything with prose in it.** Hebrew never reaches a canvas at all; it goes
  through `ctx.say`.

And one hybrid, which is correct exactly once: **`pop` draws a letter inside a
hollow balloon.** Text on top of a shape is right when *the letter is the
content of the game*. It is never right for a number — see the scoring rule.

---

### Fractional positions, hard edges

Everything said above about fractional cell coordinates holds for pixels, and
matters more. A shape's **position** is fractional and untouched; its **pixel
pattern** is integral. At paint time each edge is rounded to a whole *device*
pixel — never to a logical one, which would quantize motion right back into
the lurch this project already paid to remove. A logical pixel is several
device pixels across, so a sprite moving a tenth of a logical pixel per frame
still moves on screen while its edges stay exactly on the display's grid.
Crisp like 1977, smooth like 2026.

**`w` and `h` are live.** They are the grid for *this* frame and change when
the container is resized or a tablet is rotated. Lay out against them; a
module constant will be wrong on somebody's screen. A game that needs its
dimensions inside `tick` (which is handed no canvas) should remember what the
last `draw` reported — the runtime always draws before it ticks.

**A cartridge with no `tick` is still redrawn when the grid changes.** Not
every frame — there would be nothing to see — but on the very frame a resize
lands, so `maze` and `piano` reflow exactly as `ball` does. (They did not,
once: a clockless cartridge stayed frozen at its old size until the child
happened to press a key, which for `maze` also dealt a new maze.) So a
clockless game must still do all of its layout from `c.w` / `c.h` inside
`draw`, and must survive being drawn at a size it has not seen before.

**Coordinates are cells and may be fractional.** `c.put(12.4, 3, 'o')` really
does draw at 12.4 cell-widths on the canvas. This is the difference between
motion that reads as continuous and motion that stutters: a ball moving 0.58
cells per frame used to round to the same integer twice and then jump a whole
cell. Positions are *not* rounded anywhere on the cartridge's behalf.

There are two consumers of the same command buffer, and the split is
deliberate:

| | consumer | coordinates | what it is for |
|---|---|---|---|
| character model | `rasterize(cmds, w, h) -> Cell[][]` | rounded to whole cells | snapshot tests of a character game, anything that needs to ask *what character is at (x, y)* |
| pixel model | `rasterizePixels(cmds, pw, ph) -> (Tone \| null)[][]` | rounded to whole pixels | snapshot tests of a shape game, at the field's full resolution |
| paint | `GridCanvas` | fractional, straight through | what the child actually sees |

**Each model holds only its own ops, and this is load-bearing.** `rasterize`
ignores shape ops; `rasterizePixels` ignores character ops. Squeezing a
320 x 160 field into a 40 x 20 character grid would throw away 98% of it, and
a model that coarse can quietly agree with a game that is visibly wrong —
which is the exact failure this project has already paid for three times. So
the pixel field gets a model at its real resolution instead, and the two are
kept from drifting apart by construction: every shape, in both the model and
the painter, is decomposed by **one shared function** (`shapes.eachRect`), so
there is only one geometry to be right about. The only difference between them
is the last step, rounding to a whole logical pixel rather than to a whole
device pixel.

Two guards make the split hard to get wrong in a test:

- `frameOf` (the test harness) **throws** — naming `pixelsOf` — when a
  cartridge drew only shapes. Its character model is blank, and a blank grid is
  precisely the shape of a test that stays green while the screen is wrong.
- `src/invariants.test.ts` requires every live cartridge that emits shape ops
  to read the pixel model somewhere in its own tests, which covers the case the
  harness guard cannot see: a game that also paints a character or two, so the
  grid is not blank.

One place does render shapes as characters: the fallback for a browser that
cannot give us a 2D context at all, which squeezes the field into quadrant
blocks (`rasterizeWithShapes`) so a child sees a picture rather than a blank
rectangle. It is lossy, it is never a test model, and no cartridge should think
about it.

So a snapshot test still compares an integer grid and still means what it
always meant, while the picture is smooth. Draw scenery on whole cells (it is
then snapped to whole device pixels and stays crisp) and sprites wherever the
simulation puts them.

A `box`'s *extent* (`w`/`h`) is always rounded to whole cells before its walls
are laid out — on the model **and** on the canvas — so the right and bottom
walls never shear away from where `rasterize` puts them. Its *position*
(`x`/`y`) is not rounded either place: a box may glide like any other sprite
(a sliding frame is a real thing), only its size has to land on whole cells.

Emoji are two grid cells wide, and every drawing op honours that, not just
`c.emoji()`. `rasterize` reserves the continuation cell for a wide character
drawn through `put` or `text` exactly as it always has for `emoji`, and the
canvas painter gives any wide character a two-cell advance whichever op
delivered it — so on the game path the grid is square by construction, with
no CSS involved. Reach for `put`/`emoji` freely when you want a coloured
sprite (`c.emoji()` takes no `tone`); just leave the same two-cell gap you
would leave between two `c.emoji()` calls, or the sprites overlap on screen
even though nothing looks wrong in a snapshot:

```ts
c.put(0, 0, '🐱', 'warm'); c.put(2, 0, '🐶', 'warm')   // fine — two cells apart
c.put(0, 0, '🐱', 'warm'); c.put(1, 0, '🐶', 'warm')   // overlaps on screen
```

`text` honours this too: the cursor advances **two cells for a wide grapheme,
one for a narrow one**, in both `rasterize` and the canvas painter. A row of
emoji written in a single call lays out exactly as if you had spaced separate
`put`/`emoji` calls two cells apart yourself:

```ts
c.text(0, 0, '🐟🐟🐟')   // three fish, at columns 0, 2 and 4 — model and picture agree
```

Width is judged per **grapheme cluster**, not per UTF-16 code unit: a ZWJ
sequence (a family emoji) or a base character plus a variation selector is
one glyph and advances the cursor once, at whichever width it renders at.

The old `width: 2ch` hack survives only in `ArtView`, where
`{ kind: 'art' }` transcript art is still DOM and the browser still picks the
emoji font. Cartridges do not think about either.

**Edge clipping is not perfectly symmetric between the two consumers**, so do
not treat a passing snapshot as proof a sprite is actually visible.
`rasterize` drops anything whose *rounded* `x` is `>= w` (or `< 0`); the
canvas painter keeps anything whose *raw* origin is `<= pixelW` (and does its
own separate check for the left/top edge). Concretely, in a 12-column grid,
`c.put(11.5, 1, 'o')` is blank in the model but visible on screen, and
`c.put(-0.5, 1, 'o')` sits at column 0 in the model but is drawn half
off-screen in the picture. Keep every sprite's coordinates inside `[0, w-1]`
(and `[0, h-1]`) and this never comes up; do not rely on a snapshot test
alone to prove something is on screen near an edge.

`draw(c)` only ever **records commands** (`DrawCmd[]`); it never touches the
DOM and never rasterizes. This is what makes every `live` cartridge a pure,
headless snapshot test: construct with a fixed seed, feed a key script, call
`draw`, and compare the resulting frame string. It is also the boundary a
Worker-hosted cartridge will post across, unchanged.

## The serializability guarantee

**Every argument that crosses the cartridge boundary is JSON-serializable.**
Concretely:

- Every `Ctx` method takes and returns only primitives, plain objects, and
  arrays of those — never a class instance, a DOM node, or a function passed
  *in* (the functions cartridges receive, like `say`/`exit`, are the boundary
  itself, not data crossing it).
- `BlockSpec` is a plain discriminated-union object.
- `DrawCmd`, the output of `CanvasLike`, is a plain discriminated-union
  object (`{ op: 'clear' } | { op: 'put'; ... } | ...`). **This includes every
  shape op**: a `sprite` carries a copied `string[]`, never a callback or a
  bitmap object, and `Canvas.test.ts` round-trips a buffer of all six shapes
  through `JSON.parse(JSON.stringify(…))` and compares it byte for byte.
- `Key`, `Hint`, `TriggerTable`, and every cartridge's own `strings` are
  plain JSON-shaped data.

This is deliberate, not incidental, and it has now been cashed in: a
Worker-hosted cartridge implements the identical `Cartridge` interface behind
a `postMessage` boundary, unchanged. See `src/carts/` and `docs/CARTS.md`.

### Your cartridge can be a cart

`npm run pack-carts` bundles every `live` cartridge — its own source, every
module it imports, and both JSON catalogs — into one standalone script and
packs it into a PNG a child can download, keep and load back in. It is not a
label on an empty file: the script IS the game, and the packer refuses to ship
one that does not answer its first frame.

Nothing is required of you to be packable except the discipline this document
already asks for. Three things do make a cartridge unpackable, and all three
are worth knowing before you reach for them:

- **`echo` and `turn` cartridges cannot be carts.** The sandbox protocol is a
  frame loop — `init` / `key` / `tick` in, `draw` / `audio` / `say` / `exit`
  out. There is no turn taking in it and nothing for a one-shot answer to do.
  This is a limit of the cart format, not a mark against those kinds.
- **Vite features are not JavaScript.** `help` uses `import.meta.glob` to list
  the registry, so it exists only inside the app's own build. If you reach for
  anything Vite-shaped, your cartridge stops being a file somebody can keep.
- **Anything the Worker realm does not have.** No `document`, no `window`, no
  `localStorage`, no network — which is exactly the list `invariants.test.ts`
  already forbids you. The shared helpers are safe: `src/cartridges/stage.ts`
  is plain arithmetic and `NOTES` is a table of numbers.

`docs/CARTS.md` has the format, the sandbox, and the honest account of what
that sandbox is worth.

## What is *not* part of this API

- Cartridges never import React, touch `document`/`window`, or call
  `Math.random()` or `.toUpperCase()` — these are enforced mechanically by
  `src/invariants.test.ts`, not just documented here.
- There is no error state to model. `respond`/`onLine`/`draw` are not
  expected to throw as part of normal operation; there is no "invalid input"
  return value in this API because every input the shell hands a cartridge
  has already been resolved as a match for it.

  The runtime nevertheless contains a throw rather than letting it reach the
  child: `session.ts` wraps every call into cartridge code, and a throw ends
  that cartridge with one warm line while the terminal carries on. The
  registry likewise skips a module it cannot load instead of blanking the
  page. Neither is a control-flow path you may design against — the hard
  `apiVersion` and duplicate-id gates still fail the test suite — they exist
  so one contributor's bad afternoon cannot brick a child's playground.

## See also

- [`src/cartridges/README.md`](../src/cartridges/README.md) — the
  contributor tutorial: copy `_template`, wire up triggers and strings, see
  it in `help`.
- [`docs/CARTS.md`](CARTS.md) — portable carts: the PNG format, the Worker
  sandbox and what it is and is not worth, and `npm run pack-carts`.
- [`docs/HEBREW.md`](HEBREW.md) — the conventions every Hebrew string in a
  cartridge follows.
