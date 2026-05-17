export type ControlGraphRegistryMode =
  | "observability_only"
  | "registry_projection"

export interface ControlGraphRegistryRecord {
  registry_id: string
  topology_hash: string
  reconciliation_hash: string
  lineage_hash: string
  continuity_hash: string
  created_at: string
  mode: ControlGraphRegistryMode
  runtime_authority: false
  replay_neutral: true
  append_only: true
}

export interface ControlGraphSnapshot {
  snapshot_id: string
  topology_nodes: number
  topology_edges: number
  reconciliation_cycle: string
  generated_at: string
}

export interface ControlGraphRegistryState {
  records: ControlGraphRegistryRecord[]
  snapshots: ControlGraphSnapshot[]
}

export const CONTROL_GRAPH_REGISTRY_MODE =
  "observability_only"

export function deterministicRegistryId(
  topologyHash: string,
  reconciliationHash: string,
): string {
  return [
    "registry",
    topologyHash,
    reconciliationHash,
  ].join(":")
}

export function deterministicLineageHash(
  topologyHash: string,
  continuityHash: string,
): string {
  return [
    "lineage",
    topologyHash,
    continuityHash,
  ].join(":")
}

export function deterministicContinuityHash(
  reconciliationHash: string,
  snapshotId: string,
): string {
  return [
    "continuity",
    reconciliationHash,
    snapshotId,
  ].join(":")
}

export function createControlGraphRegistryRecord(
  topologyHash: string,
  reconciliationHash: string,
  snapshotId: string,
): ControlGraphRegistryRecord {
  const continuityHash =
    deterministicContinuityHash(
      reconciliationHash,
      snapshotId,
    )

  const lineageHash =
    deterministicLineageHash(
      topologyHash,
      continuityHash,
    )

  return {
    registry_id: deterministicRegistryId(
      topologyHash,
      reconciliationHash,
    ),
    topology_hash: topologyHash,
    reconciliation_hash: reconciliationHash,
    lineage_hash: lineageHash,
    continuity_hash: continuityHash,
    created_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_REGISTRY_MODE,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}

export function createTopologySnapshot(
  topologyNodes: number,
  topologyEdges: number,
  reconciliationCycle: string,
): ControlGraphSnapshot {
  return {
    snapshot_id: [
      "snapshot",
      reconciliationCycle,
      topologyNodes,
      topologyEdges,
    ].join(":"),
    topology_nodes: topologyNodes,
    topology_edges: topologyEdges,
    reconciliation_cycle:
      reconciliationCycle,
    generated_at: new Date().toISOString(),
  }
}

export function initializeRegistryState():
  ControlGraphRegistryState {
  return {
    records: [],
    snapshots: [],
  }
}

export function appendRegistryRecord(
  state: ControlGraphRegistryState,
  record: ControlGraphRegistryRecord,
): ControlGraphRegistryState {
  return {
    ...state,
    records: [
      ...state.records,
      record,
    ],
  }
}

export function appendSnapshot(
  state: ControlGraphRegistryState,
  snapshot: ControlGraphSnapshot,
): ControlGraphRegistryState {
  return {
    ...state,
    snapshots: [
      ...state.snapshots,
      snapshot,
    ],
  }
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyReplayNeutrality(
  recordA: ControlGraphRegistryRecord,
  recordB: ControlGraphRegistryRecord,
): boolean {
  return (
    recordA.registry_id ===
      recordB.registry_id &&
    recordA.lineage_hash ===
      recordB.lineage_hash
  )
}

export function verifyObservabilityOnlyMode(
  state: ControlGraphRegistryState,
): boolean {
  return state.records.every(
    (record) =>
      record.mode ===
        "observability_only" &&
      record.runtime_authority === false,
  )
}

export function exportRegistryProjection(
  state: ControlGraphRegistryState,
) {
  return {
    mode: CONTROL_GRAPH_REGISTRY_MODE,
    runtime_authority: false,
    records: state.records.length,
    snapshots: state.snapshots.length,
    replay_neutral: true,
    append_only: true,
  }
}
