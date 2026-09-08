import { describe, it, expect } from 'vitest'
import { DENIED, WORKER_SOURCE, looksImportable } from './workerSource'
import { runWorkerSource } from './loopback'
import type { DrawCmd } from '../types'

const init = (code: string, over: Record<string, unknown> = {}) => ({
  m: 'init', code, seed: 7, locale: 'en', input: '', strings: {},
  seq: 1, w: 10, h: 5, ...over,
})

const drawsOf = (sent: unknown[]): DrawCmd[][] =>
  sent.filter((m) => (m as { m: string }).m === 'draw')
    .map((m) => (m as { cmds: DrawCmd[] }).cmds)

describe('the worker bootstrap', () => {
  it('is valid JavaScript exactly as written, since nothing transpiles it', () => {
    expect(() => new Function('self', WORKER_SOURCE)).not.toThrow()
  })

  it('runs a cart and posts back the frame it drew', () => {
    const w = runWorkerSource()
    w.send(init('kb.game(function () { return { draw: function (c) { c.text(1, 2, "hi", "win") } } })'))
    expect(drawsOf(w.sent)[0]).toEqual([
      { op: 'text', x: 1, y: 2, text: 'hi', tone: 'win' },
    ])
  })

  it('records every op the canvas has, in the shape the host paints', () => {
    const w = runWorkerSource()
    w.send(init(`kb.game(function () { return { draw: function (c) {
      c.clear(); c.put(0, 0, "x"); c.box(0, 0, 2, 2); c.emoji(1, 1, "🐱");
      c.rect(0, 0, 8, 8, "art"); c.outline(0, 0, 8, 8, "art", 2);
      c.line(0, 0, 4, 4); c.disc(2, 2, 3); c.circle(2, 2, 3);
      c.sprite(0, 0, ["x."], "cool", { flipX: true, scale: 2 });
    } } })`))
    const ops = drawsOf(w.sent)[0]!.map((c) => c.op)
    expect(ops).toEqual([
      'clear', 'put', 'box', 'emoji', 'rect', 'outline', 'line', 'disc',
      'circle', 'sprite',
    ])
  })

  it('gives a cart the live grid, so it can lay itself out', () => {
    const w = runWorkerSource()
    w.send(init('kb.game(function () { return { draw: function (c) { c.text(0, 0, c.w + "x" + c.h) } } })', { w: 40, h: 12 }))
    expect(drawsOf(w.sent)[0]![0]).toMatchObject({ text: '40x12' })
  })

  it('feeds keys and time through to the cart', () => {
    const w = runWorkerSource()
    w.send(init(`var n = 0, k = "";
      kb.game(function () { return {
        onKey: function (e) { k = e.key },
        tick: function (dt) { n += dt },
        draw: function (c) { c.text(0, 0, k + ":" + n) },
      } })`))
    w.send({ m: 'key', key: 'ArrowUp', shift: false, repeat: false, seq: 2, w: 10, h: 5 })
    w.send({ m: 'tick', dt: 0.5, seq: 3, w: 10, h: 5 })
    const last = drawsOf(w.sent).at(-1)!
    expect(last[0]).toMatchObject({ text: 'ArrowUp:0.5' })
  })

  it('translates through the strings the cart shipped, in the child\'s language', () => {
    const w = runWorkerSource()
    const strings = { en: { hi: 'hello {who}' }, he: { hi: 'שלום {who}' } }
    const w2 = runWorkerSource()
    const code = 'kb.game(function (ctx) { return { draw: function (c) { c.text(0, 0, ctx.t("hi", { who: "cat" })) } } })'
    w.send(init(code, { strings }))
    w2.send(init(code, { strings, locale: 'he' }))
    expect(drawsOf(w.sent)[0]![0]).toMatchObject({ text: 'hello cat' })
    expect(drawsOf(w2.sent)[0]![0]).toMatchObject({ text: 'שלום cat' })
  })

  it('passes say, audio and exit back to the host', () => {
    const w = runWorkerSource()
    w.send(init(`kb.game(function (ctx) {
      ctx.say([{ kind: "text", text: "hello" }]);
      ctx.audio.note(440, 100); ctx.audio.blip();
      return { draw: function () {}, souvenir: function () { return "you played" },
        onKey: function () { ctx.exit() } }
    })`))
    w.send({ m: 'key', key: 'x', shift: false, repeat: false, seq: 2, w: 10, h: 5 })
    const kinds = w.sent.map((m) => (m as { m: string }).m)
    expect(kinds).toContain('say')
    expect(kinds).toContain('audio')
    expect(w.sent.find((m) => (m as { m: string }).m === 'exit'))
      .toEqual({ m: 'exit', souvenir: 'you played' })
  })

  it('is deterministic: the same seed draws the same frame', () => {
    const code = 'kb.game(function (ctx) { var n = ctx.rng.int(1000); return { draw: function (c) { c.text(0, 0, "n" + n) } } })'
    const a = runWorkerSource(); a.send(init(code, { seed: 42 }))
    const b = runWorkerSource(); b.send(init(code, { seed: 42 }))
    const c = runWorkerSource(); c.send(init(code, { seed: 43 }))
    expect(drawsOf(a.sent)[0]).toEqual(drawsOf(b.sent)[0])
    expect(drawsOf(c.sent)[0]).not.toEqual(drawsOf(a.sent)[0])
  })
})

