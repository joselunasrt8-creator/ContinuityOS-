import { sha256Hex, canonicalize } from '../canonical.js'
import type { ReplayConvergenceState } from './replay-convergence.js'

// Evidence-only — enforcement assessment ≠ execution authority.
// Replay legitimacy determination never creates execution or authority.
export const creates_authority = false as const
export const creates_execution = false as const

// ── Section 8: Registry taxonomy ─────────────────────────────────────────────

export const AUTHORITATIVE_REGISTRY_TYPES = Object.freeze([
  'replay_registry',
  'execution_registry',
  'proof_registry',
  'continuity_registry',
] as const)

export const DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES = Object.freeze([
  'replay_convergence_registry',
  'replay_divergence_registry',
  'partition_visibility_registry',
  'causal_order_registry',
] as const)

export const RECONCILIATION_REGISTRY_TYPES = Object.freeze([
  'cross_registry_reconciliation_registry',
  'reconciliation_closure_registry',
] as const)

export type AuthoritativeRegistryType = (typeof AUTHORITATIVE_REGISTRY_TYPES)[number]
export type DistributedConvergenceRegistryType = (typeof DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES)[number]
export type ReconciliationRegistryType = (typeof RECONCILIATION_REGISTRY_TYPES)[number]

// ── Section 5: Distributed Replay Evidence Domain ────────────────────────────
// All 7 evidence domains required for replay legitimacy determination.
export interface DistributedReplayEvidenceDomain {
  // nonce_lineage: replay uniqueness — non-empty required for Rule 5
  readonly nonce_lineage: readonly string[]
  // proof_ancestry: execution confirmation evidence
  readonly proof_ancestry: readonly string[]
  // continuity_lineage: replay ancestry — non-empty required for Rule 5
  readonly continuity_lineage: readonly string[]
  // topology_visible: distributed certainty — false → REPLAY_PARTITION_SUSPENDED (Rule 2)
  readonly topology_visible: boolean
  // causal_ordering: replay chronology — causal indices, not wall-clock timestamps
  readonly causal_ordering: readonly number[]
  // reconciliation_freshness_ms: age of reconciliation evidence in milliseconds
  readonly reconciliation_freshness_ms: number
  // partition_status: current partition state of the observed topology
  readonly partition_status: 'healed' | 'active' | 'unknown'
}

// ── Section 11: Execution boundary replay check ───────────────────────────────
// Validates that the replay lineage observed at validation time is identical to
// what is present at execution time. Mutation after validation → NULL.
export interface ExecutionBoundaryReplayCheck {
  readonly validated_replay_lineage_hash: string
  readonly executed_replay_lineage_hash: string
}

// ── Enforcement input ─────────────────────────────────────────────────────────
export interface DistributedReplayConvergenceEnforcementInput {
  readonly enforcement_id: string
  // nonce: the invocation nonce being evaluated for replay safety
  readonly nonce: string
  // evidence: the 7-domain distributed replay evidence domain (Section 5)
  readonly evidence: DistributedReplayEvidenceDomain
  // local_consumed: whether the local registry shows the nonce as consumed
  readonly local_consumed: boolean
  // remote_consumed: whether the remote/topology-wide registry shows it consumed
  readonly remote_consumed: boolean
  // prior_convergence_state: the previously recorded state for this nonce, if any
  readonly prior_convergence_state: ReplayConvergenceState | null
  // execution_boundary_check: present when an execution boundary transition is occurring
  readonly execution_boundary_check: ExecutionBoundaryReplayCheck | null
  // staleness_threshold_ms: max acceptable reconciliation age; defaults to 60_000ms
  readonly staleness_threshold_ms?: number
}

// ── Enforcement result ────────────────────────────────────────────────────────
export interface DistributedReplayConvergenceEnforcementResult {
  readonly enforcement_id: string
  // classification: canonical ReplayConvergenceState for this nonce
  readonly classification: ReplayConvergenceState
  // compound_predicate_satisfied: true only when REPLAY_SAFE with no rule violations
  // and no execution boundary mutation — the full Section 3 execution gate
  readonly compound_predicate_satisfied: boolean
  // violated_rules: deterministic sorted list of violated rule identifiers
  readonly violated_rules: readonly string[]
  // topology_relative_certainty: false when topology absent (Rule 2)
  readonly topology_relative_certainty: boolean
  // lineage_continuity_satisfied: false when nonce or continuity lineage missing (Rule 5)
  readonly lineage_continuity_satisfied: boolean
  // reconciliation_stale: true when reconciliation evidence exceeds staleness threshold
  readonly reconciliation_stale: boolean
  // execution_boundary_integrity: result of Section 11 execution boundary check
  readonly execution_boundary_integrity: 'VALID' | 'NULL' | 'NOT_CHECKED'
  readonly creates_authority: false
  readonly creates_execution: false
}

