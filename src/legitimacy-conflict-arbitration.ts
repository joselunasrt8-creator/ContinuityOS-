/**
 * src/legitimacy-conflict-arbitration.ts
 * Issue #1039 — Bounded Legitimacy Conflict Arbitration
 *
 * Evidence-only deterministic conflict arbitration for distributed legitimacy
 * disagreement. Observes and classifies conflict states across distributed
 * topology surfaces.
 *
 * Core transition:
 *   #1040 inter-surface coordination → pairwise legitimacy
 *   #1047 surface graph reconciliation → topology coherence
 *   #1039 legitimacy conflict arbitration → conflict classification
 *
 * Does not create authority, validate AEOs, execute, create proof, mutate
 * registries, rewrite lineage, repair conflicts automatically, or introduce
 * runtime routes beyond read-only observation.
 *
 * Conflict arbitration may classify only.
 * Conflict arbitration must never overwrite legitimacy state.
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Result constants ────────────────────────────────────────────────────────────

export const LEGITIMACY_CONFLICT_RESULTS = {
  CONFLICT_NONE: 'CONFLICT_NONE',
  CONFLICT_OBSERVED: 'CONFLICT_OBSERVED',
  CONFLICT_REQUIRES_RECONCILIATION: 'CONFLICT_REQUIRES_RECONCILIATION',
  CONFLICT_REQUIRES_HUMAN_REVIEW: 'CONFLICT_REQUIRES_HUMAN_REVIEW',
  CONFLICT_UNRESOLVABLE: 'CONFLICT_UNRESOLVABLE',
  NULL: 'NULL',
} as const

export type LegitimacyConflictResult =
  (typeof LEGITIMACY_CONFLICT_RESULTS)[keyof typeof LEGITIMACY_CONFLICT_RESULTS]

// ── Severity levels ─────────────────────────────────────────────────────────────

export const CONFLICT_SEVERITY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const

export type ConflictSeverityLevel =
  (typeof CONFLICT_SEVERITY_LEVELS)[keyof typeof CONFLICT_SEVERITY_LEVELS]

// ── Conflict classes ────────────────────────────────────────────────────────────

export const LEGITIMACY_CONFLICT_CLASSES = {
  LEGITIMACY_CONFLICT_NONE: 'legitimacy_conflict_none',
  LEGITIMACY_CONFLICT_OBSERVED: 'legitimacy_conflict_observed',
  LEGITIMACY_CONFLICT_RECONCILIATION_REQUIRED: 'legitimacy_conflict_reconciliation_required',
  LEGITIMACY_CONFLICT_HUMAN_REVIEW_REQUIRED: 'legitimacy_conflict_human_review_required',
  LEGITIMACY_CONFLICT_UNRESOLVABLE: 'legitimacy_conflict_unresolvable',
  LEGITIMACY_CONFLICT_LINEAGE_DIVERGENCE: 'legitimacy_conflict_lineage_divergence',
  LEGITIMACY_CONFLICT_PROOF_DIVERGENCE: 'legitimacy_conflict_proof_divergence',
  LEGITIMACY_CONFLICT_REGISTRY_DIVERGENCE: 'legitimacy_conflict_registry_divergence',
  LEGITIMACY_CONFLICT_REPLAY_AMBIGUITY: 'legitimacy_conflict_replay_ambiguity',
  LEGITIMACY_CONFLICT_TOPOLOGY_DRIFT: 'legitimacy_conflict_topology_drift',
  LEGITIMACY_CONFLICT_AUTHORITY_ATTEMPT: 'legitimacy_conflict_authority_attempt',
  LEGITIMACY_CONFLICT_EXECUTION_ATTEMPT: 'legitimacy_conflict_execution_attempt',
  LEGITIMACY_CONFLICT_PROOF_ATTEMPT: 'legitimacy_conflict_proof_attempt',
  LEGITIMACY_CONFLICT_REGISTRY_MUTATION: 'legitimacy_conflict_registry_mutation',
  LEGITIMACY_CONFLICT_IMPLICIT_PRIORITY_FORBIDDEN: 'legitimacy_conflict_implicit_priority_forbidden',
  LEGITIMACY_CONFLICT_BREAK_GLASS_NORMALIZATION: 'legitimacy_conflict_break_glass_normalization',
  LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION: 'legitimacy_conflict_boundary_violation',
  LEGITIMACY_CONFLICT_HASH_INVALID: 'legitimacy_conflict_hash_invalid',
  LEGITIMACY_CONFLICT_MISSING_LINEAGE: 'legitimacy_conflict_missing_lineage',
  LEGITIMACY_CONFLICT_CAUSAL_AMBIGUITY: 'legitimacy_conflict_causal_ambiguity',
} as const

export type LegitimacyConflictClass =
  (typeof LEGITIMACY_CONFLICT_CLASSES)[keyof typeof LEGITIMACY_CONFLICT_CLASSES]

// ── Internal helpers ────────────────────────────────────────────────────────────

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

function normalizeInputArray(arr: unknown): unknown[] {
  return Array.isArray(arr) ? arr : []
}

function sortedArrayValues(arr: unknown[]): string[] {
  return arr
    .map((v) => (typeof v === 'string' ? v : canonicalize(v)))
    .sort()
}

// ── Hash functions ──────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for a legitimacy conflict state.
 *
 * conflict_hash is excluded from its own input (no circularity).
 * arbitration_classes, surfaces, lineage_inputs, proof_inputs, and
 * causal_inputs are sorted before hashing so that reordering them does
 * not change the hash.
 */
