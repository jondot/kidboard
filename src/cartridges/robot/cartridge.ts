import type { CanvasLike, LiveCartridge } from '../../types'
import en from './en.json'
import he from './he.json'
import { HOLD_IGNORE } from '../pacing'
import { PIXEL_ASPECT, sameStage, stageOf } from '../stage'

/**
 * ROBOT — baby Logo.
 *
 * The child queues arrow presses into a PROGRAM, watches it build in the tray
 * along the bottom, presses ENTER, and then watches the robot execute it one
 * step at a time. That gap between planning and running is the whole point;
 * it is the difference between driving a car and writing down directions.
 *
 * Two consequences that are not negotiable:
 *
 * 1. IT IS NOT A DRIVING GAME. An arrow never moves the robot. It appends a
 *    step. Nothing moves until ENTER.
 * 2. THE PROGRAM SURVIVES ITS OWN RUN. A child who was one step short and had
 *    to retype the whole thing would not try again — so a finished run leaves
 *    the program exactly where it was, the robot parked wherever it got to,
 *    and the screen completely still. Backspace takes the last step back, an
 *    arrow adds one, ENTER rewinds the robot home and runs it again. Editing
 *    a plan and re-running it is the thing worth learning here.
 *
 * NOTHING RESTARTS ITSELF. When a run ends the game holds, indefinitely,
 * until the child asks for something. That pause is where the child looks at
 * where their plan actually took them.
 *
 * AND THEN THERE IS A NEW STAR. A run that LANDED on the star holds the same
 * way, and the child's next key gives them a fresh one with an empty tray —
 * so a solver gets another puzzle without ESC-and-retype, and nothing was
 * dealt over the moment they solved it. A run that missed changes nothing at
 * all: that plan is still there to edit, which is rule 2 above.
 */

// The DESIGN size: a square-ish board is what a step-by-step walk wants, so
// the declared aspect is 1 and the stage below keeps it square on any screen.
const COLS = 26
const ASPECT = 1

// ---- THE STAGE -----------------------------------------------------------
//
// A logical pixel is 0.6 as wide as it is tall, so a `pw x ph` block of
// pixels reads as `0.6 * pw : ph` on screen. Every ratio here is on-screen.
// At the declared width the canvas already is roughly square; on a desktop it
// becomes a letterbox, and the game draws into a centred square inside it
// rather than smearing a five-by-seven board across three feet of monitor.
// The BOUNDS are all this game owns: a board of tiles wants a SQUARE screen,
// which is narrower than the 3:4..4:3 house default at both ends. The
// centring, the rounding and the pixel-aspect conversion are `stageOf`'s,
// shared with every other game that draws shapes — this file used to carry a
// byte-identical private copy of them, which is what a contributor writing a
// square game #21 would have read and copied in turn. See `../stage`, and
// `src/cartridges/README.md`.
const BOUNDS = { min: 0.85, max: 1.15 } as const

// ---- THE INK -------------------------------------------------------------
//
// ONE tone for the whole game: `plain`, the theme's own foreground — the ink
// the terminal already writes in. Monochrome, and it re-tints with the theme
// for free. The robot is told apart from its world by MASS and SILHOUETTE,
// never by hue: the robot and the star are solid blocks with unmistakable
// outlines, while everything that is merely world — the board frame, the tile
// ticks, the home ring, the program tray — is a thin rail or a hollow ring.
const INK = 'plain'

/**
 * 13 x 8, which is 0.98 on screen — very nearly square, and that is the point:
 * a board tile is square too, so a NARROWER robot left most of its tile empty
 * and read as a distant speck. Antennae, a face with two eye holes, arms and
 * two feet.
 */
const ROBOT = [
  '   #     #   ',
  '   #######   ',
  '  ## ### ##  ',
  '  #########  ',
  '#############',
  ' ########### ',
  ' ########### ',
  ' ###     ### ',
]

/** 13 x 7, a five-pointed star — unmistakably not a robot at any distance a
 *  six-year-old sits from a screen, which is what carries the difference when
 *  there is only one colour to go round. */
