export type AuthorityMode =
  | "observability_only"
  | "authority_projection"

export interface AuthorityRecord {
  authority_id: string
  topology_hash: string
  continuity_hash: string
  authority_hash: string
  authority_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface AuthorityEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  authority_hash: string
  exported_at: string
  mode: AuthorityMode
}

export interface AuthorityState {
  authority_records: AuthorityRecord[]
  authority_envelopes: AuthorityEnvelope[]
}

export const CONTROL_GRAPH_AUTHORITY_MODE =
  "observability_only"

export function deterministicAuthorityId(
  topologyHash: string,
  authorityHash: string,
): string {
  return [
    "authority",
    topologyHash,
    authorityHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  authorityId: string,
): string {
  return [
    "continuity",
    topologyHash,
    authorityId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "authority-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createAuthorityRecord(
  topologyHash: string,
  authorityHash: string,
  authorityScope: string,
): AuthorityRecord {
  const authorityId =
    deterministicAuthorityId(
      topologyHash,
      authorityHash,
    )

  return {
    authority_id: authorityId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        authorityId,
      ),
    authority_hash: authorityHash,
    authority_scope: authorityScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createAuthorityEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  authorityHash: string,
): AuthorityEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    authority_hash: authorityHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_AUTHORITY_MODE,
  }
}

export function initializeAuthorityState():
  AuthorityState {
  return {
    authority_records: [],
    authority_envelopes: [],
  }
}

export function appendAuthorityRecord(
  state: AuthorityState,
  record: AuthorityRecord,
): AuthorityState {
  return {
    ...state,
    authority_records: [
      ...state.authority_records,
      record,
    ],
  }
}

export function appendAuthorityEnvelope(
  state: AuthorityState,
  envelope: AuthorityEnvelope,
): AuthorityState {
  return {
    ...state,
    authority_envelopes: [
      ...state.authority_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: AuthorityRecord,
  recordB: AuthorityRecord,
): boolean {
  return (
    recordA.authority_id ===
      recordB.authority_id &&
    recordA.authority_hash ===
      recordB.authority_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: AuthorityState,
): boolean {
  return state.authority_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportAuthorityProjection(
  state: AuthorityState,
) {
  return {
    mode: CONTROL_GRAPH_AUTHORITY_MODE,
    authority_records:
      state.authority_records.length,
    authority_envelopes:
      state.authority_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
