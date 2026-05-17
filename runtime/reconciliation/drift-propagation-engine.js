import { canonicalize, hashCanonical, normalize } from '../../src/canonical.js'
export { canonicalize, hashCanonical }

export const EVIDENCE_ONLY_FLAGS = Object.freeze({
  evidence_only: true,
  executable: false,
  creates_authority: false,
  mutation_capable: false,
  deployment_capable: false,
  proof_generating: false,
  fail_closed_on_ambiguity: true,
})

export const PROPAGATED_DRIFT_CLASSES = Object.freeze([
  'TOPOLOGY_DRIFT_PROPAGATED',
  'MERGE_LINEAGE_CONTAMINATED',
  'GOVERNANCE_IMPACT_EXPANDED',
  'SCHEMA_PROPAGATION_FAILURE',
  'WORKFLOW_TRUST_COLLAPSE',
  'PROOF_LINEAGE_CONTAMINATION',
  'RECONCILIATION_EQUIVALENCE_INVALID',
  'DOWNSTREAM_LEGITIMACY_NULL',
])

const PROPAGATION_RULES = Object.freeze({
  SCHEMA_DIVERGENCE: ['route_binding_invalid', 'governance_binding_invalid', 'reconciliation_equivalence_invalid', 'preo_legitimacy_invalid', 'merge_legitimacy_null'],
  UNDECLARED_SURFACE: ['topology_legitimacy_null', 'downstream_proof_lineage_contaminated', 'merge_legitimacy_null'],
  WORKFLOW_EXPANSION: ['preo_lineage_invalid', 'governed_merge_invalid', 'reconciliation_verdict_drift_propagated'],
  GOVERNANCE_MISMATCH: ['governance_binding_invalid', 'reconciliation_equivalence_invalid', 'preo_legitimacy_invalid', 'merge_legitimacy_null'],
  TOPOLOGY_DRIFT: ['topology_legitimacy_null', 'downstream_legitimacy_null', 'merge_legitimacy_null'],
  PROOF_LINEAGE_DISCONTINUITY: ['continuity_invalid', 'execution_legitimacy_invalid', 'downstream_proof_trust_invalid'],
})

