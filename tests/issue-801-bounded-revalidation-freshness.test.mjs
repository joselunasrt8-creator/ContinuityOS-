import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'
import { canonicalize, sha256Hex } from '../src/canonical.js'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

async function loadWorker() {
  return (await importWorker()).default
}

function post(path, body) {
  return new Request(`https://runtime.test${path}`, { method: 'POST', headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

// Topology-epoch admission preconditions the runtime now enforces ahead of the
// staleness/authority checks these tests exercise. With an empty epoch_registry,
// admission requires topology_epoch=0, a lineage parent, a nonce, VISIBLE topology,
// and no nonce replay. Supplying these lets the request reach the intended assertion.
const EPOCH_FIELDS = {
  topology_epoch: 0,
  epoch_lineage_parent: 'epoch-root',
  epoch_nonce: 'epoch-nonce-801',
  topology_visibility_state: 'VISIBLE'
}

// Partition-finality admission now runs on /execute and /proof ahead of the
// staleness/authority checks. A settled, deterministically-reconciled, topology-visible
// partition with a freshly-observed settlement and a closure hash that matches
// sha256(canonicalize({partition_epoch, canonical_lineage_hash})) is admitted, letting
// the request reach the original assertion. The closure hash is computed with the same
// canonical helpers the runtime uses so it is genuinely valid rather than bypassed.
const PARTITION_EPOCH = 0
const PARTITION_LINEAGE_HASH = 'lineage-hash-801'
const PARTITION_CLOSURE_HASH = sha256Hex(canonicalize({ partition_epoch: PARTITION_EPOCH, canonical_lineage_hash: PARTITION_LINEAGE_HASH }))
function partitionFields() {
  return {
    partition_finality_state: 'PARTITION_SETTLED',
    partition_epoch: PARTITION_EPOCH,
    partition_closure_hash: PARTITION_CLOSURE_HASH,
    canonical_lineage_hash: PARTITION_LINEAGE_HASH,
    partition_lineage_hash: PARTITION_LINEAGE_HASH,
    topology_visible: true,
    reconciliation_deterministic: true,
    reconciliation_ordering_deterministic: true,
    partition_settlement_observed_at: new Date().toISOString()
  }
}

// The governed_tool_envelope linkage now fires before the staleness check on
// /execute (and on /proof once the authority carries an envelope id). The authority
// row must reference a governed_tool_envelope_id and that registry row must exist
// with non_operative='false' for the route to proceed to the original assertion.
const GOVERNED_ENVELOPE_ID = 'gte-801'
const GOVERNED_ENVELOPE_ROW = {
  envelope_id: GOVERNED_ENVELOPE_ID,
  candidate_hash: 'candidate-hash-801',
  nonce_binding: 'nonce-binding-801',
  policy_digest: 'policy-digest-801',
  topology_digest: 'topology-digest-801',
  lineage_pointers: '[]',
  timestamp: '2026-01-01T00:00:00.000Z',
  non_operative: 'false',
  tool_surface_descriptor: '{}',
  created_at: '2026-01-01T00:00:00.000Z'
}

// Because the persisted authority row carries a governed_tool_envelope_id, /proof's
// requiresGovernEnvelopeLineage() classifies the decision as governed and enforces the
// OpenClaw govern-envelope ancestry (govern_envelope_registry) ahead of the staleness
// check. resolveGovernEnvelopeLineage() looks the ancestry up by the persisted envelope id
// (the authority's governed_tool_envelope_id), so the govern_envelope_registry record must
// share that envelope_id and carry an envelope_hash matching the runtime's recomputed
// sha256(canonicalize({candidate_hash,nonce,nonce_domain,route,status})). With exactly one
// such VALID_CANDIDATE record the ancestry check passes and the request reaches the original
// stale_validation assertion.
const GOVERN_ENVELOPE_CANDIDATE_HASH = 'govern-candidate-hash-801'
const GOVERN_ENVELOPE_NONCE = 'govern-env-nonce-801'
const GOVERN_ENVELOPE_NONCE_DOMAIN = 'govern-domain-801'
const GOVERN_ENVELOPE_HASH = sha256Hex(canonicalize({
  candidate_hash: GOVERN_ENVELOPE_CANDIDATE_HASH,
  nonce: GOVERN_ENVELOPE_NONCE,
  nonce_domain: GOVERN_ENVELOPE_NONCE_DOMAIN,
  route: '/govern',
  status: 'VALID_CANDIDATE'
}))
const GOVERN_ENVELOPE_ROW = {
  envelope_id: GOVERNED_ENVELOPE_ID,
  envelope_hash: GOVERN_ENVELOPE_HASH,
  candidate_hash: GOVERN_ENVELOPE_CANDIDATE_HASH,
  nonce: GOVERN_ENVELOPE_NONCE,
  nonce_domain: GOVERN_ENVELOPE_NONCE_DOMAIN,
  status: 'VALID_CANDIDATE',
  govern_projection_hash: '',
  created_at: '2026-01-01T00:00:00.000Z'
}

function envWithRows(rows) {
  // The authority row always carries the governed_tool_envelope_id so the new
  // verifyGovernedToolEnvelopeLinkage precondition is satisfied and the route proceeds
  // to the staleness/authority assertion. Tests that exercise an expired authority
  // override the row via rows.authority.
  const baseAuthority = { authority_id: 'a1', decision_id: 'd1', status: 'RESERVED', session_id: 's1', continuity_id: 'c1', expiry: '2999-01-01T00:00:00.000Z' }
  const authorityRow = { governed_tool_envelope_id: GOVERNED_ENVELOPE_ID, ...baseAuthority, ...(rows.authority || {}) }
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind(...args) { this.args = args; return this },
          run() { return Promise.resolve({ meta: { changes: 1 } }) },
          all() {
            if (sql.includes('SELECT session_id, identity_id, expires_at, continuity_status FROM session_registry')) return Promise.resolve({ results: [{ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' }] })
            // govern-envelope ancestry lookup (by persisted governed_tool_envelope_id): exactly one VALID_CANDIDATE record
            if (sql.includes('FROM govern_envelope_registry WHERE envelope_id=?1')) return Promise.resolve({ results: [GOVERN_ENVELOPE_ROW] })
            // epoch_registry head lookup: empty so topology_epoch=0 is admitted as EPOCH_CURRENT
            return Promise.resolve({ results: [] })
          },
          first() {
            // topology-epoch nonce-replay probe must report no prior nonce
            if (sql.includes('FROM invocation_registry WHERE invocation_nonce=?1')) return Promise.resolve(null)
            if (sql.includes('FROM governed_tool_envelope_registry WHERE envelope_id=?1')) return Promise.resolve(GOVERNED_ENVELOPE_ROW)
            if (sql.includes('FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3')) return Promise.resolve(rows.validation || null)
            if (sql.includes('FROM invocation_registry')) return Promise.resolve({ status: 'RESERVED' })
            if (sql.includes('FROM authority_registry WHERE decision_id=?1')) return Promise.resolve(authorityRow)
            if (sql.includes('FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2')) return Promise.resolve(rows.compiled || null)
            if (sql.includes('FROM proof_registry WHERE decision_id=?1 AND validated_object_hash=?2')) return Promise.resolve(null)
            if (sql.includes('FROM continuity_registry')) return Promise.resolve(rows.continuity || null)
            if (sql.includes('FROM session_registry WHERE session_id=?1')) return Promise.resolve({ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' })
            return Promise.resolve(null)
          }
        }
      },
      batch() { return Promise.resolve([{ results: [rows.execution || null] }, { results: [{ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' }] }, { results: [authorityRow] }, { results: [rows.validation || null] }]) }
    }
  }
}

test('execute rejects stale validation', async () => {
  const worker = await loadWorker()
  const stale = new Date(Date.now() - 7 * 60_000).toISOString()
  const response = await worker.fetch(post('/execute', { decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1', ...EPOCH_FIELDS, ...partitionFields() }), envWithRows({
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: stale, session_id: 's1', continuity_id: 'c1' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'stale_validation')
})

test('execute rejects authority expired after validation', async () => {
  const worker = await loadWorker()
  const now = new Date().toISOString()
  const response = await worker.fetch(post('/execute', { decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1', ...EPOCH_FIELDS, ...partitionFields() }), envWithRows({
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: now, session_id: 's1', continuity_id: 'c1' },
    authority: { authority_id: 'a1', status: 'RESERVED', session_id: 's1', continuity_id: 'c1', expiry: '2000-01-01T00:00:00.000Z' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'authority_expired')
})

test('proof rejects stale validation and preserves proof persistence boundary', async () => {
  const worker = await loadWorker()
  const stale = new Date(Date.now() - 7 * 60_000).toISOString()
  const response = await worker.fetch(post('/proof', { execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1', ...EPOCH_FIELDS, ...partitionFields() }), envWithRows({
    execution: { execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'EXECUTED', session_id: 's1', continuity_id: 'c1', created_at: new Date().toISOString() },
    authority: { authority_id: 'a1', decision_id: 'd1', status: 'EXECUTED', session_id: 's1', continuity_id: 'c1' },
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: stale, session_id: 's1', continuity_id: 'c1' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'stale_validation')
})
