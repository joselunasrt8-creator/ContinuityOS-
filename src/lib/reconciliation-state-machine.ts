import { sha256Hex, canonicalize } from '../canonical.js'

// Evidence-only — reconciliation classification ≠ authority.
// Reconciliation state machine: deterministic transitions, append-only events.
// No state creates authority. No state restores replay eligibility.
// NULL and REVOKED are terminal (REVOKED is downgrade-only).
export const reconciliationCreatesAuthority = false as const
export const reconciliationRestoresReplay = false as const

// ── State enumeration ─────────────────────────────────────────────────────────

export type ReconciliationState =
  | 'OBSERVED'
  | 'PENDING'
  | 'PARTITIONED'
  | 'RECONCILING'
  | 'CONFLICTED'
  | 'SETTLEMENT_CANDIDATE'
  | 'CONVERGED'
  | 'FINALIZED'
  | 'REVOKED'
  | 'STALE_VISIBLE'
  | 'NULL'

// Terminal states — no outbound transitions permitted.
const TERMINAL_STATES: ReadonlySet<ReconciliationState> = new Set(['NULL'])

// Downgrade-only states — only downgrade transitions permitted.
const DOWNGRADE_ONLY_STATES: ReadonlySet<ReconciliationState> = new Set(['REVOKED'])

// Legal transition table.
// Maps each source state to the set of states it may transition to.
const LEGAL_TRANSITIONS: Readonly<Record<ReconciliationState, ReadonlySet<ReconciliationState>>> = {
  OBSERVED:             new Set(['PENDING', 'PARTITIONED', 'STALE_VISIBLE', 'NULL']),
  PENDING:              new Set(['RECONCILING', 'PARTITIONED', 'CONFLICTED', 'STALE_VISIBLE', 'NULL']),
  PARTITIONED:          new Set(['PENDING', 'RECONCILING', 'CONFLICTED', 'STALE_VISIBLE', 'NULL']),
  RECONCILING:          new Set(['CONFLICTED', 'SETTLEMENT_CANDIDATE', 'CONVERGED', 'STALE_VISIBLE', 'REVOKED', 'NULL']),
  CONFLICTED:           new Set(['SETTLEMENT_CANDIDATE', 'STALE_VISIBLE', 'REVOKED', 'NULL']),
  SETTLEMENT_CANDIDATE: new Set(['CONVERGED', 'CONFLICTED', 'STALE_VISIBLE', 'REVOKED', 'NULL']),
  CONVERGED:            new Set(['FINALIZED', 'STALE_VISIBLE', 'REVOKED', 'NULL']),
  FINALIZED:            new Set(['STALE_VISIBLE', 'REVOKED', 'NULL']),
  REVOKED:              new Set(['NULL']),
  STALE_VISIBLE:        new Set(['RECONCILING', 'REVOKED', 'NULL']),
  NULL:                 new Set(),
}

// ── Event models ──────────────────────────────────────────────────────────────

export interface ReconciliationDowngradeEvent {
  readonly event_id: string
  readonly reconciliation_id: string
  readonly from_state: ReconciliationState
  readonly to_state: ReconciliationState
  readonly reason_code: string
  readonly timestamp_utc: string
  readonly evidence_refs: readonly string[]
  readonly creates_authority: false
  readonly restores_replay: false
}

export interface ReconciliationUpgradeEvent {
  readonly event_id: string
  readonly reconciliation_id: string
  readonly from_state: ReconciliationState
  readonly to_state: ReconciliationState
  readonly reason_code: string
  readonly timestamp_utc: string
  readonly evidence_refs: readonly string[]
  readonly creates_authority: false
  readonly restores_replay: false
}

// ── Classification result ─────────────────────────────────────────────────────

