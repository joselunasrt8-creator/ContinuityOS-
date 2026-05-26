import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  buildValidatorAttestationId,
  classifyFromValidatorAttestations,
  isAttestationEpochStale,
  isAttestationTopologyVisible,
} from '../../src/lib/quorum-attestation.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/quorum_disagreement.json', 'utf8'),
)
const migration0055Sql = readFileSync(
  'migrations/0055_validator_attestation_envelope.sql',
  'utf8',
)

// Base predicates satisfying V, A, U, P, R, T, C (all local-valid preconditions met).
const BASE_PREDICATES = {
  V: true, A: true, U: true, P: true, R: true, T: true, C: true,
}

// Helper: build a minimal ValidatorAttestationEnvelope for testing.
function makeEnvelope(overrides = {}) {
  return {
    validator_attestation_id: 'vae_test',
    validator_id: 'v1',
    epoch_id: 'epoch-active',
    object_hash: 'hash-A',
    classification: 'LOCAL_VALID',
    topology_snapshot_hash: 'topo-snap-1',
    causal_clock_json: '{}',
    attestation_type: 'EVIDENCE',
    timestamp_utc: '2026-01-01T00:00:00Z',
    signature: 'deadbeef',
    is_epoch_stale: 0,
    is_topology_visible: 1,
    evidence_only: 1,
    creates_authority: 0,
    creates_execution: 0,
    replay_neutral: 1,
    raw_production_apply_path: 'DENIED',
    ...overrides,
  }
}

// Helper: convert fixture validator_attestations to envelope objects.
function fixtureEnvelopes() {
  return fixture.validator_attestations.map((va) =>
    makeEnvelope({
      validator_id: va.validator_id,
      object_hash: va.object_hash,
      attestation_type: va.attestation_type,
      is_epoch_stale: va.is_epoch_stale,
      is_topology_visible: va.is_topology_visible,
    }),
  )
}

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-06: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-06: quorum-attestation module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-06: fixture expected outcome is AMBIGUOUS', () => {
  assert.equal(fixture.expected_classification, 'AMBIGUOUS')
})

test('CONF-DIST-06: fixture forbidden classifications include GLOBAL_VALID', () => {
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
})

// ── Core disagreement scenario ────────────────────────────────────────────────

test('CONF-DIST-06: validator disagreement on object_hash → AMBIGUOUS', () => {
  const envelopes = fixtureEnvelopes()
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    fixture.quorum_threshold_fraction,
    fixture.epoch_status,
  )
  assert.equal(result, 'AMBIGUOUS')
})

test('CONF-DIST-06: GLOBAL_VALID is not reachable under validator disagreement', () => {
  const envelopes = fixtureEnvelopes()
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    fixture.quorum_threshold_fraction,
    fixture.epoch_status,
  )
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-06: CONVERGENCE_VALID is not reachable under validator disagreement', () => {
  const envelopes = fixtureEnvelopes()
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    fixture.quorum_threshold_fraction,
    fixture.epoch_status,
  )
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

// ── Single-validator ceiling ──────────────────────────────────────────────────

test('CONF-DIST-06: single EVIDENCE validator cannot reach GLOBAL_VALID', () => {
  const envelopes = [makeEnvelope({ validator_id: 'v1', object_hash: 'hash-A' })]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-06: single EVIDENCE validator → LOCAL_VALID ceiling (Q=false)', () => {
  const envelopes = [makeEnvelope({ validator_id: 'v1', object_hash: 'hash-A' })]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.equal(result, 'LOCAL_VALID')
})

// ── Positive path (unanimous agreement + quorum met) ─────────────────────────

test('CONF-DIST-06: unanimous EVIDENCE agreement + quorum met → not AMBIGUOUS', () => {
  const envelopes = [
    makeEnvelope({ validator_id: 'v1', object_hash: 'hash-A' }),
    makeEnvelope({ validator_id: 'v2', object_hash: 'hash-A' }),
    makeEnvelope({ validator_id: 'v3', object_hash: 'hash-A' }),
  ]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.5,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.notEqual(result, 'AMBIGUOUS')
})

// ── Stale epoch path ─────────────────────────────────────────────────────────

test('CONF-DIST-06: stale epoch envelope → STALE_VISIBLE not AMBIGUOUS', () => {
  const envelopes = [
    makeEnvelope({
      validator_id: 'v1',
      object_hash: 'hash-A',
      attestation_type: 'OBSERVATION',
      is_epoch_stale: 1,
    }),
    makeEnvelope({
      validator_id: 'v2',
      object_hash: 'hash-B',
      attestation_type: 'OBSERVATION',
      is_epoch_stale: 1,
    }),
  ]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.equal(result, 'STALE_VISIBLE')
  assert.notEqual(result, 'AMBIGUOUS')
})

test('CONF-DIST-06: stale epoch envelope → GLOBAL_VALID forbidden', () => {
  const envelopes = [
    makeEnvelope({
      validator_id: 'v1',
      attestation_type: 'OBSERVATION',
      is_epoch_stale: 1,
    }),
  ]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.notEqual(result, 'GLOBAL_VALID')
})

// ── Topology-invisible path ───────────────────────────────────────────────────

