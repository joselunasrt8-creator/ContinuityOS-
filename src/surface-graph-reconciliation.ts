/**
 * src/surface-graph-reconciliation.ts
 * Issue #1047 — Surface Graph Reconciliation and Coordination Telemetry
 *
 * Evidence-only surface graph reconciliation layer on top of Issue #1040
 * inter-surface coordination. Determines whether the full surface topology
 * remains coherent. Does not create authority, execute, create proof,
 * synchronize implicitly, mutate registries, repair topology, or introduce
 * runtime routes.
 *
 * Core transition:
 *   inter-surface coordination → pairwise legitimacy
 *   surface graph reconciliation → full topology coherence
 *   coordination telemetry → topology observation
 */

import { createHash } from 'node:crypto'

import {
  INTER_SURFACE_COORDINATION_RESULTS,
} from './inter-surface-coordination.ts'

// Re-export #1040 result constants under the names required by #1047
export const COORDINATION_ALLOWED = INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_ALLOWED
export const COORDINATION_FORBIDDEN = INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN
export const NULL = INTER_SURFACE_COORDINATION_RESULTS.NULL

// ── Reconciliation results ─────────────────────────────────────────────────────

export const SURFACE_GRAPH_RECONCILIATION_RESULTS = {
  SURFACE_GRAPH_RECONCILED: 'SURFACE_GRAPH_RECONCILED',
  SURFACE_GRAPH_DRIFT_DETECTED: 'SURFACE_GRAPH_DRIFT_DETECTED',
  NULL: 'NULL',
} as const

export type SurfaceGraphReconciliationResult =
  (typeof SURFACE_GRAPH_RECONCILIATION_RESULTS)[keyof typeof SURFACE_GRAPH_RECONCILIATION_RESULTS]

// ── Reconciliation classes ─────────────────────────────────────────────────────

export const SURFACE_GRAPH_RECONCILIATION_CLASSES = {
  SURFACE_GRAPH_RECONCILED: 'surface_graph_reconciled',
  SURFACE_GRAPH_DRIFT_DETECTED: 'surface_graph_drift_detected',
  SURFACE_GRAPH_MISSING_EDGE: 'surface_graph_missing_edge',
  SURFACE_GRAPH_MALFORMED_EDGE: 'surface_graph_malformed_edge',
  SURFACE_GRAPH_HASH_MISMATCH: 'surface_graph_hash_mismatch',
  SURFACE_GRAPH_COORDINATION_HASH_INVALID: 'surface_graph_coordination_hash_invalid',
  SURFACE_GRAPH_NULL_COORDINATION_EDGE: 'surface_graph_null_coordination_edge',
  SURFACE_GRAPH_FORBIDDEN_COORDINATION_EDGE: 'surface_graph_forbidden_coordination_edge',
  SURFACE_GRAPH_BOUNDARY_VIOLATION: 'surface_graph_boundary_violation',
  SURFACE_GRAPH_AUTHORITY_ATTEMPT: 'surface_graph_authority_attempt',
  SURFACE_GRAPH_EXECUTION_ATTEMPT: 'surface_graph_execution_attempt',
  SURFACE_GRAPH_PROOF_ATTEMPT: 'surface_graph_proof_attempt',
  SURFACE_GRAPH_REGISTRY_MUTATION: 'surface_graph_registry_mutation',
  SURFACE_GRAPH_IMPLICIT_SYNC_FORBIDDEN: 'surface_graph_implicit_sync_forbidden',
  SURFACE_GRAPH_BREAK_GLASS_NORMALIZATION: 'surface_graph_break_glass_normalization',
} as const

export type SurfaceGraphReconciliationClass =
  (typeof SURFACE_GRAPH_RECONCILIATION_CLASSES)[keyof typeof SURFACE_GRAPH_RECONCILIATION_CLASSES]

// ── Telemetry metrics ──────────────────────────────────────────────────────────

export const COORDINATION_TELEMETRY_METRICS = {
  coordination_allowed_total: 0,
  coordination_forbidden_total: 0,
  coordination_null_total: 0,
  surface_graph_edge_total: 0,
  surface_graph_reconciliation_total: 0,
  surface_graph_drift_total: 0,
  implicit_sync_rejected_total: 0,
  coordination_boundary_violation_total: 0,
} as const

export type CoordinationTelemetryMetrics = typeof COORDINATION_TELEMETRY_METRICS

// ── Internal helpers ───────────────────────────────────────────────────────────

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

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

const HEX64_RE = /^[0-9a-f]{64}$/

function isValidSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

// ── Boundary violation detector ────────────────────────────────────────────────