export interface ReconciliationClassificationResult {
  readonly reconciliation_state: ReconciliationState
  readonly classification: string
  readonly downgrade_events: readonly ReconciliationDowngradeEvent[]
  readonly upgrade_events: readonly ReconciliationUpgradeEvent[]
  readonly creates_authority: false
  readonly restores_replay: false
  readonly evidence_refs: readonly string[]
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface ReconciliationStateInput {
  readonly reconciliation_id: string
  readonly current_state?: ReconciliationState
  readonly lineage_stale: boolean
  readonly has_revocation: boolean
  readonly replay_divergent: boolean
  readonly conflict_set_unresolved: boolean
  readonly proof_lineage_detached: boolean
  readonly topology_visible: boolean
  readonly epoch_stale: boolean
  readonly epoch_mismatched: boolean
  readonly convergence_evidence_present: boolean
  readonly partition_detected: boolean
  readonly settlement_candidate: boolean
  readonly finalized: boolean
}

export interface ReconciliationTransitionInput {
  readonly reconciliation_id: string
  readonly from_state: ReconciliationState
  readonly to_state: ReconciliationState
  readonly reason_code: string
  readonly timestamp_utc: string
  readonly evidence_refs?: readonly string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildReconciliationDowngradeEventId(
  reconciliation_id: string,
  from_state: ReconciliationState,
  to_state: ReconciliationState,
  timestamp_utc: string,
): string {
  return `rde_${sha256Hex(canonicalize({ reconciliation_id, from_state, to_state, timestamp_utc }))}`
}

export function buildReconciliationUpgradeEventId(
  reconciliation_id: string,
  from_state: ReconciliationState,
  to_state: ReconciliationState,
  timestamp_utc: string,
): string {
  return `rue_${sha256Hex(canonicalize({ reconciliation_id, from_state, to_state, timestamp_utc }))}`
}

// Appends a downgrade event (append-only — returns new frozen array).
// Downgrade may move to STALE_VISIBLE / PARTITIONED / CONFLICTED / REVOKED / NULL.
export function appendReconciliationDowngradeEvent(
  existing: readonly ReconciliationDowngradeEvent[],
  event: ReconciliationDowngradeEvent,
): readonly ReconciliationDowngradeEvent[] {
  return Object.freeze([...existing, event])
}

// Appends an upgrade event (append-only — returns new frozen array).
// Upgrade may move toward CONVERGED only with evidence.
// Upgrade cannot create authority. Upgrade cannot restore replay eligibility.
export function appendReconciliationUpgradeEvent(
  existing: readonly ReconciliationUpgradeEvent[],
  event: ReconciliationUpgradeEvent,
): readonly ReconciliationUpgradeEvent[] {
  return Object.freeze([...existing, event])
}

// ── Transition validation ─────────────────────────────────────────────────────

export interface TransitionValidationResult {
  readonly valid: boolean
  readonly reason?: string
}

// Validates whether a proposed state transition is legal.
// Returns { valid: false, reason } for all forbidden transitions.
export function validateReconciliationTransition(
  from_state: ReconciliationState,
  to_state: ReconciliationState,
): TransitionValidationResult {
  if (TERMINAL_STATES.has(from_state)) {
    return { valid: false, reason: `${from_state} is a terminal state — no transitions permitted` }
  }

  if (DOWNGRADE_ONLY_STATES.has(from_state)) {
    // REVOKED may only transition to NULL
    if (!LEGAL_TRANSITIONS[from_state].has(to_state)) {
      return { valid: false, reason: `${from_state} is downgrade-only — ${to_state} is not permitted` }
    }
  }

  if (!LEGAL_TRANSITIONS[from_state].has(to_state)) {
    return { valid: false, reason: `transition from ${from_state} to ${to_state} is forbidden` }
  }

  // Reconciliation cannot create authority regardless of transition path
  if (to_state === 'FINALIZED') {
    // FINALIZED is evidence-only — cannot become executable
    return { valid: true }
  }

  return { valid: true }
}

// ── State transition ──────────────────────────────────────────────────────────

export interface TransitionResult {
  readonly state: ReconciliationState
  readonly valid: boolean
  readonly reason?: string
  readonly creates_authority: false
  readonly restores_replay: false
}

// Executes a validated state transition.
// Returns NULL state on any invalid or forbidden transition.
export function transitionReconciliationState(
  input: ReconciliationTransitionInput,
): TransitionResult {
  const validation = validateReconciliationTransition(input.from_state, input.to_state)

  if (!validation.valid) {
    return Object.freeze({
      state: 'NULL' as ReconciliationState,
      valid: false,
      reason: validation.reason,
      creates_authority: false,
      restores_replay: false,
    })
  }

  return Object.freeze({
    state: input.to_state,
    valid: true,
    creates_authority: false,
    restores_replay: false,
  })
}

// ── Classification ────────────────────────────────────────────────────────────

// Deterministically classifies the reconciliation state from evidence inputs.
//
// Priority order (fail-closed):
// 1. Revocation present → REVOKED (terminal downgrade path toward NULL)
// 2. Replay divergent → NULL (consumed replay state is permanent)
// 3. Lineage stale → STALE_VISIBLE
// 4. Epoch stale or mismatched → STALE_VISIBLE
// 5. Proof lineage detached → NULL
// 6. Partition detected (no topology) → PARTITIONED
// 7. Conflict-set unresolved → CONFLICTED
// 8. Settlement candidate → SETTLEMENT_CANDIDATE
// 9. Convergence evidence present → CONVERGED
// 10. Finalized → FINALIZED
// 11. Default → PENDING
//
// Invariants preserved:
// - creates_authority = false (always)
// - restores_replay = false (always)
// - FINALIZED cannot become executable
// - REVOKED is downgrade-only (→ NULL only)
export function classifyReconciliationState(
  input: ReconciliationStateInput,
): ReconciliationClassificationResult {
  const evidence_refs: string[] = []

  let state: ReconciliationState

  if (input.has_revocation) {
    state = 'REVOKED'
    evidence_refs.push('revocation_evidence')
  } else if (input.replay_divergent) {
    state = 'NULL'
    evidence_refs.push('replay_divergence_evidence')
  } else if (input.lineage_stale) {
    state = 'STALE_VISIBLE'
    evidence_refs.push('stale_lineage_evidence')
  } else if (input.epoch_stale || input.epoch_mismatched) {
    state = 'STALE_VISIBLE'
    evidence_refs.push('epoch_mismatch_evidence')
  } else if (input.proof_lineage_detached) {
    state = 'NULL'
    evidence_refs.push('detached_proof_evidence')
  } else if (input.partition_detected || !input.topology_visible) {
    state = 'PARTITIONED'
    evidence_refs.push('partition_evidence')
  } else if (input.conflict_set_unresolved) {
    state = 'CONFLICTED'
    evidence_refs.push('conflict_set_evidence')
  } else if (input.settlement_candidate) {
    state = 'SETTLEMENT_CANDIDATE'
    evidence_refs.push('settlement_evidence')
  } else if (input.convergence_evidence_present) {
    state = 'CONVERGED'
    evidence_refs.push('convergence_evidence')
  } else if (input.finalized) {
    state = 'FINALIZED'
    evidence_refs.push('finality_evidence')
  } else {
    state = 'PENDING'
  }

  const classification = reconciliationStateToClassification(state)

  return Object.freeze({
    reconciliation_state: state,
    classification,
    downgrade_events: Object.freeze([] as ReconciliationDowngradeEvent[]),
    upgrade_events: Object.freeze([] as ReconciliationUpgradeEvent[]),
    creates_authority: false,
    restores_replay: false,
    evidence_refs: Object.freeze(evidence_refs),
  })
}

// Maps a reconciliation state to a human-readable classification label.
// All labels are evidence-only and carry no authority.
function reconciliationStateToClassification(state: ReconciliationState): string {
  switch (state) {
    case 'OBSERVED':            return 'OBSERVED'
    case 'PENDING':             return 'PENDING'
    case 'PARTITIONED':         return 'PARTITIONED'
    case 'RECONCILING':         return 'RECONCILING'
    case 'CONFLICTED':          return 'CONFLICTED'
    case 'SETTLEMENT_CANDIDATE': return 'SETTLEMENT_CANDIDATE'
    case 'CONVERGED':           return 'CONVERGED'
    case 'FINALIZED':           return 'FINALIZED_NON_EXECUTABLE'
    case 'REVOKED':             return 'REVOKED_NON_EXECUTABLE'
    case 'STALE_VISIBLE':       return 'STALE_VISIBLE'
    case 'NULL':                return 'NULL'
  }
}

// ── Revocation liveness downgrade propagation ─────────────────────────────────

export interface RevocationDowngradeInput {
  readonly reconciliation_id: string
  readonly current_state: ReconciliationState
  readonly revocation_evidence_ref: string
  readonly timestamp_utc: string
  readonly within_sla: boolean
}

export interface RevocationDowngradeResult {
  readonly reconciliation_state: ReconciliationState
  readonly downgrade_event: ReconciliationDowngradeEvent | null
  readonly creates_authority: false
  readonly restores_replay: false
  readonly executable: false
}

// Propagates a revocation liveness downgrade.
// Revoked legitimacy → REVOKED or STALE_VISIBLE (depending on SLA status).
// Revoked/stale legitimacy is non-executable in all cases.
// Propagation evidence is append-only.
export function propagateRevocationLivenessDowngrade(
  input: RevocationDowngradeInput,
): RevocationDowngradeResult {
  // Already at NULL — nothing to downgrade
  if (input.current_state === 'NULL') {
    return Object.freeze({
      reconciliation_state: 'NULL',
      downgrade_event: null,
      creates_authority: false,
      restores_replay: false,
      executable: false,
    })
  }

  // Determine target state: if revocation is recent (within SLA), collapse to REVOKED.
  // If revocation visibility is stale (outside SLA), collapse to STALE_VISIBLE.
  const target_state: ReconciliationState = input.within_sla ? 'REVOKED' : 'STALE_VISIBLE'

  const validation = validateReconciliationTransition(input.current_state, target_state)

  // If the direct transition is not valid (e.g. from FINALIZED to REVOKED),
  // still force to REVOKED for any state that is not already revoked/null.
  const effective_state: ReconciliationState =
    validation.valid ? target_state : 'REVOKED'

  const event_id = buildReconciliationDowngradeEventId(
    input.reconciliation_id,
    input.current_state,
    effective_state,
    input.timestamp_utc,
  )

  const downgrade_event: ReconciliationDowngradeEvent = Object.freeze({
    event_id,
    reconciliation_id: input.reconciliation_id,
    from_state: input.current_state,
    to_state: effective_state,
    reason_code: 'REVOCATION_LIVENESS_DOWNGRADE',
    timestamp_utc: input.timestamp_utc,
    evidence_refs: Object.freeze([input.revocation_evidence_ref]),
    creates_authority: false,
    restores_replay: false,
  })

  return Object.freeze({
    reconciliation_state: effective_state,
    downgrade_event,
    creates_authority: false,
    restores_replay: false,
    executable: false,
  })
}

// ── Stale lineage collapse ────────────────────────────────────────────────────

export interface StaleLineageCollapseInput {
  readonly reconciliation_id: string
  readonly current_state: ReconciliationState
  readonly lineage_epoch_advanced: boolean
  readonly lineage_renewal_present: boolean
  readonly timestamp_utc: string
  readonly evidence_refs?: readonly string[]
}

export interface StaleLineageCollapseResult {
  readonly reconciliation_state: ReconciliationState
  readonly downgrade_event: ReconciliationDowngradeEvent | null
  readonly creates_authority: false
  readonly restores_replay: false
}

// Collapses stale lineage to STALE_VISIBLE.
// A lineage whose epoch has advanced without renewal must collapse to STALE_VISIBLE.
// Collapse is evidence-only and append-only.
export function collapseStaleLineage(
  input: StaleLineageCollapseInput,
): StaleLineageCollapseResult {
  const is_stale = input.lineage_epoch_advanced && !input.lineage_renewal_present

  if (!is_stale) {
    return Object.freeze({
      reconciliation_state: input.current_state,
      downgrade_event: null,
      creates_authority: false,
      restores_replay: false,
    })
  }

  const event_id = buildReconciliationDowngradeEventId(
    input.reconciliation_id,
    input.current_state,
    'STALE_VISIBLE',
    input.timestamp_utc,
  )

  const downgrade_event: ReconciliationDowngradeEvent = Object.freeze({
    event_id,
    reconciliation_id: input.reconciliation_id,
    from_state: input.current_state,
    to_state: 'STALE_VISIBLE',
    reason_code: 'STALE_LINEAGE_COLLAPSE',
    timestamp_utc: input.timestamp_utc,
    evidence_refs: Object.freeze(input.evidence_refs ? [...input.evidence_refs] : []),
    creates_authority: false,
    restores_replay: false,
  })

  return Object.freeze({
    reconciliation_state: 'STALE_VISIBLE',
    downgrade_event,
    creates_authority: false,
    restores_replay: false,
  })
}
