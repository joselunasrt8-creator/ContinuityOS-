/**
 * src/distributed-topology-convergence.ts
 * Issue #1050 — Distributed Topology Convergence and Quorum Legitimacy
 *
 * Evidence-only deterministic distributed topology convergence layer.
 * Determines whether multiple topology views converge under quorum constraints.
 *
 * Quorum legitimacy may classify convergence only.
 * Quorum legitimacy must never create authority.
 * Quorum legitimacy must never treat majority as authority.
 * Quorum legitimacy must never repair stale topology.
 * Quorum legitimacy must never overwrite divergent topology views.
 */

import { canonicalize, sha256Hex } from './canonical.js'

import { LEGITIMACY_CONFLICT_RESULTS } from './legitimacy-conflict-arbitration.ts'

// ── Result constants ───────────────────────────────────────────────────────────

export const DISTRIBUTED_TOPOLOGY_RESULTS = {
  TOPOLOGY_CONVERGED: 'TOPOLOGY_CONVERGED',
  TOPOLOGY_DIVERGED: 'TOPOLOGY_DIVERGED',
  QUORUM_COLLAPSED: 'QUORUM_COLLAPSED',
  CONFLICT_ESCALATED: 'CONFLICT_ESCALATED',
  NULL: 'NULL',
} as const

export type DistributedTopologyResult =
  (typeof DISTRIBUTED_TOPOLOGY_RESULTS)[keyof typeof DISTRIBUTED_TOPOLOGY_RESULTS]

export const QUORUM_LEGITIMACY_RESULTS = {
  QUORUM_SATISFIED: 'QUORUM_SATISFIED',
  QUORUM_NOT_SATISFIED: 'QUORUM_NOT_SATISFIED',
  QUORUM_COLLAPSED: 'QUORUM_COLLAPSED',
  NULL: 'NULL',
} as const

export type QuorumLegitimacyResult =
  (typeof QUORUM_LEGITIMACY_RESULTS)[keyof typeof QUORUM_LEGITIMACY_RESULTS]

export const TOPOLOGY_PARTICIPANT_STATES = {
  PARTICIPANT_CURRENT: 'PARTICIPANT_CURRENT',
  PARTICIPANT_STALE: 'PARTICIPANT_STALE',
  PARTICIPANT_DIVERGENT: 'PARTICIPANT_DIVERGENT',
  PARTICIPANT_UNTRUSTED: 'PARTICIPANT_UNTRUSTED',
  PARTICIPANT_NULL: 'PARTICIPANT_NULL',
} as const

export type TopologyParticipantState =
  (typeof TOPOLOGY_PARTICIPANT_STATES)[keyof typeof TOPOLOGY_PARTICIPANT_STATES]

export const DISTRIBUTED_TOPOLOGY_CLASSES = {
  DISTRIBUTED_TOPOLOGY_CONVERGED: 'distributed_topology_converged',
  DISTRIBUTED_TOPOLOGY_DIVERGED: 'distributed_topology_diverged',
  QUORUM_SATISFIED: 'quorum_satisfied',
  QUORUM_NOT_SATISFIED: 'quorum_not_satisfied',
  QUORUM_COLLAPSED: 'quorum_collapsed',
  CONFLICT_ESCALATED: 'conflict_escalated',
  TOPOLOGY_PARTICIPANT_STALE: 'topology_participant_stale',
  TOPOLOGY_PARTICIPANT_DIVERGENT: 'topology_participant_divergent',
  TOPOLOGY_PARTICIPANT_UNTRUSTED: 'topology_participant_untrusted',
  TOPOLOGY_EPOCH_MISMATCH: 'topology_epoch_mismatch',
  TOPOLOGY_HASH_MISMATCH: 'topology_hash_mismatch',
  TOPOLOGY_QUORUM_THRESHOLD_MISSING: 'topology_quorum_threshold_missing',
  TOPOLOGY_SPLIT_BRAIN_DETECTED: 'topology_split_brain_detected',
  TOPOLOGY_CONFLICT_UNRESOLVED: 'topology_conflict_unresolved',
  TOPOLOGY_BOUNDARY_VIOLATION: 'topology_boundary_violation',
  TOPOLOGY_AUTHORITY_ATTEMPT: 'topology_authority_attempt',
  TOPOLOGY_EXECUTION_ATTEMPT: 'topology_execution_attempt',
  TOPOLOGY_PROOF_ATTEMPT: 'topology_proof_attempt',
  TOPOLOGY_REGISTRY_MUTATION: 'topology_registry_mutation',
  TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN: 'topology_implicit_consensus_forbidden',
  TOPOLOGY_BREAK_GLASS_NORMALIZATION: 'topology_break_glass_normalization',
  TOPOLOGY_HASH_INVALID: 'topology_hash_invalid',
} as const

