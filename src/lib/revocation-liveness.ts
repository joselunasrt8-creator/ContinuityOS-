import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — revocation channel liveness ≠ execution authority
export const creates_authority = false as const

export type RevocationChannelType =
  | 'authority'
  | 'continuity'
  | 'proof'
  | 'epoch'
  | 'session'
  | 'validation'

export type RevocationLivenessRecord = {
  readonly revocation_liveness_id: string
  readonly channel_id: string
  readonly channel_scope: string
  readonly channel_type: RevocationChannelType
  readonly last_observed_at: string
  readonly max_allowed_silence_ms: number
  readonly observed_silence_ms: number
  readonly within_sla: 0 | 1
  readonly federation_profile_id: string | null
  readonly finality_classification_id: string | null
  readonly quorum_attestation_id: string | null
  readonly epoch_id: string | null              // populated by #1249
  readonly reason_code: string
  readonly created_at: string
  readonly evidence_only: 1
  readonly creates_authority: 0
  readonly creates_execution: 0
  readonly replay_neutral: 1
  readonly mutates_registry: 0
  readonly raw_production_apply_path: 'DENIED'
}

// Derives the canonical revocation_liveness_id.
// Deterministic: same inputs always yield the same ID.
export function buildRevocationLivenessId(
  channel_id: string,
  last_observed_at: string,
  created_at: string,
): string {
  const canonical = canonicalize({ channel_id, last_observed_at, created_at })
  return `rlr_${sha256Hex(canonical)}`
}

// Evaluates whether a revocation channel is within its liveness SLA.
// Returns observed_silence_ms and the within_sla flag.
// now_ms defaults to Date.now() if not provided (injectable for testing).
export function evaluateLiveness(
  last_observed_at: string,
  max_allowed_silence_ms: number,
  now_ms: number = Date.now(),
): {
  observed_silence_ms: number
  within_sla: 0 | 1
} {
  const last_ms = Date.parse(last_observed_at)
  if (!Number.isFinite(last_ms)) {
    return { observed_silence_ms: max_allowed_silence_ms + 1, within_sla: 0 }
  }
  const observed_silence_ms = Math.max(0, now_ms - last_ms)
  const within_sla: 0 | 1 = observed_silence_ms <= max_allowed_silence_ms ? 1 : 0
  return { observed_silence_ms, within_sla }
}

// Determines whether the L (lineage freshness) predicate is satisfied across
// a set of liveness records. L=true only if all channels are within SLA.
export function evaluateLPredicate(records: Pick<RevocationLivenessRecord, 'within_sla'>[]): boolean {
  if (records.length === 0) return false
  return records.every((r) => r.within_sla === 1)
}