function detectBoundaryViolation(obj: Record<string, unknown>): SurfaceGraphReconciliationClass | null {
  if (obj.implicit_sync === true || obj.auto_sync === true) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_IMPLICIT_SYNC_FORBIDDEN
  }
  if (obj.creates_authority === true) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_AUTHORITY_ATTEMPT
  }
  if (obj.creates_execution === true) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_EXECUTION_ATTEMPT
  }
  if (obj.creates_proof === true) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_PROOF_ATTEMPT
  }
  if (obj.mutates_registry === true) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_REGISTRY_MUTATION
  }
  if (
    'authority_grant' in obj ||
    'execution_token' in obj ||
    'proof_signature' in obj ||
    'registry_mutation' in obj ||
    'deployment_trigger' in obj ||
    'lineage_repair' in obj ||
    'implicit_sync' in obj ||
    'auto_sync' in obj ||
    'automatic_repair' in obj
  ) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_BOUNDARY_VIOLATION
  }
  if (
    'break_glass' in obj ||
    'is_break_glass' in obj ||
    'break_glass_normalized' in obj
  ) {
    return SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_BREAK_GLASS_NORMALIZATION
  }
  return null
}

// ── Hash functions ─────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for a surface graph edge.
 * Excludes edge_hash from the payload to prevent circularity.
 * Sorts coordination_classes before hashing for stability.
 */
export function computeSurfaceEdgeHash(fields: Record<string, unknown>): string {
  const { edge_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    coordination_classes: Array.isArray(rest.coordination_classes)
      ? [...(rest.coordination_classes as string[])].sort()
      : rest.coordination_classes,
  }

  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Computes a deterministic SHA-256 hash for a surface graph reconciliation.
 * Excludes surface_graph_hash from the payload to prevent circularity.
 * Sorts coordination_hashes and reconciliation_classes before hashing for stability.
 */
export function computeSurfaceGraphHash(fields: Record<string, unknown>): string {
  const { surface_graph_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    coordination_hashes: Array.isArray(rest.coordination_hashes)
      ? [...(rest.coordination_hashes as string[])].sort()
      : rest.coordination_hashes,
    reconciliation_classes: Array.isArray(rest.reconciliation_classes)
      ? [...(rest.reconciliation_classes as string[])].sort()
      : rest.reconciliation_classes,
  }

  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

// ── Surface graph edge builder ─────────────────────────────────────────────────

export interface SurfaceGraphEdgeInput {
  surface_a: string
  surface_b: string
  interaction_type: string
  coordination_result: string
  coordination_hash: string
}

/**
 * Builds a SURFACE_GRAPH_EDGE evidence object from a coordination result.
 * Returns NULL edge on any boundary violation or malformed input.
 * Evidence only — does not create authority, execute, or mutate registries.
 */
export function buildSurfaceGraphEdge(input: unknown): Record<string, unknown> {
  const obj = safeObj(input)

  // Boundary check
  const violation = detectBoundaryViolation(obj)
  if (violation !== null) {
    return buildNullEdge(obj, violation)
  }

  const surface_a = typeof obj.surface_a === 'string' ? obj.surface_a : null
  const surface_b = typeof obj.surface_b === 'string' ? obj.surface_b : null
  const interaction_type = typeof obj.interaction_type === 'string' ? obj.interaction_type : null
  const coordination_result = typeof obj.coordination_result === 'string' ? obj.coordination_result : null
  const coordination_hash = typeof obj.coordination_hash === 'string' ? obj.coordination_hash : null

  // Required field presence
  if (!surface_a || !surface_b || !interaction_type || !coordination_result || !coordination_hash) {
    return buildNullEdge(obj, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MISSING_EDGE)
  }

  // coordination_hash format validation
  if (!isValidSha256Hex(coordination_hash)) {
    return buildNullEdge(obj, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_COORDINATION_HASH_INVALID)
  }

  // coordination_result must be a known value
  const knownResults = new Set([COORDINATION_ALLOWED, COORDINATION_FORBIDDEN, NULL])
  if (!knownResults.has(coordination_result)) {
    return buildNullEdge(obj, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MALFORMED_EDGE)
  }

  const fields: Record<string, unknown> = {
    artifact: 'SURFACE_GRAPH_EDGE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a,
    surface_b,
    interaction_type,
    coordination_result,
    coordination_hash,
    edge_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    edge_hash: computeSurfaceEdgeHash(fields),
  })
}

function buildNullEdge(
  obj: Record<string, unknown>,
  cls: SurfaceGraphReconciliationClass,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    artifact: 'SURFACE_GRAPH_EDGE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a: typeof obj.surface_a === 'string' ? obj.surface_a : null,
    surface_b: typeof obj.surface_b === 'string' ? obj.surface_b : null,
    interaction_type: typeof obj.interaction_type === 'string' ? obj.interaction_type : null,
    coordination_result: NULL,
    coordination_hash: null,
    edge_hash_alg: 'sha256',
    reconciliation_class: cls,
  }

  return Object.freeze({
    ...fields,
    edge_hash: null,
  })
}

