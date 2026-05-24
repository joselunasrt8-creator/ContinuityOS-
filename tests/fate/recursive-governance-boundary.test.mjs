import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0023_recursive_governance_enforcement_boundary.sql', import.meta.url), 'utf8')

class BoundaryD1 {
  constructor({ replay = false } = {}) { this.sql = []; this.replay = replay }
  prepare(sql) {
    this.sql.push(sql)
    const db = this
    return {
      args: [],
      bind(...args) { this.args = args; return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/^\s*INSERT\s+INTO\s+recursive_governance_registry/i.test(sql)) assert.match(sql, /^\s*INSERT\s+INTO\s+recursive_governance_registry/i)
        if (/^\s*INSERT\s+INTO\s+runtime_governance_lock_registry/i.test(sql)) assert.match(sql, /^\s*INSERT\s+INTO\s+runtime_governance_lock_registry/i)
        if (/^\s*INSERT\s+INTO\s+recursive_governance_replay_registry/i.test(sql)) {
          assert.match(sql, /^\s*INSERT\s+INTO\s+recursive_governance_replay_registry/i)
          if (db.replay) return Promise.reject(new Error('UNIQUE constraint failed: recursive_governance_replay_registry'))
        }
        assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)\s+(runtime_governance_lock_registry|recursive_governance_replay_registry|recursive_governance_registry)/i)
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function worker() {
  return (await importWorker()).default
}

async function admit(payload, db = new BoundaryD1()) {
  const runtime = await worker()
  const response = await runtime.fetch(new Request('https://runtime.test/governance/recursive/admit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-Key': 'k' },
    body: JSON.stringify(payload)
  }), { DB: db, API_KEY: 'k' })
  assert.equal(response.status, 200)
  return response.json()
}

const valid = {
  mutation_class: 'observability_mutation',
  mutation_scope: 'runtime',
  target_surface: '/preo',
  mutation_hash: 'm-valid',
  sco_hash: 'sco-valid',
  preo_hash: 'preo-valid',
  proposed_object_hash: 'm-valid',
  validated_object_hash: 'm-valid',
  executable: false,
  method: 'GET'
}

test('recursive governance enforcement boundary objects exist', () => {
  for (const helper of ['enforceRecursiveGovernanceBoundary', 'deriveRuntimeSurfaceHash', 'issueRuntimeGovernanceLock', 'consumeRecursiveGovernanceReplay', 'runtimeSelfIntegrityCheckpoint']) {
    assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  }
  assert.match(source, /RECURSIVE_GOVERNANCE_ADMISSION_ROUTE = "\/governance\/recursive\/admit"/)
  assert.match(source, /runtime_governance_lock_registry/)
  assert.match(source, /recursive_governance_replay_registry/)
})

test('activation lock and replay registries are append-only', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_governance_lock_registry/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS recursive_governance_replay_registry/)
  assert.match(migration, /UNIQUE\(mutation_hash, sco_hash, preo_hash\)/)
  assert.match(migration, /trg_runtime_governance_lock_registry_no_update/)
  assert.match(migration, /trg_recursive_governance_replay_registry_no_delete/)
  assert.doesNotMatch(source, /UPDATE runtime_governance_lock_registry/)
  assert.doesNotMatch(source, /DELETE FROM recursive_governance_replay_registry/)
})

test('admission denies mutation without PREO before activation', async () => {
  const body = await admit({ ...valid, preo_hash: '' })
  assert.equal(body.status, 'NULL')
  assert.equal(body.activation_allowed, false)
  assert.equal(body.admission.decision.mutation_authorized, false)
  assert.ok(body.admission.decision.drift_classes.includes('missing_preo'))
  assert.equal(body.admission.lock, null)
})

test('admission issues activation lock for recursively legitimate mutation', async () => {
  const body = await admit(valid)
  assert.equal(body.status, 'GOVERNANCE_VALIDATED')
  assert.equal(body.activation_allowed, true)
  assert.equal(body.lock.lock_state, 'LOCKED')
  assert.equal(body.lock.activation_allowed, true)
})

test('replayed governance mutation approval is blocked fail-closed', async () => {
  const body = await admit(valid, new BoundaryD1({ replay: true }))
  assert.equal(body.status, 'NULL')
  assert.equal(body.activation_allowed, false)
  assert.equal(body.admission.replay_blocked, true)
})

test('validator, schema, hidden route, and partial stabilization mutations are denied', async () => {
  const validator = await admit({ ...valid, mutation_class: 'validator_mutation', mutation_hash: 'v', proposed_object_hash: 'v', validated_object_hash: 'v' })
  assert.ok(validator.admission.decision.drift_classes.includes('validator_weakening'))
  assert.equal(validator.activation_allowed, false)

  const schema = await admit({ ...valid, mutation_class: 'schema_mutation', mutation_hash: 's', proposed_object_hash: 's', validated_object_hash: 's' })
  assert.ok(schema.admission.decision.drift_classes.includes('schema_weakening'))
  assert.equal(schema.activation_allowed, false)

  const hiddenRoute = await admit({ ...valid, mutation_class: 'runtime_route_mutation', target_surface: '/hidden-exec', executable: true, mutation_hash: 'h', proposed_object_hash: 'h', validated_object_hash: 'h' })
  assert.ok(hiddenRoute.admission.decision.drift_classes.includes('bypass_path_introduction'))
  assert.equal(hiddenRoute.activation_allowed, false)

  const partial = await admit({ ...valid, mutation_hash: 'p1', proposed_object_hash: 'p1', validated_object_hash: 'p2', validation_state: 'VALIDATED' })
  assert.ok(partial.admission.decision.drift_classes.includes('runtime_mutation_after_validation'))
  assert.equal(partial.activation_allowed, false)
})
