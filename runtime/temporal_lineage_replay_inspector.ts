export type TemporalDriftClass =
  | 'replay-induced'
  | 'stale-state-induced'
  | 'regeneration-induced'
  | 'ordering-induced'
  | 'temporal-induced'
  | 'epoch-induced'
  | 'continuity-induced'
  | 'cross-registry-authority-induced'

export interface TemporalLineageNode {
  id: string
  parent_id: string | null
  stage: string
  legitimacy_state: 'VALID' | 'NULL' | 'STALE' | 'INVALID' | 'BLOCKED' | 'QUARANTINED'
  epoch: number
  timestamp: string
  topology_hash: string
}

export interface ReplayInspectionIssue {
  class: TemporalDriftClass
  code: string
  details: string
}

export interface TemporalReplayInspectionResult {
  status: 'PASS' | 'DRIFT'
  deterministic_conclusion: 'VALID' | 'NULL'
  fail_closed_epoch_disagreement: boolean
  replay_neutral: true
  issues: ReplayInspectionIssue[]
}

export interface TemporalReplayInspectionInput {
  canonicalLineage: TemporalLineageNode[]
  replayLineage: TemporalLineageNode[]
  expectedEpoch: number
  crossRegistryAuthorityStates?: Array<{ registry_id: string, decision_id: string, authority_status: string, authority_timestamp: string, continuity_id: string }>
}

function lineageHash(lineage: TemporalLineageNode[]): string {
  const ordered = [...lineage].sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({
    id: n.id,
    parent_id: n.parent_id,
    stage: n.stage,
    legitimacy_state: n.legitimacy_state,
    epoch: n.epoch,
    timestamp: n.timestamp,
    topology_hash: n.topology_hash,
  }))
  return JSON.stringify(ordered)
}

export function inspectTemporalLineageReplay(input: TemporalReplayInspectionInput): TemporalReplayInspectionResult {
  const issues: ReplayInspectionIssue[] = []

  const canonicalById = new Map(input.canonicalLineage.map((n) => [n.id, n]))
  const replayById = new Map(input.replayLineage.map((n) => [n.id, n]))

  for (const node of input.replayLineage) {
    if (node.epoch !== input.expectedEpoch) {
      issues.push({ class: 'epoch-induced', code: 'epoch_disagreement', details: `${node.id}:${node.epoch}!=${input.expectedEpoch}` })
    }
    if (node.legitimacy_state === 'STALE') {
      issues.push({ class: 'stale-state-induced', code: 'stale_proof_emergence', details: node.id })
    }
    if (node.parent_id && !replayById.has(node.parent_id)) {
      issues.push({ class: 'continuity-induced', code: 'orphan_replay_ancestry', details: `${node.id}->${node.parent_id}` })
    }
  }

  const canonicalOrder = input.canonicalLineage.map((n) => n.id).join('|')
  const replayOrder = input.replayLineage.map((n) => n.id).join('|')
  if (canonicalOrder !== replayOrder) {
    issues.push({ class: 'ordering-induced', code: 'ancestry_ordering_divergence', details: `canonical=${canonicalOrder};replay=${replayOrder}` })
  }

  for (const [id, canonicalNode] of canonicalById) {
    const replayNode = replayById.get(id)
    if (!replayNode) {
      issues.push({ class: 'replay-induced', code: 'lineage_node_missing_in_replay', details: id })
      continue
    }
    if (replayNode.topology_hash !== canonicalNode.topology_hash) {
      issues.push({ class: 'regeneration-induced', code: 'topology_regeneration_mismatch', details: id })
    }
    if (Date.parse(replayNode.timestamp) < Date.parse(canonicalNode.timestamp)) {
      issues.push({ class: 'temporal-induced', code: 'non_monotonic_replay_timestamp', details: id })
    }
  }

  if (lineageHash(input.canonicalLineage) !== lineageHash(input.replayLineage)) {
    issues.push({ class: 'replay-induced', code: 'deterministic_reconstruction_mismatch', details: 'canonical_hash!=replay_hash' })
  }

  const registryAuthorityStates = input.crossRegistryAuthorityStates || []
  if (registryAuthorityStates.length > 1) {
    const statusSet = new Set(registryAuthorityStates.map((state) => state.authority_status))
    if (statusSet.size > 1) {
      issues.push({ class: 'cross-registry-authority-induced', code: 'cross_registry_authority_disagreement', details: [...statusSet].join('|') })
    }
    const continuitySet = new Set(registryAuthorityStates.map((state) => state.continuity_id))
    if (continuitySet.size > 1) {
      issues.push({ class: 'cross-registry-authority-induced', code: 'cross_registry_continuity_mismatch', details: [...continuitySet].join('|') })
    }
    const temporalSet = new Set(registryAuthorityStates.map((state) => Date.parse(state.authority_timestamp)).filter((v) => Number.isFinite(v)))
    if (temporalSet.size > 1) {
      issues.push({ class: 'cross-registry-authority-induced', code: 'cross_registry_authority_temporal_divergence', details: String(temporalSet.size) })
    }
  }

  const failClosedEpochDisagreement = issues.some((issue) => issue.class === 'epoch-induced')
  const status = issues.length === 0 ? 'PASS' : 'DRIFT'
  const deterministic_conclusion: 'VALID' | 'NULL' = status === 'PASS' ? 'VALID' : 'NULL'

  return {
    status,
    deterministic_conclusion,
    fail_closed_epoch_disagreement: failClosedEpochDisagreement,
    replay_neutral: true,
    issues,
  }
}
