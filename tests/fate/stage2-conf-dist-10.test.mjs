import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  conflictSetCreatesAuthority,
  settlementRestoresReplay,
  detectConflictSet,
  settleConflictSet,
  preserveLosingBranchEvidence,
  isSettlementDeterministic,
  classifyConflictSet,
} from '../../src/lib/conflict-set.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/settlement_losing_branch.json', 'utf8'),
)
const migration0057Sql = readFileSync(
  'migrations/0057_conflict_set_envelope_settlement.sql',
  'utf8',
)

// ── CONF-DIST-10: Settlement preserves losing branch evidence ─────────────────
//
// Stage 2 invariant: conflict-set settlement must preserve all competing root
// evidence. Losing branches must remain in the registry as STALE_VISIBLE.
// Settlement evidence ≠ authority. Settlement cannot restore replay eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1348  Supporting: #1441, #1418, #1442

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-10: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-10: conflict-set module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-10: conflictSetCreatesAuthority is false', () => {
  assert.equal(conflictSetCreatesAuthority, false)
})

test('CONF-DIST-10: settlementRestoresReplay is false', () => {
  assert.equal(settlementRestoresReplay, false)
})

test('CONF-DIST-10: fixture expected result is STALE_VISIBLE (losing branches preserved)', () => {
  assert.equal(fixture.expected_result, 'STALE_VISIBLE')
  assert.equal(fixture.expected_settlement_state, 'SETTLED')
  assert.equal(fixture.losing_roots_preserved, true)
  assert.equal(fixture.losing_branches_classification, 'STALE_VISIBLE')
})

test('CONF-DIST-10: fixture creates_authority is false', () => {
  assert.equal(fixture.creates_authority, false)
})

test('CONF-DIST-10: fixture restores_replay is false', () => {
  assert.equal(fixture.restores_replay, false)
})

// ── Core invariant: settlement preserves losing branches ──────────────────────

test('CONF-DIST-10: settleConflictSet produces SETTLED with losing roots preserved', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(conflicted.settlement_state, 'CONFLICTED')

  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })

  assert.equal(settled.settlement_state, 'SETTLED')
  assert.equal(settled.winning_root, fixture.winning_root)
  assert.ok(settled.losing_roots.length > 0, 'losing_roots must be non-empty after settlement')
  assert.ok(
    settled.losing_roots.includes(fixture.losing_roots[0]),
    'losing root must be preserved in losing_roots',
  )
})

test('CONF-DIST-10: settled envelope creates_authority is false', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.equal(settled.creates_authority, false)
})

test('CONF-DIST-10: settled envelope restores_replay is false', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.equal(settled.restores_replay, false)
})

test('CONF-DIST-10: losing root is STALE_VISIBLE — preserved, not deleted', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  // Losing branches remain in the registry — classified as STALE_VISIBLE
  const losing = preserveLosingBranchEvidence(settled)
  assert.ok(losing.length > 0, 'evidence of losing branches must be preserved')
  assert.ok(losing.includes(fixture.losing_roots[0]))
  // The fixture explicitly declares the losing classification
  assert.equal(fixture.losing_branches_classification, 'STALE_VISIBLE')
})

test('CONF-DIST-10: all competing roots preserved in settled envelope', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.equal(settled.competing_roots.length, fixture.competing_roots.length)
})

test('CONF-DIST-10: winning root is not in losing_roots', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.ok(!settled.losing_roots.includes(settled.winning_root ?? ''))
})

// ── preserveLosingBranchEvidence ─────────────────────────────────────────────

test('CONF-DIST-10: preserveLosingBranchEvidence returns readonly array', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  const preserved = preserveLosingBranchEvidence(settled)
  assert.ok(Array.isArray(preserved))
  assert.ok(Object.isFrozen(preserved))
})

test('CONF-DIST-10: preserveLosingBranchEvidence on CONFLICTED envelope returns empty array', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const preserved = preserveLosingBranchEvidence(conflicted)
  assert.equal(preserved.length, 0)
})

// ── isSettlementDeterministic ─────────────────────────────────────────────────

test('CONF-DIST-10: isSettlementDeterministic returns true for fixture evidence', () => {
  const { deterministic } = isSettlementDeterministic(
    fixture.competing_roots,
    fixture.settlement_opts,
  )
  assert.equal(deterministic, true)
})