// ── Rule implementations ──────────────────────────────────────────────────────

// Rule 1: Replay ambiguity fails closed.
// AMBIGUOUS replay state → NULL. No probabilistic replay legitimacy.
// Ambiguity arises when local and remote observations diverge while topology is visible.
function isReplayAmbiguous(
  local_consumed: boolean,
  remote_consumed: boolean,
  topology_visible: boolean,
): boolean {
  if (!topology_visible) return false  // Rule 2 covers this case; Rule 1 handles visible divergence
  return local_consumed !== remote_consumed
}

// Rule 2: Replay visibility is topology-relative.
// Local replay certainty ≠ global replay certainty without topology visibility.
function topologyRelativeCertainty(topology_visible: boolean): boolean {
  return topology_visible
}

// Rule 3: Replay consumption is irreversible.
// UNUSED → CONSUMED is the only permitted state transition.
// CONSUMED → UNUSED is a hard violation that yields NULL.
function isConsumptionIrreversibilityViolated(
  prior_state: ReplayConvergenceState | null,
  local_consumed: boolean,
  remote_consumed: boolean,
): boolean {
  if (prior_state !== 'REPLAY_CONSUMED') return false
  // Any transition away from CONSUMED violates irreversibility
  return !local_consumed || !remote_consumed
}

// Rule 4: Replay resurrection is illegitimate.
// Previously consumed lineage cannot regain execution eligibility under any recovery scenario:
// stale topology, delayed reconciliation, partition recovery, or replica rollback.
// The trigger is an observed reversion to UNUSED (neither side consumed) after prior CONSUMED.
// Partition recovery and stale topology are scenarios that can cause this reversion — they are
// not additional triggers when the observed state is still consistently consumed.
function isResurrectionAttempt(
  prior_state: ReplayConvergenceState | null,
  local_consumed: boolean,
  remote_consumed: boolean,
): boolean {
  if (prior_state !== 'REPLAY_CONSUMED') return false
  // Resurrection: consumed lineage appears safe again (neither side shows consumed)
  return !local_consumed && !remote_consumed
}

// Rule 5: Replay determination requires lineage continuity.
// Detached replay lineage → NULL.
// Both nonce_lineage and continuity_lineage must be non-empty.
function hasLineageContinuity(evidence: DistributedReplayEvidenceDomain): boolean {
  return evidence.nonce_lineage.length > 0 && evidence.continuity_lineage.length > 0
}

// Section 6: Causal replay ordering is not wall-clock based.
// Causal ordering is valid when at least one causal index is present and all indices
// are non-negative (wall-clock timestamps have no place in replay chronology).
function isCausalOrderingValid(causal_ordering: readonly number[]): boolean {
  if (causal_ordering.length === 0) return false
  return causal_ordering.every((idx) => Number.isFinite(idx) && idx >= 0)
}

// Section 11: Execution boundary integrity.
// validated_replay_lineage_hash must equal executed_replay_lineage_hash.
// Any mutation after replay validation → NULL.
function checkExecutionBoundaryIntegrity(
  check: ExecutionBoundaryReplayCheck | null,
): 'VALID' | 'NULL' | 'NOT_CHECKED' {
  if (check === null) return 'NOT_CHECKED'
  if (
    !check.validated_replay_lineage_hash ||
    !check.executed_replay_lineage_hash ||
    check.validated_replay_lineage_hash !== check.executed_replay_lineage_hash
  ) {
    return 'NULL'
  }
  return 'VALID'
}

// Derives the canonical ReplayConvergenceState from all rule outcomes.
// Section 3 compound predicate priority (most severe first):
//   NULL violations → NULL
//   No lineage continuity → NULL (Rule 5)
//   No topology visibility → REPLAY_PARTITION_SUSPENDED (Rule 2)
//   Ambiguity with topology → REPLAY_DIVERGENT (Rule 1; execution blocked)
//   Both consumed → REPLAY_CONSUMED
//   Neither consumed → REPLAY_SAFE
function deriveClassification(
  local_consumed: boolean,
  remote_consumed: boolean,
  topology_visible: boolean,
  ambiguous: boolean,
  null_violations: boolean,
  lineage_continuity: boolean,
): ReplayConvergenceState {
  if (null_violations || !lineage_continuity) return 'NULL'
  if (!topology_visible) return 'REPLAY_PARTITION_SUSPENDED'
  if (ambiguous) return 'REPLAY_DIVERGENT'
  if (local_consumed && remote_consumed) return 'REPLAY_CONSUMED'
  return 'REPLAY_SAFE'
}

