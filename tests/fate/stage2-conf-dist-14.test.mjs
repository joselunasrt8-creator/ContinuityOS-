import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  proof_finality_creates_authority,
  restores_replay,
  appendProofDowngradeEvent,
  appendProofUpgradeEvent,
  buildProofDowngradeEventId,
  buildProofUpgradeEventId,
} from '../../src/lib/proof-finality-metadata.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/proof_downgrade_append_only.json', 'utf8'),
)

// ── CONF-DIST-14: Proof downgrade/upgrade is append-only ──────────────────────
//
// Stage 2 invariant: downgrade and upgrade proof events are append-only.
// No overwrite of prior events. Events are immutable once recorded.
// Upgrade cannot create authority. Upgrade cannot restore replay eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1414  Supporting: #1418, #1442, #1340

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-14: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-14: proof-finality-metadata module creates_authority is false', () => {
  assert.equal(proof_finality_creates_authority, false)
})

test('CONF-DIST-14: proof-finality-metadata module restores_replay is false', () => {
  assert.equal(restores_replay, false)
})

test('CONF-DIST-14: fixture expected result is APPEND_ONLY_ENFORCED', () => {
  assert.equal(fixture.expected_result, 'APPEND_ONLY_ENFORCED')
})

// ── Core invariant: downgrade events are append-only ──────────────────────────

test('CONF-DIST-14: appendProofDowngradeEvent returns new array with event appended', () => {
  const initial = []
  const event = fixture.downgrade_event
  const result = appendProofDowngradeEvent(initial, event)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], event)
})

test('CONF-DIST-14: appendProofDowngradeEvent never mutates existing list', () => {
  const initial = Object.freeze([fixture.downgrade_event])
  const secondEvent = {
    event_id: 'pde_test_002',
    proof_id: fixture.proof_id,
    from_classification: 'PARTITION_SUSPENDED',
    to_classification: 'NULL',
    reason_code: 'execution_lineage_detached',
    timestamp_utc: '2026-05-26T02:00:00Z',
  }
  const result = appendProofDowngradeEvent(initial, secondEvent)
  assert.equal(initial.length, 1, 'existing list must not be mutated')
  assert.equal(result.length, 2)
  assert.deepEqual(result[0], fixture.downgrade_event)
  assert.deepEqual(result[1], secondEvent)
})

test('CONF-DIST-14: multiple downgrade appends build ordered history', () => {
  const e1 = { event_id: 'pde_a', proof_id: 'p1', from_classification: 'LOCAL_VALID', to_classification: 'PARTITION_SUSPENDED', reason_code: 'partition', timestamp_utc: '2026-05-26T00:00:00Z' }
  const e2 = { event_id: 'pde_b', proof_id: 'p1', from_classification: 'PARTITION_SUSPENDED', to_classification: 'AMBIGUOUS', reason_code: 'ambiguity_detected', timestamp_utc: '2026-05-26T01:00:00Z' }
  const e3 = { event_id: 'pde_c', proof_id: 'p1', from_classification: 'AMBIGUOUS', to_classification: 'NULL', reason_code: 'unresolvable', timestamp_utc: '2026-05-26T02:00:00Z' }

  let events = []
  events = appendProofDowngradeEvent(events, e1)
  events = appendProofDowngradeEvent(events, e2)
  events = appendProofDowngradeEvent(events, e3)

  assert.equal(events.length, 3)
  assert.equal(events[0].event_id, 'pde_a')
  assert.equal(events[1].event_id, 'pde_b')
  assert.equal(events[2].event_id, 'pde_c')
})

test('CONF-DIST-14: appendProofDowngradeEvent returns frozen array', () => {
  const result = appendProofDowngradeEvent([], fixture.downgrade_event)
  assert.ok(Object.isFrozen(result))
})

// ── Core invariant: upgrade events are append-only ────────────────────────────

test('CONF-DIST-14: appendProofUpgradeEvent returns new array with event appended', () => {
  const initial = []
  const event = fixture.upgrade_event
  const result = appendProofUpgradeEvent(initial, event)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], event)
})

test('CONF-DIST-14: appendProofUpgradeEvent never mutates existing list', () => {
  const initial = Object.freeze([fixture.upgrade_event])
  const secondEvent = {
    event_id: 'pue_test_002',
    proof_id: fixture.proof_id,
    from_classification: 'LOCAL_VALID',
    to_classification: 'CONVERGENCE_VALID',
    reason_code: 'convergence_evidence_confirmed',
    timestamp_utc: '2026-05-26T03:00:00Z',
  }
  const result = appendProofUpgradeEvent(initial, secondEvent)
  assert.equal(initial.length, 1, 'existing list must not be mutated')
  assert.equal(result.length, 2)
  assert.deepEqual(result[0], fixture.upgrade_event)
  assert.deepEqual(result[1], secondEvent)
})

test('CONF-DIST-14: multiple upgrade appends build ordered history', () => {
  const e1 = { event_id: 'pue_a', proof_id: 'p1', from_classification: 'PARTITION_SUSPENDED', to_classification: 'LOCAL_VALID', reason_code: 'partition_healed', timestamp_utc: '2026-05-26T00:00:00Z' }
  const e2 = { event_id: 'pue_b', proof_id: 'p1', from_classification: 'LOCAL_VALID', to_classification: 'CONVERGENCE_VALID', reason_code: 'convergence_evidence_confirmed', timestamp_utc: '2026-05-26T01:00:00Z' }

  let events = []
  events = appendProofUpgradeEvent(events, e1)
  events = appendProofUpgradeEvent(events, e2)

  assert.equal(events.length, 2)
  assert.equal(events[0].event_id, 'pue_a')
  assert.equal(events[1].event_id, 'pue_b')
})

