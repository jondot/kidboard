export type Locale = 'en' | 'he'
export type Dir = 'ltr' | 'rtl'

export type Tone =
  | 'plain' | 'art' | 'info' | 'win' | 'magic' | 'warm' | 'cool'

export type Scale = 'normal' | 'big' | 'giant' | 'flood'

/** A serializable description of output. Never JSX. */
export type BlockSpec =
  | { kind: 'text'; text: string; tone?: Tone; scale?: Scale; rainbow?: boolean }
  /**
   * `scale` is the drawing's SIZE, and it exists because a board made of five
   * emoji and a board made of a thousand canvas pixels are the same game to a
   * child and were not the same size on screen. Omitted means "the machine's
   * own type size", which is what every drawing wanted before boards did.
   */
  | { kind: 'art'; art: string; tone?: Tone; scale?: Scale }

export type LiveState = 'running' | 'frozen' | 'collapsed'

export type Cell = { ch: string; tone: Tone }

/**
 * One game frame as it crosses the runtime boundary: the recorded command
 * buffer plus the grid it was recorded against. Deliberately NOT `Cell[][]` —
 * the cells are the integer *model* of a frame (what `rasterize` produces, and
 * what every snapshot test compares), while the commands still carry the
 * fractional positions the canvas painter needs for continuous motion.
 * Serializable, so a Worker-hosted cartridge can post one unchanged.
 */
export type Frame = { cmds: DrawCmd[]; w: number; h: number }

export const EMPTY_FRAME: Frame = { cmds: [], w: 0, h: 0 }

export type Block =
  | { id: string; kind: 'echo'; prompt: string; text: string }
  /**
   * `group` is the paragraph this block was said in. A later say in the same
   * group supersedes it; a block with no group is permanent scrollback. See
   * `SayOpts` and `transcriptStore.ts`.
   */
  | { id: string; kind: 'static'; spec: BlockSpec; group?: string }
  | {
      id: string
      kind: 'live'
      cartridgeId: string
      title: string
      state: LiveState
      /** The still shown while frozen. Empty while running: a running block
       *  is painted straight to its canvas, not through the transcript. */
      frame: Frame
      souvenir: string
    }

export type Key = {
  key: string
  shift: boolean
  repeat: boolean
}

export type Hint = { keys: string; label: string }

export type TriggerTable = {
  en?: string[]
  he?: string[]
  emoji?: string[]
}

export type Rng = {
  float(): number
  int(maxExclusive: number): number
  pick<T>(xs: readonly T[]): T
  chance(p: number): boolean
}

/**
 * The percussion bank, by name. A cartridge asks for a `kick`; what a kick is
 * MADE of — the falling pitch, the filtered noise — lives in `runtime/audio`,
 * because scheduling curves on a live audio graph is not the "plain data and
 * functions" a cartridge is allowed to be. Two cartridges that both want a
 * drum get the same drum rather than two guesses at one.
 */
export type Voice =
  // The drum kit.
  | 'kick' | 'snare' | 'hat' | 'clap' | 'tom'
  // The other kind of percussion. Same machinery, ruder numbers.
  | 'squeak' | 'toot' | 'rumble' | 'blast'

export type Audio = {
  note(hz: number, ms: number): void
  noise(ms: number): void
  blip(): void
  /** Strike one drum. Silent — never throwing — when audio is off. */
  hit(voice: Voice): void
}

export type T = (key: string, vars?: Record<string, string | number>) => string

/**
 * How a cartridge says something, beyond the words.
 *
 * `replace` is the whole of it, and it exists because a board-drawing turn
 * cartridge (`memory`, `count`, `spot`) redraws its board on every line the
 * child types. Appending each redraw left four stacked grids after three
 * misses and buried the one the child was meant to look at.
 *
 * THE MODEL IS A PARAGRAPH.
 *
 *   ctx.say(blocks, { replace: true })  supersedes what I last said with
 *                                       `replace` — one live board that
 *                                       updates in place
 *   ctx.say(blocks)                     a new paragraph: everything said
 *                                       before it is now scrollback and can
 *                                       never be superseded again
 *
 * So a finished round says its cheer plainly, which seals the board the child
 * just solved into the transcript, and the next round's board starts a fresh
 * paragraph of its own. The child's typed lines are never touched by either.
 *
 * Plain JSON, like every other `Ctx` argument, so this crosses a `postMessage`
 * boundary unchanged.
 */
export type SayOpts = { replace?: boolean }

export type Ctx = {
  t: T
  locale: Locale
  dir: Dir
  rng: Rng
  audio: Audio
  /**
   * The normalized word the child typed to reach this cartridge, or the
   * corrected word when a typo was forgiven. Empty for programmatic starts.
   * `animals` needs this: typing `cat` must show a cat, not a random animal.
   */
  input: string
  say(blocks: BlockSpec[], opts?: SayOpts): void
  exit(): void
}

/**
 * A command buffer carries two kinds of drawing, and the coordinate space is
 * the difference between them:
 *
 * - CHARACTER ops (`put`, `text`, `box`, `emoji`) take CELL coordinates.
 * - SHAPE ops (`rect`, `outline`, `line`, `disc`, `circle`, `sprite`) take
 *   PIXEL coordinates, on a field that subdivides every cell into 8 x 8
 *   logical pixels (`PX_PER_CELL` in `runtime/shapes.ts`).
 *
 * Both land on the same surface, and a cartridge uses either or both. Every
 * member is plain JSON — no functions, no class instances — because this
 * buffer is what a Worker-hosted cartridge will one day post across.
 */
