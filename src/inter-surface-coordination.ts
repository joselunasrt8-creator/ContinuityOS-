/**
 * src/inter-surface-coordination.ts
 * Issue #1040 — Inter-Surface Legitimacy Coordination Rules
 *
 * Evidence only — defines deterministic coordination semantics between
 * governed surfaces. Does not create authority, execute, create proof,
 * synchronize implicitly, mutate registries, or introduce new runtime
 * execution paths.
 *
 * Core invariant: local validity ≠ topology validity.
 * A surface event may be locally valid but invalid when coordinated with
 * another surface. This module evaluates that cross-surface constraint.
 */

import { createHash } from 'node:crypto'

// ── Coordination results ───────────────────────────────────────────────────────

export const INTER_SURFACE_COORDINATION_RESULTS = {
  COORDINATION_ALLOWED: 'COORDINATION_ALLOWED',
  COORDINATION_FORBIDDEN: 'COORDINATION_FORBIDDEN',
  NULL: 'NULL',
} as const

export type InterSurfaceCoordinationResult =
  (typeof INTER_SURFACE_COORDINATION_RESULTS)[keyof typeof INTER_SURFACE_COORDINATION_RESULTS]

// ── Coordination classes ───────────────────────────────────────────────────────

export const INTER_SURFACE_COORDINATION_CLASSES = {
  INTER_SURFACE_COORDINATION_ALLOWED: 'inter_surface_coordination_allowed',
  INTER_SURFACE_COORDINATION_FORBIDDEN: 'inter_surface_coordination_forbidden',
  INTER_SURFACE_MISSING_SURFACE: 'inter_surface_missing_surface',
  INTER_SURFACE_UNKNOWN_SURFACE: 'inter_surface_unknown_surface',
  INTER_SURFACE_MISSING_INTERACTION: 'inter_surface_missing_interaction',
  INTER_SURFACE_UNKNOWN_INTERACTION: 'inter_surface_unknown_interaction',
  INTER_SURFACE_PROOF_REQUIRED: 'inter_surface_proof_required',
  INTER_SURFACE_LINEAGE_REQUIRED: 'inter_surface_lineage_required',
  INTER_SURFACE_ORDERING_REQUIRED: 'inter_surface_ordering_required',
  INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN: 'inter_surface_implicit_sync_forbidden',
  INTER_SURFACE_BOUNDARY_VIOLATION: 'inter_surface_boundary_violation',
  INTER_SURFACE_AUTHORITY_ATTEMPT: 'inter_surface_authority_attempt',
  INTER_SURFACE_EXECUTION_ATTEMPT: 'inter_surface_execution_attempt',
  INTER_SURFACE_PROOF_ATTEMPT: 'inter_surface_proof_attempt',
  INTER_SURFACE_REGISTRY_MUTATION: 'inter_surface_registry_mutation',
} as const

export type InterSurfaceCoordinationClass =
  (typeof INTER_SURFACE_COORDINATION_CLASSES)[keyof typeof INTER_SURFACE_COORDINATION_CLASSES]

// ── Surface types ──────────────────────────────────────────────────────────────

export const SURFACE_TYPES = {
  DEPLOY: 'deploy',
  ROLLBACK: 'rollback',
  PROOF: 'proof',
  TELEMETRY: 'telemetry',
  CONTINUITY: 'continuity',
  TOPOLOGY: 'topology',
  CTO: 'cto',
  AGENT: 'agent',
  RECONCILIATION: 'reconciliation',
} as const

export type SurfaceType = (typeof SURFACE_TYPES)[keyof typeof SURFACE_TYPES]

// ── Interaction types ──────────────────────────────────────────────────────────

export const INTERACTION_TYPES = {
  TRIGGERS: 'triggers',
  DEPENDS_ON: 'depends_on',
  OBSERVES: 'observes',
  RECONCILES: 'reconciles',
  ROLLS_BACK: 'rolls_back',
  PROVES: 'proves',
  INVALIDATES: 'invalidates',
  PROPAGATES: 'propagates',
  REPORTS: 'reports',
} as const

export type InteractionType = (typeof INTERACTION_TYPES)[keyof typeof INTERACTION_TYPES]

// ── Known value sets ───────────────────────────────────────────────────────────

const KNOWN_SURFACES = new Set<string>(Object.values(SURFACE_TYPES))
const KNOWN_INTERACTIONS = new Set<string>(Object.values(INTERACTION_TYPES))