const CONSEQUENCE_CLASSES = Object.freeze({
  route_binding_invalid: 'SCHEMA_PROPAGATION_FAILURE',
  governance_binding_invalid: 'GOVERNANCE_IMPACT_EXPANDED',
  reconciliation_equivalence_invalid: 'RECONCILIATION_EQUIVALENCE_INVALID',
  preo_legitimacy_invalid: 'DOWNSTREAM_LEGITIMACY_NULL',
  merge_legitimacy_null: 'MERGE_LINEAGE_CONTAMINATED',
  topology_legitimacy_null: 'TOPOLOGY_DRIFT_PROPAGATED',
  downstream_proof_lineage_contaminated: 'PROOF_LINEAGE_CONTAMINATION',
  preo_lineage_invalid: 'WORKFLOW_TRUST_COLLAPSE',
  governed_merge_invalid: 'MERGE_LINEAGE_CONTAMINATED',
  reconciliation_verdict_drift_propagated: 'TOPOLOGY_DRIFT_PROPAGATED',
  continuity_invalid: 'PROOF_LINEAGE_CONTAMINATION',
  execution_legitimacy_invalid: 'DOWNSTREAM_LEGITIMACY_NULL',
  downstream_proof_trust_invalid: 'PROOF_LINEAGE_CONTAMINATION',
  downstream_legitimacy_null: 'DOWNSTREAM_LEGITIMACY_NULL',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stableIdentity(record) {
  if (typeof record === 'string') return record
  if (!record || typeof record !== 'object') return canonicalize(record)
  return String(record.identity ?? record.id ?? record.route ?? record.path ?? record.surface_id ?? record.source_id ?? record.workflow ?? record.name ?? canonicalize(record))
}

function sortRecords(records) {
  return [...records].map(normalize).sort((left, right) => {
    const byIdentity = stableIdentity(left).localeCompare(stableIdentity(right))
    if (byIdentity !== 0) return byIdentity
    return canonicalize(left).localeCompare(canonicalize(right))
  })
}

function driftEntries(input) {
  if (Array.isArray(input?.drift)) return input.drift
  if (Array.isArray(input?.drift_summary)) return input.drift_summary
  if (typeof input?.drift_summary === 'string') {
    try { return asArray(JSON.parse(input.drift_summary)) } catch { return [] }
  }
  if (input?.classification && input.classification !== 'TOPOLOGY_VALID') return [{ classification: input.classification, identity: 'topology', reason: 'classification_without_summary' }]
  return []
}

function classifyEntry(entry) {
  const classification = String(entry?.classification ?? entry?.drift_class ?? '').toUpperCase()
  const reason = String(entry?.reason ?? '').toLowerCase()
  if (classification === 'PROOF_LINEAGE_DISCONTINUITY' || reason.includes('proof_lineage') || reason.includes('continuity')) return 'PROOF_LINEAGE_DISCONTINUITY'
  if (PROPAGATION_RULES[classification]) return classification
  return classification ? 'TOPOLOGY_DRIFT' : 'NULL'
}

function evidenceObject(object_type, material) {
  return Object.freeze({ object_type, ...material, ...EVIDENCE_ONLY_FLAGS })
}

export function buildImpactGraph(topologyOrEvidence = {}, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 32
  const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 256
  const entries = sortRecords(driftEntries(topologyOrEvidence))
  const ambiguous = entries.some((entry) => classifyEntry(entry) === 'NULL') || maxDepth < 1 || maxNodes < 1
  const nodes = []
  const edges = []
  const driftClasses = new Set()
  let truncated = false

  for (const entry of entries) {
    const sourceClass = classifyEntry(entry)
    const sourceId = `drift:${sourceClass}:${stableIdentity(entry)}`
    if (nodes.length >= maxNodes) { truncated = true; break }
    nodes.push({ node_id: sourceId, node_type: 'drift_source', classification: sourceClass, identity: stableIdentity(entry), reason: String(entry?.reason ?? 'unspecified') })
    const consequences = PROPAGATION_RULES[sourceClass] || []
    let prior = sourceId
    for (let depth = 0; depth < consequences.length && depth < maxDepth; depth += 1) {
      if (nodes.length >= maxNodes) { truncated = true; break }
      const consequence = consequences[depth]
      const consequenceClass = CONSEQUENCE_CLASSES[consequence] || 'DOWNSTREAM_LEGITIMACY_NULL'
      driftClasses.add(consequenceClass)
      const nodeId = `impact:${consequence}:${stableIdentity(entry)}`
      nodes.push({ node_id: nodeId, node_type: 'legitimacy_consequence', consequence, classification: consequenceClass, depth: depth + 1, invalidates_legitimacy: true })
      edges.push({ from: prior, to: nodeId, rule: `${sourceClass}->${consequence}`, depth: depth + 1 })
      prior = nodeId
    }
  }

  if (ambiguous || truncated) driftClasses.add('DOWNSTREAM_LEGITIMACY_NULL')
  const orderedNodes = sortRecords(nodes)
  const orderedEdges = sortRecords(edges)
  const material = {
    nodes: orderedNodes,
    edges: orderedEdges,
    bounded: true,
    max_depth: maxDepth,
    max_nodes: maxNodes,
    truncated,
    ambiguous,
    drift_classes: [...driftClasses].sort(),
    topology_hash: topologyOrEvidence.topology_hash ?? hashCanonical({ topology: topologyOrEvidence?.topology ?? topologyOrEvidence }),
  }
  return evidenceObject('GovernanceImpactGraph', { ...material, impact_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function propagateDrift(topologyOrEvidence = {}, options = {}) {
  const impact = buildImpactGraph(topologyOrEvidence, options)
  const entries = sortRecords(driftEntries(topologyOrEvidence))
  const topologyDelta = evidenceObject('TopologyDeltaObject', {
    topology_hash: impact.topology_hash,
    topology_ancestry: normalize(topologyOrEvidence.topology_ancestry ?? []),
    drift_sources: entries,
    topology_delta_hash: hashCanonical({ topology_hash: impact.topology_hash, drift_sources: entries }),
    read_only: true,
    replay_neutral: true,
  })
  const material = {
    topology_delta: topologyDelta,
    impact_hash: impact.impact_hash,
    propagated_drift_classes: impact.drift_classes,
    propagation_steps: impact.edges,
    fail_closed: impact.ambiguous || impact.truncated || impact.drift_classes.length > 0,
  }
  return evidenceObject('DriftPropagationObject', { ...material, propagation_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function computeLegitimacyCollapse(propagation) {
  const classes = new Set(asArray(propagation?.propagated_drift_classes))
  const collapsed = propagation?.fail_closed === true || classes.has('DOWNSTREAM_LEGITIMACY_NULL') || classes.has('MERGE_LINEAGE_CONTAMINATED')
  return Object.freeze({
    collapse_state: collapsed ? 'LEGITIMACY_NULL' : 'LEGITIMACY_UNCHANGED',
    collapsed_lineage: collapsed,
    quarantined_ancestors: collapsed ? asArray(propagation?.topology_delta?.topology_ancestry).map(String).sort() : [],
    collapse_hash: hashCanonical({ classes: [...classes].sort(), propagation_hash: propagation?.propagation_hash ?? null, collapsed }),
    ...EVIDENCE_ONLY_FLAGS,
  })
}

export function computeMergeImpact(propagation) {
  const collapse = computeLegitimacyCollapse(propagation)
  const classes = new Set(asArray(propagation?.propagated_drift_classes))
  const merge_legitimacy = collapse.collapse_state === 'LEGITIMACY_NULL' || classes.has('MERGE_LINEAGE_CONTAMINATED') ? 'NULL' : 'UNCHANGED'
  const material = {
    merge_legitimacy,
    governed_merge_allowed: false,
    merge_surfaces_fail_closed: merge_legitimacy === 'NULL',
    collapse_hash: collapse.collapse_hash,
    propagation_hash: propagation?.propagation_hash ?? null,
    invalidation_reasons: [...classes].sort(),
  }
  return evidenceObject('MergeLegitimacyImpactObject', { ...material, merge_legitimacy_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function buildVerdictEnvelope(topologyOrEvidence = {}, options = {}) {
  const impact = buildImpactGraph(topologyOrEvidence, options)
  const propagation = propagateDrift(topologyOrEvidence, options)
  const mergeImpact = computeMergeImpact(propagation)
  const verdict = mergeImpact.merge_legitimacy === 'NULL' ? 'DRIFT_PROPAGATED' : 'NO_PROPAGATED_DRIFT'
  const material = {
    impact_hash: impact.impact_hash,
    propagation_hash: propagation.propagation_hash,
    merge_legitimacy_hash: mergeImpact.merge_legitimacy_hash,
    verdict,
    classification: propagation.propagated_drift_classes.length ? propagation.propagated_drift_classes[0] : 'TOPOLOGY_VALID',
    deterministic: true,
    replay_neutral: true,
  }
  return evidenceObject('ReconciliationVerdictObject', { ...material, impact_graph: impact, propagation, merge_impact: mergeImpact, verdict_hash: hashCanonical(material), read_only: true })
}
