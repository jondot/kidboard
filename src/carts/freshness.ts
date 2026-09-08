import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * IS `packed.ts` STILL TRUE?
 *
 * `src/carts/packed.ts` is a build artifact that is committed, so the app and
 * the tests work without anybody running `npm run pack-carts`. The cost is
 * that changing a cartridge and forgetting to re-run the packer leaves a
 * downloadable cart that quietly stops being the game it claims to be.
 *
 * Re-bundling every cartridge to find that out is far too slow to run on
 * every test. So the packer records, per cart, the exact set of files esbuild
 * pulled into that bundle — its own source, its string catalogs, and every
 * shared module it reached — plus one hash over their contents. The test
 * reads the same files and hashes them the same way: a few hundred small
 * reads, a few milliseconds, and an honest answer.
 *
 * NODE ONLY. This reads the filesystem, so it belongs to the packer and to
 * `packed.test.ts` and to nothing else — nothing the browser loads imports
 * it, and nothing should. It lives here rather than in `scripts/` so that the
 * packer and the test hash *the same code*: a copy in each would be two
 * things that have to agree, which is exactly the drift this exists to catch.
 */

/** Every source file is read as bytes; a line ending is a change like any other. */
function feed(hash: ReturnType<typeof createHash>, file: string, root: string): void {
  hash.update(file)
  hash.update('\0')
  try {
    hash.update(readFileSync(path.join(root, file)))
  } catch {
    // A file that has been deleted still changes the answer — and says so by
    // hashing differently rather than by throwing at a contributor.
    hash.update('\0gone')
  }
  hash.update('\0')
}

/**
 * One hash over a set of source files, keyed on their paths as well as their
 * contents. Paths are repo-relative and posix-separated; the list is sorted
 * here so the caller never has to remember to.
 */
export function hashSources(files: readonly string[], root = process.cwd()): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) feed(hash, file, root)
  return hash.digest('hex').slice(0, 16)
}
