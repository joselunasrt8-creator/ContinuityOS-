import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0022_recursive_governance_registry.sql', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/RECURSIVE_GOVERNANCE_SPEC.json', import.meta.url), 'utf8'))

function routeSource() {
  const start = source.indexOf('url.pathname === RECURSIVE_GOVERNANCE_ROUTE')
  const end = source.indexOf('url.pathname === "/reconcile"', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return source.slice(start, end)
}

class RecursiveD1 {
  constructor() { this.sql = [] }
  prepare(sql) {
    this.sql.push(sql)
    return {
      bind(...args) { this.args = args; return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/recursive_governance_registry/i.test(sql)) {
          assert.match(sql, /^\s*INSERT\s+INTO\s+recursive_governance_registry/i)
          assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
        }
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function worker() {
  return (await importWorker()).default
}

async function verify(query = '') {
  const runtime = await worker()
  const response = await runtime.fetch(new Request(`https://runtime.test/governance/recursive/verify${query}`, { method: 'GET' }), { DB: new RecursiveD1() })
  assert.equal(response.status, 200)
  return response.json()
}

test('recursive governance objects exist', () => {
  for (const objectName of ['RuntimeMutationEnvelope', 'GovernanceMutationEnvelope', 'RecursiveGovernanceDecision', 'RecursiveGovernanceProof', 'RecursiveMutationDriftClass', 'RecursiveGovernanceCheckpoint']) {
    assert.match(source, new RegExp(`type ${objectName}`))
  }
  for (const helper of ['deriveRecursiveGovernanceHash', 'classifyRecursiveMutation', 'buildRecursiveGovernanceEnvelope', 'verifyRecursiveGovernanceIntegrity', 'detectRecursiveGovernanceDrift', 'recursiveMutationRequiresSCO']) {
    assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  }
})

test('recursive governance spec declares fail-closed non-bypassability', () => {
  assert.equal(spec.route.path, '/governance/recursive/verify')
  assert.equal(spec.route.method, 'GET')
  assert.equal(spec.required_sco_enforcement.all_mutation_classes_require_sco, true)
  assert.equal(spec.exact_object_guarantees.required, true)
  assert.equal(spec.canonical_execution_path_guarantees.recursive_governance_cannot_bypass_path, true)
  assert.equal(spec.non_bypassability_guarantees.governance_evidence_non_authoritative, true)
  assert.equal(spec.fail_closed_semantics.invalid_or_missing_object_result, 'NULL')
})

test('registry append-only enforcement works', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS recursive_governance_registry/)
  for (const column of ['governance_id', 'mutation_class', 'mutation_scope', 'target_surface', 'mutation_hash', 'sco_hash', 'preo_hash', 'governance_decision', 'drift_classes', 'exact_object_verified', 'replay_neutral', 'mutation_authorized', 'proof_required', 'canonical_path_preserved', 'generated_at', 'created_at']) {
    assert.match(migration, new RegExp(`${column} TEXT`))
  }
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /CHECK \(proof_required='true'\)/)
  assert.match(migration, /trg_recursive_governance_registry_no_update/)
  assert.match(migration, /trg_recursive_governance_registry_no_delete/)
  assert.match(source, /INSERT INTO recursive_governance_registry/)
  assert.doesNotMatch(source, /UPDATE recursive_governance_registry/)
  assert.doesNotMatch(source, /DELETE FROM recursive_governance_registry/)
})

test('runtime mutation without SCO returns NULL', async () => {
  const body = await verify('?mutation_class=runtime_route_mutation&target_surface=/new-exec&executable=true&object_hash=h1')
  assert.equal(body.status, 'NULL')
  assert.equal(body.decision.mutation_authorized, false)
  assert.ok(body.drift_classes.includes('missing_sco'))
})

test('canonical route mutation detected', async () => {
  const body = await verify('?mutation_class=runtime_route_mutation&target_surface=/execute&sco_hash=sco&object_hash=h1')
  assert.ok(body.drift_classes.includes('canonical_route_mutation'))
  assert.equal(body.canonical_path_preserved, false)
})

test('validator mutation drift detected', async () => {
  const body = await verify('?mutation_class=validator_mutation&target_surface=/validate&sco_hash=sco&object_hash=h1')
  assert.ok(body.drift_classes.includes('validator_weakening'))
})

test('exact-object mutation detected', async () => {
  const body = await verify('?mutation_class=policy_mutation&target_surface=/preo&sco_hash=sco&proposed_object_hash=a&validated_object_hash=b')
  assert.ok(body.drift_classes.includes('exact_object_violation'))
  assert.equal(body.exact_object_verified, false)
})

test('replay weakening detected', async () => {
  const body = await verify('?mutation_class=replay_semantics_mutation&target_surface=/validate&sco_hash=sco&object_hash=h1')
  assert.ok(body.drift_classes.includes('replay_weakening'))
})

test('governance surface expansion detected', async () => {
  const body = await verify('?mutation_class=governance_surface_expansion&target_surface=/new-governance-exec&sco_hash=sco&executable=true&object_hash=h1')
  assert.ok(body.drift_classes.includes('governance_surface_expansion') || body.drift_classes.includes('executable_surface_expansion'))
  assert.ok(body.drift_classes.includes('bypass_path_introduction'))
})

test('observability route becoming executable detected', async () => {
  const body = await verify('?mutation_class=observability_mutation&target_surface=/reconcile&method=POST&sco_hash=sco&object_hash=h1')
  assert.ok(body.drift_classes.includes('mutation_capable_observability_route'))
})

test('recursive governance envelope deterministic', async () => {
  const one = await verify('?mutation_class=policy_mutation&target_surface=/preo&sco_hash=sco&object_hash=h1')
  const two = await verify('?target_surface=/preo&object_hash=h1&sco_hash=sco&mutation_class=policy_mutation')
  assert.deepEqual(one.envelope, two.envelope)
  assert.equal(one.proof.proof_hash, two.proof.proof_hash)
})

test('no new executable surface introduced', () => {
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+governance\/recursive\/verify/)
  assert.match(routeSource(), /observability_only/)
  assert.match(routeSource(), /execution_started: false/)
  assert.match(routeSource(), /authority_created: false/)
  assert.match(routeSource(), /mutation_capable: false/)
})

test('runtime mutation after validation rejected', async () => {
  const body = await verify('?mutation_class=policy_mutation&target_surface=/preo&sco_hash=sco&validation_state=VALIDATED&mutation_hash=after&validated_object_hash=before&proposed_object_hash=before')
  assert.equal(body.status, 'GOVERNANCE_REJECTED')
  assert.ok(body.drift_classes.includes('runtime_mutation_after_validation'))
  assert.equal(body.mutation_authorized, false)
})
