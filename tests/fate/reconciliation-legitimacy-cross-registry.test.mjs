import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const doc = readFileSync(new URL('../../docs/recursive-reconciliation-traversal.md', import.meta.url), 'utf8')

test('cross-registry reconciliation enforces deterministic read-only recursive traversal', () => {
  assert.match(source, /async function deterministicRecursiveReconciliationTraversal/)
  assert.match(source, /if \(rows\.length === 0\) return reconciliationInvalid\("orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(rows\.length > 1\) return reconciliationInvalid\("traversal_instability_drift"/)
  assert.match(source, /if \(String\(row\.invocation_nonce \|\| ""\) !== String\(context\.validation\.invocation_nonce \|\| ""\)\) return "replay_chain_drift"/)
  assert.match(source, /if \(String\(row\.validated_object_hash \|\| ""\) !== String\(context\.execution\.validated_object_hash \|\| ""\)\) return "proof_lineage_drift"/)
  assert.match(source, /if \(String\(row\.reviewed_hash \|\| ""\) !== String\(context\.aeo\.validated_object_hash \|\| ""\)\) return "preo_ancestry_drift"/)
})

test('deterministic snapshots and quarantine remain evidence-only and replay-neutral', () => {
  assert.match(source, /type ReconciliationCheckpoint/)
  assert.match(source, /reconciliation_merkle_root/)
  assert.match(source, /drift_snapshot_hash/)
  assert.match(source, /revocation_snapshot_hash/)
  assert.match(source, /RECONCILIATION_QUARANTINE_ROUTE/)
  assert.match(source, /evidence_only: true/)
  assert.match(source, /replay_neutral: true/)
  assert.match(doc, /fail-closed/i)
})
