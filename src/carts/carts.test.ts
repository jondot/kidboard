import { describe, it, expect, beforeEach } from 'vitest'
import {
  addCart, alreadyHere, announce, cartCartridges, cartList, forgetCart,
  hydrateCarts, justAPicture, renamedLine, resetCarts, setCartSpawn,
} from './registry'
import { makeCartStore, makeMemoryStore, type StoredCart } from './store'
import {
  asBeat, asDrawing, asTune, beatBitmap, beatManifest, buildCartPng,
  cartFilename, drawingBitmap, drawingCode,
  drawingManifest, savables, sizeForDrawing, sizeForGrid, tuneBitmap, tuneCode,
  tuneManifest,
} from './export'
import { BLINK, BLINK_LABEL } from './samples'
import { readCart } from './codec'
import { checkerPng } from './fixtures'
import { makeLoopbackWorker } from './loopback'
import { testCtx } from '../testing/cartridgeHarness'
import { Canvas, rasterize, frameToString } from '../runtime/Canvas'
import { gridFor, rowsFor } from '../runtime/GridCanvas'
import { forLocale, registry } from '../cartridges'
import pianoCartridge from '../cartridges/piano/cartridge'
import drawCartridge, { currentDrawing } from '../cartridges/draw/cartridge'
import { resolve } from '../runtime/resolve'
import type { Cartridge, LiveCartridge } from '../types'
import type { SavedDrawing, SavedTune } from './export'

const builtIns = () => registry() as Cartridge[]
/** Exactly what the terminal does with a typed word. */
const resolveWord = (text: string) =>
  resolve(text, { locale: 'en', cartridges: forLocale('en') })

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => {
  resetCarts()
  setCartSpawn(makeLoopbackWorker)
})

const samplePng = () => buildCartPng(BLINK, BLINK_LABEL)

describe('the app ships with no carts', () => {
  it('starts empty and stays empty until a child loads one', () => {
    expect(cartList()).toEqual([])
    expect(cartCartridges()).toEqual([])
  })
})

describe('loading a cart', () => {
  it('takes a cart PNG and makes it playable', async () => {
    const png = (await samplePng())!
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    expect(cartList().map((c) => c.id)).toEqual(['kidboard-blink'])
    const cart = cartCartridges()[0]!
    expect(cart.kind).toBe('live')
    expect(cart.triggers.en).toEqual(['blink'])
  })

  /**
   * M4. A child dragging a folder in drops several files at once, and four
   * identical lines in a row stop reading as "that is fine" and start reading
   * as disapproval — exactly the defect already fixed inside `count`, `spot`
   * and `rhyme` ("three identical miss lines in a row read as disapproval").
   */
  it('does not say the same thing four times when four bad files are dropped', () => {
    const said = [0, 1, 2, 3].map(() => {
      const b = justAPicture('en')[0]!
      return b.kind === 'text' ? b.text : ''
    })
    expect(new Set(said).size, `four drops said: ${said.join(' / ')}`)
      .toBeGreaterThan(1)
    // ...and never the same line twice running.
    for (let i = 1; i < said.length; i++) {
      if (i < 3) expect(said[i]).not.toBe(said[i - 1])
    }
    for (const text of said) {
      expect(text.length).toBeGreaterThan(0)
      expect(text.toLowerCase()).not.toContain('error')
      // Never a fault, and never a chore handed to the child.
      expect(text.toLowerCase()).not.toMatch(/wrong|bad|can't|cannot|failed|try again/)
    }
  })

  it('says nothing but a warm line when the picture has no game in it', async () => {
    const res = await addCart(checkerPng(), { builtIns: builtIns() })
    expect(res.ok).toBe(false)
    expect(cartList()).toEqual([])
    for (const locale of ['en', 'he'] as const) {
      const said = justAPicture(locale)
      expect(said[0]!.kind).toBe('text')
      const text = said[0]!.kind === 'text' ? said[0]!.text : ''
      expect(text.length).toBeGreaterThan(0)
      expect(text.toLowerCase()).not.toContain('error')
    }
  })

  it('says nothing but a warm line for a file that is not a picture at all', async () => {
    expect((await addCart(new TextEncoder().encode('hello'), { builtIns: builtIns() })).ok)
      .toBe(false)
    expect((await addCart(new ArrayBuffer(0), { builtIns: builtIns() })).ok).toBe(false)
  })

  it('renames around a built-in and says what the new word is', async () => {
    const clashing = { ...BLINK, id: 'clash', name: { en: 'draw' } }
    const png = (await buildCartPng(clashing, BLINK_LABEL))!
    const res = await addCart(png, { builtIns: builtIns() })
    const loaded = res.ok && res.kind === 'loaded' ? res : null
    expect(loaded?.cart.names.en).toBe('draw2')
    expect(loaded?.renamed).toEqual([{ locale: 'en', from: 'draw', to: 'draw2' }])
    const line = renamedLine(loaded?.renamed ?? [], 'en')[0]
    expect(line?.kind === 'text' && line.text).toContain('draw2')
  })

  it('keeps the word a cart already had when the same cart comes back', async () => {
    const clashing = { ...BLINK, id: 'clash', name: { en: 'draw' } }
    const png = (await buildCartPng(clashing, BLINK_LABEL))!
    await addCart(png, { builtIns: builtIns() })
    const again = await addCart(png, { builtIns: builtIns() })
    const back = again.ok && again.kind === 'loaded' ? again : null
    expect(back?.again).toBe(true)
    expect(back?.cart.names.en).toBe('draw2')
    expect(cartList()).toHaveLength(1)
  })

  it('never lets two different carts claim the same word', async () => {
    const a = { ...BLINK, id: 'a', name: { en: 'wiggle' } }
    const b = { ...BLINK, id: 'b', name: { en: 'wiggle' } }
    await addCart((await buildCartPng(a, BLINK_LABEL))!, { builtIns: builtIns() })
    await addCart((await buildCartPng(b, BLINK_LABEL))!, { builtIns: builtIns() })
    const words = cartList().map((c) => c.names.en)
    expect(new Set(words).size).toBe(2)
  })

  it('forgets a cart when asked, and the word stops meaning anything', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    await forgetCart('kidboard-blink')
    expect(cartList()).toEqual([])
    expect(cartCartridges()).toEqual([])
  })
})