// Builds a deterministic enforcement_id for audit linkage.
export function buildEnforcementId(
  nonce: string,
  enforcement_id: string,
): string {
  return `drc_${sha256Hex(canonicalize({ nonce, enforcement_id }))}`
}

// ── Main enforcement function ─────────────────────────────────────────────────
// Applies all 5 rules from Section 7 plus the Section 11 execution boundary check.
// Returns an evidence-only result: creates_authority=false, creates_execution=false.
//
// Section 3 compound execution predicate:
//   VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
//   → compound_predicate_satisfied=true
//   Else → NULL (compound_predicate_satisfied=false)
export function enforceDistributedReplayConvergence(
  input: DistributedReplayConvergenceEnforcementInput,
): DistributedReplayConvergenceEnforcementResult {
  const {
    evidence,
    local_consumed,
    remote_consumed,
    prior_convergence_state,
    execution_boundary_check,
  } = input

  const staleness_threshold_ms = input.staleness_threshold_ms ?? 60_000
  const violatedRules: string[] = []

  // Rule 5: Lineage continuity
  const lineageContinuity = hasLineageContinuity(evidence)
  if (!lineageContinuity) violatedRules.push('rule_5_detached_lineage')

  // Section 6: Causal ordering validity
  const causalValid = isCausalOrderingValid(evidence.causal_ordering)
  if (!causalValid) violatedRules.push('section_6_invalid_causal_ordering')

  // Rule 3: Irreversibility
  const irreversibilityViolated = isConsumptionIrreversibilityViolated(
    prior_convergence_state,
    local_consumed,
    remote_consumed,
  )
  if (irreversibilityViolated) violatedRules.push('rule_3_consumption_irreversibility')

  // Rule 4: Resurrection
  const resurrectionAttempt = isResurrectionAttempt(
    prior_convergence_state,
    local_consumed,
    remote_consumed,
  )
  if (resurrectionAttempt) violatedRules.push('rule_4_replay_resurrection')

  // Rule 2: Topology-relative certainty
  const topoRelative = topologyRelativeCertainty(evidence.topology_visible)
  if (!topoRelative) violatedRules.push('rule_2_topology_relative_visibility')

  // Rule 1: Ambiguity fails closed (visible topology + divergent observations)
  const ambiguous = isReplayAmbiguous(local_consumed, remote_consumed, evidence.topology_visible)
  if (ambiguous) violatedRules.push('rule_1_replay_ambiguity')

  // Reconciliation staleness check
  const reconciliationStale = evidence.reconciliation_freshness_ms > staleness_threshold_ms
  if (reconciliationStale) violatedRules.push('stale_reconciliation_evidence')

  // Section 11: Execution boundary integrity
  const executionBoundaryIntegrity = checkExecutionBoundaryIntegrity(execution_boundary_check)
  if (executionBoundaryIntegrity === 'NULL') violatedRules.push('section_11_execution_boundary_mutation')

  // NULL violations: rules 3, 4, 5, and boundary mutation produce NULL classification
  const nullViolations =
    irreversibilityViolated ||
    resurrectionAttempt ||
    !lineageContinuity ||
    executionBoundaryIntegrity === 'NULL'

  const classification = deriveClassification(
    local_consumed,
    remote_consumed,
    evidence.topology_visible,
    ambiguous,
    nullViolations,
    lineageContinuity,
  )

  // Section 3: compound predicate satisfied only when:
  // - REPLAY_SAFE classification
  // - no violated rules
  // - execution boundary not mutated (VALID or NOT_CHECKED — partition presence alone doesn't block)
  const compoundPredicateSatisfied =
    classification === 'REPLAY_SAFE' &&
    violatedRules.length === 0

  return Object.freeze({
    enforcement_id: String(input.enforcement_id || ''),
    classification,
    compound_predicate_satisfied: compoundPredicateSatisfied,
    violated_rules: Object.freeze([...violatedRules].sort()),
    topology_relative_certainty: topoRelative,
    lineage_continuity_satisfied: lineageContinuity,
    reconciliation_stale: reconciliationStale,
    execution_boundary_integrity: executionBoundaryIntegrity,
    creates_authority: false,
    creates_execution: false,
  })
}
