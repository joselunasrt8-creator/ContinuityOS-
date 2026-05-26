import { sha256Hex, canonicalize } from '../canonical.js'
import type { LegitimacyConflictResult } from '../legitimacy-conflict-arbitration.js'

// Evidence-only — conflict classification ≠ execution authority
export const creates_authority = false as const

export type ConflictState = 'OPEN' | 'RESOLVED' | 'SUPERSEDED' | 'NULL'

export type CollapseRule =
  | 'RECONCILIABILITY'
  | 'QUORUM_WEIGHT'
  | 'CAUSAL_CLOCK'
  | 'LEXICOGRAPHIC'
  | 'UNRESOLVED'

export type CompetingHead = {
  readonly head_hash: string
  readonly reconciliability_score: number
  readonly quorum_weight: number
  readonly causal_clock_index: number
}

export type ConflictSetRecord = {
  readonly conflict_set_id: string
  readonly lineage_scope: string
  readonly conflict_state: ConflictState
  readonly competing_heads_json: string       // JSON-serialized CompetingHead[]
  readonly collapse_rule_applied: CollapseRule
  readonly winner_head_hash: string | null
  readonly winner_reconciliability_score: number | null
  readonly winner_quorum_weight: number | null
  readonly winner_causal_clock_index: number | null
  readonly arbitration_hash: string | null    // from computeArbitrationHash() in legitimacy-conflict-arbitration.ts
  readonly supersedes_conflict_set_id: string | null
  readonly finality_classification_id: string | null
  readonly reason_code: string
  readonly created_at: string
  readonly evidence_only: 1
  readonly creates_authority: 0
  readonly creates_execution: 0
  readonly mutates_registry: 0
  readonly raw_production_apply_path: 'DENIED'
}

// Maps LegitimacyConflictResult to the canonical ConflictState for a new record.
// CONFLICT_NONE → no record needed.
// All others → OPEN (pending tie-break or human review).
// CONFLICT_UNRESOLVABLE → NULL directly (no tie-break possible).
export function conflictStateFromResult(result: LegitimacyConflictResult): ConflictState | null {
  switch (result) {
    case 'CONFLICT_NONE': return null
    case 'CONFLICT_UNRESOLVABLE': return 'NULL'
    default: return 'OPEN'
  }
}

// Derives the canonical conflict_set_id.
// Deterministic: same inputs always yield the same ID.
export function buildConflictSetId(
  lineage_scope: string,
  competing_heads_json: string,
  created_at: string,
): string {
  const canonical = canonicalize({ lineage_scope, competing_heads_json, created_at })
  return `csr_${sha256Hex(canonical)}`
}

// Selects the winning head from a set of competing heads using the canonical
// tie-break ordering: reconciliability → quorum_weight → causal_clock_index → lexicographic hash.
// Returns null if competing_heads is empty.
export function selectWinningHead(competing_heads: CompetingHead[]): {
  winner: CompetingHead
  collapse_rule: CollapseRule
} | null {
  if (competing_heads.length === 0) return null
  if (competing_heads.length === 1) {
    return { winner: competing_heads[0], collapse_rule: 'RECONCILIABILITY' }
  }

  const sorted = [...competing_heads].sort((a, b) => {
    if (b.reconciliability_score !== a.reconciliability_score) {
      return b.reconciliability_score - a.reconciliability_score
    }
    if (b.quorum_weight !== a.quorum_weight) {
      return b.quorum_weight - a.quorum_weight
    }
    if (a.causal_clock_index !== b.causal_clock_index) {
      return a.causal_clock_index - b.causal_clock_index
    }
    return a.head_hash < b.head_hash ? -1 : 1
  })

  const winner = sorted[0]
  const second = sorted[1]

  let collapse_rule: CollapseRule
  if (winner.reconciliability_score !== second.reconciliability_score) {
    collapse_rule = 'RECONCILIABILITY'
  } else if (winner.quorum_weight !== second.quorum_weight) {
    collapse_rule = 'QUORUM_WEIGHT'
  } else if (winner.causal_clock_index !== second.causal_clock_index) {
    collapse_rule = 'CAUSAL_CLOCK'
  } else {
    collapse_rule = 'LEXICOGRAPHIC'
  }

  return { winner, collapse_rule }
}

// ── ConflictSetEnvelope model (Slice E) ────────────────────────────────────
// Deterministic conflict-set envelope and settlement semantics.
// Settlement preserves losing branches — no branch deletion, no authority creation.

export const conflictSetCreatesAuthority = false as const
export const settlementRestoresReplay = false as const

export type ConflictSettlementState =
  | 'DETECTING'
  | 'CONFLICTED'
  | 'SETTLEMENT_CANDIDATE'
  | 'SETTLED'
  | 'UNSETTLEABLE'
  | 'NULL'

export interface CompetingRoot {
  readonly root_hash: string
  readonly proof_id: string
  readonly validator_attestations: readonly unknown[]
  readonly causal_clock: unknown
  readonly branch_evidence: Readonly<Record<string, unknown>>
}

