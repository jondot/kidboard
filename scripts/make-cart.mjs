#!/usr/bin/env node
/**
 * make-cart — turn a file of JavaScript into a cartridge somebody can play.
 *
 *     npm run make-cart -- mygame.js --name pop --title "Pop!"
 *
 * WHY THIS EXISTS. The cart format was fully specified and completely
 * one-directional: the app could hand a child a PNG, and there was no way on
 * earth to make one from outside it. Anybody who wanted to write a game had to
 * fork this repo and add a built-in — which made "a portable cart" true only
 * in the direction that did not matter. This is the other direction. One file
 * of plain JavaScript in, one cartridge out, no fork and no build.
 *
 * WHAT YOUR FILE HAS TO DO — exactly what `docs/CARTS.md` says a cart does:
 *
 *     kb.game(function (ctx) {
 *       var x = 0
 *       return {
 *         onKey: function (k) { if (k.key === 'ArrowRight') x += 1 },
 *         tick:  function (dt) { x += dt },
 *         draw:  function (c) { c.clear(); c.rect(x, 4, 8, 8) },
 *         souvenir: function () { return 'nice one' }
 *       }
 *     })
 *
 * You may `import` your own files: esbuild inlines them, because a cart runs
 * in a Worker with no module resolution and has to be one self-contained
 * script. You may not import a package that needs the DOM or the network —
 * there is neither in there.
 *
 * IT REFUSES TO WRITE A CART THAT DOES NOT PLAY. The same three gates
 * `pack-carts` holds the built-ins to: it must bundle with nothing dangling,
 * it must survive `looksImportable` (the sandbox's one static gate), and it
 * must answer the first frame with drawing in it. A file that lies about
 * containing a game is the one thing this must never produce, because the
 * person who finds out is a six-year-old.
 *
 * WHAT IT DOES NOT DO. It does not review your code. A cart is a program a
 * stranger wrote; the sandbox contains code, not intent. See the first section
 * of `docs/CARTS.md`.
 */

import { build } from 'esbuild'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const posix = (p) => p.split(path.sep).join('/')

const die = (msg) => { console.error(`\nmake-cart: ${msg}\n`); process.exit(1) }

/* ---- the arguments ------------------------------------------------------ */

const USAGE = `
  npm run make-cart -- <file.js> --name <word> [options]

  --name <word>       the word a child types to play it        (required)
  --title <text>      what the label says            (defaults to the name)
  --author <text>     printed under the title when a cart arrives
  --emoji <one>       an emoji that also starts it, for a child who cannot read
  --cols <n>          columns the game is drawn in                 (default 32)
  --aspect <n>        width / height at that column count       (default 1.333)
  --label <file>      the picture on the front: a .txt of rows, or a .png
  --hint "KEY what"   one line of help; repeatable
  --he-name <word>    the Hebrew word, if the game speaks Hebrew
  --he-title <text>   the Hebrew title
  --manifest <file>   a JSON file merged over all of the above
  --out <path>        where to write it            (default ./<name>.png)
`

function parseArgs(argv) {
  const out = { hints: [] }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { rest.push(a); continue }
    const key = a.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) die(`--${key} needs a value`)
    i += 1
    if (key === 'hint') out.hints.push(value)
    else out[key] = value
  }
  return { entry: rest[0], opts: out }
}

const { entry, opts } = parseArgs(process.argv.slice(2))
if (!entry) die(`no file to pack.\n${USAGE}`)
if (!existsSync(entry)) die(`${entry}: no such file`)

const extra = opts.manifest
  ? JSON.parse(readFileSync(opts.manifest, 'utf8'))
  : {}

const name = opts.name ?? extra.name?.en
if (!name) die(`this cart has no name — a child types the name.\n${USAGE}`)

/* ---- the app's own helpers, so this measures what the app does ----------- */

async function bundle(contents, format, extra2 = {}) {
  const out = await build({
    stdin: { contents, resolveDir: ROOT, sourcefile: 'make-cart.js', loader: 'js' },
    bundle: true,
    write: false,
    format,
    target: 'es2019',
    platform: 'neutral',
    minify: format === 'iife',
    legalComments: 'none',
    // Emoji stay emoji and Hebrew stays Hebrew: escapes are forbidden here.
    charset: 'utf8',
    logLevel: 'silent',
    ...extra2,
  })
  return out.outputFiles[0].text
}

const importSource = (src) =>
  import(`data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`)

const helpers = await importSource(await bundle([
  `export { buildCartPng, cartFilename, PLAIN_LABEL } from '${posix(path.join(ROOT, 'src/carts/export'))}'`,
  `export { readManifest } from '${posix(path.join(ROOT, 'src/carts/manifest'))}'`,
  `export { fromRows } from '${posix(path.join(ROOT, 'src/carts/art'))}'`,
  `export { decodeGray } from '${posix(path.join(ROOT, 'src/carts/pixels'))}'`,
  `export { gridFor } from '${posix(path.join(ROOT, 'src/runtime/GridCanvas'))}'`,
  `export { WORKER_SOURCE, looksImportable } from '${posix(path.join(ROOT, 'src/carts/workerSource'))}'`,
].join('\n'), 'esm'))

