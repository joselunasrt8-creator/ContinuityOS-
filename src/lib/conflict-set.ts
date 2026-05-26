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