export type DistributedTopologyClass =
  (typeof DISTRIBUTED_TOPOLOGY_CLASSES)[keyof typeof DISTRIBUTED_TOPOLOGY_CLASSES]

// ── Internal helpers ───────────────────────────────────────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/

function isValidSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

function detectBoundaryViolation(obj: Record<string, unknown>): DistributedTopologyClass | null {
  if (obj.creates_authority === true) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT
  }
  if (obj.creates_execution === true) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EXECUTION_ATTEMPT
  }
  if (obj.creates_proof === true) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PROOF_ATTEMPT
  }
  if (obj.mutates_registry === true) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_REGISTRY_MUTATION
  }
  if ('registry_mutation' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_REGISTRY_MUTATION
  }
  if ('authority_grant' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT
  }
  if ('execution_token' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EXECUTION_ATTEMPT
  }
  if ('proof_signature' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PROOF_ATTEMPT
  }
  if ('deployment_trigger' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION
  }
  if ('lineage_repair' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION
  }
  if ('implicit_consensus' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN
  }
  if ('auto_consensus' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN
  }
  if ('auto_repair' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION
  }
  if ('majority_as_authority' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT
  }
  if ('stale_state_preferred' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION
  }
  if ('break_glass' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BREAK_GLASS_NORMALIZATION
  }
  if ('is_break_glass' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BREAK_GLASS_NORMALIZATION
  }
  if ('break_glass_normalized' in obj) {
    return DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BREAK_GLASS_NORMALIZATION
  }
  return null
}

// ── Hash functions ─────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for a topology participant view.
 * Excludes participant_hash from the payload to prevent circularity.
 */
export function computeTopologyParticipantHash(fields: Record<string, unknown>): string {
  const { participant_hash: _excluded, ...rest } = fields
  return sha256Hex(canonicalize(rest))
}

/**
 * Computes a deterministic SHA-256 hash for a distributed topology convergence artifact.
 * Excludes distributed_topology_hash from the payload to prevent circularity.
 * Sorts convergence_classes, participant_hashes, and surface_graph_hashes for stability.
 */
export function computeDistributedTopologyHash(fields: Record<string, unknown>): string {
  const { distributed_topology_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    convergence_classes: Array.isArray(rest.convergence_classes)
      ? [...(rest.convergence_classes as string[])].sort()
      : rest.convergence_classes,
    participant_hashes: Array.isArray(rest.participant_hashes)
      ? [...(rest.participant_hashes as string[])].sort()
      : rest.participant_hashes,
    surface_graph_hashes: Array.isArray(rest.surface_graph_hashes)
      ? [...(rest.surface_graph_hashes as string[])].sort()
      : rest.surface_graph_hashes,
  }

  return sha256Hex(canonicalize(payload))
}

// ── Boundary validator (public) ────────────────────────────────────────────────

/**
 * Checks whether a distributed topology input contains boundary-violating fields.
 * Returns the most specific violation class, or null if clean.
 */
export function validateDistributedTopologyBoundary(
  input: unknown,
): DistributedTopologyClass | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return detectBoundaryViolation(input as Record<string, unknown>)
}

// ── Participant view builder ────────────────────────────────────────────────────

function buildNullParticipantView(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.freeze({
    artifact: 'TOPOLOGY_PARTICIPANT_VIEW',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    participant_id: typeof obj.participant_id === 'string' ? obj.participant_id : null,
    topology_epoch: typeof obj.topology_epoch === 'string' ? obj.topology_epoch : null,
    surface_graph_hash: null,
    arbitration_hash: null,
    participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL,
    observed_at: typeof obj.observed_at === 'string' ? obj.observed_at : null,
    participant_hash_alg: 'sha256',
    participant_hash: null,
  })
}

const KNOWN_PARTICIPANT_STATES = new Set<string>(Object.values(TOPOLOGY_PARTICIPANT_STATES))

/**
 * Builds a TOPOLOGY_PARTICIPANT_VIEW evidence artifact from input.
 * Returns a PARTICIPANT_NULL view on any boundary violation or malformed input.
 * Evidence only — does not create authority, execute, or mutate registries.
 */
