import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { verifyRuntimeCheckpointRestoration } from '../src/runtime-checkpoint-restoration.ts'

function snap(overrides = {}) {
  return {
    checkpoint_id: 'chk-1',
    checkpoint_hash: 'c-1',
    replay_hash: 'r-1',
    lineage_hash: 'l-1',
    proof_hash: 'p-1',
    topology_hash: 't-1',
    reconciliation_hash: 'rc-1',
    temporal_hash: 'tm-1',
    semantic_hash: 's-1',
    observed_at: '2026-05-24T00:00:00.000Z',
    surface: 'runtime_checkpoint',
    ...overrides,
  }
}

function run(overrides = {}) {
  return verifyRuntimeCheckpointRestoration({
    restoration_id: 'rst-1',
    evidence_only: true,
    original: snap(),
    restored: snap(),
    distributed_views: [snap({ checkpoint_id: 'chk-2' })],
    ...overrides,
  })
}

test('Issue #1143: deterministic equivalence with immutable evidence-only output', () => {
  const result = run({ distributed_views: [snap({ checkpoint_id: 'b' }), snap({ checkpoint_id: 'a' })] })
  assert.equal(result.classification, 'RESTORATION_EQUIVALENT')
  assert.equal(result.equivalent, true)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
  assert.deepEqual(result.deterministic_checkpoint_traversal, ['chk-1:original', 'chk-1:restored', 'a:distributed', 'b:distributed'])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.restoration_equivalence_inventory))
})

test('Issue #1143: per-surface drift classifications', () => {
  assert.equal(run({ restored: snap({ checkpoint_hash: 'c-2' }), distributed_views: [] }).classification, 'CHECKPOINT_MISMATCH')
  assert.equal(run({ restored: snap({ replay_hash: 'r-2' }), distributed_views: [] }).classification, 'REPLAY_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ lineage_hash: 'l-2' }), distributed_views: [] }).classification, 'LINEAGE_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ proof_hash: 'p-2' }), distributed_views: [] }).classification, 'PROOF_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ topology_hash: 't-2' }), distributed_views: [] }).classification, 'TOPOLOGY_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ reconciliation_hash: 'rc-2' }), distributed_views: [] }).classification, 'RECONCILIATION_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ temporal_hash: 'tm-2' }), distributed_views: [] }).classification, 'TEMPORAL_RESTORATION_DRIFT')
  assert.equal(run({ restored: snap({ semantic_hash: 's-2' }), distributed_views: [] }).classification, 'SEMANTIC_RESTORATION_DRIFT')
})

test('Issue #1143: stale checkpoint, fragmentation, and unknown surface detection', () => {
  assert.equal(run({ restored: snap({ observed_at: '2020-01-01T00:00:00.000Z' }) }).classification, 'STALE_CHECKPOINT')
  assert.equal(run({ distributed_views: [snap({ checkpoint_id: 'v1', checkpoint_hash: 'c-9' })] }).classification, 'DISTRIBUTED_CHECKPOINT_FRAGMENTATION')
  assert.equal(run({ restored: snap({ surface: 'hidden_surface' }) }).classification, 'UNKNOWN_RESTORATION_SURFACE')
})

test('Issue #1143: inventories include expected divergence evidence', () => {
  const result = run({
    restored: snap({ replay_hash: 'r-2', semantic_hash: 's-2', temporal_hash: 'tm-2' }),
    distributed_views: [snap({ checkpoint_id: 'v1', checkpoint_hash: 'c-2' })],
  })
  assert.deepEqual(result.replay_restoration_divergence_inventory, ['replay_hash_divergence'])
  assert.deepEqual(result.temporal_restoration_divergence_inventory, ['temporal_hash_divergence'])
  assert.deepEqual(result.semantic_restoration_divergence_inventory, ['semantic_hash_divergence'])
  assert.ok(result.distributed_checkpoint_fragmentation_inventory.includes('distributed_checkpoint_hash_fragmented'))
})

test('Issue #1143: canonical hashing verification and NULL fail-closed behavior', () => {
  const nullResult = verifyRuntimeCheckpointRestoration({ restoration_id: 'null', evidence_only: true, original: null, restored: null })
  assert.equal(nullResult.classification, 'NULL')

  const result = run()
  const expectedHash = sha256Hex(canonicalize({
    classification: 'RESTORATION_EQUIVALENT',
    original: snap(),
    restored: snap(),
    distributed_views: [snap({ checkpoint_id: 'chk-2' })],
    inventories: {
      restorationEquivalence: [
        'checkpoint_equivalent',
        'replay_equivalent',
        'lineage_equivalent',
        'proof_equivalent',
        'topology_equivalent',
        'reconciliation_equivalent',
        'temporal_equivalent',
        'semantic_equivalent',
      ],
      checkpointMismatch: [],
      replayDivergence: [],
      lineageDivergence: [],
      proofMismatch: [],
      topologyDrift: [],
      reconciliationMismatch: [],
      temporalDivergence: [],
      semanticDivergence: [],
      distributedFragmentation: [],
    },
  }))
  assert.equal(result.restoration_hash, expectedHash)
})
