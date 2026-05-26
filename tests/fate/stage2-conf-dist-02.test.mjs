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
  readFileSync('tests/fixtures/stage2/partition_proof_downgrade.json', 'utf8'),
)

// ── CONF-DIST-02: Partition-local proof downgraded on partition detection ──────
//
// Stage 2 invariant: proof visibility ≠ authority.
// A proof that was LOCAL_VALID within a partition must be downgraded to
// PARTITION_SUSPENDED when partition is detected (topology_present=false).
// Classification evidence is not authority; downgrade does not create authority.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1418  Supporting: #1414, #1442, #1340

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-02: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-02: proof-finality-metadata module creates_authority is false', () => {
  assert.equal(proof_finality_creates_authority, false)
})

test('CONF-DIST-02: proof-finality-metadata module restores_replay is false', () => {
  assert.equal(restores_replay, false)
})

test('CONF-DIST-02: fixture expected classification is PARTITION_SUSPENDED', () => {
  assert.equal(fixture.expected_classification, 'PARTITION_SUSPENDED')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('LOCAL_VALID'))
})

// ── Core invariant: partition-local proof downgraded ──────────────────────────

test('CONF-DIST-02: classifyProofFinality returns PARTITION_SUSPENDED when topology absent', () => {
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
  assert.equal(result.classification, 'PARTITION_SUSPENDED')
  assert.equal(result.classification, fixture.expected_classification)
})

test('CONF-DIST-02: PARTITION_SUSPENDED regardless of current_classification when topology absent', () => {
  for (const current of ['LOCAL_VALID', 'CONVERGENCE_VALID', 'AMBIGUOUS']) {
    const result = classifyProofFinality({
      proof_id: fixture.proof_id,
      topology_snapshot_hash: fixture.topology_snapshot_hash,
      epoch_id: fixture.epoch_id,
      topology_present: false,
      continuity_lineage_present: true,
      validated_object_hash_present: true,
      execution_lineage_present: true,
      stale_proof_reuse: false,
      current_classification: current,
      downgrade_events: [],
      upgrade_events: [],
    })
    assert.equal(result.classification, 'PARTITION_SUSPENDED', `expected PARTITION_SUSPENDED for current=${current}`)
  }
})

test('CONF-DIST-02: GLOBAL_VALID is not reachable when topology absent', () => {
  const result = classifyProofFinality({
    proof_id: fixture.proof_id,
    topology_snapshot_hash: fixture.topology_snapshot_hash,
    epoch_id: fixture.epoch_id,
    topology_present: false,
    continuity_lineage_present: true,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: false,
    current_classification: 'GLOBAL_VALID',
    downgrade_events: [],
    upgrade_events: [],
  })
  assert.notEqual(result.classification, 'GLOBAL_VALID')
  assert.equal(result.classification, 'PARTITION_SUSPENDED')
})

test('CONF-DIST-02: result creates_authority is false', () => {
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

test('CONF-DIST-02: result restores_replay is false', () => {
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

test('CONF-DIST-02: result is not detached for a lineage-complete partition-suspended proof', () => {
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
  assert.equal(result.detached, false)
})

test('CONF-DIST-02: isProofDetached returns false when all lineage present and no stale reuse', () => {
  const { detached } = isProofDetached({
    continuity_lineage_present: true,
    validated_object_hash_present: true,
    execution_lineage_present: true,
    stale_proof_reuse: false,
  })
  assert.equal(detached, false)
})

// ── Migration 0056 structural assertions ──────────────────────────────────────

const migration0056Sql = readFileSync('migrations/0056_proof_finality_metadata_events.sql', 'utf8')

test('CONF-DIST-02: migration 0056 creates proof_finality_metadata table', () => {
  assert.match(migration0056Sql, /CREATE TABLE IF NOT EXISTS proof_finality_metadata/)
})

test('CONF-DIST-02: migration 0056 proof_finality_metadata is append-only', () => {
  assert.match(migration0056Sql, /pfm_no_update/)
  assert.match(migration0056Sql, /pfm_no_delete/)
  assert.match(migration0056Sql, /proof_finality_metadata is append-only: UPDATE is forbidden/)
  assert.match(migration0056Sql, /proof_finality_metadata is append-only: DELETE is forbidden/)
})

test('CONF-DIST-02: migration 0056 creates_authority=0 enforced on proof_finality_metadata', () => {
  assert.match(migration0056Sql, /creates_authority.*DEFAULT 0 CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-02: migration 0056 raw_production_apply_path DENIED on proof_finality_metadata', () => {
  assert.match(migration0056Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0056Sql, /raw_production_apply_path = 'DENIED'/)
})
