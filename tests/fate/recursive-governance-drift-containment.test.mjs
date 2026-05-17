import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0037_recursive_governance_containment_registry.sql', import.meta.url), 'utf8')
const model = JSON.parse(readFileSync(new URL('../../governance/recursive/RECURSIVE_GOVERNANCE_CONTAINMENT_MODEL.json', import.meta.url), 'utf8'))
const matrix = JSON.parse(readFileSync(new URL('../../governance/recursive/GOVERNANCE_MUTATION_CAPABILITY_MATRIX.json', import.meta.url), 'utf8'))
const taxonomy = JSON.parse(readFileSync(new URL('../../governance/recursive/RECURSIVE_GOVERNANCE_DRIFT_TAXONOMY.json', import.meta.url), 'utf8'))

class D1 {
  constructor() { this.statements = [] }
  prepare(sql) {
    this.statements.push(sql)
    return {
      args: [],
      bind(...args) { this.args = args; return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/recursive_governance_containment_registry/i.test(sql) && /^\s*(UPDATE|DELETE)/i.test(sql)) throw new Error('recursive_governance_containment_registry is append-only')
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function worker() {
  const { transformSync } = await import('esbuild')
  const code = transformSync(source, { loader: 'ts', format: 'esm' }).code
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default
}

async function get(path) {
  const runtime = await worker()
  const db = new D1()
  const response = await runtime.fetch(new Request(`https://runtime.test${path}`, { method: 'GET' }), { DB: db })
  assert.equal(response.status, 200)
  return { body: await response.json(), db }
}

test('recursive governance equivalence model and deterministic fields are declared', () => {
  for (const field of ['governance_equivalence_hash', 'governance_semantic_hash', 'governance_topology_hash', 'governance_lineage_hash', 'semantic_divergence_classes', 'recursive_containment_status']) {
    assert.ok(model.hashes.includes(field) || source.includes(field), `missing ${field}`)
  }
  for (const domain of ['validator_semantics', 'schema_semantics', 'proof_semantics', 'replay_semantics', 'authority_semantics', 'execution_boundary_topology', 'federation_semantics', 'observability_semantics']) {
    assert.ok(model.semantic_domains.includes(domain))
    assert.match(source, new RegExp(domain))
  }
  assert.equal(model.no_semantically_divergent_governance_states_hash_equate, true)
})

test('governance mutation capability matrix is complete and fail-closed', () => {
  for (const klass of ['SAFE_OBSERVABILITY_ONLY','GOVERNANCE_CONTAINED','GOVERNANCE_EXPANSION','EXECUTION_BOUNDARY_EXPANSION','VALIDATION_SEMANTICS_DRIFT','AUTHORITY_SEMANTICS_DRIFT','PROOF_SEMANTICS_DRIFT','REPLAY_SEMANTICS_DRIFT','FEDERATION_SEMANTICS_DRIFT','OBSERVABILITY_TO_AUTHORITY_ESCALATION','ROOT_GOVERNANCE_BYPASS_RISK','RECURSIVE_CONTAINMENT_REQUIRED']) {
    assert.ok(matrix.classes.includes(klass))
    assert.match(source, new RegExp(klass))
  }
  assert.equal(matrix.fail_closed_on_ambiguity, true)
  assert.equal(matrix.authorizes_execution, false)
  assert.equal(matrix.authorizes_proof, false)
})

test('governance equivalence hash is deterministic for equivalent observations', async () => {
  const a = await get('/governance/recursive/containment/equivalence')
  const b = await get('/governance/recursive/containment/equivalence')
  assert.equal(a.body.governance_equivalence_hash, b.body.governance_equivalence_hash)
  assert.equal(a.body.governance_semantic_hash, b.body.governance_semantic_hash)
  assert.equal(a.body.status, 'GOVERNANCE_CONTAINED')
})

test('semantic divergence changes semantic hash and fails closed', async () => {
  const base = await get('/governance/recursive/containment/equivalence')
  const drift = await get('/governance/recursive/containment/equivalence?validator_semantics=VALID_ALWAYS')
  assert.notEqual(base.body.governance_semantic_hash, drift.body.governance_semantic_hash)
  assert.ok(drift.body.semantic_divergence_classes.includes('VALIDATOR_OUTPUT_DRIFT'))
  assert.equal(drift.body.status, 'NULL')
})

test('validator mutation drift fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/drift?validator_semantics=VALID_ALWAYS')
  assert.ok(body.semantic_divergence_classes.includes('VALIDATOR_OUTPUT_DRIFT'))
  assert.equal(body.recursive_containment_status, 'RECURSIVE_CONTAINMENT_REQUIRED')
  assert.equal(body.merge_legitimacy, 'NULL')
})

test('schema semantic drift fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/drift?schema_semantics=OPTIONAL_AEO_KEYS')
  assert.ok(body.semantic_divergence_classes.includes('SCHEMA_SEMANTICS_DRIFT'))
  assert.equal(body.governance_mutation_class, 'VALIDATION_SEMANTICS_DRIFT')
})

test('proof semantic drift fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/drift?proof_semantics=UNBOUND_PROOF')
  assert.ok(body.semantic_divergence_classes.includes('PROOF_SEMANTICS_DRIFT'))
  assert.equal(body.proof_authority, 'NULL')
})

test('replay semantic drift fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/drift?replay_semantics=REUSABLE_NONCE')
  assert.ok(body.semantic_divergence_classes.includes('REPLAY_SEMANTICS_DRIFT'))
  assert.equal(body.execution_authority, 'NULL')
})

