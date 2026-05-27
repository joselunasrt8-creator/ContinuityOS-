import { sha256Hex, canonicalize } from '../canonical.js'
import {
  type EpochFinalityStatus,
  isEpochBlocking,
  isEpochGloballyAuthoritative,
} from './epoch-substrate.js'

// Evidence-only — classification ≠ execution authority
export const creates_authority = false as const

export type FinalityClassification =
  | 'LOCAL_VALID'
  | 'CONVERGENCE_VALID'
  | 'GLOBAL_VALID'
  | 'AMBIGUOUS'
  | 'STALE_VISIBLE'
  | 'PARTITION_SUSPENDED'
  | 'NULL'

export type PartitionFinalityState =
  | "PARTITION_OPEN"
  | "PARTITION_PENDING_SETTLEMENT"
  | "PARTITION_SETTLED"
  | "PARTITION_RECONCILED"
  | "PARTITION_DRIFT"
  | "NULL"

export type PartitionAdmissionDecision =
  | { ok: true, state: "PARTITION_SETTLED" | "PARTITION_RECONCILED" }
  | { ok: false, reason: "missing_partition_metadata" | "ambiguous_partition_ordering" | "finality_hash_drift" | "reconciliation_ambiguity" | "detached_lineage" | "partition_visibility_loss" | "stale_partition_settlement_evidence" | "non_deterministic_partition_reconciliation" | "partition_unsettled" | "partition_drift" }

export function classifyPartitionFinalityAdmission(input: {
  partition_finality_state?: unknown
  partition_epoch?: unknown
  partition_closure_hash?: unknown
  canonical_lineage_hash?: unknown
  partition_lineage_hash?: unknown
  topology_visible?: unknown
  reconciliation_deterministic?: unknown
  reconciliation_ordering_deterministic?: unknown
  now_ms?: number
  settlement_observed_at?: unknown
  freshness_window_ms?: number
}): PartitionAdmissionDecision {
  const state = String(input.partition_finality_state || "") as PartitionFinalityState
  const closureHash = String(input.partition_closure_hash || "")
  const canonicalLineage = String(input.canonical_lineage_hash || "")
  const partitionLineage = String(input.partition_lineage_hash || "")
  const topologyVisible = input.topology_visible === true
  const reconciliationDeterministic = input.reconciliation_deterministic === true
  const orderingDeterministic = input.reconciliation_ordering_deterministic === true
  const epoch = Number(input.partition_epoch)
  const observedAtMs = Date.parse(String(input.settlement_observed_at || ""))
  const nowMs = Number.isFinite(input.now_ms) ? Number(input.now_ms) : Date.now()
  const freshnessWindow = Number.isFinite(input.freshness_window_ms) ? Number(input.freshness_window_ms) : 5 * 60_000
  if (!state || !closureHash || !canonicalLineage || !partitionLineage || !Number.isFinite(epoch)) return { ok: false, reason: "missing_partition_metadata" }
  if (!topologyVisible) return { ok: false, reason: "partition_visibility_loss" }
  if (!orderingDeterministic) return { ok: false, reason: "ambiguous_partition_ordering" }
  if (!reconciliationDeterministic) return { ok: false, reason: "non_deterministic_partition_reconciliation" }
  if (!Number.isFinite(observedAtMs) || (nowMs - observedAtMs) > freshnessWindow) return { ok: false, reason: "stale_partition_settlement_evidence" }
  if (canonicalLineage !== partitionLineage) return { ok: false, reason: "detached_lineage" }
  const canonicalClosureHash = sha256Hex(canonicalize({ partition_epoch: epoch, canonical_lineage_hash: canonicalLineage }))
  if (closureHash !== canonicalClosureHash) return { ok: false, reason: "finality_hash_drift" }
  if (state === "PARTITION_DRIFT") return { ok: false, reason: "partition_drift" }
  if (state === "PARTITION_OPEN" || state === "PARTITION_PENDING_SETTLEMENT") return { ok: false, reason: "partition_unsettled" }
  if (state === "NULL") return { ok: false, reason: "reconciliation_ambiguity" }
  if (state === "PARTITION_SETTLED" || state === "PARTITION_RECONCILED") return { ok: true, state }
  return { ok: false, reason: "reconciliation_ambiguity" }
}

export type FinalityObjectType =
  | 'authority'
  | 'aeo'
  | 'execution'
  | 'proof'
  | 'session'
  | 'continuity'
  | 'validation'

// Canonical predicate snapshot: all eleven legitimacy predicates
export type PredicateSnapshot = {
  readonly V: boolean  // validation
  readonly A: boolean  // authority
  readonly U: boolean  // unused (nonce)
  readonly P: boolean  // policy
  readonly R: boolean  // replay-safe
  readonly T: boolean  // topology-visible
  readonly C: boolean  // continuity
  readonly Q: boolean  // quorum
  readonly G: boolean  // global consensus
  readonly L: boolean  // lineage-fresh
  readonly X: boolean  // cryptographic integrity
}

