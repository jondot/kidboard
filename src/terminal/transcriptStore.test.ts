import { describe, it, expect } from 'vitest'
import { transcriptReducer, emptyTranscript, type Action } from './transcriptStore'
import type { Block, Frame } from '../types'
import { makeSession } from '../runtime/session'
import memory from '../cartridges/memory/cartridge'
import count from '../cartridges/count/cartridge'
import spot from '../cartridges/spot/cartridge'
import { EMPTY_FRAME } from '../types'

const frame = (ch: string): Frame =>
  ({ cmds: [{ op: 'put', x: 0, y: 0, ch, tone: 'plain' }], w: 1, h: 1 })

const withLive = (state: 'running' | 'frozen' | 'collapsed'): Block[] => [
  {
    id: 'L1', kind: 'live', cartridgeId: 'ball', title: 'bounce',
    state, frame: frame('o'), souvenir: '',
  },
]

describe('transcriptReducer', () => {
  it('appends an echo block', () => {
    const s = transcriptReducer(emptyTranscript, {
      type: 'echo', prompt: 'type>', text: 'cat',
    })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ kind: 'echo', text: 'cat' })
  })

  it('appends static blocks with unique ids', () => {
    let s = transcriptReducer(emptyTranscript, {
      type: 'say', specs: [{ kind: 'text', text: 'a' }, { kind: 'text', text: 'b' }],
    })
    expect(s).toHaveLength(2)
    expect(s[0]!.id).not.toBe(s[1]!.id)
  })

  it('mounts a live block in the running state', () => {
    const s = transcriptReducer(emptyTranscript, {
      type: 'mount', cartridgeId: 'ball', title: 'bounce',
    })
    expect(s[0]).toMatchObject({ kind: 'live', state: 'running' })
  })

  // A RUNNING block's frames never reach the reducer — they go straight to
  // its canvas off the frame loop. The last one is committed here, once, as
  // the still the frozen block shows.
  it('records the final frame on the running block when it freezes', () => {
    const s = transcriptReducer(withLive('running'), {
      type: 'freeze', souvenir: 'done', frame: frame('x'),
    })
    const live = s[0] as Extract<Block, { kind: 'live' }>
    expect(live.frame.cmds).toEqual([{ op: 'put', x: 0, y: 0, ch: 'x', tone: 'plain' }])
  })

  it('ignores a freeze when nothing is running', () => {
    const before = withLive('frozen')
    expect(transcriptReducer(before, {
      type: 'freeze', souvenir: 'done', frame: frame('x'),
    })).toBe(before)
  })

  it('freezes the running block and records the souvenir', () => {
    const s = transcriptReducer(withLive('running'), {
      type: 'freeze', souvenir: '14 bounces!', frame: frame('o'),
    })
    expect(s[0]).toMatchObject({ state: 'frozen', souvenir: '14 bounces!' })
  })

  it('collapses frozen blocks on the next input, not on freeze', () => {
    const frozen = transcriptReducer(withLive('running'), {
      type: 'freeze', souvenir: 'done', frame: frame('o'),
    })
    expect(frozen[0]).toMatchObject({ state: 'frozen' })
    const after = transcriptReducer(frozen, {
      type: 'echo', prompt: 'type>', text: 'cat',
    })
    expect(after[0]).toMatchObject({ state: 'collapsed' })
  })

  it('drops the frame when collapsing to free memory', () => {
    const frozen = transcriptReducer(withLive('running'), {
      type: 'freeze', souvenir: 'done', frame: frame('o'),
    })
    const after = transcriptReducer(frozen, {
      type: 'echo', prompt: 'type>', text: 'x',
    })
    expect((after[0] as Extract<Block, { kind: 'live' }>).frame).toEqual(EMPTY_FRAME)
  })

  it('clears everything', () => {
    const s = transcriptReducer(withLive('frozen'), { type: 'clear' })
    expect(s).toEqual([])
  })

  it('never has two running blocks', () => {
    let s = transcriptReducer(emptyTranscript, {
      type: 'mount', cartridgeId: 'ball', title: 'bounce',
    })
    s = transcriptReducer(s, { type: 'mount', cartridgeId: 'piano', title: 'piano' })
    const running = s.filter(
      (b) => b.kind === 'live' && b.state === 'running',
    )
    expect(running).toHaveLength(1)
  })
})

/**
 * ONE LIVE BOARD.
 *
 * A turn cartridge that draws a board — `memory`, `count`, `spot` — used to
 * emit the whole thing again on every single line, so three misses left four
 * stacked grids scrolling up the page and the board the child was meant to be
 * looking at was the one buried at the bottom.
 *
 * `ctx.say(blocks, { replace: true })` says "this supersedes what I last said
 * in this paragraph". A plain `ctx.say(blocks)` starts a new paragraph and
 * seals everything before it into the scrollback — which is how a finished
 * board stays put while an in-progress one updates in place.
 */