export function computeLegitimacyConflictHash(fields: Record<string, unknown>): string {
  const { conflict_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    arbitration_classes: Array.isArray(rest.arbitration_classes)
      ? [...(rest.arbitration_classes as string[])].sort()
      : rest.arbitration_classes,
    surfaces: Array.isArray(rest.surfaces)
      ? sortedArrayValues(rest.surfaces as unknown[])
      : rest.surfaces,
    lineage_inputs: Array.isArray(rest.lineage_inputs)
      ? sortedArrayValues(rest.lineage_inputs as unknown[])
      : rest.lineage_inputs,
    proof_inputs: Array.isArray(rest.proof_inputs)
      ? sortedArrayValues(rest.proof_inputs as unknown[])
      : rest.proof_inputs,
    causal_inputs: Array.isArray(rest.causal_inputs)
      ? sortedArrayValues(rest.causal_inputs as unknown[])
      : rest.causal_inputs,
  }

  return sha256Hex(canonicalize(payload))
}

/**
 * Computes a deterministic SHA-256 hash for a conflict arbitration artifact.
 *
 * Excludes both conflict_hash and arbitration_hash from its own input.
 * Sorts all array fields for stability across reordering.
 */
export function computeArbitrationHash(fields: Record<string, unknown>): string {
  const { conflict_hash: _ch, arbitration_hash: _ah, ...rest } = fields

  const payload = {
    ...rest,
    arbitration_classes: Array.isArray(rest.arbitration_classes)
      ? [...(rest.arbitration_classes as string[])].sort()
      : rest.arbitration_classes,
    surfaces: Array.isArray(rest.surfaces)
      ? sortedArrayValues(rest.surfaces as unknown[])
      : rest.surfaces,
    lineage_inputs: Array.isArray(rest.lineage_inputs)
      ? sortedArrayValues(rest.lineage_inputs as unknown[])
      : rest.lineage_inputs,
    proof_inputs: Array.isArray(rest.proof_inputs)
      ? sortedArrayValues(rest.proof_inputs as unknown[])
      : rest.proof_inputs,
    causal_inputs: Array.isArray(rest.causal_inputs)
      ? sortedArrayValues(rest.causal_inputs as unknown[])
      : rest.causal_inputs,
  }

  return sha256Hex(canonicalize(payload))
}

