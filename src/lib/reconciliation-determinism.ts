import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — reconciliation ≠ authority; merging registries does not create new authority.
export const creates_authority = false as const
export const replay_neutral = true as const

// Canonical reconciliation finality states.
// LOCAL_RECONCILED:             Single-shard consistent view; no competing heads.
// GLOBAL_RECONCILED_CANDIDATE:  All observed shards agree on canonical head; topology present.
// AMBIGUOUS_RECONCILIATION:     Competing heads with unresolved tie-break; execution blocked.
// AMBIGUOUS_REQUIRES_EPOCH:     Settlement deferred — epoch boundary must be resolved first.
// NULL_RECONCILIATION:          Hard failure; irreconcilable state or missing required evidence.
export type ReconciliationFinality =
  | 'LOCAL_RECONCILED'
  | 'GLOBAL_RECONCILED_CANDIDATE'
  | 'AMBIGUOUS_RECONCILIATION'
  | 'AMBIGUOUS_REQUIRES_EPOCH'
  | 'NULL_RECONCILIATION'

// A registry head represents the current canonical state of a registry scope on one shard.
export type RegistryHead = {
  readonly head_hash: string             // sha256 of the canonical head state
  readonly shard_id: string             // which shard produced this head
  readonly causal_index: number         // from causal clock (#1346); lower = earlier
  readonly quorum_weight: number        // attestation weight from #1343; 0..1
  readonly reconciliability_score: number  // 0..1; higher = more verified ancestry coverage
  readonly observed_at: string          // ISO 8601; used as final tiebreak after hash
  readonly epoch_id: string | null      // nullable forward-placeholder (#1249)
}

// Builds a deterministic ID for a reconciliation head record.
export function buildReconciliationHeadId(
  head_hash: string,
  shard_id: string,
  observed_at: string,
): string {
  return `rch_${sha256Hex(canonicalize({ head_hash, shard_id, observed_at }))}`
}

// Computes a canonical sort key for a RegistryHead for tie-break ordering.
// Lower sort key = higher priority (wins tie-break).
// Ordering: reconciliability DESC → quorum_weight DESC → causal_index ASC → observed_at ASC → head_hash ASC
export function headSortKey(h: RegistryHead): [number, number, number, string, string] {
  return [
    -h.reconciliability_score,   // negate: higher score = lower sort key = wins
    -h.quorum_weight,            // negate: higher weight = lower sort key = wins
    h.causal_index,              // lower index = earlier = wins
    h.observed_at,               // earlier timestamp = wins
    h.head_hash,                 // lexicographic last resort
  ]
}

// Deterministic tie-break: selects the single canonical head from competing heads.
// Returns null for empty input.
export function selectCanonicalHead(heads: readonly RegistryHead[]): RegistryHead | null {
  if (heads.length === 0) return null
  return [...heads].sort((a, b) => {
    const ka = headSortKey(a)
    const kb = headSortKey(b)
    for (let i = 0; i < ka.length; i++) {
      const av = ka[i]
      const bv = kb[i]
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av !== bv) return av - bv
      } else {
        const as_ = av as string
        const bs_ = bv as string
        if (as_ < bs_) return -1
        if (as_ > bs_) return 1
      }
    }
    return 0
  })[0]
}

// Returns true if the head's observed_at is older than the staleness horizon.
export function isReconciliationStale(head: RegistryHead, staleness_horizon_ms: number, now_ms?: number): boolean {
  const now = now_ms ?? Date.now()
  const observed = new Date(head.observed_at).getTime()
  if (!Number.isFinite(observed)) return true
  return now - observed > staleness_horizon_ms
}

// Anti-entropy merge: deduplicates heads by (head_hash, shard_id).
// Append-only — losing heads are preserved as historical evidence.
// Consumed authority remains consumed regardless of merge.
export function mergeRegistryHeads(
  local: readonly RegistryHead[],
  remote: readonly RegistryHead[],
): RegistryHead[] {
  const seen = new Set<string>()
  const result: RegistryHead[] = []
  for (const h of [...local, ...remote]) {
    const key = `${h.head_hash}:${h.shard_id}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(h)
    }
  }
  return result
}

// Groups heads by head_hash — heads sharing the same hash represent shard agreement.
function groupByHash(heads: readonly RegistryHead[]): Map<string, RegistryHead[]> {
  const map = new Map<string, RegistryHead[]>()
  for (const h of heads) {
    const group = map.get(h.head_hash) ?? []
    group.push(h)
    map.set(h.head_hash, group)
  }
  return map
}

// Classifies the reconciliation finality for a set of observed registry heads.
//
// Rules (in priority order):
// 1. Empty heads → NULL_RECONCILIATION
// 2. No topology visibility → LOCAL_RECONCILED when single unique head; AMBIGUOUS when multiple
// 3. All heads share the same hash (full agreement) + topology → GLOBAL_RECONCILED_CANDIDATE
// 4. Single unique head with no remote shards → LOCAL_RECONCILED
// 5. Competing heads with different epoch_ids and no tie-break → AMBIGUOUS_REQUIRES_EPOCH
// 6. Competing heads with resolved tie-break available → AMBIGUOUS_RECONCILIATION (tie-break needed)
export function classifyReconciliationFinality(
  heads: readonly RegistryHead[],
  topology_present: boolean,
): ReconciliationFinality {
  if (heads.length === 0) return 'NULL_RECONCILIATION'

  const grouped = groupByHash(heads)
  const uniqueHashes = grouped.size

  if (uniqueHashes === 1) {
    // All observed heads agree
    return topology_present ? 'GLOBAL_RECONCILED_CANDIDATE' : 'LOCAL_RECONCILED'
  }

  // Competing heads — check if epoch boundary is involved
  const epochIds = new Set(heads.map((h) => h.epoch_id))
  const hasEpochConflict = epochIds.size > 1 && epochIds.has(null) === false
  if (hasEpochConflict) return 'AMBIGUOUS_REQUIRES_EPOCH'

  // Multiple unique hashes — canonical tie-break available but ambiguous
  return 'AMBIGUOUS_RECONCILIATION'
}

// Maps ReconciliationFinality to the RECONCILABLE predicate contribution.
// Only GLOBAL_RECONCILED_CANDIDATE satisfies RECONCILABLE for global legitimacy claims.
// LOCAL_RECONCILED satisfies RECONCILABLE for local-only claims.
export function reconciliationFinalityToReconcilablePredicate(
  finality: ReconciliationFinality,
  require_global: boolean,
): boolean {
  if (finality === 'GLOBAL_RECONCILED_CANDIDATE') return true
  if (finality === 'LOCAL_RECONCILED' && !require_global) return true
  return false
}