const STAR = [
  '      #      ',
  '     ###     ',
  '#############',
  ' ########### ',
  '  #########  ',
  ' ####   #### ',
  '##         ##',
]

// Two arrow bitmaps cover all four directions: down is up flipped, left is
// right flipped. Each is a triangular head on a shaft, and each is drawn
// LONG IN THE DIRECTION IT POINTS — a pixel is 0.6 as wide as it is tall, so
// an up arrow with the same pixel counts as a right arrow reads as a squat
// blob rather than as a direction.
const ARROW_UP = [
  '   #   ',
  '  ###  ',
  ' ##### ',
  '#######',
  '  ###  ',
  '  ###  ',
  '  ###  ',
]
const ARROW_RIGHT = [
  '      #    ',
  '      ###  ',
  '###########',
  '      ###  ',
  '      #    ',
]

const SPRITE_SCALE = 2

/** A bitmap's drawn size, so nothing below hard-codes a sprite's dimensions
 *  and every one of them stays centred when its picture is redrawn. */
const sizeOf = (bitmap: string[]) => ({
  w: Math.max(...bitmap.map((r) => r.length)) * SPRITE_SCALE,
  h: bitmap.length * SPRITE_SCALE,
})

// ---- the world -----------------------------------------------------------

/** Board tiles. Small enough that a six-year-old can see the whole plan. */
const GW = 7
const GH = 5
const START = { c: 1, r: 3 }
/** Six steps. More than enough for any star (they are placed within five),
 *  and few enough that the tray never needs a second row or an ellipsis. */
const MAX_STEPS = 6

// ---- the timing, in SECONDS ----------------------------------------------
const STEP_SECS = 0.45    // one tile per beat: walkable, watchable
const HOME_SECS = 0.5     // the visible rewind before a run
const CHEER_SECS = 0.9    // the flourish at the end, then stillness

type Dir = 'up' | 'down' | 'left' | 'right'
type Tile = { c: number; r: number }