// ── Boundary validator (public) ────────────────────────────────────────────────

/**
 * Checks whether a surface graph input contains boundary-violating fields.
 * Returns the most specific violation class, or null if clean.
 */
export function validateSurfaceGraphBoundary(input: unknown): SurfaceGraphReconciliationClass | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return detectBoundaryViolation(input as Record<string, unknown>)
}

// ── Surface graph reconciliation ───────────────────────────────────────────────

/**
 * Reconciles a surface graph from an array of pre-built SURFACE_GRAPH_EDGE
 * evidence objects.
 *
 * Rules:
 *   SURFACE_GRAPH_RECONCILED   — all edges structurally valid, all hashes valid,
 *                                no NULL coordination edge.
 *   SURFACE_GRAPH_DRIFT_DETECTED — one or more structurally valid edges are
 *                                  COORDINATION_FORBIDDEN.
 *   NULL                        — any edge is malformed, hash-invalid,
 *                                 boundary-violating, or has NULL coordination.
 *
 * Does not repair edges. Does not upgrade forbidden → allowed.
 */
export function reconcileSurfaceGraph(edges: unknown): Record<string, unknown> {
  // edges must be a non-empty array
  if (!Array.isArray(edges) || edges.length === 0) {
    return buildNullReconciliation(
      [],
      [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MISSING_EDGE],
      0, 0, 0, 0, 0,
    )
  }

  const reconciliation_classes: SurfaceGraphReconciliationClass[] = []
  const coordination_hashes: string[] = []
  const surfaces = new Set<string>()

  let allowed_edge_count = 0
  let forbidden_edge_count = 0
  let null_edge_count = 0
  let edge_count = 0

  for (const edge of edges) {
    edge_count++
    const obj = safeObj(edge)

    // Boundary violation on edge input
    const violation = detectBoundaryViolation(obj)
    if (violation !== null) {
      return buildNullReconciliation(
        coordination_hashes,
        [violation],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // Must be a valid SURFACE_GRAPH_EDGE artifact
    if (obj.artifact !== 'SURFACE_GRAPH_EDGE') {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MALFORMED_EDGE],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // Must have evidence_only = true
    if (obj.evidence_only !== true) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MALFORMED_EDGE],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // Required structural fields
    const surface_a = typeof obj.surface_a === 'string' ? obj.surface_a : null
    const surface_b = typeof obj.surface_b === 'string' ? obj.surface_b : null
    const interaction_type = typeof obj.interaction_type === 'string' ? obj.interaction_type : null
    const coordination_result = typeof obj.coordination_result === 'string' ? obj.coordination_result : null
    const coordination_hash = typeof obj.coordination_hash === 'string' ? obj.coordination_hash : null
    const edge_hash = typeof obj.edge_hash === 'string' ? obj.edge_hash : null

    if (!surface_a || !surface_b || !interaction_type) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MISSING_EDGE],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // NULL coordination edge → graph NULL
    if (coordination_result === NULL || coordination_result === null || coordination_hash === null) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_NULL_COORDINATION_EDGE],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count + 1, 0,
      )
    }

    // coordination_hash format check
    if (!isValidSha256Hex(coordination_hash)) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_COORDINATION_HASH_INVALID],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // edge_hash format check
    if (!isValidSha256Hex(edge_hash)) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_HASH_MISMATCH],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    // Recompute edge_hash to verify integrity
    const { edge_hash: _eh, ...fieldsWithoutHash } = obj
    const recomputed = computeSurfaceEdgeHash(fieldsWithoutHash)
    if (recomputed !== edge_hash) {
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_HASH_MISMATCH],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }

    coordination_hashes.push(coordination_hash)

    if (surface_a) surfaces.add(surface_a)
    if (surface_b) surfaces.add(surface_b)

    if (coordination_result === COORDINATION_ALLOWED) {
      allowed_edge_count++
    } else if (coordination_result === COORDINATION_FORBIDDEN) {
      forbidden_edge_count++
      reconciliation_classes.push(
        SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_FORBIDDEN_COORDINATION_EDGE,
      )
    } else {
      // unknown coordination_result value
      return buildNullReconciliation(
        coordination_hashes,
        [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_MALFORMED_EDGE],
        edge_count, allowed_edge_count, forbidden_edge_count, null_edge_count, 0,
      )
    }
  }

  const surface_count = surfaces.size

  // Determine reconciliation result
  const reconciliation_result: SurfaceGraphReconciliationResult =
    forbidden_edge_count > 0
      ? SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED
      : SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_RECONCILED

  const final_classes: SurfaceGraphReconciliationClass[] =
    forbidden_edge_count > 0
      ? [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_DRIFT_DETECTED, ...reconciliation_classes]
      : [SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_RECONCILED]

  return buildReconciliationOutput(
    reconciliation_result,
    [...new Set(final_classes)].sort(),
    edge_count,
    allowed_edge_count,
    forbidden_edge_count,
    null_edge_count,
    surface_count,
    coordination_hashes,
  )
}