// ── Boundary validation ─────────────────────────────────────────────────────────

/**
 * Validates that a conflict input does not attempt to cross canonical governance
 * boundaries. Returns the most specific violation class when a violation is
 * detected, or null when no violation is present.
 *
 * Boundary triggers (checked in priority order):
 *   implicit_priority present        → legitimacy_conflict_implicit_priority_forbidden
 *   creates_authority: true          → legitimacy_conflict_authority_attempt
 *   creates_execution: true          → legitimacy_conflict_execution_attempt
 *   creates_proof: true              → legitimacy_conflict_proof_attempt
 *   mutates_registry: true           → legitimacy_conflict_registry_mutation
 *   registry_mutation present        → legitimacy_conflict_registry_mutation
 *   authority_grant present          → legitimacy_conflict_boundary_violation
 *   execution_token present          → legitimacy_conflict_boundary_violation
 *   proof_signature present          → legitimacy_conflict_boundary_violation
 *   deployment_trigger present       → legitimacy_conflict_boundary_violation
 *   lineage_repair present           → legitimacy_conflict_boundary_violation
 *   auto_resolve present             → legitimacy_conflict_boundary_violation
 *   automatic_repair present         → legitimacy_conflict_boundary_violation
 *   stale_state_preferred present    → legitimacy_conflict_boundary_violation
 *   break_glass present              → legitimacy_conflict_break_glass_normalization
 *   is_break_glass present           → legitimacy_conflict_break_glass_normalization
 *   break_glass_normalized present   → legitimacy_conflict_break_glass_normalization
 */
