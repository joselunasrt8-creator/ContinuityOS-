#!/usr/bin/env node
// actions/continuity-merge-guard/test.mjs
// Deterministic conformance test for the Merge Guard decision logic.
// No network, no GitHub API — runs evaluate() directly against fixtures.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './check.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(dir, 'fixtures')

let passCount = 0
let failCount = 0

function recordPass(name, message) {
  passCount++
  console.log(`  ${name} PASS — ${message}`)
}

function recordFail(name, message) {
  failCount++
  console.error(`  ${name} FAIL — ${message}`)
}

console.log('=== ContinuityOS Merge Guard — conformance test ===\n')

for (const file of readdirSync(fixturesDir).sort()) {
  if (!file.endsWith('.json')) continue
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const decision = evaluate(fixture.input)

  if (decision.result !== fixture.expected_result) {
    recordFail(file, `expected result ${fixture.expected_result}, got ${decision.result}`)
    continue
  }

  const missingMatch =
    JSON.stringify(decision.missing_fields) === JSON.stringify(fixture.expected_missing_fields)
  if (!missingMatch) {
    recordFail(file, `expected missing_fields ${JSON.stringify(fixture.expected_missing_fields)}, got ${JSON.stringify(decision.missing_fields)}`)
    continue
  }

  if (fixture.check_type === 'deterministic_hash') {
    const decisionAgain = evaluate(fixture.input)
    if (decision.canonical_hash !== decisionAgain.canonical_hash) {
      recordFail(file, `canonical_hash not deterministic: ${decision.canonical_hash} vs ${decisionAgain.canonical_hash}`)
      continue
    }
    recordPass(file, `${fixture.description} [sha256: ${decision.canonical_hash.slice(0, 16)}...]`)
    continue
  }

  recordPass(file, fixture.description)
}

const total = passCount + failCount
console.log(`\nTotal: ${total}  |  PASS: ${passCount}  |  FAIL: ${failCount}`)

if (failCount > 0) {
  process.exitCode = 1
} else {
  console.log('MERGE_GUARD_CONFORMANCE_COMPLETE')
}
