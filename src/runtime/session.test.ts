import { describe, it, expect, vi } from 'vitest'
import { makeSession } from './session'
import { makeAudio } from './audio'
import type { Cartridge, Frame, LiveCartridge, TurnCartridge } from '../types'
import { rasterize } from './Canvas'
import story from '../cartridges/story/cartridge'

const deps = () => {
  const say = vi.fn()
  const mount = vi.fn()
  const frame = vi.fn<(f: Frame) => void>()
  const freeze = vi.fn()
  return {
    say, mount, frame, freeze,
    locale: 'en' as const, audio: makeAudio(), seed: 1,
  }
}

const live: LiveCartridge = {
  kind: 'live', apiVersion: 1, id: 'ball',
  triggers: { en: ['ball'] }, locales: ['en'],
  // 6 columns wide, 6/3 cells => aspect (6 * 0.6) / 3.
  size: { cols: 6, aspect: (6 * 0.6) / 3 },
  hints: () => [{ keys: '← →', label: 'move' }],
  create(ctx) {
    let x = 0
    return {
      onKey: (k) => { if (k.key === 'ArrowRight') x += 1 },
      tick: () => { x += 0 },
      draw: (c) => { c.clear(); c.put(x, 0, 'o', 'warm') },
      souvenir: () => `x=${x}`,
    }
  },
}

const turn: TurnCartridge = {
  kind: 'turn', apiVersion: 1, id: 'story',
  triggers: { en: ['story'] }, locales: ['en'],
  hints: () => [{ keys: 'ESC', label: 'done' }],
  create(ctx) {
    const words: string[] = []
    return {
      start: () => ctx.say([{ kind: 'text', text: 'give me an animal!' }]),
      onLine: (text) => {
        words.push(text)
        if (words.length >= 2) ctx.exit()
      },
      souvenir: () => words.join(' '),
    }
  },
}

const echo: Cartridge = {
  kind: 'echo', apiVersion: 1, id: 'cat',
  triggers: { en: ['cat'] }, locales: ['en'],
  respond: (ctx) => ctx.say([{ kind: 'text', text: 'meow' }]),
}

describe('echo cartridges', () => {
  it('respond immediately and never become busy', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(echo)
    expect(d.say).toHaveBeenCalledWith([{ kind: 'text', text: 'meow' }])
    expect(s.busy).toBe(false)
  })
})