describe('what a child sees when a cart arrives', () => {
  it('shows the picture as half-blocks, the name, and the word to type', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const blocks = announce(cartList()[0]!, 'en')
    const art = blocks.find((b) => b.kind === 'art')
    expect(art?.kind === 'art' && art.art.length).toBeGreaterThan(0)
    expect(art?.kind === 'art' && /^[ ▀▄█\n]+$/.test(art.art)).toBe(true)
    const texts = blocks.flatMap((b) => (b.kind === 'text' ? [b.text] : []))
    expect(texts.join(' ')).toContain('Blink')
    expect(texts.join(' ')).toContain('type blink to play!')
  })

  it('says it in Hebrew for a Hebrew-reading child', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const texts = announce(cartList()[0]!, 'he')
      .flatMap((b) => (b.kind === 'text' ? [b.text] : []))
    expect(texts.join(' ')).toContain('ממצמץ')
    expect(texts.join(' ')).toMatch(/[֐-׿]/)
  })

  it('uses one ink for the picture and a second only for what to do next', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const blocks = announce(cartList()[0]!, 'en')
    const tones = new Set(blocks.map((b) => b.tone ?? 'plain'))
    expect([...tones].sort()).toEqual(['plain', 'win'])
    expect(blocks.at(-1)!.tone).toBe('win')
  })

  it('welcomes a cart back rather than pretending it is new', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const texts = alreadyHere(cartList()[0]!, 'en')
      .flatMap((b) => (b.kind === 'text' ? [b.text] : []))
    expect(texts.join(' ')).toContain('blink')
  })
})

describe('the word a child was told to type actually works', () => {
  it('resolves to the cart the instant it is loaded, with no reload', async () => {
    const before = resolveWord('blink')
    expect(before.kind).not.toBe('cartridge')
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const after = resolveWord('blink')
    expect(after.kind === 'cartridge' && after.cartridge.id).toBe('cart:kidboard-blink')
  })

  it('forgets the word again when the cart is forgotten', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    await forgetCart('kidboard-blink')
    expect(resolveWord('blink').kind).not.toBe('cartridge')
  })

  it('reaches a cart in Hebrew too', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const res = resolve('ממצמץ', { locale: 'he', cartridges: forLocale('he') })
    expect(res.kind === 'cartridge' && res.cartridge.id).toBe('cart:kidboard-blink')
  })
})

