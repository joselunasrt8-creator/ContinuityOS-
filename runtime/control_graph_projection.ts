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
  return [
    projection.projection_id,
    projection.nodes.length,
    projection.edges.length,
  ].join(":")
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