export function validateConflictBoundary(input: unknown): LegitimacyConflictClass | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const obj = input as Record<string, unknown>

  if ('implicit_priority' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_IMPLICIT_PRIORITY_FORBIDDEN
  }
  if (obj.creates_authority === true) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_AUTHORITY_ATTEMPT
  }
  if (obj.creates_execution === true) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_EXECUTION_ATTEMPT
  }
  if (obj.creates_proof === true) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_PROOF_ATTEMPT
  }
  if (obj.mutates_registry === true) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_MUTATION
  }
  if ('registry_mutation' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_MUTATION
  }
  if ('authority_grant' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('execution_token' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('proof_signature' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('deployment_trigger' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('lineage_repair' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('auto_resolve' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('automatic_repair' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('stale_state_preferred' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION
  }
  if ('break_glass' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BREAK_GLASS_NORMALIZATION
  }
  if ('is_break_glass' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BREAK_GLASS_NORMALIZATION
  }
  if ('break_glass_normalized' in obj) {
    return LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BREAK_GLASS_NORMALIZATION
  }

  return null
}

// ── Classification ──────────────────────────────────────────────────────────────

/**
 * Classifies a legitimacy conflict state from a conflict input object.
 *
 * Returns a frozen classification record. Evidence only — does not create
 * authority, execute, validate AEOs, create proof, or mutate registries.
 * Fail-closed: any unresolvable condition returns NULL classification.
 *
 * Classification rules:
 *   CONFLICT_NONE                    — all legitimacy states reconcile deterministically
 *   CONFLICT_OBSERVED                — disagreement exists but topology reconstructable
 *   CONFLICT_REQUIRES_RECONCILIATION — topology drift or lineage divergence (bounded)
 *   CONFLICT_REQUIRES_HUMAN_REVIEW   — causal reconstruction ambiguous or replay-sensitive
 *   CONFLICT_UNRESOLVABLE            — topology cannot be reconstructed deterministically
 *   NULL                             — boundary violation, malformed, or missing required data
 */
export function classifyLegitimacyConflict(input: unknown): Record<string, unknown> {
  // Fail-closed: malformed/null input returns NULL classification
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return buildClassificationRecord(
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      [LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION],
      CONFLICT_SEVERITY_LEVELS.CRITICAL,
      false, false, false, false,
    )
  }

  const obj = input as Record<string, unknown>

  // Step 1: Boundary check
  const violation = validateConflictBoundary(input)
  if (violation !== null) {
    return buildClassificationRecord(
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      [violation],
      CONFLICT_SEVERITY_LEVELS.CRITICAL,
      false, false, false, false,
    )
  }

  // Step 2: Required fields — conflict_id and conflict_type must be non-empty strings
  const conflict_id =
    typeof obj.conflict_id === 'string' && obj.conflict_id.length > 0 ? obj.conflict_id : null
  const conflict_type =
    typeof obj.conflict_type === 'string' && obj.conflict_type.length > 0 ? obj.conflict_type : null

  if (!conflict_id || !conflict_type) {
    return buildClassificationRecord(
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      [LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION],
      CONFLICT_SEVERITY_LEVELS.CRITICAL,
      false, false, false, false,
    )
  }

  // Step 3: Missing lineage — lineage_inputs must be present (not null/undefined)
  if (!('lineage_inputs' in obj) || obj.lineage_inputs === null || obj.lineage_inputs === undefined) {
    return buildClassificationRecord(
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      [LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_MISSING_LINEAGE],
      CONFLICT_SEVERITY_LEVELS.CRITICAL,
      false, false, false, false,
    )
  }

  // Step 4: Hash validation — if conflict_hash is supplied in input, it must be valid
  if (
    'conflict_hash' in obj &&
    obj.conflict_hash !== null &&
    obj.conflict_hash !== undefined &&
    !isValidSha256Hex(obj.conflict_hash)
  ) {
    return buildClassificationRecord(
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      [LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_HASH_INVALID],
      CONFLICT_SEVERITY_LEVELS.CRITICAL,
      false, false, false, false,
    )
  }

  // Step 5: Evaluate conflict condition flags
  const topology_drift = obj.topology_drift_detected === true
  const lineage_divergence = obj.lineage_divergence_detected === true
  const proof_divergence = obj.proof_divergence_detected === true
  const registry_divergence = obj.registry_divergence_detected === true
  const replay_ambiguity = obj.replay_ambiguity_detected === true
  const causal_ambiguity = obj.causal_ambiguity_detected === true
  // topology_reconstructable: false explicitly signals UNRESOLVABLE
  const topology_reconstructable = obj.topology_reconstructable !== false

  // Accumulate condition-specific classes
  const condition_classes: LegitimacyConflictClass[] = []
  if (topology_drift) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_TOPOLOGY_DRIFT)
  }
  if (lineage_divergence) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_LINEAGE_DIVERGENCE)
  }
  if (proof_divergence) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_PROOF_DIVERGENCE)
  }
  if (registry_divergence) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_DIVERGENCE)
  }
  if (replay_ambiguity) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REPLAY_AMBIGUITY)
  }
  if (causal_ambiguity) {
    condition_classes.push(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_CAUSAL_AMBIGUITY)
  }

  let arbitration_result: LegitimacyConflictResult
  let severity: ConflictSeverityLevel
  let reconciliation_required = false
  let human_review_required = false
  let topology_conflict_detected = topology_drift || !topology_reconstructable
  const replay_sensitive = replay_ambiguity

  let result_class: LegitimacyConflictClass

  if (!topology_reconstructable) {
    // Rule 5: topology cannot be reconstructed deterministically → CONFLICT_UNRESOLVABLE
    arbitration_result = LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE
    severity = CONFLICT_SEVERITY_LEVELS.CRITICAL
    reconciliation_required = true
    human_review_required = true
    topology_conflict_detected = true
    result_class = LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_UNRESOLVABLE
  } else if (replay_ambiguity || causal_ambiguity) {
    // Rule 4: causal reconstruction ambiguous or replay-sensitive → CONFLICT_REQUIRES_HUMAN_REVIEW
    arbitration_result = LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW
    severity = CONFLICT_SEVERITY_LEVELS.HIGH
    human_review_required = true
    result_class = LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_HUMAN_REVIEW_REQUIRED
  } else if (topology_drift || lineage_divergence) {
    // Rule 3: topology drift or lineage divergence, conflict bounded → CONFLICT_REQUIRES_RECONCILIATION
    arbitration_result = LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION
    severity = CONFLICT_SEVERITY_LEVELS.HIGH
    reconciliation_required = true
    result_class = LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_RECONCILIATION_REQUIRED
  } else if (proof_divergence || registry_divergence) {
    // Rule 2: disagreement exists but topology reconstructable → CONFLICT_OBSERVED
    arbitration_result = LEGITIMACY_CONFLICT_RESULTS.CONFLICT_OBSERVED
    severity = CONFLICT_SEVERITY_LEVELS.MEDIUM
    result_class = LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_OBSERVED
  } else {
    // Rule 1: all supplied legitimacy states reconcile deterministically → CONFLICT_NONE
    arbitration_result = LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE
    severity = CONFLICT_SEVERITY_LEVELS.LOW
    result_class = LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_NONE
  }

  const arbitration_classes = [
    ...new Set([result_class, ...condition_classes]),
  ].sort() as LegitimacyConflictClass[]

  return buildClassificationRecord(
    arbitration_result,
    arbitration_classes,
    severity,
    reconciliation_required,
    human_review_required,
    topology_conflict_detected,
    replay_sensitive,
  )
}

