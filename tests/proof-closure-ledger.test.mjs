import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ledgerPath = 'governance/merge-legitimacy/PROOF_CLOSURE_LEDGER.md'
const ledger = readFileSync(ledgerPath, 'utf8')

const expectedPrs = Array.from({ length: 10 }, (_, i) => `#${2186 + i}`)
const requiredColumns = [
  'pr_number',
  'proof row status',
  'merge_commit_sha if locally available',
  'proof_id if locally available',
  'proof_hash if locally available',
  'change_theme',
  'affected_invariant',
  'implementation_artifact',
  'verification_artifact',
  'enforcement_artifact',
  'proof_registry_artifact',
  'reconciliation_artifact',
  'attribution_classification',
  'closure_class',
  'evidence_missing',
  'must_not_claim',
]
const closureClasses = [
  'IMPLEMENTATION_ONLY',
  'VERIFICATION_PRESENT',
  'ENFORCEMENT_PRESENT',
  'PROOF_REGISTRY_LINKED',
  'RECONCILED_PROOF_BACKED',
  'RESEARCH_CLOSED_ONLY',
  'DEPENDENCY_CANDIDATE_ONLY',
  'NOT_CLOSABLE',
  'NOT_IN_SCOPE_OR_NO_LOCAL_ROW',
]

function tableRows() {
  return ledger
    .split('\n')
    .filter((line) => line.startsWith('| #'))
}

test('proof closure ledger covers PRs #2186 through #2195 exactly once', () => {
  const rows = tableRows()
  assert.equal(rows.length, expectedPrs.length)

  for (const pr of expectedPrs) {
    const matches = rows.filter((row) => row.startsWith(`| ${pr} |`))
    assert.equal(matches.length, 1, `${pr} must appear exactly once as a ledger row`)
  }
})

test('proof closure ledger keeps the requested columns and closure classes visible', () => {
  for (const column of requiredColumns) {
    assert.match(ledger, new RegExp(`\\b${column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))
  }

  for (const closureClass of closureClasses) {
    assert.ok(ledger.includes('`' + closureClass + '`'), `${closureClass} must be listed`)
  }
})

test('proof closure ledger preserves required no-row classifications', () => {
  for (const pr of ['#2187', '#2189', '#2191', '#2194']) {
    const row = tableRows().find((candidate) => candidate.startsWith(`| ${pr} |`))
    assert.ok(row, `${pr} row must exist`)
    assert.match(row, /NO_LOCAL_PROOF_ROW_FOR_THIS_PR_NUMBER/)
    assert.match(row, /`NOT_IN_SCOPE_OR_NO_LOCAL_ROW`/)
  }
})

test('proof closure ledger preserves non-claims and missing evidence', () => {
  assert.match(ledger, /A proof registry row alone is not closure\./)
  assert.match(ledger, /This skeleton does not claim:/)
  assert.match(ledger, /any issue is closed;/)
  assert.match(ledger, /independent outside-owner dependency proof exists;/)
  assert.match(ledger, /Reconciliation artifact binding implementation, verification, enforcement, merge commit, proof row, and registry state\./)
})
