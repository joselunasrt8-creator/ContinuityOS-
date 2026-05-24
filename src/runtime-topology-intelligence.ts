import { canonicalize, sha256Hex } from './canonical.js'

export const RUNTIME_SURFACE_CLASSIFICATIONS = Object.freeze([
  'MUTATION_CAPABLE',
  'AUTHORITY_CAPABLE',
  'VALIDATION_BOUND',
  'REPLAY_BOUND',
  'PROOF_GENERATING',
  'CONTINUITY_BOUND',
  'RECONCILIATION_DEPENDENT',
  'CAUSALLY_ORDERED',
  'OBSERVABILITY_ONLY',
  'TOPOLOGY_DRIFT',
  'UNKNOWN_SURFACE',
  'NULL',
] as const)

type SurfaceClassification = (typeof RUNTIME_SURFACE_CLASSIFICATIONS)[number]

export interface RuntimeSurfaceNode {
  readonly surface_id: string
  readonly route: string
  readonly method: string
  readonly capability_flags?: readonly SurfaceClassification[]
  readonly hidden?: boolean
  readonly unknown?: boolean
}

export interface RuntimeTopologyEdge {
  readonly from: string
  readonly to: string
}

export interface RuntimeTopologyIntelligenceInput {
  readonly topology_id: string
  readonly evidence_only: true
  readonly surfaces: readonly RuntimeSurfaceNode[]
  readonly authority_edges?: readonly RuntimeTopologyEdge[]
  readonly continuity_edges?: readonly RuntimeTopologyEdge[]
  readonly replay_edges?: readonly RuntimeTopologyEdge[]
  readonly revocation_edges?: readonly RuntimeTopologyEdge[]
  readonly reconciliation_edges?: readonly RuntimeTopologyEdge[]
  readonly causal_edges?: readonly RuntimeTopologyEdge[]
  readonly proof_edges?: readonly RuntimeTopologyEdge[]
}

export interface RuntimeTopologyIntelligenceResult {
  readonly artifact_type: 'RUNTIME_TOPOLOGY_INTELLIGENCE'
  readonly topology_id: string
  readonly classification: SurfaceClassification
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
  readonly deterministic_surface_order: readonly string[]
  readonly execution_topology_graph: readonly string[]
  readonly authority_lineage_graph: readonly string[]
  readonly continuity_lineage_graph: readonly string[]
  readonly replay_dependency_graph: readonly string[]
  readonly revocation_dependency_graph: readonly string[]
  readonly reconciliation_dependency_graph: readonly string[]
  readonly causal_ordering_graph: readonly string[]
  readonly proof_continuity_graph: readonly string[]
  readonly topology_drift_inventory: readonly string[]
  readonly mutation_surface_inventory: readonly string[]
  readonly governance_density_map: Readonly<Record<string, number>>
  readonly observability_boundary_map: Readonly<Record<string, true>>
  readonly graph_hashes: Readonly<Record<string, string>>
}

function normalizeNode(node: RuntimeSurfaceNode): RuntimeSurfaceNode {
  const flags = Array.isArray(node.capability_flags) ? [...new Set(node.capability_flags.map((f) => String(f || '').toUpperCase() as SurfaceClassification))].sort((a, b) => a.localeCompare(b)) : []
  return {
    surface_id: String(node.surface_id || ''),
    route: String(node.route || ''),
    method: String(node.method || '').toUpperCase(),
    capability_flags: flags,
    hidden: Boolean(node.hidden),
    unknown: Boolean(node.unknown),
  }
}

function normalizeEdge(edge: RuntimeTopologyEdge): RuntimeTopologyEdge {
  return { from: String(edge.from || ''), to: String(edge.to || '') }
}

function sortEdges(edges: readonly RuntimeTopologyEdge[]): readonly RuntimeTopologyEdge[] {
  return edges.slice().sort((a, b) => {
    const f = a.from.localeCompare(b.from)
    if (f !== 0) return f
    return a.to.localeCompare(b.to)
  })
}

function edgeLabels(edges: readonly RuntimeTopologyEdge[]): readonly string[] {
  return Object.freeze(sortEdges(edges).map((e) => `${e.from}->${e.to}`))
}

function hashGraph(labels: readonly string[]): string {
  return sha256Hex(canonicalize(labels))
}

function resolveClassification(node: RuntimeSurfaceNode): SurfaceClassification {
  if (node.hidden) return 'TOPOLOGY_DRIFT'
  if (node.unknown) return 'UNKNOWN_SURFACE'
  const flags = new Set(node.capability_flags || [])
  if (flags.has('TOPOLOGY_DRIFT')) return 'TOPOLOGY_DRIFT'
  if (flags.has('UNKNOWN_SURFACE')) return 'UNKNOWN_SURFACE'
  if (flags.has('OBSERVABILITY_ONLY')) return 'OBSERVABILITY_ONLY'
  if (flags.has('MUTATION_CAPABLE')) return 'MUTATION_CAPABLE'
  if (flags.has('AUTHORITY_CAPABLE')) return 'AUTHORITY_CAPABLE'
  if (flags.has('VALIDATION_BOUND')) return 'VALIDATION_BOUND'
  if (flags.has('REPLAY_BOUND')) return 'REPLAY_BOUND'
  if (flags.has('PROOF_GENERATING')) return 'PROOF_GENERATING'
  if (flags.has('CONTINUITY_BOUND')) return 'CONTINUITY_BOUND'
  if (flags.has('RECONCILIATION_DEPENDENT')) return 'RECONCILIATION_DEPENDENT'
  if (flags.has('CAUSALLY_ORDERED')) return 'CAUSALLY_ORDERED'
  return 'NULL'
}