/* ---- the code ----------------------------------------------------------- */

let code
try {
  code = await bundle(
    `import '${posix(path.resolve(entry))}'`,
    'iife',
  )
} catch (err) {
  die(`${entry} could not be bundled: ${String(err.message).split('\n')[0]}`)
}

if (helpers.looksImportable(code)) {
  die('the bundled code still contains an import. A cart runs in a Worker with'
    + ' no module resolution, so everything it needs has to be inlined.')
}

/* ---- the picture on the front ------------------------------------------- */

/**
 * A label as rows of text (`x` is ink, a space is not) or as a picture. A PNG
 * is read with the app's own decoder and cut at the midpoint — a label is two
 * colours by the time it is written, so this is the whole of the conversion.
 */
async function labelFrom(file) {
  if (!file) return helpers.PLAIN_LABEL
  if (!existsSync(file)) die(`${file}: no such file`)
  if (file.toLowerCase().endsWith('.png')) {
    const gray = await helpers.decodeGray(new Uint8Array(readFileSync(file)))
    if (!gray) die(`${file}: this is not a PNG I can read`)
    let lo = 255
    let hi = 0
    for (const v of gray.lum) { if (v < lo) lo = v; if (v > hi) hi = v }
    const mid = (lo + hi) / 2
    const on = new Uint8Array(gray.w * gray.h)
    for (let i = 0; i < on.length; i++) on[i] = gray.lum[i] > mid ? 1 : 0
    return { w: gray.w, h: gray.h, on }
  }
  const rows = readFileSync(file, 'utf8').replace(/\n+$/, '').split('\n')
  return helpers.fromRows(rows)
}

const label = await labelFrom(opts.label)

/* ---- the manifest ------------------------------------------------------- */

const locales = ['en', ...(opts['he-name'] || extra.name?.he ? ['he'] : [])]
const title = opts.title ?? extra.title?.en ?? name

const draft = {
  apiVersion: 1,
  id: extra.id ?? `made-${name.toLowerCase().replace(/[^a-z0-9-]+/g, '')}`,
  name: { en: name, ...(opts['he-name'] ? { he: opts['he-name'] } : {}), ...extra.name },
  title: { en: title, ...(opts['he-title'] ? { he: opts['he-title'] } : {}), ...extra.title },
  author: opts.author ?? extra.author ?? '',
  locales: extra.locales ?? locales,
  hints: opts.hints.length > 0 ? { en: opts.hints } : extra.hints ?? {},
  strings: extra.strings ?? {},
  size: extra.size ?? {
    cols: Number(opts.cols ?? 32),
    aspect: Number(opts.aspect ?? 4 / 3),
  },
  ...(opts.emoji || extra.emoji ? { emoji: opts.emoji ?? extra.emoji } : {}),
  code,
}

const manifest = helpers.readManifest(draft)
if (!manifest) {
  die('the manifest was refused. A cart needs an id, a name in at least one'
    + ' language, and code that runs.')
}

/* ---- does it play? ------------------------------------------------------ */

function itPlays() {
  const sent = []
  const bag = { postMessage: (m) => sent.push(m) }
  // eslint-disable-next-line no-new-func
  new Function('self', helpers.WORKER_SOURCE)(bag)
  const grid = helpers.gridFor(manifest.size)
  bag.onmessage({
    data: {
      m: 'init',
      code: manifest.code,
      seed: 7,
      locale: manifest.locales[0],
      input: '',
      strings: manifest.strings ?? {},
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

const broken = itPlays()
if (broken) {
  die(`${entry} does not play: ${broken}.\n`
    + '  A cart has to call kb.game(...) with a factory that returns an object\n'
    + '  with a draw(c) on it, and that draw has to put something on the canvas.')
}

/* ---- write it ----------------------------------------------------------- */

const png = await helpers.buildCartPng(manifest, label, manifest.locales[0])
if (!png) die('the picture could not be encoded')

const out = opts.out && opts.out.toLowerCase().endsWith('.png')
  ? opts.out
  : path.join(opts.out ?? '.', helpers.cartFilename(manifest, manifest.locales[0]))

writeFileSync(out, png)

const hints = Object.values(manifest.hints ?? {})[0] ?? []
console.log(`
  ${out}   ${(png.length / 1024).toFixed(1)} kB

  a child types   ${Object.values(manifest.name).join('  or  ')}
  the label says  ${manifest.title.en ?? ''}
  ${hints.length > 0 ? `keys            ${hints.join(' · ')}` : ''}

  Drop it on the playground to play it.
`)
