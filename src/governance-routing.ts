/**
 * src/governance-routing.ts
 * Issue #1041 — Hierarchical Governance Routing for Authority Resolution
 *
 * Evidence only — resolves which authority path applies to a proposed action
 * before AEO compilation. Does not create authority, execute, validate AEOs,
 * create proof, mutate registries, repair lineage, expand runtime routes,
 * trigger deployment, or normalize BREAK_GLASS.
 *
 * Canonical placement:
 *   Cognition → Input Shaping → ATAO → Governance Routing → Authority Binding
 *   → AEO → Ω Validator → Execution Boundary → Proof
 *
 * A valid proposed action maps to exactly one legitimate authority path.
 * Any unresolvable condition (missing, ambiguous, unknown surface, scope
 * mismatch, expired, revoked, consumed) returns NULL. Fail closed.
 */

import { createHash } from 'node:crypto'

// ── Route results ──────────────────────────────────────────────────────────────

export const GOVERNANCE_ROUTING_RESULTS = {
  ROUTE_RESOLVED: 'ROUTE_RESOLVED',
  ROUTE_REJECTED: 'ROUTE_REJECTED',
  NULL: 'NULL',
} as const

export type GovernanceRoutingResult =
  (typeof GOVERNANCE_ROUTING_RESULTS)[keyof typeof GOVERNANCE_ROUTING_RESULTS]

// ── Route classes ──────────────────────────────────────────────────────────────

export const GOVERNANCE_ROUTING_CLASSES = {
  GOVERNANCE_ROUTE_RESOLVED: 'governance_route_resolved',
  GOVERNANCE_ROUTE_MISSING: 'governance_route_missing',
  GOVERNANCE_ROUTE_AMBIGUOUS: 'governance_route_ambiguous',
  GOVERNANCE_ROUTE_UNKNOWN_SURFACE: 'governance_route_unknown_surface',
  GOVERNANCE_ROUTE_SCOPE_MISMATCH: 'governance_route_scope_mismatch',
  GOVERNANCE_ROUTE_AUTHORITY_EXPIRED: 'governance_route_authority_expired',
  GOVERNANCE_ROUTE_AUTHORITY_REVOKED: 'governance_route_authority_revoked',
  GOVERNANCE_ROUTE_AUTHORITY_CONSUMED: 'governance_route_authority_consumed',
  GOVERNANCE_ROUTE_BOUNDARY_VIOLATION: 'governance_route_boundary_violation',
  GOVERNANCE_ROUTE_AUTHORITY_ATTEMPT: 'governance_route_authority_attempt',
  GOVERNANCE_ROUTE_EXECUTION_ATTEMPT: 'governance_route_execution_attempt',
  GOVERNANCE_ROUTE_VALIDATION_ATTEMPT: 'governance_route_validation_attempt',
  GOVERNANCE_ROUTE_PROOF_ATTEMPT: 'governance_route_proof_attempt',
} as const

