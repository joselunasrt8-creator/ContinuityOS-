/**
 * src/distributed-topology-divergence-observer.ts
 * Issue #1052 — Distributed Topology Divergence Observer and Quorum Drift Telemetry
 *
 * Evidence-only read-only observer for distributed topology divergence classification.
 * Classifies topology disagreement only, built on top of the #1050 convergence layer.
 *
 * This observer must not create authority, validation, execution, proof,
 * reconciliation mutation, or automatic repair.
 * It classifies divergence; it does not change legitimacy state.
 */

import { createHash } from 'node:crypto'

import {
  DISTRIBUTED_TOPOLOGY_RESULTS,
  DISTRIBUTED_TOPOLOGY_CLASSES,
  computeDistributedTopologyHash,
} from './distributed-topology-convergence.ts'

// ── Result constants ───────────────────────────────────────────────────────────

export const TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS = {
  TOPOLOGY_DIVERGENCE_OBSERVED: 'TOPOLOGY_DIVERGENCE_OBSERVED',
  TOPOLOGY_DIVERGENCE_NONE: 'TOPOLOGY_DIVERGENCE_NONE',
  TOPOLOGY_DIVERGENCE_NULL: 'TOPOLOGY_DIVERGENCE_NULL',
} as const

export type TopologyDivergenceObservationResult =
  (typeof TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS)[keyof typeof TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS]

// ── Observation interface ──────────────────────────────────────────────────────

export interface DistributedTopologyDivergenceObservation {
  readonly artifact_type: 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION'
  readonly evidence_only: true
  readonly distributed_topology_hash: string
  readonly quorum_result: string
  readonly participant_count: number
  readonly converged_count: number
  readonly divergent_count: number
  readonly invalid_hash_count: number
  readonly stale_count: number
  readonly missing_evidence_count: number
  readonly boundary_trigger_count: number
  readonly collapse_reason: string | null
  readonly observation_result: TopologyDivergenceObservationResult
  readonly observation_hash: string
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/

function isValidSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalJson).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

// ── Collapse reason rule-priority order ───────────────────────────────────────
// Boundary violations first, then convergence failures, then participant state.

const COLLAPSE_REASON_PRIORITY: readonly string[] = [
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EXECUTION_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PROOF_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_REGISTRY_MUTATION,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BREAK_GLASS_NORMALIZATION,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION,
  DISTRIBUTED_TOPOLOGY_CLASSES.CONFLICT_ESCALATED,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_CONFLICT_UNRESOLVED,
  DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_COLLAPSED,
  DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_NOT_SATISFIED,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EPOCH_MISMATCH,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_INVALID,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_QUORUM_THRESHOLD_MISSING,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_STALE,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_DIVERGENT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_UNTRUSTED,
]

const BOUNDARY_TRIGGER_CLASSES = new Set<string>([
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EXECUTION_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PROOF_ATTEMPT,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_REGISTRY_MUTATION,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BREAK_GLASS_NORMALIZATION,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION,
])

const HASH_PROBLEM_CLASSES = new Set<string>([
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_INVALID,
  DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH,
])

// ── Hash computation ───────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 observation hash.
 * Excludes observation_hash itself from the hash input to prevent circularity.
 */
export function computeObservationHash(fields: Record<string, unknown>): string {
  const { observation_hash: _excluded, ...rest } = fields
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex')
}

// ── Null observation builder ───────────────────────────────────────────────────

function buildNullObservation(): DistributedTopologyDivergenceObservation {
  const fields = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION' as const,
    evidence_only: true as const,
    distributed_topology_hash: '',
    quorum_result: 'NULL',
    participant_count: 0,
    converged_count: 0,
    divergent_count: 0,
    invalid_hash_count: 0,
    stale_count: 0,
    missing_evidence_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
    observation_result: TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL,
  }
  const observation_hash = computeObservationHash(fields)
  return Object.freeze({ ...fields, observation_hash })
}

// ── Divergence observer ────────────────────────────────────────────────────────

