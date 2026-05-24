import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const defaultSrcPath = fileURLToPath(new URL('../../src/index.ts', import.meta.url))

export async function importWorker(entryPoint = defaultSrcPath) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mindshift-worker-'))
  const outfile = join(tmpDir, 'worker.mjs')
  buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    outfile,
    platform: 'neutral',
  })
  const mod = await import(pathToFileURL(outfile).href)
  rmSync(tmpDir, { recursive: true, force: true })
  return mod
}
