export type ReplayMode =
  | "observability_only"
  | "replay_projection"

export interface ReplayRecord {
  replay_id: string
  topology_hash: string
  continuity_hash: string
  replay_hash: string
  replay_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ReplayEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  replay_hash: string
  exported_at: string
  mode: ReplayMode
}

export interface ReplayState {
  replay_records: ReplayRecord[]
  replay_envelopes: ReplayEnvelope[]
}

export const CONTROL_GRAPH_REPLAY_MODE =
  "observability_only"

export function deterministicReplayId(
  topologyHash: string,
  replayHash: string,
): string {
  return [
    "replay",
    topologyHash,
    replayHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  replayId: string,
): string {
  return [
    "continuity",
    topologyHash,
    replayId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "replay-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createReplayRecord(
  topologyHash: string,
  replayHash: string,
  replayScope: string,
): ReplayRecord {
  const replayId =
    deterministicReplayId(
      topologyHash,
      replayHash,
    )

  return {
    replay_id: replayId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        replayId,
      ),
    replay_hash: replayHash,
    replay_scope: replayScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createReplayEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  replayHash: string,
): ReplayEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    replay_hash: replayHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_REPLAY_MODE,
  }
}

export function initializeReplayState():
  ReplayState {
  return {
    replay_records: [],
    replay_envelopes: [],
  }
}

export function appendReplayRecord(
  state: ReplayState,
  record: ReplayRecord,
): ReplayState {
  return {
    ...state,
    replay_records: [
      ...state.replay_records,
      record,
    ],
  }
}

export function appendReplayEnvelope(
  state: ReplayState,
  envelope: ReplayEnvelope,
): ReplayState {
  return {
    ...state,
    replay_envelopes: [
      ...state.replay_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: ReplayRecord,
  recordB: ReplayRecord,
): boolean {
  return (
    recordA.replay_id ===
      recordB.replay_id &&
    recordA.replay_hash ===
      recordB.replay_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: ReplayState,
): boolean {
  return state.replay_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportReplayProjection(
  state: ReplayState,
) {
  return {
    mode: CONTROL_GRAPH_REPLAY_MODE,
    replay_records:
      state.replay_records.length,
    replay_envelopes:
      state.replay_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