test('CONF-DIST-06: topology-invisible attestations only → PARTITION_SUSPENDED', () => {
  const envelopes = [
    makeEnvelope({
      validator_id: 'v1',
      attestation_type: 'OBSERVATION',
      topology_snapshot_hash: '',
      is_topology_visible: 0,
    }),
    makeEnvelope({
      validator_id: 'v2',
      attestation_type: 'OBSERVATION',
      topology_snapshot_hash: '',
      is_topology_visible: 0,
    }),
  ]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.equal(result, 'PARTITION_SUSPENDED')
})

test('CONF-DIST-06: OBSERVATION envelopes excluded from quorum weight', () => {
  // Topology-visible OBSERVATION envelopes (voluntary observers) cannot form quorum.
  const envelopes = [
    makeEnvelope({ validator_id: 'v1', attestation_type: 'OBSERVATION', object_hash: 'hash-A' }),
    makeEnvelope({ validator_id: 'v2', attestation_type: 'OBSERVATION', object_hash: 'hash-A' }),
    makeEnvelope({ validator_id: 'v3', attestation_type: 'OBSERVATION', object_hash: 'hash-A' }),
  ]
  const result = classifyFromValidatorAttestations(
    envelopes,
    BASE_PREDICATES,
    0.5,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  // No EVIDENCE envelopes → quorum_met=0 → LOCAL_VALID ceiling
  assert.equal(result, 'LOCAL_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

// ── NULL path ────────────────────────────────────────────────────────────────

test('CONF-DIST-06: empty envelope set → NULL', () => {
  const result = classifyFromValidatorAttestations(
    [],
    BASE_PREDICATES,
    0.667,
    'EPOCH_GLOBAL_AUTHORITATIVE',
  )
  assert.equal(result, 'NULL')
})

// ── Function contracts ────────────────────────────────────────────────────────

test('CONF-DIST-06: buildValidatorAttestationId deterministic vae_ prefix', () => {
  const id1 = buildValidatorAttestationId('v1', 'hash-A', '2026-01-01T00:00:00Z')
  const id2 = buildValidatorAttestationId('v1', 'hash-A', '2026-01-01T00:00:00Z')
  assert.match(id1, /^vae_[0-9a-f]{64}$/)
  assert.equal(id1, id2)
})

test('CONF-DIST-06: isAttestationEpochStale returns true when epoch_id differs from active', () => {
  const envelope = makeEnvelope({ epoch_id: 'epoch-old' })
  assert.equal(isAttestationEpochStale(envelope, 'epoch-active'), true)
})

test('CONF-DIST-06: isAttestationEpochStale returns false when epoch_id matches active', () => {
  const envelope = makeEnvelope({ epoch_id: 'epoch-active' })
  assert.equal(isAttestationEpochStale(envelope, 'epoch-active'), false)
})

test('CONF-DIST-06: isAttestationTopologyVisible returns false for empty topology_snapshot_hash', () => {
  const envelope = makeEnvelope({ topology_snapshot_hash: '' })
  assert.equal(isAttestationTopologyVisible(envelope), false)
})

test('CONF-DIST-06: isAttestationTopologyVisible returns true for non-empty topology_snapshot_hash', () => {
  const envelope = makeEnvelope({ topology_snapshot_hash: 'topo-snap-abc' })
  assert.equal(isAttestationTopologyVisible(envelope), true)
})

// ── Migration 0055 schema assertions ─────────────────────────────────────────

test('CONF-DIST-06: migration 0055 defines validator_attestation_envelope_registry', () => {
  assert.match(migration0055Sql, /CREATE TABLE IF NOT EXISTS validator_attestation_envelope_registry/)
})

test('CONF-DIST-06: migration 0055 attestation_type CHECK excludes AUTHORITY', () => {
  assert.match(
    migration0055Sql,
    /CHECK\(attestation_type IN \('EVIDENCE','OBSERVATION'\)\)/,
  )
  assert.doesNotMatch(
    migration0055Sql,
    /attestation_type IN \(.*'AUTHORITY'.*\)/,
  )
})

test('CONF-DIST-06: migration 0055 defines vaer_no_update trigger', () => {
  assert.match(migration0055Sql, /vaer_no_update/)
  assert.match(migration0055Sql, /UPDATE is forbidden/)
})

test('CONF-DIST-06: migration 0055 defines vaer_no_delete trigger', () => {
  assert.match(migration0055Sql, /vaer_no_delete/)
  assert.match(migration0055Sql, /DELETE is forbidden/)
})

test('CONF-DIST-06: migration 0055 defines vaer_stale_cannot_be_evidence trigger', () => {
  assert.match(migration0055Sql, /vaer_stale_cannot_be_evidence/)
  assert.match(migration0055Sql, /stale epoch attestation must use attestation_type=OBSERVATION/)
})

test('CONF-DIST-06: migration 0055 defines vaer_invisible_cannot_be_evidence trigger', () => {
  assert.match(migration0055Sql, /vaer_invisible_cannot_be_evidence/)
  assert.match(migration0055Sql, /topology-invisible attestation must use attestation_type=OBSERVATION/)
})

test('CONF-DIST-06: migration 0055 evidence_only=1 and creates_authority=0 enforced', () => {
  assert.match(migration0055Sql, /evidence_only\s+INTEGER.*DEFAULT 1.*CHECK\(evidence_only = 1\)/)
  assert.match(migration0055Sql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-06: migration 0055 raw_production_apply_path DENIED guard', () => {
  assert.match(migration0055Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0055Sql, /raw_production_apply_path = 'DENIED'/)
})
