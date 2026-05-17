import { canonicalize, hashCanonical, normalize } from '../../src/canonical.js'
export { canonicalize, hashCanonical }

export const CANONICAL_TRAVERSAL_ORDER = Object.freeze([
  'runtime_routes',
  'observability_surfaces',
  'append_only_registries',
  'mutation_capable_registries',
  'governance_artifacts',
  'reconciliation_registries',
  'recursive_governance_containment',
  'sovereignty_containment',
  'workflow_mutation_surfaces',
  'deploy_mutation_surfaces',
  'execution_surfaces',
  'governance_inventories',
  'schema_maps',
  'workflow_topology',
  'proof_lineage_bindings',
])

export const DRIFT_CLASSIFICATIONS = Object.freeze([
  'TOPOLOGY_VALID',
  'UNDECLARED_RUNTIME_SURFACE',
  'TOPOLOGY_EQUIVALENCE_DRIFT',
  'MUTATION_SURFACE_EXPANSION',
  'GOVERNANCE_SURFACE_DRIFT',
  'OBSERVABILITY_BOUNDARY_DRIFT',
  'EXECUTION_BOUNDARY_DRIFT',
  'REGISTRY_LINEAGE_DRIFT',
  'CONTAINMENT_DIVERGENCE',
  'CANONICAL_ROUTE_DIVERGENCE',
  'RECONCILIATION_AMBIGUITY',
  // compatibility with earlier FATE assertions
  'TOPOLOGY_DRIFT',
  'UNDECLARED_SURFACE',
  'SCHEMA_DIVERGENCE',
  'WORKFLOW_EXPANSION',
  'GOVERNANCE_MISMATCH',
])

export const RUNTIME_TOPOLOGY_HASH_FIELDS = Object.freeze([
  'topology_hash',
  'topology_semantic_hash',
  'topology_boundary_hash',
  'topology_lineage_hash',
  'topology_equivalence_hash',
])

export const MERGE_SIGNALS = Object.freeze([
  'SAFE_TO_MERGE',
  'TOPOLOGY_DRIFT',
  'GOVERNANCE_DIVERGENCE',
  'UNDECLARED_EXECUTION_SURFACE',
  'LEGITIMACY_NULL',
])

function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }

const CANONICAL_EXECUTION_PATH = Object.freeze(['/authority', '/compile', '/validate', '/execute', '/proof'])
const CANONICAL_RUNTIME_ROUTES = Object.freeze(['/session', '/continuity', ...CANONICAL_EXECUTION_PATH])

function asArray(value) { return Array.isArray(value) ? value : [] }
function booleanTrue(value) { return value === true || value === 'true' }
function declaredFalse(value) { return value === false || value === 'false' }

function stableIdentity(record) {
  if (typeof record === 'string') return record
  if (!record || typeof record !== 'object') return canonicalize(record)
  return String(record.route ?? record.path ?? record.id ?? record.node_id ?? record.edge_id ?? record.surface_id ?? record.registry ?? record.registry_name ?? record.artifact ?? record.source_id ?? record.workflow ?? record.name ?? canonicalize(record))
}

function sortRecords(records) {
  return [...records].map(normalize).sort((left, right) => stableIdentity(left).localeCompare(stableIdentity(right)) || canonicalize(left).localeCompare(canonicalize(right)))
}
function routeOf(value) { return typeof value === 'string' ? value : String(value?.route ?? value?.path ?? '') }

function sectionRecords(topology, section) {
  if (!isPlainObject(topology)) return []
  if (Array.isArray(topology[section])) return topology[section]
  if (section === 'runtime_routes' && topology.runtime_graph?.nodes) return topology.runtime_graph.nodes
  if (section === 'execution_surfaces' && topology.execution_surface_inventory?.surfaces) return topology.execution_surface_inventory.surfaces
  if (section === 'observability_surfaces' && topology.observability_surface_inventory?.surfaces) return topology.observability_surface_inventory.surfaces
  if (section === 'schema_maps' && topology.schema_source_map?.sources) return topology.schema_source_map.sources
  if (section === 'governance_inventories' && topology.governance_policy_map?.policies) return topology.governance_policy_map.policies
  return []
}

