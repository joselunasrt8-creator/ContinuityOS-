import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { mapRuntimeTopologyIntelligence } from '../src/runtime-topology-intelligence.ts'

const baseSurfaces = [
  { surface_id: 'session', route: '/session', method: 'POST', capability_flags: ['MUTATION_CAPABLE', 'CONTINUITY_BOUND'] },
  { surface_id: 'authority', route: '/authority', method: 'POST', capability_flags: ['AUTHORITY_CAPABLE', 'MUTATION_CAPABLE'] },
  { surface_id: 'compile', route: '/compile', method: 'POST', capability_flags: ['RECONCILIATION_DEPENDENT'] },
  { surface_id: 'validate', route: '/validate', method: 'POST', capability_flags: ['VALIDATION_BOUND', 'CAUSALLY_ORDERED'] },
  { surface_id: 'execute', route: '/execute', method: 'POST', capability_flags: ['MUTATION_CAPABLE', 'REPLAY_BOUND'] },
  { surface_id: 'proof', route: '/proof', method: 'POST', capability_flags: ['PROOF_GENERATING'] },
  { surface_id: 'obs', route: '/telemetry', method: 'GET', capability_flags: ['OBSERVABILITY_ONLY'] },
]

function input(overrides = {}) {
  return {
    topology_id: 'topo-1160',
    evidence_only: true,
    surfaces: baseSurfaces,
    authority_edges: [{ from: 'authority', to: 'compile' }],
    continuity_edges: [{ from: 'session', to: 'authority' }],
    replay_edges: [{ from: 'execute', to: 'proof' }],
    revocation_edges: [{ from: 'authority', to: 'execute' }],
    reconciliation_edges: [{ from: 'compile', to: 'validate' }],
    causal_edges: [{ from: 'validate', to: 'execute' }],
    proof_edges: [{ from: 'execute', to: 'proof' }],
    ...overrides,
  }
}

test('Issue #1160: all topology graphs are emitted deterministically', () => {
  const result = mapRuntimeTopologyIntelligence(input({ surfaces: [...baseSurfaces].reverse() }))
  assert.deepEqual(result.deterministic_surface_order, ['authority', 'compile', 'execute', 'obs', 'proof', 'session', 'validate'])
  assert.deepEqual(result.authority_lineage_graph, ['authority->compile'])
  assert.deepEqual(result.continuity_lineage_graph, ['session->authority'])
  assert.deepEqual(result.replay_dependency_graph, ['execute->proof'])
  assert.deepEqual(result.revocation_dependency_graph, ['authority->execute'])
  assert.deepEqual(result.reconciliation_dependency_graph, ['compile->validate'])
  assert.deepEqual(result.causal_ordering_graph, ['validate->execute'])
  assert.deepEqual(result.proof_continuity_graph, ['execute->proof'])
})

test('Issue #1160: mutation, governance density, observability boundaries', () => {
  const result = mapRuntimeTopologyIntelligence(input())
  assert.deepEqual(result.mutation_surface_inventory, ['authority', 'execute', 'session'])
  assert.equal(result.governance_density_map.authority, 2)
  assert.equal(result.governance_density_map.obs, 0)
  assert.equal(result.observability_boundary_map.obs, true)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
})

test('Issue #1160: hidden and unknown surface classification fixtures', () => {
  const hidden = mapRuntimeTopologyIntelligence(input({ surfaces: [...baseSurfaces, { surface_id: 'shadow', route: '/hidden', method: 'POST', hidden: true }] }))
  assert.equal(hidden.classification, 'TOPOLOGY_DRIFT')
  assert.ok(hidden.topology_drift_inventory.includes('shadow'))

  const unknown = mapRuntimeTopologyIntelligence(input({ surfaces: [...baseSurfaces, { surface_id: 'u1', route: '/u1', method: 'POST', unknown: true }] }))
  assert.equal(unknown.classification, 'TOPOLOGY_DRIFT')
  assert.ok(unknown.topology_drift_inventory.includes('u1'))
})

test('Issue #1160: canonical hashing verification and frozen output', () => {
  const result = mapRuntimeTopologyIntelligence(input())
  const expectedAuthorityHash = sha256Hex(canonicalize(['authority->compile']))
  assert.equal(result.graph_hashes.authority_lineage_graph, expectedAuthorityHash)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.graph_hashes))
})

test('Issue #1160: fail-closed NULL behavior and deterministic no-authority semantics', () => {
  const nullResult = mapRuntimeTopologyIntelligence({ topology_id: 'x', evidence_only: true, surfaces: [] })
  assert.equal(nullResult.classification, 'NULL')
  assert.equal(nullResult.creates_authority, false)
})
