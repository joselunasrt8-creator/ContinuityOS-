import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  replay_neutral,
  antiEntropyReplayRepair,
  mergeConsumptionEvidence,
  isNonceConsumedGlobally,
  classifyReplayConflict,
  REPLAY_CONFLICT_CLASS_MAP,
} from '../../src/lib/replay-convergence.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/replay_consumed_partition_heal.json', 'utf8'),
)

// ── CONF-DIST-03: Replay consumed in partition remains consumed after healing ─────
//
// Stage 2 invariant: consumed replay eligibility must remain consumed.
// Anti-entropy repair may propagate consumed state but must never unconsume a nonce.
// A nonce consumed during a partition is permanently consumed; post-heal replay → NULL.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1347  Supporting: #1418, #1442, #1340, #1440

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-03: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-03: replay-convergence module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-03: replay-convergence module is replay-neutral', () => {
  assert.equal(replay_neutral, true)
})

test('CONF-DIST-03: fixture expected outcome is NULL', () => {
  assert.equal(fixture.expected_result, 'NULL')
})

test('CONF-DIST-03: fixture forbidden results include GLOBAL_VALID and REPLAY_SAFE', () => {
  assert.ok(fixture.forbidden_results.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_results.includes('REPLAY_SAFE'))
})

// ── Core invariant: consumed nonce remains consumed after healing ──────────────

test('CONF-DIST-03: consumed nonce during partition remains consumed after healing → NULL', () => {
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: fixture.partition_a_evidence,
    partition_b_evidence: fixture.partition_b_evidence,
    partition_healed: fixture.partition_healed,
  })
  assert.equal(result.classification, 'NULL')
  assert.equal(result.conflict_class, 'REPLAY_RESURRECTION')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
  assert.equal(result.nonce_permanently_consumed, true)
})

test('CONF-DIST-03: anti-entropy merge preserves consumed nonce in merged evidence set', () => {
  const merged = mergeConsumptionEvidence(fixture.partition_a_evidence, fixture.partition_b_evidence)
  assert.equal(isNonceConsumedGlobally(fixture.invocation_nonce, merged), true)
})

test('CONF-DIST-03: GLOBAL_VALID is not reachable from REPLAY_RESURRECTION', () => {
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: fixture.partition_a_evidence,
    partition_b_evidence: fixture.partition_b_evidence,
    partition_healed: true,
  })
  assert.notEqual(result.classification, 'GLOBAL_VALID')
})

test('CONF-DIST-03: anti-entropy repair never restores replay eligibility (restores_replay=false)', () => {
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: fixture.partition_a_evidence,
    partition_b_evidence: fixture.partition_b_evidence,
    partition_healed: fixture.partition_healed,
  })
  assert.equal(result.restores_replay, false)
  assert.equal(result.nonce_permanently_consumed, true)
})

// ── Boundary conditions ───────────────────────────────────────────────────────

test('CONF-DIST-03: consumed nonce on partition-A is invisible to partition-B before healing', () => {
  const onlyB = isNonceConsumedGlobally(fixture.invocation_nonce, fixture.partition_b_evidence)
  assert.equal(onlyB, false)
})

test('CONF-DIST-03: without healing, divergence produces PARTITION_SUSPENDED not NULL', () => {
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: fixture.partition_a_evidence,
    partition_b_evidence: fixture.partition_b_evidence,
    partition_healed: false,
  })
  assert.equal(result.conflict_class, 'PARTITION_REPLAY_DIVERGENCE')
  assert.equal(result.classification, 'PARTITION_SUSPENDED')
  assert.equal(result.restores_replay, false)
})

test('CONF-DIST-03: result is frozen (immutable)', () => {
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: fixture.partition_a_evidence,
    partition_b_evidence: fixture.partition_b_evidence,
    partition_healed: fixture.partition_healed,
  })
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.consumed_set))
  assert.ok(Object.isFrozen(result.evidence_refs))
})

// ── Conflict class map coverage ───────────────────────────────────────────────

test('CONF-DIST-03: REPLAY_RESURRECTION conflict class maps to NULL', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['REPLAY_RESURRECTION'], 'NULL')
})

test('CONF-DIST-03: DUPLICATE_NONCE_OBSERVED conflict class maps to NULL', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['DUPLICATE_NONCE_OBSERVED'], 'NULL')
})

test('CONF-DIST-03: PARTITION_REPLAY_DIVERGENCE conflict class maps to PARTITION_SUSPENDED', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['PARTITION_REPLAY_DIVERGENCE'], 'PARTITION_SUSPENDED')
})

test('CONF-DIST-03: no conflict class maps to GLOBAL_VALID', () => {
  for (const classification of Object.values(REPLAY_CONFLICT_CLASS_MAP)) {
    assert.notEqual(classification, 'GLOBAL_VALID')
  }
})

test('CONF-DIST-03: classifyReplayConflict REPLAY_RESURRECTION returns NULL with correct envelope', () => {
  const result = classifyReplayConflict(
    'REPLAY_RESURRECTION',
    [fixture.invocation_nonce],
    ['evidence-ref-1'],
  )
  assert.equal(result.classification, 'NULL')
  assert.equal(result.conflict_class, 'REPLAY_RESURRECTION')
  assert.equal(result.creates_authority, false)
  assert.equal(result.restores_replay, false)
})
