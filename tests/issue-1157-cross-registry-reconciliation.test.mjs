import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { reconcileCrossRegistryLegitimacy } from '../src/cross-registry-legitimacy-reconciliation.ts'

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

test('Issue #1157: reconciles deterministic equivalent registries', () => {
  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-1',
    evidence_only: true,
    views: [view('b'), view('a')],
  })
  assert.equal(result.classification, 'MATCH')
  assert.deepEqual(result.deterministic_traversal, ['a', 'b'])
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.deterministic_traversal))
})

test('Issue #1157: split-brain classification on registry and lineage divergence', () => {
  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-2',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ lineage_hash: 'l-2' })] })],
  })
  assert.equal(result.classification, 'AMBIGUOUS')
})

test('Issue #1157: stale registry classification on stale lineage and epoch drift', () => {
  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-3',
    evidence_only: true,
    views: [
      view('a', { registry_epoch: 1, entries: [entry({ object_id: 'x', parent_object_id: 'missing' })] }),
      view('b', { registry_epoch: 9 }),
    ],
  })
  assert.equal(result.classification, 'INSUFFICIENT_EVIDENCE')
})

test('Issue #1157: replay and revocation divergence classifications', () => {
  const replay = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-4',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ replay_hash: 'r-2' })] })],
  })
  assert.equal(replay.classification, 'AMBIGUOUS')

  const revocation = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-5',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ revocation_hash: 'v-2' })] })],
  })
  assert.equal(revocation.classification, 'AMBIGUOUS')
})

test('Issue #1157: topology drift and partial visibility classifications', () => {
  const topology = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-6',
    evidence_only: true,
    views: [view('a'), view('b', { entries: [entry({ topology_hash: 't-2' })] })],
  })
  assert.equal(topology.classification, 'AMBIGUOUS')

  const partial = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-7',
    evidence_only: true,
    views: [view('a', { visibility_complete: false }), view('b')],
  })
  assert.equal(partial.classification, 'INSUFFICIENT_EVIDENCE')
})

test('Issue #1157: fail-closed NULL and canonical hashing usage', () => {
  const nullResult = reconcileCrossRegistryLegitimacy({ reconciliation_id: 'r-8', evidence_only: true, views: [] })
  assert.equal(nullResult.classification, 'INSUFFICIENT_EVIDENCE')

  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-9',
    evidence_only: true,
    views: [view('a')],
  })
  const expectedLineage = sha256Hex(canonicalize([['obj-1', null, 'l-1']]))
  assert.equal(result.lineage_hash, expectedLineage)
  assert.equal(result.creates_authority, false)
})

test('Issue #1157: empty equivalent registries remain insufficient evidence', () => {
  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-empty-evidence',
    evidence_only: true,
    views: [view('a', { entries: [] }), view('b', { entries: [] })],
  })
  assert.equal(result.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('empty_registry_evidence'))
})

test('Issue #1157: malformed empty evidence fields remain insufficient evidence', () => {
  const result = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'r-malformed-evidence',
    evidence_only: true,
    views: [view('a', { entries: [entry({ object_id: '' })] }), view('b', { entries: [entry({ object_id: '' })] })],
  })
  assert.equal(result.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('malformed_registry_evidence'))
})