export type DrawCmd =
  | { op: 'clear' }
  | { op: 'put'; x: number; y: number; ch: string; tone: Tone }
  | { op: 'text'; x: number; y: number; text: string; tone: Tone }
  | { op: 'box'; x: number; y: number; w: number; h: number; tone: Tone }
  | { op: 'emoji'; x: number; y: number; emoji: string }
  // ---- pixel ops: coordinates are logical pixels, 8 per cell -------------
  | { op: 'rect'; x: number; y: number; w: number; h: number; tone: Tone }
  /** Hollow rectangle. `t` is the wall thickness, drawn inwards. */
  | { op: 'outline'; x: number; y: number; w: number; h: number; t: number; tone: Tone }
  /**
   * A line's start is `x`/`y`, not `x1`/`y1`, so that EVERY command except
   * `clear` still carries an `x` and a `y`. Several cartridge tests walk a
   * buffer generically and read `cmd.x` after excluding `clear`; an `x1` here
   * would have broken all of them for no benefit.
   */
  | { op: 'line'; x: number; y: number; x2: number; y2: number; tone: Tone }
  /** Filled circle. `r` is the HORIZONTAL radius; see `runtime/shapes.ts`. */
  | { op: 'disc'; x: number; y: number; r: number; tone: Tone }
  | { op: 'circle'; x: number; y: number; r: number; tone: Tone }
  /** A bitmap: one string per row, any character on, a space off. */
  | {
      op: 'sprite'
      x: number
      y: number
      rows: string[]
      tone: Tone
      flipX: boolean
      flipY: boolean
      scale: number
    }

/** Mirroring and whole-pixel magnification for `CanvasLike.sprite`. */
export type SpriteOpts = { flipX?: boolean; flipY?: boolean; scale?: number }

// ---- Cartridges ---------------------------------------------------------

/**
 * Structural type so cartridges never import the Canvas class directly.
 *
 * `w` and `h` are LIVE: they are the real grid for this frame and change when
 * the container is resized or a tablet is rotated. Lay out against them, never
 * against module constants.
 *
 * Coordinates are cells and may be fractional. `x = 12.4` is drawn at 12.4
 * cell-widths on the canvas; `rasterize` rounds it when it builds the integer
 * `Cell[][]` model that snapshot tests compare.
 */
export type CanvasLike = {
  readonly w: number
  readonly h: number
  /**
   * The pixel field: `w * 8` by `h * 8`. LIVE, exactly like `w`/`h` — lay a
   * shape-drawing game out against these and it survives a resize.
   */
  readonly pw: number
  readonly ph: number

  // Character ops. Cell coordinates.
  clear(): void
  put(x: number, y: number, ch: string, tone?: Tone): void
  text(x: number, y: number, text: string, tone?: Tone): void
  box(x: number, y: number, w: number, h: number, tone?: Tone): void
  emoji(x: number, y: number, emoji: string): void

  // Shape ops. PIXEL coordinates, flat single-tone fills, no gradients and no
  // blending — one colour per object, the way a 2600 drew.
  /** Filled rectangle. The workhorse: paddles, bars, bricks, walls. */
  rect(x: number, y: number, w: number, h: number, tone?: Tone): void
  /** Hollow rectangle; `t` is the wall thickness in pixels, drawn inwards. */
  outline(x: number, y: number, w: number, h: number, tone?: Tone, t?: number): void
  line(x: number, y: number, x2: number, y2: number, tone?: Tone): void
  /** Filled circle. `r` is the horizontal radius; it reads round on screen. */
  disc(x: number, y: number, r: number, tone?: Tone): void
  circle(x: number, y: number, r: number, tone?: Tone): void
  /** A bitmap: one string per row, any character on, a space off. */
  sprite(
    x: number, y: number, rows: readonly string[],
    tone?: Tone, opts?: SpriteOpts,
  ): void
}

type Base = {
  apiVersion: 1
  id: string
  triggers: TriggerTable
  locales: Locale[]
  strings?: Partial<Record<Locale, Record<string, string>>>
}

/** One-shot: type a word, get output. */
export type EchoCartridge = Base & {
  kind: 'echo'
  respond(ctx: Ctx): void
}

/** A typed conversation that holds state across lines. Owns no frame. */
export type TurnInstance = {
  start(): void
  onLine(text: string): void
  souvenir?(): string
}

export type TurnCartridge = Base & {
  kind: 'turn'
  hints(t: T): Hint[]
  create(ctx: Ctx): TurnInstance
}

/** Owns a frame loop and a character canvas. ESC freezes and exits. */
export type LiveInstance = {
  onKey?(k: Key): void
  tick?(dt: number): void
  draw(c: CanvasLike): void
  souvenir?(): string
}

/**
 * What a game declares instead of pixels: a minimum column count and the
 * width-to-height ratio of the play area. Rows follow from the two. On a wide
 * screen the runtime hands the game *more* columns rather than bigger cells,
 * which is why `CanvasLike.w`/`h` are read live each frame.
 */
export type GameSize = { cols: number; aspect: number }

export type LiveCartridge = Base & {
  kind: 'live'
  needsKeyboard?: boolean
  size: GameSize
  hints(t: T): Hint[]
  create(ctx: Ctx): LiveInstance
}

export type Cartridge = EchoCartridge | TurnCartridge | LiveCartridge
