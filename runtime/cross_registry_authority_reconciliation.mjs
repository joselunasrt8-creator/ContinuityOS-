export const AUTHORITY_DISAGREEMENT_CLASSES = Object.freeze({
  STATE_DISAGREEMENT: 'AUTHORITY_STATE_DISAGREEMENT',
  TEMPORAL_DIVERGENCE: 'AUTHORITY_TEMPORAL_DIVERGENCE',
  CONTINUITY_MISMATCH: 'AUTHORITY_CONTINUITY_MISMATCH',
  DETACHED_LINEAGE: 'AUTHORITY_DETACHED_LINEAGE',
  AMBIGUOUS_LINEAGE: 'AUTHORITY_AMBIGUOUS_LINEAGE',
  STALE_REPLAY: 'AUTHORITY_STALE_REPLAY'
})

export const CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION = Object.freeze({
  MATCH: 'MATCH',
  DRIFT: 'DRIFT',
  AMBIGUOUS: 'AMBIGUOUS',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
})

export const LEGITIMACY_QUORUM_CLASSIFICATION = Object.freeze({
  AGREED_VALID: 'AGREED_VALID',
  AGREED_INVALID: 'AGREED_INVALID',
  PARTIAL_VISIBILITY: 'PARTIAL_VISIBILITY',
  TEMPORAL_DRIFT: 'TEMPORAL_DRIFT',
  REVOKED_CONFLICT: 'REVOKED_CONFLICT',
  AMBIGUOUS: 'AMBIGUOUS',
  STALE_REPLAY: 'STALE_REPLAY'
})

export function reconcileCrossRegistryAuthority({ registries = [], expectedContinuityId, requiredRegistryCount } = {}) {
  const issues = []
  const byDecision = new Map()
  for (const record of registries) {
    const key = String(record.decision_id || '')
    if (!byDecision.has(key)) byDecision.set(key, [])
    byDecision.get(key).push(record)
  }

  const normalizedDecisions = [...byDecision.entries()].sort(([a], [b]) => a.localeCompare(b))
  const quorumClassifications = []

  for (const [decisionId, records] of normalizedDecisions) {
    const statuses = records.map((r) => String(r.authority_status || 'UNKNOWN'))
    const statusSet = new Set(statuses)

    const hasUnknown = statusSet.has('UNKNOWN')
    const hasAuthorized = statusSet.has('AUTHORIZED')
    const hasRevoked = statusSet.has('REVOKED') || records.some((r) => String(r.continuity_status || 'ACTIVE') === 'REVOKED')
    const hasStaleReplay = records.some((r) => String(r.authority_status) === 'STALE' || String(r.replay_state || 'FRESH') === 'REPLAYED')

    const continuityIds = new Set(records.map((r) => String(r.continuity_id || '')))
    if (continuityIds.size > 1 || (expectedContinuityId && !continuityIds.has(String(expectedContinuityId)))) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.CONTINUITY_MISMATCH, decision_id: decisionId })
    }

    const observed = records
      .map((r) => Date.parse(String(r.authority_timestamp || '')))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    const hasTemporalDivergence = observed.length > 1 && observed[observed.length - 1] !== observed[0]
    if (hasTemporalDivergence) issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.TEMPORAL_DIVERGENCE, decision_id: decisionId })

    if (records.some((r) => !r.lineage_parent || !r.lineage_root)) {
      issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.DETACHED_LINEAGE, decision_id: decisionId })
    }

    if (hasStaleReplay) issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.STALE_REPLAY, decision_id: decisionId })

    const lineageRoots = new Set(records.map((r) => String(r.lineage_root || '')))
    if (lineageRoots.size > 1) issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.AMBIGUOUS_LINEAGE, decision_id: decisionId })

    if (statusSet.size > 1) issues.push({ class: AUTHORITY_DISAGREEMENT_CLASSES.STATE_DISAGREEMENT, decision_id: decisionId })

    const quorumMissing = Number.isFinite(requiredRegistryCount) && requiredRegistryCount > 0 && records.length < requiredRegistryCount

    let quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.AMBIGUOUS
    if (hasStaleReplay) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.STALE_REPLAY
    else if (hasTemporalDivergence) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.TEMPORAL_DRIFT
    else if (hasRevoked && (hasUnknown || hasAuthorized)) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.REVOKED_CONFLICT
    else if (quorumMissing || hasUnknown) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.PARTIAL_VISIBILITY
    else if (statusSet.size === 1 && hasAuthorized) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.AGREED_VALID
    else if (statusSet.size === 1 && hasRevoked) quorum_classification = LEGITIMACY_QUORUM_CLASSIFICATION.AGREED_INVALID

    quorumClassifications.push({ decision_id: decisionId, quorum_classification })
  }

  const onlyAgreedValid = quorumClassifications.length > 0 && quorumClassifications.every((q) => q.quorum_classification === LEGITIMACY_QUORUM_CLASSIFICATION.AGREED_VALID)
  const hasExecutableAuthority = onlyAgreedValid && issues.length === 0 && normalizedDecisions.every(([, records]) =>
    records.length > 0
    && records.every((r) => String(r.authority_status) === 'AUTHORIZED')
    && records.every((r) => String(r.replay_state || 'FRESH') !== 'REPLAYED')
    && records.every((r) => String(r.continuity_status || 'ACTIVE') === 'ACTIVE')
  )

  const hasAmbiguousEvidence = issues.some((issue) => [
    AUTHORITY_DISAGREEMENT_CLASSES.STATE_DISAGREEMENT,
    AUTHORITY_DISAGREEMENT_CLASSES.CONTINUITY_MISMATCH,
    AUTHORITY_DISAGREEMENT_CLASSES.TEMPORAL_DIVERGENCE,
    AUTHORITY_DISAGREEMENT_CLASSES.AMBIGUOUS_LINEAGE,
  ].includes(issue.class))
  const hasInsufficientEvidence = normalizedDecisions.length === 0
    || quorumClassifications.some((q) => q.quorum_classification === LEGITIMACY_QUORUM_CLASSIFICATION.PARTIAL_VISIBILITY)
  let reconciliation_classification = CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION.MATCH
  if (hasInsufficientEvidence) reconciliation_classification = CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION.INSUFFICIENT_EVIDENCE
  else if (hasAmbiguousEvidence) reconciliation_classification = CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION.AMBIGUOUS
  else if (issues.length > 0 || !hasExecutableAuthority) reconciliation_classification = CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION.DRIFT

  const status = reconciliation_classification === CROSS_REGISTRY_RECONCILIATION_CLASSIFICATION.MATCH ? 'PASS' : 'DRIFT'
  return {
    classification: reconciliation_classification,
    status,
    canonical_outcome: status === 'PASS' ? 'REGISTRY_CONSENSUS' : 'NULL',
    executable_legitimacy: status === 'PASS' ? 'EXECUTABLE' : 'NULL',
    legitimacy: 'NULL',
    fail_closed: status !== 'PASS',
    quorum_classifications: quorumClassifications,
    issues
  }
}
