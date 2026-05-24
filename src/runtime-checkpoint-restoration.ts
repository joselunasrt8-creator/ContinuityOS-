import { canonicalize, sha256Hex } from './canonical.js'

export const RUNTIME_CHECKPOINT_RESTORATION_CLASSIFICATIONS = Object.freeze([
  'RESTORATION_EQUIVALENT',
  'CHECKPOINT_MISMATCH',
  'REPLAY_RESTORATION_DRIFT',
  'LINEAGE_RESTORATION_DRIFT',
  'PROOF_RESTORATION_DRIFT',
  'TOPOLOGY_RESTORATION_DRIFT',
  'RECONCILIATION_RESTORATION_DRIFT',
  'TEMPORAL_RESTORATION_DRIFT',
  'SEMANTIC_RESTORATION_DRIFT',
  'DISTRIBUTED_CHECKPOINT_FRAGMENTATION',
  'STALE_CHECKPOINT',
  'UNKNOWN_RESTORATION_SURFACE',
  'NULL',
] as const)

type RestorationClassification = (typeof RUNTIME_CHECKPOINT_RESTORATION_CLASSIFICATIONS)[number]

export interface RuntimeCheckpointSnapshot {
  readonly checkpoint_id: string
  readonly checkpoint_hash: string
  readonly replay_hash: string
  readonly lineage_hash: string
  readonly proof_hash: string
  readonly topology_hash: string
  readonly reconciliation_hash: string
  readonly temporal_hash: string
  readonly semantic_hash: string
  readonly observed_at: string
  readonly surface?: string | null
}

export interface RuntimeCheckpointRestorationInput {
  readonly restoration_id: string
  readonly evidence_only: true
  readonly original: RuntimeCheckpointSnapshot
  readonly restored: RuntimeCheckpointSnapshot
  readonly distributed_views?: readonly RuntimeCheckpointSnapshot[]
}

export interface RuntimeCheckpointRestorationResult {
  readonly artifact_type: 'RUNTIME_CHECKPOINT_RESTORATION_VERIFICATION'
  readonly restoration_id: string
  readonly classification: RestorationClassification
  readonly equivalent: boolean
  readonly deterministic_checkpoint_traversal: readonly string[]
  readonly original_checkpoint_hash: string
  readonly restored_checkpoint_hash: string
  readonly restoration_equivalence_inventory: readonly string[]
  readonly checkpoint_mismatch_inventory: readonly string[]
  readonly replay_restoration_divergence_inventory: readonly string[]
  readonly lineage_restoration_divergence_inventory: readonly string[]
  readonly proof_restoration_mismatch_inventory: readonly string[]
  readonly topology_restoration_drift_inventory: readonly string[]
  readonly reconciliation_restoration_mismatch_inventory: readonly string[]
  readonly temporal_restoration_divergence_inventory: readonly string[]
  readonly semantic_restoration_divergence_inventory: readonly string[]
  readonly distributed_checkpoint_fragmentation_inventory: readonly string[]
  readonly restoration_hash: string
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
}

function toSnapshot(snapshot: RuntimeCheckpointSnapshot): RuntimeCheckpointSnapshot {
  return {
    checkpoint_id: String(snapshot?.checkpoint_id || ''),
    checkpoint_hash: String(snapshot?.checkpoint_hash || ''),
    replay_hash: String(snapshot?.replay_hash || ''),
    lineage_hash: String(snapshot?.lineage_hash || ''),
    proof_hash: String(snapshot?.proof_hash || ''),
    topology_hash: String(snapshot?.topology_hash || ''),
    reconciliation_hash: String(snapshot?.reconciliation_hash || ''),
    temporal_hash: String(snapshot?.temporal_hash || ''),
    semantic_hash: String(snapshot?.semantic_hash || ''),
    observed_at: String(snapshot?.observed_at || ''),
    surface: snapshot?.surface == null ? null : String(snapshot.surface),
  }
}

function equivalentField(inventory: string[], a: string, b: string, label: string): void {
  if (a === b) inventory.push(label)
}

