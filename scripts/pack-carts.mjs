#!/usr/bin/env node
/**
 * pack-carts — turn a built-in cartridge into a cart a child can take away.
 *
 *     npm run pack-carts            every cartridge that can be packed
 *     npm run pack-carts pop snake  just these
 *
 * THE PROBLEM THIS SOLVES. A built-in is TypeScript, compiled into the app
 * and reachable only from inside it. A cart is a self-contained string of
 * JavaScript that runs in a Worker with no module resolution, no DOM and no
 * network. Offering a built-in for download with a label and no code would be
 * a file that lies about what it contains; offering nothing would be a menu
 * that lies about what a cart is. So this bundles the cartridge — its own
 * source plus every module it reaches, its `en.json` and `he.json` inlined —
 * into one standalone script whose `code` field really runs.
 *
 * WHAT IT EMITS. `src/carts/packed.ts`: the MANIFESTS, not the PNGs. The
 * picture is drawn in the browser at the moment a child asks for the file,
 * through exactly the same `buildCartPng` path a child's own drawing takes.
 * That keeps one save path in the app and nothing pre-loaded: the panel
 * offers these for download, and a cart only exists once somebody chooses to
 * put one back.
 *
 * WHAT IT REFUSES TO SHIP. Three gates, and a cartridge that fails any of
 * them is recorded in `UNPACKABLE` with the reason rather than quietly
 * dropped:
 *
 *   1. it must be a `live` cartridge — the cart protocol is a frame loop,
 *      and an `echo` or a `turn` cartridge is a conversation, not a game;
 *   2. it must bundle with no import left dangling, and the bundle must
 *      survive `looksImportable`, the sandbox's one static gate;
 *   3. it must actually PLAY — the packed code is run here through the real
 *      worker bootstrap, the same source string a `blob:` URL runs in the
 *      browser, and it has to answer the first `init` with a frame that has
 *      drawing in it.
 *
 * STALENESS. `src/carts/packed.ts` is a build artifact that is committed, so
 * the app and the tests work without running this. Change a cartridge and it
 * goes out of date: the cart still plays, it is simply an older version of
 * the game. Re-run this after changing one — and you will be told to. Every
 * cart records the exact files esbuild pulled into its bundle and one hash
 * over them (`SOURCES`), and `packed.test.ts` re-reads and re-hashes those
 * files. A stale artifact fails loudly, by name, with this command.
 */

import { build } from 'esbuild'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CARTRIDGES = path.join(ROOT, 'src', 'cartridges')
const OUT = path.join(ROOT, 'src', 'carts', 'packed.ts')

const LOCALES = ['en', 'he']

/** Folders that are not a cartridge anybody plays. */
const SKIP = new Set(['_template'])

const posix = (p) => p.split(path.sep).join('/')

/** One esbuild run, always with the same rules. */
async function bundleOne(contents, format, extra = {}) {
  const out = await build({
    stdin: { contents, resolveDir: ROOT, sourcefile: 'pack-carts.js', loader: 'js' },
    bundle: true,
    write: false,
    format,
    target: 'es2019',
    platform: 'neutral',
    // Minified because the bundle is an artifact nobody reads, and because
    // stripping comments removes the only place the word `import` was ever
    // likely to survive into a cart's code.
    minify: format === 'iife',
    legalComments: 'none',
    // Emoji stay emoji and Hebrew stays Hebrew. esbuild's default would turn
    // both into \u escapes, which is precisely what this project forbids.
    charset: 'utf8',
    logLevel: 'silent',
    ...extra,
  })
  return extra.metafile
    ? { text: out.outputFiles[0].text, metafile: out.metafile }
    : out.outputFiles[0].text
}

/** The app's own helpers, loaded once so the packer measures what the app does. */
async function loadHelpers() {
  const src = await bundleOne(
    [
      `export { makeT } from '${posix(path.join(ROOT, 'src/i18n/locale'))}'`,
      `export { gridFor } from '${posix(path.join(ROOT, 'src/runtime/GridCanvas'))}'`,
      `export { WORKER_SOURCE, looksImportable } from '${posix(path.join(ROOT, 'src/carts/workerSource'))}'`,
      `export { hashSources } from '${posix(path.join(ROOT, 'src/carts/freshness'))}'`,
    ].join('\n'),
    'esm',
    // `freshness` reads the filesystem, so its node builtins stay imports
    // rather than being bundled. This is the HELPER bundle, which runs here in
    // node — never a cart's code, where a surviving `import` would be refused
    // at the sandbox door.
    { platform: 'node', external: ['node:crypto', 'node:fs', 'node:path'] },
  )
  return importSource(src)
}

