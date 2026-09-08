import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BlockSpec, Cartridge, EchoCartridge, Locale } from '../types'
import type { MenuNode } from '../chrome/Menu'
import { makeT } from '../i18n/locale'
import { CART_STRINGS } from './strings'
import {
  addCart, alreadyHere, announce, cartCartridges, cartList, forgetCart,
  hydrateCarts, justAPicture, onCartsChanged, renamedLine, welcomeBack,
} from './registry'
import { makeCartStore } from './store'
import { savables } from './export'

/**
 * THE CARTRIDGES SUBMENU.
 *
 * Self-contained on purpose: the settings menu owns the button, the popup, the
 * roving tabindex and the Escape handling already, so this contributes NODES
 * and nothing else. Everything a row does that needs the page — a file picker,
 * a download, a drop anywhere on the terminal — is done from here, so wiring
 * it up is one line in `chrome/menuModel.ts`:
 *
 *     const carts = useCartNodes({ locale, cartridges, onPickCartridge })
 *
 * KEYBOARD. Nothing new, and nothing of its own: these are ordinary menu
 * nodes, so ↑↓ move, → steps into the save list, ← and Escape step back out,
 * Enter picks. Buttons are for discovery; a child who knows the word still
 * just types it.
 *
 * MONOCHROME. Rows carry no colour of their own and no emoji: stroked icons
 * that inherit the machine's ink, which is what the rest of the chrome now
 * does and the reason 📂 / 💾 / 👋 are gone from it.
 */

/**
 * The 🃏 rows are now ordinary `MenuNode`s, and the panel's own `view` state
 * is gone with them.
 *
 * It used to keep a `'root' | 'save'` view and a `stay` flag the toolbar had
 * to honour, because a flat popup has no way to go one level in. The settings
 * menu is hierarchical, so "the games I can save" is simply a submenu — the
 * step in, the step back out and the highlight landing in the right place are
 * all the menu's, and this file no longer implements a menu at all.
 */

export type UseCartRowsOpts = {
  locale: Locale
  /** The built-ins, already filtered to this locale. Used to settle clashes. */
  cartridges: readonly Cartridge[]
  /** The shell's single path for starting anything — a cart or a spoken line. */
  onPickCartridge(c: Cartridge): void
}

/**
 * Says something in the transcript without a new prop.
 *
 * `onPickCartridge` already reaches the session, and an echo cartridge is a
 * thing that says something and ends. So a cart announcing itself travels the
 * ordinary path rather than a private one, and no plumbing has to be added to
 * the toolbar or the terminal.
 */
function spoken(blocks: BlockSpec[]): EchoCartridge {
  return {
    kind: 'echo',
    apiVersion: 1,
    id: 'cart:note',
    triggers: {},
    locales: ['en', 'he'],
    respond: (ctx) => ctx.say(blocks),
  }
}

/** Hands the browser a file. Not a link a child could get lost in. */
function offer(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Long enough for the download to have started, short enough not to leak.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * The bytes of a dropped or picked file.
 *
 * `Blob.arrayBuffer()` is the obvious way and is missing in more places than
 * one expects — jsdom has no such method at all, and neither did Safari until
 * fairly recently. `FileReader` is the floor everything has, so a browser
 * without the new method reads the cart anyway instead of being told, warmly
 * and wrongly, that its cart is just a picture.
 */
function readBytes(file: Blob): Promise<ArrayBuffer | null> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().catch(() => null)
  }
  return new Promise((res) => {
    try {
      const reader = new FileReader()
      reader.onload = () => res(reader.result instanceof ArrayBuffer ? reader.result : null)
      reader.onerror = () => res(null)
      reader.readAsArrayBuffer(file)
    } catch {
      res(null)
    }
  })
}

function askForFile(): Promise<File | null> {
  return new Promise((res) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,.png'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => { res(input.files?.[0] ?? null); input.remove() }
    // A child who changes their mind is not an error, and nothing must hang
    // waiting for them.
    input.oncancel = () => { res(null); input.remove() }
    input.click()
  })
}

