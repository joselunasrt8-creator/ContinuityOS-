import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANONICAL_CROSS_REGISTRY_ORDER,
  CROSS_REGISTRY_DRIFT_CLASSES,
  canAuthorizeFromReconciliation,
  hashCanonical,
  routeEvidenceFlags,
  traverseCrossRegistries,
} from '../../runtime/reconciliation/cross-registry-reconciliation-engine.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0039_cross_registry_reconciliation_registry.sql', import.meta.url), 'utf8')
const policy = JSON.parse(readFileSync(new URL('../../governance/cross-registry-reconciliation.json', import.meta.url), 'utf8'))
const taxonomy = JSON.parse(readFileSync(new URL('../../governance/cross-registry-drift-taxonomy.json', import.meta.url), 'utf8'))
const equivalence = JSON.parse(readFileSync(new URL('../../governance/cross-registry-equivalence.json', import.meta.url), 'utf8'))
const inventory = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))

function coherentState() {
  return {
    session_registry: [{ session_id: 's1', identity_id: 'i1', continuity_status: 'ACTIVE' }],
    continuity_registry: [{ continuity_id: 'c1', session_id: 's1', identity_id: 'i1', status: 'ACTIVE' }],
    authority_registry: [{ authority_id: 'auth1', decision_id: 'd1', session_id: 's1', continuity_id: 'c1', status: 'EXECUTED' }],
    aeo_registry: [{ aeo_id: 'aeo1', authority_id: 'auth1', decision_id: 'd1', validated_object_hash: 'h1', continuity_id: 'c1' }],
    invocation_registry: [{ decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', continuity_id: 'c1' }],
    validation_registry: [{ validation_id: 'v1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'VALID', continuity_id: 'c1' }],
    execution_registry: [{ execution_id: 'e1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'EXECUTED', continuity_id: 'c1' }],
    proof_registry: [{ proof_id: 'p1', session_id: 's1', execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', continuity_id: 'c1' }],
    preo_registry: [{ preo_id: 'preo1', decision_id: 'd1', authority_id: 'auth1', continuity_id: 'c1', status: 'PREO_VALID' }],
    runtime_topology_registry: [{ snapshot_id: 't1', evidence_only: 'true', executable: 'false', deployment_capable: 'false', creates_authority: 'false' }],
    recursive_governance_containment_registry: [{ governance_observation_id: 'g1', evidence_only: 'true', executable: 'false', deployment_capable: 'false', creates_authority: 'false' }],
    root_authority_observability_registry: [{ observation_id: 'r1', non_authoritative: 'true', executable: 'false', deployment_capable: 'false', creates_authority: 'false' }],
    unauthorized_mutation_closure_registry: [{ closure_id: 'u1', evidence_only: 'true', executable: 'false', creates_authority: 'false', proof_generating: 'false' }],
  }
}

function expectNull(snapshot, driftClass) {
  assert.equal(snapshot.containment_status, 'RECONCILIATION_REQUIRED')
  assert.equal(snapshot.legitimacy_status, 'NULL')
  assert.ok(snapshot.drift_classes.includes(driftClass), `${driftClass} missing from ${snapshot.drift_classes}`)
}

test('deterministic registry traversal order covers all canonical registries', () => {
  assert.deepEqual(CANONICAL_CROSS_REGISTRY_ORDER, policy.canonical_registries)
  assert.deepEqual(CANONICAL_CROSS_REGISTRY_ORDER, [
    'session_registry','continuity_registry','authority_registry','aeo_registry','validation_registry','execution_registry','proof_registry','invocation_registry','preo_registry','runtime_topology_registry','recursive_governance_containment_registry','root_authority_observability_registry','unauthorized_mutation_closure_registry',
  ])
})

test('same registry state produces same reconciliation hash regardless of input ordering', () => {
  const first = traverseCrossRegistries(coherentState())
  const shuffled = coherentState()
  shuffled.authority_registry = [...shuffled.authority_registry].reverse()
  shuffled.session_registry.push(shuffled.session_registry.pop())
  const second = traverseCrossRegistries(shuffled)
  assert.equal(second.reconciliation_id, first.reconciliation_id)
  assert.equal(second.registry_set_hash, first.registry_set_hash)
  assert.equal(first.legitimacy_status, 'LEGITIMATE')
})

test('orphan authority fails closed', () => {
  const state = coherentState(); state.session_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHANED_AUTHORITY_RECORD')
})

test('orphan validation fails closed', () => {
  const state = coherentState(); state.aeo_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHANED_VALIDATION_RECORD')
})

test('orphan execution fails closed', () => {
  const state = coherentState(); state.validation_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHANED_EXECUTION_RECORD')
})

test('proof hash mismatch fails closed', () => {
  const state = coherentState(); state.proof_registry[0].validated_object_hash = 'different'
  expectNull(traverseCrossRegistries(state), 'EXECUTION_PROOF_HASH_MISMATCH')
})

test('replay graph fragmentation fails closed', () => {
  const state = coherentState(); state.validation_registry.push({ ...state.validation_registry[0], validation_id: 'v2', decision_id: 'd2', validated_object_hash: 'h2' })
  expectNull(traverseCrossRegistries(state), 'REPLAY_GRAPH_FRAGMENTATION')
})

test('topology binding divergence fails closed', () => {
  const state = coherentState(); state.runtime_topology_registry[0].deployment_capable = 'true'
  expectNull(traverseCrossRegistries(state), 'TOPOLOGY_BINDING_DIVERGENCE')
})

test('governance containment divergence fails closed', () => {
  const state = coherentState(); state.recursive_governance_containment_registry[0].creates_authority = 'true'
  expectNull(traverseCrossRegistries(state), 'GOVERNANCE_BINDING_DIVERGENCE')
})

test('root authority evidence cannot become authority', () => {
  const state = coherentState(); state.root_authority_observability_registry[0].creates_authority = 'true'
  expectNull(traverseCrossRegistries(state), 'ROOT_AUTHORITY_EVIDENCE_ESCALATION')
})

test('observability evidence cannot become proof', () => {
  const state = coherentState(); state.unauthorized_mutation_closure_registry[0].proof_generating = 'true'
  expectNull(traverseCrossRegistries(state), 'OBSERVABILITY_RECORD_AUTHORITY_ESCALATION')
})

test('append-only registry rejects UPDATE and DELETE', () => {
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_update[\s\S]*BEFORE UPDATE ON cross_registry_reconciliation_registry/)
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_delete[\s\S]*BEFORE DELETE ON cross_registry_reconciliation_registry/)
})

test('GET-only reconciliation routes reject mutation methods', () => {
  assert.match(source, /CROSS_REGISTRY_RECONCILIATION_ROUTES[\s\S]*request\.method !== "GET"[\s\S]*405/)
  for (const route of policy.route_policy.routes) {
    assert.ok(source.includes(route), `${route} missing from source`)
    const surface = inventory.surfaces.find((entry) => entry.surface_id === `route:${route}`)
    assert.ok(surface, `${route} missing from unauthorized mutation inventory`)
    assert.equal(surface.mutation_capability, false)
  }
})

test('routes are outside CANONICAL_RUNTIME_ROUTES', () => {
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
  for (const route of policy.route_policy.routes) assert.equal(['/session','/continuity','/authority','/compile','/validate','/execute','/proof'].includes(route), false)
})

test('reconciliation evidence cannot authorize execution proof or merge', () => {
  assert.equal(canAuthorizeFromReconciliation(), false)
  assert.deepEqual(routeEvidenceFlags(), { evidence_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false, proof_generating: false })
  assert.equal(policy.policy_integration.may_authorize_execution, false)
  assert.equal(policy.policy_integration.may_authorize_proof, false)
  assert.equal(policy.policy_integration.may_authorize_merge, false)
  assert.equal(equivalence.legitimacy_on_ambiguity, 'NULL')
})

test('ambiguous registry state resolves NULL', () => {
  const state = coherentState(); state.authority_registry.push({ ...state.authority_registry[0], authority_id: 'auth2' })
  expectNull(traverseCrossRegistries(state), 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY')
})

test('drift taxonomy is complete and deterministic', () => {
  assert.deepEqual(taxonomy.drift_classes, CROSS_REGISTRY_DRIFT_CLASSES)
  assert.equal(hashCanonical(taxonomy.drift_classes), hashCanonical(CROSS_REGISTRY_DRIFT_CLASSES))
})