export function enumerateRuntimeTopology(topology) {
  const nodes = []
  const edges = []
  for (const section of CANONICAL_TRAVERSAL_ORDER) {
    for (const object of sortRecords(sectionRecords(topology, section))) {
      const node = Object.freeze({
        object_type: 'RuntimeTopologyNode',
        node_id: hashCanonical({ section, identity: stableIdentity(object), object }),
        section,
        identity: stableIdentity(object),
        object,
        executable: Boolean(object?.executable ?? false),
        deployment_capable: Boolean(object?.deployment_capable ?? object?.deploy_capable ?? false),
        creates_authority: Boolean(object?.creates_authority ?? false),
        mutation_capable: Boolean(object?.mutation_capable ?? false),
      })
      nodes.push(node)
      const route = routeOf(object)
      if (route) edges.push(Object.freeze({ object_type: 'RuntimeTopologyEdge', edge_id: hashCanonical({ section, node_id: node.node_id, route }), from: section, to: route, relation: 'DECLARES_SURFACE' }))
    }
  }
  return Object.freeze({ nodes: Object.freeze(nodes.sort((a, b) => a.node_id.localeCompare(b.node_id))), edges: Object.freeze(edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id))) })
}

export function traverseTopology(topology, options = {}) {
  const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 256
  const traversal = []
  for (const section of CANONICAL_TRAVERSAL_ORDER) {
    const records = sortRecords(sectionRecords(topology, section))
    for (let index = 0; index < records.length; index += 1) {
      if (traversal.length >= maxNodes) return Object.freeze({ traversal, traversal_hash: hashCanonical(traversal), bounded: true, max_nodes: maxNodes, truncated: true, replay_neutral: true })
      traversal.push(Object.freeze({ section, index, identity: stableIdentity(records[index]), object: records[index] }))
    }
  }
  return Object.freeze({ traversal, traversal_hash: hashCanonical(traversal), bounded: true, max_nodes: maxNodes, truncated: false, replay_neutral: true })
}

export function topologyHashes(topology, traversalResult = traverseTopology(topology)) {
  const runtime = { runtime_routes: sortRecords(sectionRecords(topology, 'runtime_routes')), execution_surfaces: sortRecords(sectionRecords(topology, 'execution_surfaces')), observability_surfaces: sortRecords(sectionRecords(topology, 'observability_surfaces')) }
  const semantic = { governance_artifacts: sortRecords(sectionRecords(topology, 'governance_artifacts')), governance_inventories: sortRecords(sectionRecords(topology, 'governance_inventories')), schema_maps: sortRecords(sectionRecords(topology, 'schema_maps')) }
  const boundary = { execution_surfaces: runtime.execution_surfaces, observability_surfaces: runtime.observability_surfaces, workflow_mutation_surfaces: sortRecords(sectionRecords(topology, 'workflow_mutation_surfaces')), deploy_mutation_surfaces: sortRecords(sectionRecords(topology, 'deploy_mutation_surfaces')) }
  const lineage = { append_only_registries: sortRecords(sectionRecords(topology, 'append_only_registries')), reconciliation_registries: sortRecords(sectionRecords(topology, 'reconciliation_registries')), proof_lineage_bindings: sortRecords(sectionRecords(topology, 'proof_lineage_bindings')), topology_ancestry: normalize(topology?.topology_ancestry ?? []) }
  const containment = { recursive_governance_containment: sortRecords(sectionRecords(topology, 'recursive_governance_containment')), sovereignty_containment: sortRecords(sectionRecords(topology, 'sovereignty_containment')) }
  const topology_hash = hashCanonical(runtime)
  const topology_semantic_hash = hashCanonical(semantic)
  const topology_boundary_hash = hashCanonical(boundary)
  const topology_lineage_hash = hashCanonical(lineage)
  const topology_equivalence_hash = hashCanonical({ topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash, containment_hash: hashCanonical(containment), traversal_hash: traversalResult.traversal_hash })
  return Object.freeze({
    topology_hash,
    topology_semantic_hash,
    topology_boundary_hash,
    topology_lineage_hash,
    topology_equivalence_hash,
    // compatibility aliases
    governance_hash: topology_semantic_hash,
    workflow_hash: hashCanonical({ workflow_topology: sortRecords(sectionRecords(topology, 'workflow_topology')), workflow_mutation_surfaces: boundary.workflow_mutation_surfaces }),
    schema_hash: hashCanonical({ schema_maps: semantic.schema_maps }),
    reconciliation_hash: hashCanonical({ topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash, topology_equivalence_hash }),
  })
}

