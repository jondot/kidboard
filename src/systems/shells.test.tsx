import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SHELLS, shellFor } from './shells'
import { KidtariShell } from './shells/kidtari'
import { SYSTEMS, SYSTEM_IDS, DEFAULT_SYSTEM_ID } from './systems'
import type { ShellProps } from './Shell'
import { makeFrameChannel } from '../runtime/frameChannel'
import { makeT } from '../i18n/locale'
import type { System } from './types'

const props = (system: System): ShellProps => ({
  system,
  locale: 'en',
  dir: 'ltr',
  t: makeT('en'),
  blocks: [],
  channel: makeFrameChannel(),
  hints: [],
  liveTitle: null,
  busy: false,
  isLive: false,
  input: <textarea readOnly value="" />,
  scrollRef: () => {},
  contentRef: () => {},
})

describe('the shell registry', () => {
  it('has a face for every machine, and no id without one', () => {
    expect(Object.keys(SHELLS).sort()).toEqual([...SYSTEM_IDS].sort())
  })

  it('renders something for every machine', () => {
    for (const s of SYSTEMS) {
      const Shell = shellFor(s.id)
      const { container, unmount } = render(<Shell {...props(s)} />)
      expect(container.querySelector(`[data-kb-shell="${s.id}"]`), s.id).toBeTruthy()
      unmount()
    }
  })

  /**
   * There is no error state a child can see. A stored id from a build that
   * had a fifth machine, a stale link, a corrupt key — all of them are "no
   * choice at all", which is the same rule `kb.system` itself is read with.
   */
  it('falls back rather than throwing on an id that names nothing', () => {
    for (const bad of ['commodore', '', null, undefined]) {
      expect(shellFor(bad)).toBe(SHELLS[DEFAULT_SYSTEM_ID])
    }
    expect(shellFor('kidtari')).toBe(KidtariShell)
  })
})
