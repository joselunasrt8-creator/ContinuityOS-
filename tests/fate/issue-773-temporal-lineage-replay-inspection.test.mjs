import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectTemporalLineageReplay } from '../../runtime/temporal_lineage_replay_inspector.ts'

function canonicalLineage() {
  return [
    { id: 'session-1', parent_id: null, stage: 'session', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:00:00.000Z', topology_hash: 'topo-a' },
    { id: 'continuity-1', parent_id: 'session-1', stage: 'continuity', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:01:00.000Z', topology_hash: 'topo-a' },
    { id: 'authority-1', parent_id: 'continuity-1', stage: 'authority', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:02:00.000Z', topology_hash: 'topo-a' },
  ]
}

test('Issue #773: deterministic temporal lineage replay inspection passes for canonical replay', () => {
  const result = inspectTemporalLineageReplay({
    canonicalLineage: canonicalLineage(),
    replayLineage: canonicalLineage(),
    expectedEpoch: 7,
  })

  assert.equal(result.status, 'PASS')
  assert.equal(result.deterministic_conclusion, 'VALID')
  assert.equal(result.replay_neutral, true)
  assert.deepEqual(result.issues, [])
})

test('Issue #773: epoch disagreement fails closed to NULL with epoch-induced drift', () => {
  const replay = canonicalLineage().map((node, idx) => ({
    ...node,
    epoch: idx === 2 ? 8 : node.epoch,
  }))

  const result = inspectTemporalLineageReplay({
    canonicalLineage: canonicalLineage(),
    replayLineage: replay,
    expectedEpoch: 7,
  })

  assert.equal(result.status, 'DRIFT')
  assert.equal(result.deterministic_conclusion, 'NULL')
  assert.equal(result.fail_closed_epoch_disagreement, true)
  assert.ok(result.issues.some((issue) => issue.class === 'epoch-induced'))
})

test('Issue #773: stale proof emergence and ordering divergence are classified deterministically', () => {
  const replay = [
    { id: 'authority-1', parent_id: 'continuity-1', stage: 'authority', legitimacy_state: 'STALE', epoch: 7, timestamp: '2026-05-20T00:02:00.000Z', topology_hash: 'topo-b' },
    { id: 'session-1', parent_id: null, stage: 'session', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:00:00.000Z', topology_hash: 'topo-a' },
    { id: 'continuity-1', parent_id: 'session-1', stage: 'continuity', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:01:00.000Z', topology_hash: 'topo-a' },
  ]

  const result = inspectTemporalLineageReplay({
    canonicalLineage: canonicalLineage(),
    replayLineage: replay,
    expectedEpoch: 7,
  })

  assert.equal(result.status, 'DRIFT')
  assert.equal(result.deterministic_conclusion, 'NULL')
  assert.ok(result.issues.some((issue) => issue.class === 'stale-state-induced'))
  assert.ok(result.issues.some((issue) => issue.class === 'ordering-induced'))
  assert.ok(result.issues.some((issue) => issue.class === 'regeneration-induced'))
})
