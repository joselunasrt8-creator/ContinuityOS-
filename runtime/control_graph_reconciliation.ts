/**
 * MindShift Control Graph Reconciliation Engine
 *
 * MODE: observability_only
 * BOUNDARY: visibility != authority
 */

import {
  GraphNode,
  GraphEdge,
  RuntimeTopologySnapshot,
} from "./control_graph_emitter.ts"

export const RECONCILIATION_MODE =
  "OBSERVABILITY_ONLY"

export interface ReconciliationResult {
  reconciliation_id: string
  timestamp: string
  topology_match: boolean
  drift_detected: boolean
  replay_detected: boolean
  orphaned_nodes: string[]
  orphaned_edges: string[]
  lineage_breaks: string[]
  metadata: Record<string, unknown>
}

export interface DriftVector {
  node_id: string
  drift_class: string
  severity: "LOW" | "MEDIUM" | "HIGH"
}

export interface LineagePath {
  source: string
  target: string
  traversed_edges: string[]
}

export function reconcileTopology(
  current: RuntimeTopologySnapshot,
  expected: RuntimeTopologySnapshot,
): ReconciliationResult {
  const orphaned_nodes = findOrphanedNodes(
    current.nodes,
    expected.nodes,
  )

  const orphaned_edges = findOrphanedEdges(
    current.edges,
    expected.edges,
  )

  const lineage_breaks = detectLineageBreaks(
    current.edges,
  )

  return {
    reconciliation_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    topology_match:
      orphaned_nodes.length === 0 &&
      orphaned_edges.length === 0 &&
      lineage_breaks.length === 0,
    drift_detected:
      orphaned_nodes.length > 0 ||
      orphaned_edges.length > 0,
    replay_detected: false,
    orphaned_nodes,
    orphaned_edges,
    lineage_breaks,
    metadata: {
      mode: RECONCILIATION_MODE,
      runtime_authority: false,
      state_mutation: false,
    },
  }
}

export function findOrphanedNodes(
  current: GraphNode[],
  expected: GraphNode[],
): string[] {
  const expected_ids = new Set(
    expected.map((n) => n.id),
  )

  return current
    .filter((n) => !expected_ids.has(n.id))
    .map((n) => n.id)
}

export function findOrphanedEdges(
  current: GraphEdge[],
  expected: GraphEdge[],
): string[] {
  const expected_edges = new Set(
    expected.map(
      (e) => `${e.from}:${e.to}:${e.type}`,
    ),
  )

  return current
    .filter((e) => {
      const key = `${e.from}:${e.to}:${e.type}`

      return !expected_edges.has(key)
    })
    .map(
      (e) => `${e.from}:${e.to}:${e.type}`,
    )
}

export function detectLineageBreaks(
  edges: GraphEdge[],
): string[] {
  const known_nodes = new Set<string>()

  for (const edge of edges) {
    known_nodes.add(edge.from)
    known_nodes.add(edge.to)
  }

  return edges
    .filter(
      (edge) =>
        !known_nodes.has(edge.from) ||
        !known_nodes.has(edge.to),
    )
    .map(
      (edge) =>
        `${edge.from}->${edge.to}`,
    )
}

export function detectReplayVectors(
  lineage: LineagePath[],
): string[] {
  const seen = new Set<string>()
  const replay: string[] = []

  for (const path of lineage) {
    const key =
      `${path.source}:${path.target}`

    if (seen.has(key)) {
      replay.push(key)
    }

    seen.add(key)
  }

  return replay
}

export function propagateDrift(
  vectors: DriftVector[],
): DriftVector[] {
  return vectors.map((vector) => ({
    ...vector,
    severity:
      vector.severity === "LOW"
        ? "MEDIUM"
        : vector.severity === "MEDIUM"
        ? "HIGH"
        : "HIGH",
  }))
}

export function reconciliationSnapshot(
  result: ReconciliationResult,
) {
  return {
    generated_at: new Date().toISOString(),
    mode: RECONCILIATION_MODE,
    reconciliation: result,
  }
}

export function runtimeTopologyChecksum(
  topology: RuntimeTopologySnapshot,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(topology))
    .digest("hex")
}

export function validateObservabilityBoundary(
  metadata: Record<string, unknown>,
): boolean {
  return (
    metadata.runtime_authority !== true &&
    metadata.state_mutation !== true
  )
}
