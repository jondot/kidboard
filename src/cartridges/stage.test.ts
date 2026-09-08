import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_ASPECT, MIN_ASPECT, PIXEL_ASPECT, sameStage, seenAspect, stageOf,
} from './stage'
import { PIXEL_ASPECT as SHAPES_PIXEL_ASPECT } from '../runtime/shapes'

describe('stageOf', () => {
  it('re-exports the one pixel aspect rather than keeping a copy', () => {
    // Five cartridges each held their own `const PIXEL_ASPECT = 0.6`. A
    // drifted copy would have turned one game's circles into eggs while every
    // other game stayed round, which is exactly the kind of bug nobody looks
    // for. There is one number now, and this is it.
    expect(PIXEL_ASPECT).toBe(SHAPES_PIXEL_ASPECT)
  })

  it('gives the whole field back when it is already field-shaped', () => {
    // 240 x 144 px reads as 0.6 * 240 : 144 = 1:1 on screen — square, well
    // inside 3:4 .. 4:3 — so there is nothing to trim.
    expect(stageOf(240, 144)).toEqual({ x: 0, y: 0, w: 240, h: 144 })
  })

  it('pillarboxes a wide field instead of letting the picture stretch', () => {
    // What a 1280 px desktop actually hands a 30-column game.
    const s = stageOf(600, 144)
    expect(s.w).toBeLessThan(600)
    expect(s.h).toBe(144)
    expect(seenAspect(s.w, s.h)).toBeCloseTo(MAX_ASPECT, 2)
    // Centred, with the same margin either side.
    expect(s.x).toBe(Math.round((600 - s.w) / 2))
    expect(s.y).toBe(0)
  })

  it('letterboxes a tall field the same way', () => {
    const s = stageOf(120, 400)
    expect(s.w).toBe(120)
    expect(s.h).toBeLessThan(400)
    expect(seenAspect(s.w, s.h)).toBeCloseTo(MIN_ASPECT, 2)
    expect(s.y).toBe(Math.round((400 - s.h) / 2))
  })

  it('never lets a stage read wider than 4:3 or taller than 3:4', () => {
    for (let pw = 64; pw <= 1200; pw += 37) {
      for (let ph = 48; ph <= 600; ph += 29) {
        const s = stageOf(pw, ph)
        const a = seenAspect(s.w, s.h)
        expect(a, `${pw}x${ph} came out ${a}`).toBeLessThanOrEqual(MAX_ASPECT + 0.02)
        expect(a, `${pw}x${ph} came out ${a}`).toBeGreaterThanOrEqual(MIN_ASPECT - 0.02)
        // And it always fits inside the field it was cut from.
        expect(s.w).toBeLessThanOrEqual(pw)
        expect(s.h).toBeLessThanOrEqual(ph)
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.x + s.w).toBeLessThanOrEqual(pw)
        expect(s.y + s.h).toBeLessThanOrEqual(ph)
      }
    }
  })

  it('is stable: asking twice for the same field gives the same stage', () => {
    expect(sameStage(stageOf(600, 144), stageOf(600, 144))).toBe(true)
    expect(sameStage(stageOf(600, 144), stageOf(601, 144))).toBe(false)
  })

  it('takes its own bounds for a game whose picture is another shape', () => {
    // `rocket` wants a tall screen, `robot` a square one. Same centring, same
    // rounding, different numbers.
    const tall = stageOf(600, 144, { min: 3 / 4, max: 3 / 4 })
    expect(seenAspect(tall.w, tall.h)).toBeCloseTo(3 / 4, 2)
    const square = stageOf(600, 144, { min: 0.85, max: 1.15 })
    expect(seenAspect(square.w, square.h)).toBeLessThanOrEqual(1.16)
  })

  /**
   * I4. The two games the README holds up as the reason the third argument
   * EXISTS — "`rocket` wants a tall screen, `robot` a square one" — each kept
   * a private `PIXEL_ASPECT`, `Stage` and `stageOf`, byte-identical to this
   * module's except for the bounds constants, which is precisely what that
   * argument is for. A contributor writing a tall or square game #21 reads
   * `rocket`, not `stage.ts`, so the copy was the thing that would propagate.
   *
   * Scans the sources rather than the behaviour, because behaviour is exactly
   * what a byte-identical copy does not change.
   */
  it('is the only stageOf in the cartridge tree', () => {
    const dir = join(process.cwd(), 'src/cartridges')
    const offenders: string[] = []
    for (const folder of readdirSync(dir)) {
      const full = join(dir, folder)
      if (!statSync(full).isDirectory()) continue
      for (const f of readdirSync(full)) {
        if (!f.endsWith('.ts') || f.includes('.test.')) continue
        const src = readFileSync(join(full, f), 'utf8')
        if (/(?:const|function)\s+stageOf\b/.test(src)) offenders.push(`${folder}/${f}`)
      }
    }
    expect(offenders, 'a cartridge is keeping its own copy of stageOf').toEqual([])
  })
})
