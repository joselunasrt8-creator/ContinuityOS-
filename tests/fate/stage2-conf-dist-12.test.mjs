import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  reconciliationCreatesAuthority,
  reconciliationRestoresReplay,
  propagateRevocationLivenessDowngrade,
  classifyReconciliationState,
  appendReconciliationDowngradeEvent,
} from '../../src/lib/reconciliation-state-machine.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/revocation_liveness_downgrade.json', 'utf8'),
)
const migration0058Sql = readFileSync(
  'migrations/0058_reconciliation_state_machine_events.sql',
  'utf8',
)
const migration0051Sql = readFileSync(
  'migrations/0051_revocation_liveness_registry.sql',
  'utf8',
)

// ── CONF-DIST-12: Revocation liveness downgrade propagates ────────────────────
//
// Stage 2 invariant: revocation liveness event must propagate a downgrade to
// STALE_VISIBLE or REVOKED across all topology nodes.
// Revoked legitimacy cannot remain executable. Stale revocation visibility
// cannot preserve execution eligibility.
// Propagation evidence is append-only.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1443  Supporting: #1405, #1339, #1442

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-12: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-12: reconciliation-state-machine module creates_authority is false', () => {
  assert.equal(reconciliationCreatesAuthority, false)
})

test('CONF-DIST-12: reconciliation-state-machine module restores_replay is false', () => {
  assert.equal(reconciliationRestoresReplay, false)
})

test('CONF-DIST-12: fixture expected_reconciliation_state is REVOKED (within_sla=true)', () => {
  assert.equal(fixture.expected_reconciliation_state, 'REVOKED')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('CONVERGED'))
  assert.ok(fixture.forbidden_classifications.includes('FINALIZED'))
})

test('CONF-DIST-12: fixture expected_executable is false', () => {
  assert.equal(fixture.expected_executable, false)
})

test('CONF-DIST-12: fixture creates_authority is false', () => {
  assert.equal(fixture.creates_authority, false)
})

// ── Core invariant: revocation liveness downgrade to REVOKED (within SLA) ────

test('CONF-DIST-12: propagateRevocationLivenessDowngrade to REVOKED when within_sla=true', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.current_state,
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  })
  assert.equal(result.reconciliation_state, 'REVOKED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
  assert.equal(result.executable, false)
})

test('CONF-DIST-12: propagateRevocationLivenessDowngrade downgrade_event reason_code is REVOCATION_LIVENESS_DOWNGRADE', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.current_state,
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  })
  assert.ok(result.downgrade_event !== null)
  assert.equal(result.downgrade_event?.reason_code, 'REVOCATION_LIVENESS_DOWNGRADE')
  assert.equal(result.downgrade_event?.to_state, 'REVOKED')
  assert.equal(result.downgrade_event?.creates_authority, false)
  assert.equal(result.downgrade_event?.restores_replay, false)
})

// ── Stale revocation: outside SLA → STALE_VISIBLE ────────────────────────────

test('CONF-DIST-12: propagateRevocationLivenessDowngrade to STALE_VISIBLE when within_sla=false', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: fixture.stale_revocation_scenario.current_state,
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: false,
  })
  assert.equal(result.reconciliation_state, 'STALE_VISIBLE')
  assert.equal(result.executable, false)
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-12: stale revocation scenario expected_reconciliation_state is STALE_VISIBLE', () => {
  assert.equal(fixture.stale_revocation_scenario.expected_reconciliation_state, 'STALE_VISIBLE')
  assert.equal(fixture.stale_revocation_scenario.expected_executable, false)
})

// ── Non-executable: revoked/stale legitimacy ──────────────────────────────────

test('CONF-DIST-12: REVOKED state is non-executable', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'CONVERGED',
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  })
  assert.equal(result.executable, false)
  assert.equal(result.reconciliation_state, 'REVOKED')
})

test('CONF-DIST-12: STALE_VISIBLE from revocation is non-executable', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'CONVERGED',
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: false,
  })
  assert.equal(result.executable, false)
  assert.equal(result.reconciliation_state, 'STALE_VISIBLE')
})

// ── classifyReconciliationState: has_revocation collapses to REVOKED ─────────

test('CONF-DIST-12: classifyReconciliationState returns REVOKED when has_revocation=true', () => {
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
    convergence_evidence_present: true,
    partition_detected: false,
    settlement_candidate: false,
    finalized: false,
  })
  assert.equal(result.reconciliation_state, 'REVOKED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-12: REVOKED classification is REVOKED_NON_EXECUTABLE', () => {
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
  assert.notEqual(result.classification, 'GLOBAL_VALID')
  assert.notEqual(result.classification, 'CONVERGED')
})

