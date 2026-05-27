import { sha256Hex, canonicalize } from '../canonical.js'
import type { FinalityClassification } from './finality-classification.js'

// Evidence-only — causal ordering ≠ execution authority
export const causalCreatesAuthority = false as const
export const causalCreatesExecution = false as const

// Deterministic ordering result from comparing two causal legitimacy clocks.
// BEFORE  — clock A happened-before clock B (A's vector dominates B's)
// AFTER   — clock B happened-before clock A (B's vector dominates A's)
// CONCURRENT — neither dominates; no deterministic ordering; ambiguity present
// AMBIGUOUS  — explicit ambiguity flag set on one or both clocks
// NULL    — missing or malformed clock evidence
export type CausalOrderingResult =
  | 'BEFORE'
  | 'AFTER'
  | 'CONCURRENT'
  | 'AMBIGUOUS'
  | 'NULL'

// Canonical causal legitimacy clock.
// vector is a per-node Lamport counter map: node_id → logical timestamp.
// happens_before and concurrent_with are clock_ids derived from comparison helpers.
// ambiguity_detected is set true when ordering cannot be determined deterministically.
// observation alone cannot infer ordering — vector evidence must be explicit.
export interface CausalLegitimacyClock {
  readonly clock_id: string
  readonly epoch_id: string
  readonly node_id: string
  readonly vector: Record<string, number>
  readonly observed_events: readonly string[]
  readonly happens_before: readonly string[]
  readonly concurrent_with: readonly string[]
  readonly ambiguity_detected: boolean
  readonly topology_snapshot_hash?: string
  readonly created_at: string
}

// Builds a deterministic clock_id for a CausalLegitimacyClock.
// clc_<sha256(canonicalize({node_id, epoch_id, created_at}))>
export function buildCausalLegitimacyClockId(
  node_id: string,
  epoch_id: string,
  created_at: string,
): string {
  return `clc_${sha256Hex(canonicalize({ node_id, epoch_id, created_at }))}`
}

// Compares two vector clocks and returns their causal ordering.
// BEFORE  — A's vector component-wise ≤ B's, with at least one strict inequality
// AFTER   — B's vector component-wise ≤ A's, with at least one strict inequality
// CONCURRENT — neither dominates (ambiguous ordering; blocks convergence)
// AMBIGUOUS  — either clock has ambiguity_detected=true
// NULL    — either argument is absent
//
// Observation alone cannot infer causal ordering — only explicit vector evidence qualifies.
export function compareCausalClocks(
  a: CausalLegitimacyClock | null | undefined,
  b: CausalLegitimacyClock | null | undefined,
): CausalOrderingResult {
  if (!a || !b) return 'NULL'
  if (a.ambiguity_detected || b.ambiguity_detected) return 'AMBIGUOUS'
  return vectorClockCompare(a.vector, b.vector)
}

// Pure vector clock comparison over all nodes in the union of both domains.
// Missing entries are treated as 0 (never observed on that node).
function vectorClockCompare(
  va: Record<string, number>,
  vb: Record<string, number>,
): CausalOrderingResult {
  const nodes = new Set([...Object.keys(va), ...Object.keys(vb)])
  let aLtB = false
  let bLtA = false

  for (const n of nodes) {
    const ai = va[n] ?? 0
    const bi = vb[n] ?? 0
    if (ai < bi) aLtB = true
    if (bi < ai) bLtA = true
    if (aLtB && bLtA) return 'CONCURRENT'
  }

  if (aLtB && !bLtA) return 'BEFORE'
  if (bLtA && !aLtB) return 'AFTER'
  // Identical vectors — cannot determine ordering; treat as concurrent
  return 'CONCURRENT'
}

