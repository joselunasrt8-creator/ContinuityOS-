import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { detectRecursiveSemanticDrift } from '../src/recursive-semantic-drift-detection.ts'

function mkView(registry_id, overrides = {}) {
  return {
    registry_id,
    visibility_complete: true,
    canonical_equivalence: ['canon:a'],
    replay_semantics: ['replay:a'],
    reconciliation_semantics: ['rec:a'],
    authority_scope: ['scope:a'],
    proof_semantics: ['proof:a'],
    topology_semantics: ['topo:a'],
    temporal_semantics: ['temp:a'],
    telemetry_semantics: ['tele:a'],
    distributed_semantics: ['dist:a'],
    hidden_semantic_surfaces: [],
    ...overrides,
  }
}

test('Issue #1142: canonical equivalence mismatch fixtures', () => {
  const result = detectRecursiveSemanticDrift({ drift_id: 'd1', evidence_only: true, views: [mkView('b'), mkView('a', { canonical_equivalence: ['canon:b'] })] })
  assert.equal(result.classification, 'CANONICAL_MISMATCH')
  assert.ok(result.equivalence_mismatch_inventory.length > 0)
})

test('Issue #1142: semantic drift classes per surface', () => {
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r', evidence_only: true, views: [mkView('a'), mkView('b', { replay_semantics: ['replay:b'] })] }).classification, 'REPLAY_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r2', evidence_only: true, views: [mkView('a'), mkView('b', { reconciliation_semantics: ['rec:b'] })] }).classification, 'RECONCILIATION_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r3', evidence_only: true, views: [mkView('a'), mkView('b', { authority_scope: ['scope:b'] })] }).classification, 'AUTHORITY_SCOPE_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r4', evidence_only: true, views: [mkView('a'), mkView('b', { proof_semantics: ['proof:b'] })] }).classification, 'PROOF_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r5', evidence_only: true, views: [mkView('a'), mkView('b', { topology_semantics: ['topo:b'] })] }).classification, 'TOPOLOGY_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r6', evidence_only: true, views: [mkView('a'), mkView('b', { temporal_semantics: ['temp:b'] })] }).classification, 'TEMPORAL_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r7', evidence_only: true, views: [mkView('a'), mkView('b', { telemetry_semantics: ['tele:b'] })] }).classification, 'TELEMETRY_SEMANTIC_DRIFT')
  assert.equal(detectRecursiveSemanticDrift({ drift_id: 'r8', evidence_only: true, views: [mkView('a'), mkView('b', { distributed_semantics: ['dist:b'] })] }).classification, 'DISTRIBUTED_FRAGMENTATION')
})

test('Issue #1142: unknown semantic surface fixtures and deterministic ordering', () => {
  const result = detectRecursiveSemanticDrift({ drift_id: 'u1', evidence_only: true, views: [mkView('z', { hidden_semantic_surfaces: ['hidden-z'] }), mkView('a', { hidden_semantic_surfaces: ['hidden-a'] })] })
  assert.equal(result.classification, 'UNKNOWN_SEMANTIC_SURFACE')
  assert.deepEqual(result.deterministic_traversal, ['a', 'z'])
})

test('Issue #1142: frozen output, null handling, and no authority semantics', () => {
  const result = detectRecursiveSemanticDrift({ drift_id: 'f1', evidence_only: true, views: [mkView('a'), mkView('b')] })
  assert.equal(result.classification, 'NULL')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.canonical_hashes))

  const nil = detectRecursiveSemanticDrift({ drift_id: 'nil', evidence_only: true, views: [] })
  assert.equal(nil.classification, 'NULL')
})

test('Issue #1142: canonical hashing verification', () => {
  const v = mkView('a')
  const expected = sha256Hex(canonicalize({
    canonical_equivalence: ['canon:a'],
    replay_semantics: ['replay:a'],
    reconciliation_semantics: ['rec:a'],
    authority_scope: ['scope:a'],
    proof_semantics: ['proof:a'],
    topology_semantics: ['topo:a'],
    temporal_semantics: ['temp:a'],
    telemetry_semantics: ['tele:a'],
    distributed_semantics: ['dist:a'],
  }))
  const result = detectRecursiveSemanticDrift({ drift_id: 'h1', evidence_only: true, views: [v] })
  assert.equal(result.canonical_hashes.a, expected)
})
