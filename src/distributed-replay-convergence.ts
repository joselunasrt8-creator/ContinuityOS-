import { canonicalize, sha256Hex } from './canonical.js'

export const DISTRIBUTED_REPLAY_CONVERGENCE_CLASSIFICATIONS = Object.freeze([
  'REPLAY_CONVERGED',
  'REPLAY_DIVERGED',
  'REPLAY_RESURRECTION',
  'STALE_REPLAY',
  'REPLAY_PARTIAL_VISIBILITY',
  'REPLAY_TOPOLOGY_DRIFT',
  'REPLAY_REGISTRY_MISMATCH',
  'NULL',
] as const)

export interface DistributedReplayEntry {
  readonly object_id: string
  readonly parent_object_id?: string | null
  readonly lineage_hash: string
  readonly replay_hash: string
  readonly revocation_hash: string
  readonly topology_hash: string
  readonly observed_at: string
}

export interface DistributedReplayRegistryView {
  readonly registry_id: string
  readonly visibility_complete: boolean
  readonly registry_epoch: number
  readonly entries: readonly DistributedReplayEntry[]
}

export interface DistributedReplayConvergenceInput {
  readonly convergence_id: string
  readonly evidence_only: true
  readonly views: readonly DistributedReplayRegistryView[]
}

export interface DistributedReplayConvergenceResult {
  readonly artifact_type: 'DISTRIBUTED_REPLAY_CONVERGENCE'
  readonly convergence_id: string
  readonly classification: (typeof DISTRIBUTED_REPLAY_CONVERGENCE_CLASSIFICATIONS)[number]
  readonly converged: boolean
  readonly deterministic_traversal: readonly string[]
  readonly registry_hashes: Readonly<Record<string, string>>
  readonly replay_hash: string
  readonly lineage_hash: string
  readonly chronology_hash: string
  readonly revocation_hash: string
  readonly topology_hash: string
  readonly drift_classes: readonly string[]
  readonly evidence_only: true
  readonly creates_authority: false
}

function sortEntries(entries: readonly DistributedReplayEntry[]): readonly DistributedReplayEntry[] {
  return entries.slice().sort((a, b) => {
    const id = String(a.object_id || '').localeCompare(String(b.object_id || ''))
    if (id !== 0) return id
    return String(a.lineage_hash || '').localeCompare(String(b.lineage_hash || ''))
  })
}

function normalizedChronology(entries: readonly DistributedReplayEntry[]): readonly string[] {
  return sortEntries(entries).map((e) => `${String(e.object_id || '')}@${String(e.observed_at || '')}`)
}

function closureComplete(entries: readonly DistributedReplayEntry[]): boolean {
  const ids = new Set(entries.map((e) => String(e.object_id || '')))
  for (const entry of entries) {
    const parent = String(entry.parent_object_id || '')
    if (parent && !ids.has(parent)) return false
  }
  return true
}

function hasChronologyResurrection(entries: readonly DistributedReplayEntry[]): boolean {
  const byId = new Map<string, string[]>()
  for (const entry of sortEntries(entries)) {
    const id = String(entry.object_id || '')
    const ts = String(entry.observed_at || '')
    const prev = byId.get(id)
    if (prev) prev.push(ts)
    else byId.set(id, [ts])
  }
  for (const times of byId.values()) {
    for (let i = 1; i < times.length; i += 1) {
      if (times[i] < times[i - 1]) return true
    }
  }
  return false
}

function buildRegistryHash(view: DistributedReplayRegistryView): string {
  return sha256Hex(canonicalize({
    entries: sortEntries(view.entries || []).map((e) => ({
      object_id: String(e.object_id || ''),
      parent_object_id: e.parent_object_id == null ? null : String(e.parent_object_id),
      lineage_hash: String(e.lineage_hash || ''),
      replay_hash: String(e.replay_hash || ''),
      revocation_hash: String(e.revocation_hash || ''),
      topology_hash: String(e.topology_hash || ''),
      observed_at: String(e.observed_at || ''),
    })),
    registry_epoch: Number.isFinite(view.registry_epoch) ? view.registry_epoch : -1,
    visibility_complete: Boolean(view.visibility_complete),
  }))
}

export function verifyDistributedReplayConvergence(
  input: DistributedReplayConvergenceInput,
): DistributedReplayConvergenceResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.views) || input.views.length === 0) {
    return Object.freeze({
      artifact_type: 'DISTRIBUTED_REPLAY_CONVERGENCE',
      convergence_id: String(input?.convergence_id || ''),
      classification: 'NULL',
      converged: false,
      deterministic_traversal: Object.freeze([]),
      registry_hashes: Object.freeze({}),
      replay_hash: '',
      lineage_hash: '',
      chronology_hash: '',
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
    if (!closureComplete(view.entries || [])) drift.add('stale_replay')
    if (hasChronologyResurrection(view.entries || [])) drift.add('replay_resurrection')
  }

  const replaySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.replay_hash])))))
  const lineageSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.parent_object_id, e.lineage_hash])))))
  const chronologySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(normalizedChronology(v.entries)))))
  const revocationSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.revocation_hash])))))
  const topologySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEntries(v.entries).map((e) => [e.object_id, e.topology_hash])))))

  if (new Set(Object.values(registryHashes)).size > 1) drift.add('registry_mismatch')
  if (replaySet.size > 1) drift.add('replay_hash_mismatch')
  if (lineageSet.size > 1) drift.add('lineage_mismatch')
  if (chronologySet.size > 1) drift.add('chronology_mismatch')
  if (revocationSet.size > 1) drift.add('revocation_mismatch')
  if (topologySet.size > 1) drift.add('topology_drift')

  let classification: DistributedReplayConvergenceResult['classification'] = 'REPLAY_CONVERGED'
  if (drift.has('partial_visibility')) classification = 'REPLAY_PARTIAL_VISIBILITY'
  else if (drift.has('replay_resurrection')) classification = 'REPLAY_RESURRECTION'
  else if (drift.has('stale_replay')) classification = 'STALE_REPLAY'
  else if (drift.has('topology_drift')) classification = 'REPLAY_TOPOLOGY_DRIFT'
  else if (drift.has('replay_hash_mismatch') || drift.has('lineage_mismatch') || drift.has('chronology_mismatch') || drift.has('revocation_mismatch')) classification = 'REPLAY_DIVERGED'
  else if (drift.has('registry_mismatch')) classification = 'REPLAY_REGISTRY_MISMATCH'

  const converged = classification === 'REPLAY_CONVERGED'

  return Object.freeze({
    artifact_type: 'DISTRIBUTED_REPLAY_CONVERGENCE',
    convergence_id: String(input.convergence_id || ''),
    classification,
    converged,
    deterministic_traversal: Object.freeze(deterministicTraversal),
    registry_hashes: Object.freeze({ ...registryHashes }),
    replay_hash: Array.from(replaySet).sort()[0] || '',
    lineage_hash: Array.from(lineageSet).sort()[0] || '',
    chronology_hash: Array.from(chronologySet).sort()[0] || '',
    revocation_hash: Array.from(revocationSet).sort()[0] || '',
    topology_hash: Array.from(topologySet).sort()[0] || '',
    drift_classes: Object.freeze(Array.from(drift).sort((a, b) => a.localeCompare(b))),
    evidence_only: true,
    creates_authority: false,
  })
}