export function verifyRuntimeCheckpointRestoration(
  input: RuntimeCheckpointRestorationInput,
): RuntimeCheckpointRestorationResult {
  if (!input || input.evidence_only !== true || !input.original || !input.restored) {
    return Object.freeze({
      artifact_type: 'RUNTIME_CHECKPOINT_RESTORATION_VERIFICATION',
      restoration_id: String(input?.restoration_id || ''),
      classification: 'NULL',
      equivalent: false,
      deterministic_checkpoint_traversal: Object.freeze([]),
      original_checkpoint_hash: '',
      restored_checkpoint_hash: '',
      restoration_equivalence_inventory: Object.freeze([]),
      checkpoint_mismatch_inventory: Object.freeze(['fail_closed_null']),
      replay_restoration_divergence_inventory: Object.freeze([]),
      lineage_restoration_divergence_inventory: Object.freeze([]),
      proof_restoration_mismatch_inventory: Object.freeze([]),
      topology_restoration_drift_inventory: Object.freeze([]),
      reconciliation_restoration_mismatch_inventory: Object.freeze([]),
      temporal_restoration_divergence_inventory: Object.freeze([]),
      semantic_restoration_divergence_inventory: Object.freeze([]),
      distributed_checkpoint_fragmentation_inventory: Object.freeze([]),
      restoration_hash: '',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
    })
  }

  const original = toSnapshot(input.original)
  const restored = toSnapshot(input.restored)
  const distributedViews = (input.distributed_views || []).map((v) => toSnapshot(v)).sort((a, b) => {
    const idCmp = a.checkpoint_id.localeCompare(b.checkpoint_id)
    if (idCmp !== 0) return idCmp
    return a.checkpoint_hash.localeCompare(b.checkpoint_hash)
  })

  const deterministicTraversal = Object.freeze([
    `${original.checkpoint_id}:original`,
    `${restored.checkpoint_id}:restored`,
    ...distributedViews.map((v) => `${v.checkpoint_id}:distributed`),
  ])

  const restorationEquivalence: string[] = []
  const checkpointMismatch: string[] = []
  const replayDivergence: string[] = []
  const lineageDivergence: string[] = []
  const proofMismatch: string[] = []
  const topologyDrift: string[] = []
  const reconciliationMismatch: string[] = []
  const temporalDivergence: string[] = []
  const semanticDivergence: string[] = []
  const distributedFragmentation: string[] = []

  equivalentField(restorationEquivalence, original.checkpoint_hash, restored.checkpoint_hash, 'checkpoint_equivalent')
  equivalentField(restorationEquivalence, original.replay_hash, restored.replay_hash, 'replay_equivalent')
  equivalentField(restorationEquivalence, original.lineage_hash, restored.lineage_hash, 'lineage_equivalent')
  equivalentField(restorationEquivalence, original.proof_hash, restored.proof_hash, 'proof_equivalent')
  equivalentField(restorationEquivalence, original.topology_hash, restored.topology_hash, 'topology_equivalent')
  equivalentField(restorationEquivalence, original.reconciliation_hash, restored.reconciliation_hash, 'reconciliation_equivalent')
  equivalentField(restorationEquivalence, original.temporal_hash, restored.temporal_hash, 'temporal_equivalent')
  equivalentField(restorationEquivalence, original.semantic_hash, restored.semantic_hash, 'semantic_equivalent')

  if (original.checkpoint_hash !== restored.checkpoint_hash) checkpointMismatch.push('checkpoint_hash_mismatch')
  if (original.replay_hash !== restored.replay_hash) replayDivergence.push('replay_hash_divergence')
  if (original.lineage_hash !== restored.lineage_hash) lineageDivergence.push('lineage_hash_divergence')
  if (original.proof_hash !== restored.proof_hash) proofMismatch.push('proof_hash_mismatch')
  if (original.topology_hash !== restored.topology_hash) topologyDrift.push('topology_hash_drift')
  if (original.reconciliation_hash !== restored.reconciliation_hash) reconciliationMismatch.push('reconciliation_hash_mismatch')
  if (original.temporal_hash !== restored.temporal_hash) temporalDivergence.push('temporal_hash_divergence')
  if (original.semantic_hash !== restored.semantic_hash) semanticDivergence.push('semantic_hash_divergence')

  if (restored.observed_at < original.observed_at) temporalDivergence.push('stale_checkpoint_resurrection')

  const unknownSurface = restored.surface !== null && restored.surface !== '' && restored.surface !== 'runtime_checkpoint'
  if (unknownSurface) semanticDivergence.push(`unknown_surface:${restored.surface}`)

  const allDistributed = [original, restored, ...distributedViews]
  const distHashes = new Set(allDistributed.map((s) => s.checkpoint_hash))
  if (distHashes.size > 1) distributedFragmentation.push('distributed_checkpoint_hash_fragmented')

  for (const view of distributedViews) {
    if (view.checkpoint_hash !== original.checkpoint_hash) distributedFragmentation.push(`view_mismatch:${view.checkpoint_id}`)
  }

  let classification: RestorationClassification = 'RESTORATION_EQUIVALENT'
  if (unknownSurface) classification = 'UNKNOWN_RESTORATION_SURFACE'
  else if (temporalDivergence.includes('stale_checkpoint_resurrection')) classification = 'STALE_CHECKPOINT'
  else if (semanticDivergence.length > 0) classification = 'SEMANTIC_RESTORATION_DRIFT'
  else if (temporalDivergence.length > 0) classification = 'TEMPORAL_RESTORATION_DRIFT'
  else if (reconciliationMismatch.length > 0) classification = 'RECONCILIATION_RESTORATION_DRIFT'
  else if (topologyDrift.length > 0) classification = 'TOPOLOGY_RESTORATION_DRIFT'
  else if (proofMismatch.length > 0) classification = 'PROOF_RESTORATION_DRIFT'
  else if (lineageDivergence.length > 0) classification = 'LINEAGE_RESTORATION_DRIFT'
  else if (replayDivergence.length > 0) classification = 'REPLAY_RESTORATION_DRIFT'
  else if (checkpointMismatch.length > 0) classification = 'CHECKPOINT_MISMATCH'
  else if (distributedFragmentation.length > 0) classification = 'DISTRIBUTED_CHECKPOINT_FRAGMENTATION'

  const equivalent = classification === 'RESTORATION_EQUIVALENT'

  const restorationHash = sha256Hex(canonicalize({
    classification,
    original,
    restored,
    distributed_views: distributedViews,
    inventories: {
      restorationEquivalence,
      checkpointMismatch,
      replayDivergence,
      lineageDivergence,
      proofMismatch,
      topologyDrift,
      reconciliationMismatch,
      temporalDivergence,
      semanticDivergence,
      distributedFragmentation,
    },
  }))

  return Object.freeze({
    artifact_type: 'RUNTIME_CHECKPOINT_RESTORATION_VERIFICATION',
    restoration_id: String(input.restoration_id || ''),
    classification,
    equivalent,
    deterministic_checkpoint_traversal: deterministicTraversal,
    original_checkpoint_hash: original.checkpoint_hash,
    restored_checkpoint_hash: restored.checkpoint_hash,
    restoration_equivalence_inventory: Object.freeze(restorationEquivalence.sort((a, b) => a.localeCompare(b))),
    checkpoint_mismatch_inventory: Object.freeze(checkpointMismatch.sort((a, b) => a.localeCompare(b))),
    replay_restoration_divergence_inventory: Object.freeze(replayDivergence.sort((a, b) => a.localeCompare(b))),
    lineage_restoration_divergence_inventory: Object.freeze(lineageDivergence.sort((a, b) => a.localeCompare(b))),
    proof_restoration_mismatch_inventory: Object.freeze(proofMismatch.sort((a, b) => a.localeCompare(b))),
    topology_restoration_drift_inventory: Object.freeze(topologyDrift.sort((a, b) => a.localeCompare(b))),
    reconciliation_restoration_mismatch_inventory: Object.freeze(reconciliationMismatch.sort((a, b) => a.localeCompare(b))),
    temporal_restoration_divergence_inventory: Object.freeze(temporalDivergence.sort((a, b) => a.localeCompare(b))),
    semantic_restoration_divergence_inventory: Object.freeze(semanticDivergence.sort((a, b) => a.localeCompare(b))),
    distributed_checkpoint_fragmentation_inventory: Object.freeze(distributedFragmentation.sort((a, b) => a.localeCompare(b))),
    restoration_hash: restorationHash,
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    validates_execution: false,
  })
}
