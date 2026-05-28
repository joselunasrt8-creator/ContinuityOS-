import test from 'node:test'
import assert from 'node:assert/strict'
import { traverseCrossRegistries } from '../../runtime/reconciliation/cross-registry-reconciliation-engine.js'

const base = {
  session_registry: [{ session_id: 's1', identity_id: 'i1', status: 'ACTIVE' }],
  continuity_registry: [{ continuity_id: 'c1', session_id: 's1', identity_id: 'i1', status: 'ACTIVE', continuity_hash: 'h1', canonical_continuity: JSON.stringify({ continuity_id: 'c1', session_id: 's1', identity_id: 'i1', actor_chain: [], authority_chain: [], constraints: {}, expires_at: '', issued_at: '', scope: {}, revocation: { status: 'ACTIVE', revoked_at: null }, continuity_hash: 'h1' }) }],
  authority_registry: [], aeo_registry: [], validation_registry: [], execution_registry: [], proof_registry: [], invocation_registry: [], preo_registry: [], runtime_topology_registry: [], recursive_governance_containment_registry: [], root_authority_observability_registry: [], unauthorized_mutation_closure_registry: []
}

test('same input -> same output hash', () => {
  const a = traverseCrossRegistries(base)
  const b = traverseCrossRegistries(base)
  assert.equal(a.reconciliation_output_hash, b.reconciliation_output_hash)
})

test('permuted input order -> identical normalized output', () => {
  const inputA = { ...base, session_registry: [{ session_id: 's2', identity_id: 'i2' }, { session_id: 's1', identity_id: 'i1' }] }
  const inputB = { ...base, session_registry: [{ session_id: 's1', identity_id: 'i1' }, { session_id: 's2', identity_id: 'i2' }] }
  const a = traverseCrossRegistries(inputA)
  const b = traverseCrossRegistries(inputB)
  assert.equal(a.registry_set_hash, b.registry_set_hash)
})

test('conflict-set replay determinism', () => {
  const bad = { ...base, execution_registry: [{ execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'a'.repeat(64), invocation_nonce: 'n1', session_id: 's1', continuity_id: 'c1', status: 'EXECUTED' }] }
  const a = traverseCrossRegistries(bad)
  const b = traverseCrossRegistries(bad)
  assert.equal(a.conflict_set_hash, b.conflict_set_hash)
})

test('missing lineage edge -> NULL', () => {
  const bad = { ...base, execution_registry: [{ execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'a'.repeat(64), invocation_nonce: 'n1', session_id: 's1', continuity_id: 'c1', status: 'EXECUTED' }] }
  const out = traverseCrossRegistries(bad)
  assert.equal(out.legitimacy_status, 'NULL')
  assert.ok(out.null_reasons.includes('MISSING_LINEAGE_EDGE'))
})

test('non-canonical ordering -> NULL', () => {
  const out = traverseCrossRegistries({ ...base, session_registry: [{ session_id: 's2' }, { session_id: 's1' }] })
  assert.equal(out.legitimacy_status, 'NULL')
  assert.ok(out.null_reasons.includes('NON_CANONICAL_INPUT_ORDER'))
})

test('stale reconciliation evidence -> NULL', () => {
  const stale = { ...base, continuity_registry: [{ continuity_id: 'c1', session_id: 's1', identity_id: 'i1', status: 'REVOKED', continuity_hash: 'x', canonical_continuity: '{}' }] }
  const out = traverseCrossRegistries(stale)
  assert.equal(out.legitimacy_status, 'NULL')
  assert.ok(out.null_reasons.includes('STALE_RECONCILIATION_EVIDENCE'))
})

test('deterministic quarantine mapping', () => {
  const bad = { ...base, execution_registry: [{ execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'a'.repeat(64), invocation_nonce: 'n1', session_id: 's1', continuity_id: 'c1', status: 'EXECUTED' }] }
  const out = traverseCrossRegistries(bad)
  assert.equal(out.quarantine_status, 'RECONCILED_DRIFT')
})