export function buildTopologyParticipantView(input: unknown): Record<string, unknown> {
  const obj = safeObj(input)

  // Step 1: Boundary check
  const violation = detectBoundaryViolation(obj)
  if (violation !== null) {
    return buildNullParticipantView(obj)
  }

  // Step 2: Required string fields
  const participant_id =
    typeof obj.participant_id === 'string' && obj.participant_id.length > 0
      ? obj.participant_id
      : null
  const topology_epoch =
    typeof obj.topology_epoch === 'string' && obj.topology_epoch.length > 0
      ? obj.topology_epoch
      : null
  const observed_at =
    typeof obj.observed_at === 'string' && obj.observed_at.length > 0 ? obj.observed_at : null

  if (!participant_id || !topology_epoch || !observed_at) {
    return buildNullParticipantView(obj)
  }

  // Step 3: Validate surface_graph_hash (required, must be valid SHA-256 hex)
  const surface_graph_hash =
    typeof obj.surface_graph_hash === 'string' ? obj.surface_graph_hash : null
  if (!isValidSha256Hex(surface_graph_hash)) {
    return buildNullParticipantView(obj)
  }

  // Step 4: Validate arbitration_hash (optional, if non-null must be valid SHA-256 hex)
  const arbitration_hash =
    'arbitration_hash' in obj
      ? typeof obj.arbitration_hash === 'string'
        ? obj.arbitration_hash
        : null
      : null
  if (arbitration_hash !== null && !isValidSha256Hex(arbitration_hash)) {
    return buildNullParticipantView(obj)
  }

  // Step 5: Validate participant_state (must be a known non-NULL state)
  const participant_state =
    typeof obj.participant_state === 'string' ? obj.participant_state : null
  if (
    !participant_state ||
    !KNOWN_PARTICIPANT_STATES.has(participant_state) ||
    participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL
  ) {
    return buildNullParticipantView(obj)
  }

  const fields: Record<string, unknown> = {
    artifact: 'TOPOLOGY_PARTICIPANT_VIEW',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    participant_id,
    topology_epoch,
    surface_graph_hash,
    arbitration_hash,
    participant_state,
    observed_at,
    participant_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    participant_hash: computeTopologyParticipantHash(fields),
  })
}

// ── Quorum evaluation ──────────────────────────────────────────────────────────

interface QuorumAssessment {
  quorum_result: QuorumLegitimacyResult
  participant_count: number
  current_count: number
  stale_count: number
  divergent_count: number
  untrusted_count: number
  quorum_threshold: number
}

/**
 * Evaluates quorum satisfaction from an array of topology participant views.
 * Evidence only — classifies quorum state, does not create authority.
 * Never treats majority as authority; quorum_satisfied means threshold met, nothing more.
 */
export function evaluateTopologyQuorum(
  views: unknown,
  quorum_threshold: unknown,
): QuorumAssessment {
  const threshold =
    typeof quorum_threshold === 'number' &&
    Number.isInteger(quorum_threshold) &&
    quorum_threshold > 0
      ? quorum_threshold
      : 0

  if (!Array.isArray(views) || views.length === 0 || threshold === 0) {
    return {
      quorum_result: QUORUM_LEGITIMACY_RESULTS.QUORUM_COLLAPSED,
      participant_count: Array.isArray(views) ? views.length : 0,
      current_count: 0,
      stale_count: 0,
      divergent_count: 0,
      untrusted_count: 0,
      quorum_threshold: threshold,
    }
  }

  let current_count = 0
  let stale_count = 0
  let divergent_count = 0
  let untrusted_count = 0

  for (const view of views) {
    const vObj = safeObj(view)
    switch (vObj.participant_state) {
      case TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT:
        current_count++
        break
      case TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE:
        stale_count++
        break
      case TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_DIVERGENT:
        divergent_count++
        break
      case TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_UNTRUSTED:
        untrusted_count++
        break
    }
  }

  let quorum_result: QuorumLegitimacyResult
  if (current_count >= threshold) {
    quorum_result = QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED
  } else if (current_count + stale_count + divergent_count + untrusted_count === 0) {
    quorum_result = QUORUM_LEGITIMACY_RESULTS.QUORUM_COLLAPSED
  } else {
    quorum_result = QUORUM_LEGITIMACY_RESULTS.QUORUM_NOT_SATISFIED
  }

  return {
    quorum_result,
    participant_count: views.length,
    current_count,
    stale_count,
    divergent_count,
    untrusted_count,
    quorum_threshold: threshold,
  }
}

