export type RegistryProjectionMode =
  | "observability_only"
  | "registry_projection"

export interface RegistryProjectionRecord {
  projection_id: string
  topology_hash: string
  continuity_hash: string
  registry_hash: string
  projection_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface RegistryProjectionEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  projection_hash: string
  exported_at: string
  mode: RegistryProjectionMode
}

export interface RegistryProjectionState {
  projection_records: RegistryProjectionRecord[]
  projection_envelopes: RegistryProjectionEnvelope[]
}

export const CONTROL_GRAPH_REGISTRY_PROJECTION_MODE =
  "observability_only"

export function deterministicProjectionId(
  topologyHash: string,
  registryHash: string,
): string {
  return [
    "registry-projection",
    topologyHash,
    registryHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  projectionId: string,
): string {
  return [
    "continuity",
    topologyHash,
    projectionId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "registry-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createRegistryProjectionRecord(
  topologyHash: string,
  registryHash: string,
  projectionScope: string,
): RegistryProjectionRecord {
  const projectionId =
    deterministicProjectionId(
      topologyHash,
      registryHash,
    )

  return {
    projection_id: projectionId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        projectionId,
      ),
    registry_hash: registryHash,
    projection_scope:
      projectionScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createRegistryProjectionEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  projectionHash: string,
): RegistryProjectionEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    projection_hash: projectionHash,
    exported_at: new Date().toISOString(),
    mode:
      CONTROL_GRAPH_REGISTRY_PROJECTION_MODE,
  }
}

export function initializeRegistryProjectionState():
  RegistryProjectionState {
  return {
    projection_records: [],
    projection_envelopes: [],
  }
}

export function appendProjectionRecord(
  state: RegistryProjectionState,
  record: RegistryProjectionRecord,
): RegistryProjectionState {
  return {
    ...state,
    projection_records: [
      ...state.projection_records,
      record,
    ],
  }
}

export function appendProjectionEnvelope(
  state: RegistryProjectionState,
  envelope: RegistryProjectionEnvelope,
): RegistryProjectionState {
  return {
    ...state,
    projection_envelopes: [
      ...state.projection_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: RegistryProjectionRecord,
  recordB: RegistryProjectionRecord,
): boolean {
  return (
    recordA.projection_id ===
      recordB.projection_id &&
    recordA.registry_hash ===
      recordB.registry_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: RegistryProjectionState,
): boolean {
  return state.projection_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportRegistryProjection(
  state: RegistryProjectionState,
) {
  return {
    mode:
      CONTROL_GRAPH_REGISTRY_PROJECTION_MODE,
    projection_records:
      state.projection_records.length,
    projection_envelopes:
      state.projection_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