describe('a cart that misbehaves ends quietly', () => {
  const endsQuietly = (code: string) => {
    const w = runWorkerSource()
    w.send(init(code))
    expect(w.sent.map((m) => (m as { m: string }).m)).toContain('exit')
    expect(drawsOf(w.sent)).toEqual([])
  }

  it('ends when the cart throws while loading', () => {
    endsQuietly('throw new Error("nope")')
  })

  it('ends when the cart never registers a game', () => {
    endsQuietly('var x = 1')
  })

  it('ends when the factory throws', () => {
    endsQuietly('kb.game(function () { throw new Error("nope") })')
  })

  it('ends when the cart returns something that cannot draw', () => {
    endsQuietly('kb.game(function () { return { nope: true } })')
  })

  it('ends when draw() throws, without ever posting a half-frame', () => {
    endsQuietly('kb.game(function () { return { draw: function () { throw new Error("nope") } } })')
  })

  it('stops taking keys and ticks once it has ended', () => {
    const w = runWorkerSource()
    w.send(init('kb.game(function (ctx) { return { draw: function () {}, onKey: function () { ctx.exit() } } })'))
    w.send({ m: 'key', key: 'x', shift: false, repeat: false, seq: 2, w: 10, h: 5 })
    const before = w.sent.length
    w.send({ m: 'tick', dt: 1, seq: 3, w: 10, h: 5 })
    w.send({ m: 'key', key: 'y', shift: false, repeat: false, seq: 4, w: 10, h: 5 })
    expect(w.sent.length).toBe(before)
  })
})

describe('the sandbox takes the network away', () => {
  it('deletes every networking global before a cart runs', () => {
    const w = runWorkerSource()
    w.send(init('kb.game(function () { return { draw: function () {} } })'))
    for (const name of DENIED) {
      expect(Object.prototype.hasOwnProperty.call(w.bag, name), `${name} untouched`).toBe(true)
      expect(w.bag[name], name).toBeUndefined()
    }
  })

  it('shadows the names a cart would use to reach back out', () => {
    const w = runWorkerSource()
    w.send(init(`kb.game(function () { return { draw: function (c) {
      c.text(0, 0, [typeof self, typeof globalThis, typeof fetch, typeof postMessage].join(","))
    } } })`))
    expect(drawsOf(w.sent)[0]![0]).toMatchObject({
      text: 'undefined,undefined,undefined,undefined',
    })
  })

  it('refuses code that mentions import, which is syntax and cannot be shadowed', () => {
    expect(looksImportable('const x = await import("https://evil.example")')).toBe(true)
    expect(looksImportable('require("fs")')).toBe(true)
    expect(looksImportable('kb.game(function () { return { draw: function () {} } })')).toBe(false)
    // A word that merely contains "import" is not an import.
    expect(looksImportable('var important = 1')).toBe(false)
  })
})