function buildClassificationRecord(
  arbitration_result: LegitimacyConflictResult,
  arbitration_classes: LegitimacyConflictClass[],
  severity: ConflictSeverityLevel,
  reconciliation_required: boolean,
  human_review_required: boolean,
  topology_conflict_detected: boolean,
  replay_sensitive: boolean,
): Record<string, unknown> {
  return Object.freeze({
    arbitration_result,
    arbitration_classes: [...arbitration_classes].sort(),
    severity,
    reconciliation_required,
    human_review_required,
    topology_conflict_detected,
    replay_sensitive,
  })
}

// ── Arbitration ─────────────────────────────────────────────────────────────────

/**
 * Arbitrates a legitimacy conflict and returns a frozen evidence artifact.
 *
 * Calls classifyLegitimacyConflict internally and wraps the classification
 * in the canonical LEGITIMACY_CONFLICT_ARBITRATION artifact shape with a
 * deterministic SHA-256 conflict_hash.
 *
 * Does not create authority, execute, create proof, mutate registries,
 * repair topology, rewrite lineage, or resolve conflicts automatically.
 * Fail-closed: any unresolvable input produces a NULL-result artifact.
 */
export function arbitrateLegitimacyConflict(input: unknown): Record<string, unknown> {
  const obj = safeObj(input)

  // Extract raw input fields (used in the artifact regardless of classification outcome)
  const conflict_id = typeof obj.conflict_id === 'string' ? obj.conflict_id : ''
  const conflict_type = typeof obj.conflict_type === 'string' ? obj.conflict_type : ''
  const surfaces = normalizeInputArray(obj.surfaces)
  const lineage_inputs = normalizeInputArray(obj.lineage_inputs)
  const proof_inputs = normalizeInputArray(obj.proof_inputs)
  const causal_inputs = normalizeInputArray(obj.causal_inputs)

  // Classify — handles all validation, boundary checks, and rules
  const classification = classifyLegitimacyConflict(input) as {
    arbitration_result: LegitimacyConflictResult
    arbitration_classes: LegitimacyConflictClass[]
    severity: ConflictSeverityLevel
    reconciliation_required: boolean
    human_review_required: boolean
    topology_conflict_detected: boolean
    replay_sensitive: boolean
  }

  const {
    arbitration_result,
    arbitration_classes,
    severity,
    reconciliation_required,
    human_review_required,
    topology_conflict_detected,
    replay_sensitive,
  } = classification

  const fields: Record<string, unknown> = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    conflict_id,
    conflict_type,
    severity,
    surfaces: sortedArrayValues(surfaces),
    lineage_inputs: sortedArrayValues(lineage_inputs),
    proof_inputs: sortedArrayValues(proof_inputs),
    causal_inputs: sortedArrayValues(causal_inputs),
    arbitration_result,
    arbitration_classes: [...(arbitration_classes as string[])].sort(),
    reconciliation_required,
    human_review_required,
    topology_conflict_detected,
    replay_sensitive,
    conflict_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    conflict_hash: computeLegitimacyConflictHash(fields),
  })
}

