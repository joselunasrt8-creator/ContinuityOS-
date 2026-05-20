import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTraversalHash } from '../../src/reconciliation/traversal-hash.ts'

const baseNodes = [
  ['session_registry', 'sess-1', null, null],
  ['continuity_registry', 'cont-1', 'session_registry', 'sess-1'],
  ['authority_registry', 'auth-1', 'continuity_registry', 'cont-1'],
  ['aeo_registry', 'aeo-1', 'authority_registry', 'auth-1'],
  ['validation_registry', 'val-1', 'aeo_registry', 'aeo-1'],
  ['execution_registry', 'exec-1', 'validation_registry', 'val-1'],
  ['proof_registry', 'proof-1', 'execution_registry', 'exec-1']
].map(([registry, id, parent_registry, parent_id]) => ({
  registry, id, parent_registry, parent_id, lineage_root: 'root-1', payload: { id }
}))

function request(registries) {
  return {
    reconciliation_id: 'recon-1',
    lineage_root: 'root-1',
    created_at: '2026-05-19T00:00:00.000Z',
    registries
  }
}

test('identical lineage gives identical hash', () => {
  const first = computeTraversalHash(request(baseNodes))
  const second = computeTraversalHash(request(baseNodes))
  assert.equal(first.traversal_status, 'CANONICAL')
  assert.equal(first.canonical_traversal_hash, second.canonical_traversal_hash)
})

test('reordered equivalent traversal gives identical hash', () => {
  const reordered = [...baseNodes].reverse()
  const first = computeTraversalHash(request(baseNodes))
  const second = computeTraversalHash(request(reordered))
  assert.equal(first.canonical_traversal_hash, second.canonical_traversal_hash)
})

test('changed lineage changes hash', () => {
  const changed = baseNodes.map((node) => node.registry === 'validation_registry'
    ? { ...node, payload: { id: node.id, decision: 'changed' } }
    : node)

  const first = computeTraversalHash(request(baseNodes))
  const second = computeTraversalHash(request(changed))
  assert.notEqual(first.canonical_traversal_hash, second.canonical_traversal_hash)
})

test('orphan proof lineage returns NULL / ORPHANED', () => {
  const orphan = baseNodes.map((node) => node.registry === 'proof_registry'
    ? { ...node, parent_id: 'missing-exec' }
    : node)
  const result = computeTraversalHash(request(orphan))
  assert.equal(result.traversal_status, 'NULL')
  assert.equal(result.drift_classification, 'ORPHANED')
  assert.equal(result.canonical_traversal_hash, null)
})

test('traversal loop returns NULL / LOOP_DETECTED', () => {
  const loop = baseNodes.map((node) => node.registry === 'session_registry'
    ? { ...node, parent_registry: 'session_registry', parent_id: 'sess-1' }
    : node)
  const result = computeTraversalHash(request(loop))
  assert.equal(result.traversal_status, 'NULL')
  assert.equal(result.drift_classification, 'LOOP_DETECTED')
})

test('max recursion depth returns NULL / DEPTH_EXCEEDED', () => {
  const result = computeTraversalHash({ ...request(baseNodes), max_depth: 2 })
  assert.equal(result.traversal_status, 'NULL')
  assert.equal(result.drift_classification, 'DEPTH_EXCEEDED')
})

test('function performs no writes', () => {
  const readOnly = Object.freeze(baseNodes.map((node) => Object.freeze({ ...node, payload: Object.freeze({ ...node.payload }) })))
  const before = JSON.stringify(readOnly)
  const result = computeTraversalHash(request(readOnly))
  const after = JSON.stringify(readOnly)
  assert.equal(result.traversal_status, 'CANONICAL')
  assert.equal(before, after)
})


test('historical append-only lineage does not fail closed by default depth budget', () => {
  const historical = [
    ...baseNodes,
    { ...baseNodes[0], id: 'sess-0', payload: { id: 'sess-0', epoch: 'historical' } },
    { ...baseNodes[1], id: 'cont-0', parent_id: 'sess-0', payload: { id: 'cont-0', epoch: 'historical' } },
    { ...baseNodes[2], id: 'auth-0', parent_id: 'cont-0', payload: { id: 'auth-0', epoch: 'historical' } },
    { ...baseNodes[3], id: 'aeo-0', parent_id: 'auth-0', payload: { id: 'aeo-0', epoch: 'historical' } },
    { ...baseNodes[4], id: 'val-0', parent_id: 'aeo-0', payload: { id: 'val-0', epoch: 'historical' } },
    { ...baseNodes[5], id: 'exec-0', parent_id: 'val-0', payload: { id: 'exec-0', epoch: 'historical' } },
    { ...baseNodes[6], id: 'proof-0', parent_id: 'exec-0', payload: { id: 'proof-0', epoch: 'historical' } }
  ]

  const result = computeTraversalHash(request(historical))
  assert.equal(result.traversal_status, 'CANONICAL')
  assert.equal(result.drift_classification, 'NONE')
  assert.ok(result.canonical_traversal_hash)
})