export function mapRuntimeTopologyIntelligence(input: RuntimeTopologyIntelligenceInput): RuntimeTopologyIntelligenceResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.surfaces) || input.surfaces.length === 0) {
    return Object.freeze({
      artifact_type: 'RUNTIME_TOPOLOGY_INTELLIGENCE',
      topology_id: String(input?.topology_id || ''),
      classification: 'NULL',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
      deterministic_surface_order: Object.freeze([]),
      execution_topology_graph: Object.freeze([]),
      authority_lineage_graph: Object.freeze([]),
      continuity_lineage_graph: Object.freeze([]),
      replay_dependency_graph: Object.freeze([]),
      revocation_dependency_graph: Object.freeze([]),
      reconciliation_dependency_graph: Object.freeze([]),
      causal_ordering_graph: Object.freeze([]),
      proof_continuity_graph: Object.freeze([]),
      topology_drift_inventory: Object.freeze([]),
      mutation_surface_inventory: Object.freeze([]),
      governance_density_map: Object.freeze({}),
      observability_boundary_map: Object.freeze({}),
      graph_hashes: Object.freeze({}),
    })
  }

  const normalizedNodes = input.surfaces.map(normalizeNode).sort((a, b) => a.surface_id.localeCompare(b.surface_id))
  const byId = new Set(normalizedNodes.map((n) => n.surface_id))
  const filterKnown = (edges: readonly RuntimeTopologyEdge[] = []) => edges.map(normalizeEdge).filter((e) => byId.has(e.from) && byId.has(e.to))

  const executionGraph = edgeLabels(normalizedNodes.map((n) => ({ from: `${n.method}:${n.route}`, to: n.surface_id })))
  const authorityGraph = edgeLabels(filterKnown(input.authority_edges))
  const continuityGraph = edgeLabels(filterKnown(input.continuity_edges))
  const replayGraph = edgeLabels(filterKnown(input.replay_edges))
  const revocationGraph = edgeLabels(filterKnown(input.revocation_edges))
  const reconciliationGraph = edgeLabels(filterKnown(input.reconciliation_edges))
  const causalGraph = edgeLabels(filterKnown(input.causal_edges))
  const proofGraph = edgeLabels(filterKnown(input.proof_edges))

  const drift = new Set<string>()
  const mutationSurfaces: string[] = []
  const observabilityMap: Record<string, true> = {}
  const density: Record<string, number> = {}
  let overall: SurfaceClassification = 'OBSERVABILITY_ONLY'

  for (const node of normalizedNodes) {
    const cls = resolveClassification(node)
    if (cls === 'TOPOLOGY_DRIFT' || cls === 'UNKNOWN_SURFACE') {
      drift.add(node.surface_id)
      overall = 'TOPOLOGY_DRIFT'
    }
    const flags = new Set(node.capability_flags || [])
    if (flags.has('MUTATION_CAPABLE')) mutationSurfaces.push(node.surface_id)
    if (flags.has('OBSERVABILITY_ONLY') || node.method === 'GET') observabilityMap[node.surface_id] = true
    density[node.surface_id] = (node.capability_flags || []).filter((f) => f !== 'OBSERVABILITY_ONLY' && f !== 'NULL').length
  }

  const graphHashes = Object.freeze({
    execution_topology_graph: hashGraph(executionGraph),
    authority_lineage_graph: hashGraph(authorityGraph),
    continuity_lineage_graph: hashGraph(continuityGraph),
    replay_dependency_graph: hashGraph(replayGraph),
    revocation_dependency_graph: hashGraph(revocationGraph),
    reconciliation_dependency_graph: hashGraph(reconciliationGraph),
    causal_ordering_graph: hashGraph(causalGraph),
    proof_continuity_graph: hashGraph(proofGraph),
  })

  return Object.freeze({
    artifact_type: 'RUNTIME_TOPOLOGY_INTELLIGENCE',
    topology_id: String(input.topology_id || ''),
    classification: overall,
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    validates_execution: false,
    deterministic_surface_order: Object.freeze(normalizedNodes.map((n) => n.surface_id)),
    execution_topology_graph: executionGraph,
    authority_lineage_graph: authorityGraph,
    continuity_lineage_graph: continuityGraph,
    replay_dependency_graph: replayGraph,
    revocation_dependency_graph: revocationGraph,
    reconciliation_dependency_graph: reconciliationGraph,
    causal_ordering_graph: causalGraph,
    proof_continuity_graph: proofGraph,
    topology_drift_inventory: Object.freeze(Array.from(drift).sort((a, b) => a.localeCompare(b))),
    mutation_surface_inventory: Object.freeze(mutationSurfaces.sort((a, b) => a.localeCompare(b))),
    governance_density_map: Object.freeze({ ...density }),
    observability_boundary_map: Object.freeze({ ...observabilityMap }),
    graph_hashes: graphHashes,
  })
}