describe('a replaceable say', () => {
  const board = (n: string) => ({ kind: 'art' as const, art: n })

  it('supersedes the blocks it said last, in the same group', () => {
    let s = transcriptReducer(emptyTranscript, {
      type: 'say', specs: [board('one')], group: 'memory#1.0',
    })
    s = transcriptReducer(s, {
      type: 'say', specs: [board('two')], group: 'memory#1.0',
    })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ kind: 'static', spec: { art: 'two' } })
  })

  it('leaves the child\'s typed lines exactly where they are', () => {
    let s = transcriptReducer(emptyTranscript, {
      type: 'say', specs: [board('one')], group: 'g',
    })
    s = transcriptReducer(s, { type: 'echo', prompt: '>', text: 'a1 b2' })
    s = transcriptReducer(s, { type: 'say', specs: [board('two')], group: 'g' })
    expect(s.map((b) => b.kind)).toEqual(['echo', 'static'])
    expect(s[0]).toMatchObject({ kind: 'echo', text: 'a1 b2' })
  })

  it('never touches another group, or an ordinary say', () => {
    let s = transcriptReducer(emptyTranscript, {
      type: 'say', specs: [board('kept')], group: 'memory#1.0',
    })
    s = transcriptReducer(s, { type: 'say', specs: [{ kind: 'text', text: 'cheer' }] })
    s = transcriptReducer(s, {
      type: 'say', specs: [board('live')], group: 'memory#1.1',
    })
    s = transcriptReducer(s, {
      type: 'say', specs: [board('live again')], group: 'memory#1.1',
    })
    expect(s).toHaveLength(3)
    expect(s.map((b) => (b.kind === 'static' ? b.spec : null))).toEqual([
      { kind: 'art', art: 'kept' },
      { kind: 'text', text: 'cheer' },
      { kind: 'art', art: 'live again' },
    ])
  })
})

/**
 * The wart itself, end to end: the real cartridge, the real session, the real
 * reducer. `memory`, `count` and `spot` all draw a board and all used to
 * stack a fresh copy of it under every line the child typed.
 */
describe('a turn cartridge that draws a board', () => {
  const silence = { note: () => {}, noise: () => {}, blip: () => {}, hit: () => {} }

  function shell() {
    let blocks: Block[] = emptyTranscript
    const dispatch = (a: Action) => { blocks = transcriptReducer(blocks, a) }
    const session = makeSession({
      locale: 'en',
      audio: silence,
      seed: 7,
      say: (specs, o) => dispatch({ type: 'say', specs, group: o?.group }),
      mount: (cartridgeId, title) => dispatch({ type: 'mount', cartridgeId, title }),
      frame: () => {},
      freeze: (souvenir) => dispatch({ type: 'freeze', souvenir, frame: EMPTY_FRAME }),
    })
    return {
      session,
      blocks: () => blocks,
      boards: () => blocks.filter((b) => b.kind === 'static' && b.spec.kind === 'art'),
      echoes: () => blocks.filter((b) => b.kind === 'echo'),
      type(text: string) {
        dispatch({ type: 'echo', prompt: '>', text })
        session.submit(text)
      },
    }
  }

  for (const cart of [memory, count, spot]) {
    it(`${cart.id} leaves ONE board standing, however many lines are typed`, () => {
      const sh = shell()
      sh.session.start(cart)
      sh.type('banana')
      sh.type('banana')
      sh.type('banana')
      // Four boards is the bug: one for the deal and one under every line.
      expect(sh.boards()).toHaveLength(1)
      // …and the conversation is still a conversation.
      expect(sh.echoes()).toHaveLength(3)
    })
  }

  it('keeps a finished board in the scrollback when the next one is dealt', () => {
    const sh = shell()
    sh.session.start(count)
    // The group on screen, counted off its own art: a right answer is the
    // one thing that ends a round, and a round that ended is a keepsake.
    const art = (sh.boards()[0] as Extract<Block, { kind: 'static' }>).spec
    // Counted off the EMOJI, not off every non-blank character: the picture
    // stands in a frame now (`cartridges/card.ts`), and its walls and ground
    // rail are non-blank characters that are not things to count.
    const howMany = ((art.kind === 'art' ? art.art : '')
      .match(/\p{Extended_Pictographic}/gu) ?? []).length
    sh.type(String(howMany))
    sh.type('more please')
    // Two boards: the one the child got right, and the one they are on now.
    expect(sh.boards()).toHaveLength(2)
  })
})