/** Runs a bundle as a module, without leaving a file behind. */
function importSource(src) {
  const url = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`
  return import(url)
}

/**
 * The cart's `code`: the cartridge, everything it imports, and the two lines
 * that hand it to the sandbox. `kb` is a free name here on purpose — in the
 * Worker it is a parameter of the function the bootstrap builds.
 */
const workerEntry = (dir) => [
  `import cart from '${posix(path.join(dir, 'cartridge'))}'`,
  'kb.game(function (ctx) { return cart.create(ctx) })',
].join('\n')

/**
 * Does it play?
 *
 * The real bootstrap, the real `init` message, and a real answer. A cartridge
 * that throws on `create`, or draws nothing at all, never reaches a child.
 */
function itPlays(helpers, code, cartridge) {
  const sent = []
  const bag = { postMessage: (m) => sent.push(m) }
  // eslint-disable-next-line no-new-func
  new Function('self', helpers.WORKER_SOURCE)(bag)
  const grid = helpers.gridFor(cartridge.size)
  bag.onmessage({
    data: {
      m: 'init',
      code,
      seed: 7,
      locale: cartridge.locales[0],
      input: '',
      strings: cartridge.strings ?? {},
      seq: 1,
      w: grid.w,
      h: grid.h,
    },
  })
  const drew = sent.find((m) => m && m.m === 'draw')
  if (!drew) return 'it never answered the first frame'
  if (!Array.isArray(drew.cmds) || drew.cmds.length === 0) return 'it drew nothing'
  return null
}

/** A cartridge's hints, as the plain lines a manifest carries. */
function hintsFor(helpers, cartridge) {
  const out = {}
  for (const locale of LOCALES) {
    if (!cartridge.locales.includes(locale)) continue
    const t = helpers.makeT(locale, cartridge.strings)
    const lines = cartridge.hints(t)
      .map((h) => `${h.keys} ${h.label}`.trim())
      .filter((line) => line.length > 0)
    // Five, because the piano needs five: seven white keys, five sharps, a
    // length dial, a record button and a play button. The cap exists so a
    // cart cannot carry a manual, not to make a game hide a key it has.
    if (lines.length > 0) out[locale] = lines.slice(0, 5)
  }
  return out
}

/** The word a child types, per language. Exactly the built-in's own trigger. */
function namesFor(cartridge) {
  const out = {}
  for (const locale of LOCALES) {
    const word = cartridge.triggers[locale]?.[0]
    if (word && cartridge.locales.includes(locale)) out[locale] = word
  }
  return out
}

/**
 * Why a cartridge could not even be read. `import.meta.glob` is the one that
 * matters and deserves its own sentence: it is Vite's, not JavaScript's, so a
 * cartridge that uses it exists only inside the app's own build and can never
 * be a standalone file.
 */
function reasonFor(err) {
  const first = String(err && err.message).split('\n')[0]
  if (first.includes('import_meta.glob') || first.includes('import.meta.glob')) {
    return 'it reads the cartridge registry through Vite\'s import.meta.glob, which is a '
      + 'build-time feature of the app rather than JavaScript — outside the app there is no '
      + 'registry for it to list'
  }
  return `it could not be read: ${first}`
}

async function packOne(helpers, id) {
  const dir = path.join(CARTRIDGES, id)
  const mod = await importSource(
    await bundleOne(`export { default as cart } from '${posix(path.join(dir, 'cartridge'))}'`, 'esm'),
  )
  const cartridge = mod.cart

  if (!cartridge || cartridge.apiVersion !== 1) {
    return { id, why: 'it is not an apiVersion 1 cartridge' }
  }
  if (cartridge.kind !== 'live') {
    return {
      id,
      why: `it is ${cartridge.kind === 'echo' ? 'an echo' : 'a turn'} cartridge, and a cart is a `
        + 'frame loop — the sandbox protocol has no turn taking and nothing for a one-shot '
        + 'answer to do',
    }
  }

  const names = namesFor(cartridge)
  if (Object.keys(names).length === 0) {
    return { id, why: 'it has no trigger word in any language it declares' }
  }

  let code
  let sources
  try {
    const built = await bundleOne(workerEntry(dir), 'iife', { metafile: true })
    code = built.text
    // WHAT WENT INTO THIS BUNDLE, exactly — esbuild's own answer, not a guess
    // at which folder a cartridge lives in. A shared helper (`stage.ts`, a
    // content table) is in here too, so editing one and forgetting the packer
    // is caught the same as editing the cartridge itself.
    sources = Object.keys(built.metafile.inputs)
      .map((f) => posix(path.relative(ROOT, path.resolve(ROOT, f))))
      .filter((f) => !f.startsWith('..') && existsSync(path.join(ROOT, f)))
      .sort()
  } catch (err) {
    return { id, why: `it does not bundle standalone: ${String(err.message).split('\n')[0]}` }
  }
  if (helpers.looksImportable(code)) {
    return { id, why: 'the bundle still mentions import, which the sandbox refuses' }
  }

  const broke = itPlays(helpers, code, cartridge)
  if (broke) return { id, why: `it bundles, but ${broke}` }

  return {
    sources,
    manifest: {
      apiVersion: 1,
      id: `kidboard-${cartridge.id}`,
      name: names,
      title: names,
      author: 'kidboard',
      locales: cartridge.locales.filter((l) => names[l] !== undefined),
      hints: hintsFor(helpers, cartridge),
      strings: cartridge.strings ?? {},
      code,
      size: cartridge.size,
      ...(cartridge.triggers.emoji?.[0] ? { emoji: cartridge.triggers.emoji[0] } : {}),
    },
  }
}

const HEADER = `/**
 * GENERATED by \`npm run pack-carts\`. Do not edit by hand.
 *
 * The built-in games, each bundled into one standalone script that runs in a
 * cart's Worker — the cartridge's own source with every import inlined, its
 * string catalogs folded in, and its triggers, hints and size carried across.
 * The \`code\` in here is what actually plays when a child drops the file back.
 *
 * These are MANIFESTS, not files. Nothing is pre-loaded: the 🃏 panel builds
 * a PNG from one of these the moment a child asks to save it, through the
 * same path a child's own drawing takes, and the app still ships with no
 * carts loaded at all.
 *
 * \`UNPACKABLE\` is the honest other half — every built-in that cannot become a
 * cart, and why. See \`scripts/pack-carts.mjs\` and \`docs/CARTS.md\`.
 */
import type { CartManifest } from './manifest'

`

const SOURCES_DOC = `
/**
 * FRESHNESS. Per cart: every file esbuild actually pulled into its bundle,
 * and one hash over their contents. \`packed.test.ts\` reads the same files,
 * hashes them the same way (\`carts/freshness.ts\`, shared with the packer so
 * there is only ever one implementation) and fails with the cartridge's name
 * and this command if they no longer agree. That is what stops a stale
 * artifact — a cart that has quietly stopped being the game it claims to be —
 * from shipping in silence.
 */
export const SOURCES: Record<string, { files: string[]; hash: string }> = `

function emit(packed, unpackable, sources) {
  const body = [
    HEADER,
    'export const PACKED: CartManifest[] = ',
    JSON.stringify(packed, null, 2),
    '\n\n',
    '/** A built-in that cannot be a cart, and the reason. Not a failure — a fact. */\n',
    'export const UNPACKABLE: { id: string; why: string }[] = ',
    JSON.stringify(unpackable, null, 2),
    '\n',
    SOURCES_DOC,
    JSON.stringify(sources, null, 2),
    '\n',
  ].join('')
  writeFileSync(OUT, body, 'utf8')
}

async function main() {
  const wanted = process.argv.slice(2)
  const ids = readdirSync(CARTRIDGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP.has(e.name))
    .map((e) => e.name)
    .filter((id) => existsSync(path.join(CARTRIDGES, id, 'cartridge.ts')))
    .filter((id) => wanted.length === 0 || wanted.includes(id))
    .sort()

  const helpers = await loadHelpers()
  const packed = []
  const unpackable = []
  const sources = {}

  for (const id of ids) {
    let res
    try {
      res = await packOne(helpers, id)
    } catch (err) {
      res = { id, why: reasonFor(err) }
    }
    if (res.manifest) {
      packed.push(res.manifest)
      sources[res.manifest.id] = {
        files: res.sources,
        hash: helpers.hashSources(res.sources, ROOT),
      }
      console.log(`  packed   ${id.padEnd(10)} ${String(res.manifest.code.length).padStart(6)} bytes`
        + `  ${res.sources.length} sources`)
    } else {
      unpackable.push({ id: res.id, why: res.why })
      console.log(`  skipped  ${id.padEnd(10)} ${res.why}`)
    }
  }

  emit(packed, unpackable, sources)
  console.log(`\n${packed.length} packed, ${unpackable.length} not, into ${path.relative(ROOT, OUT)}`)
}

await main()