// ── Convergence output builders ────────────────────────────────────────────────

function buildConvergenceOutput(
  convergence_result: DistributedTopologyResult,
  quorum_result: QuorumLegitimacyResult,
  convergence_classes: DistributedTopologyClass[],
  views: Record<string, unknown>[],
  quorum_threshold: number,
  topology_epoch: string | null,
): Record<string, unknown> {
  const current_count = views.filter(
    (v) => v.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT,
  ).length
  const stale_count = views.filter(
    (v) => v.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
  ).length
  const divergent_count = views.filter(
    (v) => v.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_DIVERGENT,
  ).length
  const untrusted_count = views.filter(
    (v) => v.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_UNTRUSTED,
  ).length

  const surface_graph_hashes = [
    ...new Set(
      views
        .filter((v) => isValidSha256Hex(v.surface_graph_hash))
        .map((v) => v.surface_graph_hash as string),
    ),
  ].sort()

  const participant_hashes = [
    ...new Set(
      views
        .filter((v) => isValidSha256Hex(v.participant_hash))
        .map((v) => v.participant_hash as string),
    ),
  ].sort()

  const sortedClasses = [...new Set(convergence_classes)].sort()

  const fields: Record<string, unknown> = {
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    convergence_result,
    quorum_result,
    convergence_classes: sortedClasses,
    participant_count: views.length,
    current_count,
    stale_count,
    divergent_count,
    untrusted_count,
    quorum_threshold,
    topology_epoch,
    surface_graph_hashes,
    participant_hashes,
    distributed_topology_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    distributed_topology_hash: computeDistributedTopologyHash(fields),
  })
}

function buildNullConvergence(
  convergence_classes: DistributedTopologyClass[],
  quorum_threshold: number,
): Record<string, unknown> {
  const sortedClasses = [...new Set(convergence_classes)].sort()

  const fields: Record<string, unknown> = {
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    convergence_result: DISTRIBUTED_TOPOLOGY_RESULTS.NULL,
    quorum_result: QUORUM_LEGITIMACY_RESULTS.NULL,
    convergence_classes: sortedClasses,
    participant_count: 0,
    current_count: 0,
    stale_count: 0,
    divergent_count: 0,
    untrusted_count: 0,
    quorum_threshold,
    topology_epoch: null,
    surface_graph_hashes: [],
    participant_hashes: [],
    distributed_topology_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    distributed_topology_hash: computeDistributedTopologyHash(fields),
  })
}

// ── Distributed topology convergence ──────────────────────────────────────────

/**
 * Evaluates distributed topology convergence from multiple participant views
 * under quorum constraints.
 *
 * Convergence rules:
 *   TOPOLOGY_CONVERGED   — quorum satisfied AND all current participants agree on
 *                          the same topology_epoch and surface_graph_hash.
 *   TOPOLOGY_DIVERGED    — quorum satisfied BUT current participants disagree on
 *                          topology hash or epoch.
 *   QUORUM_COLLAPSED     — quorum_threshold cannot be met.
 *   CONFLICT_ESCALATED   — arbitration evidence indicates unresolved or
 *                          human-review-required conflict.
 *   NULL                 — malformed inputs, boundary violations, or hash failures.
 *
 * Evidence only. Never creates authority. Never repairs topology.
 * Never treats majority as authority. Never prefers stale state.
 */
