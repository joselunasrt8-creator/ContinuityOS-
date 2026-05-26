import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — replay convergence assessment ≠ execution authority
export const creates_authority = false as const
export const replay_neutral = true as const

// Canonical distributed replay convergence states.
// REPLAY_SAFE:               Nonce not consumed anywhere in observed topology.
// REPLAY_CONSUMED:           Nonce consumed; UNUSED=false globally; no re-use permitted.
// REPLAY_DIVERGENT:          Nonce consumed on one shard, not yet observed on another; partition active.
// REPLAY_PARTITION_SUSPENDED: Topology below threshold; global replay state unconfirmable; fail-closed.
// NULL:                      Hard failure — replay violation detected or invalid state.
export type ReplayConvergenceState =
  | 'REPLAY_SAFE'
  | 'REPLAY_CONSUMED'
  | 'REPLAY_DIVERGENT'
  | 'REPLAY_PARTITION_SUSPENDED'
  | 'NULL'

// A single shard's observation of a nonce consumption event.
export type NonceConsumptionEvidence = {
  readonly invocation_nonce: string
  readonly decision_id: string
  readonly consumed_at: string    // ISO 8601 timestamp
  readonly shard_id: string       // which shard observed this consumption
  readonly causal_index: number   // from causal clock (#1346); used for canonical tie-break
}

// Builds a deterministic ID for a nonce consumption evidence record.
export function buildNonceConsumptionId(
  invocation_nonce: string,
  decision_id: string,
  consumed_at: string,
): string {
  return `nce_${sha256Hex(canonicalize({ invocation_nonce, decision_id, consumed_at }))}`
}

// Returns true if the nonce appears in any evidence record.
// Once a nonce is consumed anywhere in the topology it is permanently consumed.
export function isNonceConsumedGlobally(
  nonce: string,
  evidence: readonly NonceConsumptionEvidence[],
): boolean {
  return evidence.some((e) => e.invocation_nonce === nonce)
}

// Returns true when local and remote shards disagree about whether a nonce is consumed.
// Divergence = one side has evidence, the other does not; only meaningful during partition.
export function hasReplayDivergence(
  nonce: string,
  local_evidence: readonly NonceConsumptionEvidence[],
  remote_evidence: readonly NonceConsumptionEvidence[],
): boolean {
  const localConsumed = isNonceConsumedGlobally(nonce, local_evidence)
  const remoteConsumed = isNonceConsumedGlobally(nonce, remote_evidence)
  return localConsumed !== remoteConsumed
}

// Anti-entropy merge: produces the canonical union of local and remote evidence.
// Deduplication by (invocation_nonce, decision_id, shard_id).
// Consumed nonces remain consumed — merging never removes evidence.
export function mergeConsumptionEvidence(
  local: readonly NonceConsumptionEvidence[],
  remote: readonly NonceConsumptionEvidence[],
): NonceConsumptionEvidence[] {
  const seen = new Set<string>()
  const result: NonceConsumptionEvidence[] = []
  for (const e of [...local, ...remote]) {
    const key = `${e.invocation_nonce}:${e.decision_id}:${e.shard_id}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(e)
    }
  }
  return result
}

// When multiple shards have consumed evidence for the same nonce (replay conflict),
// returns the canonical winner: earliest causal_index; ties broken by lexicographic consumed_at.
// Returns null for empty input.
export function resolveReplayConflict(
  evidence: readonly NonceConsumptionEvidence[],
): NonceConsumptionEvidence | null {
  if (evidence.length === 0) return null
  return [...evidence].sort((a, b) => {
    if (a.causal_index !== b.causal_index) return a.causal_index - b.causal_index
    return a.consumed_at < b.consumed_at ? -1 : a.consumed_at > b.consumed_at ? 1 : 0
  })[0]
}

// Classifies the distributed replay convergence state for a nonce given observed evidence.
//
// Rules (in priority order):
// 1. No topology visibility → REPLAY_PARTITION_SUSPENDED (fail-closed)
// 2. Nonce consumed on both sides consistently → REPLAY_CONSUMED
// 3. Nonce consumed nowhere → REPLAY_SAFE
// 4. Nonce consumed on one side but not the other (divergence) → REPLAY_DIVERGENT
// 5. Fallback (should not be reached in well-formed input) → NULL
export function classifyReplayConvergence(
  nonce: string,
  local_evidence: readonly NonceConsumptionEvidence[],
  remote_evidence: readonly NonceConsumptionEvidence[],
  topology_present: boolean,
): ReplayConvergenceState {
  if (!topology_present) return 'REPLAY_PARTITION_SUSPENDED'

  const localConsumed = isNonceConsumedGlobally(nonce, local_evidence)
  const remoteConsumed = isNonceConsumedGlobally(nonce, remote_evidence)

  if (localConsumed && remoteConsumed) return 'REPLAY_CONSUMED'
  if (!localConsumed && !remoteConsumed) return 'REPLAY_SAFE'
  if (localConsumed !== remoteConsumed) return 'REPLAY_DIVERGENT'

  return 'NULL'
}

// Maps a ReplayConvergenceState to the partition-finality predicate impact on UNUSED (R predicate).
// Returns true only when the nonce is globally confirmed safe to use.
export function replayStateToUnusedPredicate(state: ReplayConvergenceState): boolean {
  return state === 'REPLAY_SAFE'
}
