import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'

let _worker
async function getWorker() {
  if (!_worker) _worker = (await importWorker()).default
  return _worker
}

// Topology epoch fields required by /validate to pass enforceTopologyEpochAdmission
// epoch=0 with no prior epoch_registry rows is accepted as the genesis epoch
const EPOCH = { topology_epoch: 0, epoch_lineage_parent: 'genesis-parent', epoch_nonce: 'nonce-1485' }

function makeEnv({ governed_tool_envelope_id = '', envelopeRows = [] } = {}) {
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        const stmt = {
          bind() { return this },
          run() { return Promise.resolve({ meta: { changes: 1 } }) },
          all() {
            // tableColumns (PRAGMA) and epoch_registry both return empty, which is correct:
            // - PRAGMA empty → ensureRequiredSchemaColumns returns early (no columns to check)
            // - epoch_registry empty → epoch 0 accepted as genesis epoch
            if (sql.includes('FROM govern_envelope_registry WHERE envelope_id')) {
              return Promise.resolve({ results: envelopeRows })
            }
            return Promise.resolve({ results: [] })
          },
          first() {
            // topology epoch nonce replay check → no replay
            if (sql.includes('FROM invocation_registry') && sql.includes('invocation_nonce')) {
              return Promise.resolve(null)
            }
            // requiresGovernEnvelopeLineage + verifyGovernedToolEnvelopeLinkage both use this query
            if (sql.includes('governed_tool_envelope_id') && sql.includes('FROM authority_registry')) {
              return Promise.resolve(governed_tool_envelope_id ? { governed_tool_envelope_id } : null)
            }
            return Promise.resolve(null)
          }
        }
        return stmt
      }
    }
  }
}

function post(path, payload) {
  return new Request(`https://runtime.test${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

// Test 1: /validate enforces govern envelope lineage when authority_registry.governed_tool_envelope_id
// is set even when the request body carries no origin or nonce_domain markers.
// Without the fix, isOpenClawOriginPayload() would return false and enforcement would be skipped.
// With the fix, the persisted governed_tool_envelope_id drives enforcement.
test('issue #1485 /validate enforces govern lineage from persisted state when origin/nonce_domain absent', async () => {
  const worker = await getWorker()
  const env = makeEnv({ governed_tool_envelope_id: 'envelope-1', envelopeRows: [] })

  const res = await worker.fetch(post('/validate', {
    decision_id: 'decision-1',
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-1',
    ...EPOCH
    // deliberately omit: origin, nonce_domain, govern_envelope_id
  }), env)

  const body = await res.json()
  // Enforcement ran because persisted governed_tool_envelope_id triggered it.
  // govern_envelope_ambiguous because the DB has no matching govern_envelope_registry record.
  assert.equal(body.reason, 'govern_envelope_ambiguous')
  assert.equal(body.status, 'NULL')
})

// Test 2: /proof enforces govern ancestry when authority_registry.governed_tool_envelope_id
// is set even when the request body carries no origin or nonce_domain markers.
test('issue #1485 /proof enforces govern ancestry from persisted state when origin/nonce_domain absent', async () => {
  const worker = await getWorker()
  const env = makeEnv({ governed_tool_envelope_id: 'envelope-1', envelopeRows: [] })

  const res = await worker.fetch(post('/proof', {
    execution_id: 'exec-1',
    decision_id: 'decision-1',
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-2'
    // deliberately omit: origin, nonce_domain, govern_envelope_id
  }), env)

  const body = await res.json()
  // /proof uses govern_ancestry_ambiguous (not govern_envelope_ambiguous)
  assert.equal(body.reason, 'govern_ancestry_ambiguous')
  assert.equal(body.status, 'NULL')
})

// Test 3: Body-provided govern_envelope_id that conflicts with the persisted governed_tool_envelope_id
// must not override persisted state and must be rejected.
test('issue #1485 body-provided conflicting govern_envelope_id cannot override persisted governed_tool_envelope_id', async () => {
  const worker = await getWorker()
  const env = makeEnv({ governed_tool_envelope_id: 'envelope-persisted', envelopeRows: [] })

  const res = await worker.fetch(post('/validate', {
    decision_id: 'decision-1',
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-3',
    govern_envelope_id: 'envelope-CONFLICT',
    ...EPOCH
    // origin and nonce_domain absent; conflict between body and persisted envelope IDs
  }), env)

  const body = await res.json()
  // resolveGovernEnvelopeLineage detects the conflict and returns ambiguousReason immediately
  assert.equal(body.reason, 'govern_envelope_ambiguous')
  assert.equal(body.status, 'NULL')
})

// Test 4: A decision without a persisted governed_tool_envelope_id and without OpenClaw markers
// must not trigger govern enforcement — existing non-governed behavior is preserved.
test('issue #1485 non-governed decision without persisted governed_tool_envelope_id preserves existing behavior', async () => {
  const worker = await getWorker()
  // authority_registry returns null (no governed_tool_envelope_id)
  const env = makeEnv({ governed_tool_envelope_id: '', envelopeRows: [] })

  const res = await worker.fetch(post('/validate', {
    // omit decision_id so the route fails at the missing_decision_id check
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-4',
    ...EPOCH
    // no origin, no nonce_domain, no govern_envelope_id
  }), env)

  const body = await res.json()
  // The route fails on the ordinary missing_decision_id check, not on a govern reason —
  // proving govern enforcement was not triggered.
  assert.equal(body.reason, 'missing_decision_id')
  assert.equal(body.status, 'NULL')
})

// Test 5: A govern_envelope_registry record exists for the persisted envelope ID but its
// envelope_hash does not match the recomputed hash. Must fail closed.
test('issue #1485 persisted govern envelope with invalid hash fails closed with govern_envelope_hash_mismatch', async () => {
  const worker = await getWorker()
  const env = makeEnv({
    governed_tool_envelope_id: 'envelope-1',
    envelopeRows: [{
      envelope_id: 'envelope-1',
      status: 'VALID_CANDIDATE',
      envelope_hash: 'deliberately-wrong-hash',
      candidate_hash: 'cand-hash',
      nonce: 'env-nonce',
      nonce_domain: 'test-domain',
      govern_projection_hash: ''
    }]
  })

  const res = await worker.fetch(post('/validate', {
    decision_id: 'decision-1',
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-5',
    ...EPOCH
  }), env)

  const body = await res.json()
  // The stored envelope_hash doesn't match the recomputed SHA-256, so fail closed.
  assert.equal(body.reason, 'govern_envelope_hash_mismatch')
  assert.equal(body.status, 'NULL')
})

// Test 6: The govern_envelope_registry has no record for the persisted governed_tool_envelope_id.
// The route must fail closed even when the body provides the matching envelope ID.
test('issue #1485 missing govern envelope registry record fails closed with govern_envelope_ambiguous', async () => {
  const worker = await getWorker()
  // envelopeRows is empty — no record exists in govern_envelope_registry for 'envelope-1'
  const env = makeEnv({ governed_tool_envelope_id: 'envelope-1', envelopeRows: [] })

  const res = await worker.fetch(post('/validate', {
    decision_id: 'decision-1',
    validated_object_hash: 'hash-1',
    invocation_nonce: 'inv-nonce-6',
    govern_envelope_id: 'envelope-1',
    ...EPOCH
  }), env)

  const body = await res.json()
  // No record found in govern_envelope_registry → unique.size=0 → ambiguous → fail closed
  assert.equal(body.reason, 'govern_envelope_ambiguous')
  assert.equal(body.status, 'NULL')
})
