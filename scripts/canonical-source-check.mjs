#!/usr/bin/env node
/**
 * Canonical source path lint check (issue #1837).
 *
 * Verifies that enforcement tooling only references canonical inventory paths,
 * not non-canonical copies. Fails with exit 1 on any violation.
 *
 * Non-canonical paths are governance artifact copies classified in
 * INVENTORY_SOURCE_MAP.md as ROOT_ACCUMULATION, GOVERNANCE_PROJECTION*,
 * RUNTIME_PROJECTION_LEGACY, or GENERATED_BUNDLE_COPY.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')

// Enforcement tooling files that must not reference non-canonical paths.
// Excludes generation scripts (regenerate-governance-artifacts.mjs) which write
// to non-canonical paths by design, and existence-check steps (constitutional-integrity.yml)
// which verify a file is present rather than loading it for validation.
const ENFORCEMENT_FILES = [
  '.github/workflows/merge-governance-check.yml',
  '.github/workflows/governed-deploy.yml',
  '.github/workflows/conformance.yml',
  'scripts/bypass-audit-detector.mjs',
]

// Non-canonical paths that enforcement tooling must not load.
// Matched as complete path segments (preceded by quote, slash, or whitespace)
// to avoid false-positive substring matches against canonical paths.
const NON_CANONICAL_PATHS = {
  EXECUTION_SURFACES: [
    // ROOT_ACCUMULATION — root file (match only when not preceded by a directory separator)
    { pattern: /(?<![/\w])EXECUTION_SURFACES\.json/, label: 'EXECUTION_SURFACES.json (root)' },
    { pattern: /governance\/execution_surfaces\.json/, label: 'governance/execution_surfaces.json' },
    { pattern: /runtime\/execution_surfaces\.json/, label: 'runtime/execution_surfaces.json' },
    { pattern: /mindshift-validation-bundle\/governance\/EXECUTION_SURFACES\.json/, label: 'governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json' },
  ],
  BYPASS_PATHS: [
    { pattern: /governance\/runtime\/BYPASS_PATHS\.json/, label: 'governance/runtime/BYPASS_PATHS.json' },
    { pattern: /runtime\/surfaces\/BYPASS_PATHS\.json/, label: 'runtime/surfaces/BYPASS_PATHS.json' },
    { pattern: /runtime\/bypass_paths\.json/, label: 'runtime/bypass_paths.json' },
    { pattern: /mindshift-validation-bundle\/governance\/BYPASS_PATHS\.json/, label: 'governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json' },
  ],
}

let violations = 0

for (const relPath of ENFORCEMENT_FILES) {
  const absPath = resolve(REPO_ROOT, relPath)
  let content
  try {
    content = readFileSync(absPath, 'utf8')
  } catch {
    // File absent — not a violation (not all enforcement files exist in every context)
    continue
  }

  for (const [family, nonCanonicalList] of Object.entries(NON_CANONICAL_PATHS)) {
    for (const { pattern, label } of nonCanonicalList) {
      if (pattern.test(content)) {
        console.error(
          `VIOLATION: ${relPath} references non-canonical ${family} path: ${label}`,
        )
        console.error(`  Canonical source per INVENTORY_SOURCE_MAP.md Family ${family === 'EXECUTION_SURFACES' ? '1' : '2'}`)
        violations++
      }
    }
  }
}

if (violations === 0) {
  console.log(`canonical-source-check: OK — enforcement tooling references only canonical inventory paths`)
  process.exit(0)
} else {
  console.error(`canonical-source-check: FAIL — ${violations} violation(s) found`)
  process.exit(1)
}
