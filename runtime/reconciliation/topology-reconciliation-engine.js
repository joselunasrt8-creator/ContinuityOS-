import { createHash } from 'node:crypto'

export const CANONICAL_TRAVERSAL_ORDER = Object.freeze([
  'runtime_routes',
  'execution_surfaces',
  'observability_surfaces',
  'governance_inventories',
  'schema_maps',
  'workflow_topology',
  'proof_lineage_bindings',
])

export const DRIFT_CLASSIFICATIONS = Object.freeze([
  'TOPOLOGY_VALID',
  'TOPOLOGY_DRIFT',
  'UNDECLARED_SURFACE',
  'SCHEMA_DIVERGENCE',
  'WORKFLOW_EXPANSION',
  'GOVERNANCE_MISMATCH',
])

export const MERGE_SIGNALS = Object.freeze([
  'SAFE_TO_MERGE',
  'TOPOLOGY_DRIFT',
  'GOVERNANCE_DIVERGENCE',
  'UNDECLARED_EXECUTION_SURFACE',
])

const CANONICAL_EXECUTION_PATH = Object.freeze(['/authority', '/compile', '/validate', '/execute', '/proof'])
const CANONICAL_RUNTIME_ROUTES = Object.freeze(['/session', '/continuity', ...CANONICAL_EXECUTION_PATH])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
  }
  return value
}

export function canonicalize(value) {
  return JSON.stringify(normalize(value))
}

