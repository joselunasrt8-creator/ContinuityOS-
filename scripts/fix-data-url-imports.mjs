/**
 * Replaces data: URL esbuild import pattern with filesystem-backed importWorker() helper.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function collectTestFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(join(dir, entry.name)))
    } else if (entry.name.endsWith('.test.mjs')) {
      files.push(join(dir, entry.name))
    }
  }
  return files
}

// Backtick character — defined as a variable so this file's own template literals aren't affected
const BT = String.fromCharCode(96)

const testFiles = collectTestFiles(join(root, 'tests'))

for (const file of testFiles) {
  let src = readFileSync(file, 'utf8')
  if (!src.includes('data:text/javascript;base64,')) continue

  const inFate = file.includes('/fate/')
  const helperPath = inFate ? '../helpers/import-worker.mjs' : './helpers/import-worker.mjs'

  // ── Remove top-level static esbuild import ──────────────────────────────
  src = src.replace(/^import\s*\{[^}]*transformSync[^}]*\}\s*from\s*['"]esbuild['"]\s*\n/m, '')

  // ── Remove standalone `const compiled = transformSync(...)` lines ────────
  src = src.replace(/^\s*const compiled = transformSync\(source,\s*\{[^}]+\}\)\.code\s*\n/gm, '')

  // ── Remove inline `const { transformSync } = await import('esbuild')` lines
  src = src.replace(/^\s*const\s*\{\s*transformSync\s*\}\s*=\s*await\s+import\(['"]esbuild['"]\)\s*\n/gm, '')

  // ── Replace the full data: URL import(...`...`) call ─────────────────────
  // Use [^BT]* to match anything up to the closing backtick of the template literal.
  const dataUrlRe = new RegExp(
    'import\\(' + BT + 'data:text\\/javascript;base64,[^' + BT + ']*' + BT + '\\)',
    'g'
  )
  src = src.replace(dataUrlRe, 'importWorker()')

  if (!src.includes('importWorker()')) {
    console.warn('SKIPPED (no replacement made):', file.replace(root, ''))
    continue
  }

  // ── Add helper import after the last top-level import line ──────────────
  if (!src.includes("from './helpers/import-worker.mjs'") &&
      !src.includes("from '../helpers/import-worker.mjs'")) {
    const importLines = [...src.matchAll(/^import .+\n/gm)]
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1]
      const insertAt = lastImport.index + lastImport[0].length
      src = src.slice(0, insertAt) + `import { importWorker } from '${helperPath}'\n` + src.slice(insertAt)
    } else {
      src = `import { importWorker } from '${helperPath}'\n` + src
    }
  }

  writeFileSync(file, src)
  console.log('patched:', file.replace(root, ''))
}
