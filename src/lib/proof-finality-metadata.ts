import { sha256Hex, canonicalize } from '../canonical.js'
import { type FinalityClassification } from './finality-classification.js'

// Evidence-only — proof finality metadata ≠ authority.
// Downgrade/upgrade events are append-only. No overwrite path. No authority creation.
export const proof_finality_creates_authority = false as const
export const restores_replay = false as const

export interface ProofDowngradeEvent {
  readonly event_id: string
  readonly proof_id: string
  readonly from_classification: FinalityClassification
  readonly to_classification: FinalityClassification
  readonly reason_code: string
  readonly timestamp_utc: string
  readonly evidence_ref?: string
}

export interface ProofUpgradeEvent {
  readonly event_id: string
  readonly proof_id: string
  readonly from_classification: FinalityClassification
  readonly to_classification: FinalityClassification
  readonly reason_code: string
  readonly timestamp_utc: string
  readonly evidence_ref?: string
}

export interface ProofFinalityMetadata {
  readonly proof_id: string
  readonly finality_classification: FinalityClassification
  readonly topology_snapshot_hash: string
  readonly epoch_id: string
  readonly downgrade_events: readonly ProofDowngradeEvent[]
  readonly upgrade_events: readonly ProofUpgradeEvent[]
  readonly detached: boolean
  readonly detach_reason?: DetachReason
  readonly creates_authority: false
  readonly restores_replay: false
}

export interface ProofFinalityClassificationResult {
  readonly classification: FinalityClassification
  readonly detached: boolean
  readonly detach_reason?: DetachReason
  readonly downgrade_events: readonly ProofDowngradeEvent[]
  readonly upgrade_events: readonly ProofUpgradeEvent[]
  readonly creates_authority: false
  readonly restores_replay: false
}

export type DetachReason =
  | 'missing_continuity_lineage'
  | 'missing_validated_object_hash'
  | 'missing_execution_lineage'
  | 'stale_proof_reuse'

// Builds a deterministic event_id for a proof downgrade event.
export function buildProofDowngradeEventId(
  proof_id: string,
  from_classification: FinalityClassification,
  to_classification: FinalityClassification,
  timestamp_utc: string,
): string {
  return `pde_${sha256Hex(canonicalize({ proof_id, from_classification, to_classification, timestamp_utc }))}`
}

// Builds a deterministic event_id for a proof upgrade event.
export function buildProofUpgradeEventId(
  proof_id: string,
  from_classification: FinalityClassification,
  to_classification: FinalityClassification,
  timestamp_utc: string,
): string {
  return `pue_${sha256Hex(canonicalize({ proof_id, from_classification, to_classification, timestamp_utc }))}`
}

// Returns true if the proof is detached — missing sufficient lineage for finality classification.
//
// Priority: continuity lineage checked first; stale_proof_reuse checked last.
// detached proof → NULL (or STALE_VISIBLE for stale_proof_reuse case).
export function isProofDetached(input: {
  readonly continuity_lineage_present: boolean
  readonly validated_object_hash_present: boolean
  readonly execution_lineage_present: boolean
  readonly stale_proof_reuse: boolean
}): { detached: boolean; detach_reason?: DetachReason } {
  if (!input.continuity_lineage_present) {
    return { detached: true, detach_reason: 'missing_continuity_lineage' }
  }
  if (!input.validated_object_hash_present) {
    return { detached: true, detach_reason: 'missing_validated_object_hash' }
  }
  if (!input.execution_lineage_present) {
    return { detached: true, detach_reason: 'missing_execution_lineage' }
  }
  if (input.stale_proof_reuse) {
    return { detached: true, detach_reason: 'stale_proof_reuse' }
  }
  return { detached: false }
}

// Appends a downgrade event to an existing event list (append-only).
// Returns a new frozen array; never mutates the existing list.
export function appendProofDowngradeEvent(
  existing: readonly ProofDowngradeEvent[],
  event: ProofDowngradeEvent,
): readonly ProofDowngradeEvent[] {
  return Object.freeze([...existing, event])
}

// Appends an upgrade event to an existing event list (append-only).
// Returns a new frozen array; never mutates the existing list.
// Upgrade does not create authority and does not restore replay eligibility.
export function appendProofUpgradeEvent(
  existing: readonly ProofUpgradeEvent[],
  event: ProofUpgradeEvent,
): readonly ProofUpgradeEvent[] {
  return Object.freeze([...existing, event])
}

// Classifies proof finality from the given inputs.
//
// Core rules (in priority order):
// 1. Detached proof (missing lineage or stale reuse) → NULL or STALE_VISIBLE.
// 2. Partition-local proof (topology_present=false) → PARTITION_SUSPENDED.
// 3. Otherwise: return current_classification unchanged.
//
// Output invariants:
// - creates_authority = false
// - restores_replay = false
export function classifyProofFinality(input: {
  readonly proof_id: string
  readonly topology_snapshot_hash: string
  readonly epoch_id: string
  readonly topology_present: boolean
  readonly continuity_lineage_present: boolean
  readonly validated_object_hash_present: boolean
  readonly execution_lineage_present: boolean
  readonly stale_proof_reuse: boolean
  readonly current_classification: FinalityClassification
  readonly downgrade_events: readonly ProofDowngradeEvent[]
  readonly upgrade_events: readonly ProofUpgradeEvent[]
}): ProofFinalityClassificationResult {
  const { detached, detach_reason } = isProofDetached({
    continuity_lineage_present: input.continuity_lineage_present,
    validated_object_hash_present: input.validated_object_hash_present,
    execution_lineage_present: input.execution_lineage_present,
    stale_proof_reuse: input.stale_proof_reuse,
  })

  if (detached) {
    // stale_proof_reuse is STALE_VISIBLE; all other detach reasons → NULL
    const classification: FinalityClassification =
      detach_reason === 'stale_proof_reuse' ? 'STALE_VISIBLE' : 'NULL'
    return Object.freeze({
      classification,
      detached: true,
      detach_reason,
      downgrade_events: Object.freeze([...input.downgrade_events]),
      upgrade_events: Object.freeze([...input.upgrade_events]),
      creates_authority: false,
      restores_replay: false,
    })
  }

  // Partition-local proof: topology absent → PARTITION_SUSPENDED regardless of predicates
  if (!input.topology_present) {
    return Object.freeze({
      classification: 'PARTITION_SUSPENDED',
      detached: false,
      downgrade_events: Object.freeze([...input.downgrade_events]),
      upgrade_events: Object.freeze([...input.upgrade_events]),
      creates_authority: false,
      restores_replay: false,
    })
  }

  return Object.freeze({
    classification: input.current_classification,
    detached: false,
    downgrade_events: Object.freeze([...input.downgrade_events]),
    upgrade_events: Object.freeze([...input.upgrade_events]),
    creates_authority: false,
    restores_replay: false,
  })
}
