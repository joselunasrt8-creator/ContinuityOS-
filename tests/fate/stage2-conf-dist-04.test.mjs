import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  reconciliationCreatesAuthority,
  reconciliationRestoresReplay,
  classifyReconciliationState,
  collapseStaleLineage,
  validateReconciliationTransition,
  transitionReconciliationState,
} from '../../src/lib/reconciliation-state-machine.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/stale_lineage_collapse.json', 'utf8'),
)
const migration0058Sql = readFileSync(
  'migrations/0058_reconciliation_state_machine_events.sql',
  'utf8',
)

// ── CONF-DIST-04: Stale lineage collapses to STALE_VISIBLE ────────────────────
//
// Stage 2 invariant: lineage whose epoch has advanced without renewal must
// collapse to STALE_VISIBLE and not remain active.
// Classification evidence is not authority; stale lineage collapse does not
// create authority or restore replay eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1415  Supporting: #1405, #1339, #1442

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-04: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-04: reconciliation-state-machine module creates_authority is false', () => {
  assert.equal(reconciliationCreatesAuthority, false)
})

test('CONF-DIST-04: reconciliation-state-machine module restores_replay is false', () => {
  assert.equal(reconciliationRestoresReplay, false)
})

test('CONF-DIST-04: fixture expected reconciliation state is STALE_VISIBLE', () => {
  assert.equal(fixture.expected_reconciliation_state, 'STALE_VISIBLE')
  assert.equal(fixture.expected_classification, 'STALE_VISIBLE')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('CONVERGED'))
  assert.ok(fixture.forbidden_classifications.includes('FINALIZED'))
})

test('CONF-DIST-04: fixture creates_authority is false', () => {
  assert.equal(fixture.creates_authority, false)
})

test('CONF-DIST-04: fixture restores_replay is false', () => {
  assert.equal(fixture.restores_replay, false)
})

// ── Core invariant: stale lineage collapses to STALE_VISIBLE ─────────────────

test('CONF-DIST-04: classifyReconciliationState returns STALE_VISIBLE when lineage_stale', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: true,
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
  assert.equal(result.reconciliation_state, 'STALE_VISIBLE')
  assert.equal(result.classification, 'STALE_VISIBLE')
})

test('CONF-DIST-04: classifyReconciliationState STALE_VISIBLE creates_authority=false', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: true,
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
})

test('CONF-DIST-04: classifyReconciliationState STALE_VISIBLE restores_replay=false', () => {
  const result = classifyReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    lineage_stale: true,
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
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-04: collapseStaleLineage returns STALE_VISIBLE when epoch advanced without renewal', () => {
  const result = collapseStaleLineage({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.current_state,
    lineage_epoch_advanced: fixture.lineage_epoch_advanced,
    lineage_renewal_present: fixture.lineage_renewal_present,
    timestamp_utc: '2026-05-26T00:00:00Z',
    evidence_refs: [],
  })
  assert.equal(result.reconciliation_state, 'STALE_VISIBLE')
  assert.ok(result.downgrade_event !== null)
  assert.equal(result.downgrade_event?.reason_code, 'STALE_LINEAGE_COLLAPSE')
  assert.equal(result.downgrade_event?.to_state, 'STALE_VISIBLE')
})