// Detects causal ambiguity across a set of legitimacy clocks.
// Ambiguity is present when:
//   – any clock has ambiguity_detected=true, OR
//   – any pair of clocks produces CONCURRENT or AMBIGUOUS ordering
// Fail-closed: returns true (ambiguous) on any uncertainty.
export function detectCausalAmbiguity(
  clocks: readonly (CausalLegitimacyClock | null | undefined)[],
): boolean {
  const valid = clocks.filter((c): c is CausalLegitimacyClock => c != null)
  if (valid.some((c) => c.ambiguity_detected)) return true
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const r = compareCausalClocks(valid[i], valid[j])
      if (r === 'CONCURRENT' || r === 'AMBIGUOUS') return true
    }
  }
  return false
}

// Returns the clock_ids of all candidates that happen-before the target.
// Only clocks with a deterministic BEFORE ordering qualify.
// Returns empty array when target has ambiguity_detected=true.
// Observation alone is insufficient — causal evidence (vector dominance) required.
export function computeHappensBefore(
  target: CausalLegitimacyClock,
  candidates: readonly (CausalLegitimacyClock | null | undefined)[],
): readonly string[] {
  if (target.ambiguity_detected) return []
  const result: string[] = []
  for (const c of candidates) {
    if (!c || c.clock_id === target.clock_id) continue
    if (compareCausalClocks(c, target) === 'BEFORE') result.push(c.clock_id)
  }
  return result
}

// Returns the clock_ids of all candidates that are concurrent with the target.
// Concurrent clocks cannot be deterministically ordered → ambiguity detected.
// All candidates are treated as concurrent when target has ambiguity_detected=true.
export function computeConcurrentLegitimacy(
  target: CausalLegitimacyClock,
  candidates: readonly (CausalLegitimacyClock | null | undefined)[],
): readonly string[] {
  const others = candidates.filter(
    (c): c is CausalLegitimacyClock => c != null && c.clock_id !== target.clock_id,
  )
  if (target.ambiguity_detected) return others.map((c) => c.clock_id)
  const result: string[] = []
  for (const c of others) {
    const r = compareCausalClocks(target, c)
    if (r === 'CONCURRENT') result.push(c.clock_id)
  }
  return result
}

// Maps a CausalOrderingResult to a FinalityClassification override.
// BEFORE / AFTER — deterministic ordering confirmed; no finality override (null)
// CONCURRENT / AMBIGUOUS — ambiguity detected; returns AMBIGUOUS (blocks CONVERGENCE_VALID)
// NULL — missing evidence; returns NULL
//
// The returned value is used as the causalOverride arg to classifyFromPredicates.
// null means "no override — proceed with predicate logic".
export function causalClockToClassification(
  ordering: CausalOrderingResult,
): FinalityClassification | null {
  switch (ordering) {
    case 'BEFORE':
    case 'AFTER':
      return null
    case 'CONCURRENT':
    case 'AMBIGUOUS':
      return 'AMBIGUOUS'
    case 'NULL':
      return 'NULL'
  }
}

// Classifies a set of legitimacy clocks for finality eligibility.
// Returns a FinalityClassification override when ambiguity or missing evidence is detected;
// returns null when all clocks are deterministically ordered (no override needed).
//
// Intended as the single call-site for deriving causalOverride before classifyFromPredicates.
export function classifyCausalLegitimacyClocks(
  clocks: readonly (CausalLegitimacyClock | null | undefined)[],
): FinalityClassification | null {
  if (clocks.length === 0) return null
  if (clocks.some((c) => c == null)) return 'NULL'
  const valid = clocks as readonly CausalLegitimacyClock[]
  if (detectCausalAmbiguity(valid)) return 'AMBIGUOUS'
  return null
}

// Builds a content-addressed hash for a CausalLegitimacyClock.
// Used for topology_snapshot_hash coupling and audit trails.
export function buildCausalClockHash(clock: CausalLegitimacyClock): string {
  return sha256Hex(
    canonicalize({
      clock_id: clock.clock_id,
      epoch_id: clock.epoch_id,
      node_id: clock.node_id,
      vector: clock.vector,
      ambiguity_detected: clock.ambiguity_detected,
      created_at: clock.created_at,
    }),
  )
}
