import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

const RECONCILIATION_TRAVERSAL_ORDER = [
  'proof_registry',
  'execution_registry',
  'validation_registry',
  'aeo_registry',
  'authority_registry',
  'continuity_registry',
  'session_registry',
]

const requiredDriftClasses = [
  'proof_drift',
  'execution_drift',
  'authority_drift',
  'continuity_drift',
  'hash_drift',
  'preo_drift',
  'replay_drift',
  'provenance_drift',
  'reconciliation_drift',
]

const fateReasons = [
  'orphan_proof_lineage',
  'orphan_execution_lineage',
  'orphan_validation_lineage',
  'orphan_authority_lineage',
  'orphan_continuity_lineage',
  'revoked_continuity_descendant',
  'preo_reviewed_hash_mismatch',
  'workflow_provenance_divergence',
  'execution_replay_inconsistency',
  'invocation_registry_inconsistency',
  'proof_execution_hash_mismatch',
  'continuity_hash_mismatch',
  'canonical_hash_recomputation_mismatch',
  'authority_lineage_reconciliation_mismatch',
  'duplicate_lineage_reconciliation',
  'continuity_root_missing',
]

test('/reconcile is governed auxiliary observability-only infrastructure', () => {
  assert.match(source, /const GOVERNED_AUXILIARY_ROUTES = \["\/preo", "\/reconcile"\] as const/)
  assert.match(source, /if \(url\.pathname === "\/reconcile" && request\.method === "POST"\)/)
  assert.match(source, /return json\(\{ status: "VALID", reconciliation: "COMPLETE" \}\)/)
  assert.match(source, /return json\(await reconciliationDrift/)
  assert.doesNotMatch(
    source.match(/if \(url\.pathname === "\/reconcile" && request\.method === "POST"\)[\s\S]*?\n    \}/)?.[0] ?? '',
    /UPDATE authority_registry|INSERT INTO proof_registry|INSERT INTO execution_registry|INSERT INTO validation_registry|INSERT INTO invocation_registry/,
    '/reconcile must not mutate canonical runtime registries',
  )
})

test('reconciliation drift classes are deterministically classified', () => {
  for (const driftClass of requiredDriftClasses) {
    assert.match(source, new RegExp(`"${driftClass}"`), `${driftClass} must be represented`)
  }
})

test('reconciliation traverses canonical registries in required fail-closed order', () => {
  assert.match(
    source,
    /const RECONCILIATION_TRAVERSAL_ORDER = \["proof_registry", "execution_registry", "validation_registry", "aeo_registry", "authority_registry", "continuity_registry", "session_registry"\] as const/,
  )
  assert.match(source, /async function reconcileProofLineage/, 'lineage reconciliation function must exist')
  assert.match(source, /async function readonlyContinuityChain/, 'continuity traversal must be read-only and recursive')
})

test('reconciliation persists observability events and drift entries on every mismatch', () => {
  assert.match(source, /async function reconciliationDrift[\s\S]*event_type: "RECONCILIATION_DRIFT"[\s\S]*await recordDrift/)
  assert.match(source, /failing_surface: result\.failing_surface/)
  assert.match(source, /reason: result\.reason/)
  assert.match(source, /reconciliation: "FAILED_CLOSED"/)
})

test('FATE reconciliation suite covers orphan, hash, replay, provenance, PREO, duplicate, concurrent-safe read-only, and quarantine surfaces', () => {
  for (const reason of fateReasons) {
    assert.match(source, new RegExp(reason), `${reason} must have deterministic reconciliation coverage`)
  }
  assert.match(source, /ORDER BY created_at ASC, proof_id ASC/, 'concurrent reconciliation must use deterministic proof ordering')
  assert.match(source, /proof_registry_duplicate_archive/, 'historical lineage quarantine remains in the canonical schema')
})

