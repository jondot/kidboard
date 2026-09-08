import type { Block, BlockSpec, Frame } from '../types'
import { EMPTY_FRAME } from '../types'

export type Action =
  | { type: 'echo'; prompt: string; text: string }
  /**
   * `group` is a paragraph key minted by the session (see `SayOpts` in
   * types.ts). Blocks already carrying that key are superseded by this say
   * rather than pushed up the page — one live board that updates in place,
   * instead of a fresh grid stacked under every line the child types.
   *
   * A say with no group appends and seals: nothing already in the transcript
   * can be superseded by it, and the session mints a new key afterwards, so
   * the board a child just finished stays in the scrollback for good.
   */
  | { type: 'say'; specs: BlockSpec[]; group?: string }
  | { type: 'mount'; cartridgeId: string; title: string }
  /**
   * Freezing records the LAST frame as a still. A running block's frames do
   * not pass through here at all — they are painted straight to its canvas
   * off the frame loop (see runtime/frameChannel.ts), because 60 transcript
   * reducer passes a second to mutate a bitmap is exactly the churn v2 exists
   * to delete.
   */
  | { type: 'freeze'; souvenir: string; frame: Frame }
  | { type: 'clear' }

export const emptyTranscript: Block[] = []

let counter = 0
const nextId = (): string => `b${++counter}`

/**
 * Frozen blocks collapse as soon as anything new is appended — on a machine
 * that does not keep its scrollback.
 *
 * WHERE SCROLLBACK IS KEPT, THE STILL IS THE POINT. It is what the user asked
 * for in so many words: "if a game was played, and done, leave the game
 * snapshot there in the history so it would look like we visually played it
 * and stopped". Collapsing to `ball — boing! ▸` and throwing the frame away
 * is precisely the opposite, and on Kid Code and Omarchy it was deleting
 * the record of the thing the child had just done.
 *
 * The other two machines still collapse, and for their own reasons rather
 * than for want of memory: the Kidtari wipes the transcript on exit, so a still
 * would be discarded moments later anyway, and the CRT keeps the picture on
 * its FIELD and files the finished game in the command area as a line — the
 * still is still on screen there, just not twice.
 */
function collapseFrozen(state: Block[], keepStills: boolean): Block[] {
  if (keepStills) return state
  let changed = false
  const next = state.map((b) => {
    if (b.kind === 'live' && b.state === 'frozen') {
      changed = true
      return { ...b, state: 'collapsed' as const, frame: EMPTY_FRAME }
    }
    return b
  })
  return changed ? next : state
}

/**
 * The reducer, bound to one machine's scrollback rule.
 *
 * A factory rather than an extra field on three of the five actions: whether a
 * still survives is a property of the MACHINE, not of the line that happened
 * to be appended next, and threading it through every dispatch site would have
 * put a system's rule in six places that have no business knowing it.
 */
export function makeTranscriptReducer(keepStills: boolean) {
  return (state: Block[], action: Action): Block[] =>
    reduce(state, action, keepStills)
}

/**
 * The pre-systems reducer: collapses stills, as Kidboard always did. Kept as
 * the default export for tests and for any caller with no machine in hand.
 */
export function transcriptReducer(state: Block[], action: Action): Block[] {
  return reduce(state, action, false)
}

function reduce(state: Block[], action: Action, keepStills: boolean): Block[] {
  switch (action.type) {
    case 'echo':
      return [
        ...collapseFrozen(state, keepStills),
        { id: nextId(), kind: 'echo', prompt: action.prompt, text: action.text },
      ]

    case 'say': {
      const group = action.group
      const base = collapseFrozen(state, keepStills)
      // Only this group's own blocks go. Echoes, live blocks and every other
      // paragraph stay exactly where they are, so the transcript still reads
      // as a conversation with one board standing at the bottom of it.
      const kept = group === undefined
        ? base
        : base.filter((b) => !(b.kind === 'static' && b.group === group))
      return [
        ...kept,
        ...action.specs.map((spec) => ({
          id: nextId(), kind: 'static' as const, spec,
          ...(group === undefined ? {} : { group }),
        })),
      ]
    }

    case 'mount': {
      // Freezing any survivor guarantees the one-running-block invariant.
      const base = collapseFrozen(state, keepStills).map((b) =>
        b.kind === 'live' && b.state === 'running'
          ? { ...b, state: 'frozen' as const }
          : b,
      )
      return [
        ...base,
        {
          id: nextId(), kind: 'live', cartridgeId: action.cartridgeId,
          title: action.title, state: 'running', frame: EMPTY_FRAME, souvenir: '',
        },
      ]
    }

    case 'freeze': {
      const i = state.findIndex((b) => b.kind === 'live' && b.state === 'running')
      if (i === -1) return state
      const next = [...state]
      next[i] = {
        ...(next[i] as Extract<Block, { kind: 'live' }>),
        state: 'frozen',
        souvenir: action.souvenir,
        frame: action.frame,
      }
      return next
    }

    case 'clear':
      return []
  }
}
