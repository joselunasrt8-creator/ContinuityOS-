/**
 * src/distributed-continuity-lineage-reconciliation.ts
 * Issue #1149 — Distributed Continuity Lineage Reconciliation Hardening
 *
 * Deterministic distributed continuity lineage verification across legitimacy registries.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Expanded distributed invariant:
 *   all lineage-dependent registries must remain recursively reconcilable
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic replay decisions, no replay bypass paths,
 * no legitimacy semantic weakening.
 *
 * All canonical hashing is centralized through src/canonical.js.
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Result constants ───────────────────────────────────────────────────────────

export const CONTINUITY_LINEAGE_RECONCILIATION_RESULTS = {
  LINEAGE_RECONCILED: 'LINEAGE_RECONCILED',
  LINEAGE_DIVERGED: 'LINEAGE_DIVERGED',
  LINEAGE_ORPHANED: 'LINEAGE_ORPHANED',
  LINEAGE_REVOKED: 'LINEAGE_REVOKED',
  LINEAGE_STALE: 'LINEAGE_STALE',
  LINEAGE_COLLAPSED: 'LINEAGE_COLLAPSED',
  NULL: 'NULL',
} as const

export type ContinuityLineageReconciliationOutcome =
  (typeof CONTINUITY_LINEAGE_RECONCILIATION_RESULTS)[keyof typeof CONTINUITY_LINEAGE_RECONCILIATION_RESULTS]

// ── Drift class taxonomy ───────────────────────────────────────────────────────

export const CONTINUITY_LINEAGE_DRIFT_CLASSES = {
  ORPHAN_LINEAGE_DETECTED: 'orphan_lineage_detected',
  DETACHED_REPLAY_DETECTED: 'detached_replay_detected',
  STALE_LINEAGE_RESURRECTION: 'stale_lineage_resurrection',
  REVOCATION_PROPAGATION_INCOMPLETE: 'revocation_propagation_incomplete',
  DISTRIBUTED_LINEAGE_DRIFT: 'distributed_lineage_drift',
  REPLAY_LINEAGE_MISMATCH: 'replay_lineage_mismatch',
  LINEAGE_HASH_MISMATCH: 'lineage_hash_mismatch',
  ANCESTRY_CYCLE_DETECTED: 'ancestry_cycle_detected',
  ANCESTRY_DEPTH_EXCEEDED: 'ancestry_depth_exceeded',
  FRESHNESS_BARRIER_VIOLATED: 'freshness_barrier_violated',
  REVOCATION_AMBIGUITY_DETECTED: 'revocation_ambiguity_detected',
  BOUNDARY_VIOLATION_DETECTED: 'boundary_violation_detected',
} as const

export type ContinuityLineageDriftClass =
  (typeof CONTINUITY_LINEAGE_DRIFT_CLASSES)[keyof typeof CONTINUITY_LINEAGE_DRIFT_CLASSES]

// ── Convergence result constants ───────────────────────────────────────────────

export const CONTINUITY_CONVERGENCE_RESULTS = {
  CONVERGENCE_REACHED: 'CONVERGENCE_REACHED',
  CONVERGENCE_DIVERGED: 'CONVERGENCE_DIVERGED',
  CONVERGENCE_COLLAPSED: 'CONVERGENCE_COLLAPSED',
  NULL: 'NULL',
} as const

export type ContinuityConvergenceResult =
  (typeof CONTINUITY_CONVERGENCE_RESULTS)[keyof typeof CONTINUITY_CONVERGENCE_RESULTS]

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DistributedContinuityEntry {
  readonly continuity_id: string
  readonly session_id: string
  readonly identity_id?: string | null
  readonly parent_continuity_id?: string | null
  readonly continuity_hash: string
  readonly status: string
  readonly expires_at?: string | null
  readonly revoked_at?: string | null
}

export interface DistributedContinuityRegistryView {
  readonly node_id: string
  readonly registry_epoch: string
  readonly lineage_root_id: string
  readonly entries: readonly DistributedContinuityEntry[]
  readonly registry_hash: string
}

export interface ContinuityReplayRecord {
  readonly replay_id: string
  readonly continuity_id: string
  readonly continuity_hash: string
  readonly lineage_hash: string
}

export interface ContinuityRevocationEvidence {
  readonly revocation_id: string
  readonly root_continuity_id: string
  readonly revoked_at: string
  readonly propagated_to_ids: readonly string[]
}

export interface ContinuityLineageDriftObservation {
  readonly observation_id: string
  readonly drift_class: ContinuityLineageDriftClass
  readonly affected_continuity_id: string | null
  readonly detail: string
}

export interface ContinuityReplayEligibilityEntry {
  readonly replay_id: string
  readonly continuity_id: string
  readonly eligible: boolean
  readonly ineligibility_reason: string | null
}

export interface ContinuityLineageAuditSurface {
  readonly audit_id: string
  readonly lineage_topology_hash: string
  readonly participant_count: number
  readonly converged_count: number
  readonly orphaned_count: number
  readonly revocation_complete: boolean
  readonly drift_count: number
}

export interface DistributedContinuityLineageReconciliationInput {
  readonly reconciliation_id: string
  readonly evidence_only: true
  readonly registry_views: readonly DistributedContinuityRegistryView[]
  readonly replay_records?: readonly ContinuityReplayRecord[] | null
  readonly revocation_evidence?: readonly ContinuityRevocationEvidence[] | null
  readonly freshness_horizon_ms?: number | null
  readonly max_ancestry_depth?: number | null
}

export interface DistributedContinuityLineageReconciliation {
  readonly artifact_type: 'DISTRIBUTED_CONTINUITY_LINEAGE_RECONCILIATION'
  readonly evidence_only: true
  readonly reconciliation_id: string
  readonly reconciliation_result: ContinuityLineageReconciliationOutcome
  readonly lineage_topology_hash: string
  readonly participant_count: number
  readonly converged_count: number
  readonly diverged_count: number
  readonly orphaned_ids: readonly string[]
  readonly revocation_propagation_complete: boolean
  readonly replay_eligibility: readonly ContinuityReplayEligibilityEntry[]
  readonly drift_observations: readonly ContinuityLineageDriftObservation[]
  readonly audit_surface: ContinuityLineageAuditSurface
}

// ── Internal constants ─────────────────────────────────────────────────────────

const SYSTEM_MAX_ANCESTRY_DEPTH = 32

const HEX64_RE = /^[0-9a-f]{64}$/

const FORBIDDEN_BOUNDARY_FIELDS = [
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

// ── Internal helpers ───────────────────────────────────────────────────────────

function isValidSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

function detectBoundaryViolation(obj: Record<string, unknown>): boolean {
  return FORBIDDEN_BOUNDARY_FIELDS.some((f) => f in obj)
}

function isActiveStatus(status: unknown): boolean {
  return typeof status === 'string' && status === 'ACTIVE'
}

function isRevokedOrExpired(entry: DistributedContinuityEntry): boolean {
  return (
    !isActiveStatus(entry.status) ||
    Boolean(entry.revoked_at) ||
    Boolean(entry.expires_at && Number.isFinite(Date.parse(String(entry.expires_at))) && Date.parse(String(entry.expires_at)) <= Date.now())
  )
}

// ── Canonical topology hash (centralized through canonical.js) ─────────────────

export function computeContinuityLineageTopologyHash(
  entries: readonly DistributedContinuityEntry[],
): string {
  const sorted = entries
    .slice()
    .sort((a, b) => String(a.continuity_id).localeCompare(String(b.continuity_id)))
    .map((e) => ({
      continuity_hash: String(e.continuity_hash || ''),
      continuity_id: String(e.continuity_id || ''),
      identity_id: e.identity_id != null ? String(e.identity_id) : null,
      parent_continuity_id: e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
      session_id: String(e.session_id || ''),
      status: String(e.status || ''),
    }))
  return sha256Hex(canonicalize(sorted))
}

// ── Registry view convergence hash ────────────────────────────────────────────

export function computeRegistryViewConvergenceHash(view: DistributedContinuityRegistryView): string {
  return sha256Hex(
    canonicalize({
      entries_topology_hash: computeContinuityLineageTopologyHash(view.entries || []),
      lineage_root_id: String(view.lineage_root_id || ''),
      node_id: String(view.node_id || ''),
      registry_epoch: String(view.registry_epoch || ''),
    }),
  )
}

// ── Orphan lineage detection ───────────────────────────────────────────────────

export function detectOrphanedContinuityLineage(
  entries: readonly DistributedContinuityEntry[],
): string[] {
  const index = new Set<string>()
  for (const entry of entries) {
    const id = String(entry.continuity_id || '').trim()
    if (id) index.add(id)
  }
  const orphaned: string[] = []
  for (const entry of entries) {
    const parentId = String(entry.parent_continuity_id || '').trim()
    if (parentId && !index.has(parentId)) {
      orphaned.push(String(entry.continuity_id))
    }
  }
  return orphaned
}

// ── Ancestry traversal: cycle and depth detection ─────────────────────────────

interface AncestryTraversalResult {
  ok: boolean
  cycle_detected: boolean
  depth_exceeded: boolean
  depth: number
}

function traverseAncestry(
  startId: string,
  index: Map<string, DistributedContinuityEntry>,
  maxDepth: number,
): AncestryTraversalResult {
  const visited = new Set<string>()
  let current: string | null = startId
  let depth = 0
  while (current) {
    if (visited.has(current)) {
      return { ok: false, cycle_detected: true, depth_exceeded: false, depth }
    }
    visited.add(current)
    depth++
    if (depth > maxDepth) {
      return { ok: false, cycle_detected: false, depth_exceeded: true, depth }
    }
    const node = index.get(current)
    if (!node) break
    const parentId = String(node.parent_continuity_id || '').trim()
    current = parentId || null
  }
  return { ok: true, cycle_detected: false, depth_exceeded: false, depth }
}

// ── Replay lineage eligibility ─────────────────────────────────────────────────

export function verifyReplayLineageEligibility(
  replay: ContinuityReplayRecord,
  index: Map<string, DistributedContinuityEntry>,
  revocationEvidence: readonly ContinuityRevocationEvidence[],
): { eligible: boolean; ineligibility_reason: string | null } {
  const entry = index.get(String(replay.continuity_id || ''))
  if (!entry) {
    return { eligible: false, ineligibility_reason: 'detached_replay_no_continuity_entry' }
  }
  if (isRevokedOrExpired(entry)) {
    return { eligible: false, ineligibility_reason: 'replay_continuity_revoked_or_expired' }
  }
  if (
    isValidSha256Hex(entry.continuity_hash) &&
    isValidSha256Hex(replay.continuity_hash) &&
    entry.continuity_hash !== replay.continuity_hash
  ) {
    return { eligible: false, ineligibility_reason: 'replay_continuity_hash_mismatch' }
  }
  for (const rev of revocationEvidence) {
    if (
      rev.root_continuity_id === String(replay.continuity_id) ||
      rev.propagated_to_ids.includes(String(replay.continuity_id))
    ) {
      return { eligible: false, ineligibility_reason: 'replay_revocation_cascade_detected' }
    }
  }
  return { eligible: true, ineligibility_reason: null }
}

// ── Revocation propagation completeness ───────────────────────────────────────

export function verifyRevocationPropagationCompleteness(
  revocationEvidence: readonly ContinuityRevocationEvidence[],
  index: Map<string, DistributedContinuityEntry>,
): { complete: boolean; missing_propagations: string[] } {
  const missing: string[] = []
  for (const rev of revocationEvidence) {
    const shouldBeRevoked = new Set<string>([
      rev.root_continuity_id,
      ...rev.propagated_to_ids,
    ])
    for (const [id, entry] of index.entries()) {
      const parentId = String(entry.parent_continuity_id || '').trim()
      if (parentId && shouldBeRevoked.has(parentId) && !shouldBeRevoked.has(id)) {
        if (isActiveStatus(entry.status)) {
          missing.push(id)
        }
      }
    }
  }
  return { complete: missing.length === 0, missing_propagations: missing }
}

// ── Distributed convergence evaluation ────────────────────────────────────────

export function evaluateContinuityLineageConvergence(
  views: readonly DistributedContinuityRegistryView[],
): {
  convergence_result: ContinuityConvergenceResult
  converged_count: number
  diverged_count: number
  canonical_epoch: string | null
  canonical_registry_hash: string | null
} {
  if (!views.length) {
    return {
      convergence_result: CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_COLLAPSED,
      converged_count: 0,
      diverged_count: 0,
      canonical_epoch: null,
      canonical_registry_hash: null,
    }
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

  if (topCount === views.length) {
    return {
      convergence_result: CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_REACHED,
      converged_count: topCount,
      diverged_count: 0,
      canonical_epoch: canonicalEpoch,
      canonical_registry_hash: topHash,
    }
  }

  return {
    convergence_result: CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_DIVERGED,
    converged_count: topCount,
    diverged_count: views.length - topCount,
    canonical_epoch: canonicalEpoch,
    canonical_registry_hash: topHash,
  }
}

// ── Freshness barrier check ────────────────────────────────────────────────────

function checkFreshnessBarrier(
  entries: readonly DistributedContinuityEntry[],
  freshnessHorizonMs: number,
): string[] {
  const staleIds: string[] = []
  const now = Date.now()
  for (const entry of entries) {
    if (entry.expires_at) {
      const expiresMs = Date.parse(String(entry.expires_at))
      if (Number.isFinite(expiresMs) && expiresMs > 0 && expiresMs - now < freshnessHorizonMs) {
        staleIds.push(String(entry.continuity_id))
      }
    }
  }
  return staleIds
}

// ── Audit surface builder ──────────────────────────────────────────────────────

export function buildContinuityLineageAuditSurface(params: {
  reconciliation_id: string
  lineage_topology_hash: string
  participant_count: number
  converged_count: number
  orphaned_ids: readonly string[]
  revocation_complete: boolean
  drift_count: number
}): ContinuityLineageAuditSurface {
  const auditPayload = {
    converged_count: params.converged_count,
    drift_count: params.drift_count,
    lineage_topology_hash: params.lineage_topology_hash,
    orphaned_count: params.orphaned_ids.length,
    participant_count: params.participant_count,
    reconciliation_id: params.reconciliation_id,
    revocation_complete: params.revocation_complete,
  }
  return Object.freeze({
    audit_id: sha256Hex(canonicalize(auditPayload)),
    converged_count: params.converged_count,
    drift_count: params.drift_count,
    lineage_topology_hash: params.lineage_topology_hash,
    orphaned_count: params.orphaned_ids.length,
    participant_count: params.participant_count,
    revocation_complete: params.revocation_complete,
  })
}

// ── Null result builder ────────────────────────────────────────────────────────

function buildNullReconciliation(
  reconciliation_id: string,
): DistributedContinuityLineageReconciliation {
  const nullHash = sha256Hex(canonicalize({ null: true, reconciliation_id }))
  const auditSurface = buildContinuityLineageAuditSurface({
    reconciliation_id,
    lineage_topology_hash: nullHash,
    participant_count: 0,
    converged_count: 0,
    orphaned_ids: [],
    revocation_complete: false,
    drift_count: 0,
  })
  return Object.freeze({
    artifact_type: 'DISTRIBUTED_CONTINUITY_LINEAGE_RECONCILIATION',
    audit_surface: Object.freeze(auditSurface),
    drift_observations: Object.freeze([]),
    diverged_count: 0,
    evidence_only: true,
    lineage_topology_hash: nullHash,
    orphaned_ids: Object.freeze([]),
    participant_count: 0,
    converged_count: 0,
    reconciliation_id,
    reconciliation_result: CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL,
    replay_eligibility: Object.freeze([]),
    revocation_propagation_complete: false,
  })
}

// ── Main reconciliation function ───────────────────────────────────────────────

export function reconcileDistributedContinuityLineage(
  input: unknown,
): DistributedContinuityLineageReconciliation {
  const safeInput = safeObj(input)
  const rawReconciliationId = safeInput.reconciliation_id
  if (typeof rawReconciliationId !== 'string' || !rawReconciliationId.trim()) {
    return buildNullReconciliation('unknown')
  }
  const reconciliationId = rawReconciliationId.trim()

  if (safeInput.evidence_only !== true) {
    return buildNullReconciliation(reconciliationId)
  }

  if (detectBoundaryViolation(safeInput)) {
    return buildNullReconciliation(reconciliationId)
  }

  const rawViews = Array.isArray(safeInput.registry_views) ? safeInput.registry_views : []
  if (!rawViews.length) {
    return buildNullReconciliation(reconciliationId)
  }

  // Validate and coerce views
  const views: DistributedContinuityRegistryView[] = []
  for (const rv of rawViews) {
    const v = safeObj(rv)
    if (detectBoundaryViolation(v)) return buildNullReconciliation(reconciliationId)
    if (!String(v.node_id || '').trim()) continue
    if (!String(v.registry_epoch || '').trim()) continue
    if (!String(v.lineage_root_id || '').trim()) continue
    if (!isValidSha256Hex(v.registry_hash)) continue
    const rawEntries = Array.isArray(v.entries) ? v.entries : []
    const entries: DistributedContinuityEntry[] = []
    for (const re of rawEntries) {
      const e = safeObj(re)
      if (detectBoundaryViolation(e)) return buildNullReconciliation(reconciliationId)
      if (!String(e.continuity_id || '').trim()) continue
      entries.push({
        continuity_hash: String(e.continuity_hash || ''),
        continuity_id: String(e.continuity_id),
        expires_at: e.expires_at != null ? String(e.expires_at) : null,
        identity_id: e.identity_id != null ? String(e.identity_id) : null,
        parent_continuity_id: e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
        revoked_at: e.revoked_at != null ? String(e.revoked_at) : null,
        session_id: String(e.session_id || ''),
        status: String(e.status || ''),
      })
    }
    views.push({
      entries: Object.freeze(entries),
      lineage_root_id: String(v.lineage_root_id),
      node_id: String(v.node_id),
      registry_epoch: String(v.registry_epoch),
      registry_hash: String(v.registry_hash),
    })
  }

  if (!views.length) {
    return buildNullReconciliation(reconciliationId)
  }

  // Collect all entries across all views (deduplicated by continuity_id)
  const allEntriesMap = new Map<string, DistributedContinuityEntry>()
  for (const view of views) {
    for (const entry of view.entries) {
      allEntriesMap.set(entry.continuity_id, entry)
    }
  }
  const allEntries = Array.from(allEntriesMap.values())

  // Lineage topology hash — centralized through canonical.js
  const lineageTopologyHash = computeContinuityLineageTopologyHash(allEntries)

  // Max ancestry depth
  const rawMaxDepth = safeInput.max_ancestry_depth
  const maxAncestryDepth =
    typeof rawMaxDepth === 'number' && Number.isFinite(rawMaxDepth) && rawMaxDepth > 0
      ? Math.floor(rawMaxDepth)
      : SYSTEM_MAX_ANCESTRY_DEPTH

  // Per-call observation index for deterministic observation IDs
  let obsIndex = 0
  function nextObsId(): string {
    return `${reconciliationId}-obs-${obsIndex++}`
  }

  const driftObservations: ContinuityLineageDriftObservation[] = []

  // Orphan lineage detection
  const orphanedIds = detectOrphanedContinuityLineage(allEntries)
  for (const oid of orphanedIds) {
    driftObservations.push(
      Object.freeze({
        affected_continuity_id: oid,
        detail: `continuity_id ${oid} references a parent not found in any registry view`,
        drift_class: CONTINUITY_LINEAGE_DRIFT_CLASSES.ORPHAN_LINEAGE_DETECTED,
        observation_id: nextObsId(),
      }),
    )
  }

  // Ancestry traversal — cycle and depth checks
  for (const entry of allEntries) {
    const result = traverseAncestry(entry.continuity_id, allEntriesMap, maxAncestryDepth)
    if (!result.ok) {
      const driftClass = result.cycle_detected
        ? CONTINUITY_LINEAGE_DRIFT_CLASSES.ANCESTRY_CYCLE_DETECTED
        : CONTINUITY_LINEAGE_DRIFT_CLASSES.ANCESTRY_DEPTH_EXCEEDED
      const detail = result.cycle_detected
        ? `ancestry cycle detected at depth ${result.depth} for continuity_id ${entry.continuity_id}`
        : `ancestry depth ${result.depth} exceeded maximum ${maxAncestryDepth} for continuity_id ${entry.continuity_id}`
      driftObservations.push(
        Object.freeze({
          affected_continuity_id: entry.continuity_id,
          detail,
          drift_class: driftClass,
          observation_id: nextObsId(),
        }),
      )
    }
  }

  // Freshness barrier
  const rawFreshnessHorizon = safeInput.freshness_horizon_ms
  if (
    typeof rawFreshnessHorizon === 'number' &&
    Number.isFinite(rawFreshnessHorizon) &&
    rawFreshnessHorizon > 0
  ) {
    const staleIds = checkFreshnessBarrier(allEntries, rawFreshnessHorizon)
    for (const sid of staleIds) {
      driftObservations.push(
        Object.freeze({
          affected_continuity_id: sid,
          detail: `continuity_id ${sid} violates freshness barrier of ${rawFreshnessHorizon}ms`,
          drift_class: CONTINUITY_LINEAGE_DRIFT_CLASSES.FRESHNESS_BARRIER_VIOLATED,
          observation_id: nextObsId(),
        }),
      )
    }
  }

  // Revocation evidence
  const rawRevocations = Array.isArray(safeInput.revocation_evidence)
    ? safeInput.revocation_evidence
    : []
  const revocationEvidence: ContinuityRevocationEvidence[] = []
  for (const rr of rawRevocations) {
    const r = safeObj(rr)
    if (!String(r.revocation_id || '').trim()) continue
    if (!String(r.root_continuity_id || '').trim()) continue
    if (!String(r.revoked_at || '').trim()) continue
    const propagatedIds = Array.isArray(r.propagated_to_ids)
      ? (r.propagated_to_ids as unknown[])
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : []
    revocationEvidence.push({
      propagated_to_ids: Object.freeze(propagatedIds),
      revocation_id: String(r.revocation_id),
      revoked_at: String(r.revoked_at),
      root_continuity_id: String(r.root_continuity_id),
    })
  }

  // Revocation propagation completeness
  const { complete: revocationComplete, missing_propagations } =
    verifyRevocationPropagationCompleteness(revocationEvidence, allEntriesMap)
  if (!revocationComplete) {
    for (const mid of missing_propagations) {
      driftObservations.push(
        Object.freeze({
          affected_continuity_id: mid,
          detail: `continuity_id ${mid} should be revoked by cascade but remains ACTIVE`,
          drift_class: CONTINUITY_LINEAGE_DRIFT_CLASSES.REVOCATION_PROPAGATION_INCOMPLETE,
          observation_id: nextObsId(),
        }),
      )
    }
  }

  // Replay eligibility
  const rawReplays = Array.isArray(safeInput.replay_records) ? safeInput.replay_records : []
  const replayEligibility: ContinuityReplayEligibilityEntry[] = []
  for (const rr of rawReplays) {
    const r = safeObj(rr)
    const replayId = String(r.replay_id || '').trim()
    const continuityId = String(r.continuity_id || '').trim()
    if (!replayId || !continuityId) continue
    const record: ContinuityReplayRecord = {
      continuity_hash: String(r.continuity_hash || ''),
      continuity_id: continuityId,
      lineage_hash: String(r.lineage_hash || ''),
      replay_id: replayId,
    }
    const eligibility = verifyReplayLineageEligibility(record, allEntriesMap, revocationEvidence)
    replayEligibility.push(
      Object.freeze({
        continuity_id: continuityId,
        eligible: eligibility.eligible,
        ineligibility_reason: eligibility.ineligibility_reason,
        replay_id: replayId,
      }),
    )
    if (!eligibility.eligible) {
      const driftClass =
        eligibility.ineligibility_reason === 'detached_replay_no_continuity_entry'
          ? CONTINUITY_LINEAGE_DRIFT_CLASSES.DETACHED_REPLAY_DETECTED
          : eligibility.ineligibility_reason === 'replay_continuity_revoked_or_expired'
          ? CONTINUITY_LINEAGE_DRIFT_CLASSES.STALE_LINEAGE_RESURRECTION
          : eligibility.ineligibility_reason === 'replay_revocation_cascade_detected'
          ? CONTINUITY_LINEAGE_DRIFT_CLASSES.REVOCATION_PROPAGATION_INCOMPLETE
          : CONTINUITY_LINEAGE_DRIFT_CLASSES.REPLAY_LINEAGE_MISMATCH
      driftObservations.push(
        Object.freeze({
          affected_continuity_id: continuityId,
          detail: `replay_id ${replayId} ineligible: ${eligibility.ineligibility_reason}`,
          drift_class: driftClass,
          observation_id: nextObsId(),
        }),
      )
    }
  }

  // Distributed convergence evaluation
  const convergence = evaluateContinuityLineageConvergence(views)

  // Determine overall reconciliation result
  let reconciliationResult: ContinuityLineageReconciliationOutcome

  const hasCycleOrDepth = driftObservations.some(
    (d) =>
      d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.ANCESTRY_CYCLE_DETECTED ||
      d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.ANCESTRY_DEPTH_EXCEEDED,
  )
  const hasStale = driftObservations.some(
    (d) =>
      d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.STALE_LINEAGE_RESURRECTION ||
      d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.FRESHNESS_BARRIER_VIOLATED,
  )
  const hasDivergence =
    convergence.convergence_result === CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_DIVERGED ||
    convergence.convergence_result === CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_COLLAPSED

  if (orphanedIds.length > 0) {
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_ORPHANED
  } else if (hasCycleOrDepth) {
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_COLLAPSED
  } else if (!revocationComplete) {
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_REVOKED
  } else if (hasDivergence) {
    driftObservations.push(
      Object.freeze({
        affected_continuity_id: null,
        detail: `distributed registry views diverged: ${convergence.converged_count} converged, ${convergence.diverged_count} diverged`,
        drift_class: CONTINUITY_LINEAGE_DRIFT_CLASSES.DISTRIBUTED_LINEAGE_DRIFT,
        observation_id: nextObsId(),
      }),
    )
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_DIVERGED
  } else if (hasStale) {
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_STALE
  } else {
    reconciliationResult = CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_RECONCILED
  }

  const frozenDrift = Object.freeze(driftObservations.map((d) => Object.freeze(d)))
  const frozenReplays = Object.freeze(replayEligibility.map((r) => Object.freeze(r)))
  const frozenOrphans = Object.freeze([...orphanedIds])

  const auditSurface = buildContinuityLineageAuditSurface({
    converged_count: convergence.converged_count,
    drift_count: frozenDrift.length,
    lineage_topology_hash: lineageTopologyHash,
    orphaned_ids: frozenOrphans,
    participant_count: views.length,
    reconciliation_id: reconciliationId,
    revocation_complete: revocationComplete,
  })

  return Object.freeze({
    artifact_type: 'DISTRIBUTED_CONTINUITY_LINEAGE_RECONCILIATION',
    audit_surface: Object.freeze(auditSurface),
    converged_count: convergence.converged_count,
    diverged_count: convergence.diverged_count,
    drift_observations: frozenDrift,
    evidence_only: true,
    lineage_topology_hash: lineageTopologyHash,
    orphaned_ids: frozenOrphans,
    participant_count: views.length,
    reconciliation_id: reconciliationId,
    reconciliation_result: reconciliationResult,
    replay_eligibility: frozenReplays,
    revocation_propagation_complete: revocationComplete,
  })
}
