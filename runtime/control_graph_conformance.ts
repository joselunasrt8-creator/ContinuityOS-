export type ConformanceMode =
  | "observability_only"
  | "conformance_projection"

export interface ConformanceRecord {
  conformance_id: string
  topology_hash: string
  continuity_hash: string
  validation_hash: string
  conformance_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ConformanceEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  conformance_hash: string
  exported_at: string
  mode: ConformanceMode
}

export interface ConformanceState {
  conformance_records: ConformanceRecord[]
  conformance_envelopes: ConformanceEnvelope[]
}

export const CONTROL_GRAPH_CONFORMANCE_MODE =
  "observability_only"

export function deterministicConformanceId(
  topologyHash: string,
  validationHash: string,
): string {
  return [
    "conformance",
    topologyHash,
    validationHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  conformanceId: string,
): string {
  return [
    "continuity",
    topologyHash,
    conformanceId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "conformance-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createConformanceRecord(
  topologyHash: string,
  validationHash: string,
  conformanceScope: string,
): ConformanceRecord {
  const conformanceId =
    deterministicConformanceId(
      topologyHash,
      validationHash,
    )

  return {
    conformance_id: conformanceId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        conformanceId,
      ),
    validation_hash: validationHash,
    conformance_scope:
      conformanceScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createConformanceEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  conformanceHash: string,
): ConformanceEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    conformance_hash: conformanceHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_CONFORMANCE_MODE,
  }
}

export function initializeConformanceState():
  ConformanceState {
  return {
    conformance_records: [],
    conformance_envelopes: [],
  }
}

export function appendConformanceRecord(
  state: ConformanceState,
  record: ConformanceRecord,
): ConformanceState {
  return {
    ...state,
    conformance_records: [
      ...state.conformance_records,
      record,
    ],
  }
}

export function appendConformanceEnvelope(
  state: ConformanceState,
  envelope: ConformanceEnvelope,
): ConformanceState {
  return {
    ...state,
    conformance_envelopes: [
      ...state.conformance_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: ConformanceRecord,
  recordB: ConformanceRecord,
): boolean {
  return (
    recordA.conformance_id ===
      recordB.conformance_id &&
    recordA.validation_hash ===
      recordB.validation_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: ConformanceState,
): boolean {
  return state.conformance_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportConformanceProjection(
  state: ConformanceState,
) {
  return {
    mode: CONTROL_GRAPH_CONFORMANCE_MODE,
    conformance_records:
      state.conformance_records.length,
    conformance_envelopes:
      state.conformance_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