export type FinClassRecord = {
  readonly finality_classification_id: string
  readonly object_hash: string
  readonly object_type: FinalityObjectType
  readonly classification: FinalityClassification
  readonly predicate_snapshot_json: string
  readonly topology_visibility_snapshot_json: string | null
  readonly continuity_id: string | null
  readonly authority_id: string | null
  readonly validation_id: string | null
  readonly proof_id: string | null
  readonly causal_clock_json: string | null   // populated by #1346
  readonly epoch_id: string | null            // populated by #1249
  readonly reason_code: string
  readonly supersedes_classification_id: string | null
  readonly created_at: string
  readonly has_quorum_evidence: 0 | 1
  readonly has_global_consensus_evidence: 0 | 1
  readonly has_lineage_freshness_evidence: 0 | 1
  readonly has_cryptographic_integrity_evidence: 0 | 1
  readonly raw_production_apply_path: 'DENIED'
}

// Derives the canonical finality_classification_id.
// Deterministic: same inputs always yield the same ID.
export function buildFinClassId(
  object_hash: string,
  classification: FinalityClassification,
  created_at: string,
): string {
  const canonical = canonicalize({ object_hash, classification, created_at })
  return `fcr_${sha256Hex(canonical)}`
}

// Derives evidence flag values from a predicate snapshot.
// Does not grant authority — only reflects what evidence is present.
export function evidenceFlagsFromPredicates(p: PredicateSnapshot): {
  has_quorum_evidence: 0 | 1
  has_global_consensus_evidence: 0 | 1
  has_lineage_freshness_evidence: 0 | 1
  has_cryptographic_integrity_evidence: 0 | 1
} {
  return {
    has_quorum_evidence: p.Q ? 1 : 0,
    has_global_consensus_evidence: p.G ? 1 : 0,
    has_lineage_freshness_evidence: p.L ? 1 : 0,
    has_cryptographic_integrity_evidence: p.X ? 1 : 0,
  }
}

// Derives the expected classification from a predicate snapshot.
// Follows the canonical state machine; does not query D1.
//
// epochStatus couples the epoch registry to finality classification:
//   - null            → no epoch constraint (CONVERGENCE_VALID ceiling, not GLOBAL_VALID)
//   - EPOCH_GLOBAL_AUTHORITATIVE → allows GLOBAL_VALID
//   - EPOCH_STALE_VISIBLE        → forces STALE_VISIBLE (epoch is stale, object is stale)
//   - EPOCH_PARTITION_SUSPENDED  → forces PARTITION_SUSPENDED
//   - blocking states            → forces NULL (AMBIGUOUS, CONFLICTED, REVOKED, NULL)
//
// LOCAL_VALID → GLOBAL_VALID transition is forbidden without passing through
// CONVERGENCE_VALID: convergence evidence (Q, G, L, X) must all be present,
// and epoch must be EPOCH_GLOBAL_AUTHORITATIVE before GLOBAL_VALID is reachable.
//
// causalOverride — optional output of classifyCausalLegitimacyClocks() or
// causalClockToClassification(). When AMBIGUOUS or NULL, it blocks CONVERGENCE_VALID
// and GLOBAL_VALID: causal ambiguity prevents finality (CONF-DIST-13).
// null means no causal override — predicate logic proceeds normally.
export function classifyFromPredicates(
  p: PredicateSnapshot,
  topologyPresent: boolean,
  epochStatus: EpochFinalityStatus | null = null,
  causalOverride: FinalityClassification | null = null,
): FinalityClassification {
  if (!topologyPresent) return 'PARTITION_SUSPENDED'
  // Epoch state takes precedence: stale or blocking epochs override predicate logic.
  if (epochStatus === 'EPOCH_PARTITION_SUSPENDED') return 'PARTITION_SUSPENDED'
  if (epochStatus === 'EPOCH_STALE_VISIBLE') return 'STALE_VISIBLE'
  if (epochStatus !== null && isEpochBlocking(epochStatus)) return 'NULL'
  const base = p.V && p.A && p.U && p.P && p.R && p.T && p.C
  if (!base) return 'NULL'
  if (p.Q && p.G && p.L && p.X) {
    // Causal ambiguity blocks convergence — checked before CONVERGENCE_VALID or GLOBAL_VALID.
    // Concurrent legitimacy roots or unresolved ordering must return AMBIGUOUS or NULL;
    // observation alone cannot infer causal ordering (CONF-DIST-13).
    if (causalOverride === 'AMBIGUOUS' || causalOverride === 'NULL') return causalOverride
    // Convergence evidence present. Only a globally authoritative epoch grants GLOBAL_VALID;
    // without it the object is at CONVERGENCE_VALID — the required intermediate state.
    if (epochStatus !== null && isEpochGloballyAuthoritative(epochStatus)) return 'GLOBAL_VALID'
    return 'CONVERGENCE_VALID'
  }
  // Distributed predicates (Q, G, X) are absent: LOCAL_VALID is the ceiling
  // regardless of epoch status. The caller cannot reach GLOBAL_VALID from here
  // without first acquiring convergence evidence.
  if (p.L) return 'LOCAL_VALID'
  return 'STALE_VISIBLE'
}
