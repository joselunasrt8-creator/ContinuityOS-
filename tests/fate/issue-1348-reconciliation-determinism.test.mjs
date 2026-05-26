import test from 'node:test'
import assert from 'node:assert/strict'

import {
  creates_authority,
  replay_neutral,
  buildReconciliationHeadId,
  headSortKey,
  selectCanonicalHead,
  isReconciliationStale,
  mergeRegistryHeads,
  classifyReconciliationFinality,
  reconciliationFinalityToReconcilablePredicate,
} from '../../src/lib/reconciliation-determinism.js'

// ── Evidence-only discipline ─────────────────────────────────────────────────

test('reconciliation-determinism module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

test('reconciliation-determinism module is replay-neutral (replay_neutral is true)', () => {
  assert.equal(replay_neutral, true)
})

// ── buildReconciliationHeadId ────────────────────────────────────────────────

test('buildReconciliationHeadId returns rch_-prefixed sha256 hex string', () => {
  const id = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z')
  assert.match(id, /^rch_[0-9a-f]{64}$/)
})

test('buildReconciliationHeadId is deterministic', () => {
  const a = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z')
  const b = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z')
  assert.equal(a, b)
})

test('buildReconciliationHeadId differs for different head_hash values', () => {
  const a = buildReconciliationHeadId('hash-a', 'shard-1', '2026-01-01T00:00:00Z')
  const b = buildReconciliationHeadId('hash-b', 'shard-1', '2026-01-01T00:00:00Z')
  assert.notEqual(a, b)
})

// ── headSortKey ──────────────────────────────────────────────────────────────

const makeHead = (hash, shard, causal_index, quorum_weight, reconciliability_score, observed_at = '2026-01-01T00:00:00Z', epoch_id = null) => ({
  head_hash: hash,
  shard_id: shard,
  causal_index,
  quorum_weight,
  reconciliability_score,
  observed_at,
  epoch_id,
})

test('headSortKey returns a 5-element tuple', () => {
  const key = headSortKey(makeHead('h', 's', 1, 0.8, 0.9))
  assert.equal(key.length, 5)
})

test('headSortKey negates reconciliability_score so higher score sorts first', () => {
  const high = headSortKey(makeHead('h', 's', 1, 0.5, 0.9))
  const low = headSortKey(makeHead('h', 's', 1, 0.5, 0.3))
  assert.ok(high[0] < low[0], 'higher reconciliability_score should produce lower sort key')
})

test('headSortKey negates quorum_weight so higher weight sorts first', () => {
  const heavy = headSortKey(makeHead('h', 's', 1, 0.9, 0.5))
  const light = headSortKey(makeHead('h', 's', 1, 0.3, 0.5))
  assert.ok(heavy[1] < light[1], 'higher quorum_weight should produce lower sort key')
})

// ── selectCanonicalHead ──────────────────────────────────────────────────────

test('selectCanonicalHead returns null for empty input', () => {
  assert.equal(selectCanonicalHead([]), null)
})

test('selectCanonicalHead returns sole head for single-element input', () => {
  const h = makeHead('hash-a', 'shard-1', 1, 0.8, 0.9)
  assert.equal(selectCanonicalHead([h]), h)
})

test('selectCanonicalHead prefers higher reconciliability_score', () => {
  const high = makeHead('hash-a', 'shard-1', 1, 0.5, 0.9)
  const low = makeHead('hash-b', 'shard-2', 1, 0.5, 0.3)
  assert.equal(selectCanonicalHead([low, high]).head_hash, 'hash-a')
})

test('selectCanonicalHead prefers higher quorum_weight when reconciliability ties', () => {
  const heavy = makeHead('hash-a', 'shard-1', 1, 0.9, 0.5)
  const light = makeHead('hash-b', 'shard-2', 1, 0.3, 0.5)
  assert.equal(selectCanonicalHead([light, heavy]).head_hash, 'hash-a')
})

test('selectCanonicalHead prefers lower causal_index when quorum_weight ties', () => {
  const earlier = makeHead('hash-a', 'shard-1', 2, 0.5, 0.5)
  const later = makeHead('hash-b', 'shard-2', 9, 0.5, 0.5)
  assert.equal(selectCanonicalHead([later, earlier]).head_hash, 'hash-a')
})

test('selectCanonicalHead uses observed_at as fourth tiebreak (earlier wins)', () => {
  const early = makeHead('hash-a', 'shard-1', 3, 0.5, 0.5, '2026-01-01T00:00:00Z')
  const late = makeHead('hash-b', 'shard-2', 3, 0.5, 0.5, '2026-06-01T00:00:00Z')
  assert.equal(selectCanonicalHead([late, early]).head_hash, 'hash-a')
})

test('selectCanonicalHead uses head_hash lexicographic as final tiebreak', () => {
  const a = makeHead('aaa', 'shard-1', 3, 0.5, 0.5, '2026-01-01T00:00:00Z')
  const b = makeHead('zzz', 'shard-2', 3, 0.5, 0.5, '2026-01-01T00:00:00Z')
  assert.equal(selectCanonicalHead([b, a]).head_hash, 'aaa')
})

test('selectCanonicalHead is deterministic regardless of input order', () => {
  const heads = [
    makeHead('hash-c', 'shard-3', 5, 0.4, 0.7),
    makeHead('hash-a', 'shard-1', 2, 0.9, 0.8),
    makeHead('hash-b', 'shard-2', 3, 0.6, 0.8),
  ]
  const r1 = selectCanonicalHead(heads)
  const r2 = selectCanonicalHead([...heads].reverse())
  assert.equal(r1.head_hash, r2.head_hash)
})

// ── isReconciliationStale ────────────────────────────────────────────────────

test('isReconciliationStale returns false when head is within staleness horizon', () => {
  const head = makeHead('h', 's', 1, 0.5, 0.5, new Date(Date.now() - 5_000).toISOString())
  assert.equal(isReconciliationStale(head, 60_000), false)
})

test('isReconciliationStale returns true when head exceeds staleness horizon', () => {
  const head = makeHead('h', 's', 1, 0.5, 0.5, new Date(Date.now() - 120_000).toISOString())
  assert.equal(isReconciliationStale(head, 60_000), true)
})

test('isReconciliationStale returns true for unparseable observed_at', () => {
  const head = { ...makeHead('h', 's', 1, 0.5, 0.5), observed_at: 'not-a-date' }
  assert.equal(isReconciliationStale(head, 60_000), true)
})

test('isReconciliationStale uses injectable now_ms for deterministic testing', () => {
  const base = 1_000_000
  const head = makeHead('h', 's', 1, 0.5, 0.5, new Date(base - 30_000).toISOString())
  assert.equal(isReconciliationStale(head, 60_000, base), false)
  assert.equal(isReconciliationStale(head, 20_000, base), true)
})

// ── mergeRegistryHeads ───────────────────────────────────────────────────────

test('mergeRegistryHeads unions local and remote heads', () => {
  const local = [makeHead('hash-a', 'shard-1', 1, 0.8, 0.8)]
  const remote = [makeHead('hash-b', 'shard-2', 2, 0.7, 0.7)]
  assert.equal(mergeRegistryHeads(local, remote).length, 2)
})

test('mergeRegistryHeads deduplicates same (head_hash, shard_id) pair', () => {
  const h = makeHead('hash-a', 'shard-1', 1, 0.8, 0.8)
  assert.equal(mergeRegistryHeads([h], [h]).length, 1)
})

test('mergeRegistryHeads preserves both shards for same head_hash (agreement evidence)', () => {
  const local = makeHead('hash-a', 'shard-1', 1, 0.8, 0.8)
  const remote = makeHead('hash-a', 'shard-2', 1, 0.8, 0.8)
  const merged = mergeRegistryHeads([local], [remote])
  assert.equal(merged.length, 2)
  assert.ok(merged.some((h) => h.shard_id === 'shard-1'))
  assert.ok(merged.some((h) => h.shard_id === 'shard-2'))
})

test('mergeRegistryHeads returns empty for two empty inputs', () => {
  assert.deepEqual(mergeRegistryHeads([], []), [])
})

// ── classifyReconciliationFinality ───────────────────────────────────────────

test('classifyReconciliationFinality returns NULL_RECONCILIATION for empty heads', () => {
  assert.equal(classifyReconciliationFinality([], true), 'NULL_RECONCILIATION')
  assert.equal(classifyReconciliationFinality([], false), 'NULL_RECONCILIATION')
})

test('classifyReconciliationFinality returns GLOBAL_RECONCILED_CANDIDATE when all agree and topology present', () => {
  const heads = [
    makeHead('hash-a', 'shard-1', 1, 0.8, 0.8),
    makeHead('hash-a', 'shard-2', 1, 0.8, 0.8),
  ]
  assert.equal(classifyReconciliationFinality(heads, true), 'GLOBAL_RECONCILED_CANDIDATE')
})

test('classifyReconciliationFinality returns LOCAL_RECONCILED when all agree but no topology', () => {
  const heads = [
    makeHead('hash-a', 'shard-1', 1, 0.8, 0.8),
    makeHead('hash-a', 'shard-2', 1, 0.8, 0.8),
  ]
  assert.equal(classifyReconciliationFinality(heads, false), 'LOCAL_RECONCILED')
})

test('classifyReconciliationFinality returns LOCAL_RECONCILED for single head without topology', () => {
  const heads = [makeHead('hash-a', 'shard-1', 1, 0.8, 0.8)]
  assert.equal(classifyReconciliationFinality(heads, false), 'LOCAL_RECONCILED')
})

test('classifyReconciliationFinality returns AMBIGUOUS_RECONCILIATION for competing heads', () => {
  const heads = [
    makeHead('hash-a', 'shard-1', 1, 0.8, 0.8),
    makeHead('hash-b', 'shard-2', 2, 0.7, 0.7),
  ]
  assert.equal(classifyReconciliationFinality(heads, true), 'AMBIGUOUS_RECONCILIATION')
})

test('classifyReconciliationFinality returns AMBIGUOUS_REQUIRES_EPOCH for cross-epoch competing heads', () => {
  const heads = [
    makeHead('hash-a', 'shard-1', 1, 0.8, 0.8, '2026-01-01T00:00:00Z', 'epoch-1'),
    makeHead('hash-b', 'shard-2', 2, 0.7, 0.7, '2026-01-02T00:00:00Z', 'epoch-2'),
  ]
  assert.equal(classifyReconciliationFinality(heads, true), 'AMBIGUOUS_REQUIRES_EPOCH')
})

// ── reconciliationFinalityToReconcilablePredicate ────────────────────────────

test('GLOBAL_RECONCILED_CANDIDATE satisfies RECONCILABLE for both local and global claims', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('GLOBAL_RECONCILED_CANDIDATE', false), true)
  assert.equal(reconciliationFinalityToReconcilablePredicate('GLOBAL_RECONCILED_CANDIDATE', true), true)
})

test('LOCAL_RECONCILED satisfies RECONCILABLE only for local claims', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('LOCAL_RECONCILED', false), true)
  assert.equal(reconciliationFinalityToReconcilablePredicate('LOCAL_RECONCILED', true), false)
})

test('AMBIGUOUS_RECONCILIATION does not satisfy RECONCILABLE', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('AMBIGUOUS_RECONCILIATION', false), false)
  assert.equal(reconciliationFinalityToReconcilablePredicate('AMBIGUOUS_RECONCILIATION', true), false)
})

test('AMBIGUOUS_REQUIRES_EPOCH does not satisfy RECONCILABLE', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('AMBIGUOUS_REQUIRES_EPOCH', false), false)
})

test('NULL_RECONCILIATION does not satisfy RECONCILABLE', () => {
  assert.equal(reconciliationFinalityToReconcilablePredicate('NULL_RECONCILIATION', false), false)
  assert.equal(reconciliationFinalityToReconcilablePredicate('NULL_RECONCILIATION', true), false)
})
