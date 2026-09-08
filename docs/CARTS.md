# Portable carts

A cart is a **PNG a child can save, share and load back in**, like a PICO-8
cart. Kidboard ships with none: the app starts empty and a child loads what
they want.

This document is for whoever writes or reviews one. The cartridge interface
itself — `apiVersion: 1`, the three kinds, `CanvasLike` — is in
`docs/CARTRIDGE-API.md` and is unchanged; a cart implements a `LiveInstance`
and nothing more.

---

## Read this part first

**A cart is code somebody else wrote, and the sandbox contains *code*, not
*content*.** A cart can draw anything it likes inside its own field. Kidboard
ships no gallery, has no discovery, and fetches nothing over the network:
loading is always a local file that a child or a parent chose, from someone
they already trust.

Treat a cart the way you would treat any program a stranger emailed you. Do
not accept one from a stranger and hand it to a six-year-old.

That is the honest limitation, and it is documented rather than solved.

---

## The format

A cart is a real PNG carrying one extra chunk.

```
  89 50 4E 47 …    PNG signature
  IHDR             the picture, exactly as any encoder wrote it
  IDAT …
  kbRT             <- gzip( JSON manifest )
  IEND
```

`kbRT` is **ancillary** (lower-case `k`) and **private** (lower-case `b`), so
every other PNG decoder on earth skips it. The file stays an ordinary image
everywhere else: it opens in a photo viewer, it has a thumbnail, it can be
mailed and posted like a picture, because it *is* one.

**We deliberately do not use low-bit steganography.** Canvas decoding
un-premultiplies alpha, and a browser may apply an ICC conversion on decode;
both quietly rewrite the low bits a PICO-8-style encoder hides data in.
Reading the file as an `ArrayBuffer` and walking the chunk list is losslessly
exact, needs no canvas, and round-trips byte for byte — `src/carts/codec.ts`,
tested in `codec.test.ts` against PNGs written by an independent encoder.

### The manifest

```json
{
  "apiVersion": 1,
  "id": "meow-maze",
  "name":    { "en": "meowmaze", "he": "מבוךחתול" },
  "title":   { "en": "Meow Maze", "he": "מבוך חתול" },
  "author":  "somebody",
  "locales": ["en", "he"],
  "hints":   { "en": ["SPACE jump"], "he": ["SPACE קפיצה"] },
  "strings": { "en": {}, "he": {} },
  "code":    "…JS implementing LiveInstance…",
  "size":    { "cols": 32, "aspect": 1.3333 },
  "emoji":   "🐱"
}
```

`name` is the word a child types. `title` is what the label says — literally:
it is drawn on the front of the cartridge (below).

Two fields are additions to the design's manifest, both optional:

| field | why |
|---|---|
| `size` | a `LiveCartridge` must declare `{ cols, aspect }` under apiVersion 1, and the design's manifest had nowhere to put it. Defaults to `{ cols: 32, aspect: 4/3 }`. |
| `emoji` | one emoji trigger, so a cart is reachable by a child who cannot yet read either language. |

Nothing in the manifest is trusted. A field of the wrong type is dropped, an
absurd `size` is replaced by the default, `locales` is intersected with the
languages the cart actually has a `name` in, and anything without an `id`, a
`name` or runnable `code` is refused whole. `apiVersion` must be `1`.

---

## The picture: it is a picture of a cartridge

The file used to be the label art blown up on a plain matte, which made a
folder of saved games a folder of abstract squares. PICO-8 has always handed
you a photograph of the object, and that is what makes a directory of carts
read as a shelf. So `src/carts/shell.ts` draws the object:

```
        ______________
       /  ==========  \      the grip ridges along the top moulding
      |   ==========   |
      |  ┌──────────┐  |
      |  │          │  |     the label window: the game's own picture,
      |  │   ART    │  |     scaled in whole pixels and centred
      |  │          │  |
      |  └──────────┘  |
      |    SNAKES      |     the title, in a 5x7 font drawn as pixels
      |   ▮ ▮ ▮ ▮ ▮    |     the connector fingers
      |________________|
```