export function hashCanonical(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stableIdentity(record) {
  if (typeof record === 'string') return record
  if (!record || typeof record !== 'object') return canonicalize(record)
  return String(record.route ?? record.path ?? record.id ?? record.surface_id ?? record.source_id ?? record.workflow ?? record.name ?? canonicalize(record))
}

function sortRecords(records) {
  return [...records].map(normalize).sort((left, right) => {
    const byIdentity = stableIdentity(left).localeCompare(stableIdentity(right))
    if (byIdentity !== 0) return byIdentity
    return canonicalize(left).localeCompare(canonicalize(right))
  })
}

function routeOf(value) {
  return typeof value === 'string' ? value : String(value?.route ?? value?.path ?? '')
}

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

export function traverseTopology(topology, options = {}) {
  const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 256
  const traversal = []

  for (const section of CANONICAL_TRAVERSAL_ORDER) {
    const records = sortRecords(sectionRecords(topology, section))
    for (let index = 0; index < records.length; index += 1) {
      if (traversal.length >= maxNodes) {
        return Object.freeze({
          traversal,
          traversal_hash: hashCanonical(traversal),
          bounded: true,
          max_nodes: maxNodes,
          truncated: true,
          replay_neutral: true,
        })
      }
      traversal.push(Object.freeze({ section, index, identity: stableIdentity(records[index]), object: records[index] }))
    }
  }

  return Object.freeze({
    traversal,
    traversal_hash: hashCanonical(traversal),
    bounded: true,
    max_nodes: maxNodes,
    truncated: false,
    replay_neutral: true,
  })
}

export function topologyHashes(topology, traversalResult = traverseTopology(topology)) {
  const runtime = {
    runtime_routes: sortRecords(sectionRecords(topology, 'runtime_routes')),
    execution_surfaces: sortRecords(sectionRecords(topology, 'execution_surfaces')),
    observability_surfaces: sortRecords(sectionRecords(topology, 'observability_surfaces')),
  }
  const governance = { governance_inventories: sortRecords(sectionRecords(topology, 'governance_inventories')) }
  const workflow = { workflow_topology: sortRecords(sectionRecords(topology, 'workflow_topology')) }
  const schema = { schema_maps: sortRecords(sectionRecords(topology, 'schema_maps')) }
  const reconciliation = {
    traversal_hash: traversalResult.traversal_hash,
    topology_hash: hashCanonical(runtime),
    governance_hash: hashCanonical(governance),
    workflow_hash: hashCanonical(workflow),
    schema_hash: hashCanonical(schema),
    proof_lineage_hash: hashCanonical({ proof_lineage_bindings: sortRecords(sectionRecords(topology, 'proof_lineage_bindings')) }),
  }

  return Object.freeze({
    topology_hash: reconciliation.topology_hash,
    governance_hash: reconciliation.governance_hash,
    workflow_hash: reconciliation.workflow_hash,
    schema_hash: reconciliation.schema_hash,
    reconciliation_hash: hashCanonical(reconciliation),
  })
}

function booleanTrue(value) {
  return value === true || value === 'true'
}

function declaredFalse(value) {
  return value === false || value === 'false'
}

export function classifyTopologyDrift(topology, hashes = topologyHashes(topology), traversalResult = traverseTopology(topology)) {
  const drift = []
  const runtimeRoutes = sortRecords(sectionRecords(topology, 'runtime_routes'))
  const runtimeRouteSet = new Set(runtimeRoutes.map(routeOf).filter(Boolean))
  const executionSurfaces = sortRecords(sectionRecords(topology, 'execution_surfaces'))
  const observabilitySurfaces = sortRecords(sectionRecords(topology, 'observability_surfaces'))
  const schemaMaps = sortRecords(sectionRecords(topology, 'schema_maps'))
  const governanceInventories = sortRecords(sectionRecords(topology, 'governance_inventories'))
  const workflowTopology = sortRecords(sectionRecords(topology, 'workflow_topology'))

  for (const surface of executionSurfaces) {
    const route = routeOf(surface)
    if (declaredFalse(surface.declared) || declaredFalse(surface.classified) || booleanTrue(surface.hidden) || (route && !runtimeRouteSet.has(route) && !CANONICAL_RUNTIME_ROUTES.includes(route))) {
      drift.push({ classification: 'UNDECLARED_SURFACE', identity: stableIdentity(surface), reason: 'execution_surface_not_declared_in_runtime_topology' })
    }
  }

  for (const route of runtimeRoutes) {
    const routePath = routeOf(route)
    if (routePath && !CANONICAL_RUNTIME_ROUTES.includes(routePath) && booleanTrue(route.executable)) {
      drift.push({ classification: 'UNDECLARED_SURFACE', identity: stableIdentity(route), reason: 'hidden_route_expansion' })
    }
  }

  for (const mapping of schemaMaps) {
    const boundRoute = String(mapping.route ?? mapping.bound_route ?? '')
    if (declaredFalse(mapping.declared) || booleanTrue(mapping.orphaned) || (boundRoute && !runtimeRouteSet.has(boundRoute))) {
      drift.push({ classification: 'SCHEMA_DIVERGENCE', identity: stableIdentity(mapping), reason: 'orphaned_schema_mapping' })
    }
  }

  for (const inventory of governanceInventories) {
    const requiredRoutes = asArray(inventory.required_routes ?? inventory.canonical_execution_path)
    if (declaredFalse(inventory.current) || String(inventory.status ?? '').toUpperCase() === 'STALE') {
      drift.push({ classification: 'GOVERNANCE_MISMATCH', identity: stableIdentity(inventory), reason: 'stale_governance_inventory' })
    }
    for (const route of requiredRoutes) {
      if (!runtimeRouteSet.has(String(route))) {
        drift.push({ classification: 'GOVERNANCE_MISMATCH', identity: stableIdentity(inventory), reason: `governance_runtime_divergence:${route}` })
      }
    }
  }

  for (const workflow of workflowTopology) {
    if (declaredFalse(workflow.declared) || booleanTrue(workflow.hidden) || booleanTrue(workflow.expands_execution) || booleanTrue(workflow.execution_route_created)) {
      drift.push({ classification: 'WORKFLOW_EXPANSION', identity: stableIdentity(workflow), reason: 'hidden_workflow_expansion' })
    }
  }

  for (const surface of observabilitySurfaces) {
    if (booleanTrue(surface.executable) || booleanTrue(surface.mutation_capable) || booleanTrue(surface.creates_authority)) {
      drift.push({ classification: 'TOPOLOGY_DRIFT', identity: stableIdentity(surface), reason: 'observability_surface_mismatch' })
    }
  }

  const expected = topology?.expected_hashes
  if (isPlainObject(expected)) {
    for (const key of ['topology_hash', 'governance_hash', 'workflow_hash', 'schema_hash', 'reconciliation_hash']) {
      if (expected[key] && expected[key] !== hashes[key]) drift.push({ classification: 'TOPOLOGY_DRIFT', identity: key, reason: 'topology_hash_mismatch' })
    }
  }

  if (traversalResult.truncated) drift.push({ classification: 'TOPOLOGY_DRIFT', identity: 'bounded_traversal', reason: 'bounded_reconciliation_traversal_exceeded' })

  const drift_classes = [...new Set(drift.map((entry) => entry.classification))]
  const classification = drift_classes.includes('UNDECLARED_SURFACE') ? 'UNDECLARED_SURFACE'
    : drift_classes.includes('SCHEMA_DIVERGENCE') ? 'SCHEMA_DIVERGENCE'
    : drift_classes.includes('WORKFLOW_EXPANSION') ? 'WORKFLOW_EXPANSION'
    : drift_classes.includes('GOVERNANCE_MISMATCH') ? 'GOVERNANCE_MISMATCH'
    : drift_classes.includes('TOPOLOGY_DRIFT') ? 'TOPOLOGY_DRIFT'
    : 'TOPOLOGY_VALID'

  return Object.freeze({
    classification,
    drift_classes: drift_classes.length ? drift_classes : ['TOPOLOGY_VALID'],
    drift,
    fail_closed: classification !== 'TOPOLOGY_VALID',
    evidence_only: true,
    mutation_capable: false,
    replay_neutral: true,
  })
}

export function mergeLegitimacySignal(classification) {
  if (classification === 'TOPOLOGY_VALID') return 'SAFE_TO_MERGE'
  if (classification === 'UNDECLARED_SURFACE') return 'UNDECLARED_EXECUTION_SURFACE'
  if (classification === 'GOVERNANCE_MISMATCH') return 'GOVERNANCE_DIVERGENCE'
  return 'TOPOLOGY_DRIFT'
}

export function buildReconciliationEvidenceEnvelope(topology, options = {}) {
  const generated_at = options.generated_at ?? new Date(0).toISOString()
  const traversalResult = traverseTopology(topology, options)
  const hashes = topologyHashes(topology, traversalResult)
  const classification = classifyTopologyDrift(topology, hashes, traversalResult)
  const ancestry = normalize(topology?.topology_ancestry ?? [])
  const stableEnvelopeMaterial = {
    object_type: 'TopologyReconciliationEvidenceEnvelope',
    topology_hashes: hashes,
    traversal_hash: traversalResult.traversal_hash,
    drift_classes: classification.drift_classes,
    drift_summary: classification.drift,
    topology_ancestry: ancestry,
    merge_signal: mergeLegitimacySignal(classification.classification),
    evidence_only: true,
    remote_authority_denied: true,
    replay_neutral: true,
    mutation_capable: false,
  }
  const reconciliation_id = hashCanonical(stableEnvelopeMaterial)

  return Object.freeze({
    ...stableEnvelopeMaterial,
    reconciliation_id,
    reconciliation_timestamp: generated_at,
    traversal_lineage: traversalResult.traversal,
    traversal_bounded: traversalResult.bounded,
    traversal_truncated: traversalResult.truncated,
    classification: classification.classification,
    fail_closed: classification.fail_closed,
    read_only: true,
    creates_authority: false,
    execution_started: false,
  })
}

export function reconcileTopology(topology, options = {}) {
  return buildReconciliationEvidenceEnvelope(topology, options)
}