test('CONF-DIST-04: collapseStaleLineage downgrade event creates_authority=false', () => {
  const result = collapseStaleLineage({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.current_state,
    lineage_epoch_advanced: true,
    lineage_renewal_present: false,
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.creates_authority, false)
  assert.equal(result.downgrade_event?.creates_authority, false)
})

test('CONF-DIST-04: collapseStaleLineage downgrade event restores_replay=false', () => {
  const result = collapseStaleLineage({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.current_state,
    lineage_epoch_advanced: true,
    lineage_renewal_present: false,
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.restores_replay, false)
  assert.equal(result.downgrade_event?.restores_replay, false)
})

test('CONF-DIST-04: collapseStaleLineage returns current state when not stale', () => {
  const result = collapseStaleLineage({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'RECONCILING',
    lineage_epoch_advanced: false,
    lineage_renewal_present: false,
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.reconciliation_state, 'RECONCILING')
  assert.equal(result.downgrade_event, null)
})

test('CONF-DIST-04: collapseStaleLineage returns current state when renewal present', () => {
  const result = collapseStaleLineage({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'RECONCILING',
    lineage_epoch_advanced: true,
    lineage_renewal_present: true,
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.reconciliation_state, 'RECONCILING')
  assert.equal(result.downgrade_event, null)
})

test('CONF-DIST-04: STALE_VISIBLE is a valid transition target from RECONCILING', () => {
  const { valid } = validateReconciliationTransition('RECONCILING', 'STALE_VISIBLE')
  assert.equal(valid, true)
})

test('CONF-DIST-04: STALE_VISIBLE is a valid transition target from CONVERGED', () => {
  const { valid } = validateReconciliationTransition('CONVERGED', 'STALE_VISIBLE')
  assert.equal(valid, true)
})

test('CONF-DIST-04: STALE_VISIBLE is a valid transition target from FINALIZED', () => {
  const { valid } = validateReconciliationTransition('FINALIZED', 'STALE_VISIBLE')
  assert.equal(valid, true)
})

test('CONF-DIST-04: transitionReconciliationState to STALE_VISIBLE is valid and creates_authority=false', () => {
  const result = transitionReconciliationState({
    reconciliation_id: fixture.reconciliation_id,
    from_state: 'RECONCILING',
    to_state: 'STALE_VISIBLE',
    reason_code: 'STALE_LINEAGE_COLLAPSE',
    timestamp_utc: '2026-05-26T00:00:00Z',
  })
  assert.equal(result.state, 'STALE_VISIBLE')
  assert.equal(result.valid, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

// ── STALE_VISIBLE forbidden promotion ─────────────────────────────────────────

test('CONF-DIST-04: GLOBAL_VALID is not reachable via reconciliation state machine', () => {
  // There is no state that transitions to a global-valid execution path.
  // classifyReconciliationState never returns GLOBAL_VALID.
  const result = classifyReconciliationState({
    reconciliation_id: 'test_no_global_valid',
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
  assert.notEqual(result.reconciliation_state, 'GLOBAL_VALID')
  assert.notEqual(result.classification, 'GLOBAL_VALID')
})

test('CONF-DIST-04: epoch_stale also collapses to STALE_VISIBLE', () => {
  const result = classifyReconciliationState({
    reconciliation_id: 'test_epoch_stale',
    lineage_stale: false,
    has_revocation: false,
    replay_divergent: false,
    conflict_set_unresolved: false,
    proof_lineage_detached: false,
    topology_visible: true,
    epoch_stale: true,
    epoch_mismatched: false,
    convergence_evidence_present: true,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.reconciliation_state, 'STALE_VISIBLE')
  assert.equal(result.creates_authority, false)
})

// ── Migration 0058 structural assertions ──────────────────────────────────────

test('CONF-DIST-04: migration 0058 creates reconciliation_state_record table', () => {
  assert.match(migration0058Sql, /CREATE TABLE IF NOT EXISTS reconciliation_state_record/)
})

test('CONF-DIST-04: migration 0058 STALE_VISIBLE is a valid reconciliation_state value', () => {
  assert.match(migration0058Sql, /'STALE_VISIBLE'/)
})

test('CONF-DIST-04: migration 0058 reconciliation_state_record is append-only', () => {
  assert.match(migration0058Sql, /rsr_no_update/)
  assert.match(migration0058Sql, /rsr_no_delete/)
  assert.match(migration0058Sql, /reconciliation_state_record is append-only: UPDATE is forbidden/)
  assert.match(migration0058Sql, /reconciliation_state_record is append-only: DELETE is forbidden/)
})

test('CONF-DIST-04: migration 0058 creates_authority=0 enforced on reconciliation_state_record', () => {
  assert.match(migration0058Sql, /creates_authority.*DEFAULT 0 CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-04: migration 0058 raw_production_apply_path DENIED on reconciliation_state_record', () => {
  assert.match(migration0058Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0058Sql, /raw_production_apply_path = 'DENIED'/)
})
