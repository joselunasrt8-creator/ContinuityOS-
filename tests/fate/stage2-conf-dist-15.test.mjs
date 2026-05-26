import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  replay_neutral,
  mergeConsumedReplayState,
  classifyReplayConflict,
  isNonceConsumedGlobally,
  antiEntropyReplayRepair,
  REPLAY_CONFLICT_CLASS_MAP,
} from '../../src/lib/replay-convergence.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/partition_heal_no_replay_restore.json', 'utf8'),
)

// ── CONF-DIST-15: Partition healing does not restore replay eligibility ────────
//
// Stage 2 invariant: partition healing does not restore consumed replay eligibility.
// union(consumed_nonces across partitions) = permanently consumed replay set.
// Nonces consumed on either side of a partition remain permanently consumed.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1347  Supporting: #1418, #1442, #1340, #1440

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-15: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-15: replay-convergence module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-15: replay-convergence module is replay-neutral', () => {
  assert.equal(replay_neutral, true)
})

test('CONF-DIST-15: fixture expected outcome is NULL', () => {
  assert.equal(fixture.expected_result, 'NULL')
})

test('CONF-DIST-15: fixture forbidden results include GLOBAL_VALID and REPLAY_SAFE', () => {
  assert.ok(fixture.forbidden_results.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_results.includes('REPLAY_SAFE'))
})

// ── Core invariant: partition healing does not restore replay eligibility ──────

test('CONF-DIST-15: mergeConsumedReplayState produces permanent consumed set', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  assert.equal(isNonceConsumedGlobally(fixture.invocation_nonce, merged), true)
})

test('CONF-DIST-15: partition healing does not restore consumed replay eligibility → NULL', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  const consumed_nonces = merged.map((e) => e.invocation_nonce)
  const evidence_refs = merged.map((e) => `${e.decision_id}:${e.shard_id}`)
  const result = classifyReplayConflict(
    fixture.expected_conflict_class,
    consumed_nonces,
    evidence_refs,
  )
  assert.equal(result.classification, 'NULL')
  assert.equal(result.conflict_class, 'REPLAY_RESURRECTION')
  assert.equal(result.restores_replay, false)
  assert.equal(result.creates_authority, false)
})

test('CONF-DIST-15: GLOBAL_VALID is not reachable via partition healing', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  const result = classifyReplayConflict(
    'REPLAY_RESURRECTION',
    merged.map((e) => e.invocation_nonce),
    [],
  )
  assert.notEqual(result.classification, 'GLOBAL_VALID')
})

test('CONF-DIST-15: REPLAY_SAFE is not reachable for consumed nonce after merge', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  assert.equal(isNonceConsumedGlobally(fixture.invocation_nonce, merged), true)
  // consumed → cannot be REPLAY_SAFE
  const consumed_nonces = merged.map((e) => e.invocation_nonce)
  const result = classifyReplayConflict('REPLAY_RESURRECTION', consumed_nonces, [])
  assert.notEqual(result.classification, 'REPLAY_SAFE')
})

// ── Union semantics ───────────────────────────────────────────────────────────

test('CONF-DIST-15: union of partition sets is additive — consumed evidence never removed', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  const totalFromSets = fixture.partition_sets.reduce((acc, s) => acc + s.length, 0)
  assert.ok(merged.length >= totalFromSets)
})

test('CONF-DIST-15: empty partition in union does not remove consumed evidence', () => {
  const singlePartition = fixture.partition_sets[0]
  const merged = mergeConsumedReplayState([singlePartition, []])
  assert.equal(isNonceConsumedGlobally(fixture.invocation_nonce, merged), true)
})

test('CONF-DIST-15: merged result is frozen (immutable)', () => {
  const merged = mergeConsumedReplayState(fixture.partition_sets)
  assert.ok(Object.isFrozen(merged))
})

test('CONF-DIST-15: classifyReplayConflict result is frozen', () => {
  const result = classifyReplayConflict('REPLAY_RESURRECTION', [fixture.invocation_nonce], [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.consumed_set))
  assert.ok(Object.isFrozen(result.evidence_refs))
})

// ── Anti-entropy repair via antiEntropyReplayRepair ───────────────────────────

test('CONF-DIST-15: antiEntropyReplayRepair confirms nonce permanently consumed post-heal', () => {
  const partitionA = fixture.partition_sets[0]
  const partitionB = fixture.partition_sets[1]
  const result = antiEntropyReplayRepair({
    decision_id: fixture.decision_id,
    invocation_nonce: fixture.invocation_nonce,
    partition_a_evidence: partitionA,
    partition_b_evidence: partitionB,
    partition_healed: fixture.partition_healed,
  })
  assert.equal(result.classification, 'NULL')
  assert.equal(result.nonce_permanently_consumed, true)
  assert.equal(result.restores_replay, false)
})

// ── No conflict class maps to GLOBAL_VALID ────────────────────────────────────

test('CONF-DIST-15: no replay conflict class maps to GLOBAL_VALID', () => {
  for (const classification of Object.values(REPLAY_CONFLICT_CLASS_MAP)) {
    assert.notEqual(classification, 'GLOBAL_VALID')
  }
})

test('CONF-DIST-15: STALE_PROOF_REUSE maps to STALE_VISIBLE (stale proof, not NULL)', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['STALE_PROOF_REUSE'], 'STALE_VISIBLE')
})

test('CONF-DIST-15: REPLAY_CHRONOLOGY_CONFLICT maps to AMBIGUOUS', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['REPLAY_CHRONOLOGY_CONFLICT'], 'AMBIGUOUS')
})

test('CONF-DIST-15: REPLAY_ANTI_ENTROPY_REQUIRED maps to PARTITION_SUSPENDED', () => {
  assert.equal(REPLAY_CONFLICT_CLASS_MAP['REPLAY_ANTI_ENTROPY_REQUIRED'], 'PARTITION_SUSPENDED')
})
