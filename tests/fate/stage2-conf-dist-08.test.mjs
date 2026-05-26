import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  reconciliationCreatesAuthority,
  reconciliationRestoresReplay,
  classifyReconciliationState,
  validateReconciliationTransition,
  transitionReconciliationState,
  appendReconciliationDowngradeEvent,
  appendReconciliationUpgradeEvent,
} from '../../src/lib/reconciliation-state-machine.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/reconciliation_no_authority.json', 'utf8'),
)
const migration0058Sql = readFileSync(
  'migrations/0058_reconciliation_state_machine_events.sql',
  'utf8',
)

// ── CONF-DIST-08: Reconciliation cannot create authority ──────────────────────
//
// Stage 2 invariant: reconciliation state machine transitions must not produce
// execution eligibility or authority. reconciliation ≠ authority.
// All states and all transition paths preserve creates_authority=false.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1405  Supporting: #1339, #1418, #1442, #1347, #1414, #1441, #1443

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-08: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-08: reconciliation-state-machine module creates_authority is false', () => {
  assert.equal(reconciliationCreatesAuthority, false)
})

test('CONF-DIST-08: reconciliation-state-machine module restores_replay is false', () => {
  assert.equal(reconciliationRestoresReplay, false)
})

test('CONF-DIST-08: fixture expected_creates_authority is false', () => {
  assert.equal(fixture.expected_creates_authority, false)
})

test('CONF-DIST-08: fixture expected_restores_replay is false', () => {
  assert.equal(fixture.expected_restores_replay, false)
})

// ── Core invariant: creates_authority=false for all classifications ───────────

const ALL_STATES = [
  'OBSERVED', 'PENDING', 'PARTITIONED', 'RECONCILING', 'CONFLICTED',
  'SETTLEMENT_CANDIDATE', 'CONVERGED', 'FINALIZED', 'REVOKED', 'STALE_VISIBLE', 'NULL',
]

test('CONF-DIST-08: module-level reconciliationCreatesAuthority is false (not a function — constant)', () => {
  assert.equal(typeof reconciliationCreatesAuthority, 'boolean')
  assert.equal(reconciliationCreatesAuthority, false)
})

test('CONF-DIST-08: classifyReconciliationState result creates_authority=false for OBSERVED path', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: false,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: false,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-08: classifyReconciliationState result creates_authority=false for CONVERGED path', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: false,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: true,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.reconciliation_state, 'CONVERGED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-08: classifyReconciliationState result creates_authority=false for FINALIZED path', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: false,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: false,
    partition_detected: false,
    settlement_candidate: false,
    finalized: true,
  })
  assert.equal(result.reconciliation_state, 'FINALIZED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-08: classifyReconciliationState result creates_authority=false for REVOKED path', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: true,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: false,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.reconciliation_state, 'REVOKED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-08: FINALIZED classification is FINALIZED_NON_EXECUTABLE — not executable', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: false,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: false,
    partition_detected: false,
    settlement_candidate: false,
    finalized: true,
  })
  assert.equal(result.classification, 'FINALIZED_NON_EXECUTABLE')
  assert.notEqual(result.classification, 'GLOBAL_VALID')
  assert.notEqual(result.classification, 'CONVERGENCE_VALID')
})

test('CONF-DIST-08: REVOKED classification is REVOKED_NON_EXECUTABLE — not executable', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: false,
    has_revocation: true,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: false,
    epoch_mismatched: false,
    convergence_evidence_present: false,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.classification, 'REVOKED_NON_EXECUTABLE')
})

// ── Transition-level authority invariant ──────────────────────────────────────

test('CONF-DIST-08: transitionReconciliationState creates_authority=false for all valid transitions', () => {
  const valid_transitions = [
    ['OBSERVED', 'PENDING'],
    ['PENDING', 'RECONCILING'],
    ['RECONCILING', 'CONVERGED'],
    ['CONVERGED', 'FINALIZED'],
    ['FINALIZED', 'STALE_VISIBLE'],
    ['RECONCILING', 'REVOKED'],
    ['REVOKED', 'NULL'],
  ]
  for (const [from, to] of valid_transitions) {
    const result = transitionReconciliationState({
      reconciliation_id: fixture.reconciliation_id,
      from_state: from,
      to_state: to,
      reason_code: 'TEST',
      timestamp_utc: '2026-05-26T00:00:00Z',
    })
    assert.equal(result.creates_authority, false, `creates_authority must be false for ${from}→${to}`)
    assert.equal(result.restores_replay, false, `restores_replay must be false for ${from}→${to}`)
  }
})