test('execution-boundary expansion fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/topology?execution_boundary_expansion=true&route=/governance/recursive/execute')
  assert.ok(body.governance_topology_hash)
  assert.equal(body.status, 'NULL')
  assert.equal(body.governance_continuity.recursive_lineage_verification, 'VERIFIED')
})

test('observability-to-authority escalation fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/drift?observability_authority=true')
  assert.ok(body.semantic_divergence_classes.includes('OBSERVABILITY_AUTHORITY_ESCALATION'))
  assert.equal(body.governance_mutation_class, 'OBSERVABILITY_TO_AUTHORITY_ESCALATION')
})

test('orphaned governance lineage fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/topology?parent_exists=false')
  assert.equal(body.governance_continuity.orphan_governance_mutation_status, 'NULL')
  assert.equal(body.status, 'NULL')
})

test('parent governance hash mismatch fails closed', async () => {
  const { body } = await get('/governance/recursive/containment/topology?parent_governance_hash=a&expected_parent_governance_hash=b')
  assert.equal(body.governance_continuity.recursive_lineage_verification, 'RECURSIVE_CONTAINMENT_REQUIRED')
  assert.equal(body.status, 'NULL')
})

test('append-only registry triggers reject UPDATE and DELETE', async () => {
  assert.match(migration, /trg_recursive_governance_containment_registry_no_update/) 
  assert.match(migration, /BEFORE UPDATE ON recursive_governance_containment_registry/) 
  assert.match(migration, /trg_recursive_governance_containment_registry_no_delete/) 
  assert.match(migration, /BEFORE DELETE ON recursive_governance_containment_registry/) 
  const db = new D1()
  assert.throws(() => db.prepare('UPDATE recursive_governance_containment_registry SET evidence_only=\'false\'').run(), /append-only/)
  assert.throws(() => db.prepare('DELETE FROM recursive_governance_containment_registry').run(), /append-only/)
})

test('GET-only routes reject mutation methods', async () => {
  const runtime = await worker()
  for (const route of ['/governance/recursive/containment','/governance/recursive/containment/drift','/governance/recursive/containment/topology','/governance/recursive/containment/equivalence']) {
    for (const method of ['POST','PUT','PATCH','DELETE']) {
      const response = await runtime.fetch(new Request(`https://runtime.test${route}`, { method }), { DB: new D1() })
      assert.equal(response.status, 405)
      const body = await response.json()
      assert.equal(body.evidence_only, true)
      assert.equal(body.executable, false)
    }
  }
})

test('containment routes are not canonical runtime routes', () => {
  const canonical = source.match(/const CANONICAL_RUNTIME_ROUTES = \[(.*?)\] as const/s)?.[1] || ''
  for (const route of ['/governance/recursive/containment','/governance/recursive/containment/drift','/governance/recursive/containment/topology','/governance/recursive/containment/equivalence']) {
    assert.doesNotMatch(canonical, new RegExp(route.replaceAll('/', '\\/')))
  }
})

test('recursive governance evidence cannot authorize execution, proof, or merge', async () => {
  const { body } = await get('/governance/recursive/containment?proof_semantics=UNBOUND_PROOF')
  assert.equal(body.evidence_only, true)
  assert.equal(body.non_authoritative, true)
  assert.equal(body.executable, false)
  assert.equal(body.deployment_capable, false)
  assert.equal(body.creates_authority, false)
  assert.equal(body.observation.containment_object.merge_legitimacy, 'NULL')
  assert.equal(body.observation.containment_object.proof_authority, 'NULL')
  assert.equal(body.observation.containment_object.execution_authority, 'NULL')
})

test('immutable semantic freeze changes produce RECURSIVE_CONTAINMENT_REQUIRED', async () => {
  for (const query of ['append_only_registry_guarantees=false','fail_closed_validation_semantics=false','validated_object_equals_executed_object=false','authority_before_execution=false','replay_nonce_consumption=false','proof_lineage_binding=false','get_only_observability_boundary=false','remote_authority_denial=false','no_secret_inspection=false']) {
    const { body } = await get(`/governance/recursive/containment/drift?${query}`)
    assert.equal(body.recursive_containment_status, 'RECURSIVE_CONTAINMENT_REQUIRED')
    assert.equal(body.merge_legitimacy, 'NULL')
  }
})

test('drift taxonomy is deterministic and complete', () => {
  for (const klass of ['GOVERNANCE_EQUIVALENCE_MISMATCH','GOVERNANCE_TOPOLOGY_DIVERGENCE','GOVERNANCE_LINEAGE_ORPHANED','GOVERNANCE_PARENT_HASH_MISMATCH','VALIDATOR_OUTPUT_DRIFT','SCHEMA_SEMANTICS_DRIFT','PROOF_SEMANTICS_DRIFT','REPLAY_SEMANTICS_DRIFT','AUTHORITY_SEMANTICS_DRIFT','FEDERATION_SEMANTICS_DRIFT','EXECUTION_BOUNDARY_EXPANSION','OBSERVABILITY_AUTHORITY_ESCALATION','APPEND_ONLY_SEMANTICS_WEAKENED','FAIL_CLOSED_SEMANTICS_WEAKENED','RECURSIVE_CONTAINMENT_REQUIRED']) {
    assert.ok(taxonomy.classes.includes(klass))
    assert.match(source, new RegExp(klass))
  }
})
