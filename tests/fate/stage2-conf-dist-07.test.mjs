import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  proof_finality_creates_authority,
  restores_replay,
  classifyProofFinality,
  isProofDetached,
} from '../../src/lib/proof-finality-metadata.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/detached_proof.json', 'utf8'),
)

// ── CONF-DIST-07: Detached proof cannot finalize ───────────────────────────────
//
// Stage 2 invariant: proof existence ≠ distributed finality.
// A proof with no reconstructable continuity lineage must return NULL.
// Missing execution lineage or missing validated object hash also detaches the proof.
// Detached proof existence does not confer finality or authority.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1414  Supporting: #1418, #1442, #1340

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-07: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-07: proof-finality-metadata module creates_authority is false', () => {
  assert.equal(proof_finality_creates_authority, false)
})

test('CONF-DIST-07: proof-finality-metadata module restores_replay is false', () => {
  assert.equal(restores_replay, false)
})

test('CONF-DIST-07: fixture expected classification is NULL', () => {
  assert.equal(fixture.expected_classification, 'NULL')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('LOCAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('CONVERGENCE_VALID'))
})

test('CONF-DIST-07: fixture detached is true with reason missing_continuity_lineage', () => {
  assert.equal(fixture.detached, true)
  assert.equal(fixture.detach_reason, 'missing_continuity_lineage')
})

// ── Core invariant: detached proof returns NULL ───────────────────────────────

test('CONF-DIST-07: classifyProofFinality returns NULL for detached proof', () => {
  const result = classifyProofFinality({
    proof_id: fixture.proof_id,
    topology_snapshot_hash: fixture.topology_snapshot_hash,
    epoch_id: fixture.epoch_id,
    topology_present: fixture.topology_present,
    continuity_lineage_present: fixture.continuity_lineage_present,
    validated_object_hash_present: fixture.validated_object_hash_present,
    execution_lineage_present: fixture.execution_lineage_present,
    stale_proof_reuse: fixture.stale_proof_reuse,
    current_classification: fixture.current_classification,
    downgrade_events: fixture.downgrade_events,
    upgrade_events: fixture.upgrade_events,
  })
  assert.equal(result.classification, 'NULL')
  assert.equal(result.detached, true)
  assert.equal(result.detach_reason, 'missing_continuity_lineage')
})

test('CONF-DIST-07: GLOBAL_VALID unreachable for detached proof', () => {
  const result = classifyProofFinality({
    proof_id: fixture.proof_id,
    topology_snapshot_hash: fixture.topology_snapshot_hash,
    epoch_id: fixture.epoch_id,
    topology_present: true,
    continuity_lineage_present: false,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: false,
    current_classification: 'GLOBAL_VALID',
    downgrade_events: [],
    upgrade_events: [],
  })
  assert.notEqual(result.classification, 'GLOBAL_VALID')
  assert.equal(result.classification, 'NULL')
})

test('CONF-DIST-07: missing continuity lineage → detached → NULL', () => {
  const { detached, detach_reason } = isProofDetached({
    continuity_lineage_present: false,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: false,
  })
  assert.equal(detached, true)
  assert.equal(detach_reason, 'missing_continuity_lineage')
})

test('CONF-DIST-07: missing validated object hash → detached', () => {
  const { detached, detach_reason } = isProofDetached({
    continuity_lineage_present: true,
    validated_object_hash_present: false,
    execution_lineage_present: true,
    stale_proof_reuse: false,
  })
  assert.equal(detached, true)
  assert.equal(detach_reason, 'missing_validated_object_hash')
})

test('CONF-DIST-07: missing execution lineage → detached', () => {
  const { detached, detach_reason } = isProofDetached({
    continuity_lineage_present: true,
    validated_object_hash_present: true,
    execution_lineage_present: false,
    stale_proof_reuse: false,
  })
  assert.equal(detached, true)
  assert.equal(detach_reason, 'missing_execution_lineage')
})

test('CONF-DIST-07: stale proof reuse → detached → STALE_VISIBLE (not NULL)', () => {
  const { detached, detach_reason } = isProofDetached({
    continuity_lineage_present: true,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: true,
  })
  assert.equal(detached, true)
  assert.equal(detach_reason, 'stale_proof_reuse')

  const result = classifyProofFinality({
    proof_id: 'proof_stale_001',
    topology_snapshot_hash: 'aabbcc',
    epoch_id: 'epoch_001',
    topology_present: true,
    continuity_lineage_present: true,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: true,
    current_classification: 'LOCAL_VALID',
    downgrade_events: [],
    upgrade_events: [],
  })
  assert.equal(result.classification, 'STALE_VISIBLE')
  assert.equal(result.detached, true)
  assert.equal(result.detach_reason, 'stale_proof_reuse')
})

test('CONF-DIST-07: continuity lineage checked before execution lineage (priority order)', () => {
  // Both missing: continuity takes priority
  const { detach_reason } = isProofDetached({
    continuity_lineage_present: false,
    validated_object_hash_present: false,
    execution_lineage_present: false,
    stale_proof_reuse: false,
  })
  assert.equal(detach_reason, 'missing_continuity_lineage')
})

test('CONF-DIST-07: result creates_authority is false for detached proof', () => {
  const result = classifyProofFinality({
    proof_id: fixture.proof_id,
    topology_snapshot_hash: fixture.topology_snapshot_hash,
    epoch_id: fixture.epoch_id,
    topology_present: fixture.topology_present,
    continuity_lineage_present: fixture.continuity_lineage_present,
    validated_object_hash_present: fixture.validated_object_hash_present,
    execution_lineage_present: fixture.execution_lineage_present,
    stale_proof_reuse: fixture.stale_proof_reuse,
    current_classification: fixture.current_classification,
    downgrade_events: fixture.downgrade_events,
    upgrade_events: fixture.upgrade_events,
  })
  assert.equal(result.creates_authority, false)
})

test('CONF-DIST-07: result restores_replay is false for detached proof', () => {
  const result = classifyProofFinality({
    proof_id: fixture.proof_id,
    topology_snapshot_hash: fixture.topology_snapshot_hash,
    epoch_id: fixture.epoch_id,
    topology_present: fixture.topology_present,
    continuity_lineage_present: fixture.continuity_lineage_present,
    validated_object_hash_present: fixture.validated_object_hash_present,
    execution_lineage_present: fixture.execution_lineage_present,
    stale_proof_reuse: fixture.stale_proof_reuse,
    current_classification: fixture.current_classification,
    downgrade_events: fixture.downgrade_events,
    upgrade_events: fixture.upgrade_events,
  })
  assert.equal(result.restores_replay, false)
})

// ── Migration 0056 structural assertions ──────────────────────────────────────

const migration0056Sql = readFileSync('migrations/0056_proof_finality_metadata_events.sql', 'utf8')

test('CONF-DIST-07: migration 0056 creates proof_finality_metadata table', () => {
  assert.match(migration0056Sql, /CREATE TABLE IF NOT EXISTS proof_finality_metadata/)
})

test('CONF-DIST-07: migration 0056 detach_reason CHECK includes missing_continuity_lineage', () => {
  assert.match(migration0056Sql, /missing_continuity_lineage/)
  assert.match(migration0056Sql, /missing_validated_object_hash/)
  assert.match(migration0056Sql, /missing_execution_lineage/)
  assert.match(migration0056Sql, /stale_proof_reuse/)
})

test('CONF-DIST-07: migration 0056 detached proof finality must be NULL or STALE_VISIBLE trigger', () => {
  assert.match(migration0056Sql, /pfm_detached_must_be_null_or_stale/)
  assert.match(migration0056Sql, /detached proof finality_classification must be NULL or STALE_VISIBLE/)
})

test('CONF-DIST-07: migration 0056 raw_production_apply_path DENIED', () => {
  assert.match(migration0056Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
})