export interface ConflictSetEnvelope {
  readonly conflict_id: string
  readonly detected_at: string
  readonly competing_roots: readonly CompetingRoot[]
  readonly winning_root?: string
  readonly losing_roots: readonly string[]
  readonly settlement_state: ConflictSettlementState
  readonly settlement_evidence: Readonly<Record<string, unknown>>
  readonly epoch_id: string
  readonly creates_authority: false
  readonly restores_replay: false
}

export type UnsettleableReason =
  | 'IDENTICAL_CAUSAL_CLOCKS'
  | 'MISSING_EPOCH'
  | 'STALE_EPOCH'
  | 'REPLAY_RESURRECTION_CONFLICT'
  | 'DETACHED_PROOF'
  | 'TOPOLOGY_AMBIGUITY'
  | 'MISSING_PROOF_LINEAGE'
  | 'WOULD_ERASE_EVIDENCE'

// Builds a deterministic conflict_id for a ConflictSetEnvelope.
// Deterministic: same sorted root hashes + epoch + detected_at → same ID.
export function buildConflictEnvelopeId(
  competing_root_hashes: readonly string[],
  epoch_id: string,
  detected_at: string,
): string {
  const sorted = [...competing_root_hashes].sort()
  const canonical_str = canonicalize({ competing_root_hashes: sorted, epoch_id, detected_at })
  return `cse_${sha256Hex(canonical_str)}`
}

// Detects a conflict set from competing roots.
// Returns CONFLICTED if 2+ roots provided (split-brain detected).
// Returns DETECTING if only 1 root (observation in progress).
// Returns NULL if no roots provided.
export function detectConflictSet(input: {
  readonly competing_roots: readonly CompetingRoot[]
  readonly epoch_id: string
  readonly detected_at: string
}): ConflictSetEnvelope {
  const { competing_roots, epoch_id, detected_at } = input
  const root_hashes = competing_roots.map((r) => r.root_hash)
  const conflict_id = buildConflictEnvelopeId(root_hashes, epoch_id, detected_at)

  if (competing_roots.length === 0) {
    return Object.freeze({
      conflict_id,
      detected_at,
      competing_roots: Object.freeze([]) as readonly CompetingRoot[],
      losing_roots: Object.freeze([]) as readonly string[],
      settlement_state: 'NULL' as ConflictSettlementState,
      settlement_evidence: Object.freeze({}) as Readonly<Record<string, unknown>>,
      epoch_id,
      creates_authority: false as const,
      restores_replay: false as const,
    })
  }

  if (competing_roots.length === 1) {
    return Object.freeze({
      conflict_id,
      detected_at,
      competing_roots: Object.freeze([...competing_roots]) as readonly CompetingRoot[],
      losing_roots: Object.freeze([]) as readonly string[],
      settlement_state: 'DETECTING' as ConflictSettlementState,
      settlement_evidence: Object.freeze({}) as Readonly<Record<string, unknown>>,
      epoch_id,
      creates_authority: false as const,
      restores_replay: false as const,
    })
  }

  // 2+ competing roots → split-brain confirmed → CONFLICTED
  return Object.freeze({
    conflict_id,
    detected_at,
    competing_roots: Object.freeze([...competing_roots]) as readonly CompetingRoot[],
    losing_roots: Object.freeze([]) as readonly string[],
    settlement_state: 'CONFLICTED' as ConflictSettlementState,
    settlement_evidence: Object.freeze({}) as Readonly<Record<string, unknown>>,
    epoch_id,
    creates_authority: false as const,
    restores_replay: false as const,
  })
}

// Classifies the settlement state of an envelope — returns its current state.
// Pure accessor; does not mutate the envelope.
export function classifyConflictSet(envelope: ConflictSetEnvelope): ConflictSettlementState {
  return envelope.settlement_state
}

// Preserves losing branch evidence from a settled (or any) envelope.
// Returns a readonly array of losing root hashes; never deletes evidence.
export function preserveLosingBranchEvidence(
  envelope: ConflictSetEnvelope,
): readonly string[] {
  return Object.freeze([...envelope.losing_roots])
}

// Returns true only when evidence allows deterministic winner selection.
// Fails closed: any ambiguity → not deterministic.
export function isSettlementDeterministic(
  competing_roots: readonly CompetingRoot[],
  opts: {
    readonly epoch_id_present: boolean
    readonly epoch_stale: boolean
    readonly has_replay_resurrection_conflict: boolean
    readonly topology_ambiguous: boolean
    readonly has_detached_proof: boolean
    readonly has_missing_proof_lineage: boolean
  },
): { deterministic: boolean; reason?: UnsettleableReason } {
  if (competing_roots.length < 2) {
    return { deterministic: false, reason: 'MISSING_PROOF_LINEAGE' }
  }
  if (!opts.epoch_id_present) {
    return { deterministic: false, reason: 'MISSING_EPOCH' }
  }
  if (opts.epoch_stale) {
    return { deterministic: false, reason: 'STALE_EPOCH' }
  }
  if (opts.has_replay_resurrection_conflict) {
    return { deterministic: false, reason: 'REPLAY_RESURRECTION_CONFLICT' }
  }
  if (opts.has_detached_proof) {
    return { deterministic: false, reason: 'DETACHED_PROOF' }
  }
  if (opts.topology_ambiguous) {
    return { deterministic: false, reason: 'TOPOLOGY_AMBIGUITY' }
  }
  if (opts.has_missing_proof_lineage) {
    return { deterministic: false, reason: 'MISSING_PROOF_LINEAGE' }
  }
  if (hasIdenticalCausalClocks(competing_roots)) {
    return { deterministic: false, reason: 'IDENTICAL_CAUSAL_CLOCKS' }
  }
  return { deterministic: true }
}

