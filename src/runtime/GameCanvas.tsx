import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Frame } from '../types'
import { useThemeId } from '../theme/context'
import type { FrameChannel } from './frameChannel'
import { rasterizeWithShapes } from './Canvas'
import { CanvasView } from './CanvasView'
import {
  createGridRenderer, layoutGrid, tonesFrom,
  type Ctx2D, type GridRenderer, type Surface,
} from './GridCanvas'

/**
 * One `<canvas>` per live block, running or frozen. This is the only place a
 * game frame becomes pixels.
 *
 * Responsive by construction: the wrapper is full width, a `ResizeObserver`
 * reports the real container width, and the cell size is that width divided by
 * the column count the session already chose for this frame. Rotating a tablet
 * or dragging a window reflows the game without the cartridge knowing.
 *
 * DEGRADATION. If a 2D context cannot be acquired — jsdom, a locked-down
 * embedder, a browser that has lost its GPU — this falls back to the DOM grid
 * renderer that shipped in v1. Slower, and its motion is quantized, but it is
 * a picture of the game. There is no error state a child can see.
 */
export function GameCanvas({
  frame,
  channel,
  frozen,
}: {
  frame: Frame
  channel?: FrameChannel
  frozen?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<GridRenderer | null>(null)
  const current = useRef<Frame>(frame)

  const [width, setWidth] = useState(0)
  const [grid, setGrid] = useState({ w: frame.w, h: frame.h })
  // Only ever set once, and only to `true`: a context we could not acquire is
  // not going to appear later in the same mount.
  const [fallback, setFallback] = useState(false)
  const [domFrame, setDomFrame] = useState<Frame>(frame)

  /**
   * THE THEME SEAM. The glyph atlas is keyed partly on the palette and is
   * rebuilt only when that key changes; the palette itself arrives through
   * CSS custom properties, and a CSS variable changing does not re-run a React
   * effect. So the active theme's id joins the geometry in the dependency list
   * below: a theme switch rebuilds the renderer, `tonesFrom` reads the new
   * `--kb-*` values off the live element, and `atlasKey` sees a new theme key
   * and throws the stale bitmaps away. Without it a running game keeps
   * painting in the old palette until something happens to resize it.
   */
  const themeId = useThemeId()

  /** The single entry point for a new frame, whoever produced it. */
  const accept = useCallback((f: Frame) => {
    current.current = f
    setGrid((g) => (g.w === f.w && g.h === f.h ? g : { w: f.w, h: f.h }))
    if (fallback) setDomFrame(f)
    else renderer.current?.paint(f)
  }, [fallback])

  // --- measure -----------------------------------------------------------
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const read = () => setWidth(el.clientWidth || 0)
    read()
    const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (!RO) return
    const ro = new RO(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- (re)build the renderer whenever the geometry changes --------------
  useLayoutEffect(() => {
    if (fallback) return
    const el = canvas.current
    if (!el) return

    let ctx: Ctx2D | null = null
    try {
      ctx = (el as unknown as Surface).getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) {
      setFallback(true)
      return
    }

    const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1
    const lay = layoutGrid(width, grid.w, grid.h, dpr)
    el.width = lay.pixelW
    el.height = lay.pixelH
    el.style.width = `${lay.cssW}px`
    el.style.height = `${lay.cssH}px`

    const r = createGridRenderer({ ctx, layout: lay, colors: tonesFrom(el) })
    renderer.current = r
    r.paint(current.current)
    return () => {
      r.destroy()
      renderer.current = null
    }
  }, [width, grid.w, grid.h, fallback, themeId])

  // --- frames from the transcript (a frozen still) -----------------------
  useEffect(() => { accept(frame) }, [frame, accept])

  // --- frames from the running session, straight off the rAF callback ----
  useEffect(() => channel?.subscribe(accept), [channel, accept])

  return (
    <div ref={host} className="kb:w-full" data-kb-game={frozen ? 'frozen' : 'running'}>
      {fallback ? (
        <CanvasView cells={rasterizeWithShapes(domFrame.cmds, domFrame.w, domFrame.h)} />
      ) : (
        // `block` kills the inline-element baseline gap under the canvas. No
        // bidi isolation is needed here: a canvas has no bidi algorithm at
        // all, so a game frame simply cannot be reordered under Hebrew.
        <canvas ref={canvas} className="kb:block" />
      )}
    </div>
  )
}
