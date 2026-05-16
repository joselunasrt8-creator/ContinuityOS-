export type LineageMode =
  | "observability_only"
  | "lineage_projection"

export interface LineageRecord {
  lineage_id: string
  parent_hash: string
  child_hash: string
  continuity_hash: string
  topology_hash: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface LineageEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  lineage_hash: string
  exported_at: string
  mode: LineageMode
}

export interface LineageState {
  lineage_records: LineageRecord[]
  lineage_envelopes: LineageEnvelope[]
}

export const CONTROL_GRAPH_LINEAGE_MODE =
  "observability_only"

export function deterministicLineageId(
  parentHash: string,
  childHash: string,
): string {
  return [
    "lineage",
    parentHash,
    childHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  lineageId: string,
): string {
  return [
    "continuity",
    topologyHash,
    lineageId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "lineage-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createLineageRecord(
  parentHash: string,
  childHash: string,
  topologyHash: string,
): LineageRecord {
  const lineageId =
    deterministicLineageId(
      parentHash,
      childHash,
    )

  return {
    lineage_id: lineageId,
    parent_hash: parentHash,
    child_hash: childHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        lineageId,
      ),
    topology_hash: topologyHash,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createLineageEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  lineageHash: string,
): LineageEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    lineage_hash: lineageHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_LINEAGE_MODE,
  }
}

export function initializeLineageState():
  LineageState {
  return {
    lineage_records: [],
    lineage_envelopes: [],
  }
}

export function appendLineageRecord(
  state: LineageState,
  record: LineageRecord,
): LineageState {
  return {
    ...state,
    lineage_records: [
      ...state.lineage_records,
      record,
    ],
  }
}

export function appendLineageEnvelope(
  state: LineageState,
  envelope: LineageEnvelope,
): LineageState {
  return {
    ...state,
    lineage_envelopes: [
      ...state.lineage_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: LineageRecord,
  recordB: LineageRecord,
): boolean {
  return (
    recordA.lineage_id ===
      recordB.lineage_id &&
    recordA.continuity_hash ===
      recordB.continuity_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: LineageState,
): boolean {
  return state.lineage_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportLineageProjection(
  state: LineageState,
) {
  return {
    mode: CONTROL_GRAPH_LINEAGE_MODE,
    lineage_records:
      state.lineage_records.length,
    lineage_envelopes:
      state.lineage_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
