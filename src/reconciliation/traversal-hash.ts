import { canonicalize, sha256Hex } from '../canonical.js'

export type TraversalStatus = 'CANONICAL' | 'NULL'
export type TraversalDriftClassification =
  | 'NONE'
  | 'ORPHANED'
  | 'LOOP_DETECTED'
  | 'DEPTH_EXCEEDED'
  | 'LINEAGE_DRIFT'

export type RegistryName =
  | 'session_registry'
  | 'continuity_registry'
  | 'authority_registry'
  | 'aeo_registry'
  | 'validation_registry'
  | 'execution_registry'
  | 'proof_registry'
  | 'preo_registry'

const CANONICAL_REGISTRY_ORDER: RegistryName[] = [
  'session_registry',
  'continuity_registry',
  'authority_registry',
  'aeo_registry',
  'validation_registry',
  'execution_registry',
  'proof_registry',
  'preo_registry'
]

export interface TraversalRegistryNode {
  registry: RegistryName
  id: string
  parent_registry: RegistryName | null
  parent_id: string | null
  lineage_root: string
  payload: Record<string, unknown>
}

export interface TraversalHashObject {
  reconciliation_id: string
  lineage_root: string
  canonical_traversal_hash: string | null
  registry_sequence: RegistryName[]
  traversal_status: TraversalStatus
  drift_classification: TraversalDriftClassification
  created_at: string
}

export interface TraversalHashRequest {
  reconciliation_id: string
  lineage_root: string
  created_at: string
  max_depth?: number
  registries: ReadonlyArray<TraversalRegistryNode>
}

export function computeTraversalHash(request: TraversalHashRequest): TraversalHashObject {
  const inferredDepthBudget = request.registries.length + CANONICAL_REGISTRY_ORDER.length
  const maxDepth = request.max_depth ?? Math.max(CANONICAL_REGISTRY_ORDER.length + 2, inferredDepthBudget)
  const byKey = new Map<string, TraversalRegistryNode>(request.registries.map((node) => [`${node.registry}:${node.id}`, node]))
  const grouped = new Map<RegistryName, TraversalRegistryNode[]>()

  for (const node of request.registries) {
    if (node.lineage_root !== request.lineage_root) continue
    const list = grouped.get(node.registry) ?? []
    list.push(node)
    grouped.set(node.registry, list)
  }

  const canonicalNodes: TraversalRegistryNode[] = []
  const visited = new Set<string>()
  let depth = 0

  for (const registry of CANONICAL_REGISTRY_ORDER) {
    const candidates = (grouped.get(registry) ?? []).sort((a, b) => a.id.localeCompare(b.id))
    if (candidates.length === 0) {
      if (registry === 'preo_registry') continue
      return fail(request, 'ORPHANED')
    }

    for (const node of candidates) {
      depth += 1
      if (depth > maxDepth) return fail(request, 'DEPTH_EXCEEDED')
      const key = `${node.registry}:${node.id}`
      if (visited.has(key)) return fail(request, 'LOOP_DETECTED')
      visited.add(key)

      if (node.parent_registry && node.parent_id) {
        const parentKey = `${node.parent_registry}:${node.parent_id}`
        if (parentKey === key) return fail(request, 'LOOP_DETECTED')
        const parent = byKey.get(parentKey)
        if (!parent || parent.lineage_root !== request.lineage_root) return fail(request, 'ORPHANED')
      }
      canonicalNodes.push(node)
    }
  }

  const canonicalEvidence = canonicalNodes
    .slice()
    .sort((a, b) => {
      const order = CANONICAL_REGISTRY_ORDER.indexOf(a.registry) - CANONICAL_REGISTRY_ORDER.indexOf(b.registry)
      return order !== 0 ? order : a.id.localeCompare(b.id)
    })
    .map((node) => ({
      registry: node.registry,
      id: node.id,
      parent_registry: node.parent_registry,
      parent_id: node.parent_id,
      lineage_root: node.lineage_root,
      payload: node.payload
    }))

  const canonical_traversal_hash = sha256Hex(canonicalize({
    reconciliation_id: request.reconciliation_id,
    lineage_root: request.lineage_root,
    registry_sequence: CANONICAL_REGISTRY_ORDER.filter((registry) => grouped.has(registry)),
    traversal: canonicalEvidence
  }))

  return {
    reconciliation_id: request.reconciliation_id,
    lineage_root: request.lineage_root,
    canonical_traversal_hash,
    registry_sequence: CANONICAL_REGISTRY_ORDER.filter((registry) => grouped.has(registry)),
    traversal_status: 'CANONICAL',
    drift_classification: 'NONE',
    created_at: request.created_at
  }
}

function fail(request: TraversalHashRequest, drift: TraversalDriftClassification): TraversalHashObject {
  return {
    reconciliation_id: request.reconciliation_id,
    lineage_root: request.lineage_root,
    canonical_traversal_hash: null,
    registry_sequence: [...CANONICAL_REGISTRY_ORDER],
    traversal_status: 'NULL',
    drift_classification: drift,
    created_at: request.created_at
  }
}
