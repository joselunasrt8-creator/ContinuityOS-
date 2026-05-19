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

test('reconciliation report artifact is deterministic, canonical, and evidence-only', () => {
  assert.match(source, /type ReconciliationReport = \{/)
  for (const field of ['report_id', 'traversal_id', 'reconciliation_merkle_root', 'registry_order', 'checked_registries', 'drift_results', 'quarantine_candidates', 'evidence_only: true', 'replay_neutral: true', 'created_at']) {
    assert.match(source, new RegExp(field))
  }
  assert.match(source, /async function deterministicReconciliationReportHash/)
  assert.match(source, /return sha256Hex\(canonicalize\(report\)\)/)
  assert.match(source, /async function deterministicReconciliationReport\(/)
  assert.match(source, /registry_order: result\.canonical_registry_ordering/)
  assert.match(source, /const traversed = new Set\(result\.deterministic_traversal_trace\.map\(\(entry\) => entry\.registry\)\)/)
  assert.match(source, /const checked_registries = result\.canonical_registry_ordering\.filter\(\(registry\) => traversed\.has\(registry\)\)/)
  assert.match(source, /const drift_results = result\.drift_classifications\.map\(\(drift\) => drift\.drift_class\)\.sort\(\)/)
  assert.match(source, /\.filter\(\(drift\) => drift\.severity === "CRITICAL" \|\| drift\.severity === "HIGH"\)/)
  assert.match(source, /\.map\(\(drift\) => drift\.lineage_anchor\)/)
  assert.match(source, /\.sort\(\)/)
  assert.match(source, /const reportPayload = \{/)
  assert.match(source, /return \{ report_id: await deterministicReconciliationReportHash\(reportPayload\), \.\.\.reportPayload \}/)
})