export function evaluateDistributedTopologyConvergence(input: unknown): Record<string, unknown> {
  const obj = safeObj(input)

  // Step 1: Top-level boundary check
  const violation = detectBoundaryViolation(obj)
  if (violation !== null) {
    return buildNullConvergence([violation], 0)
  }

  // Step 2: Validate quorum_threshold
  const rawThreshold = obj.quorum_threshold
  if (
    typeof rawThreshold !== 'number' ||
    !Number.isInteger(rawThreshold) ||
    rawThreshold <= 0
  ) {
    return buildNullConvergence(
      [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_QUORUM_THRESHOLD_MISSING],
      0,
    )
  }
  const quorum_threshold = rawThreshold

  // Step 3: Validate participant_views
  const rawViews = obj.participant_views
  if (!Array.isArray(rawViews) || rawViews.length === 0) {
    return buildNullConvergence(
      [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION],
      quorum_threshold,
    )
  }

  // Step 4: Validate each participant view
  const validatedViews: Record<string, unknown>[] = []
  for (const view of rawViews) {
    const vObj = safeObj(view)

    // Boundary violation within view
    const vViolation = detectBoundaryViolation(vObj)
    if (vViolation !== null) {
      return buildNullConvergence([vViolation], quorum_threshold)
    }

    // Must be a TOPOLOGY_PARTICIPANT_VIEW artifact
    if (vObj.artifact !== 'TOPOLOGY_PARTICIPANT_VIEW') {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION],
        quorum_threshold,
      )
    }

    // Must be evidence_only
    if (vObj.evidence_only !== true) {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION],
        quorum_threshold,
      )
    }

    // NULL participant state → convergence NULL
    if (vObj.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL) {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION],
        quorum_threshold,
      )
    }

    // participant_hash must be valid SHA-256 hex
    if (!isValidSha256Hex(vObj.participant_hash)) {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_INVALID],
        quorum_threshold,
      )
    }

    // Recompute participant_hash to verify integrity
    const { participant_hash: _ph, ...fieldsWithoutHash } = vObj
    const recomputed = computeTopologyParticipantHash(fieldsWithoutHash)
    if (recomputed !== vObj.participant_hash) {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH],
        quorum_threshold,
      )
    }

    // surface_graph_hash must be valid SHA-256 hex
    if (!isValidSha256Hex(vObj.surface_graph_hash)) {
      return buildNullConvergence(
        [DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_INVALID],
        quorum_threshold,
      )
    }

    validatedViews.push(vObj)
  }

  // Step 5: Check arbitration evidence for conflict escalation
  const arbEvidence = obj.arbitration_evidence != null ? obj.arbitration_evidence : null
  if (arbEvidence !== null) {
    const arbObj = safeObj(arbEvidence)
    const arbViolation = detectBoundaryViolation(arbObj)
    if (arbViolation !== null) {
      return buildNullConvergence([arbViolation], quorum_threshold)
    }
    const arbResult = arbObj.arbitration_result
    if (
      arbResult === LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW ||
      arbResult === LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE
    ) {
      return buildConvergenceOutput(
        DISTRIBUTED_TOPOLOGY_RESULTS.CONFLICT_ESCALATED,
        QUORUM_LEGITIMACY_RESULTS.NULL,
        [
          DISTRIBUTED_TOPOLOGY_CLASSES.CONFLICT_ESCALATED,
          DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_CONFLICT_UNRESOLVED,
        ],
        validatedViews,
        quorum_threshold,
        null,
      )
    }
  }

  // Step 6: Evaluate quorum
  const quorum = evaluateTopologyQuorum(validatedViews, quorum_threshold)

  // Step 7: Accumulate participant state classes
  const stateClasses: DistributedTopologyClass[] = []
  if (quorum.stale_count > 0) {
    stateClasses.push(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_STALE)
  }
  if (quorum.divergent_count > 0) {
    stateClasses.push(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_DIVERGENT)
  }
  if (quorum.untrusted_count > 0) {
    stateClasses.push(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_UNTRUSTED)
  }

  // Step 8: Quorum not satisfied → QUORUM_COLLAPSED convergence
  if (quorum.quorum_result !== QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED) {
    const collapseClasses: DistributedTopologyClass[] = [
      DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_COLLAPSED,
      quorum.quorum_result === QUORUM_LEGITIMACY_RESULTS.QUORUM_NOT_SATISFIED
        ? DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_NOT_SATISFIED
        : DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_COLLAPSED,
      ...stateClasses,
    ]
    return buildConvergenceOutput(
      DISTRIBUTED_TOPOLOGY_RESULTS.QUORUM_COLLAPSED,
      quorum.quorum_result,
      collapseClasses,
      validatedViews,
      quorum_threshold,
      null,
    )
  }

  // Step 9: Quorum satisfied — check agreement among current participants
  const currentViews = validatedViews.filter(
    (v) => v.participant_state === TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT,
  )

  const uniqueEpochs = new Set(currentViews.map((v) => v.topology_epoch as string))
  const uniqueHashes = new Set(currentViews.map((v) => v.surface_graph_hash as string))

  const hasEpochMismatch = uniqueEpochs.size > 1
  const hasHashMismatch = uniqueHashes.size > 1

  if (hasEpochMismatch || hasHashMismatch) {
    const divergeClasses: DistributedTopologyClass[] = [
      DISTRIBUTED_TOPOLOGY_CLASSES.DISTRIBUTED_TOPOLOGY_DIVERGED,
      DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_SATISFIED,
      DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED,
    ]
    if (hasEpochMismatch) {
      divergeClasses.push(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EPOCH_MISMATCH)
    }
    if (hasHashMismatch) {
      divergeClasses.push(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH)
    }
    divergeClasses.push(...stateClasses)

    return buildConvergenceOutput(
      DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED,
      QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED,
      divergeClasses,
      validatedViews,
      quorum_threshold,
      null,
    )
  }

  // Step 10: TOPOLOGY_CONVERGED
  const agreedEpoch = uniqueEpochs.size === 1 ? [...uniqueEpochs][0] : null

  const convergeClasses: DistributedTopologyClass[] = [
    DISTRIBUTED_TOPOLOGY_CLASSES.DISTRIBUTED_TOPOLOGY_CONVERGED,
    DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_SATISFIED,
    ...stateClasses,
  ]

  return buildConvergenceOutput(
    DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED,
    QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED,
    convergeClasses,
    validatedViews,
    quorum_threshold,
    agreedEpoch,
  )
}

