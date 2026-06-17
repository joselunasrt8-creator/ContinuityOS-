import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReconciliationHeadId,
  headSortKey,
  selectCanonicalHead,
  isReconciliationStale,
  mergeRegistryHeads,
  classifyReconciliationFinality,
  reconciliationFinalityToReconcilablePredicate,
  creates_authority,
  replay_neutral,
} from '../../src/lib/reconciliation-determinism.ts';

test('creates_authority is false and replay_neutral is true — evidence-only', () => {
  assert.equal(creates_authority, false);
  assert.equal(replay_neutral, true);
});

test('buildReconciliationHeadId is deterministic', () => {
  const id1 = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z');
  const id2 = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z');
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('rch_'));

  const id3 = buildReconciliationHeadId('hash-b', 'shard-1', '2026-01-01T00:00:00Z');
  assert.notEqual(id1, id3);
});

function makeHead(overrides = {}) {
  return {
    head_hash: 'hash-default',
    shard_id: 'shard-1',
    causal_index: 1,
    quorum_weight: 0.5,
    reconciliability_score: 0.8,
    observed_at: '2026-01-01T00:00:00Z',
    epoch_id: 'epoch-1',
    ...overrides,
  };
}

test('headSortKey — higher reconciliability_score wins (lower sort key)', () => {
  const a = makeHead({ reconciliability_score: 0.9 });
  const b = makeHead({ reconciliability_score: 0.7 });
  const ka = headSortKey(a);
  const kb = headSortKey(b);
  assert.ok(ka[0] < kb[0]);
});

test('headSortKey — higher quorum_weight wins when reconciliability is equal', () => {
  const a = makeHead({ quorum_weight: 0.9 });
  const b = makeHead({ quorum_weight: 0.3 });
  const ka = headSortKey(a);
  const kb = headSortKey(b);
  assert.ok(ka[1] < kb[1]);
});

test('selectCanonicalHead — returns null for empty input', () => {
  assert.equal(selectCanonicalHead([]), null);
});

test('selectCanonicalHead — single head is returned', () => {
  const head = makeHead();
  assert.deepEqual(selectCanonicalHead([head]), head);
});

test('selectCanonicalHead — selects head with highest reconciliability', () => {
  const a = makeHead({ head_hash: 'a', reconciliability_score: 0.9 });
  const b = makeHead({ head_hash: 'b', reconciliability_score: 0.5 });
  const winner = selectCanonicalHead([b, a]);
  assert.equal(winner.head_hash, 'a');
});

test('selectCanonicalHead — tie-break by quorum_weight', () => {
  const a = makeHead({ head_hash: 'a', quorum_weight: 0.9 });
  const b = makeHead({ head_hash: 'b', quorum_weight: 0.3 });
  const winner = selectCanonicalHead([b, a]);
  assert.equal(winner.head_hash, 'a');
});

test('selectCanonicalHead — tie-break by causal_index (lower wins)', () => {
  const a = makeHead({ head_hash: 'a', causal_index: 2 });
  const b = makeHead({ head_hash: 'b', causal_index: 5 });
  const winner = selectCanonicalHead([b, a]);
  assert.equal(winner.head_hash, 'a');
});

test('isReconciliationStale — fresh head is not stale', () => {
  const head = makeHead({ observed_at: '2026-01-01T00:00:00Z' });
  const now = Date.parse('2026-01-01T00:00:30Z');
  assert.equal(isReconciliationStale(head, 60000, now), false);
});

test('isReconciliationStale — old head is stale', () => {
  const head = makeHead({ observed_at: '2026-01-01T00:00:00Z' });
  const now = Date.parse('2026-01-01T00:05:00Z');
  assert.equal(isReconciliationStale(head, 60000, now), true);
});

test('isReconciliationStale — invalid observed_at defaults to stale', () => {
  const head = makeHead({ observed_at: 'invalid-date' });
  assert.equal(isReconciliationStale(head, 60000, Date.now()), true);
});

test('mergeRegistryHeads — deduplicates by head_hash:shard_id', () => {
  const local = [makeHead({ head_hash: 'h1', shard_id: 's1' })];
  const remote = [
    makeHead({ head_hash: 'h1', shard_id: 's1' }),
    makeHead({ head_hash: 'h2', shard_id: 's2' }),
  ];
  const merged = mergeRegistryHeads(local, remote);
  assert.equal(merged.length, 2);
});

test('mergeRegistryHeads — preserves distinct entries', () => {
  const local = [makeHead({ head_hash: 'h1', shard_id: 's1' })];
  const remote = [makeHead({ head_hash: 'h1', shard_id: 's2' })];
  const merged = mergeRegistryHeads(local, remote);
  assert.equal(merged.length, 2);
});

test('classifyReconciliationFinality — empty heads yields NULL_RECONCILIATION', () => {
  assert.equal(classifyReconciliationFinality([], true), 'NULL_RECONCILIATION');
});

test('classifyReconciliationFinality — single hash + topology = GLOBAL_RECONCILED_CANDIDATE', () => {
  const heads = [
    makeHead({ head_hash: 'same', shard_id: 's1' }),
    makeHead({ head_hash: 'same', shard_id: 's2' }),
  ];
  assert.equal(classifyReconciliationFinality(heads, true), 'GLOBAL_RECONCILED_CANDIDATE');
});

test('classifyReconciliationFinality — single hash without topology = LOCAL_RECONCILED', () => {
  const heads = [
    makeHead({ head_hash: 'same', shard_id: 's1' }),
    makeHead({ head_hash: 'same', shard_id: 's2' }),
  ];
  assert.equal(classifyReconciliationFinality(heads, false), 'LOCAL_RECONCILED');
});

test('classifyReconciliationFinality — competing heads with epoch conflict = AMBIGUOUS_REQUIRES_EPOCH', () => {
  const heads = [
    makeHead({ head_hash: 'h1', epoch_id: 'epoch-1' }),
    makeHead({ head_hash: 'h2', epoch_id: 'epoch-2' }),
  ];
  assert.equal(classifyReconciliationFinality(heads, true), 'AMBIGUOUS_REQUIRES_EPOCH');
});

test('classifyReconciliationFinality — competing heads without epoch conflict = AMBIGUOUS_RECONCILIATION', () => {
  const heads = [
    makeHead({ head_hash: 'h1', epoch_id: 'epoch-1' }),
    makeHead({ head_hash: 'h2', epoch_id: 'epoch-1' }),
  ];
  assert.equal(classifyReconciliationFinality(heads, true), 'AMBIGUOUS_RECONCILIATION');
});

test('reconciliationFinalityToReconcilablePredicate — global requirement', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('GLOBAL_RECONCILED_CANDIDATE', true), true);
  assert.equal(reconciliationFinalityToReconcilablePredicate('LOCAL_RECONCILED', true), false);
  assert.equal(reconciliationFinalityToReconcilablePredicate('NULL_RECONCILIATION', true), false);
});

test('reconciliationFinalityToReconcilablePredicate — local requirement', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('GLOBAL_RECONCILED_CANDIDATE', false), true);
  assert.equal(reconciliationFinalityToReconcilablePredicate('LOCAL_RECONCILED', false), true);
  assert.equal(reconciliationFinalityToReconcilablePredicate('AMBIGUOUS_RECONCILIATION', false), false);
  assert.equal(reconciliationFinalityToReconcilablePredicate('NULL_RECONCILIATION', false), false);
});
