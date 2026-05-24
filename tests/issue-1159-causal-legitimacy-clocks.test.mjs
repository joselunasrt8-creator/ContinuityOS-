import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { verifyCausalLegitimacyClocks } from '../src/causal-legitimacy-clocks.ts'

function event(overrides = {}) {
  return {
    object_id: 'obj-1',
    parent_object_id: null,
    replay_step: 1,
    revocation_step: 2,
    proof_step: 3,
    lineage_hash: 'l-1',
    replay_hash: 'r-1',
    revocation_hash: 'v-1',
    proof_hash: 'p-1',
    topology_hash: 't-1',
    ...overrides,
  }
}

function view(registry_id, overrides = {}) {
  return {
    registry_id,
    visibility_complete: true,
    registry_epoch: 1,
    events: [event()],
    ...overrides,
  }
}

test('Issue #1159: deterministic causal ordering and frozen outputs', () => {
  const result = verifyCausalLegitimacyClocks({
    clock_id: 'clk-1',
    evidence_only: true,
    views: [view('b'), view('a')],
  })
  assert.equal(result.classification, 'CAUSALLY_ORDERED')
  assert.equal(result.equivalent, true)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.deepEqual(result.deterministic_traversal, ['a', 'b'])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.deterministic_order))
})

test('Issue #1159: replay chronology, revocation ordering, and proof finality drifts', () => {
  const replay = verifyCausalLegitimacyClocks({
    clock_id: 'clk-2',
    evidence_only: true,
    views: [view('a'), view('b', { events: [event({ replay_step: 9, replay_hash: 'r-9' })] })],
  })
  assert.equal(replay.classification, 'REPLAY_CHRONOLOGY_DRIFT')

  const revocation = verifyCausalLegitimacyClocks({
    clock_id: 'clk-3',
    evidence_only: true,
    views: [view('a'), view('b', { events: [event({ revocation_step: 9, revocation_hash: 'v-9' })] })],
  })
  assert.equal(revocation.classification, 'REVOCATION_ORDERING_DRIFT')

  const proof = verifyCausalLegitimacyClocks({
    clock_id: 'clk-4',
    evidence_only: true,
    views: [view('a'), view('b', { events: [event({ proof_step: 9, proof_hash: 'p-9' })] })],
  })
  assert.equal(proof.classification, 'PROOF_FINALITY_DRIFT')
})

test('Issue #1159: split-brain, topology drift, and partial visibility fail closed', () => {
  const splitBrain = verifyCausalLegitimacyClocks({
    clock_id: 'clk-5',
    evidence_only: true,
    views: [view('a'), view('b', { events: [event({ parent_object_id: 'different-parent', lineage_hash: 'l-9' })], registry_epoch: 2 })],
  })
  assert.equal(splitBrain.classification, 'TEMPORAL_SPLIT_BRAIN')

  const topology = verifyCausalLegitimacyClocks({
    clock_id: 'clk-6',
    evidence_only: true,
    views: [view('a', { events: [event({ parent_object_id: 'missing-parent' })] }), view('b', { events: [event({ parent_object_id: 'missing-parent' })] })],
  })
  assert.equal(topology.classification, 'TOPOLOGY_TEMPORAL_DRIFT')

  const partial = verifyCausalLegitimacyClocks({
    clock_id: 'clk-7',
    evidence_only: true,
    views: [view('a', { visibility_complete: false }), view('b')],
  })
  assert.equal(partial.classification, 'PARTIAL_TEMPORAL_VISIBILITY')
})

test('Issue #1159: causal divergence inversion fixture and NULL handling', () => {
  const divergence = verifyCausalLegitimacyClocks({
    clock_id: 'clk-8',
    evidence_only: true,
    views: [view('a', { events: [event({ replay_step: 5, revocation_step: 1, proof_step: 2 })] }), view('b', { events: [event({ replay_step: 5, revocation_step: 1, proof_step: 2 })] })],
  })
  assert.equal(divergence.classification, 'CAUSAL_DIVERGENCE')

  const nullResult = verifyCausalLegitimacyClocks({ clock_id: 'clk-9', evidence_only: true, views: [] })
  assert.equal(nullResult.classification, 'NULL')
})

test('Issue #1159: canonical hashing verification and no authority semantics', () => {
  const result = verifyCausalLegitimacyClocks({
    clock_id: 'clk-10',
    evidence_only: true,
    views: [view('a')],
  })
  const expectedReplay = sha256Hex(canonicalize([['obj-1', 1, 'r-1']]))
  assert.equal(result.replay_chronology_hash, expectedReplay)
  assert.equal(result.creates_authority, false)
})