// ── Distributed topology telemetry ─────────────────────────────────────────────

/**
 * Reads distributed topology telemetry from a convergence evidence artifact.
 * Read-only — observes convergence outcomes only.
 *
 * Never satisfies convergence requirements.
 * Never creates authority, execution, proof, or registry mutation.
 * Never converts divergence into convergence.
 *
 * If the artifact has an invalid distributed_topology_hash, returns zero metrics
 * (fail-closed: tampered or malformed artifacts produce no telemetry signal).
 */
export function readDistributedTopologyTelemetry(convergence: unknown): Record<string, unknown> {
  const obj = safeObj(convergence)

  const metrics: Record<string, number> = {
    topology_converged_total: 0,
    topology_diverged_total: 0,
    quorum_satisfied_total: 0,
    quorum_not_satisfied_total: 0,
    quorum_collapsed_total: 0,
    conflict_escalated_total: 0,
    participant_stale_total: 0,
    participant_divergent_total: 0,
    participant_untrusted_total: 0,
    split_brain_detected_total: 0,
  }

  if (obj.artifact !== 'DISTRIBUTED_TOPOLOGY_CONVERGENCE') {
    return Object.freeze({
      artifact: 'DISTRIBUTED_TOPOLOGY_TELEMETRY',
      evidence_only: true,
      read_only: true,
      creates_authority: false,
      creates_execution: false,
      creates_proof: false,
      mutates_registry: false,
      metrics: Object.freeze({ ...metrics }),
    })
  }

  // Fail-closed: if distributed_topology_hash is present but invalid, trust nothing
  if (
    'distributed_topology_hash' in obj &&
    !isValidSha256Hex(obj.distributed_topology_hash)
  ) {
    return Object.freeze({
      artifact: 'DISTRIBUTED_TOPOLOGY_TELEMETRY',
      evidence_only: true,
      read_only: true,
      creates_authority: false,
      creates_execution: false,
      creates_proof: false,
      mutates_registry: false,
      metrics: Object.freeze({ ...metrics }),
    })
  }

  switch (obj.convergence_result) {
    case DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED:
      metrics.topology_converged_total = 1
      break
    case DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED:
      metrics.topology_diverged_total = 1
      break
    case DISTRIBUTED_TOPOLOGY_RESULTS.QUORUM_COLLAPSED:
      metrics.quorum_collapsed_total = 1
      break
    case DISTRIBUTED_TOPOLOGY_RESULTS.CONFLICT_ESCALATED:
      metrics.conflict_escalated_total = 1
      break
  }

  switch (obj.quorum_result) {
    case QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED:
      metrics.quorum_satisfied_total = 1
      break
    case QUORUM_LEGITIMACY_RESULTS.QUORUM_NOT_SATISFIED:
      metrics.quorum_not_satisfied_total = 1
      break
  }

  if (typeof obj.stale_count === 'number') {
    metrics.participant_stale_total = obj.stale_count
  }
  if (typeof obj.divergent_count === 'number') {
    metrics.participant_divergent_total = obj.divergent_count
  }
  if (typeof obj.untrusted_count === 'number') {
    metrics.participant_untrusted_total = obj.untrusted_count
  }

  const classes = Array.isArray(obj.convergence_classes)
    ? (obj.convergence_classes as string[])
    : []
  if (classes.includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED)) {
    metrics.split_brain_detected_total = 1
  }

  return Object.freeze({
    artifact: 'DISTRIBUTED_TOPOLOGY_TELEMETRY',
    evidence_only: true,
    read_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    metrics: Object.freeze({ ...metrics }),
  })
}