Two colours, because the format is a two-entry indexed PNG and monochrome is
the format rather than a restriction (`art.ts`). 160 x 200 — a nod to PICO-8's
160 x 205 — and **the geometry is fixed**, which is load-bearing: `LABEL_WINDOW`
is always the same rectangle, so a reader can find the game's own picture
without being told where it is. That is what `labelView` in `label.ts` uses
when a cart comes home: it crops the window, so the transcript shows the GAME
in half-blocks rather than a tiny picture of a cartridge. Anything not exactly
160 x 200 — a cart from another tool, an older file — is read whole, as before.

**The label is drawn twice.** The same bitmap goes on the front of the cart
and onto that game's tile in the picker (Shift, Shift), where it is sampled to
half-blocks by `bitmapLabel` — one drawing per game, in one place, whatever it
is being drawn for. `packedArt.ts` therefore holds a picture for every built-in
a child can start, including the turn cartridges that can never be packed: a
shelf with blank cards on it says those games are the leftovers.

**The title is drawn, not typeset.** A PNG has no text stack, so `font.ts`
carries a hand-drawn 5x7 upper-case alphabet, the only typeface in this project
that exists as pixels. It has no Hebrew and will not: the standing rule is that
Hebrew never goes on a canvas, because the bidi algorithm and the shaping that
make it readable live in the browser. A name it cannot spell falls back to the
English title; when there is none, the cart carries no title and its picture
speaks for it.

---

## Writing a cart

The `code` string is evaluated once, in the Worker, and must register a
factory:

```js
kb.game(function (ctx) {
  var x = 0
  return {
    onKey:  function (k) { if (k.key === 'ArrowRight') x += 1 },
    tick:   function (dt) { x += dt },
    draw:   function (c) { c.clear(); c.text(x, 1, ctx.t('hello')) },
    souvenir: function () { return ctx.t('bye') }
  }
})
```

`ctx` is the ordinary cartridge `Ctx` minus the parts that cannot cross a
`postMessage`: `t`, `locale`, `dir`, `rng`, `input`, `audio`, `say`, `exit`.
`c` is the ordinary `CanvasLike` — every character op and every pixel op,
identical coordinates, identical semantics. A cart draws exactly the way a
built-in draws.

Things to know:

- **`draw` may be called before `tick`,** and `c.w` / `c.h` are live. Lay out
  against them, never against constants.
- **`souvenir()` is asked for on every frame,** because the shell asks for it
  synchronously at the one moment a Worker cannot answer. Keep it cheap.
- **Anything you throw ends the cart, quietly.** The child sees one warm line.
- **Do not write `import`.** It is refused; see below.
- There is no ESC hint to declare — the shell appends exactly one.

## The sandbox, and what it is worth

Cart code runs in a **Web Worker created from a `blob:` URL**. The host sends
`init` / `key` / `tick`; the worker answers `draw` (a `DrawCmd[]`), `audio`,
`say` and `exit`. There is no second protocol: `Canvas` already records a
serializable command buffer, which is precisely why it was built that way.

```
  Worker (untrusted cart)              Host
  ──────────────────────────────────────────────────────
  init  { code, seed, locale, w, h }  <--
  key   { key, shift, repeat }        <--
  tick  { dt, w, h }                  <--
  draw  { cmds: [...], sv }           -->
  audio { note | noise | blip }       -->
  say   { blocks }                    -->
  exit  { souvenir }                  -->
```

**What the sandbox really guarantees:** the worker realm has no `document`, no
`window`, no `localStorage` and no reach into the page or its embedder. On top
of that the bootstrap deletes every remaining networking global (`fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`,
`caches`, `Worker`, `BroadcastChannel`, `navigator`, …), evaluates the cart
with those names shadowed as function parameters, and refuses any code
containing the word `import`.

**What it does not guarantee:** a cart can still reach the `Function`
constructor through an ordinary prototype chain, so a determined author could
construct a dynamic import. Sealing that needs a Content-Security-Policy on
the page that owns the worker, and an embeddable component cannot impose one
on its host. This is the second reason Kidboard fetches nothing and ships no
gallery.

**A watchdog** terminates any worker that misses a tick deadline (100ms; two
seconds for the first frame, since compiling a blob is allowed to be slow). A
`while (true)` inside a cart therefore cannot hang the page — the child gets a
warm line, not a frozen tab. Only one frame is ever outstanding, so a slow
cart cannot be piled on until it becomes an unkillable one.