export function buildRuntimeTopologySnapshot(topology, options = {}) {
  const traversal = traverseTopology(topology, options)
  const inventory = enumerateRuntimeTopology(topology)
  const hashes = topologyHashes(topology, traversal)
  return Object.freeze({ object_type: 'RuntimeTopologySnapshot', nodes: inventory.nodes, edges: inventory.edges, traversal_hash: traversal.traversal_hash, ...hashes, replay_neutral: true, executable: false, deployment_capable: false, creates_authority: false })
}

export function validateTopologyEquivalence(validatedTopology, executedTopology) {
  if (!isPlainObject(validatedTopology) || !isPlainObject(executedTopology)) return Object.freeze({ object_type: 'RuntimeTopologyEquivalence', equivalent: false, legitimacy: 'NULL', drift_class: 'RECONCILIATION_AMBIGUITY', fail_closed: true })
  const validated = topologyHashes(validatedTopology)
  const executed = topologyHashes(executedTopology)
  const mismatches = RUNTIME_TOPOLOGY_HASH_FIELDS.filter((field) => validated[field] !== executed[field])
  return Object.freeze({ object_type: 'RuntimeTopologyEquivalence', validated, executed, equivalent: mismatches.length === 0, mismatches, drift_class: mismatches.length ? 'TOPOLOGY_EQUIVALENCE_DRIFT' : 'TOPOLOGY_VALID', legitimacy: mismatches.length ? 'NULL' : 'UNCHANGED', evidence_only: true, creates_authority: false, executable: false, deployment_capable: false, fail_closed: mismatches.length > 0 })
}

