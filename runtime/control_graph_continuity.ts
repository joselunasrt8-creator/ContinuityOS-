export type ContinuityMode =
  | "observability_only"
  | "continuity_projection"

export interface ContinuityNode {
  node_id: string
  parent_id: string | null
  topology_hash: string
  reconciliation_hash: string
  continuity_hash: string
  created_at: string
}

export interface ContinuityEnvelope {
  envelope_id: string
  lineage_hash: string
  continuity_hash: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ContinuityState {
  mode: ContinuityMode
  nodes: ContinuityNode[]
  envelopes: ContinuityEnvelope[]
}

export const CONTROL_GRAPH_CONTINUITY_MODE: ContinuityMode =
  "observability_only"

export function deterministicContinuityHash(
  topologyHash: string,
  reconciliationHash: string,
): string {
  return [
    "continuity",
    topologyHash,
    reconciliationHash,
  ].join(":")
}

export function deterministicLineageHash(
  continuityHash: string,
  parentId: string | null,
): string {
  return [
    "lineage",
    continuityHash,
    parentId ?? "root",
  ].join(":")
}

export function deterministicEnvelopeId(
  continuityHash: string,
  lineageHash: string,
): string {
  return [
    "envelope",
    continuityHash,
    lineageHash,
  ].join(":")
}

export function createContinuityNode(
  topologyHash: string,
  reconciliationHash: string,
  parentId: string | null = null,
): ContinuityNode {
  const continuityHash =
    deterministicContinuityHash(
      topologyHash,
      reconciliationHash,
    )

  return {
    node_id: [
      "node",
      continuityHash,
    ].join(":"),
    parent_id: parentId,
    topology_hash: topologyHash,
    reconciliation_hash:
      reconciliationHash,
    continuity_hash:
      continuityHash,
    created_at:
      new Date().toISOString(),
  }
}

export function createContinuityEnvelope(
  node: ContinuityNode,
): ContinuityEnvelope {
  const lineageHash =
    deterministicLineageHash(
      node.continuity_hash,
      node.parent_id,
    )

  return {
    envelope_id:
      deterministicEnvelopeId(
        node.continuity_hash,
        lineageHash,
      ),
    lineage_hash: lineageHash,
    continuity_hash:
      node.continuity_hash,
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function initializeContinuityState():
  ContinuityState {
  return {
    mode:
      CONTROL_GRAPH_CONTINUITY_MODE,
    nodes: [],
    envelopes: [],
  }
}

export function appendContinuityNode(
  state: ContinuityState,
  node: ContinuityNode,
): ContinuityState {
  return {
    ...state,
    nodes: [
      ...state.nodes,
      node,
    ],
  }
}

export function appendContinuityEnvelope(
  state: ContinuityState,
  envelope: ContinuityEnvelope,
): ContinuityState {
  return {
    ...state,
    envelopes: [
      ...state.envelopes,
      envelope,
    ],
  }
}

export function verifyContinuityChain(
  nodes: ContinuityNode[],
): boolean {
  return nodes.every((node) => {
    if (node.parent_id === null) {
      return true
    }

    return nodes.some(
      (candidate) =>
        candidate.node_id ===
        node.parent_id,
    )
  })
}

export function verifyReplayNeutrality(
  envelopeA: ContinuityEnvelope,
  envelopeB: ContinuityEnvelope,
): boolean {
  return (
    envelopeA.lineage_hash ===
      envelopeB.lineage_hash &&
    envelopeA.continuity_hash ===
      envelopeB.continuity_hash
  )
}

export function verifyObservabilityOnlyInvariant(
  state: ContinuityState,
): boolean {
  return (
    state.mode ===
      "observability_only" &&
    state.envelopes.every(
      (envelope) =>
        envelope.runtime_authority ===
        false,
    )
  )
}

export function exportContinuityProjection(
  state: ContinuityState,
) {
  return {
    mode: state.mode,
    nodes: state.nodes.length,
    envelopes:
      state.envelopes.length,
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}