// ── Helpers ────────────────────────────────────────────────────────────────────

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

// ── Hash computation ───────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 coordination hash.
 *
 * coordination_hash is excluded from its own input (no circularity).
 * coordination_classes and forbidden_conditions are sorted before hashing
 * so that reordering them does not change the hash.
 */
export function computeInterSurfaceCoordinationHash(fields: Record<string, unknown>): string {
  const { coordination_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    coordination_classes: Array.isArray(rest.coordination_classes)
      ? [...(rest.coordination_classes as string[])].sort()
      : rest.coordination_classes,
    forbidden_conditions: Array.isArray(rest.forbidden_conditions)
      ? [...(rest.forbidden_conditions as string[])].sort()
      : rest.forbidden_conditions,
  }

  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

// ── Result builder ─────────────────────────────────────────────────────────────

function buildResult(
  coordination_result: InterSurfaceCoordinationResult,
  coordination_classes: InterSurfaceCoordinationClass[],
  forbidden_conditions: string[],
  surface_a: string | null,
  surface_b: string | null,
  interaction_type: string | null,
  requires_proof: boolean,
  requires_lineage: boolean,
  requires_ordering: boolean,
  proof_present: boolean,
  lineage_present: boolean,
  ordering_present: boolean,
): Record<string, unknown> {
  const sortedClasses = [...coordination_classes].sort()
  const sortedConditions = [...forbidden_conditions].sort()

  const fields: Record<string, unknown> = {
    artifact: 'INTER_SURFACE_COORDINATION_RULESET',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a,
    surface_b,
    interaction_type,
    requires_proof,
    requires_lineage,
    requires_ordering,
    proof_present,
    lineage_present,
    ordering_present,
    allowed: coordination_result === INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_ALLOWED,
    forbidden_conditions: sortedConditions,
    coordination_result,
    coordination_classes: sortedClasses,
    coordination_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    coordination_hash: computeInterSurfaceCoordinationHash(fields),
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Validates that a coordination input does not attempt to cross canonical
 * governance boundaries.
 *
 * Returns the most-specific boundary violation class when a violation is
 * detected, or null when no violation is present.
 *
 * Boundary triggers (checked in priority order):
 *   implicit_sync: true          → inter_surface_implicit_sync_forbidden
 *   auto_sync: true              → inter_surface_implicit_sync_forbidden
 *   creates_authority: true      → inter_surface_authority_attempt
 *   creates_execution: true      → inter_surface_execution_attempt
 *   creates_proof: true          → inter_surface_proof_attempt
 *   mutates_registry: true       → inter_surface_registry_mutation
 *   registry_mutation present    → inter_surface_registry_mutation
 *   authority_grant present      → inter_surface_boundary_violation
 *   execution_token present      → inter_surface_boundary_violation
 *   proof_signature present      → inter_surface_boundary_violation
 *   deployment_trigger present   → inter_surface_boundary_violation
 *   lineage_repair present       → inter_surface_boundary_violation
 *   automatic_repair present     → inter_surface_boundary_violation
 *   break_glass present          → inter_surface_boundary_violation
 *   is_break_glass present       → inter_surface_boundary_violation
 *   break_glass_normalized       → inter_surface_boundary_violation
 */
export function validateInterSurfaceCoordinationBoundary(
  input: unknown,
): InterSurfaceCoordinationClass | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const obj = input as Record<string, unknown>

  if (obj.implicit_sync === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN
  }
  if (obj.auto_sync === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN
  }
  if (obj.creates_authority === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_AUTHORITY_ATTEMPT
  }
  if (obj.creates_execution === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_EXECUTION_ATTEMPT
  }
  if (obj.creates_proof === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_ATTEMPT
  }
  if (obj.mutates_registry === true) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_REGISTRY_MUTATION
  }
  if ('registry_mutation' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_REGISTRY_MUTATION
  }
  if ('authority_grant' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('execution_token' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('proof_signature' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('deployment_trigger' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('lineage_repair' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('automatic_repair' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('break_glass' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('is_break_glass' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }
  if ('break_glass_normalized' in obj) {
    return INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION
  }

  return null
}

/**
 * Classifies a surface interaction pair.
 *
 * Returns a canonical interaction identifier string when all three inputs
 * are valid known values, null otherwise. Evidence only — does not create
 * authority, execute, or validate.
 */
export function classifySurfaceInteraction(
  surface_a: unknown,
  surface_b: unknown,
  interaction_type: unknown,
): string | null {
  if (typeof surface_a !== 'string' || !surface_a) return null
  if (typeof surface_b !== 'string' || !surface_b) return null
  if (typeof interaction_type !== 'string' || !interaction_type) return null
  if (!KNOWN_SURFACES.has(surface_a)) return null
  if (!KNOWN_SURFACES.has(surface_b)) return null
  if (!KNOWN_INTERACTIONS.has(interaction_type)) return null

  return `${surface_a}:${interaction_type}:${surface_b}`
}

/**
 * Evaluates inter-surface coordination semantics for a proposed cross-surface
 * interaction.
 *
 * Does not create authority, execute, synchronize implicitly, mutate registries,
 * or introduce new runtime execution paths. Fail-closed: any unresolvable
 * condition returns NULL.
 *
 * Evaluation order:
 *   1. Boundary check — inputs with forbidden fields return NULL
 *   2. Surface presence — missing surface_a or surface_b returns NULL
 *   3. Surface validity — unknown surfaces return NULL
 *   4. Interaction presence — missing interaction_type returns NULL
 *   5. Interaction validity — unknown interaction_type returns NULL
 *   6. Constraint check — unmet proof/lineage/ordering returns COORDINATION_FORBIDDEN
 *   7. All constraints satisfied → COORDINATION_ALLOWED
 *
 * @param input - coordination input object
 * @returns frozen coordination evidence object
 */
export function evaluateInterSurfaceCoordination(input: unknown): Record<string, unknown> {
  const obj = safeObj(input)

  const surface_a = typeof obj.surface_a === 'string' ? obj.surface_a : null
  const surface_b = typeof obj.surface_b === 'string' ? obj.surface_b : null
  const interaction_type = typeof obj.interaction_type === 'string' ? obj.interaction_type : null
  const requires_proof = obj.requires_proof === true
  const requires_lineage = obj.requires_lineage === true
  const requires_ordering = obj.requires_ordering === true
  const proof_present = obj.proof_present === true
  const lineage_present = obj.lineage_present === true
  const ordering_present = obj.ordering_present === true

  // ── Step 1: Boundary check ─────────────────────────────────────────────────

  const violation = validateInterSurfaceCoordinationBoundary(input)
  if (violation !== null) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [violation],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 2: Surface presence ───────────────────────────────────────────────

  if (!surface_a) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_SURFACE],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  if (!surface_b) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_SURFACE],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 3: Surface validity ───────────────────────────────────────────────

  if (!KNOWN_SURFACES.has(surface_a)) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_SURFACE],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  if (!KNOWN_SURFACES.has(surface_b)) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_SURFACE],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 4: Interaction presence ───────────────────────────────────────────

  if (!interaction_type) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_INTERACTION],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 5: Interaction validity ───────────────────────────────────────────

  if (!KNOWN_INTERACTIONS.has(interaction_type)) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.NULL,
      [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_INTERACTION],
      [],
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 6: Constraint evaluation ─────────────────────────────────────────

  const forbidden_conditions: string[] = []
  const coordination_classes: InterSurfaceCoordinationClass[] = []

  if (requires_proof && !proof_present) {
    forbidden_conditions.push('proof_required_but_absent')
    coordination_classes.push(INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_REQUIRED)
  }

  if (requires_lineage && !lineage_present) {
    forbidden_conditions.push('lineage_required_but_absent')
    coordination_classes.push(INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_LINEAGE_REQUIRED)
  }

  if (requires_ordering && !ordering_present) {
    forbidden_conditions.push('ordering_required_but_absent')
    coordination_classes.push(INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_ORDERING_REQUIRED)
  }

  if (forbidden_conditions.length > 0) {
    return buildResult(
      INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN,
      [
        INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_COORDINATION_FORBIDDEN,
        ...coordination_classes,
      ],
      forbidden_conditions,
      surface_a, surface_b, interaction_type,
      requires_proof, requires_lineage, requires_ordering,
      proof_present, lineage_present, ordering_present,
    )
  }

  // ── Step 7: Coordination allowed ───────────────────────────────────────────

  return buildResult(
    INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_ALLOWED,
    [INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_COORDINATION_ALLOWED],
    [],
    surface_a, surface_b, interaction_type,
    requires_proof, requires_lineage, requires_ordering,
    proof_present, lineage_present, ordering_present,
  )
}