// ── Conflict telemetry ──────────────────────────────────────────────────────────

/**
 * Reads conflict telemetry from a conflict arbitration artifact and an optional
 * list of conflict inputs. Returns a LEGITIMACY_CONFLICT_TELEMETRY evidence
 * object. Read-only — observes conflict outcomes only.
 *
 * Never satisfies conflict requirements.
 * Never creates proof, authority, execution, registry mutation,
 * topology repair, lineage repair, or synchronization.
 */
export function readConflictTelemetry(
  arbitration: unknown,
  conflicts?: unknown,
): Record<string, unknown> {
  const arb = safeObj(arbitration)
  const conflictList = Array.isArray(conflicts) ? conflicts : []

  const metrics: Record<string, number> = {
    conflict_none_total: 0,
    conflict_observed_total: 0,
    conflict_reconciliation_required_total: 0,
    conflict_human_review_required_total: 0,
    conflict_unresolvable_total: 0,
    lineage_divergence_total: 0,
    replay_ambiguity_total: 0,
    topology_conflict_total: 0,
    boundary_violation_total: 0,
  }

  // Count from arbitration artifact
  if (arb.artifact === 'LEGITIMACY_CONFLICT_ARBITRATION') {
    switch (arb.arbitration_result) {
      case LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE:
        metrics.conflict_none_total = 1
        break
      case LEGITIMACY_CONFLICT_RESULTS.CONFLICT_OBSERVED:
        metrics.conflict_observed_total = 1
        break
      case LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION:
        metrics.conflict_reconciliation_required_total = 1
        break
      case LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW:
        metrics.conflict_human_review_required_total = 1
        break
      case LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE:
        metrics.conflict_unresolvable_total = 1
        break
    }

    const classes = Array.isArray(arb.arbitration_classes)
      ? (arb.arbitration_classes as string[])
      : []
    if (classes.includes(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_LINEAGE_DIVERGENCE)) {
      metrics.lineage_divergence_total = 1
    }
    if (classes.includes(LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REPLAY_AMBIGUITY)) {
      metrics.replay_ambiguity_total = 1
    }
    if (arb.topology_conflict_detected === true) {
      metrics.topology_conflict_total = 1
    }
  }

  // Scan conflict list for boundary violations
  for (const conflict of conflictList) {
    const cobj = safeObj(conflict)
    if (
      cobj.creates_authority === true ||
      cobj.creates_execution === true ||
      cobj.creates_proof === true ||
      cobj.mutates_registry === true ||
      'authority_grant' in cobj ||
      'execution_token' in cobj ||
      'proof_signature' in cobj ||
      'registry_mutation' in cobj ||
      'deployment_trigger' in cobj ||
      'lineage_repair' in cobj ||
      'implicit_priority' in cobj ||
      'auto_resolve' in cobj ||
      'automatic_repair' in cobj ||
      'stale_state_preferred' in cobj ||
      'break_glass' in cobj ||
      'is_break_glass' in cobj ||
      'break_glass_normalized' in cobj
    ) {
      metrics.boundary_violation_total++
    }
  }

  return Object.freeze({
    artifact: 'LEGITIMACY_CONFLICT_TELEMETRY',
    evidence_only: true,
    read_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    metrics: Object.freeze({ ...metrics }),
  })
}