test('CONF-DIST-08: transitionReconciliationState creates_authority=false even on invalid (returns NULL)', () => {
  // NULL is terminal — transition from NULL is forbidden → returns NULL state
  const result = transitionReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    from_state: 'NULL',
    to_state: 'CONVERGED',
    reason_code: 'FORBIDDEN_TEST',
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.state, 'NULL')
  assert.equal(result.valid, false)
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

// ── Downgrade/upgrade event authority invariant ───────────────────────────────

test('CONF-DIST-08: appendReconciliationDowngradeEvent preserves creates_authority=false', () => {
  const event = {
    event_id: 'rde_test_001',
    reconciliation_id: fixture.reconciliation_id,
    from_state: 'CONVERGED',
    to_state: 'STALE_VISIBLE',
    reason_code: 'TEST_DOWNGRADE',
    timestamp_utc: '2026-05-26T00:00:00Z',
    evidence_refs: Object.freeze([]),
    creates_authority: false,
    restores_replay: false,
  }
  const result = appendReconciliationDowngradeEvent([], event)
  assert.equal(result.length, 1)
  assert.equal(result[0].creates_authority, false)
  assert.equal(result[0].restores_replay, false)
})

test('CONF-DIST-08: appendReconciliationUpgradeEvent preserves creates_authority=false', () => {
  const event = {
    event_id: 'rue_test_001',
    reconciliation_id: fixture.reconciliation_id,
    from_state: 'PENDING',
    to_state: 'CONVERGED',
    reason_code: 'TEST_UPGRADE',
    timestamp_utc: '2026-05-26T00:00:00Z',
    evidence_refs: Object.freeze([]),
    creates_authority: false,
    restores_replay: false,
  }
  const result = appendReconciliationUpgradeEvent([], event)
  assert.equal(result.length, 1)
  assert.equal(result[0].creates_authority, false)
  assert.equal(result[0].restores_replay, false)
})

// ── NULL terminal state for invalid transitions ───────────────────────────────

test('CONF-DIST-08: validateReconciliationTransition returns invalid for NULL terminal', () => {
  const { valid } = validateReconciliationTransition('NULL', 'CONVERGED')
  assert.equal(valid, false)
})

test('CONF-DIST-08: validateReconciliationTransition returns invalid for REVOKED → non-NULL', () => {
  const { valid } = validateReconciliationTransition('REVOKED', 'CONVERGED')
  assert.equal(valid, false)
})

// ── fixture-listed states all have creates_authority=false ───────────────────

test('CONF-DIST-08: all states in fixture tested_states produce creates_authority=false from classifyReconciliationState', () => {
  for (const state of fixture.tested_states) {
    // Produce each state via its canonical input path
    const has_revocation = state === 'REVOKED'
    const replay_divergent = state === 'NULL'
    const lineage_stale = !has_revocation && !replay_divergent && state === 'STALE_VISIBLE'
    const partition_detected = !has_revocation && !replay_divergent && !lineage_stale && state === 'PARTITIONED'
    const conflict_set_unresolved = !has_revocation && !replay_divergent && !lineage_stale && !partition_detected && state === 'CONFLICTED'
    const settlement_candidate = !has_revocation && !replay_divergent && !lineage_stale && !partition_detected && !conflict_set_unresolved && state === 'SETTLEMENT_CANDIDATE'
    const convergence_evidence_present = !has_revocation && !replay_divergent && !lineage_stale && !partition_detected && !conflict_set_unresolved && !settlement_candidate && state === 'CONVERGED'
    const finalized = !has_revocation && !replay_divergent && !lineage_stale && !partition_detected && !conflict_set_unresolved && !settlement_candidate && !convergence_evidence_present && state === 'FINALIZED'

    const result = classifyReconciliationState({
      reconciliation_id: `test_${state}`,
      lineage_stale,
      has_revocation,
      replay_divergent,
      conflict_set_unresolved,
      proof_lineage_detached: false,
      topology_visible: !partition_detected,
      epoch_stale: false,
      epoch_mismatched: false,
      convergence_evidence_present,
      partition_detected,
      settlement_candidate,
      finalized,
    })
    assert.equal(result.creates_authority, false, `creates_authority must be false for state ${state}`)
    assert.equal(result.restores_replay, false, `restores_replay must be false for state ${state}`)
  }
})

// ── Migration 0058 structural assertions ──────────────────────────────────────

test('CONF-DIST-08: migration 0058 creates reconciliation_state_record table', () => {
  assert.match(migration0058Sql, /CREATE TABLE IF NOT EXISTS reconciliation_state_record/)
})

test('CONF-DIST-08: migration 0058 rsr_no_authority_creation trigger present', () => {
  assert.match(migration0058Sql, /rsr_no_authority_creation/)
  assert.match(migration0058Sql, /reconciliation cannot create authority/)
})

test('CONF-DIST-08: migration 0058 rsr_no_replay_restoration trigger present', () => {
  assert.match(migration0058Sql, /rsr_no_replay_restoration/)
  assert.match(migration0058Sql, /reconciliation cannot restore replay eligibility/)
})

test('CONF-DIST-08: migration 0058 creates_authority=0 enforced on all tables', () => {
  const matches = migration0058Sql.match(/creates_authority.*DEFAULT 0 CHECK\(creates_authority = 0\)/g)
  assert.ok(matches && matches.length >= 3, 'creates_authority=0 must be enforced on all 3 tables')
})

test('CONF-DIST-08: migration 0058 restores_replay=0 enforced on all tables', () => {
  const matches = migration0058Sql.match(/restores_replay.*DEFAULT 0 CHECK\(restores_replay = 0\)/g)
  assert.ok(matches && matches.length >= 3, 'restores_replay=0 must be enforced on all 3 tables')
})

test('CONF-DIST-08: migration 0058 raw_production_apply_path DENIED on all tables', () => {
  const matches = migration0058Sql.match(/raw_production_apply_path.*DEFAULT 'DENIED'/g)
  assert.ok(matches && matches.length >= 3, 'raw_production_apply_path DENIED must be on all 3 tables')
})

test('CONF-DIST-08: migration 0058 creates reconciliation_downgrade_event table', () => {
  assert.match(migration0058Sql, /CREATE TABLE IF NOT EXISTS reconciliation_downgrade_event/)
})

test('CONF-DIST-08: migration 0058 creates reconciliation_upgrade_event table', () => {
  assert.match(migration0058Sql, /CREATE TABLE IF NOT EXISTS reconciliation_upgrade_event/)
})
