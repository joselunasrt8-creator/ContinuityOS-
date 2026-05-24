import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANONICAL_CROSS_REGISTRY_ORDER,
  CROSS_REGISTRY_DRIFT_CLASSES,
  canAuthorizeFromReconciliation,
  canonicalize,
  hashCanonical,
  routeEvidenceFlags,
  traverseCrossRegistries,
  deterministicReconciliationReport,
} from '../../runtime/reconciliation/cross-registry-reconciliation-engine.js'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0039_cross_registry_reconciliation_registry.sql', import.meta.url), 'utf8')
const policy = JSON.parse(readFileSync(new URL('../../governance/cross-registry-reconciliation.json', import.meta.url), 'utf8'))
const taxonomy = JSON.parse(readFileSync(new URL('../../governance/cross-registry-drift-taxonomy.json', import.meta.url), 'utf8'))
const equivalence = JSON.parse(readFileSync(new URL('../../governance/cross-registry-equivalence.json', import.meta.url), 'utf8'))
const inventory = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))

async function loadWorker() {
  return (await importWorker()).default
}

function continuityMaterial(input) {
  const revocation = input?.revocation && typeof input.revocation === 'object' && !Array.isArray(input.revocation) ? input.revocation : {}
  return {
    actor_chain: Array.isArray(input?.actor_chain) ? input.actor_chain.map(String) : [],
    authority_chain: Array.isArray(input?.authority_chain) ? input.authority_chain.map(String) : [],
    constraints: input?.constraints ?? {},
    continuity_id: String(input?.continuity_id || ''),
    expires_at: String(input?.expires_at || ''),
    identity_id: String(input?.identity_id || ''),
    issued_at: String(input?.issued_at || ''),
    parent_continuity_id: input?.parent_continuity_id ? String(input.parent_continuity_id) : null,
    revocation: { revoked_at: revocation.revoked_at ?? null, status: String(revocation.status || 'ACTIVE') },
    scope: input?.scope ?? {},
    session_id: String(input?.session_id || ''),
  }
}

