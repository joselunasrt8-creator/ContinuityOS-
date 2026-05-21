export const AUTHORITY_DISAGREEMENT_CLASSES = Object.freeze({
  STATE_DISAGREEMENT: 'AUTHORITY_STATE_DISAGREEMENT',
  TEMPORAL_DIVERGENCE: 'AUTHORITY_TEMPORAL_DIVERGENCE',
  CONTINUITY_MISMATCH: 'AUTHORITY_CONTINUITY_MISMATCH',
  DETACHED_LINEAGE: 'AUTHORITY_DETACHED_LINEAGE',
  AMBIGUOUS_LINEAGE: 'AUTHORITY_AMBIGUOUS_LINEAGE',
  STALE_REPLAY: 'AUTHORITY_STALE_REPLAY'
})

export function reconcileCrossRegistryAuthority({ registries, expectedContinuityId }) {
  const issues = []
  const byDecision = new Map()
  for (const record of registries) {
    const key = String(record.decision_id || '')
    if (!byDecision.has(key)) byDecision.set(key, [])
    byDecision.get(key).push(record)
  }

  for (const [decisionId, records] of byDecision) {
    const statuses = new Set(records.map((r) => String(r.authority_status || 'UNKNOWN')))
    if (statuses.size > 1) issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.STATE_DISAGREEMENT, decision_id: decisionId })

    const continuityIds = new Set(records.map((r) => String(r.continuity_id || '')))
    if (continuityIds.size > 1 || (expectedContinuityId && !continuityIds.has(String(expectedContinuityId)))) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.CONTINUITY_MISMATCH, decision_id: decisionId })
    }

    const observed = records
      .map((r) => Date.parse(String(r.authority_timestamp || '')))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    if (observed.length > 1 && observed[observed.length - 1] !== observed[0]) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.TEMPORAL_DIVERGENCE, decision_id: decisionId })
    }

    if (records.some((r) => !r.lineage_parent || !r.lineage_root)) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.DETACHED_LINEAGE, decision_id: decisionId })
    }

    if (records.some((r) => String(r.authority_status) === 'STALE' || String(r.replay_state) === 'REPLAYED')) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.STALE_REPLAY, decision_id: decisionId })
    }

    const lineageRoots = new Set(records.map((r) => String(r.lineage_root || '')))
    if (lineageRoots.size > 1) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.AMBIGUOUS_LINEAGE, decision_id: decisionId })
    }
  }

  const classification = issues.length === 0 ? 'PASS' : 'DRIFT'
  return {
    status: classification,
    canonical_outcome: classification === 'PASS' ? 'REGISTRY_CONSENSUS' : 'NULL',
    executable_legitimacy: classification === 'PASS' ? 'EXECUTABLE' : 'NULL',
    fail_closed: issues.length > 0,
    issues
  }
}
