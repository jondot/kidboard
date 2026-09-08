import type { BlockSpec, CanvasLike, DrawCmd, Locale, Tone } from '../types'

/**
 * The wire between the host and a cart's Worker.
 *
 * The `Canvas` command buffer already IS this boundary — it was built to be
 * JSON, with fractional coordinates and copied sprite rows, precisely so a
 * cartridge could one day run behind a `postMessage`. So there is no second
 * protocol here: the worker records a `DrawCmd[]` and posts it.
 *
 * Every message the HOST receives arrives from code a stranger wrote, so
 * `sanitizeCmds` below treats the buffer as hostile input rather than as data.
 */

export type ToWorker =
  | {
      m: 'init'
      code: string
      seed: number
      locale: Locale
      input: string
      strings: Partial<Record<Locale, Record<string, string>>>
      seq: number
      w: number
      h: number
    }
  | { m: 'key'; key: string; shift: boolean; repeat: boolean; seq: number; w: number; h: number }
  | { m: 'tick'; dt: number; seq: number; w: number; h: number }

export type FromWorker =
  | { m: 'draw'; seq: number; cmds: DrawCmd[]; w: number; h: number; sv?: string }
  | { m: 'audio'; kind: 'note'; hz: number; ms: number }
  | { m: 'audio'; kind: 'noise'; ms: number }
  | { m: 'audio'; kind: 'blip' }
  | { m: 'say'; blocks: BlockSpec[] }
  | { m: 'exit'; souvenir: string }

const TONES: readonly Tone[] = ['plain', 'art', 'info', 'win', 'magic', 'warm', 'cool']

/** A frame with more commands than this is not a picture, it is a denial. */
export const MAX_CMDS = 6000
const MAX_TEXT = 400
const MAX_ROWS = 128

const num = (x: unknown, fallback = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback

const tone = (x: unknown): Tone =>
  TONES.includes(x as Tone) ? (x as Tone) : 'plain'

const text = (x: unknown): string =>
  typeof x === 'string' ? x.slice(0, MAX_TEXT) : ''

/**
 * Turns whatever came back over the wire into commands this app can paint, or
 * drops it. Nothing throws and nothing is repaired creatively: a command that
 * is not one of the shapes below simply does not exist. A cart that posts
 * rubbish draws nothing, which is a blank field, which is not an error state.
 */
export function sanitizeCmds(x: unknown): DrawCmd[] {
  if (!Array.isArray(x)) return []
  const out: DrawCmd[] = []

  for (const raw of x.slice(0, MAX_CMDS)) {
    if (typeof raw !== 'object' || raw === null) continue
    const c = raw as Record<string, unknown>
    switch (c.op) {
      case 'clear': out.push({ op: 'clear' }); break
      case 'put':
        out.push({ op: 'put', x: num(c.x), y: num(c.y), ch: text(c.ch).slice(0, 8), tone: tone(c.tone) })
        break
      case 'text':
        out.push({ op: 'text', x: num(c.x), y: num(c.y), text: text(c.text), tone: tone(c.tone) })
        break
      case 'box':
        out.push({ op: 'box', x: num(c.x), y: num(c.y), w: num(c.w), h: num(c.h), tone: tone(c.tone) })
        break
      case 'emoji':
        out.push({ op: 'emoji', x: num(c.x), y: num(c.y), emoji: text(c.emoji).slice(0, 8) })
        break
      case 'rect':
        out.push({ op: 'rect', x: num(c.x), y: num(c.y), w: num(c.w), h: num(c.h), tone: tone(c.tone) })
        break
      case 'outline':
        out.push({
          op: 'outline', x: num(c.x), y: num(c.y), w: num(c.w), h: num(c.h),
          t: num(c.t, 1), tone: tone(c.tone),
        })
        break
      case 'line':
        out.push({ op: 'line', x: num(c.x), y: num(c.y), x2: num(c.x2), y2: num(c.y2), tone: tone(c.tone) })
        break
      case 'disc':
        out.push({ op: 'disc', x: num(c.x), y: num(c.y), r: num(c.r), tone: tone(c.tone) })
        break
      case 'circle':
        out.push({ op: 'circle', x: num(c.x), y: num(c.y), r: num(c.r), tone: tone(c.tone) })
        break
      case 'sprite': {
        const rows = Array.isArray(c.rows)
          ? c.rows.slice(0, MAX_ROWS).map((r) => text(r))
          : []
        out.push({
          op: 'sprite', x: num(c.x), y: num(c.y), rows, tone: tone(c.tone),
          flipX: c.flipX === true, flipY: c.flipY === true,
          scale: Math.max(1, Math.min(16, Math.round(num(c.scale, 1)))),
        })
        break
      }
      default: break
    }
  }
  return out
}

/** The same treatment for what a cart wants to SAY. */
export function sanitizeBlocks(x: unknown): BlockSpec[] {
  if (!Array.isArray(x)) return []
  const out: BlockSpec[] = []
  for (const raw of x.slice(0, 12)) {
    if (typeof raw !== 'object' || raw === null) continue
    const b = raw as Record<string, unknown>
    if (b.kind === 'art') out.push({ kind: 'art', art: text(b.art), tone: tone(b.tone) })
    else out.push({ kind: 'text', text: text(b.text), tone: tone(b.tone) })
  }
  return out
}

/**
 * Plays a recorded buffer back onto a real canvas.
 *
 * This is the host side of the boundary and the reason a cart needs no
 * special renderer: whatever a Worker posts is replayed through exactly the
 * same `CanvasLike` a built-in cartridge draws with, so a cart and a built-in
 * are the same picture by the time anything is painted.
 */
export function replay(cmds: readonly DrawCmd[], c: CanvasLike): void {
  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'clear': c.clear(); break
      case 'put': c.put(cmd.x, cmd.y, cmd.ch, cmd.tone); break
      case 'text': c.text(cmd.x, cmd.y, cmd.text, cmd.tone); break
      case 'box': c.box(cmd.x, cmd.y, cmd.w, cmd.h, cmd.tone); break
      case 'emoji': c.emoji(cmd.x, cmd.y, cmd.emoji); break
      case 'rect': c.rect(cmd.x, cmd.y, cmd.w, cmd.h, cmd.tone); break
      case 'outline': c.outline(cmd.x, cmd.y, cmd.w, cmd.h, cmd.tone, cmd.t); break
      case 'line': c.line(cmd.x, cmd.y, cmd.x2, cmd.y2, cmd.tone); break
      case 'disc': c.disc(cmd.x, cmd.y, cmd.r, cmd.tone); break
      case 'circle': c.circle(cmd.x, cmd.y, cmd.r, cmd.tone); break
      case 'sprite':
        c.sprite(cmd.x, cmd.y, cmd.rows, cmd.tone, {
          flipX: cmd.flipX, flipY: cmd.flipY, scale: cmd.scale,
        })
        break
    }
  }
}