## Where carts live

Loaded carts persist in **IndexedDB**. The project rule is that only
`kb.locale`, `kb.muted` and `kb.theme` are persisted and that they live in
`localStorage`; carts are the design's sanctioned exception, because a PNG is
tens of kilobytes and a handful of them blows past `localStorage`'s quota. It
is a different store holding a different kind of thing, and still nothing
about the child. When the browser will not store anything — private mode, a
locked-down embedder, a full quota — carts work for the visit and are
forgotten afterwards. That is never an error a child sees.

## Names

Built-ins always win. If a cart wants a word that already means something, in
either language, the loader appends a digit — `maze`, `maze2`, `maze3` — and
tells the child the final word. A cart that comes back keeps the word it had,
so a child who learned `meowmaze2` yesterday still types it today.

## Saving

The 🃏 panel offers what there is to save as a downloadable `.png` — a picture
of a cartridge with the game's own label in its window (above):

- the sample cart, always, so a child who has made nothing still has one;
- **a child's own drawing**, the moment they have drawn one. `draw` keeps its
  picture as plain JSON for exactly this. The saved cart draws the picture
  back, once, one mark at a time, and then rests. The picture on the front of
  the card is cropped to what was actually drawn, so a small doodle on a big
  page is still legible at sixteen half-cells wide;
- **a child's own tune**, the moment they have played one. `piano` keeps the
  notes in `currentTune()`, the same kind of hook. The saved cart plays the
  melody back as a little roll of bars and then rests; SPACE plays it again,
  which is the child asking rather than a timer re-arming. A phrase caught
  through `piano`'s recording head (`P`) carries `at` on every note, and the
  cart then plays the gaps the child actually left; free play has no
  timestamps and still plays at an even beat;
- **a child's own beat**, the moment they have recorded a bar on `drum`.
  `currentBeat()` is the same hook again, and the saved cart obeys the same
  rule: the bar plays through once — the four sounds, the rests taking up
  their own time — draws itself as the strip the kit draws, and rests. SPACE
  plays it again. A bar of nothing is not a beat, so the row only appears once
  something is actually on the loop;
- **every built-in game**, packed at build time (below).

Nothing here is pre-loaded. The panel hands over a file; a cart exists only
once somebody chooses to put one back.

---

## Making a cart from outside the repo: `npm run make-cart`

```bash
npm run make-cart -- mygame.js --name pop --title "Pop!"
npm run make-cart -- mygame.js --name pop --label label.txt --hint "SPACE jump"
```

The format above was fully specified and completely one-directional: the app
could hand a child a PNG and there was no way to make one from outside it, so
anybody who wanted to write a game had to fork this repo. That made "portable"
true only in the direction that did not matter.

Your file is the one from **Writing a cart** above — it calls `kb.game(...)`.
You may `import` your own files; esbuild inlines them, because a cart is one
self-contained script. Flags fill in the manifest (`--name`, `--title`,
`--author`, `--emoji`, `--cols`, `--aspect`, `--hint`, `--he-name`,
`--he-title`), or `--manifest some.json` supplies the lot. `--label` takes
either a `.txt` of rows (any non-space is ink, exactly how the built-ins'
labels are written) or a `.png`, cut at its own midpoint.

**It refuses to write a cart that does not play.** The same gates
`pack-carts` holds the built-ins to: it must bundle with nothing dangling, it
must survive `looksImportable`, and it must answer the first frame with
drawing in it. A file that lies about containing a game is the one thing this
must never produce, because the person who finds out is six.

What it does *not* do is review your code. A cart is a program a stranger
wrote; see the first section of this document.

---

## Packing a built-in: `npm run pack-carts`

```
npm run pack-carts            every cartridge that can be packed
npm run pack-carts pop snake  just these
```

A built-in is TypeScript compiled into the app, and a cart is a standalone
string of JavaScript that runs in a Worker with no module resolution, no DOM
and no network. `scripts/pack-carts.mjs` closes that gap: esbuild bundles
`src/cartridges/<id>/cartridge.ts` together with every module it reaches and
both its JSON string catalogs into one self-contained script, and wraps it in
the two lines the sandbox expects:

```js
kb.game(function (ctx) { return cart.create(ctx) })
```

