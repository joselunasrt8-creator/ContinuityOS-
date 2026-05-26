import test from 'node:test'
import assert from 'node:assert/strict'

import {
  creates_authority,
  replay_neutral,
  buildNonceConsumptionId,
  isNonceConsumedGlobally,
  hasReplayDivergence,
  mergeConsumptionEvidence,
  resolveReplayConflict,
  classifyReplayConvergence,
  replayStateToUnusedPredicate,
} from '../../src/lib/replay-convergence.js'

// ── Evidence-only discipline ─────────────────────────────────────────────────

test('replay-convergence module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

test('replay-convergence module is replay-neutral (replay_neutral is true)', () => {
  assert.equal(replay_neutral, true)
})

// ── buildNonceConsumptionId ──────────────────────────────────────────────────

test('buildNonceConsumptionId returns nce_-prefixed sha256 hex string', () => {
  const id = buildNonceConsumptionId('nonce-1', 'decision-1', '2026-01-01T00:00:00Z')
  assert.match(id, /^nce_[0-9a-f]{64}$/)
})

test('buildNonceConsumptionId is deterministic', () => {
  const a = buildNonceConsumptionId('nonce-1', 'decision-1', '2026-01-01T00:00:00Z')
  const b = buildNonceConsumptionId('nonce-1', 'decision-1', '2026-01-01T00:00:00Z')
  assert.equal(a, b)
})

test('buildNonceConsumptionId differs for different nonces', () => {
  const a = buildNonceConsumptionId('nonce-1', 'decision-1', '2026-01-01T00:00:00Z')
  const b = buildNonceConsumptionId('nonce-2', 'decision-1', '2026-01-01T00:00:00Z')
  assert.notEqual(a, b)
})

test('buildNonceConsumptionId differs for different decision_ids', () => {
  const a = buildNonceConsumptionId('nonce-1', 'decision-1', '2026-01-01T00:00:00Z')
  const b = buildNonceConsumptionId('nonce-1', 'decision-2', '2026-01-01T00:00:00Z')
  assert.notEqual(a, b)
})

// ── isNonceConsumedGlobally ──────────────────────────────────────────────────

const makeEvidence = (nonce, shard = 'shard-a', causal_index = 1) => ({
  invocation_nonce: nonce,
  decision_id: 'decision-1',
  consumed_at: '2026-01-01T00:00:00Z',
  shard_id: shard,
  causal_index,
})

test('isNonceConsumedGlobally returns true when nonce is in evidence', () => {
  assert.equal(isNonceConsumedGlobally('nonce-1', [makeEvidence('nonce-1')]), true)
})

test('isNonceConsumedGlobally returns false when nonce is absent', () => {
  assert.equal(isNonceConsumedGlobally('nonce-99', [makeEvidence('nonce-1')]), false)
})

test('isNonceConsumedGlobally returns false for empty evidence', () => {
  assert.equal(isNonceConsumedGlobally('nonce-1', []), false)
})

test('isNonceConsumedGlobally returns true if nonce appears on any shard', () => {
  const evidence = [makeEvidence('nonce-a', 'shard-a'), makeEvidence('nonce-b', 'shard-b')]
  assert.equal(isNonceConsumedGlobally('nonce-b', evidence), true)
})

// ── hasReplayDivergence ──────────────────────────────────────────────────────

test('hasReplayDivergence returns false when both shards agree nonce is consumed', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  const remote = [makeEvidence('nonce-1', 'shard-b')]
  assert.equal(hasReplayDivergence('nonce-1', local, remote), false)
})

test('hasReplayDivergence returns false when both shards agree nonce is not consumed', () => {
  assert.equal(hasReplayDivergence('nonce-99', [], []), false)
})

test('hasReplayDivergence returns true when local consumed but remote has not seen it', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  assert.equal(hasReplayDivergence('nonce-1', local, []), true)
})

test('hasReplayDivergence returns true when remote consumed but local has not seen it', () => {
  const remote = [makeEvidence('nonce-1', 'shard-b')]
  assert.equal(hasReplayDivergence('nonce-1', [], remote), true)
})

// ── mergeConsumptionEvidence ─────────────────────────────────────────────────

test('mergeConsumptionEvidence unions local and remote evidence', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  const remote = [makeEvidence('nonce-2', 'shard-b')]
  const merged = mergeConsumptionEvidence(local, remote)
  assert.equal(merged.length, 2)
})

test('mergeConsumptionEvidence deduplicates same (nonce, decision, shard) triple', () => {
  const e = makeEvidence('nonce-1', 'shard-a')
  const merged = mergeConsumptionEvidence([e], [e])
  assert.equal(merged.length, 1)
})