export type GovernanceRoutingClass =
  (typeof GOVERNANCE_ROUTING_CLASSES)[keyof typeof GOVERNANCE_ROUTING_CLASSES]

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProposedAction {
  intent?: string | null
  domain?: string | null
  surface?: string | null
  scope?: Record<string, unknown> | null
  target?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AuthorityEntry {
  authority_path_id: string
  domain: string
  surface: string
  scope?: Record<string, unknown> | null
  status: 'ACTIVE' | 'REVOKED' | 'CONSUMED'
  expires_at?: string | null
  [key: string]: unknown
}

export interface AuthorityRegistry {
  entries: AuthorityEntry[]
}

export interface GovernanceRouteResolution {
  artifact: 'GOVERNANCE_ROUTE_RESOLUTION'
  evidence_only: true
  creates_authority: false
  creates_execution: false
  creates_proof: false
  validates_objects: false
  route_result: GovernanceRoutingResult
  route_classes: GovernanceRoutingClass[]
  intent: string
  domain: string
  surface: string
  authority_path_id: string | null
  scope: Record<string, unknown>
  target: Record<string, unknown>
  route_hash_alg: 'sha256'
  route_hash: string
}

// ── Known execution surfaces ───────────────────────────────────────────────────

const KNOWN_SURFACES = new Set([
  'authority',
  'compile',
  'validate',
  'execute',
  'proof',
  'governance',
  'runtime',
  'deploy',
  'session',
  'continuity',
  'registry',
  'metrics',
  'reconciliation',
])

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

/**
 * Computes a deterministic SHA-256 route hash.
 *
 * Hash covers: route_result, sorted route_classes, intent, domain, surface,
 * authority_path_id, scope, target. route_hash itself is excluded (no circularity).
 * Same route state always produces the same hash.
 * Reordered route_classes produce the same hash (sorted before hashing).
 */
export function computeGovernanceRouteHash(fields: {
  route_result: GovernanceRoutingResult
  route_classes: GovernanceRoutingClass[]
  intent: string
  domain: string
  surface: string
  authority_path_id: string | null
  scope: Record<string, unknown>
  target: Record<string, unknown>
}): string {
  const payload = {
    authority_path_id: fields.authority_path_id,
    domain: fields.domain,
    intent: fields.intent,
    route_classes: [...fields.route_classes].sort(),
    route_result: fields.route_result,
    scope: fields.scope,
    surface: fields.surface,
    target: fields.target,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

function buildRoute(
  result: GovernanceRoutingResult,
  classes: GovernanceRoutingClass[],
  intent: string,
  domain: string,
  surface: string,
  authorityPathId: string | null,
  scope: Record<string, unknown>,
  target: Record<string, unknown>,
): GovernanceRouteResolution {
  const hash = computeGovernanceRouteHash({
    route_result: result,
    route_classes: classes,
    intent,
    domain,
    surface,
    authority_path_id: authorityPathId,
    scope,
    target,
  })

  return {
    artifact: 'GOVERNANCE_ROUTE_RESOLUTION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    validates_objects: false,
    route_result: result,
    route_classes: classes,
    intent,
    domain,
    surface,
    authority_path_id: authorityPathId,
    scope,
    target,
    route_hash_alg: 'sha256',
    route_hash: hash,
  }
}

function scopesMatch(
  required: Record<string, unknown> | null | undefined,
  provided: Record<string, unknown>,
): boolean {
  if (!required || Object.keys(required).length === 0) return true
  for (const [key, val] of Object.entries(required)) {
    if (canonicalJson(provided[key]) !== canonicalJson(val)) return false
  }
  return true
}

function isExpired(entry: AuthorityEntry): boolean {
  if (!entry.expires_at) return false
  return new Date(entry.expires_at) <= new Date()
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Classifies the governance domain for a proposed action.
 *
 * Returns the domain string if classifiable, null otherwise.
 * Evidence only — does not create authority, execute, or validate.
 *
 * @param proposedAction - the proposed action to classify
 * @returns domain string or null
 */
export function classifyGovernanceDomain(proposedAction: unknown): string | null {
  if (!proposedAction || typeof proposedAction !== 'object' || Array.isArray(proposedAction)) {
    return null
  }
  const action = proposedAction as Record<string, unknown>
  const domain = typeof action.domain === 'string' ? action.domain.trim() : null
  if (!domain) return null
  return domain
}

/**
 * Validates that a proposed action or route object does not attempt to cross
 * canonical governance boundaries.
 *
 * Returns the most-specific boundary violation class when a violation is
 * detected, or null when no violation is present.
 *
 * Boundary triggers (checked in priority order):
 *   creates_authority: true          → governance_route_authority_attempt
 *   creates_execution: true          → governance_route_execution_attempt
 *   triggers_execution: true         → governance_route_execution_attempt
 *   executes: true                   → governance_route_execution_attempt
 *   validates_objects: true          → governance_route_validation_attempt
 *   validates_aeo: true              → governance_route_validation_attempt
 *   creates_proof: true              → governance_route_proof_attempt
 *   mutates_registry: true           → governance_route_boundary_violation
 *   mutates_registries: true         → governance_route_boundary_violation
 *   repairs_lineage: true            → governance_route_boundary_violation
 *   expands_runtime_route: true      → governance_route_boundary_violation
 *   triggers_deployment: true        → governance_route_boundary_violation
 *   normalize_break_glass: true      → governance_route_boundary_violation
 *
 * @param routeObjectOrInput - object to inspect for boundary violations
 * @returns violation class or null
 */
export function validateGovernanceRouteBoundary(
  routeObjectOrInput: unknown,
): GovernanceRoutingClass | null {
  if (
    !routeObjectOrInput ||
    typeof routeObjectOrInput !== 'object' ||
    Array.isArray(routeObjectOrInput)
  ) {
    return null
  }

  const obj = routeObjectOrInput as Record<string, unknown>

  if (obj.creates_authority === true) {
    return GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_ATTEMPT
  }

  if (obj.creates_execution === true || obj.triggers_execution === true || obj.executes === true) {
    return GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_EXECUTION_ATTEMPT
  }

  if (obj.validates_objects === true || obj.validates_aeo === true) {
    return GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_VALIDATION_ATTEMPT
  }

  if (obj.creates_proof === true) {
    return GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_PROOF_ATTEMPT
  }

  if (
    obj.mutates_registry === true ||
    obj.mutates_registries === true ||
    obj.repairs_lineage === true ||
    obj.expands_runtime_route === true ||
    obj.triggers_deployment === true ||
    obj.normalize_break_glass === true
  ) {
    return GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION
  }

  return null
}

/**
 * Resolves the governance route for a proposed action against an authority registry.
 *
 * Determines which single authority path applies before AEO compilation.
 * Does not create authority, execute, validate AEOs, create proof, or mutate registries.
 * Fail-closed: any unresolvable condition returns NULL.
 *
 * Resolution order:
 *   1. Input validation — malformed inputs return NULL (boundary_violation), no throw
 *   2. Boundary check — inputs attempting authority/execution/validation/proof return NULL
 *   3. Required fields — missing intent or domain returns NULL (missing)
 *   4. Surface check — unknown surface returns NULL (unknown_surface)
 *   5. Candidate matching — no candidates returns NULL (missing)
 *   6. Scope matching — no scope match returns NULL (scope_mismatch)
 *   7. Ambiguity check — multiple scope matches return NULL (ambiguous)
 *   8. Authority lifecycle — revoked → NULL, consumed → NULL, expired → NULL
 *   9. Single active match → ROUTE_RESOLVED
 *
 * @param proposedAction - the proposed action to route
 * @param authorityRegistry - optional registry of authority entries
 * @returns GovernanceRouteResolution evidence object
 */
export function resolveGovernanceRoute(
  proposedAction: unknown,
  authorityRegistry?: AuthorityRegistry | null,
): GovernanceRouteResolution {
  // ── Step 1: Input validation ───────────────────────────────────────────────

  if (!proposedAction || typeof proposedAction !== 'object' || Array.isArray(proposedAction)) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION],
      '', '', '', null, {}, {},
    )
  }

  const action = proposedAction as Record<string, unknown>

  // ── Step 2: Boundary check ─────────────────────────────────────────────────

  const violation = validateGovernanceRouteBoundary(action)
  if (violation !== null) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [violation],
      typeof action.intent === 'string' ? action.intent : '',
      typeof action.domain === 'string' ? action.domain : '',
      typeof action.surface === 'string' ? action.surface : '',
      null, {}, {},
    )
  }

  const intent = typeof action.intent === 'string' ? action.intent.trim() : ''
  const domain = typeof action.domain === 'string' ? action.domain.trim() : ''
  const surface = typeof action.surface === 'string' ? action.surface.trim() : ''
  const scope =
    action.scope && typeof action.scope === 'object' && !Array.isArray(action.scope)
      ? (action.scope as Record<string, unknown>)
      : {}
  const target =
    action.target && typeof action.target === 'object' && !Array.isArray(action.target)
      ? (action.target as Record<string, unknown>)
      : {}

  // ── Step 3: Required fields ────────────────────────────────────────────────

  if (!intent || !domain) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_MISSING],
      intent, domain, surface, null, scope, target,
    )
  }

  // ── Step 4: Surface validation ─────────────────────────────────────────────

  if (!surface || !KNOWN_SURFACES.has(surface)) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_UNKNOWN_SURFACE],
      intent, domain, surface, null, scope, target,
    )
  }

  // ── Step 5: Candidate matching ─────────────────────────────────────────────

  const registry = authorityRegistry ?? { entries: [] }
  const candidates = registry.entries.filter(
    (e) => e.domain === domain && e.surface === surface,
  )

  if (candidates.length === 0) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_MISSING],
      intent, domain, surface, null, scope, target,
    )
  }

  // ── Step 6: Scope matching ─────────────────────────────────────────────────

  const scopeMatched = candidates.filter((e) => scopesMatch(e.scope, scope))

  if (scopeMatched.length === 0) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_SCOPE_MISMATCH],
      intent, domain, surface, null, scope, target,
    )
  }

  // ── Step 7: Ambiguity check ────────────────────────────────────────────────

  if (scopeMatched.length > 1) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AMBIGUOUS],
      intent, domain, surface, null, scope, target,
    )
  }

  const authority = scopeMatched[0]

  // ── Step 8: Authority lifecycle ────────────────────────────────────────────

  if (authority.status === 'REVOKED') {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_REVOKED],
      intent, domain, surface, authority.authority_path_id, scope, target,
    )
  }

  if (authority.status === 'CONSUMED') {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_CONSUMED],
      intent, domain, surface, authority.authority_path_id, scope, target,
    )
  }

  if (isExpired(authority)) {
    return buildRoute(
      GOVERNANCE_ROUTING_RESULTS.NULL,
      [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_EXPIRED],
      intent, domain, surface, authority.authority_path_id, scope, target,
    )
  }

  // ── Step 9: Route resolved ─────────────────────────────────────────────────

  return buildRoute(
    GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED,
    [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_RESOLVED],
    intent, domain, surface, authority.authority_path_id, scope, target,
  )
}
