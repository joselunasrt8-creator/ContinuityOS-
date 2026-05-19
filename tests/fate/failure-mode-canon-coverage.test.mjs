import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const matrixPath = new URL('../../governance/runtime/FAILURE_MODE_COVERAGE_MATRIX.json', import.meta.url)
const requiredModes = [
  'missing validation lineage',
  'missing execution lineage',
  'orphan continuity',
  'revoked authority descendant',
  'validated/executed hash mismatch',
  'proof hash divergence',
  'consumed authority reuse',
  'duplicate legitimacy lineage replay',
  'registry divergence',
  'missing registry persistence',
  'broken recursive traversal',
  'cross-registry drift',
  'missing required fields',
  'unauthorized scope expansion',
  'execution without ACTIVE validation',
  'proof without successful execution',
  'expired authority compile attempt',
  'revoked continuity proof finality attempt',
  'proof replay recovery ambiguity',
  'duplicate proof canonicalization',
  'proof without EXECUTED execution lineage'
]
const allowedStatuses = new Set(['COVERED', 'PARTIAL', 'MISSING', 'DUPLICATE_OR_AMBIGUOUS', 'SUPERSEDED'])
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))

test('coverage matrix exists and has expected audit classification', () => {
  assert.equal(existsSync(matrixPath), true)
  assert.equal(matrix.artifact, 'FAILURE_MODE_CANON_COVERAGE_AUDIT')
  assert.equal(matrix.status, 'FAILURE_MODE_CANON_COVERAGE_AUDITED')
  assert.ok(Array.isArray(matrix.entries) && matrix.entries.length > 0)
})

test('all required failure modes are present exactly once', () => {
  const names = matrix.entries.map((entry) => entry.failure_mode_name)
  for (const mode of requiredModes) {
    assert.equal(names.filter((name) => name === mode).length, 1, `expected exactly one entry for: ${mode}`)
  }
})

test('every failure mode has deterministic NULL condition and allowed status', () => {
  for (const entry of matrix.entries) {
    assert.equal(typeof entry.canonical_null_condition, 'string')
    assert.ok(entry.canonical_null_condition.trim().length > 0, `missing canonical_null_condition for ${entry.failure_mode_id}`)
    assert.match(entry.canonical_null_condition, /NULL|quarantine/i)

    assert.equal(typeof entry.coverage_status, 'string')
    assert.ok(allowedStatuses.has(entry.coverage_status), `invalid coverage_status for ${entry.failure_mode_id}`)
  }
})

test('COVERED entries include at least one evidence file', () => {
  for (const entry of matrix.entries) {
    if (entry.coverage_status === 'COVERED') {
      assert.ok(Array.isArray(entry.evidence) && entry.evidence.length > 0, `COVERED entry missing evidence: ${entry.failure_mode_id}`)
    }
  }
})

test('MISSING and PARTIAL entries include recommended_action', () => {
  for (const entry of matrix.entries) {
    if (entry.coverage_status === 'MISSING' || entry.coverage_status === 'PARTIAL') {
      assert.equal(typeof entry.recommended_action, 'string')
      assert.ok(entry.recommended_action.trim().length > 0, `${entry.failure_mode_id} requires recommended_action`)
    }
  }
})

test('recent PR hardening is represented for proof, continuity, and authority gating', () => {
  const allPRs = new Set(matrix.entries.flatMap((entry) => Array.isArray(entry.related_pr) ? entry.related_pr : []))
  assert.ok(allPRs.has('#491'))
  assert.ok(allPRs.has('#514'))
  assert.ok(allPRs.has('#516'))
  assert.ok(allPRs.has('#517'))
  assert.ok(allPRs.has('#518'))
  assert.ok(allPRs.has('#519'))
})

test('no coverage entry implies execution authority', () => {
  const prohibitedPatterns = [/implied authority/i, /implicit authority/i, /execution authority granted by coverage/i]
  for (const entry of matrix.entries) {
    const serialized = JSON.stringify(entry)
    for (const pattern of prohibitedPatterns) {
      assert.doesNotMatch(serialized, pattern)
    }
  }
})
