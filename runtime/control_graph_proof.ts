export type ProofMode =
  | "observability_only"
  | "proof_projection"

export interface ProofRecord {
  proof_id: string
  topology_hash: string
  continuity_hash: string
  proof_hash: string
  proof_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ProofEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  proof_hash: string
  exported_at: string
  mode: ProofMode
}

export interface ProofState {
  proof_records: ProofRecord[]
  proof_envelopes: ProofEnvelope[]
}

export const CONTROL_GRAPH_PROOF_MODE =
  "observability_only"

export function deterministicProofId(
  topologyHash: string,
  proofHash: string,
): string {
  return [
    "proof",
    topologyHash,
    proofHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  proofId: string,
): string {
  return [
    "continuity",
    topologyHash,
    proofId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "proof-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createProofRecord(
  topologyHash: string,
  proofHash: string,
  proofScope: string,
): ProofRecord {
  const proofId =
    deterministicProofId(
      topologyHash,
      proofHash,
    )

  return {
    proof_id: proofId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        proofId,
      ),
    proof_hash: proofHash,
    proof_scope: proofScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createProofEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  proofHash: string,
): ProofEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    proof_hash: proofHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_PROOF_MODE,
  }
}

export function initializeProofState():
  ProofState {
  return {
    proof_records: [],
    proof_envelopes: [],
  }
}

export function appendProofRecord(
  state: ProofState,
  record: ProofRecord,
): ProofState {
  return {
    ...state,
    proof_records: [
      ...state.proof_records,
      record,
    ],
  }
}

export function appendProofEnvelope(
  state: ProofState,
  envelope: ProofEnvelope,
): ProofState {
  return {
    ...state,
    proof_envelopes: [
      ...state.proof_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: ProofRecord,
  recordB: ProofRecord,
): boolean {
  return (
    recordA.proof_id ===
      recordB.proof_id &&
    recordA.proof_hash ===
      recordB.proof_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: ProofState,
): boolean {
  return state.proof_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportProofProjection(
  state: ProofState,
) {
  return {
    mode: CONTROL_GRAPH_PROOF_MODE,
    proof_records:
      state.proof_records.length,
    proof_envelopes:
      state.proof_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
