import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildRuntimeTopologySnapshot,
  classifyTopologyDrift,
  enumerateRuntimeTopology,
  hashCanonical,
  reconcileTopology,
  topologyHashes,
  validateTopologyEquivalence,
} from '../../runtime/reconciliation/topology-reconciliation-engine.js'

const canonicalRoutes = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']

function topology() {
  return {
    runtime_routes: canonicalRoutes.map((route, index) => ({ route, id: route.slice(1), lifecycle_index: index, declared: true, executable: false })),
    observability_surfaces: [
      { id: 'topology_reconcile', route: '/topology/reconcile', executable: false, mutation_capable: false, deployment_capable: false, creates_authority: false },
      { id: 'topology_drift', route: '/topology/drift', executable: false, mutation_capable: false, deployment_capable: false, creates_authority: false },
    ],
    append_only_registries: [
      { registry: 'runtime_topology_registry', append_only: true, update_allowed: false, delete_allowed: false },
      { registry: 'topology_reconciliation_registry', append_only: true, update_allowed: false, delete_allowed: false },
    ],
    mutation_capable_registries: [
      { registry: 'authority_registry', declared: true, canonical_path_bound: true },
    ],
    governance_artifacts: [
      { artifact: 'governance/runtime-topology-equivalence.json', machine_readable: true },
      { artifact: 'governance/runtime-topology-drift-taxonomy.json', machine_readable: true },
      { artifact: 'governance/runtime-topology-reconciliation.json', machine_readable: true },
    ],
    reconciliation_registries: [
      { registry: 'runtime_topology_registry', append_only: true, update_allowed: false, delete_allowed: false },
    ],
    recursive_governance_containment: [
      { registry: 'recursive_governance_containment_registry', contained: true },
    ],
    sovereignty_containment: [
      { registry: 'root_authority_observability_registry', contained: true },
    ],
    workflow_mutation_surfaces: [
      { workflow: 'governed-deploy.yml', declared: true, expands_execution: false, mutation_capable: false },
    ],
    deploy_mutation_surfaces: [
      { adapter: 'wrangler:governed-workflow-only', declared: true, direct_deploy_allowed: false, mutation_capable: false },
    ],
    execution_surfaces: canonicalRoutes.map((route) => ({ id: route.slice(1), route, declared: true, classified: true, hidden: false, mutation_capable: false })),
    governance_inventories: [{ id: 'canonical_governance', current: true, status: 'CURRENT', required_routes: canonicalRoutes }],
    schema_maps: canonicalRoutes.map((route) => ({ source_id: `${route.slice(1)}_schema`, route, declared: true, orphaned: false })),
    workflow_topology: [{ id: 'governed_deploy', workflow: 'governed-deploy.yml', declared: true, hidden: false, expands_execution: false }],
    proof_lineage_bindings: [{ id: 'proof_lineage', route: '/proof', hash_bound: true, append_only: true }],
    topology_ancestry: ['runtime/topology/topology_manifest.json'],
  }
}

test('runtime topology hash fields are deterministic and exact-object stable', () => {
  const first = topologyHashes(topology())
  const shuffled = topology()
  shuffled.append_only_registries.reverse()
  shuffled.runtime_routes.reverse()
  assert.deepEqual(topologyHashes(shuffled), first)
  for (const field of ['topology_hash', 'topology_semantic_hash', 'topology_boundary_hash', 'topology_lineage_hash', 'topology_equivalence_hash']) assert.match(first[field], /^[0-9a-f]{64}$/)
})

test('runtime topology snapshot enumerates nodes and edges without authority', () => {
  const snapshot = buildRuntimeTopologySnapshot(topology())
  const inventory = enumerateRuntimeTopology(topology())
  assert.equal(snapshot.object_type, 'RuntimeTopologySnapshot')
  assert.ok(inventory.nodes.length > 0)
  assert.equal(snapshot.executable, false)
  assert.equal(snapshot.deployment_capable, false)
  assert.equal(snapshot.creates_authority, false)
})

test('topology equivalence compares validated and executed topology', () => {
  const equivalent = validateTopologyEquivalence(topology(), topology())
  assert.equal(equivalent.equivalent, true)
  const drifted = topology()
  drifted.execution_surfaces.push({ id: 'shadow', route: '/shadow', declared: false, classified: false, hidden: true })
  const result = validateTopologyEquivalence(topology(), drifted)
  assert.equal(result.equivalent, false)
  assert.equal(result.drift_class, 'TOPOLOGY_EQUIVALENCE_DRIFT')
  assert.equal(result.legitimacy, 'NULL')
})

test('fail-closed drift taxonomy covers undeclared, mutation, containment, lineage, route, and ambiguity', () => {
  const undeclared = topology(); undeclared.execution_surfaces.push({ id: 'shadow', route: '/shadow', declared: false, classified: false, hidden: true })
  assert.equal(classifyTopologyDrift(undeclared).classification, 'UNDECLARED_RUNTIME_SURFACE')
  const mutation = topology(); mutation.workflow_mutation_surfaces.push({ workflow: 'shadow.yml', declared: false, expands_execution: true })
  assert.equal(classifyTopologyDrift(mutation).classification, 'MUTATION_SURFACE_EXPANSION')
  const containment = topology(); containment.recursive_governance_containment = [{ registry: 'recursive_governance_containment_registry', divergent: true }]
  assert.equal(classifyTopologyDrift(containment).classification, 'CONTAINMENT_DIVERGENCE')
  const lineage = topology(); lineage.append_only_registries = [{ registry: 'runtime_topology_registry', append_only: false, update_allowed: true }]
  assert.equal(classifyTopologyDrift(lineage).classification, 'REGISTRY_LINEAGE_DRIFT')
  const route = topology(); route.runtime_routes.push({ route: '/shadow/execute', executable: true, declared: false })
  assert.equal(classifyTopologyDrift(route).classification, 'EXECUTION_BOUNDARY_DRIFT')
  assert.equal(classifyTopologyDrift({}).classification, 'RECONCILIATION_AMBIGUITY')
})

test('reconciliation evidence is replay-neutral, observability-only, and hash stable', () => {
  const first = reconcileTopology(topology(), { generated_at: '2026-05-14T00:00:00.000Z' })
  const second = reconcileTopology(topology(), { generated_at: '2026-05-15T00:00:00.000Z' })
  assert.equal(first.reconciliation_id, second.reconciliation_id)
  assert.equal(first.replay_neutral, true)
  assert.equal(first.executable, false)
  assert.equal(first.deployment_capable, false)
  assert.equal(first.creates_authority, false)
  assert.notEqual(hashCanonical(first), hashCanonical(second))
})

test('registry schema, GET-only routes, and governance artifacts are present', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../migrations/0038_runtime_topology_registry.sql', import.meta.url), 'utf8')
  assert.match(source, /GET"\)/)
  for (const route of ['/topology/reconcile', '/topology/drift', '/topology/fingerprint', '/topology/equivalence']) assert.match(source, new RegExp(route.replaceAll('/', '\\/')))
  assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_topology_registry/)
  assert.match(migration, /trg_runtime_topology_registry_no_update/)
  assert.match(migration, /trg_runtime_topology_registry_no_delete/)
  for (const artifact of ['runtime-topology-equivalence.json', 'runtime-topology-drift-taxonomy.json', 'runtime-topology-reconciliation.json']) {
    const parsed = JSON.parse(readFileSync(new URL(`../../governance/${artifact}`, import.meta.url), 'utf8'))
    assert.ok(parsed.artifact)
  }
})
