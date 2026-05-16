export type DriftMode =
  | "observability_only"
  | "drift_projection"

export interface DriftVector {
  drift_id: string
  topology_hash: string
  continuity_hash: string
  drift_scope: string
  divergence_hash: string
  detected_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface DriftEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  drift_hash: string
  exported_at: string
  mode: DriftMode
}

export interface DriftState {
  drift_vectors: DriftVector[]
  drift_envelopes: DriftEnvelope[]
}

export const CONTROL_GRAPH_DRIFT_MODE =
  "observability_only"

export function deterministicDriftId(
  topologyHash: string,
  divergenceHash: string,
): string {
  return [
    "drift",
    topologyHash,
    divergenceHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  driftScope: string,
): string {
  return [
    "continuity",
    topologyHash,
    driftScope,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "drift-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createDriftVector(
  topologyHash: string,
  driftScope: string,
  divergenceHash: string,
): DriftVector {
  return {
    drift_id: deterministicDriftId(
      topologyHash,
      divergenceHash,
    ),
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        driftScope,
      ),
    drift_scope: driftScope,
    divergence_hash: divergenceHash,
    detected_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createDriftEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  driftHash: string,
): DriftEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    drift_hash: driftHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_DRIFT_MODE,
  }
}

export function initializeDriftState():
  DriftState {
  return {
    drift_vectors: [],
    drift_envelopes: [],
  }
}

export function appendDriftVector(
  state: DriftState,
  vector: DriftVector,
): DriftState {
  return {
    ...state,
    drift_vectors: [
      ...state.drift_vectors,
      vector,
    ],
  }
}

export function appendDriftEnvelope(
  state: DriftState,
  envelope: DriftEnvelope,
): DriftState {
  return {
    ...state,
    drift_envelopes: [
      ...state.drift_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  vectorA: DriftVector,
  vectorB: DriftVector,
): boolean {
  return (
    vectorA.drift_id ===
      vectorB.drift_id &&
    vectorA.divergence_hash ===
      vectorB.divergence_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: DriftState,
): boolean {
  return state.drift_vectors.every(
    (vector) =>
      vector.runtime_authority ===
        false &&
      vector.replay_neutral ===
        true,
  )
}

export function exportDriftProjection(
  state: DriftState,
) {
  return {
    mode: CONTROL_GRAPH_DRIFT_MODE,
    drift_vectors:
      state.drift_vectors.length,
    drift_envelopes:
      state.drift_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