/**
 * Observes distributed topology divergence from a convergence evidence artifact.
 * Read-only — classifies topology disagreement only.
 *
 * Fail-closed: if distributed_topology_hash is invalid, malformed, missing, or
 * does not recompute, returns TOPOLOGY_DIVERGENCE_NULL with zeroed metrics.
 *
 * Never creates authority, execution, proof, reconciliation, or registry mutation.
 * Never changes legitimacy state. No observer artifact may change legitimacy state.
 */
export function observeDistributedTopologyDivergence(
  input: unknown,
): DistributedTopologyDivergenceObservation {
  const obj = safeObj(input)

  // Fail-closed: must be a DISTRIBUTED_TOPOLOGY_CONVERGENCE artifact
  if (obj.artifact !== 'DISTRIBUTED_TOPOLOGY_CONVERGENCE') {
    return buildNullObservation()
  }

  // Fail-closed: distributed_topology_hash must be a valid SHA-256 hex string
  if (!isValidSha256Hex(obj.distributed_topology_hash)) {
    return buildNullObservation()
  }

  // Fail-closed: distributed_topology_hash must recompute correctly
  const recomputed = computeDistributedTopologyHash(obj)
  if (recomputed !== (obj.distributed_topology_hash as string)) {
    return buildNullObservation()
  }

  // Extract convergence fields
  const convergence_result =
    typeof obj.convergence_result === 'string'
      ? obj.convergence_result
      : DISTRIBUTED_TOPOLOGY_RESULTS.NULL
  const quorum_result = typeof obj.quorum_result === 'string' ? obj.quorum_result : 'NULL'
  const participant_count = typeof obj.participant_count === 'number' ? obj.participant_count : 0
  const current_count = typeof obj.current_count === 'number' ? obj.current_count : 0
  const stale_count = typeof obj.stale_count === 'number' ? obj.stale_count : 0
  const divergent_count = typeof obj.divergent_count === 'number' ? obj.divergent_count : 0
  const untrusted_count = typeof obj.untrusted_count === 'number' ? obj.untrusted_count : 0
  const convergence_classes = Array.isArray(obj.convergence_classes)
    ? (obj.convergence_classes as string[])
    : []

  // converged_count: participants contributing to a confirmed converged topology
  const converged_count =
    convergence_result === DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED ? current_count : 0

  // invalid_hash_count: count of hash-problem classes present in convergence_classes
  const invalid_hash_count = convergence_classes.filter((c) => HASH_PROBLEM_CLASSES.has(c)).length

  // missing_evidence_count: untrusted participants lack credible evidence
  const missing_evidence_count = untrusted_count

  // boundary_trigger_count: count of boundary-violation classes in convergence_classes
  const boundary_trigger_count = convergence_classes.filter((c) =>
    BOUNDARY_TRIGGER_CLASSES.has(c),
  ).length

  // Determine observation_result from convergence_result
  let observation_result: TopologyDivergenceObservationResult
  if (convergence_result === DISTRIBUTED_TOPOLOGY_RESULTS.NULL) {
    observation_result = TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL
  } else if (convergence_result === DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED) {
    observation_result = TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NONE
  } else {
    observation_result = TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_OBSERVED
  }

  // collapse_reason: highest-priority convergence class when divergence or null is observed
  // null when topology is fully converged (TOPOLOGY_DIVERGENCE_NONE)
  let collapse_reason: string | null = null
  if (observation_result !== TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NONE) {
    for (const reason of COLLAPSE_REASON_PRIORITY) {
      if (convergence_classes.includes(reason)) {
        collapse_reason = reason
        break
      }
    }
  }

  const fields = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION' as const,
    evidence_only: true as const,
    distributed_topology_hash: obj.distributed_topology_hash as string,
    quorum_result,
    participant_count,
    converged_count,
    divergent_count,
    invalid_hash_count,
    stale_count,
    missing_evidence_count,
    boundary_trigger_count,
    collapse_reason,
    observation_result,
  }

  const observation_hash = computeObservationHash(fields)

  return Object.freeze({ ...fields, observation_hash })
}