export function classifyTopologyDrift(topology, hashes = topologyHashes(topology), traversalResult = traverseTopology(topology)) {
  const drift = []
  if (!isPlainObject(topology) || sectionRecords(topology, 'runtime_routes').length === 0) drift.push({ classification: 'RECONCILIATION_AMBIGUITY', identity: 'runtime_topology_object', reason: 'valid_topology_object_missing' })
  const runtimeRoutes = sortRecords(sectionRecords(topology, 'runtime_routes'))
  const runtimeRouteSet = new Set(runtimeRoutes.map(routeOf).filter(Boolean))
  const executionSurfaces = sortRecords(sectionRecords(topology, 'execution_surfaces'))
  const observabilitySurfaces = sortRecords(sectionRecords(topology, 'observability_surfaces'))
  const schemaMaps = sortRecords(sectionRecords(topology, 'schema_maps'))
  const governanceInventories = sortRecords(sectionRecords(topology, 'governance_inventories'))
  const workflowTopology = sortRecords(sectionRecords(topology, 'workflow_topology'))
  for (const surface of executionSurfaces) {
    const route = routeOf(surface)
    if (declaredFalse(surface.declared) || declaredFalse(surface.classified) || booleanTrue(surface.hidden) || (route && !runtimeRouteSet.has(route) && !CANONICAL_RUNTIME_ROUTES.includes(route))) drift.push({ classification: 'UNDECLARED_RUNTIME_SURFACE', identity: stableIdentity(surface), reason: 'execution_surface_not_declared_in_runtime_topology' })
    if (booleanTrue(surface.mutation_capable) || booleanTrue(surface.deployment_capable) || booleanTrue(surface.creates_authority)) drift.push({ classification: 'MUTATION_SURFACE_EXPANSION', identity: stableIdentity(surface), reason: 'execution_surface_mutation_expansion' })
  }
  for (const route of runtimeRoutes) {
    const routePath = routeOf(route)
    if (routePath && !CANONICAL_RUNTIME_ROUTES.includes(routePath) && booleanTrue(route.executable)) drift.push({ classification: 'CANONICAL_ROUTE_DIVERGENCE', identity: stableIdentity(route), reason: 'hidden_route_expansion' })
    if (booleanTrue(route.executable) && !CANONICAL_RUNTIME_ROUTES.includes(routePath)) drift.push({ classification: 'EXECUTION_BOUNDARY_DRIFT', identity: stableIdentity(route), reason: 'execution_boundary_expanded' })
  }
  for (const mapping of schemaMaps) {
    const boundRoute = String(mapping.route ?? mapping.bound_route ?? '')
    if (declaredFalse(mapping.declared) || booleanTrue(mapping.orphaned) || (boundRoute && !runtimeRouteSet.has(boundRoute))) drift.push({ classification: 'REGISTRY_LINEAGE_DRIFT', identity: stableIdentity(mapping), reason: 'orphaned_schema_mapping' })
  }
  for (const inventory of governanceInventories) {
    const requiredRoutes = asArray(inventory.required_routes ?? inventory.canonical_execution_path)
    if (declaredFalse(inventory.current) || String(inventory.status ?? '').toUpperCase() === 'STALE') drift.push({ classification: 'GOVERNANCE_SURFACE_DRIFT', identity: stableIdentity(inventory), reason: 'stale_governance_inventory' })
    for (const route of requiredRoutes) if (!runtimeRouteSet.has(String(route))) drift.push({ classification: 'GOVERNANCE_SURFACE_DRIFT', identity: stableIdentity(inventory), reason: `governance_runtime_divergence:${route}` })
  }
  for (const workflow of [...workflowTopology, ...sortRecords(sectionRecords(topology, 'workflow_mutation_surfaces')), ...sortRecords(sectionRecords(topology, 'deploy_mutation_surfaces'))]) {
    if (declaredFalse(workflow.declared) || booleanTrue(workflow.hidden) || booleanTrue(workflow.expands_execution) || booleanTrue(workflow.execution_route_created) || booleanTrue(workflow.mutation_capable)) drift.push({ classification: 'MUTATION_SURFACE_EXPANSION', identity: stableIdentity(workflow), reason: 'hidden_workflow_or_deploy_expansion' })
  }
  for (const surface of observabilitySurfaces) {
    if (booleanTrue(surface.executable) || booleanTrue(surface.mutation_capable) || booleanTrue(surface.creates_authority) || booleanTrue(surface.deployment_capable)) drift.push({ classification: 'OBSERVABILITY_BOUNDARY_DRIFT', identity: stableIdentity(surface), reason: 'observability_surface_mismatch' })
  }
  for (const record of [...sortRecords(sectionRecords(topology, 'append_only_registries')), ...sortRecords(sectionRecords(topology, 'reconciliation_registries'))]) {
    if (declaredFalse(record.append_only) || booleanTrue(record.update_allowed) || booleanTrue(record.delete_allowed)) drift.push({ classification: 'REGISTRY_LINEAGE_DRIFT', identity: stableIdentity(record), reason: 'append_only_registry_lineage_mutable' })
  }
  for (const record of [...sortRecords(sectionRecords(topology, 'recursive_governance_containment')), ...sortRecords(sectionRecords(topology, 'sovereignty_containment'))]) {
    if (declaredFalse(record.contained) || booleanTrue(record.divergent) || booleanTrue(record.boundary_overflow)) drift.push({ classification: 'CONTAINMENT_DIVERGENCE', identity: stableIdentity(record), reason: 'containment_inventory_divergence' })
  }
  const expected = topology?.expected_hashes
  if (isPlainObject(expected)) for (const key of RUNTIME_TOPOLOGY_HASH_FIELDS) if (expected[key] && expected[key] !== hashes[key]) drift.push({ classification: 'TOPOLOGY_EQUIVALENCE_DRIFT', identity: key, reason: 'topology_hash_mismatch' })
  if (traversalResult.truncated) drift.push({ classification: 'RECONCILIATION_AMBIGUITY', identity: 'bounded_traversal', reason: 'bounded_reconciliation_traversal_exceeded' })

  const drift_classes = [...new Set(drift.map((entry) => entry.classification))]
  const priority = ['RECONCILIATION_AMBIGUITY', 'UNDECLARED_RUNTIME_SURFACE', 'TOPOLOGY_EQUIVALENCE_DRIFT', 'MUTATION_SURFACE_EXPANSION', 'GOVERNANCE_SURFACE_DRIFT', 'OBSERVABILITY_BOUNDARY_DRIFT', 'EXECUTION_BOUNDARY_DRIFT', 'REGISTRY_LINEAGE_DRIFT', 'CONTAINMENT_DIVERGENCE', 'CANONICAL_ROUTE_DIVERGENCE']
  const classification = priority.find((item) => drift_classes.includes(item)) ?? 'TOPOLOGY_VALID'
  return Object.freeze({ object_type: 'RuntimeTopologyDrift', classification, drift_classes: drift_classes.length ? drift_classes : ['TOPOLOGY_VALID'], drift, fail_closed: classification !== 'TOPOLOGY_VALID', legitimacy: classification === 'TOPOLOGY_VALID' ? 'UNCHANGED' : 'NULL', evidence_only: true, mutation_capable: false, replay_neutral: true })
}