test('mergeConsumptionEvidence preserves evidence from both shards for same nonce', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  const remote = [makeEvidence('nonce-1', 'shard-b')]
  const merged = mergeConsumptionEvidence(local, remote)
  assert.equal(merged.length, 2)
  assert.ok(merged.some((e) => e.shard_id === 'shard-a'))
  assert.ok(merged.some((e) => e.shard_id === 'shard-b'))
})

test('mergeConsumptionEvidence never removes evidence — consumed nonces remain consumed', () => {
  const consumed = [makeEvidence('nonce-1', 'shard-a')]
  const merged = mergeConsumptionEvidence(consumed, [])
  assert.equal(isNonceConsumedGlobally('nonce-1', merged), true)
})

test('mergeConsumptionEvidence returns empty array for two empty inputs', () => {
  assert.deepEqual(mergeConsumptionEvidence([], []), [])
})

// ── resolveReplayConflict ────────────────────────────────────────────────────

test('resolveReplayConflict returns null for empty evidence', () => {
  assert.equal(resolveReplayConflict([]), null)
})

test('resolveReplayConflict returns single record for single-element input', () => {
  const e = makeEvidence('nonce-1', 'shard-a', 5)
  assert.equal(resolveReplayConflict([e]), e)
})

test('resolveReplayConflict selects earliest causal_index as winner', () => {
  const earlier = makeEvidence('nonce-1', 'shard-a', 2)
  const later = makeEvidence('nonce-1', 'shard-b', 7)
  assert.equal(resolveReplayConflict([later, earlier]).shard_id, 'shard-a')
})

test('resolveReplayConflict breaks causal_index tie by consumed_at lexicographic order', () => {
  const a = { ...makeEvidence('nonce-1', 'shard-a', 3), consumed_at: '2026-01-01T00:00:00Z' }
  const b = { ...makeEvidence('nonce-1', 'shard-b', 3), consumed_at: '2026-01-02T00:00:00Z' }
  assert.equal(resolveReplayConflict([b, a]).shard_id, 'shard-a')
})

// ── classifyReplayConvergence ────────────────────────────────────────────────

test('classifyReplayConvergence returns REPLAY_PARTITION_SUSPENDED when topology absent', () => {
  assert.equal(classifyReplayConvergence('nonce-1', [], [], false), 'REPLAY_PARTITION_SUSPENDED')
})

test('classifyReplayConvergence returns REPLAY_PARTITION_SUSPENDED even when evidence exists if topology absent', () => {
  const e = [makeEvidence('nonce-1')]
  assert.equal(classifyReplayConvergence('nonce-1', e, e, false), 'REPLAY_PARTITION_SUSPENDED')
})

test('classifyReplayConvergence returns REPLAY_SAFE when nonce absent in both local and remote', () => {
  assert.equal(classifyReplayConvergence('nonce-99', [], [], true), 'REPLAY_SAFE')
})

test('classifyReplayConvergence returns REPLAY_CONSUMED when both shards have consumption evidence', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  const remote = [makeEvidence('nonce-1', 'shard-b')]
  assert.equal(classifyReplayConvergence('nonce-1', local, remote, true), 'REPLAY_CONSUMED')
})

test('classifyReplayConvergence returns REPLAY_DIVERGENT when local consumed but remote has not seen it', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  assert.equal(classifyReplayConvergence('nonce-1', local, [], true), 'REPLAY_DIVERGENT')
})

test('classifyReplayConvergence returns REPLAY_DIVERGENT when remote consumed but local has not seen it', () => {
  const remote = [makeEvidence('nonce-1', 'shard-b')]
  assert.equal(classifyReplayConvergence('nonce-1', [], remote, true), 'REPLAY_DIVERGENT')
})

test('classifyReplayConvergence: PARTITION_SUSPENDED takes priority over divergence (topology absent)', () => {
  const local = [makeEvidence('nonce-1', 'shard-a')]
  // topology_present=false must override divergence
  assert.equal(classifyReplayConvergence('nonce-1', local, [], false), 'REPLAY_PARTITION_SUSPENDED')
})

// ── replayStateToUnusedPredicate ─────────────────────────────────────────────

test('replayStateToUnusedPredicate returns true only for REPLAY_SAFE', () => {
  assert.equal(replayStateToUnusedPredicate('REPLAY_SAFE'), true)
  assert.equal(replayStateToUnusedPredicate('REPLAY_CONSUMED'), false)
  assert.equal(replayStateToUnusedPredicate('REPLAY_DIVERGENT'), false)
  assert.equal(replayStateToUnusedPredicate('REPLAY_PARTITION_SUSPENDED'), false)
  assert.equal(replayStateToUnusedPredicate('NULL'), false)
})