describe('live cartridges', () => {
  it('mount, become busy, and draw a first frame', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(live)
    expect(d.mount).toHaveBeenCalledWith('ball', expect.any(String))
    expect(s.busy).toBe(true)
    expect(s.isLive).toBe(true)
    expect(d.frame).toHaveBeenCalled()
  })

  // Renamed to avoid a trigger collision: "fish" is the id, "aquarium" the
  // word a child actually types. The souvenir
  // row must show what the child typed, never the internal id.
  it('titles the collapsed row with the trigger a child typed, not the id', () => {
    const d = deps()
    const s = makeSession(d)
    const fish: LiveCartridge = {
      ...live, id: 'fish', triggers: { en: ['aquarium'] },
    }
    s.start(fish)
    expect(d.mount).toHaveBeenCalledWith('fish', 'aquarium')
  })

  // A Hebrew-UI child who types נחשים must see נחשים in the souvenir row, not
  // the Latin id "snake" the source ships with.
  it('titles with the first trigger in the ACTIVE locale, under Hebrew too', () => {
    const d = { ...deps(), locale: 'he' as const }
    const s = makeSession(d)
    const snakes: LiveCartridge = {
      ...live, id: 'snake', triggers: { en: ['snakes'], he: ['נחשים'] },
    }
    s.start(snakes)
    expect(d.mount).toHaveBeenCalledWith('snake', 'נחשים')
  })

  // A cartridge with nothing declared for the active locale must still get a
  // recognisable, non-empty title — never a blank collapsed row, and never a
  // crash. Falls back through the other locale, then the emoji trigger.
  it('falls back gracefully when a cartridge has no trigger in the active locale', () => {
    const d = { ...deps(), locale: 'he' as const }
    const s = makeSession(d)
    const englishOnly: LiveCartridge = {
      ...live, id: 'ball', triggers: { en: ['ball'] }, locales: ['en', 'he'],
    }
    s.start(englishOnly)
    expect(d.mount).toHaveBeenCalledWith('ball', 'ball')

    d.mount.mockClear()
    const emojiOnly: LiveCartridge = {
      ...live, id: 'mystery', triggers: { emoji: ['🎲'] }, locales: ['en', 'he'],
    }
    s.start(emojiOnly)
    expect(d.mount).toHaveBeenCalledWith('mystery', '🎲')

    d.mount.mockClear()
    const noTriggersAtAll: LiveCartridge = {
      ...live, id: 'blank-slate', triggers: {}, locales: ['en', 'he'],
    }
    s.start(noTriggersAtAll)
    expect(d.mount).toHaveBeenCalledWith('blank-slate', 'blank-slate')
  })

  it('consume keys and redraw', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(live)
    d.frame.mockClear()
    expect(s.key({ key: 'ArrowRight', shift: false, repeat: false })).toBe(true)
    const f = d.frame.mock.calls[0]![0]
    // The command buffer is what crosses the boundary; rasterize is still the
    // integer model, and still the thing a test compares.
    const cells = rasterize(f.cmds, f.w, f.h)
    expect(cells[0]![1]!.ch).toBe('o')
  })

  it('ESC freezes with the souvenir and clears busy', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(live)
    s.key({ key: 'ArrowRight', shift: false, repeat: false })
    expect(s.key({ key: 'Escape', shift: false, repeat: false })).toBe(true)
    expect(d.freeze).toHaveBeenCalledWith('x=1')
    expect(s.busy).toBe(false)
  })

  it('ignore keys once stopped', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(live)
    s.key({ key: 'Escape', shift: false, repeat: false })
    expect(s.key({ key: 'ArrowRight', shift: false, repeat: false })).toBe(false)
  })

  it('expose the cartridge hints while running and none when idle', () => {
    const d = deps()
    const s = makeSession(d)
    expect(s.hints()).toEqual([])
    s.start(live)
    expect(s.hints()[0]).toMatchObject({ label: 'move' })
  })

  it('decline gracefully when no keyboard is available', () => {
    const d = deps()
    const s = makeSession(d)
    s.start({ ...live, needsKeyboard: true, id: 'ball2' }, { hasKeyboard: false })
    expect(d.mount).not.toHaveBeenCalled()
    expect(d.say).toHaveBeenCalled()
    expect(s.busy).toBe(false)
  })

  it('does not push a frame for a cartridge that exits from inside its own draw()', () => {
    const d = deps()
    const s = makeSession(d)
    let draws = 0
    const quitOnDraw: LiveCartridge = {
      kind: 'live', apiVersion: 1, id: 'quitter',
      triggers: { en: ['quitter'] }, locales: ['en'],
      size: { cols: 3, aspect: 3 * 0.6 },
      hints: () => [],
      create(ctx) {
        return {
          draw: (c) => {
            draws += 1
            c.clear()
            c.put(0, 0, 'x', 'warm')
            // Simulate a win condition discovered mid-draw, on the second frame.
            if (draws === 2) ctx.exit()
          },
          souvenir: () => 'done',
        }
      },
    }

    s.start(quitOnDraw)
    expect(d.frame).toHaveBeenCalledTimes(1)
    d.frame.mockClear()

    // Any redraw trigger (a key here) causes the second draw(), which exits
    // mid-draw. render() must not push a frame for the now-exited cartridge.
    s.key({ key: 'ArrowRight', shift: false, repeat: false })

    expect(d.frame).not.toHaveBeenCalled()
    expect(d.freeze).toHaveBeenCalledTimes(1)
    expect(d.freeze).toHaveBeenCalledWith('done')
    expect(s.busy).toBe(false)
  })
})