function continuityRecord() {
  const material = continuityMaterial({ continuity_id: 'c1', session_id: 's1', identity_id: 'i1', issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' })
  const continuity_hash = hashCanonical(material)
  return { ...material, parent_continuity_id: '', status: 'ACTIVE', continuity_hash, canonical_continuity: canonicalize({ ...material, continuity_hash }) }
}

function coherentState() {
  const canonicalAeo = '{"finality":{"proof_required":true},"intent":"deploy","scope":{"surface":"github"},"target":{"branch":"main"},"validation":{"mode":"strict"}}'
  const objectHash = '7d40bccd2483496c144cf98b915f3b71ecd619f07c834778c7a0ddd8b3aabb1a'
  const continuity = continuityRecord()
  const authorityLineage = canonicalize({ authority_id: 'auth1', decision_id: 'd1', session_id: 's1', continuity_id: 'c1', validated_object_hash: objectHash })
  const executionLineage = canonicalize({ execution_id: 'e1', decision_id: 'd1', validated_object_hash: objectHash, invocation_nonce: 'n1', execution_status: 'EXECUTED', continuity_id: 'c1' })
  return {
    session_registry: [{ session_id: 's1', identity_id: 'i1', continuity_status: 'ACTIVE' }],
    continuity_registry: [continuity],
    authority_registry: [{ authority_id: 'auth1', decision_id: 'd1', session_id: 's1', continuity_id: 'c1', status: 'CONSUMED' }],
    aeo_registry: [{ aeo_id: 'aeo1', authority_id: 'auth1', decision_id: 'd1', validated_object_hash: objectHash, canonical_aeo: canonicalAeo, continuity_id: 'c1' }],
    invocation_registry: [{ decision_id: 'd1', validated_object_hash: objectHash, invocation_nonce: 'n1', continuity_id: 'c1', status: 'EXECUTED' }],
    validation_registry: [{ validation_id: 'v1', session_id: 's1', decision_id: 'd1', validated_object_hash: objectHash, invocation_nonce: 'n1', result: 'VALID', status: 'VALID', continuity_id: 'c1' }],
    execution_registry: [{ execution_id: 'e1', session_id: 's1', decision_id: 'd1', validated_object_hash: objectHash, invocation_nonce: 'n1', status: 'EXECUTED', continuity_id: 'c1' }],
    proof_registry: [{ proof_id: 'p1', session_id: 's1', execution_id: 'e1', decision_id: 'd1', validated_object_hash: objectHash, continuity_id: 'c1', continuity_hash: continuity.continuity_hash, authority_lineage: authorityLineage, execution_lineage: executionLineage }],
    preo_registry: [{ preo_id: 'preo1', decision_id: 'd1', authority_id: 'auth1', continuity_id: 'c1', reviewed_hash: objectHash, status: 'PREO_VALID' }],
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

class RegistryD1 {
  constructor(tables) {
    this.tables = tables
  }

  prepare(sql) {
    const self = this
    const selectAll = sql.match(/SELECT \* FROM ([a-z_]+) LIMIT 1000/i)
    return {
      bind() { return this },
      all() {
        if (selectAll) return Promise.resolve({ results: [...(self.tables[selectAll[1]] || [])] })
        return Promise.resolve({ results: [] })
      },
      first() {
        if (/sqlite_master/i.test(sql)) return Promise.resolve({ name: 'session_registry' })
        return Promise.resolve(null)
      },
      run() { return Promise.resolve({ meta: { changes: 1 } }) },
    }
  }
}

async function registryReconcile(state, path = '/registry/reconcile') {
  const runtime = await loadWorker()
  return (await runtime.fetch(new Request(`https://runtime.test${path}`), { DB: new RegistryD1(state) })).json()
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
  expectNull(traverseCrossRegistries(state), 'LINEAGE_DRIFT')
})

test('orphan validation fails closed', () => {
  const state = coherentState(); state.aeo_registry = []
  expectNull(traverseCrossRegistries(state), 'VALIDATION_DRIFT')
})

test('orphan execution fails closed', () => {
  const state = coherentState(); state.validation_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHAN_EXECUTION')
})

test('missing proof lineage fails closed', () => {
  const state = coherentState(); state.proof_registry = []
  expectNull(traverseCrossRegistries(state), 'PROOF_DRIFT')
})

test('missing authority lineage fails closed', () => {
  const state = coherentState(); state.authority_registry = []
  expectNull(traverseCrossRegistries(state), 'LINEAGE_DRIFT')
})

test('mismatched object hash fails closed', () => {
  const state = coherentState(); state.aeo_registry[0].canonical_aeo = '{"finality":{"proof_required":false},"intent":"deploy","scope":{"surface":"github"},"target":{"branch":"main"},"validation":{"mode":"strict"}}'
  expectNull(traverseCrossRegistries(state), 'LINEAGE_DRIFT')
})

test('canonical object hash mismatch fails closed', () => {
  const state = coherentState(); state.aeo_registry[0].canonical_aeo = '{"intent":"deploy"}'
  expectNull(traverseCrossRegistries(state), 'LINEAGE_DRIFT')
})

test('duplicate proof is quarantined', () => {
  const state = coherentState(); state.proof_registry.push({ ...state.proof_registry[0], proof_id: 'p2' })
  expectNull(traverseCrossRegistries(state), 'PROOF_DRIFT')
})

test('revoked authority reuse fails closed', () => {
  const state = coherentState(); state.authority_registry[0].status = 'REVOKED'
  expectNull(traverseCrossRegistries(state), 'REPLAY_DRIFT')
})



test('orphan proof fails closed', () => {
  const state = coherentState(); state.execution_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHAN_PROOF')
})

test('missing ancestry fails closed on execution continuity lineage', () => {
  const state = coherentState(); state.continuity_registry = []
  expectNull(traverseCrossRegistries(state), 'ORPHAN_EXECUTION')
})

test('reconciliation traversal is read-only and does not mutate registry state', () => {
  const state = coherentState()
  const before = hashCanonical(state)
  traverseCrossRegistries(state)
  const after = hashCanonical(state)
  assert.equal(after, before)
})

test('deterministic reconciliation report object is stable and evidence-only', () => {
  const snapshot = traverseCrossRegistries(coherentState())
  const reportA = deterministicReconciliationReport(snapshot)
  const reportB = deterministicReconciliationReport(snapshot)
  assert.equal(hashCanonical(reportA), hashCanonical(reportB))
  assert.equal(reportA.object_type, 'DeterministicCrossRegistryReconciliationReport')
  assert.deepEqual(reportA.evidence_flags, routeEvidenceFlags())
})

test('proof hash mismatch fails closed', () => {
  const state = coherentState(); state.proof_registry[0].validated_object_hash = 'different'
  expectNull(traverseCrossRegistries(state), 'PROOF_DRIFT')
})

test('replay graph fragmentation fails closed', () => {
  const state = coherentState(); state.validation_registry.push({ ...state.validation_registry[0], validation_id: 'v2', decision_id: 'd2', validated_object_hash: 'h2' })
  expectNull(traverseCrossRegistries(state), 'REPLAY_DRIFT')
})

test('topology binding divergence fails closed', () => {
  const state = coherentState(); state.runtime_topology_registry[0].deployment_capable = 'true'
  expectNull(traverseCrossRegistries(state), 'TOPOLOGY_DRIFT')
})

test('governance containment divergence fails closed', () => {
  const state = coherentState(); state.recursive_governance_containment_registry[0].creates_authority = 'true'
  expectNull(traverseCrossRegistries(state), 'TOPOLOGY_DRIFT')
})

test('root authority evidence cannot become authority', () => {
  const state = coherentState(); state.root_authority_observability_registry[0].creates_authority = 'true'
  expectNull(traverseCrossRegistries(state), 'REGISTRY_DRIFT')
})

test('observability evidence cannot become proof', () => {
  const state = coherentState(); state.unauthorized_mutation_closure_registry[0].proof_generating = 'true'
  expectNull(traverseCrossRegistries(state), 'REGISTRY_DRIFT')
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
  expectNull(traverseCrossRegistries(state), 'RECONCILIATION_DRIFT')
})

test('drift taxonomy is complete and deterministic', () => {
  assert.deepEqual(taxonomy.drift_classes, CROSS_REGISTRY_DRIFT_CLASSES)
  assert.equal(hashCanonical(taxonomy.drift_classes), hashCanonical(CROSS_REGISTRY_DRIFT_CLASSES))
})


test('execution status divergence is classified as EXECUTION_DRIFT', () => {
  const state = coherentState(); state.execution_registry[0].status = 'PENDING'
  expectNull(traverseCrossRegistries(state), 'EXECUTION_DRIFT')
})

test('/registry/reconcile fails closed on execution proof invocation PREO and continuity drift', async () => {
  const execution = coherentState(); execution.execution_registry[0].status = 'PENDING'
  assert.equal((await registryReconcile(execution)).status, 'NULL')

  const proof = coherentState(); proof.proof_registry[0].authority_lineage = canonicalize({ authority_id: 'wrong' })
  assert.equal((await registryReconcile(proof)).status, 'NULL')

  const invocation = coherentState(); invocation.invocation_registry[0].status = 'PENDING'
  assert.equal((await registryReconcile(invocation)).status, 'NULL')

  const preo = coherentState(); preo.preo_registry[0].reviewed_hash = 'wrong'
  assert.equal((await registryReconcile(preo)).status, 'NULL')

  const continuity = coherentState(); continuity.continuity_registry[0].continuity_hash = 'wrong'
  assert.equal((await registryReconcile(continuity)).status, 'NULL')
})

test('/registry/reconcile preserves legitimate state when lineage registries agree', async () => {
  const response = await registryReconcile(coherentState())
  assert.equal(response.status, 'RECONCILED')
  assert.equal(response.reconciliation.legitimacy_status, 'LEGITIMATE')
})

test('quarantine classification is deterministic for orphan proof/execution', () => {
  const state = coherentState(); state.validation_registry = []; state.execution_registry = []
  const a = traverseCrossRegistries(state)
  const b = traverseCrossRegistries(state)
  assert.equal(hashCanonical(a.drift_classes), hashCanonical(b.drift_classes))
  assert.ok(a.drift_classes.includes('ORPHAN_PROOF'))
  assert.ok(a.drift_classes.includes('ORPHAN_EXECUTION'))
})