export function mergeLegitimacySignal(classification) {
  if (classification === 'TOPOLOGY_VALID') return 'SAFE_TO_MERGE'
  if (classification === 'UNDECLARED_RUNTIME_SURFACE' || classification === 'UNDECLARED_SURFACE') return 'UNDECLARED_EXECUTION_SURFACE'
  if (classification === 'GOVERNANCE_SURFACE_DRIFT' || classification === 'GOVERNANCE_MISMATCH') return 'GOVERNANCE_DIVERGENCE'
  return 'TOPOLOGY_DRIFT'
}

export function buildReconciliationEvidenceEnvelope(topology, options = {}) {
  const generated_at = options.generated_at ?? new Date(0).toISOString()
  const traversalResult = traverseTopology(topology, options)
  const hashes = topologyHashes(topology, traversalResult)
  const classification = classifyTopologyDrift(topology, hashes, traversalResult)
  const ancestry = normalize(topology?.topology_ancestry ?? [])
  const snapshot = buildRuntimeTopologySnapshot(topology, options)
  const stableEnvelopeMaterial = { object_type: 'RuntimeTopologyReconciliationEvidence', topology_hashes: hashes, traversal_hash: traversalResult.traversal_hash, drift_classes: classification.drift_classes, drift_summary: classification.drift, topology_ancestry: ancestry, merge_signal: mergeLegitimacySignal(classification.classification), evidence_only: true, remote_authority_denied: true, replay_neutral: true, mutation_capable: false, executable: false, deployment_capable: false, creates_authority: false }
  const reconciliation_id = hashCanonical(stableEnvelopeMaterial)
  return Object.freeze({ ...stableEnvelopeMaterial, reconciliation_id, reconciliation_timestamp: generated_at, snapshot, traversal_lineage: traversalResult.traversal, traversal_bounded: traversalResult.bounded, traversal_truncated: traversalResult.truncated, classification: classification.classification, fail_closed: classification.fail_closed, legitimacy: classification.legitimacy, read_only: true, creates_authority: false, executable: false, deployment_capable: false, execution_started: false })
}

export function reconcileTopology(topology, options = {}) { return buildReconciliationEvidenceEnvelope(topology, options) }