describe('turn cartridges', () => {
  it('start, consume lines, and exit themselves', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    expect(s.busy).toBe(true)
    expect(s.isLive).toBe(false)
    expect(s.submit('cat')).toBe(true)
    expect(s.busy).toBe(true)
    expect(s.submit('blue')).toBe(true)
    expect(s.busy).toBe(false)
  })

  it('exit on the universal quit word', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    expect(s.submit('quit')).toBe(true)
    expect(s.busy).toBe(false)
  })

  // "Quit is free" to every turn cartridge. That promise has to
  // hold for a Hebrew-typing child too — QUIT had no Hebrew member.
  it('exit on a Hebrew quit word', () => {
    for (const word of ['יציאה', 'עצור', 'סיום', 'ביי', 'די']) {
      const s = makeSession(deps())
      s.start(turn)
      expect(s.submit(word), `"${word}" did not quit`).toBe(true)
      expect(s.busy, `"${word}" left the cartridge running`).toBe(false)
    }
  })

  it('exit on ESC', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    expect(s.key({ key: 'Escape', shift: false, repeat: false })).toBe(true)
    expect(s.busy).toBe(false)
  })

  // TurnInstance.souvenir() was computed in finish() and then discarded for
  // anything but a live cartridge — dead code in a frozen api that both
  // shipped turn cartridges implement and the contributor README teaches.
  it('say the souvenir when the cartridge exits itself', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    d.say.mockClear()
    s.submit('cat')
    s.submit('blue')            // the second line makes it call ctx.exit()
    expect(d.say).toHaveBeenCalledWith([
      { kind: 'text', text: 'cat blue', tone: 'win' },
    ])
  })

  it('say the souvenir when ESC ends the turn', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    s.submit('cat')
    d.say.mockClear()
    s.key({ key: 'Escape', shift: false, repeat: false })
    expect(d.say).toHaveBeenCalledWith([
      { kind: 'text', text: 'cat', tone: 'win' },
    ])
  })

  it('say nothing when the souvenir is empty', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(turn)
    d.say.mockClear()
    s.submit('quit')            // no answers yet, so souvenir is ''
    expect(d.say).not.toHaveBeenCalled()
  })

  // The test above uses a synthetic fixture whose souvenir() naturally
  // returns '' when nothing was answered — it can't reproduce a cartridge
  // whose souvenir *template* is never actually empty (e.g. story's "a
  // story about a {animal}"). Drive the real `story` cartridge instead: a
  // child who opens it and presses ESC before answering anything must not
  // see a dangling, malformed line like "a story about a ".
  it('say nothing when a real cartridge quits before answering (story)', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(story)
    d.say.mockClear()
    expect(s.key({ key: 'Escape', shift: false, repeat: false })).toBe(true)
    expect(d.say).not.toHaveBeenCalled()
  })

  // UPDATED: this used to assert story said a partial souvenir ("a story
  // about a cat") after only the animal was answered. `story.souvenir` is
  // now the story's own TITLE, which needs all three of
  // {animal, color, food} — so a partial answer can no longer produce it
  // without leaving a gap. story.ts now withholds the souvenir until the
  // story actually completes, so quitting after one answer says nothing, the
  // same as quitting before answering at all.
  it('say nothing when story quits after only a partial answer', () => {
    const d = deps()
    const s = makeSession(d)
    s.start(story)
    s.submit('cat')
    d.say.mockClear()
    s.key({ key: 'Escape', shift: false, repeat: false })
    expect(d.say).not.toHaveBeenCalled()
  })

  it('do not consume submissions when idle', () => {
    const s = makeSession(deps())
    expect(s.submit('cat')).toBe(false)
  })
})

describe('ctx.input', () => {
  it('reaches the cartridge so `cat` can show a cat', () => {
    const d = deps()
    let seen = 'unset'
    makeSession(d).start(
      { ...echo, id: 'probe', respond: (ctx) => { seen = ctx.input } },
      { input: 'cat' },
    )
    expect(seen).toBe('cat')
  })

  it('defaults to empty for programmatic starts', () => {
    const d = deps()
    let seen = 'unset'
    makeSession(d).start({ ...echo, id: 'probe2', respond: (ctx) => { seen = ctx.input } })
    expect(seen).toBe('')
  })
})

// A game declares { cols, aspect }; the host resolves that to the live grid
// for the container it is actually being shown in, and is asked EVERY frame.
describe('live layout', () => {
  it('draws into the declared grid when the host offers no layout', () => {
    const d = deps()
    makeSession(d).start(live)
    const f = d.frame.mock.calls[0]![0]
    expect(f.w).toBe(6)
    expect(f.h).toBe(3)
  })

  it('draws into the grid the host hands it', () => {
    const d = { ...deps(), grid: () => ({ w: 40, h: 3 }) }
    makeSession(d).start(live)
    const f = d.frame.mock.calls[0]![0]
    expect(f.w).toBe(40)
  })

  it('asks the host again on every frame, so a resize lands on the next draw', () => {
    let w = 6
    const d = { ...deps(), grid: () => ({ w, h: 3 }) }
    const s = makeSession(d)
    s.start(live)
    w = 52
    s.key({ key: 'ArrowRight', shift: false, repeat: false })
    expect(d.frame.mock.calls.at(-1)![0].w).toBe(52)
  })

  /**
   * I2. `tick` used to return before rendering when a cartridge had no
   * `tick` of its own — so the two clockless live cartridges (`maze` and
   * `piano`, both of them cited in the docs as house-style exemplars) never
   * re-rendered at all between key presses. Measured: `maze` mounted at
   * 1280px stayed 1200x480 after the viewport went to 1800, indefinitely,
   * with 544px of dead space beside it; the reflow arrived on the next
   * ARROW KEY, which also dealt a brand-new maze and put the child back at
   * the start. `render()` carried a comment claiming the opposite.
   */
  it('reflows a CLOCKLESS cartridge on a resize, with no key pressed', () => {
    let w = 6
    const clockless: LiveCartridge = {
      ...live, id: 'clockless',
      create: () => ({ draw: (c) => { c.clear(); c.put(0, 0, 'o', 'warm') } }),
    }
    const d = { ...deps(), grid: () => ({ w, h: 3 }) }
    const s = makeSession(d)
    s.start(clockless)
    expect(d.frame.mock.calls.at(-1)![0].w).toBe(6)
    w = 52
    s.tick(1 / 60)
    expect(d.frame.mock.calls.at(-1)![0].w, 'a clockless game froze at its old size')
      .toBe(52)
  })

  it('leaves a clockless cartridge alone while nothing has changed', () => {
    const clockless: LiveCartridge = {
      ...live, id: 'clockless2',
      create: () => ({ draw: (c) => { c.clear(); c.put(0, 0, 'o', 'warm') } }),
    }
    const d = { ...deps(), grid: () => ({ w: 6, h: 3 }) }
    const s = makeSession(d)
    s.start(clockless)
    const painted = d.frame.mock.calls.length
    for (let i = 0; i < 30; i++) s.tick(1 / 60)
    expect(d.frame.mock.calls.length, 'a still picture was repainted 60 times a second')
      .toBe(painted)
  })

  it('emits a serializable command buffer, not a rasterized grid', () => {
    const d = deps()
    makeSession(d).start(live)
    const f = d.frame.mock.calls[0]![0]
    expect(Array.isArray(f.cmds)).toBe(true)
    expect(JSON.parse(JSON.stringify(f))).toEqual(f)
  })
})