function buildNullReconciliation(
  coordination_hashes: string[],
  classes: SurfaceGraphReconciliationClass[],
  edge_count: number,
  allowed_edge_count: number,
  forbidden_edge_count: number,
  null_edge_count: number,
  surface_count: number,
): Record<string, unknown> {
  return buildReconciliationOutput(
    SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL,
    [...new Set(classes)].sort(),
    edge_count,
    allowed_edge_count,
    forbidden_edge_count,
    null_edge_count,
    surface_count,
    coordination_hashes,
  )
}

function buildReconciliationOutput(
  reconciliation_result: SurfaceGraphReconciliationResult,
  reconciliation_classes: SurfaceGraphReconciliationClass[],
  edge_count: number,
  allowed_edge_count: number,
  forbidden_edge_count: number,
  null_edge_count: number,
  surface_count: number,
  coordination_hashes: string[],
): Record<string, unknown> {
  const sortedClasses = [...reconciliation_classes].sort()
  const sortedHashes = [...coordination_hashes].sort()

  const fields: Record<string, unknown> = {
    artifact: 'SURFACE_GRAPH_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    reconciliation_result,
    reconciliation_classes: sortedClasses,
    edge_count,
    allowed_edge_count,
    forbidden_edge_count,
    null_edge_count,
    surface_count,
    coordination_hashes: sortedHashes,
    surface_graph_hash_alg: 'sha256',
  }

  return Object.freeze({
    ...fields,
    surface_graph_hash: computeSurfaceGraphHash(fields),
  })
}

// ── Coordination telemetry ─────────────────────────────────────────────────────

/**
 * Reads coordination telemetry from a reconciliation evidence object and a
 * list of surface graph edges. Returns a COORDINATION_TELEMETRY evidence
 * object. Read-only — observes coordination outcomes only.
 *
 * Never satisfies coordination requirements.
 * Never creates proof, authority, execution, registry mutation,
 * topology repair, or synchronization.
 */
export function readCoordinationTelemetry(
  reconciliation: unknown,
  edges: unknown,
): Record<string, unknown> {
  const rec = safeObj(reconciliation)
  const edgeList = Array.isArray(edges) ? edges : []

  const metrics: Record<string, number> = {
    coordination_allowed_total: 0,
    coordination_forbidden_total: 0,
    coordination_null_total: 0,
    surface_graph_edge_total: 0,
    surface_graph_reconciliation_total: 0,
    surface_graph_drift_total: 0,
    implicit_sync_rejected_total: 0,
    coordination_boundary_violation_total: 0,
  }

  // Count from reconciliation artifact
  if (rec.artifact === 'SURFACE_GRAPH_RECONCILIATION') {
    if (typeof rec.allowed_edge_count === 'number') {
      metrics.coordination_allowed_total = rec.allowed_edge_count
    }
    if (typeof rec.forbidden_edge_count === 'number') {
      metrics.coordination_forbidden_total = rec.forbidden_edge_count
    }
    if (typeof rec.null_edge_count === 'number') {
      metrics.coordination_null_total = rec.null_edge_count
    }
    if (typeof rec.edge_count === 'number') {
      metrics.surface_graph_edge_total = rec.edge_count
    }
    metrics.surface_graph_reconciliation_total = 1

    if (rec.reconciliation_result === SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED) {
      metrics.surface_graph_drift_total = 1
    }
  }

  // Scan edges for implicit_sync and boundary violations
  for (const edge of edgeList) {
    const obj = safeObj(edge)
    if (obj.implicit_sync === true || obj.auto_sync === true) {
      metrics.implicit_sync_rejected_total++
    }
    if (
      obj.creates_authority === true ||
      obj.creates_execution === true ||
      obj.creates_proof === true ||
      obj.mutates_registry === true ||
      'authority_grant' in obj ||
      'execution_token' in obj ||
      'proof_signature' in obj ||
      'registry_mutation' in obj ||
      'deployment_trigger' in obj ||
      'lineage_repair' in obj ||
      'automatic_repair' in obj ||
      'break_glass' in obj ||
      'is_break_glass' in obj ||
      'break_glass_normalized' in obj
    ) {
      metrics.coordination_boundary_violation_total++
    }
  }

  return Object.freeze({
    artifact: 'COORDINATION_TELEMETRY',
    evidence_only: true,
    read_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    metrics: Object.freeze({ ...metrics }),
  })
}