That script is the cart's `code`. **The file really contains the game** — the
same logic, the same strings, the same hints, the same declared `size`.

Three gates, and anything that fails one is written into `UNPACKABLE` with the
reason rather than quietly dropped:

1. it must be a `live` cartridge;
2. it must bundle with nothing left dangling, and the bundle must survive
   `looksImportable`;
3. **it must actually play** — the packer runs the bundle through the real
   worker bootstrap and requires a first frame with drawing in it.

### What it emits

`src/carts/packed.ts`, a generated module of **manifests, not files**. The PNG
is drawn in the browser at the moment a child asks to save it, through the
same `buildCartPng` a child's own drawing takes — one save path, and nothing
shipped pre-loaded. The label drawings live beside it in `packedArt.ts`,
hand-drawn and *not* generated, so re-running the packer never quietly erases
a picture.

`packed.ts` is committed, so the app and the tests work without running the
script. It therefore goes stale when a cartridge changes: the cart still
plays, it is simply an older version of the game. **Re-run `npm run
pack-carts` after changing a cartridge.** `src/carts/packed.test.ts` holds the
artifact — not the packer — to the claim: every packed cart round-trips
through a real PNG, loads, and draws.

**And you will be told to re-run it.** Going stale used to be silent, which
made a downloadable cart that had quietly stopped being the game it claims to
be a thing nobody would notice. Re-bundling seventeen cartridges on every test
run is far too slow, so the packer records instead — in `SOURCES` — every file
esbuild actually pulled into each bundle (the cartridge, its `en.json` and
`he.json`, and every shared module it reached, `stage.ts` included) plus one
hash over their contents. `packed.test.ts` re-reads those files and re-hashes
them through `src/carts/freshness.ts`, the same code the packer used, and
fails by cartridge name with the command that fixes it:

```
kidboard-ball has changed since it was packed. Run: npm run pack-carts
```

A few hundred small file reads; a few milliseconds. Changing a shared helper
is caught exactly like changing a cartridge, because esbuild — not a guess
about which folder a cartridge lives in — is what says which files went in.

### What packs, and what does not

Fifteen games pack: `ball`, `catch`, `draw`, `drum`, `fish`, `maze`, `mole`,
`piano`, `pop`, `rain`, `robot`, `rocket`, `simon`, `snake`, `stars`. None of
them needed changing; `../src/cartridges/stage.ts` and `NOTES` are plain
arithmetic and bundle away to nothing.

Twelve built-ins do not, and the reasons are only two:

| what | why |
|---|---|
| `animals`, `colors`, `greet`, `letters`, `numbers`, `vehicles` | `echo` cartridges. A cart is a frame loop; there is nothing in the sandbox protocol for a one-shot answer. |
| `count`, `memory`, `rhyme`, `spot`, `story` | `turn` cartridges. Same reason: the protocol has no turn taking. |
| `help` | it lists the registry through Vite's `import.meta.glob`, which is a build-time feature of the app rather than JavaScript. Outside the app there is no registry for it to read. |

Extending the format to echo and turn cartridges would mean a second protocol
in the sandbox and a second kind of cart. That is a real design decision, not
an oversight, and it is not made here.

### A packed built-in always gets renamed

A packed `pop` asks for the word `pop`, which the built-in `pop` already owns
— so the loader renames it `pop2` and says so. That is the naming rule working
exactly as designed, not a defect: the word a child already learned must keep
doing what it did yesterday. It is also the reason these files are most useful
to somebody *else's* Kidboard.

## Known gaps

- **There is still no way to acquire a cart except a local file somebody
  chose.** No gallery, no discovery, no network fetch. See the top of this
  document: that is the limitation, and it is documented rather than solved.
- ~~**A saved tune keeps the notes, not the rhythm.**~~ Closed. `piano` has a
  recording head now: `P` puts it down, `P` lifts it, SPACE plays back what it
  caught — the same pair of buttons `drum` has, so a child who found one
  instrument's has found the other's. A recorded phrase timestamps every note
  and the saved cart plays the child's own rhythm. Free play is still an even
  beat, which is the honest reading of notes nobody was recording.
- **`packed.ts` is committed and can go stale** — but never silently: the
  freshness hashes above fail the test suite by name. See above.
