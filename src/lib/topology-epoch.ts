import { canonicalize, sha256Hex } from '../canonical.js'

export type TopologyEpochState = 'EPOCH_CURRENT' | 'EPOCH_STALE' | 'EPOCH_FORK' | 'EPOCH_AMBIGUOUS' | 'NULL'

export type TopologyEpochAdmissionReason =
  | 'missing_topology_epoch'
  | 'missing_epoch_lineage_parent'
  | 'stale_epoch'
  | 'forked_epoch_parent'
  | 'non_canonical_epoch_jump'
  | 'duplicate_epoch_nonce_replay'
  | 'topology_visibility_loss'
  | 'epoch_ambiguity'

export type TopologyEpochAdmission =
  | { ok: true; state: 'EPOCH_CURRENT'; epoch_ordering_hash: string }
  | { ok: false; state: Exclude<TopologyEpochState, 'EPOCH_CURRENT'> | 'NULL'; reason: TopologyEpochAdmissionReason }

export async function classifyTopologyEpochAdmission(input: {
  topology_epoch?: unknown
  epoch_lineage_parent?: unknown
  epoch_nonce?: unknown
  topology_visibility_state?: unknown
  scope?: unknown
  db: D1Database
}): Promise<TopologyEpochAdmission> {
  const topologyEpoch = Number(input.topology_epoch)
  const epochParent = String(input.epoch_lineage_parent || '')
  const epochNonce = String(input.epoch_nonce || '')
  const topologyVisibility = String(input.topology_visibility_state || '').toUpperCase()
  const scope = String(input.scope || 'GLOBAL')

  if (!Number.isFinite(topologyEpoch)) return { ok: false, state: 'NULL', reason: 'missing_topology_epoch' }
  if (!epochParent) return { ok: false, state: 'NULL', reason: 'missing_epoch_lineage_parent' }
  if (!epochNonce) return { ok: false, state: 'NULL', reason: 'epoch_ambiguity' }
  if (topologyVisibility && topologyVisibility !== 'VISIBLE') return { ok: false, state: 'EPOCH_AMBIGUOUS', reason: 'topology_visibility_loss' }

  const nonceReplay = await input.db.prepare(`SELECT 1 AS exists_flag FROM invocation_registry WHERE invocation_nonce=?1 LIMIT 1`).bind(epochNonce).first<any>()
  if (nonceReplay) return { ok: false, state: 'NULL', reason: 'duplicate_epoch_nonce_replay' }

  const lineageRows = await input.db.prepare(`SELECT topology_epoch, epoch_lineage_parent FROM epoch_registry WHERE epoch_scope=?1 ORDER BY created_at DESC, epoch_id DESC LIMIT 2`).bind(scope).all<any>()
  const rows = Array.isArray(lineageRows.results) ? lineageRows.results : []
  const head = rows[0]
  if (!head) {
    if (topologyEpoch !== 0) return { ok: false, state: 'NULL', reason: 'non_canonical_epoch_jump' }
    const orderingHash = await sha256Hex(canonicalize({ scope, topology_epoch: topologyEpoch, epoch_lineage_parent: epochParent, epoch_nonce: epochNonce }))
    return { ok: true, state: 'EPOCH_CURRENT', epoch_ordering_hash: orderingHash }
  }

  const currentEpoch = Number(head.topology_epoch)
  const currentParent = String(head.epoch_lineage_parent || '')
  if (!Number.isFinite(currentEpoch)) return { ok: false, state: 'EPOCH_AMBIGUOUS', reason: 'epoch_ambiguity' }
  if (topologyEpoch <= currentEpoch) return { ok: false, state: 'EPOCH_STALE', reason: 'stale_epoch' }
  if (topologyEpoch !== currentEpoch + 1) return { ok: false, state: 'NULL', reason: 'non_canonical_epoch_jump' }
  if (epochParent !== currentParent) return { ok: false, state: 'EPOCH_FORK', reason: 'forked_epoch_parent' }

  const orderingHash = await sha256Hex(canonicalize({ scope, topology_epoch: topologyEpoch, epoch_lineage_parent: epochParent, epoch_nonce: epochNonce }))
  return { ok: true, state: 'EPOCH_CURRENT', epoch_ordering_hash: orderingHash }
}
