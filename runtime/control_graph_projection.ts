export type ProjectionMode =
  | "observability_only"
  | "federated_projection"

export interface ProjectionNode {
  id: string
  type: string
  legitimacy_state: string
}

export interface ProjectionEdge {
  from: string
  to: string
  relation: string
}

export interface ControlGraphProjection {
  projection_id: string
  created_at: string
  mode: ProjectionMode
  runtime_authority: false
  replay_neutral: true
  nodes: ProjectionNode[]
  edges: ProjectionEdge[]
}

export type ProjectionDriftClass =
  | "orphan-induced"
  | "stale-state-induced"
  | "replay-induced"
  | "temporal-induced"
  | "regeneration-induced"
  | "ordering-induced"

export interface ProjectionInspectionIssue {
  class: ProjectionDriftClass
  code: string
  message: string
  details: string
}

export interface ProjectionInspectionResult {
  ok: boolean
  deterministic_regeneration: boolean
  complete_projection: boolean
  fail_closed: boolean
  issues: ProjectionInspectionIssue[]
}

export interface FederatedProjectionEnvelope {
  envelope_id: string
  projection_hash: string
  continuity_hash: string
  topology_hash: string
  exported_at: string
  observability_only: true
}

export function deterministicProjectionId(
  topologyHash: string,
  continuityHash: string,
): string {
  return [
    "projection",
    topologyHash,
    continuityHash,
  ].join(":")
}

export function deterministicProjectionHash(
  projection: ControlGraphProjection,
): string {
  const orderedNodes = [...projection.nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    if (a.id !== b.id) return a.id.localeCompare(b.id)
    return a.legitimacy_state.localeCompare(b.legitimacy_state)
  })
  const orderedEdges = [...projection.edges].sort((a, b) => {
    if (a.relation !== b.relation) return a.relation.localeCompare(b.relation)
    if (a.from !== b.from) return a.from.localeCompare(b.from)
    return a.to.localeCompare(b.to)
  })
  return [
    projection.projection_id,
    JSON.stringify(orderedNodes),
    JSON.stringify(orderedEdges),
  ].join(":")
}

export function verifyDeterministicRegeneration(
  projectionA: ControlGraphProjection,
  projectionB: ControlGraphProjection,
): boolean {
  return deterministicProjectionHash(projectionA) === deterministicProjectionHash(projectionB)
}

export function verifyProjectionCompleteness(
  projection: ControlGraphProjection,
): ProjectionInspectionIssue[] {
  const issues: ProjectionInspectionIssue[] = []
  const nodeIds = new Set(projection.nodes.map((node) => node.id))

  for (const edge of projection.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        class: "orphan-induced",
        code: "orphan_lineage_detected",
        message: "edge references disconnected lineage node",
        details: `${edge.from} -> ${edge.to} (${edge.relation})`,
      })
    }
  }

  const staleNodes = projection.nodes.filter((node) => node.legitimacy_state === "STALE")
  for (const staleNode of staleNodes) {
    issues.push({
      class: "stale-state-induced",
      code: "stale_evidence_detected",
      message: "stale evidence survived into graph projection",
      details: staleNode.id,
    })
  }

  return issues
}

export function inspectProjectionContinuity(
  projection: ControlGraphProjection,
  expectedNodeOrder: string[],
): ProjectionInspectionIssue[] {
  const issues: ProjectionInspectionIssue[] = []
  const seen = projection.nodes.map((node) => node.id)
  if (expectedNodeOrder.join("|") !== seen.join("|")) {
    issues.push({
      class: "ordering-induced",
      code: "deterministic_ordering_mismatch",
      message: "projection node ordering diverges from canonical deterministic traversal",
      details: `expected=${expectedNodeOrder.join(",")} actual=${seen.join(",")}`,
    })
  }
  return issues
}

export function inspectProjection(
  projection: ControlGraphProjection,
  regenerated: ControlGraphProjection,
  expectedNodeOrder: string[],
): ProjectionInspectionResult {
  const issues = [
    ...verifyProjectionCompleteness(projection),
    ...inspectProjectionContinuity(projection, expectedNodeOrder),
  ]

  if (!verifyDeterministicRegeneration(projection, regenerated)) {
    issues.push({
      class: "regeneration-induced",
      code: "projection_regeneration_mismatch",
      message: "regenerated graph diverges from current graph evidence",
      details: "deterministic graph regeneration verification failed",
    })
  }

  return {
    ok: issues.length === 0,
    deterministic_regeneration: !issues.some((issue) => issue.class === "regeneration-induced"),
    complete_projection: !issues.some((issue) => issue.class === "orphan-induced"),
    fail_closed: issues.length === 0,
    issues,
  }
}

export function createProjection(
  topologyHash: string,
  continuityHash: string,
  nodes: ProjectionNode[],
  edges: ProjectionEdge[],
): ControlGraphProjection {
  return {
    projection_id:
      deterministicProjectionId(
        topologyHash,
        continuityHash,
      ),
    created_at: new Date().toISOString(),
    mode: "observability_only",
    runtime_authority: false,
    replay_neutral: true,
    nodes,
    edges,
  }
}

export function createFederatedEnvelope(
  projection: ControlGraphProjection,
  topologyHash: string,
  continuityHash: string,
): FederatedProjectionEnvelope {
  return {
    envelope_id: [
      "envelope",
      projection.projection_id,
    ].join(":"),
    projection_hash:
      deterministicProjectionHash(
        projection,
      ),
    continuity_hash: continuityHash,
    topology_hash: topologyHash,
    exported_at: new Date().toISOString(),
    observability_only: true,
  }
}

export function verifyProjectionReplayNeutrality(
  projectionA: ControlGraphProjection,
  projectionB: ControlGraphProjection,
): boolean {
  return (
    deterministicProjectionHash(
      projectionA,
    ) ===
    deterministicProjectionHash(
      projectionB,
    )
  )
}

export function verifyObservabilityInvariant(
  projection: ControlGraphProjection,
): boolean {
  return (
    projection.mode ===
      "observability_only" &&
    projection.runtime_authority ===
      false
  )
}

export function exportProjectionSummary(
  projection: ControlGraphProjection,
) {
  return {
    projection_id:
      projection.projection_id,
    nodes: projection.nodes.length,
    edges: projection.edges.length,
    mode: projection.mode,
    replay_neutral:
      projection.replay_neutral,
    runtime_authority:
      projection.runtime_authority,
  }
}

export function compressTopologyProjection(
  projection: ControlGraphProjection,
) {
  return {
    projection_id:
      projection.projection_id,
    topology_vector: [
      projection.nodes.length,
      projection.edges.length,
    ].join(":"),
    observability_only: true,
  }
}

export function verifyFederatedEnvelope(
  envelope: FederatedProjectionEnvelope,
): boolean {
  return (
    envelope.observability_only ===
      true
  )
}
