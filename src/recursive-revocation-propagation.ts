/**
 * src/recursive-revocation-propagation.ts
 * Issue #1153 — Recursive Revocation Propagation and Stale Lineage Collapse Enforcement
 *
 * Deterministic recursive revocation propagation and stale lineage collapse
 * enforcement across legitimacy registries.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Revocation invariant:
 *   Revoked lineage must deterministically invalidate all descendant legitimacy.
 *   Revoked lineage cannot preserve authority, replay eligibility, or proof continuity.
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic revocation decisions, no replay bypass paths,
 * no legitimacy semantic weakening.
 *
 * All revocation hashing and equivalence validation routes through src/canonical.js.
 * Revocation state must remain recursively reconcilable across all lineage-dependent registries.
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Propagation result constants ──────────────────────────────────────────────

export const REVOCATION_PROPAGATION_RESULTS = Object.freeze({
  PROPAGATION_COMPLETE: 'PROPAGATION_COMPLETE',
  PROPAGATION_INCOMPLETE: 'PROPAGATION_INCOMPLETE',
  PROPAGATION_COLLAPSED: 'PROPAGATION_COLLAPSED',
  PROPAGATION_STALE: 'PROPAGATION_STALE',
  PROPAGATION_CONVERGENCE_FAILED: 'PROPAGATION_CONVERGENCE_FAILED',
  NULL: 'NULL',
} as const)

export type RevocationPropagationResult =
  (typeof REVOCATION_PROPAGATION_RESULTS)[keyof typeof REVOCATION_PROPAGATION_RESULTS]

// ── Descendant traversal failure taxonomy ─────────────────────────────────────

export const REVOCATION_DESCENDANT_FAILURES = Object.freeze({
  CYCLE_DETECTED: 'cycle_detected',
  DEPTH_EXCEEDED: 'depth_exceeded',
} as const)

export type RevocationDescendantFailure =
  (typeof REVOCATION_DESCENDANT_FAILURES)[keyof typeof REVOCATION_DESCENDANT_FAILURES]

// ── Revocation drift taxonomy ─────────────────────────────────────────────────

export const REVOCATION_DRIFT_CLASSES = Object.freeze({
  DESCENDANT_PROPAGATION_INCOMPLETE: 'descendant_propagation_incomplete',
  STALE_LINEAGE_RESURRECTION: 'stale_lineage_resurrection',
  PROOF_REVOCATION_BARRIER_VIOLATED: 'proof_revocation_barrier_violated',
  REPLAY_REVOCATION_BARRIER_VIOLATED: 'replay_revocation_barrier_violated',
  ANCESTOR_REVOCATION_UNRESOLVED: 'ancestor_revocation_unresolved',
  DISTRIBUTED_REVOCATION_DRIFT: 'distributed_revocation_drift',
  REVOCATION_LINEAGE_CYCLE: 'revocation_lineage_cycle',
  REVOCATION_DEPTH_EXCEEDED: 'revocation_depth_exceeded',
  REVOCATION_CONVERGENCE_MISSING: 'revocation_convergence_missing',
} as const)

export type RevocationDriftClass =
  (typeof REVOCATION_DRIFT_CLASSES)[keyof typeof REVOCATION_DRIFT_CLASSES]

// ── Revocation repair classes ─────────────────────────────────────────────────

export const REVOCATION_REPAIR_CLASSES = Object.freeze({
  PROPAGATE_REVOCATION_TO_DESCENDANTS: 'propagate_revocation_to_descendants',
  INVALIDATE_STALE_REPLAY: 'invalidate_stale_replay',
  INVALIDATE_PROOF_CONTINUITY: 'invalidate_proof_continuity',
  RECONCILE_REVOCATION_VIEWS: 'reconcile_revocation_views',
  REVOCATION_PERMANENTLY_INVALID: 'revocation_permanently_invalid',
} as const)

export type RevocationRepairClass =
  (typeof REVOCATION_REPAIR_CLASSES)[keyof typeof REVOCATION_REPAIR_CLASSES]

// ── Distributed convergence result constants ──────────────────────────────────

export const REVOCATION_CONVERGENCE_RESULTS = Object.freeze({
  CONVERGENCE_REACHED: 'CONVERGENCE_REACHED',
  CONVERGENCE_PARTIAL: 'CONVERGENCE_PARTIAL',
  CONVERGENCE_FAILED: 'CONVERGENCE_FAILED',
  NULL: 'NULL',
} as const)

export type RevocationConvergenceResult =
  (typeof REVOCATION_CONVERGENCE_RESULTS)[keyof typeof REVOCATION_CONVERGENCE_RESULTS]

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevocationLineageEntry {
  readonly continuity_id: string
  readonly session_id: string
  readonly parent_continuity_id: string | null
  readonly continuity_hash: string
  readonly status: string
  readonly revoked_at: string | null
  readonly expires_at: string | null
}

export interface RevocationRegistryView {
  readonly node_id: string
  readonly registry_epoch: string
  readonly lineage_root_id: string
  readonly entries: readonly RevocationLineageEntry[]
  readonly registry_hash: string
}

export interface RevocationEvidence {
  readonly revocation_id: string
  readonly root_continuity_id: string
  readonly revoked_at: string
  readonly propagated_ids: readonly string[]
}

export interface RevocationProofRecord {
  readonly proof_id: string
  readonly continuity_id: string
  readonly proof_hash: string
  readonly lineage_hash: string
}

export interface RevocationReplayRecord {
  readonly replay_id: string
  readonly continuity_id: string
  readonly continuity_hash: string
  readonly lineage_hash: string
}

export interface RevocationDescendantResult {
  readonly traversal_id: string
  readonly root_continuity_id: string
  readonly descendant_ids: readonly string[]
  readonly descendant_count: number
  readonly depth_reached: number
  readonly ok: boolean
  readonly failure_reason: RevocationDescendantFailure | null
  readonly topology_hash: string
}

export interface StaleLineageCollapse {
  readonly collapse_id: string
  readonly revoked_root_id: string
  readonly active_descendant_ids: readonly string[]
  readonly collapse_hash: string
}

export interface RevocationChronologyEntry {
  readonly sequence_index: number
  readonly revocation_id: string
  readonly root_continuity_id: string
  readonly revoked_at: string
  readonly chronology_hash: string
}

export interface RevocationAncestryAudit {
  readonly audit_id: string
  readonly continuity_id: string
  readonly ancestor_revoked: boolean
  readonly revoked_ancestor_id: string | null
  readonly ancestry_chain: readonly string[]
  readonly ancestry_hash: string
}

export interface ReplayRevocationEligibility {
  readonly replay_id: string
  readonly continuity_id: string
  readonly eligible: boolean
  readonly ineligibility_reason: string | null
}

export interface ProofContinuityValidation {
  readonly proof_id: string
  readonly continuity_id: string
  readonly valid: boolean
  readonly invalidity_reason: string | null
  readonly proof_hash: string
}

export interface DistributedRevocationConvergence {
  readonly convergence_id: string
  readonly convergence_result: RevocationConvergenceResult
  readonly converged_count: number
  readonly diverged_count: number
  readonly canonical_epoch: string | null
  readonly canonical_revocation_hash: string | null
  readonly revocation_topology_hash: string
}

export interface RevocationDriftObservation {
  readonly observation_id: string
  readonly drift_class: RevocationDriftClass
  readonly affected_continuity_id: string | null
  readonly severity: 'fatal' | 'degraded' | 'observation'
  readonly detail: string
}

export interface RevocationRepairDiagnostic {
  readonly diagnostic_id: string
  readonly affected_continuity_id: string | null
  readonly repair_class: RevocationRepairClass
  readonly repairable: boolean
  readonly detail: string
}

export interface RevocationPropagationAuditSurface {
  readonly audit_id: string
  readonly propagation_id: string
  readonly revocation_topology_hash: string
  readonly total_entry_count: number
  readonly revoked_count: number
  readonly propagation_complete: boolean
  readonly drift_count: number
  readonly convergence_result: RevocationConvergenceResult
}

export interface RevocationLineagePropagationInput {
  readonly propagation_id: string
  readonly evidence_only: true
  readonly registry_views: readonly RevocationRegistryView[]
  readonly revocation_records?: readonly RevocationEvidence[] | null
  readonly proof_records?: readonly RevocationProofRecord[] | null
  readonly replay_records?: readonly RevocationReplayRecord[] | null
  readonly max_descent_depth?: number | null
}

export interface RevocationLineagePropagation {
  readonly artifact_type: 'RECURSIVE_REVOCATION_PROPAGATION'
  readonly evidence_only: true
  readonly propagation_id: string
  readonly propagation_result: RevocationPropagationResult
  readonly revocation_topology_hash: string
  readonly entry_count: number
  readonly descendant_traversal_results: readonly RevocationDescendantResult[]
  readonly incomplete_propagations: readonly string[]
  readonly stale_lineage_collapses: readonly StaleLineageCollapse[]
  readonly chronology: readonly RevocationChronologyEntry[]
  readonly ancestry_audits: readonly RevocationAncestryAudit[]
  readonly replay_eligibility: readonly ReplayRevocationEligibility[]
  readonly proof_continuity_validations: readonly ProofContinuityValidation[]
  readonly convergence: DistributedRevocationConvergence
  readonly drift_observations: readonly RevocationDriftObservation[]
  readonly repair_diagnostics: readonly RevocationRepairDiagnostic[]
  readonly audit_surface: RevocationPropagationAuditSurface
}

// ── Internal constants ────────────────────────────────────────────────────────

const SYSTEM_MAX_DESCENT_DEPTH = 32
const HEX64_RE = /^[0-9a-f]{64}$/

const FORBIDDEN_FIELDS = [
  'creates_authority',
  'creates_execution',
  'creates_proof',
  'mutates_registry',
  'authority_grant',
  'execution_token',
  'proof_signature',
  'deployment_trigger',
  'lineage_repair',
  'auto_repair',
  'majority_as_authority',
  'implicit_consensus',
  'auto_consensus',
  'registry_mutation',
  'break_glass',
]

// ── Internal helpers ──────────────────────────────────────────────────────────

function isValidSha256(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function safeObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

function hasForbiddenField(obj: Record<string, unknown>): boolean {
  return FORBIDDEN_FIELDS.some((f) => f in obj)
}

function isActiveStatus(status: unknown): boolean {
  return status === 'ACTIVE'
}

function isRevocationBarriered(entry: RevocationLineageEntry): boolean {
  return !isActiveStatus(entry.status) || Boolean(entry.revoked_at)
}

function buildChildrenMap(entries: readonly RevocationLineageEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const entry of entries) {
    const parentId = String(entry.parent_continuity_id || '').trim()
    if (parentId) {
      const kids = map.get(parentId) ?? []
      kids.push(String(entry.continuity_id))
      map.set(parentId, kids)
    }
  }
  return map
}

// ── Canonical revocation topology hash (routes through canonical.js) ──────────

export function computeRevocationTopologyHash(
  entries: readonly RevocationLineageEntry[],
): string {
  const sorted = entries
    .slice()
    .sort((a, b) => String(a.continuity_id).localeCompare(String(b.continuity_id)))
    .map((e) => ({
      continuity_hash: String(e.continuity_hash || ''),
      continuity_id: String(e.continuity_id || ''),
      parent_continuity_id: e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
      revoked_at: e.revoked_at != null ? String(e.revoked_at) : null,
      status: String(e.status || ''),
    }))
  return sha256Hex(canonicalize(sorted))
}

// ── Recursive Descendant Revocation Traversal ─────────────────────────────────

export function traverseDescendantRevocation(
  rootId: string,
  index: Map<string, RevocationLineageEntry>,
  maxDepth: number,
): RevocationDescendantResult {
  const childrenMap = buildChildrenMap(Array.from(index.values()))

  const descendantIds: string[] = []
  let maxDepthReached = 0
  let cycleDetected = false
  let depthExceeded = false

  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }]
  const visited = new Set<string>([rootId])

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (depth > maxDepthReached) maxDepthReached = depth

    const children = childrenMap.get(id) ?? []
    for (const childId of children) {
      if (visited.has(childId)) {
        cycleDetected = true
        continue
      }
      if (depth + 1 > maxDepth) {
        depthExceeded = true
        continue
      }
      visited.add(childId)
      descendantIds.push(childId)
      queue.push({ id: childId, depth: depth + 1 })
    }
  }

  const failureReason: RevocationDescendantFailure | null = cycleDetected
    ? REVOCATION_DESCENDANT_FAILURES.CYCLE_DETECTED
    : depthExceeded
    ? REVOCATION_DESCENDANT_FAILURES.DEPTH_EXCEEDED
    : null

  const topologyPayload = {
    depth_reached: maxDepthReached,
    descendant_ids: [...descendantIds].sort(),
    failure_reason: failureReason,
    root_continuity_id: rootId,
  }
  const topologyHash = sha256Hex(canonicalize(topologyPayload))

  return Object.freeze({
    traversal_id: sha256Hex(canonicalize({ root: rootId, topology: topologyPayload })),
    root_continuity_id: rootId,
    descendant_ids: Object.freeze([...descendantIds]),
    descendant_count: descendantIds.length,
    depth_reached: maxDepthReached,
    ok: failureReason === null,
    failure_reason: failureReason,
    topology_hash: topologyHash,
  })
}

// ── Distributed Revocation Propagation Completeness ──────────────────────────

export function verifyRevocationPropagationCompleteness(
  traversalResults: readonly RevocationDescendantResult[],
  revocationRecords: readonly RevocationEvidence[],
  index: Map<string, RevocationLineageEntry>,
): { complete: boolean; incomplete_ids: string[] } {
  const revokedRoots = new Set<string>(revocationRecords.map((r) => r.root_continuity_id))
  const seenDescendants = new Set<string>()
  const incompleteIds: string[] = []

  for (const result of traversalResults) {
    if (!revokedRoots.has(result.root_continuity_id)) continue
    for (const descendantId of result.descendant_ids) {
      if (seenDescendants.has(descendantId)) continue
      seenDescendants.add(descendantId)
      const entry = index.get(descendantId)
      if (!entry) continue
      if (isActiveStatus(entry.status) && !entry.revoked_at) {
        incompleteIds.push(descendantId)
      }
    }
  }

  return { complete: incompleteIds.length === 0, incomplete_ids: incompleteIds }
}

// ── Stale Lineage Collapse Enforcement ───────────────────────────────────────

export function enforceStaleLineageCollapse(
  entries: readonly RevocationLineageEntry[],
  index: Map<string, RevocationLineageEntry>,
): StaleLineageCollapse[] {
  const childrenMap = buildChildrenMap(entries)
  const collapses: StaleLineageCollapse[] = []
  const processedRoots = new Set<string>()

  for (const entry of entries) {
    if (!isRevocationBarriered(entry)) continue

    const rootId = String(entry.continuity_id)
    if (processedRoots.has(rootId)) continue
    processedRoots.add(rootId)

    const activeDescendants: string[] = []
    const queue = [rootId]
    const visited = new Set<string>([rootId])

    while (queue.length > 0) {
      const current = queue.shift()!
      const children = childrenMap.get(current) ?? []
      for (const childId of children) {
        if (visited.has(childId)) continue
        visited.add(childId)
        const childEntry = index.get(childId)
        if (childEntry && isActiveStatus(childEntry.status) && !childEntry.revoked_at) {
          activeDescendants.push(childId)
        }
        queue.push(childId)
      }
    }

    if (activeDescendants.length === 0) continue

    const collapsePayload = {
      active_descendant_ids: [...activeDescendants].sort(),
      revoked_root_id: rootId,
    }
    collapses.push(
      Object.freeze({
        collapse_id: sha256Hex(canonicalize({ collapse: collapsePayload })),
        revoked_root_id: rootId,
        active_descendant_ids: Object.freeze([...activeDescendants].sort()),
        collapse_hash: sha256Hex(canonicalize(collapsePayload)),
      }),
    )
  }

  return collapses
}

// ── Revocation Chronology Reconstruction ─────────────────────────────────────

export function reconstructRevocationChronology(
  revocationRecords: readonly RevocationEvidence[],
): RevocationChronologyEntry[] {
  const sorted = [...revocationRecords].sort((a, b) => {
    const timeA = String(a.revoked_at || '')
    const timeB = String(b.revoked_at || '')
    if (timeA < timeB) return -1
    if (timeA > timeB) return 1
    return String(a.revocation_id).localeCompare(String(b.revocation_id))
  })

  return sorted.map((record, sequenceIndex) => {
    const entryPayload = {
      revocation_id: record.revocation_id,
      revoked_at: record.revoked_at,
      root_continuity_id: record.root_continuity_id,
      sequence_index: sequenceIndex,
    }
    return Object.freeze({
      sequence_index: sequenceIndex,
      revocation_id: record.revocation_id,
      root_continuity_id: record.root_continuity_id,
      revoked_at: record.revoked_at,
      chronology_hash: sha256Hex(canonicalize(entryPayload)),
    })
  })
}

// ── Revocation Ancestry Auditing ─────────────────────────────────────────────

export function auditRevocationAncestry(
  continuityId: string,
  index: Map<string, RevocationLineageEntry>,
  maxDepth: number,
): RevocationAncestryAudit {
  const chain: string[] = []
  const visited = new Set<string>()
  let current: string | null = continuityId
  let revokedAncestorId: string | null = null

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)
    chain.push(current)

    if (chain.length > maxDepth) break

    const node = index.get(current)
    if (!node) break

    const parentId = String(node.parent_continuity_id || '').trim()
    if (!parentId) break

    const parentNode = index.get(parentId)
    if (parentNode && isRevocationBarriered(parentNode)) {
      chain.push(parentId)
      revokedAncestorId = parentId
      break
    }

    current = parentId
  }

  const ancestorRevoked = revokedAncestorId !== null
  const auditPayload = {
    ancestor_revoked: ancestorRevoked,
    ancestry_chain: [...chain],
    continuity_id: continuityId,
    revoked_ancestor_id: revokedAncestorId,
  }

  return Object.freeze({
    audit_id: sha256Hex(canonicalize({ audit: auditPayload })),
    continuity_id: continuityId,
    ancestor_revoked: ancestorRevoked,
    revoked_ancestor_id: revokedAncestorId,
    ancestry_chain: Object.freeze([...chain]),
    ancestry_hash: sha256Hex(canonicalize(auditPayload)),
  })
}

// ── Revoked Replay Invalidation ───────────────────────────────────────────────

export function validateRevokedReplayIneligibility(
  replay: RevocationReplayRecord,
  index: Map<string, RevocationLineageEntry>,
  revocationRecords: readonly RevocationEvidence[],
): { eligible: boolean; ineligibility_reason: string | null } {
  const entry = index.get(String(replay.continuity_id || ''))
  if (!entry) {
    return { eligible: false, ineligibility_reason: 'continuity_not_found' }
  }
  if (isRevocationBarriered(entry)) {
    return { eligible: false, ineligibility_reason: 'continuity_revoked_or_non_active' }
  }
  for (const record of revocationRecords) {
    if (
      record.root_continuity_id === String(replay.continuity_id) ||
      record.propagated_ids.includes(String(replay.continuity_id))
    ) {
      return { eligible: false, ineligibility_reason: 'revocation_cascade_detected' }
    }
  }
  if (
    isValidSha256(entry.continuity_hash) &&
    isValidSha256(replay.continuity_hash) &&
    entry.continuity_hash !== replay.continuity_hash
  ) {
    return { eligible: false, ineligibility_reason: 'continuity_hash_mismatch' }
  }
  return { eligible: true, ineligibility_reason: null }
}

// ── Revoked Proof Continuity Invalidation ─────────────────────────────────────

export function validateRevokedProofContinuity(
  proof: RevocationProofRecord,
  index: Map<string, RevocationLineageEntry>,
  revocationRecords: readonly RevocationEvidence[],
): { valid: boolean; invalidity_reason: string | null } {
  const entry = index.get(String(proof.continuity_id || ''))
  if (!entry) {
    return { valid: false, invalidity_reason: 'proof_continuity_not_found' }
  }
  if (isRevocationBarriered(entry)) {
    return { valid: false, invalidity_reason: 'proof_continuity_revoked' }
  }
  for (const record of revocationRecords) {
    if (
      record.root_continuity_id === String(proof.continuity_id) ||
      record.propagated_ids.includes(String(proof.continuity_id))
    ) {
      return { valid: false, invalidity_reason: 'proof_continuity_in_revocation_cascade' }
    }
  }
  return { valid: true, invalidity_reason: null }
}

// ── Distributed Revocation Convergence Verification ──────────────────────────

export function verifyDistributedRevocationConvergence(
  views: readonly RevocationRegistryView[],
  propagationId: string,
): DistributedRevocationConvergence {
  if (!views.length) {
    const nullHash = sha256Hex(canonicalize({ null: true, propagation_id: propagationId }))
    return Object.freeze({
      convergence_id: sha256Hex(
        canonicalize({ null_convergence: true, propagation_id: propagationId }),
      ),
      convergence_result: REVOCATION_CONVERGENCE_RESULTS.NULL,
      converged_count: 0,
      diverged_count: 0,
      canonical_epoch: null,
      canonical_revocation_hash: null,
      revocation_topology_hash: nullHash,
    })
  }

  const hashCounts = new Map<string, number>()
  for (const view of views) {
    const h = String(view.registry_hash || '')
    hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1)
  }

  let topHash = ''
  let topCount = 0
  for (const [h, count] of hashCounts.entries()) {
    if (count > topCount) {
      topCount = count
      topHash = h
    }
  }

  let canonicalEpoch: string | null = null
  for (const view of views) {
    if (String(view.registry_hash || '') === topHash) {
      canonicalEpoch = String(view.registry_epoch || '')
      break
    }
  }

  const allEntriesMap = new Map<string, RevocationLineageEntry>()
  for (const view of views) {
    for (const entry of view.entries) {
      allEntriesMap.set(entry.continuity_id, entry)
    }
  }
  const allEntries = Array.from(allEntriesMap.values())
  const revocationTopologyHash = computeRevocationTopologyHash(allEntries)

  const divergedCount = views.length - topCount
  const convergenceResult =
    topCount === views.length
      ? REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED
      : topCount > views.length / 2
      ? REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_PARTIAL
      : REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_FAILED

  const convergencePayload = {
    canonical_epoch: canonicalEpoch,
    canonical_revocation_hash: topHash,
    convergence_result: convergenceResult,
    converged_count: topCount,
    diverged_count: divergedCount,
    propagation_id: propagationId,
    revocation_topology_hash: revocationTopologyHash,
  }

  return Object.freeze({
    convergence_id: sha256Hex(canonicalize(convergencePayload)),
    convergence_result: convergenceResult,
    converged_count: topCount,
    diverged_count: divergedCount,
    canonical_epoch: canonicalEpoch,
    canonical_revocation_hash: topHash,
    revocation_topology_hash: revocationTopologyHash,
  })
}

// ── Revocation Drift Taxonomy Classification ──────────────────────────────────

export function classifyRevocationDrift(
  traversalResults: readonly RevocationDescendantResult[],
  incompleteIds: readonly string[],
  staleCollapses: readonly StaleLineageCollapse[],
  ancestryAudits: readonly RevocationAncestryAudit[],
  replayEligibility: readonly ReplayRevocationEligibility[],
  proofValidations: readonly ProofContinuityValidation[],
  convergence: DistributedRevocationConvergence,
  propagationId: string,
): RevocationDriftObservation[] {
  const observations: RevocationDriftObservation[] = []
  let obsIndex = 0

  const nextObsId = () => {
    const id = sha256Hex(canonicalize({ obs_index: obsIndex, propagation_id: propagationId }))
    obsIndex++
    return id
  }

  for (const result of traversalResults) {
    if (result.ok) continue
    const driftClass =
      result.failure_reason === REVOCATION_DESCENDANT_FAILURES.CYCLE_DETECTED
        ? REVOCATION_DRIFT_CLASSES.REVOCATION_LINEAGE_CYCLE
        : REVOCATION_DRIFT_CLASSES.REVOCATION_DEPTH_EXCEEDED
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: driftClass,
        affected_continuity_id: result.root_continuity_id,
        severity: 'fatal' as const,
        detail: `revocation traversal failed for root ${result.root_continuity_id}: ${result.failure_reason} at depth ${result.depth_reached}`,
      }),
    )
  }

  for (const id of incompleteIds) {
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.DESCENDANT_PROPAGATION_INCOMPLETE,
        affected_continuity_id: id,
        severity: 'fatal' as const,
        detail: `continuity_id ${id} is a descendant of a revoked root but remains ACTIVE; propagation is incomplete`,
      }),
    )
  }

  for (const collapse of staleCollapses) {
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.STALE_LINEAGE_RESURRECTION,
        affected_continuity_id: collapse.revoked_root_id,
        severity: 'fatal' as const,
        detail: `revoked root ${collapse.revoked_root_id} has ${collapse.active_descendant_ids.length} active descendant(s); stale lineage collapse required`,
      }),
    )
  }

  for (const audit of ancestryAudits) {
    if (!audit.ancestor_revoked) continue
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.ANCESTOR_REVOCATION_UNRESOLVED,
        affected_continuity_id: audit.continuity_id,
        severity: 'fatal' as const,
        detail: `continuity_id ${audit.continuity_id} has revoked ancestor ${audit.revoked_ancestor_id}; lineage legitimacy is invalidated`,
      }),
    )
  }

  for (const entry of replayEligibility) {
    if (entry.eligible) continue
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.REPLAY_REVOCATION_BARRIER_VIOLATED,
        affected_continuity_id: entry.continuity_id,
        severity: 'fatal' as const,
        detail: `replay_id ${entry.replay_id} is ineligible for continuity_id ${entry.continuity_id}: ${entry.ineligibility_reason}`,
      }),
    )
  }

  for (const pv of proofValidations) {
    if (pv.valid) continue
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.PROOF_REVOCATION_BARRIER_VIOLATED,
        affected_continuity_id: pv.continuity_id,
        severity: 'fatal' as const,
        detail: `proof_id ${pv.proof_id} has invalid continuity for continuity_id ${pv.continuity_id}: ${pv.invalidity_reason}`,
      }),
    )
  }

  if (
    convergence.convergence_result !== REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED &&
    convergence.convergence_result !== REVOCATION_CONVERGENCE_RESULTS.NULL
  ) {
    observations.push(
      Object.freeze({
        observation_id: nextObsId(),
        drift_class: REVOCATION_DRIFT_CLASSES.DISTRIBUTED_REVOCATION_DRIFT,
        affected_continuity_id: null,
        severity: 'fatal' as const,
        detail: `distributed revocation convergence failed (${convergence.convergence_result}): ${convergence.converged_count} converged, ${convergence.diverged_count} diverged`,
      }),
    )
  }

  return observations
}

// ── Revocation Repair Diagnostics ─────────────────────────────────────────────

export function computeRevocationRepairDiagnostics(
  driftObservations: readonly RevocationDriftObservation[],
  incompleteIds: readonly string[],
  staleCollapses: readonly StaleLineageCollapse[],
  propagationId: string,
): RevocationRepairDiagnostic[] {
  const diagnostics: RevocationRepairDiagnostic[] = []
  let diagIndex = 0

  const nextDiagId = () => {
    const id = sha256Hex(canonicalize({ diag_index: diagIndex, propagation_id: propagationId }))
    diagIndex++
    return id
  }

  for (const obs of driftObservations) {
    if (
      obs.drift_class !== REVOCATION_DRIFT_CLASSES.REVOCATION_LINEAGE_CYCLE &&
      obs.drift_class !== REVOCATION_DRIFT_CLASSES.REVOCATION_DEPTH_EXCEEDED
    )
      continue
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: obs.affected_continuity_id,
        repair_class: REVOCATION_REPAIR_CLASSES.REVOCATION_PERMANENTLY_INVALID,
        repairable: false,
        detail: `revocation traversal failure (${obs.drift_class}) for ${obs.affected_continuity_id}; lineage is permanently invalid`,
      }),
    )
  }

  for (const id of incompleteIds) {
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: id,
        repair_class: REVOCATION_REPAIR_CLASSES.PROPAGATE_REVOCATION_TO_DESCENDANTS,
        repairable: true,
        detail: `continuity_id ${id} must receive revocation propagation from its revoked ancestor`,
      }),
    )
  }

  for (const collapse of staleCollapses) {
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: collapse.revoked_root_id,
        repair_class: REVOCATION_REPAIR_CLASSES.PROPAGATE_REVOCATION_TO_DESCENDANTS,
        repairable: true,
        detail: `revoked root ${collapse.revoked_root_id} has ${collapse.active_descendant_ids.length} active descendant(s) that require collapse`,
      }),
    )
  }

  for (const obs of driftObservations) {
    if (obs.drift_class !== REVOCATION_DRIFT_CLASSES.REPLAY_REVOCATION_BARRIER_VIOLATED) continue
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: obs.affected_continuity_id,
        repair_class: REVOCATION_REPAIR_CLASSES.INVALIDATE_STALE_REPLAY,
        repairable: false,
        detail: `replay for continuity_id ${obs.affected_continuity_id} must be invalidated; revocation barrier was violated`,
      }),
    )
  }

  for (const obs of driftObservations) {
    if (obs.drift_class !== REVOCATION_DRIFT_CLASSES.PROOF_REVOCATION_BARRIER_VIOLATED) continue
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: obs.affected_continuity_id,
        repair_class: REVOCATION_REPAIR_CLASSES.INVALIDATE_PROOF_CONTINUITY,
        repairable: false,
        detail: `proof for continuity_id ${obs.affected_continuity_id} must be invalidated; revocation barrier was violated`,
      }),
    )
  }

  for (const obs of driftObservations) {
    if (obs.drift_class !== REVOCATION_DRIFT_CLASSES.DISTRIBUTED_REVOCATION_DRIFT) continue
    diagnostics.push(
      Object.freeze({
        diagnostic_id: nextDiagId(),
        affected_continuity_id: null,
        repair_class: REVOCATION_REPAIR_CLASSES.RECONCILE_REVOCATION_VIEWS,
        repairable: true,
        detail: `distributed revocation views are divergent; reconcile registry views to reach convergence`,
      }),
    )
  }

  return diagnostics
}

// ── Revocation Propagation Audit Surface ─────────────────────────────────────

export function buildRevocationPropagationAuditSurface(params: {
  propagationId: string
  revocationTopologyHash: string
  totalEntryCount: number
  revokedCount: number
  propagationComplete: boolean
  driftCount: number
  convergenceResult: RevocationConvergenceResult
}): RevocationPropagationAuditSurface {
  const surfacePayload = {
    convergence_result: params.convergenceResult,
    drift_count: params.driftCount,
    propagation_complete: params.propagationComplete,
    propagation_id: params.propagationId,
    revocation_topology_hash: params.revocationTopologyHash,
    revoked_count: params.revokedCount,
    total_entry_count: params.totalEntryCount,
  }
  return Object.freeze({
    audit_id: sha256Hex(canonicalize(surfacePayload)),
    propagation_id: params.propagationId,
    revocation_topology_hash: params.revocationTopologyHash,
    total_entry_count: params.totalEntryCount,
    revoked_count: params.revokedCount,
    propagation_complete: params.propagationComplete,
    drift_count: params.driftCount,
    convergence_result: params.convergenceResult,
  })
}

// ── Null propagation builder ──────────────────────────────────────────────────

function buildNullPropagation(propagationId: string): RevocationLineagePropagation {
  const nullHash = sha256Hex(canonicalize({ null: true, propagation_id: propagationId }))
  const nullConvergence = Object.freeze({
    convergence_id: sha256Hex(
      canonicalize({ null_convergence: true, propagation_id: propagationId }),
    ),
    convergence_result: REVOCATION_CONVERGENCE_RESULTS.NULL,
    converged_count: 0,
    diverged_count: 0,
    canonical_epoch: null,
    canonical_revocation_hash: null,
    revocation_topology_hash: nullHash,
  })
  const auditSurface = buildRevocationPropagationAuditSurface({
    propagationId,
    revocationTopologyHash: nullHash,
    totalEntryCount: 0,
    revokedCount: 0,
    propagationComplete: false,
    driftCount: 0,
    convergenceResult: REVOCATION_CONVERGENCE_RESULTS.NULL,
  })
  return Object.freeze({
    artifact_type: 'RECURSIVE_REVOCATION_PROPAGATION',
    evidence_only: true,
    propagation_id: propagationId,
    propagation_result: REVOCATION_PROPAGATION_RESULTS.NULL,
    revocation_topology_hash: nullHash,
    entry_count: 0,
    descendant_traversal_results: Object.freeze([]),
    incomplete_propagations: Object.freeze([]),
    stale_lineage_collapses: Object.freeze([]),
    chronology: Object.freeze([]),
    ancestry_audits: Object.freeze([]),
    replay_eligibility: Object.freeze([]),
    proof_continuity_validations: Object.freeze([]),
    convergence: nullConvergence,
    drift_observations: Object.freeze([]),
    repair_diagnostics: Object.freeze([]),
    audit_surface: Object.freeze(auditSurface),
  })
}

// ── Main propagation function ─────────────────────────────────────────────────

export function propagateRevocationLineage(input: unknown): RevocationLineagePropagation {
  const safeInput = safeObj(input)

  const rawPropagationId = safeInput.propagation_id
  if (typeof rawPropagationId !== 'string' || !String(rawPropagationId).trim()) {
    return buildNullPropagation('unknown')
  }
  const propagationId = rawPropagationId.trim()

  if (safeInput.evidence_only !== true) return buildNullPropagation(propagationId)
  if (hasForbiddenField(safeInput)) return buildNullPropagation(propagationId)

  const rawViews = Array.isArray(safeInput.registry_views) ? safeInput.registry_views : []
  if (!rawViews.length) return buildNullPropagation(propagationId)

  // Parse and validate registry views
  const views: RevocationRegistryView[] = []
  for (const rv of rawViews) {
    const v = safeObj(rv)
    if (hasForbiddenField(v)) return buildNullPropagation(propagationId)
    if (!String(v.node_id || '').trim()) continue
    if (!String(v.registry_epoch || '').trim()) continue
    if (!String(v.lineage_root_id || '').trim()) continue
    if (!isValidSha256(v.registry_hash)) continue

    const rawEntries = Array.isArray(v.entries) ? v.entries : []
    const entries: RevocationLineageEntry[] = []
    for (const re of rawEntries) {
      const e = safeObj(re)
      if (hasForbiddenField(e)) return buildNullPropagation(propagationId)
      const id = String(e.continuity_id || '').trim()
      if (!id) continue
      entries.push({
        continuity_id: id,
        session_id: String(e.session_id || ''),
        parent_continuity_id:
          e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
        continuity_hash: String(e.continuity_hash || ''),
        status: String(e.status || ''),
        revoked_at: e.revoked_at != null ? String(e.revoked_at) : null,
        expires_at: e.expires_at != null ? String(e.expires_at) : null,
      })
    }
    views.push({
      node_id: String(v.node_id),
      registry_epoch: String(v.registry_epoch),
      lineage_root_id: String(v.lineage_root_id),
      entries: Object.freeze(entries),
      registry_hash: String(v.registry_hash),
    })
  }

  if (!views.length) return buildNullPropagation(propagationId)

  // Merge all entries (deduplicate by continuity_id — last write wins per view order)
  const allEntriesMap = new Map<string, RevocationLineageEntry>()
  for (const view of views) {
    for (const entry of view.entries) {
      allEntriesMap.set(entry.continuity_id, entry)
    }
  }
  const allEntries = Array.from(allEntriesMap.values())
  if (!allEntries.length) return buildNullPropagation(propagationId)

  const revocationTopologyHash = computeRevocationTopologyHash(allEntries)

  const rawMaxDepth = safeInput.max_descent_depth
  const maxDescentDepth =
    typeof rawMaxDepth === 'number' && Number.isFinite(rawMaxDepth) && rawMaxDepth > 0
      ? Math.floor(rawMaxDepth)
      : SYSTEM_MAX_DESCENT_DEPTH

  // Parse revocation records
  const rawRevocations = Array.isArray(safeInput.revocation_records)
    ? safeInput.revocation_records
    : []
  const revocationRecords: RevocationEvidence[] = []
  for (const rr of rawRevocations) {
    const r = safeObj(rr)
    if (!String(r.revocation_id || '').trim()) continue
    if (!String(r.root_continuity_id || '').trim()) continue
    if (!String(r.revoked_at || '').trim()) continue
    const propagatedIds = Array.isArray(r.propagated_ids)
      ? (r.propagated_ids as unknown[]).filter(
          (x): x is string => typeof x === 'string' && x.trim() !== '',
        )
      : []
    revocationRecords.push({
      revocation_id: String(r.revocation_id),
      root_continuity_id: String(r.root_continuity_id),
      revoked_at: String(r.revoked_at),
      propagated_ids: Object.freeze(propagatedIds),
    })
  }

  // Determine all revoked root IDs (from registry state + revocation records)
  const revokedRootIds = new Set<string>()
  for (const entry of allEntries) {
    if (isRevocationBarriered(entry)) {
      revokedRootIds.add(entry.continuity_id)
    }
  }
  for (const record of revocationRecords) {
    revokedRootIds.add(record.root_continuity_id)
  }

  // Traverse descendants for each revoked root
  const descendantTraversalResults: RevocationDescendantResult[] = []
  for (const rootId of revokedRootIds) {
    descendantTraversalResults.push(
      traverseDescendantRevocation(rootId, allEntriesMap, maxDescentDepth),
    )
  }

  // Verify propagation completeness (based on explicit revocation records)
  const { complete: propagationComplete, incomplete_ids: incompleteIds } =
    verifyRevocationPropagationCompleteness(
      descendantTraversalResults,
      revocationRecords,
      allEntriesMap,
    )

  // Enforce stale lineage collapse (based on registry state)
  const staleCollapses = enforceStaleLineageCollapse(allEntries, allEntriesMap)

  // Reconstruct revocation chronology
  const chronology = reconstructRevocationChronology(revocationRecords)

  // Audit ancestry for all entries
  const ancestryAudits: RevocationAncestryAudit[] = []
  for (const entry of allEntries) {
    ancestryAudits.push(auditRevocationAncestry(entry.continuity_id, allEntriesMap, maxDescentDepth))
  }

  // Parse and validate proof records
  const rawProofs = Array.isArray(safeInput.proof_records) ? safeInput.proof_records : []
  const proofContinuityValidations: ProofContinuityValidation[] = []
  for (const rp of rawProofs) {
    const p = safeObj(rp)
    const proofId = String(p.proof_id || '').trim()
    const continuityId = String(p.continuity_id || '').trim()
    if (!proofId || !continuityId) continue
    const record: RevocationProofRecord = {
      proof_id: proofId,
      continuity_id: continuityId,
      proof_hash: String(p.proof_hash || ''),
      lineage_hash: String(p.lineage_hash || ''),
    }
    const validation = validateRevokedProofContinuity(record, allEntriesMap, revocationRecords)
    proofContinuityValidations.push(
      Object.freeze({
        proof_id: proofId,
        continuity_id: continuityId,
        valid: validation.valid,
        invalidity_reason: validation.invalidity_reason,
        proof_hash: record.proof_hash,
      }),
    )
  }

  // Parse and validate replay records
  const rawReplays = Array.isArray(safeInput.replay_records) ? safeInput.replay_records : []
  const replayEligibility: ReplayRevocationEligibility[] = []
  for (const rr of rawReplays) {
    const r = safeObj(rr)
    const replayId = String(r.replay_id || '').trim()
    const continuityId = String(r.continuity_id || '').trim()
    if (!replayId || !continuityId) continue
    const record: RevocationReplayRecord = {
      replay_id: replayId,
      continuity_id: continuityId,
      continuity_hash: String(r.continuity_hash || ''),
      lineage_hash: String(r.lineage_hash || ''),
    }
    const eligibility = validateRevokedReplayIneligibility(record, allEntriesMap, revocationRecords)
    replayEligibility.push(
      Object.freeze({
        replay_id: replayId,
        continuity_id: continuityId,
        eligible: eligibility.eligible,
        ineligibility_reason: eligibility.ineligibility_reason,
      }),
    )
  }

  // Verify distributed revocation convergence
  const convergence = verifyDistributedRevocationConvergence(views, propagationId)

  // Classify revocation drift
  const driftObservations = classifyRevocationDrift(
    descendantTraversalResults,
    incompleteIds,
    staleCollapses,
    ancestryAudits,
    replayEligibility,
    proofContinuityValidations,
    convergence,
    propagationId,
  )

  // Compute repair diagnostics
  const repairDiagnostics = computeRevocationRepairDiagnostics(
    driftObservations,
    incompleteIds,
    staleCollapses,
    propagationId,
  )

  // Build audit surface
  const auditSurface = buildRevocationPropagationAuditSurface({
    propagationId,
    revocationTopologyHash,
    totalEntryCount: allEntries.length,
    revokedCount: revokedRootIds.size,
    propagationComplete,
    driftCount: driftObservations.length,
    convergenceResult: convergence.convergence_result,
  })

  // Determine overall propagation result
  const hasCycle = descendantTraversalResults.some(
    (r) => r.failure_reason === REVOCATION_DESCENDANT_FAILURES.CYCLE_DETECTED,
  )
  const hasDepthExceeded = descendantTraversalResults.some(
    (r) => r.failure_reason === REVOCATION_DESCENDANT_FAILURES.DEPTH_EXCEEDED,
  )
  const hasConvergenceIssue =
    views.length > 1 &&
    convergence.convergence_result !== REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED

  let propagationResult: RevocationPropagationResult
  if (hasCycle || hasDepthExceeded) {
    propagationResult = REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COLLAPSED
  } else if (!propagationComplete) {
    propagationResult = REVOCATION_PROPAGATION_RESULTS.PROPAGATION_INCOMPLETE
  } else if (staleCollapses.length > 0) {
    propagationResult = REVOCATION_PROPAGATION_RESULTS.PROPAGATION_STALE
  } else if (hasConvergenceIssue) {
    propagationResult = REVOCATION_PROPAGATION_RESULTS.PROPAGATION_CONVERGENCE_FAILED
  } else {
    propagationResult = REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COMPLETE
  }

  return Object.freeze({
    artifact_type: 'RECURSIVE_REVOCATION_PROPAGATION',
    evidence_only: true,
    propagation_id: propagationId,
    propagation_result: propagationResult,
    revocation_topology_hash: revocationTopologyHash,
    entry_count: allEntries.length,
    descendant_traversal_results: Object.freeze(
      descendantTraversalResults.map((r) => Object.freeze(r)),
    ),
    incomplete_propagations: Object.freeze([...incompleteIds]),
    stale_lineage_collapses: Object.freeze(staleCollapses.map((c) => Object.freeze(c))),
    chronology: Object.freeze(chronology.map((e) => Object.freeze(e))),
    ancestry_audits: Object.freeze(ancestryAudits.map((a) => Object.freeze(a))),
    replay_eligibility: Object.freeze(replayEligibility.map((r) => Object.freeze(r))),
    proof_continuity_validations: Object.freeze(
      proofContinuityValidations.map((p) => Object.freeze(p)),
    ),
    convergence: Object.freeze(convergence),
    drift_observations: Object.freeze(driftObservations.map((d) => Object.freeze(d))),
    repair_diagnostics: Object.freeze(repairDiagnostics.map((d) => Object.freeze(d))),
    audit_surface: Object.freeze(auditSurface),
  })
}
