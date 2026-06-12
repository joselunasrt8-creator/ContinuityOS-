import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildShadowGuardDiagnostic,
  divergenceEntriesFor,
} from '../src/lib/shadow-guard-scanner.ts'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDirectory, '..')
const outputDirectory = join(repoRoot, 'evidence', 'shadow-guard')
const diagnosticPath = join(outputDirectory, 'SHADOW_GUARD_DIAGNOSTIC.json')
const registryPath = join(outputDirectory, 'legitimacy_divergence_registry.jsonl')

const scannedDirectories = ['scripts', 'src/lib']
const scannedExtensions = ['.mjs', '.js', '.ts']

function hasScannedExtension(path) {
  return scannedExtensions.some((extension) => path.endsWith(extension))
}

function sourceFiles() {
  const files = []
  for (const directory of scannedDirectories) {
    const absoluteDirectory = join(repoRoot, directory)
    for (const entry of readdirSync(absoluteDirectory).sort((a, b) => a.localeCompare(b))) {
      const absolutePath = join(absoluteDirectory, entry)
      if (!statSync(absolutePath).isFile()) continue
      const file = relative(repoRoot, absolutePath)
      if (!hasScannedExtension(file)) continue
      files.push({ file, text: readFileSync(absolutePath, 'utf8') })
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file))
}

const diagnostic = buildShadowGuardDiagnostic({
  packageJsonText: readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  sourceFiles: sourceFiles(),
})
const divergences = divergenceEntriesFor(diagnostic.findings)

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`)
writeFileSync(
  registryPath,
  divergences.map((entry) => JSON.stringify(entry)).join('\n') + (divergences.length > 0 ? '\n' : ''),
)

console.log(JSON.stringify({
  diagnostic_only: diagnostic.diagnostic_only,
  enforcement: diagnostic.enforcement,
  artifact: 'evidence/shadow-guard/SHADOW_GUARD_DIAGNOSTIC.json',
  registry: diagnostic.divergence_registry_path,
  findings: diagnostic.findings.length,
  null_findings: diagnostic.summary.shadow_guard_null_count,
  divergence_entries: divergences.length,
}, null, 2))
