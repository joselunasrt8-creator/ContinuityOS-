export type BoundaryMode =
  | "observability_only"
  | "boundary_projection"

export interface BoundaryRecord {
  boundary_id: string
  topology_hash: string
  continuity_hash: string
  boundary_hash: string
  boundary_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface BoundaryEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  boundary_hash: string
  exported_at: string
  mode: BoundaryMode
}

export interface BoundaryState {
  boundary_records: BoundaryRecord[]
  boundary_envelopes: BoundaryEnvelope[]
}

export const CONTROL_GRAPH_BOUNDARY_MODE =
  "observability_only"

export function deterministicBoundaryId(
  topologyHash: string,
  boundaryHash: string,
): string {
  return [
    "boundary",
    topologyHash,
    boundaryHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  boundaryId: string,
): string {
  return [
    "continuity",
    topologyHash,
    boundaryId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "boundary-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createBoundaryRecord(
  topologyHash: string,
  boundaryHash: string,
  boundaryScope: string,
): BoundaryRecord {
  const boundaryId =
    deterministicBoundaryId(
      topologyHash,
      boundaryHash,
    )

  return {
    boundary_id: boundaryId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        boundaryId,
      ),
    boundary_hash: boundaryHash,
    boundary_scope: boundaryScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createBoundaryEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  boundaryHash: string,
): BoundaryEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    boundary_hash: boundaryHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_BOUNDARY_MODE,
  }
}

export function initializeBoundaryState():
  BoundaryState {
  return {
    boundary_records: [],
    boundary_envelopes: [],
  }
}

export function appendBoundaryRecord(
  state: BoundaryState,
  record: BoundaryRecord,
): BoundaryState {
  return {
    ...state,
    boundary_records: [
      ...state.boundary_records,
      record,
    ],
  }
}

export function appendBoundaryEnvelope(
  state: BoundaryState,
  envelope: BoundaryEnvelope,
): BoundaryState {
  return {
    ...state,
    boundary_envelopes: [
      ...state.boundary_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: BoundaryRecord,
  recordB: BoundaryRecord,
): boolean {
  return (
    recordA.boundary_id ===
      recordB.boundary_id &&
    recordA.boundary_hash ===
      recordB.boundary_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: BoundaryState,
): boolean {
  return state.boundary_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportBoundaryProjection(
  state: BoundaryState,
) {
  return {
    mode: CONTROL_GRAPH_BOUNDARY_MODE,
    boundary_records:
      state.boundary_records.length,
    boundary_envelopes:
      state.boundary_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
