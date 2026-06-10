// Bounded NULL response + correlation ID audit binding for the governed
// filesystem-write route.
//
// The agent-visible NULL response is intentionally minimal and non-enumerating:
// it carries an opaque correlation_id and nothing else. The full diagnostic
// detail (stage, denial_reason, failure_class, reason_class, etc.) is recorded
// only in the internal NullAuditRegistryPort, keyed by the same correlation_id.
//
// Invariants:
//   - reason_class is internal-only — never serialized into the agent-visible
//     response. Exposing even the coarse category would let an agent
//     binary-search policy/authority/replay boundaries via repeated NULLs.
//   - A NullAuditRecord is audit/observability only:
//       NULL audit record != proof
//       NULL audit record != authority
//       NULL audit record != replay eligibility
//     execution_performed and proof_emitted are structurally false.

export type ReasonClass = 'REPLAY_NULL' | 'POLICY_NULL' | 'MUTATION_NULL'

export type BoundedNullResponse = {
  readonly result: 'NULL'
  readonly execution_performed: false
  readonly proof_emitted: false
  readonly correlation_id: string
}

export type NullAuditRecord = {
  readonly correlation_id: string
  readonly result: 'NULL'
  readonly reason_class: ReasonClass
  readonly stage: string | null
  readonly denial_reason: string | null
  readonly agent_id: string | null
  readonly session_id: string | null
  readonly atao_id: string | null
  readonly canonical_aeo_hash: string | null
  readonly decision_id: string | null
  readonly replay_nonce: string | null
  readonly validator_version: string
  readonly execution_performed: false
  readonly proof_emitted: false
  readonly created_at: string
}

export const NULL_AUDIT_VALIDATOR_VERSION = 'omega_fs_v1' as const

const CORRELATION_ID_PREFIX = 'null_evt_' as const

// CSPRNG-backed opaque handle: 128 bits of randomness as lowercase hex.
// No timestamp, counter, or request-derived data is embedded.
export function generateCorrelationId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return CORRELATION_ID_PREFIX + hex
}

// ── Reason-class lookup tables ─────────────────────────────────────────────────
// Internal categorization only — never returned to the agent. Default: POLICY_NULL.

const REPLAY_VALUES = new Set<string>([
  'REPLAY_NONCE_CONSUMED',
  'REPLAY_NOT_ALLOWED',
  'REPLAY_NOT_DETERMINABLE',
  'REPLAY_STATE_UNKNOWN',
  'REPLAY_NONCE_MISSING',
  'REPLAY_NONCE_CONSUMED_OR_RESERVED',
  'AEO_ALREADY_CONSUMED',
  'replay_nonce_decision_mismatch',
])

const MUTATION_VALUES = new Set<string>([
  'AEO_HASH_MISMATCH',
  'OBJECT_HASH_MISMATCH',
  'AEO_SHAPE_INVALID',
  'INVALID_AEO_SHAPE',
  'CANONICAL_VALIDATION_NULL',
  'ATAO_CAPTURE_FAILED',
  'AEO_COMPILE_FAILED',
  'NULL_GATEWAY_INPUT',
  'NULL_VALIDATOR_CONTEXT',
  'NULL_WRITER',
  'NULL_REPLAY_REGISTRY',
  'NULL_EMITTED_AT',
  'NULL_AEO_INPUT',
  'NULL_VALIDATED_HASH',
  'NULL_EXECUTOR',
  'EXTRA_FIELD_PRESENT',
  'MISSING_REQUIRED_FIELD',
  'PRE_WRITE_HASH_MISSING',
  'PRE_WRITE_HASH_MISMATCH',
  'TARGET_PRESTATE_UNOBSERVABLE',
  'OBSERVATION_DENIED',
  'OBSERVATION_TIMEOUT',
  'OBSERVATION_UNAVAILABLE',
  'STALE_PRESTATE',
  'DIFF_HASH_MISMATCH',
  'DIFF_INSPECTION_FAILED',
  'DIFF_NOT_APPLICABLE',
  'WRITER_CAPTURE_MISSING',
  'EVIDENCE_MISSING_EXECUTION_ID',
  'EVIDENCE_MISSING_EXECUTED_AT',
  'EVIDENCE_SURFACE_MISMATCH',
  'EVIDENCE_ADAPTER_SPECIFIC_NULL',
  'EXECUTOR_RETURNED_NULL',
])

// Anything not matched above (authority, policy, path/operation, finality,
// malformed-request/missing-fields) falls through to POLICY_NULL.
export function classifyReasonClass(input: {
  readonly stage?: string | null
  readonly reason?: string | null
  readonly failure_class?: string | null
  readonly null_reason?: string | null
}): ReasonClass {
  const candidates = [input.failure_class, input.null_reason, input.reason, input.stage]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (REPLAY_VALUES.has(candidate)) return 'REPLAY_NULL'
    if (MUTATION_VALUES.has(candidate)) return 'MUTATION_NULL'
  }
  return 'POLICY_NULL'
}

export function buildBoundedNullResponse(correlation_id: string): BoundedNullResponse {
  return {
    result: 'NULL',
    execution_performed: false,
    proof_emitted: false,
    correlation_id,
  }
}
