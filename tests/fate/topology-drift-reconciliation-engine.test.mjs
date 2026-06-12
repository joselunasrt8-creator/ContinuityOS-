import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANONICAL_TRAVERSAL_ORDER,
  buildReconciliationEvidenceEnvelope,
  classifyTopologyDrift,
  hashCanonical,
  mergeLegitimacySignal,
  reconcileTopology,
  topologyHashes,
  traverseTopology,
} from '../../runtime/reconciliation/topology-reconciliation-engine.js'

const canonicalRoutes = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']

function validTopology() {
  return {
    runtime_routes: canonicalRoutes.map((route, index) => ({ route, id: route.slice(1), lifecycle_index: index, declared: true, executable: false })),
    execution_surfaces: canonicalRoutes.map((route) => ({ id: route.slice(1), route, declared: true, classified: true, hidden: false })),
    observability_surfaces: [
      { id: 'telemetry_events', executable: false, mutation_capable: false, creates_authority: false },
      { id: 'topology_manifest', executable: false, mutation_capable: false, creates_authority: false },
    ],
    governance_inventories: [
      { id: 'canonical_governance', current: true, status: 'CURRENT', required_routes: canonicalRoutes },
    ],
    schema_maps: canonicalRoutes.map((route) => ({ source_id: `${route.slice(1)}_schema`, route, declared: true, orphaned: false })),
    workflow_topology: [
      { id: 'governed_deploy', workflow: 'governed-deploy.yml', declared: true, hidden: false, expands_execution: false },
    ],
    proof_lineage_bindings: [
      { id: 'proof_lineage', route: '/proof', hash_bound: true, append_only: true },
    ],
    topology_ancestry: ['runtime/topology/topology_manifest.json'],
  }
}

function shuffledTopology() {
  const topology = validTopology()
  return {
    ...topology,
    runtime_routes: [...topology.runtime_routes].reverse(),
    execution_surfaces: [...topology.execution_surfaces].reverse(),
    schema_maps: [...topology.schema_maps].reverse(),
    observability_surfaces: [...topology.observability_surfaces].reverse(),
  }
}

test('topology traversal is deterministic and uses canonical bounded ordering', () => {
  assert.deepEqual(CANONICAL_TRAVERSAL_ORDER.slice(0, 10), ['runtime_routes', 'observability_surfaces', 'append_only_registries', 'mutation_capable_registries', 'governance_artifacts', 'reconciliation_registries', 'recursive_governance_containment', 'sovereignty_containment', 'workflow_mutation_surfaces', 'deploy_mutation_surfaces'])
  const first = traverseTopology(validTopology(), { maxNodes: 64 })
  const second = traverseTopology(shuffledTopology(), { maxNodes: 64 })
  assert.equal(first.traversal_hash, second.traversal_hash)
  assert.deepEqual(first.traversal.map((entry) => entry.section), second.traversal.map((entry) => entry.section))
})

test('topology hashes are deterministic for equivalent exact objects', () => {
  const first = topologyHashes(validTopology())
  const second = topologyHashes(shuffledTopology())
  assert.deepEqual(first, second)
  for (const key of ['topology_hash', 'topology_semantic_hash', 'topology_boundary_hash', 'topology_lineage_hash', 'topology_equivalence_hash']) {
    assert.match(first[key], /^[0-9a-f]{64}$/)
  }
})

test('undeclared execution surfaces fail closed and map to merge legitimacy signal', () => {
  const topology = validTopology()
  topology.execution_surfaces.push({ id: 'shadow_execute', route: '/shadow/execute', declared: false, classified: false, hidden: true })
  const evidence = reconcileTopology(topology, { generated_at: '2026-05-14T00:00:00.000Z' })
  assert.equal(evidence.classification, 'UNDECLARED_RUNTIME_SURFACE')
  assert.equal(evidence.fail_closed, true)
  assert.equal(evidence.merge_signal, 'UNDECLARED_EXECUTION_SURFACE')
  assert.equal(mergeLegitimacySignal(evidence.classification), 'UNDECLARED_EXECUTION_SURFACE')
})