// Returns true when all competing roots share identical causal clocks.
// Identical clocks → tie unresolvable → UNSETTLEABLE.
function hasIdenticalCausalClocks(roots: readonly CompetingRoot[]): boolean {
  if (roots.length < 2) return false
  const clocks = roots.map((r) =>
    r.causal_clock === null || r.causal_clock === undefined
      ? null
      : canonicalize(r.causal_clock),
  )
  const first = clocks[0]
  return clocks.every((c) => c === first)
}

// Settles a conflict set envelope given sufficient deterministic evidence.
// Returns a new envelope in SETTLED state with losing branches preserved.
// If settlement is not deterministic, returns UNSETTLEABLE envelope.
// Settlement cannot create authority or restore replay eligibility — ever.
export function settleConflictSet(
  envelope: ConflictSetEnvelope,
  evidence: {
    readonly winning_root_hash: string
    readonly settlement_evidence: Readonly<Record<string, unknown>>
    readonly epoch_id_present: boolean
    readonly epoch_stale: boolean
    readonly has_replay_resurrection_conflict: boolean
    readonly topology_ambiguous: boolean
    readonly has_detached_proof: boolean
    readonly has_missing_proof_lineage: boolean
  },
): ConflictSetEnvelope {
  if (envelope.competing_roots.length === 0) {
    return Object.freeze({
      conflict_id: envelope.conflict_id,
      detected_at: envelope.detected_at,
      competing_roots: envelope.competing_roots,
      losing_roots: envelope.losing_roots,
      settlement_state: 'NULL' as ConflictSettlementState,
      settlement_evidence: Object.freeze(evidence.settlement_evidence),
      epoch_id: envelope.epoch_id,
      creates_authority: false as const,
      restores_replay: false as const,
    })
  }

  const { deterministic, reason } = isSettlementDeterministic(
    envelope.competing_roots,
    {
      epoch_id_present: evidence.epoch_id_present,
      epoch_stale: evidence.epoch_stale,
      has_replay_resurrection_conflict: evidence.has_replay_resurrection_conflict,
      topology_ambiguous: evidence.topology_ambiguous,
      has_detached_proof: evidence.has_detached_proof,
      has_missing_proof_lineage: evidence.has_missing_proof_lineage,
    },
  )

  if (!deterministic) {
    return Object.freeze({
      conflict_id: envelope.conflict_id,
      detected_at: envelope.detected_at,
      competing_roots: envelope.competing_roots,
      losing_roots: envelope.losing_roots,
      settlement_state: 'UNSETTLEABLE' as ConflictSettlementState,
      settlement_evidence: Object.freeze({
        ...evidence.settlement_evidence,
        unsettleable_reason: reason,
      }),
      epoch_id: envelope.epoch_id,
      creates_authority: false as const,
      restores_replay: false as const,
    })
  }

  const competing_hashes = envelope.competing_roots.map((r) => r.root_hash)
  if (!competing_hashes.includes(evidence.winning_root_hash)) {
    return Object.freeze({
      conflict_id: envelope.conflict_id,
      detected_at: envelope.detected_at,
      competing_roots: envelope.competing_roots,
      losing_roots: envelope.losing_roots,
      settlement_state: 'UNSETTLEABLE' as ConflictSettlementState,
      settlement_evidence: Object.freeze({
        ...evidence.settlement_evidence,
        unsettleable_reason: 'WOULD_ERASE_EVIDENCE' as UnsettleableReason,
      }),
      epoch_id: envelope.epoch_id,
      creates_authority: false as const,
      restores_replay: false as const,
    })
  }

  // Preserve all losing roots — append-only accumulation, never deleted
  const new_losing = competing_hashes.filter((h) => h !== evidence.winning_root_hash)
  const all_losing = [...new Set([...envelope.losing_roots, ...new_losing])]

  return Object.freeze({
    conflict_id: envelope.conflict_id,
    detected_at: envelope.detected_at,
    competing_roots: envelope.competing_roots,
    winning_root: evidence.winning_root_hash,
    losing_roots: Object.freeze(all_losing) as readonly string[],
    settlement_state: 'SETTLED' as ConflictSettlementState,
    settlement_evidence: Object.freeze(evidence.settlement_evidence),
    epoch_id: envelope.epoch_id,
    creates_authority: false as const,
    restores_replay: false as const,
  })
}