test('CONF-DIST-14: appendProofUpgradeEvent returns frozen array', () => {
  const result = appendProofUpgradeEvent([], fixture.upgrade_event)
  assert.ok(Object.isFrozen(result))
})

// ── Upgrade invariants: no authority, no replay restore ───────────────────────

test('CONF-DIST-14: upgrade cannot create authority (module-level constant)', () => {
  assert.equal(proof_finality_creates_authority, false)
})

test('CONF-DIST-14: upgrade cannot restore replay eligibility (module-level constant)', () => {
  assert.equal(restores_replay, false)
})

test('CONF-DIST-14: downgrade and upgrade event chains are independent (no cross-mutation)', () => {
  const downgrade = appendProofDowngradeEvent([], fixture.downgrade_event)
  const upgrade = appendProofUpgradeEvent([], fixture.upgrade_event)
  assert.equal(downgrade.length, 1)
  assert.equal(upgrade.length, 1)
  assert.notDeepEqual(downgrade[0], upgrade[0])
})

// ── Deterministic ID builders ─────────────────────────────────────────────────

test('CONF-DIST-14: buildProofDowngradeEventId is deterministic', () => {
  const id1 = buildProofDowngradeEventId('p1', 'LOCAL_VALID', 'PARTITION_SUSPENDED', '2026-05-26T00:00:00Z')
  const id2 = buildProofDowngradeEventId('p1', 'LOCAL_VALID', 'PARTITION_SUSPENDED', '2026-05-26T00:00:00Z')
  assert.equal(id1, id2)
  assert.match(id1, /^pde_[a-f0-9]+$/)
})

test('CONF-DIST-14: buildProofUpgradeEventId is deterministic', () => {
  const id1 = buildProofUpgradeEventId('p1', 'PARTITION_SUSPENDED', 'LOCAL_VALID', '2026-05-26T01:00:00Z')
  const id2 = buildProofUpgradeEventId('p1', 'PARTITION_SUSPENDED', 'LOCAL_VALID', '2026-05-26T01:00:00Z')
  assert.equal(id1, id2)
  assert.match(id1, /^pue_[a-f0-9]+$/)
})

test('CONF-DIST-14: buildProofDowngradeEventId differs from buildProofUpgradeEventId for same inputs', () => {
  const dId = buildProofDowngradeEventId('p1', 'LOCAL_VALID', 'NULL', '2026-05-26T00:00:00Z')
  const uId = buildProofUpgradeEventId('p1', 'LOCAL_VALID', 'NULL', '2026-05-26T00:00:00Z')
  assert.notEqual(dId, uId)
})

// ── Migration 0056 structural assertions ──────────────────────────────────────

const migration0056Sql = readFileSync('migrations/0056_proof_finality_metadata_events.sql', 'utf8')

test('CONF-DIST-14: migration 0056 creates proof_downgrade_event table', () => {
  assert.match(migration0056Sql, /CREATE TABLE IF NOT EXISTS proof_downgrade_event/)
})

test('CONF-DIST-14: migration 0056 creates proof_upgrade_event table', () => {
  assert.match(migration0056Sql, /CREATE TABLE IF NOT EXISTS proof_upgrade_event/)
})

test('CONF-DIST-14: migration 0056 proof_downgrade_event is append-only', () => {
  assert.match(migration0056Sql, /pde_no_update/)
  assert.match(migration0056Sql, /pde_no_delete/)
  assert.match(migration0056Sql, /proof_downgrade_event is append-only: UPDATE is forbidden/)
  assert.match(migration0056Sql, /proof_downgrade_event is append-only: DELETE is forbidden/)
})

test('CONF-DIST-14: migration 0056 proof_upgrade_event is append-only', () => {
  assert.match(migration0056Sql, /pue_no_update/)
  assert.match(migration0056Sql, /pue_no_delete/)
  assert.match(migration0056Sql, /proof_upgrade_event is append-only: UPDATE is forbidden/)
  assert.match(migration0056Sql, /proof_upgrade_event is append-only: DELETE is forbidden/)
})

test('CONF-DIST-14: migration 0056 upgrade cannot create authority trigger present', () => {
  assert.match(migration0056Sql, /pue_upgrade_cannot_create_authority/)
  assert.match(migration0056Sql, /proof_upgrade_event cannot create authority/)
})

test('CONF-DIST-14: migration 0056 upgrade cannot restore replay trigger present', () => {
  assert.match(migration0056Sql, /pue_upgrade_cannot_restore_replay/)
  assert.match(migration0056Sql, /proof_upgrade_event cannot restore replay eligibility/)
})

test('CONF-DIST-14: migration 0056 raw_production_apply_path DENIED on all event tables', () => {
  const deniedMatches = [...migration0056Sql.matchAll(/raw_production_apply_path = 'DENIED'/g)]
  assert.ok(deniedMatches.length >= 3, 'expected DENIED on proof_finality_metadata, proof_downgrade_event, and proof_upgrade_event')
})