describe('a loaded cart actually plays', () => {
  it('runs in the worker and paints a frame', async () => {
    await addCart((await samplePng())!, { builtIns: builtIns() })
    const cart = cartCartridges()[0]! as LiveCartridge
    const { ctx } = testCtx()
    const inst = cart.create(ctx)
    await flush()
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    expect(frameToString(rasterize(c.cmds(), g.w, g.h)).trim().length).toBeGreaterThan(0)
    expect(inst.souvenir?.()).toBe('blink blink')
  })
})

describe('saving a cart', () => {
  it('writes a PNG that reads back as the same manifest', async () => {
    const png = (await samplePng())!
    expect(await readCart(png)).toEqual(BLINK)
  })

  it('names the file something a child can find', () => {
    expect(cartFilename(BLINK, 'en')).toBe('blink.png')
    expect(cartFilename(BLINK, 'he')).toBe('ממצמץ.png')
    expect(cartFilename({ ...BLINK, name: { en: '///' } }, 'en')).toBe('cart.png')
  })

  it('always offers the sample, so a child who has made nothing still has one', () => {
    const list = savables('en')
    expect(list.map((s) => s.key)).toContain('sample')
  })

  it('turns a child\'s drawing into a cart that draws itself back', async () => {
    const drawing: SavedDrawing = {
      w: 6, h: 4,
      marks: { '1,1': 'warm', '2,1': 'warm', '3,2': 'win' },
    }
    // A cell pad, replayed with characters.
    const manifest = drawingManifest(drawing, 1234)
    const png = (await buildCartPng(manifest, drawingBitmap(drawing)))!
    const back = await readCart(png)
    expect(back?.code).toContain('"1,1":"warm"')
    expect(back?.apiVersion).toBe(1)

    // And it plays: the picture comes back on a real worker.
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    const cart = cartCartridges()[0]!
    const inst = cart.create(testCtx().ctx)
    await flush()
    for (let i = 0; i < 40; i++) { inst.tick?.(0.1); }
    await flush()
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    expect(frameToString(rasterize(c.cmds(), g.w, g.h))).toContain('█')
  })

  it('reads whatever shape draw is keeping its picture in today', () => {
    // `draw` has already changed a mark from a semantic tone to a bare 1.
    expect(asDrawing({ w: 4, h: 4, marks: { '1,1': 1, '2,2': 'win' } }))
      .toEqual({ w: 4, h: 4, marks: { '1,1': 'warm', '2,2': 'win' } })
    expect(asDrawing({ w: 4, h: 4, marks: {} })).toBeNull()
    expect(asDrawing({ w: 4, h: 4, marks: { nonsense: 1 } })).toBeNull()
    expect(asDrawing(null)).toBeNull()
    expect(asDrawing({ marks: { '0,0': 1 } })).toBeNull()
  })

  it('saves a picture at the shape it was drawn, not an approximation of it', () => {
    for (const [w, h] of [[36, 16], [100, 16], [24, 24], [8, 40]]) {
      expect(rowsFor(sizeForGrid(w!, h!)), `${w}x${h}`).toBe(h)
      expect(sizeForGrid(w!, h!).cols).toBe(w)
    }
  })

  it('gives a dot pad a field big enough to hold every dot', () => {
    // `draw` now paints a lattice of dots in the PIXEL field, so a picture
    // measured in dots has to be converted before it becomes cells.
    const dotted: SavedDrawing = {
      w: 40, h: 30, dot: { w: 5, h: 5 }, marks: { '0,0': 'plain', '39,29': 'plain' },
    }
    const size = sizeForDrawing(dotted)
    expect(size.cols * 8).toBeGreaterThanOrEqual(40 * 5)
    expect(rowsFor(size) * 8).toBeGreaterThanOrEqual(30 * 5)
  })

  it('replays a dot pad with rects and a cell pad with characters', () => {
    expect(drawingCode({ w: 4, h: 4, dot: { w: 5, h: 5 }, marks: { '1,1': 'plain' } }))
      .toContain('"dot":{"w":5,"h":5}')
    expect(drawingCode({ w: 4, h: 4, marks: { '1,1': 'plain' } })).toContain('"dot":null')
  })

  it('reads the dot size draw now records, and shrugs off a silly one', () => {
    expect(asDrawing({ w: 4, h: 4, dot: { w: 5, h: 5 }, marks: { '1,1': 1 } })?.dot)
      .toEqual({ w: 5, h: 5 })
    expect(asDrawing({ w: 4, h: 4, dot: { w: 0, h: 5 }, marks: { '1,1': 1 } })?.dot)
      .toBeUndefined()
    expect(asDrawing({ w: 4, h: 4, dot: 'big', marks: { '1,1': 1 } })?.dot).toBeUndefined()
  })

  /**
   * A RECORDED PHRASE KEEPS ITS RHYTHM. `piano` has a recording head now, so a
   * tune that came through it carries `at` on every note and the cart plays
   * the gaps the child actually left. Free play has no timestamps — nobody was
   * recording it — and still plays at an even beat, which is the honest
   * reading of it.
   */
  it('plays a recorded tune to its own rhythm, and free play to a beat', async () => {
    const recorded = asTune({
      notes: [
        { hz: 261.6, label: 'A', at: 0 },
        { hz: 392.0, label: 'G', at: 2 },
      ],
    })!
    expect(recorded.timed).toBe(true)
    expect(tuneCode(recorded)).toContain('"at":2')

    const free = asTune({ notes: [{ hz: 261.6, label: 'A' }, { hz: 392, label: 'G' }] })!
    expect(free.timed).toBeUndefined()
    // The even beat is written into the cart as timings, so ONE player plays
    // both and there is no second code path to keep in step.
    expect(tuneCode(free)).toContain('"at":0.42')

    // Half-timed is nobody's rhythm: it falls back whole.
    const half = asTune({
      notes: [{ hz: 261.6, label: 'A', at: 0 }, { hz: 392, label: 'G' }],
    })!
    expect(half.timed).toBeUndefined()
    expect(half.notes.every((n) => n.at === undefined)).toBe(true)

    // And the recorded one really waits: two seconds of silence between the
    // notes, on a real worker.
    const manifest = tuneManifest(recorded, 99)
    const png = (await buildCartPng(manifest, tuneBitmap(recorded)))!
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    const cart = cartCartridges()[0]!
    const heard: number[] = []
    const h = testCtx()
    h.ctx.audio.note = (hz: number) => { heard.push(hz) }
    const inst = cart.create(h.ctx)
    await flush()
    for (let i = 0; i < 10; i++) { inst.tick?.(0.1); await flush() }
    expect(heard, 'the second note came early').toHaveLength(1)
    for (let i = 0; i < 15; i++) { inst.tick?.(0.1); await flush() }
    expect(heard).toHaveLength(2)
  })

  /**
   * A CHILD'S OWN BEAT, the third thing they can make and take away.
   *
   * `drum` records an eight-step bar; this is the same hook `draw` and `piano`
   * grew, and the saved cart obeys the same rule they do — it plays through
   * ONCE and then rests, and SPACE plays it again, because that is the child
   * asking rather than a timer re-arming.
   */
  it('turns the bar a child drummed into a cart that plays it back', async () => {
    // kick, rest, hat, rest, kick, rest, hat, clap.
    const beat = asBeat({ steps: [0, null, 2, null, 0, null, 2, 3] })!
    expect(beat.steps).toEqual([0, null, 2, null, 0, null, 2, 3])
    // A bar of nothing is not a beat somebody recorded.
    expect(asBeat({ steps: [null, null] })).toBeNull()
    expect(asBeat({ steps: [9, 'x'] })).toBeNull()
    expect(asBeat(null)).toBeNull()

    const manifest = beatManifest(beat, 4321)
    const png = (await buildCartPng(manifest, beatBitmap(beat)))!
    const back = await readCart(png)
    expect(back?.apiVersion).toBe(1)

    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    const cart = cartCartridges()[0]!

    // It plays, on a real worker: the kick is a low note, the other three are
    // noise, and the rests are silence that takes up time.
    const notes: number[] = []
    const noises: number[] = []
    const h = testCtx()
    h.ctx.audio.note = (hz: number) => { notes.push(hz) }
    h.ctx.audio.noise = (ms: number) => { noises.push(ms) }
    const inst = cart.create(h.ctx)
    await flush()
    for (let i = 0; i < 40; i++) { inst.tick?.(0.1); await flush() }
    expect(notes).toEqual([90, 90])
    expect(noises).toEqual([26, 26, 62])

    // …and it draws the bar it just played.
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    expect(c.cmds().some((cmd) => cmd.op === 'rect')).toBe(true)
  })

  it('turns the melody a child played into a cart that plays it back', async () => {
    const tune: SavedTune = {
      notes: [
        { hz: 261.6, label: 'A' }, { hz: 329.6, label: 'D' },
        { hz: 392.0, label: 'G' }, { hz: 261.6, label: 'A' },
      ],
    }
    const manifest = tuneManifest(tune, 4321)
    const png = (await buildCartPng(manifest, tuneBitmap(tune)))!
    const back = await readCart(png)
    expect(back?.apiVersion).toBe(1)
    expect(back?.code).toContain('329.6')

    // And it plays: on a real worker, the notes come back out as audio.
    const res = await addCart(png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    const cart = cartCartridges()[0]!
    const heard: number[] = []
    const h = testCtx()
    h.ctx.audio.note = (hz: number) => { heard.push(hz) }
    const inst = cart.create(h.ctx)
    await flush()
    for (let i = 0; i < 60; i++) { inst.tick?.(0.1); await flush() }
    expect(heard).toEqual([261.6, 329.6, 392, 261.6])

    // …and it draws the melody it just played.
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    inst.draw(c)
    expect(c.cmds().some((cmd) => cmd.op === 'rect')).toBe(true)
  })

  it('offers a tune only once a child has played one', () => {
    expect(savables('en').map((s) => s.key)).not.toContain('tune')
    const { inst } = { inst: pianoCartridge.create(testCtx({ strings: pianoCartridge.strings }).ctx) }
    inst.onKey?.({ key: 'a', shift: false, repeat: false })
    expect(savables('en').map((s) => s.key)).toContain('tune')
  })

  it('reads a tune defensively, because a cartridge may change shape', () => {
    expect(asTune({ notes: [] })).toBeNull()
    expect(asTune(null)).toBeNull()
    expect(asTune({ notes: 'la la la' })).toBeNull()
    expect(asTune({ notes: [{ hz: 440, label: 'A' }, { hz: 0, label: 'X' }] }))
      .toEqual({ notes: [{ hz: 440, label: 'A' }] })
    expect(asTune({ notes: [{ hz: 440 }] })).toEqual({ notes: [{ hz: 440, label: '' }] })
  })

  it('draws the melody on the label as a little roll of bars', () => {
    const b = tuneBitmap({ notes: [{ hz: 200, label: 'A' }, { hz: 800, label: 'J' }] })
    expect(b.w).toBeGreaterThan(0)
    // The high note is a taller bar than the low one.
    const heightAt = (x: number) => {
      let n = 0
      for (let y = 0; y < b.h; y++) if (b.on[y * b.w + x]) n++
      return n
    }
    expect(heightAt(b.w - 1)).toBeGreaterThan(heightAt(0))
  })

  /**
   * `draw` now paints a 62 x 46 lattice of 5 x 3-pixel DOTS rather than a 36 x
   * 27 grid of characters, and SPACE cycles a fine nib, a fat nib and a
   * HOLLOW RUBBER instead of cycling colour. The rubber is the part that could
   * bite: an erased patch that came back as ink on reload would be a nasty
   * surprise for a child, and a saved picture has already come back the wrong
   * shape once. So this drives the real cartridge, all three brushes, and
   * follows the picture the whole way out and back.
   */
  it('brings a drawing back exactly as drawn — erased patches included', async () => {
    const h = testCtx({ strings: drawCartridge.strings })
    const inst = drawCartridge.create(h.ctx)
    const press = (key: string) => inst.onKey?.({ key, shift: false, repeat: false })
    // A real canvas first, so the pad lays its lattice out as it does in the app.
    const dg = gridFor(drawCartridge.size)
    inst.draw(new Canvas(dg.w, dg.h))

    // Fine nib: a short line to the right.
    // A press aims the pen and buys it a dot of travel; the tick is what
    // actually moves it, exactly as the frame loop does.
    for (let i = 0; i < 8; i++) { press('ArrowRight'); inst.tick?.(0.1) }
    const inked = Object.keys(currentDrawing()!.marks)
    expect(inked.length).toBeGreaterThan(4)

    // SPACE to the fat nib, SPACE again to the rubber, then back along the line.
    press(' ')
    press(' ')
    for (let i = 0; i < 4; i++) { press('ArrowLeft'); inst.tick?.(0.1) }

    const picture = currentDrawing()!
    const kept = Object.keys(picture.marks)
    const rubbed = inked.filter((k) => !(k in picture.marks))
    expect(rubbed.length, 'the rubber rubbed nothing out').toBeGreaterThan(0)
    expect(kept.length, 'the rubber took the whole line').toBeGreaterThan(0)

    // The file the panel would hand over.
    const savable = savables('en').find((sv) => sv.key === 'drawing')!
    const made = (await savable.build())!
    const back = (await readCart(made.png))!

    // What was rubbed out is not in the file at all, and what was left is.
    for (const key of rubbed) expect(back.code, `${key} came back`).not.toContain(`"${key}":`)
    for (const key of kept) expect(back.code, `${key} was lost`).toContain(`"${key}":`)

    // And the shape: a dot pad measured in dots gets a grid with room for
    // every dot, at the proportions it was drawn in.
    const size = back.size!
    expect(size.cols * 8).toBeGreaterThanOrEqual(picture.w * picture.dot!.w)
    expect(rowsFor(size) * 8).toBeGreaterThanOrEqual(picture.h * picture.dot!.h)

    // Dropped back in, it replays every mark that survived and no more.
    const res = await addCart(made.png, { builtIns: builtIns() })
    expect(res.ok).toBe(true)
    const cart = cartCartridges()[0]!
    const replay = cart.create(testCtx().ctx)
    await flush()
    for (let i = 0; i < 40; i++) { replay.tick?.(0.2); await flush() }
    const g = gridFor(cart.size)
    const c = new Canvas(g.w, g.h)
    replay.draw(c)
    const rects = c.cmds().filter((cmd) => cmd.op === 'rect')
    expect(rects).toHaveLength(kept.length)
  })

  it('puts the drawing on the card, not the empty page around it', () => {
    // The pad is 62 x 46 dots and a first drawing is a small thing somewhere
    // inside it. Uncropped, the label would be a few specks on a card sixteen
    // half-cells wide.
    const d: SavedDrawing = {
      w: 62, h: 46, dot: { w: 5, h: 3 },
      marks: { '30,20': 'plain', '31,20': 'plain', '31,21': 'plain' },
    }
    const b = drawingBitmap(d)
    expect(b.w).toBeLessThan(8)
    expect(b.h).toBeLessThan(8)
    // Every mark survives the crop; nothing of the child's is lost.
    expect(Array.from(b.on).filter(Boolean)).toHaveLength(3)
    // …and the replay still draws them where they were drawn.
    expect(drawingCode(d)).toContain('"30,20":"plain"')
  })

  it('never writes cart code that would be refused for mentioning import', () => {
    const drawing: SavedDrawing = { w: 2, h: 2, marks: { '0,0': 'warm' } }
    expect(drawingCode(drawing)).not.toMatch(/\bimport\b/)
    expect(tuneCode({ notes: [{ hz: 440, label: 'A' }] })).not.toMatch(/\bimport\b/)
    expect(BLINK.code).not.toMatch(/\bimport\b/)
  })
})

describe('carts survive a reload', () => {
  it('comes back from the store, with the word it had before', async () => {
    const store = makeMemoryStore()
    await addCart((await samplePng())!, { builtIns: builtIns(), store })
    const saved = await store.list()
    expect(saved).toHaveLength(1)

    resetCarts()
    expect(cartList()).toEqual([])
    await hydrateCarts(store)
    expect(cartList().map((c) => c.names.en)).toEqual(['blink'])
    expect(cartCartridges()[0]!.triggers.en).toEqual(['blink'])
  })

  it('ignores anything in the store that is not a cart of this version', async () => {
    const store = makeMemoryStore([
      { id: 'junk', addedAt: 1 } as unknown as StoredCart,
      { id: 'old', manifest: { apiVersion: 2 }, addedAt: 2 } as unknown as StoredCart,
    ])
    await hydrateCarts(store)
    expect(cartList()).toEqual([])
  })

  it('keeps working when the browser will not store anything', async () => {
    const store = makeCartStore(null)
    const res = await addCart((await samplePng())!, { builtIns: builtIns(), store })
    expect(res.ok).toBe(true)
    expect((await store.list()).map((c) => c.id)).toEqual(['kidboard-blink'])
  })

  it('keeps working when the browser\'s database refuses to open', async () => {
    const broken = { open: () => { throw new Error('no') } } as unknown as IDBFactory
    const store = makeCartStore(broken)
    await store.put({ id: 'x', addedAt: 1 } as unknown as StoredCart)
    expect((await store.list()).map((c) => c.id)).toEqual(['x'])
    await store.remove('x')
    expect(await store.list()).toEqual([])
  })

  it('hydrates to nothing rather than throwing when the store is broken', async () => {
    const store = { list: () => Promise.reject(new Error('no')), put: async () => {}, remove: async () => {} }
    await hydrateCarts(store)
    expect(cartList()).toEqual([])
  })
})
