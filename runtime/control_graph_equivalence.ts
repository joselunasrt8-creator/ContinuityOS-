export type EquivalenceMode =
  | "observability_only"
  | "equivalence_projection"

export interface TopologyEquivalenceRecord {
  equivalence_id: string
  source_topology_hash: string
  target_topology_hash: string
  reconciliation_hash: string
  lineage_hash: string
  equivalent: boolean
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface DriftDivergenceRecord {
  divergence_id: string
  source_hash: string
  target_hash: string
  divergence_class: string
  observed_at: string
}

export interface EquivalenceState {
  mode: EquivalenceMode
  equivalence_records:
    TopologyEquivalenceRecord[]
  divergence_records:
    DriftDivergenceRecord[]
}

export const CONTROL_GRAPH_EQUIVALENCE_MODE:
  EquivalenceMode =
    "observability_only"

export function deterministicEquivalenceId(
  sourceTopologyHash: string,
  targetTopologyHash: string,
): string {
  return [
    "equivalence",
    sourceTopologyHash,
    targetTopologyHash,
  ].join(":")
}

export function deterministicLineageHash(
  reconciliationHash: string,
  equivalenceId: string,
): string {
  return [
    "lineage",
    reconciliationHash,
    equivalenceId,
  ].join(":")
}

export function createEquivalenceRecord(
  sourceTopologyHash: string,
  targetTopologyHash: string,
  reconciliationHash: string,
): TopologyEquivalenceRecord {
  const equivalenceId =
    deterministicEquivalenceId(
      sourceTopologyHash,
      targetTopologyHash,
    )

  return {
    equivalence_id:
      equivalenceId,
    source_topology_hash:
      sourceTopologyHash,
    target_topology_hash:
      targetTopologyHash,
    reconciliation_hash:
      reconciliationHash,
    lineage_hash:
      deterministicLineageHash(
        reconciliationHash,
        equivalenceId,
      ),
    equivalent:
      sourceTopologyHash ===
      targetTopologyHash,
    created_at:
      new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createDriftDivergenceRecord(
  sourceHash: string,
  targetHash: string,
  divergenceClass: string,
): DriftDivergenceRecord {
  return {
    divergence_id: [
      "divergence",
      sourceHash,
      targetHash,
    ].join(":"),
    source_hash: sourceHash,
    target_hash: targetHash,
    divergence_class:
      divergenceClass,
    observed_at:
      new Date().toISOString(),
  }
}

export function initializeEquivalenceState():
  EquivalenceState {
  return {
    mode:
      CONTROL_GRAPH_EQUIVALENCE_MODE,
    equivalence_records: [],
    divergence_records: [],
  }
}

export function appendEquivalenceRecord(
  state: EquivalenceState,
  record: TopologyEquivalenceRecord,
): EquivalenceState {
  return {
    ...state,
    equivalence_records: [
      ...state.equivalence_records,
      record,
    ],
  }
}

export function appendDivergenceRecord(
  state: EquivalenceState,
  record: DriftDivergenceRecord,
): EquivalenceState {
  return {
    ...state,
    divergence_records: [
      ...state.divergence_records,
      record,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: TopologyEquivalenceRecord,
  recordB: TopologyEquivalenceRecord,
): boolean {
  return (
    recordA.equivalence_id ===
      recordB.equivalence_id &&
    recordA.lineage_hash ===
      recordB.lineage_hash
  )
}

export function verifyObservabilityOnlyInvariant(
  state: EquivalenceState,
): boolean {
  return (
    state.mode ===
      "observability_only" &&
    state.equivalence_records.every(
      (record) =>
        record.runtime_authority ===
        false,
    )
  )
}

export function verifyDeterministicEquivalence(
  sourceTopologyHash: string,
  targetTopologyHash: string,
): boolean {
  return (
    sourceTopologyHash ===
    targetTopologyHash
  )
}

export function exportEquivalenceProjection(
  state: EquivalenceState,
) {
  return {
    mode: state.mode,
    equivalence_records:
      state.equivalence_records.length,
    divergence_records:
      state.divergence_records.length,
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}