const KEY_DIR: Record<string, Dir> = {
  // Left is screen-left in every language; these are physical directions.
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const STEP: Record<Dir, Tile> = {
  up: { c: 0, r: -1 },
  down: { c: 0, r: 1 },
  left: { c: -1, r: 0 },
  right: { c: 1, r: 0 },
}

const ease = (t: number): number => t * t * (3 - 2 * t)
const same = (a: Tile, b: Tile): boolean => a.c === b.c && a.r === b.r

const cartridge: LiveCartridge = {
  kind: 'live',
  apiVersion: 1,
  id: 'robot',
  // Nothing in the live registry claimed `robot`, `רובוט` or 🤖 — checked
  // against every trigger table, including the generated ones in `animals`,
  // `colors` and `vehicles` — so this game keeps the plain noun.
  triggers: { en: ['robot'], he: ['רובוט'], emoji: ['🤖'] },
  locales: ['en', 'he'],
  strings: { en, he },
  size: { cols: COLS, aspect: ASPECT },

  // The shell appends the ESC hint itself.
  hints: (t) => [
    { keys: '↑ ↓ ← →', label: t('robot.add') },
    { keys: 'ENTER', label: t('robot.run') },
    { keys: '⌫', label: t('robot.undo') },
  ],

  create(ctx) {
    let stage = stageOf(COLS * 8, Math.round((COLS * PIXEL_ASPECT) / ASPECT) * 8, BOUNDS)
    let W = stage.w
    let H = stage.h

    // The star sits between two and five steps away, so every star is
    // reachable inside the six the tray holds — with room to spare for a
    // detour, which is what makes editing a plan worth doing.
    const reachable: Tile[] = []
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        const d = Math.abs(c - START.c) + Math.abs(r - START.r)
        if (d >= 2 && d <= 5) reachable.push({ c, r })
      }
    }
    /**
     * THE STAR IS NOT FOR THE LIFE OF THE SESSION. Reaching it holds — the
     * ring opens, the robot stands on it, nothing moves — and then the
     * child's next key deals a NEW one and clears the tray. Before this it
     * was a `const`, which made `robot` the only game in the set handing a
     * child one puzzle per session; `count`, `spot` and `rhyme` all deal the
     * next on the child's next line. Nothing here re-arms on a timer, and a
     * solver gets another puzzle without ESC-and-retype.
     */
    let star: Tile = ctx.rng.pick(reachable)

    /** Somewhere else on the board: the same star twice running would read as
     *  "nothing happened" rather than as a new puzzle. */
    const nextStar = (): void => {
      const away = reachable.filter((t) => !same(t, star))
      star = ctx.rng.pick(away.length > 0 ? away : reachable)
    }

    const program: Dir[] = []
    let pos: Tile = { ...START }

    /**
     * 'plan'  — the resting state, and where a finished run leaves us. The
     *           program is on the tray, the robot is parked, nothing moves.
     * 'home'  — the visible rewind: the robot walks back to the start so the
     *           program always means the same thing.
     * 'run'   — executing, one tile per beat.
     * 'cheer' — a single flourish, then stillness again.
     */
    let phase: 'plan' | 'home' | 'run' | 'cheer' = 'plan'

    let stepIdx = 0
    let stepT = 0
    let from: Tile = { ...START }
    let to: Tile = { ...START }
    let homeT = 0
    let homeFrom: Tile = { ...START }
    let cheerT = 0
    // Seconds since the run ended and the board went quiet. Mid-run the
    // keyboard is inert, which hid a gap: every key the child had been
    // leaning on the whole time landed the instant the flourish finished, so
    // a held Backspace ate the plan they had just watched run. Starts already
    // spent — opening the game is not a run ending. See `../pacing`.
    let planT = HOLD_IGNORE

    // What the souvenir replays: the last program that actually RAN, not
    // whatever happens to be sitting on the tray.
    let ranProgram: Dir[] = []
    let ranReached = false
    /** Standing on the star, waiting for the child to ask for the next one. */
    let solved = false

    const inBoard = (t: Tile): boolean =>
      t.c >= 0 && t.c < GW && t.r >= 0 && t.r < GH

    /** Where a step lands. A step off the edge simply does not move the
     *  robot — it is a bump, never a crash and never an error. */
    const landing = (t: Tile, d: Dir): Tile => {
      const next = { c: t.c + STEP[d].c, r: t.r + STEP[d].r }
      return inBoard(next) ? next : t
    }

    const beginStep = (): void => {
      from = { ...pos }
      to = landing(pos, program[stepIdx]!)
      if (same(from, to)) ctx.audio.noise(60)
      else ctx.audio.note(340 + stepIdx * 40, 80)
    }

    const finishRun = (): void => {
      ranProgram = [...program]
      ranReached = same(pos, star)
      phase = 'cheer'
      cheerT = 0
      stepT = 0
      if (ranReached) {
        ctx.audio.note(523, 140)
        ctx.audio.note(659, 140)
        ctx.audio.note(784, 220)
      } else {
        // Not a failure and never announced as one: a soft chime that says
        // "that is where you got to", and then the screen goes quiet.
        ctx.audio.note(392, 200)
      }
    }

    const refit = (c: CanvasLike): void => {
      const s = stageOf(Math.max(64, c.pw), Math.max(64, c.ph), BOUNDS)
      if (sameStage(s, stage)) return
      stage = s
      W = s.w
      H = s.h
    }

    /**
     * Every pixel of layout, derived fresh from the live stage. Nothing about
     * the board is stored, and the robot, the star and the program are all in
     * TILE coordinates — so a window drag mid-run costs exactly nothing.
     */
    const geom = () => {
      const trayH = Math.max(26, Math.round(H * 0.22))
      const areaH = H - trayH - 4
      // Twelve and fourteen, not eight: the board's frame is a three-pixel
      // rail drawn five pixels outside the tiles, so the tiles have to leave
      // it that much room or the rail falls off the top of the stage.
      const tileH = Math.min((areaH - 12) / GH, ((W - 14) / GW) * PIXEL_ASPECT)
      const tileW = tileH / PIXEL_ASPECT
      const bw = tileW * GW
      const bh = tileH * GH
      return {
        trayH, trayY: H - trayH, tileW, tileH, bw, bh,
        bx: (W - bw) / 2,
        by: (areaH - bh) / 2,
      }
    }

    type G = ReturnType<typeof geom>
    const centreOf = (g: G, t: { c: number; r: number }) => ({
      x: g.bx + (t.c + 0.5) * g.tileW,
      y: g.by + (t.r + 0.5) * g.tileH,
    })

    /** The robot's tile position right now, fractional while it is walking. */
    const walker = (): { c: number; r: number } => {
      if (phase === 'run') {
        const p = Math.min(1, stepT / STEP_SECS)
        return { c: from.c + (to.c - from.c) * p, r: from.r + (to.r - from.r) * p }
      }
      if (phase === 'home') {
        const p = ease(Math.min(1, homeT / HOME_SECS))
        return {
          c: homeFrom.c + (START.c - homeFrom.c) * p,
          r: homeFrom.r + (START.r - homeFrom.r) * p,
        }
      }
      return pos
    }

    return {
      onKey(k) {
        // Mid-run the keyboard is deliberately inert. Watching is the part
        // that teaches; being able to interfere would turn it back into
        // driving.
        if (phase !== 'plan') return
        // ...and the first half second after a run belongs to the child's
        // eyes, for the same reason the run itself did.
        if (planT < HOLD_IGNORE) return

        // Standing on the star: the picture has been held for as long as the
        // child wanted it, and ANY key now is them asking for another go. A
        // new star, an empty tray, the robot back home — a fresh puzzle, and
        // not one word of explanation needed.
        if (solved) {
          solved = false
          nextStar()
          program.length = 0
          pos = { ...START }
          ctx.audio.note(560, 90)
          ctx.audio.note(700, 120)
          return
        }

        const d = KEY_DIR[k.key]
        if (d) {
          // A held arrow must not machine-gun six steps into the tray. A
          // queued step is a decision, so only a real press counts.
          if (k.repeat) return
          if (program.length >= MAX_STEPS) { ctx.audio.noise(50); return }
          program.push(d)
          ctx.audio.note(420 + program.length * 30, 70)
          return
        }

        if (k.key === 'Backspace' || k.key === 'Delete') {
          if (program.length === 0) return
          program.pop()
          ctx.audio.blip()
          return
        }

        if (k.key === 'Enter') {
          if (k.repeat || program.length === 0) return
          stepIdx = 0
          stepT = 0
          if (same(pos, START)) {
            phase = 'run'
            beginStep()
          } else {
            // Rewind first, visibly. A program always runs from home, which
            // is what makes it a program rather than a nudge.
            phase = 'home'
            homeT = 0
            homeFrom = { ...pos }
          }
        }
      },

      tick(dt) {
        if (phase === 'home') {
          homeT += dt
          if (homeT >= HOME_SECS) {
            pos = { ...START }
            phase = 'run'
            stepIdx = 0
            stepT = 0
            beginStep()
          }
          return
        }

        if (phase === 'run') {
          stepT += dt
          // A `while`, not an `if`: a long frame must never silently drop a
          // step, or the program the child watches stops being the program
          // they wrote.
          while (phase === 'run' && stepT >= STEP_SECS) {
            stepT -= STEP_SECS
            pos = { ...to }
            stepIdx += 1
            if (stepIdx >= program.length) finishRun()
            else beginStep()
          }
          return
        }

        if (phase === 'cheer') {
          cheerT += dt
          // ...and then it simply stops. Nothing is reset and the program
          // stays exactly where it is — a child one step short adds one arrow
          // rather than retyping. The child is looking at their result, and
          // for the next half second nothing they were already holding can
          // take it away from them.
          if (cheerT >= CHEER_SECS) {
            phase = 'plan'
            planT = 0
            // Landing on the star arms the NEXT puzzle — it does not deal it.
            // The board holds until the child presses something.
            solved = ranReached
          }
          return
        }

        // Parked in 'plan'. The clock runs only far enough to end the ignore
        // window; nothing about this picture depends on time.
        if (planT < HOLD_IGNORE) planT += dt
      },

      draw(c) {
        refit(c)
        c.clear()
        const { x: ox, y: oy } = stage
        const g = geom()

        // The board: a thin frame and one tick per tile, so a child can see
        // the steps a plan will take before it takes them.
        c.outline(ox + g.bx - 5, oy + g.by - 5, g.bw + 10, g.bh + 10, INK, 3)
        for (let r = 0; r < GH; r++) {
          for (let col = 0; col < GW; col++) {
            const p = centreOf(g, { c: col, r })
            c.rect(ox + p.x - 2, oy + p.y - 1, 4, 2, INK)
          }
        }

        // Home: a hollow ring on the start tile. The robot always comes back
        // here before a run, so the child can see where "back" is.
        const home = centreOf(g, START)
        c.circle(ox + home.x, oy + home.y, 7, INK)

        // The star. Solid, and shaped like nothing else on the board.
        const sp = centreOf(g, star)
        const ss = sizeOf(STAR)
        c.sprite(ox + sp.x - ss.w / 2, oy + sp.y - ss.h / 2, STAR, INK,
          { scale: SPRITE_SCALE })

        // The robot. Its tile position is fractional while it walks, and that
        // fraction goes straight through to the painter.
        const wk = walker()
        const rp = centreOf(g, wk)
        const rs = sizeOf(ROBOT)
        c.sprite(ox + rp.x - rs.w / 2, oy + rp.y - rs.h / 2, ROBOT, INK,
          { scale: SPRITE_SCALE })

        // The flourish: a ring opening out from wherever the robot stopped —
        // the same warm gesture whether or not it landed on the star, with a
        // second ring around the star itself when it did.
        if (phase === 'cheer') {
          const p = Math.min(1, cheerT / CHEER_SECS)
          c.circle(ox + rp.x, oy + rp.y, 9 + p * 18, INK)
          if (ranReached) c.circle(ox + sp.x, oy + sp.y, 14 + p * 22, INK)
        }

        // THE PROGRAM TRAY. Six slots, thin frame, one solid arrow per queued
        // step — no numbering, no index, nothing counted. The bar under a
        // slot is the step being executed right now, and it is a bar because
        // a bar is a shape and a shape is not a number.
        const tx = 4
        const tw = W - 8
        c.outline(ox + tx, oy + g.trayY, tw, g.trayH - 2, INK, 3)
        const slotW = (tw - 10) / MAX_STEPS
        for (let i = 0; i < MAX_STEPS; i++) {
          const sx = tx + 5 + slotW * i
          const cxs = sx + slotW / 2
          const d = program[i]
          if (!d) {
            c.rect(ox + cxs - 2, oy + g.trayY + g.trayH / 2 - 1, 4, 2, INK)
            continue
          }
          const bitmap = d === 'up' || d === 'down' ? ARROW_UP : ARROW_RIGHT
          const as = sizeOf(bitmap)
          c.sprite(ox + cxs - as.w / 2, oy + g.trayY + 4, bitmap, INK, {
            scale: SPRITE_SCALE,
            flipY: d === 'down',
            flipX: d === 'left',
          })
          const running = (phase === 'run' || phase === 'home') && i === stepIdx
          if (running) c.rect(ox + cxs - 8, oy + g.trayY + g.trayH - 9, 16, 3, INK)
        }
      },

      // The program, replayed in words, joined by "then" — which is both what
      // a sequence actually means and what keeps "right right up" from
      // reading as a stutter. Never a count, never a step number, and a warm
      // line for a child who never pressed ENTER at all.
      souvenir: () => {
        if (ranProgram.length === 0) return ctx.t('robot.souvenir.none')
        const steps = ranProgram
          .map((d) => ctx.t(`robot.dir.${d}`))
          .join(` ${ctx.t('robot.then')} `)
        return ranReached
          ? ctx.t('robot.souvenir.star', { steps })
          : ctx.t('robot.souvenir.walk', { steps })
      },
    }
  },
}

export default cartridge
