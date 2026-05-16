export type ValidatorMode =
  | "observability_only"
  | "validator_projection"

export interface ValidatorRecord {
  validator_id: string
  topology_hash: string
  continuity_hash: string
  validation_hash: string
  validator_scope: string
  created_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ValidatorEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  validation_hash: string
  exported_at: string
  mode: ValidatorMode
}

export interface ValidatorState {
  validator_records: ValidatorRecord[]
  validator_envelopes: ValidatorEnvelope[]
}

export const CONTROL_GRAPH_VALIDATOR_MODE =
  "observability_only"

export function deterministicValidatorId(
  topologyHash: string,
  validationHash: string,
): string {
  return [
    "validator",
    topologyHash,
    validationHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  validatorId: string,
): string {
  return [
    "continuity",
    topologyHash,
    validatorId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "validator-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createValidatorRecord(
  topologyHash: string,
  validationHash: string,
  validatorScope: string,
): ValidatorRecord {
  const validatorId =
    deterministicValidatorId(
      topologyHash,
      validationHash,
    )

  return {
    validator_id: validatorId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        validatorId,
      ),
    validation_hash: validationHash,
    validator_scope: validatorScope,
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createValidatorEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  validationHash: string,
): ValidatorEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    validation_hash: validationHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_VALIDATOR_MODE,
  }
}

export function initializeValidatorState():
  ValidatorState {
  return {
    validator_records: [],
    validator_envelopes: [],
  }
}

export function appendValidatorRecord(
  state: ValidatorState,
  record: ValidatorRecord,
): ValidatorState {
  return {
    ...state,
    validator_records: [
      ...state.validator_records,
      record,
    ],
  }
}

export function appendValidatorEnvelope(
  state: ValidatorState,
  envelope: ValidatorEnvelope,
): ValidatorState {
  return {
    ...state,
    validator_envelopes: [
      ...state.validator_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  recordA: ValidatorRecord,
  recordB: ValidatorRecord,
): boolean {
  return (
    recordA.validator_id ===
      recordB.validator_id &&
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
  state: ValidatorState,
): boolean {
  return state.validator_records.every(
    (record) =>
      record.runtime_authority ===
        false &&
      record.replay_neutral ===
        true,
  )
}

export function exportValidatorProjection(
  state: ValidatorState,
) {
  return {
    mode: CONTROL_GRAPH_VALIDATOR_MODE,
    validator_records:
      state.validator_records.length,
    validator_envelopes:
      state.validator_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
