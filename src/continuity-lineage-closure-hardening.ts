/**
 * src/continuity-lineage-closure-hardening.ts
 * Issue #1156 — Distributed Continuity Lineage Closure Hardening
 *
 * Recursive closure verification for distributed continuity lineage across
 * legitimacy registries, including under partial visibility conditions.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Closure invariant:
 *   All lineage-dependent registries must remain recursively reconcilable
 *   across all reconciliation boundaries, including under partial visibility.
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic lineage validation, no replay bypass paths,
 * no legitimacy semantic weakening.
 *
 * All lineage hashing and equivalence validation routes through src/canonical.js.
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Closure result constants ──────────────────────────────────────────────────

export const CONTINUITY_CLOSURE_RESULTS = {
  CLOSURE_VERIFIED: 'CLOSURE_VERIFIED',
  CLOSURE_BROKEN_ORPHAN: 'CLOSURE_BROKEN_ORPHAN',
  CLOSURE_BROKEN_DETACHED: 'CLOSURE_BROKEN_DETACHED',
  CLOSURE_BROKEN_CYCLE: 'CLOSURE_BROKEN_CYCLE',
  CLOSURE_BROKEN_DEPTH: 'CLOSURE_BROKEN_DEPTH',
  CLOSURE_PARTIAL_VISIBILITY: 'CLOSURE_PARTIAL_VISIBILITY',
  NULL: 'NULL',
} as const

export type ContinuityClosureResult =
  (typeof CONTINUITY_CLOSURE_RESULTS)[keyof typeof CONTINUITY_CLOSURE_RESULTS]

// ── Ancestry failure taxonomy ─────────────────────────────────────────────────

export const ANCESTRY_FAILURE_REASONS = {
  CYCLE_DETECTED: 'cycle_detected',
  DEPTH_EXCEEDED: 'depth_exceeded',
  DETACHED_LINEAGE: 'detached_lineage',
  REVOKED_ANCESTOR: 'revoked_ancestor',
  EXPIRED_ANCESTOR: 'expired_ancestor',
} as const

export type AncestryFailureReason =
  (typeof ANCESTRY_FAILURE_REASONS)[keyof typeof ANCESTRY_FAILURE_REASONS]

// ── Closure drift taxonomy ────────────────────────────────────────────────────

export const CLOSURE_DRIFT_CLASSES = {
  DETACHED_CONTINUITY: 'detached_continuity',
  ORPHANED_SUBTREE: 'orphaned_subtree',
  ANCESTRY_CYCLE: 'ancestry_cycle',
  ANCESTRY_DEPTH_EXCEEDED: 'ancestry_depth_exceeded',
  FRESHNESS_CHAIN_VIOLATION: 'freshness_chain_violation',
  LINEAGE_EQUIVALENCE_DRIFT: 'lineage_equivalence_drift',
  PARTIAL_VISIBILITY_COLLAPSE: 'partial_visibility_collapse',
  REVOKED_ANCESTOR_PROPAGATION: 'revoked_ancestor_propagation',
  RECONSTRUCTION_FAILURE: 'reconstruction_failure',
  CROSS_REGISTRY_HASH_DIVERGENCE: 'cross_registry_hash_divergence',
} as const

export type ClosureDriftClass =
  (typeof CLOSURE_DRIFT_CLASSES)[keyof typeof CLOSURE_DRIFT_CLASSES]

// ── Repair classification ─────────────────────────────────────────────────────

export const REPAIR_CLASSES = {
  FETCH_MISSING_ANCESTOR: 'fetch_missing_ancestor',
  LINEAGE_PERMANENTLY_INVALID: 'lineage_permanently_invalid',
  REDUCE_ANCESTRY_DEPTH: 'reduce_ancestry_depth',
  REVOKE_EXPIRED_CHAIN: 'revoke_expired_chain',
  RECONCILE_REGISTRY_VIEWS: 'reconcile_registry_views',
} as const

export type RepairClass = (typeof REPAIR_CLASSES)[keyof typeof REPAIR_CLASSES]

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClosureEntry {
  readonly continuity_id: string
  readonly session_id: string
  readonly identity_id?: string | null
  readonly parent_continuity_id?: string | null
  readonly continuity_hash: string
  readonly status: string
  readonly expires_at?: string | null
  readonly revoked_at?: string | null
}

export interface ClosureRegistryView {
  readonly node_id: string
  readonly registry_epoch: string
  readonly lineage_root_id: string
  readonly entries: readonly ClosureEntry[]
  readonly registry_hash: string
}

export interface AncestryTraversalResult {
  readonly traversal_id: string
  readonly start_continuity_id: string
  readonly ok: boolean
  readonly failure_reason: AncestryFailureReason | null
  readonly depth: number
  readonly root_continuity_id: string | null
  readonly ancestry_chain: readonly string[]
  readonly ancestry_hash: string
}

export interface CollapsedSubtree {
  readonly subtree_id: string
  readonly orphan_root_id: string
  readonly missing_parent_id: string
  readonly affected_ids: readonly string[]
  readonly subtree_hash: string
}

export interface LineageEquivalenceAudit {
  readonly audit_id: string
  readonly equivalent: boolean
  readonly total_entries: number
  readonly reference_topology_hash: string | null
  readonly divergent_entry_ids: readonly string[]
  readonly divergent_count: number
}

export interface LineageRepairDiagnostic {
  readonly diagnostic_id: string
  readonly affected_continuity_id: string
  readonly repair_class: RepairClass
  readonly repairable: boolean
  readonly detail: string
}

export interface LineageReconstructionValidation {
  readonly validation_id: string
  readonly continuity_id: string
  readonly reconstructable: boolean
  readonly reconstruction_hash: string | null
  readonly expected_hash: string
  readonly failure_reason: string | null
}

export interface LineageDriftClassification {
  readonly classification_id: string
  readonly drift_class: ClosureDriftClass
  readonly affected_continuity_id: string | null
  readonly severity: 'fatal' | 'degraded' | 'observation'
  readonly detail: string
}

export interface ContinuityLineageClosureHardeningInput {
  readonly closure_id: string
  readonly evidence_only: true
  readonly registry_views: readonly ClosureRegistryView[]
  readonly freshness_horizon_ms?: number | null
  readonly max_ancestry_depth?: number | null
}

export interface ContinuityLineageClosureVerification {
  readonly artifact_type: 'CONTINUITY_LINEAGE_CLOSURE_HARDENING'
  readonly evidence_only: true
  readonly closure_id: string
  readonly closure_result: ContinuityClosureResult
  readonly lineage_topology_hash: string
  readonly entry_count: number
  readonly traversal_results: readonly AncestryTraversalResult[]
  readonly detached_ids: readonly string[]
  readonly collapsed_subtrees: readonly CollapsedSubtree[]
  readonly equivalence_audit: LineageEquivalenceAudit
  readonly repair_diagnostics: readonly LineageRepairDiagnostic[]
  readonly reconstruction_validations: readonly LineageReconstructionValidation[]
  readonly drift_classifications: readonly LineageDriftClassification[]
}

// ── Internal constants ────────────────────────────────────────────────────────

const SYSTEM_MAX_ANCESTRY_DEPTH = 32
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

function isRevokedOrExpired(entry: ClosureEntry): boolean {
  if (!isActiveStatus(entry.status) || Boolean(entry.revoked_at)) return true
  if (entry.expires_at) {
    const ms = Date.parse(String(entry.expires_at))
    if (Number.isFinite(ms) && ms <= Date.now()) return true
  }
  return false
}

function isExpiredOnly(entry: ClosureEntry): boolean {
  if (!isActiveStatus(entry.status) || Boolean(entry.revoked_at)) return false
  if (entry.expires_at) {
    const ms = Date.parse(String(entry.expires_at))
    if (Number.isFinite(ms) && ms <= Date.now()) return true
  }
  return false
}

function collectSubtree(
  startId: string,
  childrenMap: Map<string, string[]>,
): string[] {
  const result: string[] = []
  const queue = [startId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    result.push(id)
    const kids = childrenMap.get(id) ?? []
    queue.push(...kids)
  }
  return result
}

// ── Canonical closure topology hash (routes through canonical.js) ─────────────

export function computeClosureTopologyHash(entries: readonly ClosureEntry[]): string {
  const sorted = entries
    .slice()
    .sort((a, b) => String(a.continuity_id).localeCompare(String(b.continuity_id)))
    .map((e) => ({
      continuity_hash: String(e.continuity_hash || ''),
      continuity_id: String(e.continuity_id || ''),
      identity_id: e.identity_id != null ? String(e.identity_id) : null,
      parent_continuity_id:
        e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
      session_id: String(e.session_id || ''),
      status: String(e.status || ''),
    }))
  return sha256Hex(canonicalize(sorted))
}

// ── Recursive Continuity Ancestry Traversal ───────────────────────────────────

export function traverseContinuityAncestry(
  startId: string,
  index: Map<string, ClosureEntry>,
  maxDepth: number,
): AncestryTraversalResult {
  const visited = new Set<string>()
  const chain: string[] = []
  let current: string | null = startId

  while (current) {
    if (visited.has(current)) {
      const frozenChain = Object.freeze([...chain])
      const ancestryHash = sha256Hex(canonicalize({ chain: [...chain], failure: 'cycle_detected' }))
      return Object.freeze({
        traversal_id: sha256Hex(canonicalize({ outcome: 'cycle', start: startId, chain: [...chain] })),
        start_continuity_id: startId,
        ok: false,
        failure_reason: ANCESTRY_FAILURE_REASONS.CYCLE_DETECTED,
        depth: chain.length,
        root_continuity_id: null,
        ancestry_chain: frozenChain,
        ancestry_hash: ancestryHash,
      })
    }

    visited.add(current)
    chain.push(current)

    if (chain.length > maxDepth) {
      const frozenChain = Object.freeze([...chain])
      const ancestryHash = sha256Hex(
        canonicalize({ chain: [...chain], failure: 'depth_exceeded' }),
      )
      return Object.freeze({
        traversal_id: sha256Hex(
          canonicalize({ outcome: 'depth', start: startId, chain: [...chain] }),
        ),
        start_continuity_id: startId,
        ok: false,
        failure_reason: ANCESTRY_FAILURE_REASONS.DEPTH_EXCEEDED,
        depth: chain.length,
        root_continuity_id: null,
        ancestry_chain: frozenChain,
        ancestry_hash: ancestryHash,
      })
    }

    const node = index.get(current)
    if (!node) {
      if (chain.length > 1) {
        const frozenChain = Object.freeze([...chain])
        const ancestryHash = sha256Hex(
          canonicalize({ chain: [...chain], failure: 'detached_lineage' }),
        )
        return Object.freeze({
          traversal_id: sha256Hex(
            canonicalize({ outcome: 'detached', start: startId, chain: [...chain] }),
          ),
          start_continuity_id: startId,
          ok: false,
          failure_reason: ANCESTRY_FAILURE_REASONS.DETACHED_LINEAGE,
          depth: chain.length,
          root_continuity_id: null,
          ancestry_chain: frozenChain,
          ancestry_hash: ancestryHash,
        })
      }
      break
    }

    if (isRevokedOrExpired(node)) {
      const failureReason = isExpiredOnly(node)
        ? ANCESTRY_FAILURE_REASONS.EXPIRED_ANCESTOR
        : ANCESTRY_FAILURE_REASONS.REVOKED_ANCESTOR
      const frozenChain = Object.freeze([...chain])
      const ancestryHash = sha256Hex(
        canonicalize({ chain: [...chain], failure: failureReason }),
      )
      return Object.freeze({
        traversal_id: sha256Hex(
          canonicalize({ outcome: failureReason, start: startId, chain: [...chain] }),
        ),
        start_continuity_id: startId,
        ok: false,
        failure_reason: failureReason,
        depth: chain.length,
        root_continuity_id: null,
        ancestry_chain: frozenChain,
        ancestry_hash: ancestryHash,
      })
    }

    const parentId = String(node.parent_continuity_id || '').trim()
    current = parentId || null
  }

  const rootId = chain.length > 0 ? chain[chain.length - 1] : null
  const frozenChain = Object.freeze([...chain])
  const ancestryHash = sha256Hex(canonicalize({ chain: [...chain], ok: true }))
  return Object.freeze({
    traversal_id: sha256Hex(canonicalize({ outcome: 'ok', start: startId, chain: [...chain] })),
    start_continuity_id: startId,
    ok: true,
    failure_reason: null,
    depth: chain.length,
    root_continuity_id: rootId,
    ancestry_chain: frozenChain,
    ancestry_hash: ancestryHash,
  })
}

// ── Detached Continuity Detection ─────────────────────────────────────────────

export function detectDetachedContinuities(
  traversalResults: readonly AncestryTraversalResult[],
): string[] {
  return traversalResults
    .filter((r) => !r.ok && r.failure_reason === ANCESTRY_FAILURE_REASONS.DETACHED_LINEAGE)
    .map((r) => r.start_continuity_id)
}

// ── Lineage Freshness Barrier Enforcement ─────────────────────────────────────

export function enforceLineageFreshnessBarrier(
  chain: readonly string[],
  index: Map<string, ClosureEntry>,
  freshnessHorizonMs: number,
): { compliant: boolean; stale_ids: readonly string[] } {
  const now = Date.now()
  const staleIds: string[] = []
  for (const id of chain) {
    const node = index.get(id)
    if (!node || !node.expires_at) continue
    const expiresMs = Date.parse(String(node.expires_at))
    if (Number.isFinite(expiresMs) && expiresMs > 0 && expiresMs - now < freshnessHorizonMs) {
      staleIds.push(id)
    }
  }
  return { compliant: staleIds.length === 0, stale_ids: Object.freeze(staleIds) }
}

// ── Orphan Lineage Collapse Enforcement ───────────────────────────────────────

export function collapseOrphanedSubtrees(
  entries: readonly ClosureEntry[],
  index: Map<string, ClosureEntry>,
): CollapsedSubtree[] {
  const childrenMap = new Map<string, string[]>()
  for (const entry of entries) {
    const parentId = String(entry.parent_continuity_id || '').trim()
    if (parentId) {
      const kids = childrenMap.get(parentId) ?? []
      kids.push(String(entry.continuity_id))
      childrenMap.set(parentId, kids)
    }
  }

  const result: CollapsedSubtree[] = []
  for (const entry of entries) {
    const id = String(entry.continuity_id || '')
    const parentId = String(entry.parent_continuity_id || '').trim()
    if (!parentId || index.has(parentId)) continue

    const affected = collectSubtree(id, childrenMap)
    const subtreePayload = {
      affected_ids: [...affected].sort(),
      missing_parent_id: parentId,
      orphan_root_id: id,
    }
    const subtreeHash = sha256Hex(canonicalize(subtreePayload))
    result.push(
      Object.freeze({
        subtree_id: sha256Hex(canonicalize({ subtree: subtreePayload })),
        orphan_root_id: id,
        missing_parent_id: parentId,
        affected_ids: Object.freeze([...affected].sort()),
        subtree_hash: subtreeHash,
      }),
    )
  }
  return result
}

// ── Recursive Lineage Equivalence Auditing ────────────────────────────────────

export function auditLineageEquivalence(
  views: readonly ClosureRegistryView[],
): LineageEquivalenceAudit {
  const hashSetByEntryId = new Map<string, Set<string>>()
  for (const view of views) {
    for (const entry of view.entries) {
      const id = String(entry.continuity_id || '')
      if (!id) continue
      const hashes = hashSetByEntryId.get(id) ?? new Set<string>()
      hashes.add(String(entry.continuity_hash || ''))
      hashSetByEntryId.set(id, hashes)
    }
  }

  const divergentIds: string[] = []
  for (const [id, hashes] of hashSetByEntryId.entries()) {
    if (hashes.size > 1) divergentIds.push(id)
  }

  const equivalent = divergentIds.length === 0
  const referenceTopologyHash =
    views.length > 0 ? String(views[0].registry_hash || '') : null

  const auditPayload = {
    divergent_count: divergentIds.length,
    divergent_entry_ids: [...divergentIds].sort(),
    equivalent,
    reference_topology_hash: referenceTopologyHash,
    total_entries: hashSetByEntryId.size,
  }

  return Object.freeze({
    audit_id: sha256Hex(canonicalize(auditPayload)),
    equivalent,
    total_entries: hashSetByEntryId.size,
    reference_topology_hash: referenceTopologyHash,
    divergent_entry_ids: Object.freeze([...divergentIds].sort()),
    divergent_count: divergentIds.length,
  })
}

// ── Distributed Lineage Repair Diagnostics ────────────────────────────────────

export function computeLineageRepairDiagnostics(
  traversalResults: readonly AncestryTraversalResult[],
  collapsedSubtrees: readonly CollapsedSubtree[],
): LineageRepairDiagnostic[] {
  const diagnostics: LineageRepairDiagnostic[] = []
  let diagIndex = 0

  for (const result of traversalResults) {
    if (result.ok) continue
    const affectedId = result.start_continuity_id

    let repairClass: RepairClass
    let repairable: boolean
    let detail: string

    switch (result.failure_reason) {
      case ANCESTRY_FAILURE_REASONS.DETACHED_LINEAGE:
        repairClass = REPAIR_CLASSES.FETCH_MISSING_ANCESTOR
        repairable = true
        detail = `continuity_id ${affectedId} has a detached ancestry chain at depth ${result.depth}; fetch missing ancestor from other registry views`
        break
      case ANCESTRY_FAILURE_REASONS.CYCLE_DETECTED:
        repairClass = REPAIR_CLASSES.LINEAGE_PERMANENTLY_INVALID
        repairable = false
        detail = `continuity_id ${affectedId} has a cycle in its ancestry chain at depth ${result.depth}; lineage is permanently invalid`
        break
      case ANCESTRY_FAILURE_REASONS.DEPTH_EXCEEDED:
        repairClass = REPAIR_CLASSES.REDUCE_ANCESTRY_DEPTH
        repairable = true
        detail = `continuity_id ${affectedId} ancestry depth ${result.depth} exceeds configured maximum; reduce ancestry depth or increase the depth limit`
        break
      case ANCESTRY_FAILURE_REASONS.EXPIRED_ANCESTOR:
        repairClass = REPAIR_CLASSES.REVOKE_EXPIRED_CHAIN
        repairable = false
        detail = `continuity_id ${affectedId} has an expired ancestor at depth ${result.depth}; lineage requires a fresh continuity chain`
        break
      case ANCESTRY_FAILURE_REASONS.REVOKED_ANCESTOR:
        repairClass = REPAIR_CLASSES.LINEAGE_PERMANENTLY_INVALID
        repairable = false
        detail = `continuity_id ${affectedId} has a revoked ancestor at depth ${result.depth}; lineage is permanently invalid`
        break
      default:
        repairClass = REPAIR_CLASSES.LINEAGE_PERMANENTLY_INVALID
        repairable = false
        detail = `continuity_id ${affectedId} has an unresolvable ancestry failure`
    }

    const diagPayload = {
      affected_continuity_id: affectedId,
      index: diagIndex,
      repair_class: repairClass,
    }
    diagnostics.push(
      Object.freeze({
        diagnostic_id: sha256Hex(canonicalize(diagPayload)),
        affected_continuity_id: affectedId,
        repair_class: repairClass,
        repairable,
        detail,
      }),
    )
    diagIndex++
  }

  for (const subtree of collapsedSubtrees) {
    const diagPayload = {
      index: diagIndex,
      repair_class: REPAIR_CLASSES.FETCH_MISSING_ANCESTOR,
      subtree_id: subtree.subtree_id,
    }
    diagnostics.push(
      Object.freeze({
        diagnostic_id: sha256Hex(canonicalize(diagPayload)),
        affected_continuity_id: subtree.orphan_root_id,
        repair_class: REPAIR_CLASSES.FETCH_MISSING_ANCESTOR,
        repairable: true,
        detail: `orphaned subtree rooted at ${subtree.orphan_root_id} references missing parent ${subtree.missing_parent_id}; affects ${subtree.affected_ids.length} entries`,
      }),
    )
    diagIndex++
  }

  return diagnostics
}

// ── Lineage Reconstruction Validation Surfaces ────────────────────────────────

export function validateLineageReconstructability(
  entries: readonly ClosureEntry[],
  traversalResults: readonly AncestryTraversalResult[],
): LineageReconstructionValidation[] {
  const traversalByStart = new Map<string, AncestryTraversalResult>()
  for (const result of traversalResults) {
    traversalByStart.set(result.start_continuity_id, result)
  }

  const validations: LineageReconstructionValidation[] = []
  let valIndex = 0

  for (const entry of entries) {
    const id = String(entry.continuity_id || '')
    const expectedHash = String(entry.continuity_hash || '')
    const traversal = traversalByStart.get(id)
    const validationPayload = { entry_id: id, val_index: valIndex }
    const validationId = sha256Hex(canonicalize(validationPayload))

    if (!traversal || !traversal.ok) {
      validations.push(
        Object.freeze({
          validation_id: validationId,
          continuity_id: id,
          reconstructable: false,
          reconstruction_hash: null,
          expected_hash: expectedHash,
          failure_reason: traversal?.failure_reason ?? 'no_traversal_result',
        }),
      )
      valIndex++
      continue
    }

    const reconstructionHash = sha256Hex(
      canonicalize({
        ancestry_chain: [...traversal.ancestry_chain],
        session_id: String(entry.session_id || ''),
        start_continuity_id: id,
      }),
    )

    validations.push(
      Object.freeze({
        validation_id: validationId,
        continuity_id: id,
        reconstructable: true,
        reconstruction_hash: reconstructionHash,
        expected_hash: expectedHash,
        failure_reason: null,
      }),
    )
    valIndex++
  }

  return validations
}

// ── Continuity Lineage Drift Classification ───────────────────────────────────

export function classifyLineageDrift(
  traversalResults: readonly AncestryTraversalResult[],
  collapsedSubtrees: readonly CollapsedSubtree[],
  equivalenceAudit: LineageEquivalenceAudit,
  freshnessViolationIds: readonly string[],
  closureId: string,
): LineageDriftClassification[] {
  const classifications: LineageDriftClassification[] = []
  let classIndex = 0

  const nextClassId = () => {
    const id = sha256Hex(canonicalize({ class_index: classIndex, closure_id: closureId }))
    classIndex++
    return id
  }

  for (const result of traversalResults) {
    if (result.ok) continue

    let driftClass: ClosureDriftClass
    let severity: 'fatal' | 'degraded' | 'observation'

    switch (result.failure_reason) {
      case ANCESTRY_FAILURE_REASONS.CYCLE_DETECTED:
        driftClass = CLOSURE_DRIFT_CLASSES.ANCESTRY_CYCLE
        severity = 'fatal'
        break
      case ANCESTRY_FAILURE_REASONS.DEPTH_EXCEEDED:
        driftClass = CLOSURE_DRIFT_CLASSES.ANCESTRY_DEPTH_EXCEEDED
        severity = 'fatal'
        break
      case ANCESTRY_FAILURE_REASONS.DETACHED_LINEAGE:
        driftClass = CLOSURE_DRIFT_CLASSES.DETACHED_CONTINUITY
        severity = 'fatal'
        break
      case ANCESTRY_FAILURE_REASONS.REVOKED_ANCESTOR:
        driftClass = CLOSURE_DRIFT_CLASSES.REVOKED_ANCESTOR_PROPAGATION
        severity = 'fatal'
        break
      case ANCESTRY_FAILURE_REASONS.EXPIRED_ANCESTOR:
        driftClass = CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION
        severity = 'degraded'
        break
      default:
        driftClass = CLOSURE_DRIFT_CLASSES.DETACHED_CONTINUITY
        severity = 'fatal'
    }

    classifications.push(
      Object.freeze({
        classification_id: nextClassId(),
        drift_class: driftClass,
        affected_continuity_id: result.start_continuity_id,
        severity,
        detail: `ancestry traversal failed: ${result.failure_reason} at depth ${result.depth} for continuity_id ${result.start_continuity_id}`,
      }),
    )
  }

  for (const subtree of collapsedSubtrees) {
    classifications.push(
      Object.freeze({
        classification_id: nextClassId(),
        drift_class: CLOSURE_DRIFT_CLASSES.ORPHANED_SUBTREE,
        affected_continuity_id: subtree.orphan_root_id,
        severity: 'fatal' as const,
        detail: `orphaned subtree: ${subtree.affected_ids.length} entries cannot reach a valid root (missing parent ${subtree.missing_parent_id})`,
      }),
    )
  }

  if (!equivalenceAudit.equivalent) {
    classifications.push(
      Object.freeze({
        classification_id: nextClassId(),
        drift_class: CLOSURE_DRIFT_CLASSES.CROSS_REGISTRY_HASH_DIVERGENCE,
        affected_continuity_id: null,
        severity: 'fatal' as const,
        detail: `${equivalenceAudit.divergent_count} continuity entries have divergent hashes across registry views`,
      }),
    )
  }

  const uniqueFreshnessIds = [...new Set(freshnessViolationIds)]
  for (const id of uniqueFreshnessIds) {
    classifications.push(
      Object.freeze({
        classification_id: nextClassId(),
        drift_class: CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
        affected_continuity_id: id,
        severity: 'degraded' as const,
        detail: `continuity_id ${id} violates the freshness barrier in its ancestry chain`,
      }),
    )
  }

  return classifications
}

// ── Null closure builder ──────────────────────────────────────────────────────

function buildNullClosure(closureId: string): ContinuityLineageClosureVerification {
  const nullHash = sha256Hex(canonicalize({ closure_id: closureId, null: true }))
  const auditId = sha256Hex(canonicalize({ closure_id: closureId, null_audit: true }))
  return Object.freeze({
    artifact_type: 'CONTINUITY_LINEAGE_CLOSURE_HARDENING',
    evidence_only: true,
    closure_id: closureId,
    closure_result: CONTINUITY_CLOSURE_RESULTS.NULL,
    lineage_topology_hash: nullHash,
    entry_count: 0,
    traversal_results: Object.freeze([]),
    detached_ids: Object.freeze([]),
    collapsed_subtrees: Object.freeze([]),
    equivalence_audit: Object.freeze({
      audit_id: auditId,
      equivalent: false,
      total_entries: 0,
      reference_topology_hash: null,
      divergent_entry_ids: Object.freeze([]),
      divergent_count: 0,
    }),
    repair_diagnostics: Object.freeze([]),
    reconstruction_validations: Object.freeze([]),
    drift_classifications: Object.freeze([]),
  })
}

// ── Main closure verification function ───────────────────────────────────────

export function verifyDistributedContinuityLineageClosure(
  input: unknown,
): ContinuityLineageClosureVerification {
  const safeInput = safeObj(input)

  const rawClosureId = safeInput.closure_id
  if (typeof rawClosureId !== 'string' || !String(rawClosureId).trim()) {
    return buildNullClosure('unknown')
  }
  const closureId = rawClosureId.trim()

  if (safeInput.evidence_only !== true) return buildNullClosure(closureId)
  if (hasForbiddenField(safeInput)) return buildNullClosure(closureId)

  const rawViews = Array.isArray(safeInput.registry_views) ? safeInput.registry_views : []
  if (!rawViews.length) return buildNullClosure(closureId)

  const views: ClosureRegistryView[] = []
  for (const rv of rawViews) {
    const v = safeObj(rv)
    if (hasForbiddenField(v)) return buildNullClosure(closureId)
    if (!String(v.node_id || '').trim()) continue
    if (!String(v.registry_epoch || '').trim()) continue
    if (!String(v.lineage_root_id || '').trim()) continue
    if (!isValidSha256(v.registry_hash)) continue

    const rawEntries = Array.isArray(v.entries) ? v.entries : []
    const entries: ClosureEntry[] = []
    for (const re of rawEntries) {
      const e = safeObj(re)
      if (hasForbiddenField(e)) return buildNullClosure(closureId)
      const id = String(e.continuity_id || '').trim()
      if (!id) continue
      entries.push({
        continuity_hash: String(e.continuity_hash || ''),
        continuity_id: id,
        expires_at: e.expires_at != null ? String(e.expires_at) : null,
        identity_id: e.identity_id != null ? String(e.identity_id) : null,
        parent_continuity_id:
          e.parent_continuity_id != null ? String(e.parent_continuity_id) : null,
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

  if (!views.length) return buildNullClosure(closureId)

  const allEntriesMap = new Map<string, ClosureEntry>()
  for (const view of views) {
    for (const entry of view.entries) {
      allEntriesMap.set(entry.continuity_id, entry)
    }
  }
  const allEntries = Array.from(allEntriesMap.values())
  if (!allEntries.length) return buildNullClosure(closureId)

  const rawMaxDepth = safeInput.max_ancestry_depth
  const maxDepth =
    typeof rawMaxDepth === 'number' &&
    Number.isFinite(rawMaxDepth) &&
    rawMaxDepth > 0
      ? Math.floor(rawMaxDepth)
      : SYSTEM_MAX_ANCESTRY_DEPTH

  const lineageTopologyHash = computeClosureTopologyHash(allEntries)

  const traversalResults = allEntries.map((e) =>
    traverseContinuityAncestry(e.continuity_id, allEntriesMap, maxDepth),
  )

  const detachedIds = detectDetachedContinuities(traversalResults)
  const collapsedSubtrees = collapseOrphanedSubtrees(allEntries, allEntriesMap)
  const equivalenceAudit = auditLineageEquivalence(views)

  const rawFreshnessHorizon = safeInput.freshness_horizon_ms
  const freshnessHorizonMs =
    typeof rawFreshnessHorizon === 'number' &&
    Number.isFinite(rawFreshnessHorizon) &&
    rawFreshnessHorizon > 0
      ? rawFreshnessHorizon
      : null

  const freshnessViolationSet = new Set<string>()
  if (freshnessHorizonMs !== null) {
    for (const traversal of traversalResults) {
      if (!traversal.ok) continue
      const { stale_ids } = enforceLineageFreshnessBarrier(
        traversal.ancestry_chain,
        allEntriesMap,
        freshnessHorizonMs,
      )
      for (const id of stale_ids) freshnessViolationSet.add(id)
    }
  }
  const freshnessViolationIds = [...freshnessViolationSet]

  const repairDiagnostics = computeLineageRepairDiagnostics(traversalResults, collapsedSubtrees)
  const reconstructionValidations = validateLineageReconstructability(allEntries, traversalResults)
  const driftClassifications = classifyLineageDrift(
    traversalResults,
    collapsedSubtrees,
    equivalenceAudit,
    freshnessViolationIds,
    closureId,
  )

  const hasCycle = traversalResults.some(
    (r) => r.failure_reason === ANCESTRY_FAILURE_REASONS.CYCLE_DETECTED,
  )
  const hasDepthExceeded = traversalResults.some(
    (r) => r.failure_reason === ANCESTRY_FAILURE_REASONS.DEPTH_EXCEEDED,
  )
  const hasDetached = detachedIds.length > 0
  const hasOrphans = collapsedSubtrees.length > 0

  let closureResult: ContinuityClosureResult
  if (hasCycle) {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_CYCLE
  } else if (hasDepthExceeded) {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DEPTH
  } else if (hasDetached) {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DETACHED
  } else if (hasOrphans) {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_ORPHAN
  } else if (!equivalenceAudit.equivalent && views.length > 1) {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_PARTIAL_VISIBILITY
  } else {
    closureResult = CONTINUITY_CLOSURE_RESULTS.CLOSURE_VERIFIED
  }

  return Object.freeze({
    artifact_type: 'CONTINUITY_LINEAGE_CLOSURE_HARDENING',
    evidence_only: true,
    closure_id: closureId,
    closure_result: closureResult,
    lineage_topology_hash: lineageTopologyHash,
    entry_count: allEntries.length,
    traversal_results: Object.freeze(traversalResults.map((r) => Object.freeze(r))),
    detached_ids: Object.freeze([...detachedIds]),
    collapsed_subtrees: Object.freeze(collapsedSubtrees.map((s) => Object.freeze(s))),
    equivalence_audit: Object.freeze(equivalenceAudit),
    repair_diagnostics: Object.freeze(repairDiagnostics.map((d) => Object.freeze(d))),
    reconstruction_validations: Object.freeze(
      reconstructionValidations.map((v) => Object.freeze(v)),
    ),
    drift_classifications: Object.freeze(driftClassifications.map((c) => Object.freeze(c))),
  })
}