test('CONF-DIST-10: isSettlementDeterministic returns false when epoch absent', () => {
  const { deterministic, reason } = isSettlementDeterministic(fixture.competing_roots, {
    ...fixture.settlement_opts,
    epoch_id_present: false,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'MISSING_EPOCH')
})

test('CONF-DIST-10: isSettlementDeterministic returns false when epoch stale', () => {
  const { deterministic, reason } = isSettlementDeterministic(fixture.competing_roots, {
    ...fixture.settlement_opts,
    epoch_stale: true,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'STALE_EPOCH')
})

test('CONF-DIST-10: isSettlementDeterministic returns false on topology ambiguity', () => {
  const { deterministic, reason } = isSettlementDeterministic(fixture.competing_roots, {
    ...fixture.settlement_opts,
    topology_ambiguous: true,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'TOPOLOGY_AMBIGUITY')
})

test('CONF-DIST-10: isSettlementDeterministic returns false when detached proof present', () => {
  const { deterministic, reason } = isSettlementDeterministic(fixture.competing_roots, {
    ...fixture.settlement_opts,
    has_detached_proof: true,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'DETACHED_PROOF')
})

test('CONF-DIST-10: isSettlementDeterministic returns false on replay resurrection conflict', () => {
  const { deterministic, reason } = isSettlementDeterministic(fixture.competing_roots, {
    ...fixture.settlement_opts,
    has_replay_resurrection_conflict: true,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'REPLAY_RESURRECTION_CONFLICT')
})

test('CONF-DIST-10: isSettlementDeterministic returns false for identical causal clocks', () => {
  const tied_roots = fixture.competing_roots.map((r) => ({
    ...r,
    causal_clock: { index: 1, partition_id: 'shard_same' },
  }))
  const { deterministic, reason } = isSettlementDeterministic(tied_roots, {
    ...fixture.settlement_opts,
  })
  assert.equal(deterministic, false)
  assert.equal(reason, 'IDENTICAL_CAUSAL_CLOCKS')
})

// ── Non-settleable paths ──────────────────────────────────────────────────────

test('CONF-DIST-10: settleConflictSet returns UNSETTLEABLE when epoch absent', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const result = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
    epoch_id_present: false,
  })
  assert.equal(result.settlement_state, 'UNSETTLEABLE')
  assert.equal(result.winning_root, undefined)
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-10: settleConflictSet returns UNSETTLEABLE when winning_root not in competing roots', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const result = settleConflictSet(conflicted, {
    winning_root_hash: 'root_not_in_competing_set',
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.equal(result.settlement_state, 'UNSETTLEABLE')
  assert.equal(result.creates_authority, false)
})

test('CONF-DIST-10: settlement does not erase evidence — losing branches remain after SETTLED', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  // All competing roots must still be accessible — not erased
  assert.equal(settled.competing_roots.length, fixture.competing_roots.length)
  // Losing roots explicitly preserved
  assert.ok(settled.losing_roots.length > 0)
})

test('CONF-DIST-10: settlement cannot restore replay — restores_replay always false', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  for (const state_opts of [
    fixture.settlement_opts,
    { ...fixture.settlement_opts, epoch_id_present: false },
    { ...fixture.settlement_opts, topology_ambiguous: true },
  ]) {
    const result = settleConflictSet(conflicted, {
      winning_root_hash: fixture.winning_root,
      settlement_evidence: fixture.settlement_evidence,
      ...state_opts,
    })
    assert.equal(result.restores_replay, false, `restores_replay must be false for state ${result.settlement_state}`)
  }
})

// ── classifyConflictSet after settlement ──────────────────────────────────────

test('CONF-DIST-10: classifyConflictSet returns SETTLED after settlement', () => {
  const conflicted = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  const settled = settleConflictSet(conflicted, {
    winning_root_hash: fixture.winning_root,
    settlement_evidence: fixture.settlement_evidence,
    ...fixture.settlement_opts,
  })
  assert.equal(classifyConflictSet(settled), 'SETTLED')
})

// ── Migration 0057 structural assertions ──────────────────────────────────────

test('CONF-DIST-10: migration 0057 losing_roots_json column present', () => {
  assert.match(migration0057Sql, /losing_roots_json/)
  assert.match(migration0057Sql, /never empty after SETTLED/)
})

test('CONF-DIST-10: migration 0057 cse_no_authority_creation trigger present', () => {
  assert.match(migration0057Sql, /cse_no_authority_creation/)
  assert.match(migration0057Sql, /settlement cannot create authority/)
})

test('CONF-DIST-10: migration 0057 cse_no_replay_restoration trigger present', () => {
  assert.match(migration0057Sql, /cse_no_replay_restoration/)
  assert.match(migration0057Sql, /settlement cannot restore replay eligibility/)
})

test('CONF-DIST-10: migration 0057 creates_authority=0 enforced', () => {
  assert.match(migration0057Sql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-10: migration 0057 restores_replay=0 enforced', () => {
  assert.match(migration0057Sql, /restores_replay\s+INTEGER.*DEFAULT 0.*CHECK\(restores_replay = 0\)/)
})

test('CONF-DIST-10: migration 0057 raw_production_apply_path DENIED', () => {
  assert.match(migration0057Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0057Sql, /raw_production_apply_path = 'DENIED'/)
})