describe('determinism', () => {
  it('same seed produces the same first frame', () => {
    const a = deps(); const b = deps()
    makeSession(a).start(live)
    makeSession(b).start(live)
    expect(a.frame.mock.calls[0]![0]).toEqual(b.frame.mock.calls[0]![0])
  })
})

// This project's premise is that strangers drop folders in, so "a bad
// cartridge bricks the terminal" is the real error state — and the one the
// child must never see. Before this there was no try/catch anywhere in the
// tree: a throw in respond/onLine/onKey/tick/draw made the child's input
// vanish silently and left the shell wedged.
describe('a cartridge that throws never reaches the child', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  const warmly = (d: ReturnType<typeof deps>) => {
    const said = d.say.mock.calls.flat(2) as { text?: string }[]
    const line = said.map((b) => b.text ?? '').join(' ')
    expect(line.length).toBeGreaterThan(0)
    for (const bad of ['error', 'Error', 'undefined', 'exception', 'failed']) {
      expect(line).not.toContain(bad)
    }
  }

  it('an echo cartridge that throws in respond', () => {
    const spy = quiet()
    const d = deps()
    makeSession(d).start({
      ...echo, id: 'boom', respond: () => { throw new Error('kaboom') },
    })
    warmly(d)
    spy.mockRestore()
  })

  it('a turn cartridge that throws in create', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({ ...turn, id: 'boom2', create: () => { throw new Error('kaboom') } })
    expect(s.busy).toBe(false)
    warmly(d)
    spy.mockRestore()
  })

  it('a turn cartridge that throws in onLine', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({
      ...turn, id: 'boom3',
      create: () => ({ start: () => {}, onLine: () => { throw new Error('x') } }),
    })
    d.say.mockClear()
    expect(s.submit('cat')).toBe(true)
    expect(s.busy).toBe(false)
    warmly(d)
    spy.mockRestore()
  })

  it('a live cartridge that throws in draw', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({
      ...live, id: 'boom4',
      create: () => ({ draw: () => { throw new Error('x') } }),
    })
    expect(s.busy).toBe(false)
    expect(d.frame).not.toHaveBeenCalled()
    warmly(d)
    spy.mockRestore()
  })

  it('a live cartridge that throws in tick, and the loop can stop', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({
      ...live, id: 'boom5',
      create: () => ({ draw: (c) => c.clear(), tick: () => { throw new Error('x') } }),
    })
    expect(s.busy).toBe(true)
    d.say.mockClear()
    s.tick(1 / 24)
    expect(s.busy).toBe(false)
    warmly(d)
    spy.mockRestore()
  })

  it('a cartridge that throws in souvenir still ends cleanly', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({
      ...live, id: 'boom6',
      create: () => ({ draw: (c) => c.clear(), souvenir: () => { throw new Error('x') } }),
    })
    d.say.mockClear()
    s.key({ key: 'Escape', shift: false, repeat: false })
    expect(s.busy).toBe(false)
    warmly(d)
    spy.mockRestore()
  })

  it('a cartridge that throws in hints keeps the bar renderable', () => {
    const spy = quiet()
    const d = deps()
    const s = makeSession(d)
    s.start({
      ...live, id: 'boom7',
      hints: () => { throw new Error('x') },
      create: () => ({ draw: (c) => c.clear() }),
    })
    expect(s.hints()).toEqual([])
    spy.mockRestore()
  })
})
