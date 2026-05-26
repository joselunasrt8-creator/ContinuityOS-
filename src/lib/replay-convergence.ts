import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — replay convergence assessment ≠ execution authority
export const creates_authority = false as const
export const replay_neutral = true as const

// ── Replay conflict classes ────────────────────────────────────────────────────
// Each class maps deterministically to NULL | AMBIGUOUS | STALE_VISIBLE | PARTITION_SUSPENDED.
// Never GLOBAL_VALID.
export type ReplayConflictClass =
  | 'DUPLICATE_NONCE_OBSERVED'
  | 'PARTITION_REPLAY_DIVERGENCE'
  | 'STALE_PROOF_REUSE'
  | 'DETACHED_REPLAY_LINEAGE'
  | 'REPLAY_CHRONOLOGY_CONFLICT'
  | 'REPLAY_ANTI_ENTROPY_REQUIRED'
  | 'REPLAY_CONVERGENCE_NULL'
  | 'REPLAY_RESURRECTION'

export type ReplayConflictClassification = 'NULL' | 'AMBIGUOUS' | 'STALE_VISIBLE' | 'PARTITION_SUSPENDED'

// Deterministic mapping: conflict class → terminal classification.
// consumed replay eligibility must remain consumed — no path to GLOBAL_VALID.
export const REPLAY_CONFLICT_CLASS_MAP: Readonly<Record<ReplayConflictClass, ReplayConflictClassification>> = Object.freeze({
  DUPLICATE_NONCE_OBSERVED: 'NULL',
  PARTITION_REPLAY_DIVERGENCE: 'PARTITION_SUSPENDED',
  STALE_PROOF_REUSE: 'STALE_VISIBLE',
  DETACHED_REPLAY_LINEAGE: 'NULL',
  REPLAY_CHRONOLOGY_CONFLICT: 'AMBIGUOUS',
  REPLAY_ANTI_ENTROPY_REQUIRED: 'PARTITION_SUSPENDED',
  REPLAY_CONVERGENCE_NULL: 'NULL',
  REPLAY_RESURRECTION: 'NULL',
})

export interface ReplayConflictResult {
  readonly classification: ReplayConflictClassification
  readonly conflict_class: ReplayConflictClass
  readonly consumed_set: readonly string[]
  readonly evidence_refs: readonly string[]
  readonly creates_authority: false
  readonly restores_replay: false
}

// Classifies a replay conflict deterministically.
// restores_replay is always false — consumed state is permanent.
export function classifyReplayConflict(
  conflict_class: ReplayConflictClass,
  consumed_nonces: readonly string[],
  evidence_refs: readonly string[],
): ReplayConflictResult {
  return Object.freeze({
    classification: REPLAY_CONFLICT_CLASS_MAP[conflict_class],
    conflict_class,
    consumed_set: Object.freeze([...consumed_nonces]),
    evidence_refs: Object.freeze([...evidence_refs]),
    creates_authority: false,
    restores_replay: false,
  })
}

// ── Anti-entropy replay repair ─────────────────────────────────────────────────
// Pure evidence-only logic that compares replay state across partitions.
// Anti-entropy repair may propagate consumed state but must never unconsume a nonce.

export interface AntiEntropyReplayRepairInput {
  readonly decision_id: string
  readonly invocation_nonce: string
  readonly partition_a_evidence: readonly NonceConsumptionEvidence[]
  readonly partition_b_evidence: readonly NonceConsumptionEvidence[]
  readonly partition_healed: boolean
}

export interface AntiEntropyReplayRepairResult {
  readonly classification: ReplayConflictClassification
  readonly conflict_class: ReplayConflictClass
  readonly consumed_set: readonly string[]
  readonly evidence_refs: readonly string[]
  readonly creates_authority: false
  readonly restores_replay: false
  readonly nonce_permanently_consumed: boolean
}

// Anti-entropy repair: merges evidence from both partitions and classifies the nonce state.
//
// Rules:
// - Merge is additive only: consumed nonces remain consumed after merge.
// - If nonce consumed in merged set AND partition healed → REPLAY_RESURRECTION → NULL.
//   (Replay attempt post-healing on consumed nonce cannot succeed.)
// - If nonce consumed in merged set but partition not yet healed → PARTITION_REPLAY_DIVERGENCE → PARTITION_SUSPENDED.
// - If nonce not consumed anywhere → REPLAY_ANTI_ENTROPY_REQUIRED → PARTITION_SUSPENDED.
//
// Invariant: restores_replay is always false. Anti-entropy cannot unconsume a nonce.
export function antiEntropyReplayRepair(
  input: AntiEntropyReplayRepairInput,
): AntiEntropyReplayRepairResult {
  const merged = mergeConsumptionEvidence(input.partition_a_evidence, input.partition_b_evidence)
  const nonce_permanently_consumed = isNonceConsumedGlobally(input.invocation_nonce, merged)

  let conflict_class: ReplayConflictClass
  if (nonce_permanently_consumed) {
    // Consumed on any partition → permanently consumed; post-heal replay attempt = resurrection
    conflict_class = input.partition_healed ? 'REPLAY_RESURRECTION' : 'PARTITION_REPLAY_DIVERGENCE'
  } else {
    // Nonce not seen in any partition evidence → anti-entropy still required
    conflict_class = 'REPLAY_ANTI_ENTROPY_REQUIRED'
  }

  const classification = REPLAY_CONFLICT_CLASS_MAP[conflict_class]
  const consumed_set = Object.freeze(merged.map((e) => e.invocation_nonce))
  const evidence_refs = Object.freeze(
    merged.map((e) => buildNonceConsumptionId(e.invocation_nonce, e.decision_id, e.consumed_at)),
  )

  return Object.freeze({
    classification,
    conflict_class,
    consumed_set,
    evidence_refs,
    creates_authority: false,
    restores_replay: false,
    nonce_permanently_consumed,
  })
}

// ── Partition-heal consumed set merge ─────────────────────────────────────────
// union(consumed_nonces across partitions) = permanently consumed replay set.
// Healing never removes evidence; consumed nonces remain consumed across partition cycles.
export function mergeConsumedReplayState(
  partition_sets: readonly (readonly NonceConsumptionEvidence[])[],
): readonly NonceConsumptionEvidence[] {
  let merged: NonceConsumptionEvidence[] = []
  for (const partition of partition_sets) {
    merged = mergeConsumptionEvidence(merged, partition)
  }
  return Object.freeze(merged)
}

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