// ── Propagation is append-only ────────────────────────────────────────────────

test('CONF-DIST-12: revocation downgrade event is append-only (frozen array)', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'CONVERGED',
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  })
  const initial_events = Object.freeze([])
  const events_after = appendReconciliationDowngradeEvent(initial_events, result.downgrade_event)
  assert.equal(events_after.length, 1)
  assert.ok(Object.isFrozen(events_after))
  // Original list is unchanged
  assert.equal(initial_events.length, 0)
})

test('CONF-DIST-12: multiple revocation downgrade events accumulate append-only', () => {
  const event1 = propagateRevocationLivenessDowngrade({
    reconciliation_id: 'rec_001',
    current_state: 'CONVERGED',
    revocation_evidence_ref: 'ref_001',
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  }).downgrade_event

  const event2 = propagateRevocationLivenessDowngrade({
    reconciliation_id: 'rec_002',
    current_state: 'FINALIZED',
    revocation_evidence_ref: 'ref_002',
    timestamp_utc: '2026-05-26T00:01:00Z',
    within_sla: true,
  }).downgrade_event

  let events = Object.freeze([])
  events = appendReconciliationDowngradeEvent(events, event1)
  events = appendReconciliationDowngradeEvent(events, event2)
  assert.equal(events.length, 2)
  assert.ok(Object.isFrozen(events))
  assert.equal(events[0].creates_authority, false)
  assert.equal(events[1].creates_authority, false)
})

// ── NULL terminal: already-NULL revocation yields no new event ────────────────

test('CONF-DIST-12: propagateRevocationLivenessDowngrade from NULL state yields no downgrade_event', () => {
  const result = propagateRevocationLivenessDowngrade({
    reconciliation_id: fixture.reconciliation_id,
    current_state: 'NULL',
    revocation_evidence_ref: fixture.revocation_evidence_ref,
    timestamp_utc: '2026-05-26T00:00:00Z',
    within_sla: true,
  })
  assert.equal(result.reconciliation_state, 'NULL')
  assert.equal(result.downgrade_event, null)
  assert.equal(result.executable, false)
  assert.equal(result.creates_authority, false)
})

// ── Migration 0058 structural assertions ──────────────────────────────────────

test('CONF-DIST-12: migration 0058 creates reconciliation_downgrade_event table', () => {
  assert.match(migration0058Sql, /CREATE TABLE IF NOT EXISTS reconciliation_downgrade_event/)
})

test('CONF-DIST-12: migration 0058 reconciliation_downgrade_event is append-only', () => {
  assert.match(migration0058Sql, /rde_no_update/)
  assert.match(migration0058Sql, /rde_no_delete/)
  assert.match(migration0058Sql, /reconciliation_downgrade_event is append-only: UPDATE is forbidden/)
  assert.match(migration0058Sql, /reconciliation_downgrade_event is append-only: DELETE is forbidden/)
})

test('CONF-DIST-12: migration 0058 rde downgrade target states include REVOKED and STALE_VISIBLE', () => {
  assert.match(migration0058Sql, /'STALE_VISIBLE','PARTITIONED','CONFLICTED','REVOKED','NULL'/)
})

test('CONF-DIST-12: migration 0058 rde_no_authority_creation trigger present', () => {
  assert.match(migration0058Sql, /rde_no_authority_creation/)
  assert.match(migration0058Sql, /reconciliation downgrade event cannot create authority/)
})

test('CONF-DIST-12: migration 0058 rde_no_replay_restoration trigger present', () => {
  assert.match(migration0058Sql, /rde_no_replay_restoration/)
  assert.match(migration0058Sql, /reconciliation downgrade event cannot restore replay eligibility/)
})

// ── Migration 0051 structural assertions ──────────────────────────────────────

test('CONF-DIST-12: migration 0051 creates revocation_liveness_registry table', () => {
  assert.match(migration0051Sql, /CREATE TABLE IF NOT EXISTS revocation_liveness_registry/)
})

test('CONF-DIST-12: migration 0051 within_sla column drives L predicate', () => {
  assert.match(migration0051Sql, /within_sla/)
})

test('CONF-DIST-12: migration 0051 revocation_liveness_registry is append-only', () => {
  assert.match(migration0051Sql, /rlr_no_update/)
  assert.match(migration0051Sql, /rlr_no_delete/)
})

test('CONF-DIST-12: migration 0051 creates_authority=0 enforced on revocation_liveness_registry', () => {
  assert.match(migration0051Sql, /creates_authority.*0/)
})