export function useCartNodes(
  { locale, cartridges, onPickCartridge }: UseCartRowsOpts,
): MenuNode[] {
  const t = useMemo(() => makeT(locale, CART_STRINGS), [locale])
  const store = useMemo(() => makeCartStore(), [])
  const [, bump] = useState(0)

  // Re-render whenever the carts change, whoever changed them.
  useEffect(() => onCartsChanged(() => bump((n) => n + 1)), [])

  // Whatever survived the last visit. Once, at mount.
  useEffect(() => { void hydrateCarts(store) }, [store])

  const say = useCallback(
    (blocks: BlockSpec[]) => { if (blocks.length > 0) onPickCartridge(spoken(blocks)) },
    [onPickCartridge],
  )

  /**
   * The one path a cart takes in, whether it was dropped or picked. It
   * announces and then stops: a cart does not start itself, because starting
   * something is the child's to do.
   */
  const take = useCallback(async (file: Blob | null) => {
    if (!file) return
    const bytes = await readBytes(file)
    if (!bytes) { say(justAPicture(locale)); return }
    const res = await addCart(bytes, { builtIns: cartridges, store })
    if (!res.ok) { say(justAPicture(locale)); return }
    // A built-in the child downloaded and brought back. It is already here
    // under the word they already know, so it is welcomed, not renamed.
    if (res.kind === 'builtIn') { say(welcomeBack(res.names, locale)); return }
    say(res.again
      ? alreadyHere(res.cart, locale)
      : [...announce(res.cart, locale), ...renamedLine(res.renamed, locale)])
  }, [cartridges, locale, say, store])

  /**
   * A drop anywhere on the terminal, which is where the design says a child
   * drags a cart. Scoped to Kidboard's own frame rather than the whole
   * document: this is an embeddable component and a drop on the host page
   * around it is the host's business, not ours.
   */
  useEffect(() => {
    const inside = (e: DragEvent): boolean =>
      e.target instanceof Element && e.target.closest('.kb-frame') !== null

    const onOver = (e: DragEvent) => {
      if (!inside(e)) return
      // Without this the browser navigates to the file and the playground is
      // simply gone — the least warm failure there is.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      if (!inside(e)) return
      e.preventDefault()
      void take(e.dataTransfer?.files?.[0] ?? null)
    }
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [take])

  const carts = cartList()
  const playable = cartCartridges()

  const nodes: MenuNode[] = []

  /**
   * WHAT A CHILD CAME HERE TO DO, and only that.
   *
   * Everything a child can save is eighteen rows on its own, and with a couple
   * of carts loaded that was a fifty-row undifferentiated list — not something
   * a six-year-old scans. So this level holds the carts they have, the way to
   * get one, the way to save one, and a named goodbye for each; the eighteen
   * games-to-save are a submenu behind the row that already named them.
   */
  if (carts.length === 0) {
    // Not an error and not a placeholder — a line to read. The arrow keys
    // skip it, so the highlight can never land on something nothing happens to.
    nodes.push({ kind: 'note', key: 'none', label: t('carts.none') })
  }
  carts.forEach((cart, i) => {
    const word = cart.names[locale] ?? Object.values(cart.names)[0] ?? cart.id
    const game = playable[i]
    if (!game) return
    nodes.push({
      kind: 'item', key: `play:${cart.id}`, icon: 'play', label: word,
      run: () => onPickCartridge(game),
    })
  })

  nodes.push({
    kind: 'item', key: 'open', icon: 'load', label: t('carts.add'),
    run: () => { void askForFile().then(take) },
  })

  nodes.push({ kind: 'note', key: 'drop', label: t('carts.drop') })

  nodes.push({
    kind: 'sub',
    key: 'save',
    icon: 'save',
    label: t('carts.mine'),
    children: savables(locale).map((sv) => ({
      kind: 'item' as const,
      key: `save:${sv.key}`,
      icon: 'save' as const,
      label: sv.label,
      run: () => {
        void sv.build().then((made) => { if (made) offer(made.png, made.filename) })
      },
    })),
  })

  // The goodbyes stay at this level, one per cart, named. A child only ever
  // has the handful of carts they dropped in themselves, so this is a short
  // list — and "forget blink" says exactly what it does, where a single row
  // leading to a goodbye list would have had to be called something vaguer
  // for a destructive thing.
  for (const cart of carts) {
    const word = cart.names[locale] ?? Object.values(cart.names)[0] ?? cart.id
    nodes.push({
      kind: 'item',
      key: `forget:${cart.id}`,
      label: t('carts.forget', { name: word }),
      run: () => {
        void forgetCart(cart.id, store)
        say([{ kind: 'text', text: t('carts.forgot', { name: word }), tone: 'plain' }])
      },
    })
  }

  return nodes
}
