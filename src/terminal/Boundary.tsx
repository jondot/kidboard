import { Component, type ReactNode } from 'react'
import type { Locale } from '../types'
import { dirFor, makeT } from '../i18n/locale'

type Props = { locale: Locale; children: ReactNode }
type State = { crashed: boolean }

/**
 * The last net under the React tree. `session.ts` already contains a throw
 * from cartridge code, but a render-time throw (a malformed block, a bad
 * frame) would otherwise unmount the whole app and leave a six-year-old
 * looking at a blank white page — which is the one error state this project
 * promises never to show.
 *
 * It renders one warm line in the child's own language, nothing technical.
 * The details go to the console for whoever is developing.
 */
export class Boundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(err: unknown): void {
    console.error('[kidboard] the terminal crashed while rendering', err)
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children
    return (
      <div
        dir={dirFor(this.props.locale)}
        className="kb:flex kb:h-full kb:items-center kb:justify-center kb:bg-kb-bg kb:text-kb-info kb:font-kb-mono kb:text-xl kb:p-4 kb:rounded-xl"
      >
        {makeT(this.props.locale)('oops')}
      </div>
    )
  }
}