test('governance/runtime divergence is detected deterministically', () => {
  const topology = validTopology()
  topology.governance_inventories = [{ id: 'canonical_governance', current: true, status: 'CURRENT', required_routes: [...canonicalRoutes, '/undeclared-governance-route'] }]
  const first = classifyTopologyDrift(topology)
  const second = classifyTopologyDrift(structuredClone(topology))
  assert.equal(first.classification, 'GOVERNANCE_SURFACE_DRIFT')
  assert.deepEqual(first, second)
  assert.equal(mergeLegitimacySignal(first.classification), 'GOVERNANCE_DIVERGENCE')
})

test('reconciliation evidence remains replay-neutral and stable for the same topology', () => {
  const first = reconcileTopology(validTopology(), { generated_at: '2026-05-14T00:00:00.000Z' })
  const second = reconcileTopology(shuffledTopology(), { generated_at: '2026-05-15T00:00:00.000Z' })
  assert.equal(first.reconciliation_id, second.reconciliation_id)
  assert.equal(first.evidence_only, true)
  assert.equal(first.remote_authority_denied, true)
  assert.equal(first.replay_neutral, true)
  assert.equal(first.mutation_capable, false)
  assert.equal(first.creates_authority, false)
  assert.equal(first.execution_started, false)
})

test('append-only reconciliation evidence registry is persisted without mutation authority', () => {
  const migration = readFileSync(new URL('../../migrations/0033_topology_reconciliation_registry.sql', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS topology_reconciliation_registry/)
  assert.match(migration, /trg_topology_reconciliation_registry_no_update/)
  assert.match(migration, /trg_topology_reconciliation_registry_no_delete/)
  assert.match(source, /topology_reconciliation_registry: \["reconciliation_id"/)
  assert.match(source, /evidence_only TEXT NOT NULL CHECK \(evidence_only='true'\)/)
  assert.match(source, /mutation_capable TEXT NOT NULL CHECK \(mutation_capable='false'\)/)
})

test('drift propagation uses regenerated topology evidence instead of stale append-only ordering', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /ORDER BY reconciliation_hash ASC LIMIT 1/)
  assert.match(source, /latestTopologyReconciliationEvidence[\s\S]*buildRuntimeTopologyReconciliationEnvelope\(new Date\(0\)\.toISOString\(\), TOPOLOGY_CTX\)/)
  assert.match(source, /regenerated_topology_reconciliation_dominates_stale_registry_evidence/)
})

test('bounded reconciliation traversal truncates evidence without executing or mutating', () => {
  const topology = validTopology()
  topology.schema_maps = Array.from({ length: 300 }, (_, index) => ({ source_id: `schema_${index.toString().padStart(3, '0')}`, route: '/proof', declared: true }))
  const evidence = buildReconciliationEvidenceEnvelope(topology, { maxNodes: 10, generated_at: '2026-05-14T00:00:00.000Z' })
  assert.equal(evidence.traversal_bounded, true)
  assert.equal(evidence.traversal_truncated, true)
  assert.ok(evidence.traversal_lineage.length <= 10)
  assert.equal(evidence.mutation_capable, false)
  assert.equal(evidence.execution_started, false)
})

test('hidden workflow expansion is classified without granting merge authority', () => {
  const topology = validTopology()
  topology.workflow_topology.push({ id: 'manual_shadow_deploy', workflow: 'shadow-deploy.yml', declared: false, hidden: true, expands_execution: true })
  const evidence = reconcileTopology(topology, { generated_at: '2026-05-14T00:00:00.000Z' })
  assert.equal(evidence.classification, 'MUTATION_SURFACE_EXPANSION')
  assert.equal(evidence.merge_signal, 'TOPOLOGY_DRIFT')
  assert.equal(evidence.read_only, true)
})

test('same topology produces the same reconciliation result and canonical hash material', () => {
  const first = reconcileTopology(validTopology(), { generated_at: '2026-05-14T00:00:00.000Z' })
  const second = reconcileTopology(validTopology(), { generated_at: '2026-05-14T00:00:00.000Z' })
  assert.equal(hashCanonical(first), hashCanonical(second))
  assert.deepEqual(first, second)
  assert.equal(first.classification, 'TOPOLOGY_VALID')
  assert.equal(first.merge_signal, 'SAFE_TO_MERGE')
})
