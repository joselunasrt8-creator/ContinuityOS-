import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — epoch observation ≠ epoch authority.
export const creates_authority = false as const

// Nine canonical epoch finality states.
export type EpochFinalityStatus =
  | 'EPOCH_LOCAL'
  | 'EPOCH_GLOBAL_CANDIDATE'
  | 'EPOCH_GLOBAL_AUTHORITATIVE'
  | 'EPOCH_AMBIGUOUS'
  | 'EPOCH_STALE_VISIBLE'
  | 'EPOCH_PARTITION_SUSPENDED'
  | 'EPOCH_CONFLICTED'
  | 'EPOCH_REVOKED'
  | 'EPOCH_NULL'

// An epoch record as stored in epoch_registry.
export type EpochRecord = {
  readonly epoch_id: string
  readonly epoch_scope: string
  readonly epoch_finality_status: EpochFinalityStatus
  readonly quorum_attestation_id: string | null
  readonly epoch_quorum_profile: string | null
  readonly epoch_causal_frontier: number | null
  readonly epoch_replay_frontier: string | null
  readonly epoch_reconciliation_frontier: string | null
  readonly epoch_revocation_frontier: string | null
  readonly finality_classification_id: string | null
  readonly supersedes_epoch_id: string | null
  readonly reason_code: string
  readonly created_at: string
}

// Builds a deterministic ID for an epoch record.
// Derived from scope + created_at + reason_code to be globally unique and non-guessable.
export function buildEpochId(
  epoch_scope: string,
  created_at: string,
  reason_code: string,
): string {
  return `epoch_${sha256Hex(canonicalize({ epoch_scope, created_at, reason_code }))}`
}

// Returns true only when the epoch is in EPOCH_GLOBAL_AUTHORITATIVE state.
// This is the only state that supports GLOBAL_VALID legitimacy decisions.
export function isEpochGloballyAuthoritative(status: EpochFinalityStatus): boolean {
  return status === 'EPOCH_GLOBAL_AUTHORITATIVE'
}

// Returns true when the epoch supports LOCAL_VALID decisions (local scope only).
export function isEpochLocallyValid(status: EpochFinalityStatus): boolean {
  return status === 'EPOCH_LOCAL' || status === 'EPOCH_GLOBAL_CANDIDATE' || status === 'EPOCH_GLOBAL_AUTHORITATIVE'
}

// Returns true when the epoch is terminal — no upgrade path available.
export function isEpochTerminal(status: EpochFinalityStatus): boolean {
  return status === 'EPOCH_NULL'
}

// Returns true when the epoch is in a degraded state that blocks all decisions.
export function isEpochBlocking(status: EpochFinalityStatus): boolean {
  return (
    status === 'EPOCH_AMBIGUOUS' ||
    status === 'EPOCH_PARTITION_SUSPENDED' ||
    status === 'EPOCH_CONFLICTED' ||
    status === 'EPOCH_REVOKED' ||
    status === 'EPOCH_NULL'
  )
}

// Classifies the epoch finality status from observable evidence.
// Inputs represent the four evidence axes required for EPOCH_GLOBAL_AUTHORITATIVE.
// Fail-closed: any missing evidence degrades to the most restrictive valid state.
export function classifyEpochFinality(opts: {
  topology_present: boolean
  quorum_met: boolean
  revocation_live: boolean
  has_competing_head: boolean
  is_revoked: boolean
}): EpochFinalityStatus {
  const { topology_present, quorum_met, revocation_live, has_competing_head, is_revoked } = opts

  if (is_revoked) return 'EPOCH_REVOKED'
  if (!topology_present) return 'EPOCH_PARTITION_SUSPENDED'
  if (has_competing_head) return 'EPOCH_CONFLICTED'
  if (!quorum_met) return 'EPOCH_LOCAL'
  if (!revocation_live) return 'EPOCH_STALE_VISIBLE'

  return 'EPOCH_GLOBAL_AUTHORITATIVE'
}

// Maps epoch finality status to the EPOCH_VALID predicate contribution.
// Only EPOCH_GLOBAL_AUTHORITATIVE satisfies EPOCH_VALID for global claims.
// EPOCH_LOCAL and EPOCH_GLOBAL_CANDIDATE satisfy EPOCH_VALID for local-only claims.
export function epochFinalityToEpochValidPredicate(
  status: EpochFinalityStatus,
  require_global: boolean,
): boolean {
  if (status === 'EPOCH_GLOBAL_AUTHORITATIVE') return true
  if (!require_global && (status === 'EPOCH_LOCAL' || status === 'EPOCH_GLOBAL_CANDIDATE')) return true
  return false
}

// Determines the valid state transition from a prior epoch status to a candidate next status.
// Returns true when the transition is permitted; false when it violates the state machine.
// EPOCH_NULL is terminal — no transitions out of NULL are permitted.
export function isValidEpochTransition(
  from: EpochFinalityStatus,
  to: EpochFinalityStatus,
): boolean {
  if (from === 'EPOCH_NULL') return false   // terminal

  const allowed: Record<EpochFinalityStatus, readonly EpochFinalityStatus[]> = {
    EPOCH_LOCAL: ['EPOCH_GLOBAL_CANDIDATE', 'EPOCH_AMBIGUOUS', 'EPOCH_PARTITION_SUSPENDED', 'EPOCH_NULL'],
    EPOCH_GLOBAL_CANDIDATE: ['EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_AMBIGUOUS', 'EPOCH_PARTITION_SUSPENDED', 'EPOCH_NULL'],
    EPOCH_GLOBAL_AUTHORITATIVE: ['EPOCH_STALE_VISIBLE', 'EPOCH_CONFLICTED', 'EPOCH_REVOKED', 'EPOCH_AMBIGUOUS', 'EPOCH_NULL'],
    EPOCH_AMBIGUOUS: ['EPOCH_LOCAL', 'EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_NULL'],
    EPOCH_STALE_VISIBLE: ['EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_LOCAL', 'EPOCH_NULL'],
    EPOCH_PARTITION_SUSPENDED: ['EPOCH_LOCAL', 'EPOCH_GLOBAL_CANDIDATE', 'EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_NULL'],
    EPOCH_CONFLICTED: ['EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_AMBIGUOUS', 'EPOCH_NULL'],
    EPOCH_REVOKED: ['EPOCH_NULL'],
    EPOCH_NULL: [],
  }

  return (allowed[from] as readonly string[]).includes(to)
}
