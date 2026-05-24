import { canonicalize, sha256Hex } from './canonical.js'

export const CROSS_REGISTRY_RECONCILIATION_CLASSIFICATIONS = Object.freeze([
  'RECONCILED',
  'DIVERGED',
  'SPLIT_BRAIN',
  'STALE_REGISTRY',
  'REPLAY_DIVERGENCE',
  'REVOCATION_DIVERGENCE',
  'PARTIAL_VISIBILITY',
  'TOPOLOGY_DRIFT',
  'NULL',
] as const)

export interface CrossRegistryEntry {
  readonly object_id: string
  readonly parent_object_id?: string | null
  readonly lineage_hash: string
  readonly replay_hash: string
  readonly revocation_hash: string
  readonly topology_hash: string
  readonly observed_at: string
}

export interface CrossRegistryView {
  readonly registry_id: string
  readonly visibility_complete: boolean
  readonly registry_epoch: number
  readonly entries: readonly CrossRegistryEntry[]
}

export interface CrossRegistryReconciliationInput {
  readonly reconciliation_id: string
  readonly evidence_only: true
  readonly views: readonly CrossRegistryView[]
}

export interface CrossRegistryReconciliationResult {
  readonly artifact_type: 'CROSS_REGISTRY_LEGITIMACY_RECONCILIATION'
  readonly reconciliation_id: string
  readonly classification: (typeof CROSS_REGISTRY_RECONCILIATION_CLASSIFICATIONS)[number]
  readonly equivalent: boolean
  readonly deterministic_traversal: readonly string[]
  readonly registry_hashes: Readonly<Record<string, string>>
  readonly lineage_hash: string
  readonly replay_hash: string
  readonly revocation_hash: string
  readonly topology_hash: string
  readonly drift_classes: readonly string[]
  readonly evidence_only: true
  readonly creates_authority: false
}

function sortEntries(entries: readonly CrossRegistryEntry[]): readonly CrossRegistryEntry[] {
  return entries.slice().sort((a, b) => {
    const id = String(a.object_id || '').localeCompare(String(b.object_id || ''))
    if (id !== 0) return id
    return String(a.lineage_hash || '').localeCompare(String(b.lineage_hash || ''))
  })
}

function buildRegistryHash(view: CrossRegistryView): string {
  const normalizedEntries = sortEntries(view.entries || []).map((entry) => ({
    lineage_hash: String(entry.lineage_hash || ''),
    object_id: String(entry.object_id || ''),
    observed_at: String(entry.observed_at || ''),
    parent_object_id: entry.parent_object_id == null ? null : String(entry.parent_object_id),
    replay_hash: String(entry.replay_hash || ''),
    revocation_hash: String(entry.revocation_hash || ''),
    topology_hash: String(entry.topology_hash || ''),
  }))
  return sha256Hex(canonicalize({
    entries: normalizedEntries,
    registry_epoch: Number.isFinite(view.registry_epoch) ? view.registry_epoch : -1,
    visibility_complete: Boolean(view.visibility_complete),
  }))
}

function lineageClosureOk(entries: readonly CrossRegistryEntry[]): boolean {
  const ids = new Set(entries.map((e) => String(e.object_id || '')))
  for (const entry of entries) {
    const parentId = String(entry.parent_object_id || '')
    if (parentId && !ids.has(parentId)) return false
  }
  return true
}

export function reconcileCrossRegistryLegitimacy(
  input: CrossRegistryReconciliationInput,
): CrossRegistryReconciliationResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.views) || input.views.length === 0) {
    return Object.freeze({
      artifact_type: 'CROSS_REGISTRY_LEGITIMACY_RECONCILIATION',
      reconciliation_id: String(input?.reconciliation_id || ''),
      classification: 'NULL',
      equivalent: false,
      deterministic_traversal: Object.freeze([]),
      registry_hashes: Object.freeze({}),
      lineage_hash: '',
      replay_hash: '',
      revocation_hash: '',
      topology_hash: '',
      drift_classes: Object.freeze(['fail_closed_null']),
      evidence_only: true,
      creates_authority: false,
    })
  }

  const orderedViews = input.views.slice().sort((a, b) => String(a.registry_id || '').localeCompare(String(b.registry_id || '')))
  const deterministicTraversal = orderedViews.map((v) => String(v.registry_id || ''))
  const registryHashes: Record<string, string> = {}
  const drift = new Set<string>()

  for (const view of orderedViews) {
    registryHashes[String(view.registry_id || '')] = buildRegistryHash(view)
    if (!view.visibility_complete) drift.add('partial_visibility')
    if (!lineageClosureOk(view.entries || [])) drift.add('stale_lineage')
  }

  const hashSet = new Set(Object.values(registryHashes))
  if (hashSet.size > 1) drift.add('registry_hash_mismatch')

  const lineageSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.parent_object_id, e.lineage_hash])))))
  const replaySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.replay_hash])))))
  const revocationSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.revocation_hash])))))
  const topologySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.topology_hash])))))

  if (lineageSet.size > 1) drift.add('lineage_divergence')
  if (replaySet.size > 1) drift.add('replay_divergence')
  if (revocationSet.size > 1) drift.add('revocation_divergence')
  if (topologySet.size > 1) drift.add('topology_drift')

  const epochs = orderedViews.map((v) => Number(v.registry_epoch || 0))
  const epochSpread = Math.max(...epochs) - Math.min(...epochs)
  if (epochSpread > 0) drift.add('stale_registry')

  let classification: CrossRegistryReconciliationResult['classification'] = 'RECONCILED'
  if (drift.has('partial_visibility')) classification = 'PARTIAL_VISIBILITY'
  else if (drift.has('stale_registry') || drift.has('stale_lineage')) classification = 'STALE_REGISTRY'
  else if (drift.has('topology_drift')) classification = 'TOPOLOGY_DRIFT'
  else if (drift.has('replay_divergence')) classification = 'REPLAY_DIVERGENCE'
  else if (drift.has('revocation_divergence')) classification = 'REVOCATION_DIVERGENCE'
  else if (drift.has('registry_hash_mismatch') && drift.has('lineage_divergence')) classification = 'SPLIT_BRAIN'
  else if (drift.size > 0) classification = 'DIVERGED'

  const equivalent = classification === 'RECONCILED'
  const driftClasses = Array.from(drift).sort((a, b) => a.localeCompare(b))

  return Object.freeze({
    artifact_type: 'CROSS_REGISTRY_LEGITIMACY_RECONCILIATION',
    reconciliation_id: String(input.reconciliation_id || ''),
    classification,
    equivalent,
    deterministic_traversal: Object.freeze(deterministicTraversal),
    registry_hashes: Object.freeze({ ...registryHashes }),
    lineage_hash: Array.from(lineageSet).sort()[0] || '',
    replay_hash: Array.from(replaySet).sort()[0] || '',
    revocation_hash: Array.from(revocationSet).sort()[0] || '',
    topology_hash: Array.from(topologySet).sort()[0] || '',
    drift_classes: Object.freeze(driftClasses),
    evidence_only: true,
    creates_authority: false,
  })
}
