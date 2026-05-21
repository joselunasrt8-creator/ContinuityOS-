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

  const normalizedDecisions = [...byDecision.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [decisionId, records] of normalizedDecisions) {
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

    const continuityStates = new Set(records.map((r) => String(r.continuity_status || 'ACTIVE')))
    if (continuityStates.has('REVOKED')) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.CONTINUITY_MISMATCH, decision_id: decisionId })
    }

    const lineageRoots = new Set(records.map((r) => String(r.lineage_root || '')))
    if (lineageRoots.size > 1) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.AMBIGUOUS_LINEAGE, decision_id: decisionId })
    }
  }

  const hasExecutableAuthority = normalizedDecisions.every(([, records]) =>
    records.length > 0
    && records.every((r) => String(r.authority_status) === 'AUTHORIZED')
    && records.every((r) => String(r.replay_state || 'FRESH') !== 'REPLAYED')
    && records.every((r) => String(r.continuity_status || 'ACTIVE') === 'ACTIVE')
  )

  const classification = issues.length === 0 && hasExecutableAuthority ? 'PASS' : 'DRIFT'
  return {
    status: classification,
    canonical_outcome: classification === 'PASS' ? 'REGISTRY_CONSENSUS' : 'NULL',
    executable_legitimacy: classification === 'PASS' ? 'EXECUTABLE' : 'NULL',
    fail_closed: issues.length > 0,
    issues
  }
}
