import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { verifyDistributedReplayConvergence } from '../src/distributed-replay-convergence.ts'

function entry(overrides = {}) {
  return {
    object_id: 'obj-1',
    parent_object_id: null,
    lineage_hash: 'l-1',
    replay_hash: 'r-1',
    revocation_hash: 'v-1',
    topology_hash: 't-1',
    observed_at: '2026-05-24T00:00:00.000Z',
    ...overrides,
  }
}

function view(id, overrides = {}) {
  return {
    registry_id: id,
    visibility_complete: true,
    registry_epoch: 1,
    entries: [entry()],
    ...overrides,
  }
}

test('Issue #1152: deterministic replay convergence and frozen outputs', () => {
  const result = verifyDistributedReplayConvergence({
    convergence_id: 'c-1',
    evidence_only: true,
    views: [view('b'), view('a')],
  })
  assert.equal(result.classification, 'REPLAY_CONVERGED')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.deepEqual(result.deterministic_traversal, ['a', 'b'])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.deterministic_traversal))
})

test('Issue #1152: replay resurrection and stale replay fixtures fail closed', () => {
  const resurrection = verifyDistributedReplayConvergence({
    convergence_id: 'c-2',
    evidence_only: true,
    views: [view('a', { entries: [entry(), entry({ observed_at: '2025-01-01T00:00:00.000Z' })] }), view('b')],
  })
  assert.equal(resurrection.classification, 'REPLAY_RESURRECTION')

  const stale = verifyDistributedReplayConvergence({
    convergence_id: 'c-3',
    evidence_only: true,
    views: [view('a', { entries: [entry({ object_id: 'child', parent_object_id: 'missing' })] }), view('b')],
  })
  assert.equal(stale.classification, 'STALE_REPLAY')
})

test('Issue #1152: replay divergence and chronology mismatch fixtures', () => {
  const divergence = verifyDistributedReplayConvergence({
    convergence_id: 'c-4',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ replay_hash: 'r-2' })] })],
  })
  assert.equal(divergence.classification, 'REPLAY_DIVERGED')

  const chronology = verifyDistributedReplayConvergence({
    convergence_id: 'c-5',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ observed_at: '2026-05-25T00:00:00.000Z' })] })],
  })
  assert.equal(chronology.classification, 'REPLAY_DIVERGED')
})

test('Issue #1152: topology drift, registry mismatch, and partial visibility fixtures', () => {
  const topology = verifyDistributedReplayConvergence({
    convergence_id: 'c-6',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ topology_hash: 't-2' })] })],
  })
  assert.equal(topology.classification, 'REPLAY_TOPOLOGY_DRIFT')

  const registryMismatch = verifyDistributedReplayConvergence({
    convergence_id: 'c-7',
    evidence_only: true,
    views: [view('a', { registry_epoch: 1 }), view('b', { registry_epoch: 9 })],
  })
  assert.equal(registryMismatch.classification, 'REPLAY_REGISTRY_MISMATCH')

  const partial = verifyDistributedReplayConvergence({
    convergence_id: 'c-8',
    evidence_only: true,
    views: [view('a', { visibility_complete: false }), view('b')],
  })
  assert.equal(partial.classification, 'REPLAY_PARTIAL_VISIBILITY')
})

test('Issue #1152: canonical hashing, NULL handling, and no authority semantics', () => {
  const nullResult = verifyDistributedReplayConvergence({ convergence_id: 'c-9', evidence_only: true, views: [] })
  assert.equal(nullResult.classification, 'NULL')

  const result = verifyDistributedReplayConvergence({
    convergence_id: 'c-10',
    evidence_only: true,
    views: [view('a')],
  })
  const expectedReplay = sha256Hex(canonicalize([['obj-1', 'r-1']]))
  assert.equal(result.replay_hash, expectedReplay)
  assert.equal(result.creates_authority, false)
})
