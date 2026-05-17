import { canonicalize, hashCanonical, normalize } from '../../src/canonical.js'
export { canonicalize, hashCanonical }

export const CONTAINMENT_EVIDENCE_FLAGS = Object.freeze({
  evidence_only: true,
  executable: false,
  creates_authority: false,
  mutation_capable: false,
  deployment_capable: false,
  proof_generating: false,
  fail_closed_on_ambiguity: true,
  quarantine_authoritative: false,
})

export const CONTAINMENT_CLASSES = Object.freeze([
  'RECURSIVE_QUARANTINE_ACTIVE',
  'FEDERATED_CONTAINMENT_REQUIRED',
  'LINEAGE_TRUST_ISOLATED',
  'TOPOLOGY_ANCESTRY_QUARANTINED',
  'DOWNSTREAM_COORDINATION_RESTRICTED',
  'MERGE_TRUST_COLLAPSED',
  'PROOF_TRUST_CONTAINED',
  'GOVERNANCE_CONTAMINATION_EXPANDED',
  'CONTAINMENT_BOUNDARY_OVERFLOW',
])

const CONTAINMENT_RULES = Object.freeze({
  PROOF_LINEAGE_CONTAMINATION: ['downstream_proof_trust_quarantined', 'containment_boundary_established', 'merge_legitimacy_isolated'],
  PROOF_LINEAGE_DISCONTINUITY: ['downstream_proof_trust_quarantined', 'containment_boundary_established', 'merge_legitimacy_isolated'],
  UNDECLARED_SURFACE: ['topology_contamination', 'recursive_ancestry_quarantine', 'federated_trust_isolation', 'downstream_legitimacy_containment'],
  SCHEMA_DIVERGENCE: ['route_legitimacy_quarantine', 'governance_continuity_collapse', 'preo_trust_isolation'],
  SCHEMA_PROPAGATION_FAILURE: ['route_legitimacy_quarantine', 'governance_continuity_collapse', 'preo_trust_isolation'],
  GOVERNANCE_MISMATCH: ['containment_graph_expansion', 'downstream_coordination_trust_restricted'],
  GOVERNANCE_IMPACT_EXPANDED: ['containment_graph_expansion', 'downstream_coordination_trust_restricted'],
  TOPOLOGY_DRIFT: ['topology_contamination', 'recursive_ancestry_quarantine', 'downstream_legitimacy_containment'],
  TOPOLOGY_DRIFT_PROPAGATED: ['topology_contamination', 'recursive_ancestry_quarantine', 'downstream_legitimacy_containment'],
  MERGE_LINEAGE_CONTAMINATED: ['containment_boundary_established', 'merge_legitimacy_isolated'],
  DOWNSTREAM_LEGITIMACY_NULL: ['downstream_legitimacy_containment', 'downstream_coordination_trust_restricted'],
  WORKFLOW_TRUST_COLLAPSE: ['preo_trust_isolation', 'merge_legitimacy_isolated'],
  RECONCILIATION_EQUIVALENCE_INVALID: ['containment_graph_expansion', 'governance_continuity_collapse'],
})

const CONSEQUENCE_CLASSES = Object.freeze({
  downstream_proof_trust_quarantined: 'PROOF_TRUST_CONTAINED',
  containment_boundary_established: 'RECURSIVE_QUARANTINE_ACTIVE',
  merge_legitimacy_isolated: 'MERGE_TRUST_COLLAPSED',
  topology_contamination: 'TOPOLOGY_ANCESTRY_QUARANTINED',
  recursive_ancestry_quarantine: 'TOPOLOGY_ANCESTRY_QUARANTINED',
  federated_trust_isolation: 'FEDERATED_CONTAINMENT_REQUIRED',
  downstream_legitimacy_containment: 'LINEAGE_TRUST_ISOLATED',
  route_legitimacy_quarantine: 'RECURSIVE_QUARANTINE_ACTIVE',
  governance_continuity_collapse: 'GOVERNANCE_CONTAMINATION_EXPANDED',
  preo_trust_isolation: 'LINEAGE_TRUST_ISOLATED',
  containment_graph_expansion: 'GOVERNANCE_CONTAMINATION_EXPANDED',
  downstream_coordination_trust_restricted: 'DOWNSTREAM_COORDINATION_RESTRICTED',
})

function asArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function stableIdentity(record) {
  if (typeof record === 'string') return record
  if (!record || typeof record !== 'object') return canonicalize(record)
  return String(record.identity ?? record.id ?? record.node_id ?? record.route ?? record.path ?? record.surface_id ?? record.source_id ?? record.workflow ?? record.name ?? canonicalize(record))
}

function sortRecords(records) {
  return [...records].map(normalize).sort((left, right) => {
    const byIdentity = stableIdentity(left).localeCompare(stableIdentity(right))
    if (byIdentity !== 0) return byIdentity
    return canonicalize(left).localeCompare(canonicalize(right))
  })
}

function contaminationEntries(input) {
  if (Array.isArray(input?.contamination)) return input.contamination
  if (Array.isArray(input?.drift_summary)) return input.drift_summary
  if (Array.isArray(input?.drift)) return input.drift
  if (Array.isArray(input?.propagated_drift_classes)) return input.propagated_drift_classes.map((classification) => ({ classification, identity: classification, reason: 'propagated_drift_class' }))
  if (input?.classification && input.classification !== 'TOPOLOGY_VALID') return [{ classification: input.classification, identity: 'containment', reason: 'classification_without_summary' }]
  return []
}

function classifyEntry(entry) {
  const classification = String(entry?.classification ?? entry?.drift_class ?? entry ?? '').toUpperCase()
  const reason = String(entry?.reason ?? '').toLowerCase()
  if (classification === 'NULL') return 'NULL'
  if (reason.includes('proof_lineage') || reason.includes('continuity')) return 'PROOF_LINEAGE_CONTAMINATION'
  if (classification === 'PROOF_LINEAGE_DISCONTINUITY') return 'PROOF_LINEAGE_CONTAMINATION'
  if (CONTAINMENT_RULES[classification]) return classification
  return classification ? 'TOPOLOGY_DRIFT' : 'NULL'
}

function evidenceObject(object_type, material) {
  return Object.freeze({ object_type, ...material, ...CONTAINMENT_EVIDENCE_FLAGS })
}

export function buildContainmentGraph(contamination = {}, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 32
  const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 256
  const entries = sortRecords(contaminationEntries(contamination))
  const nodes = []
  const edges = []
  const classes = new Set()
  let ambiguous = maxDepth < 1 || maxNodes < 1
  let truncated = false

  for (const entry of entries) {
    const sourceClass = classifyEntry(entry)
    if (sourceClass === 'NULL') ambiguous = true
    if (nodes.length >= maxNodes) { truncated = true; break }
    const sourceId = `contamination:${sourceClass}:${stableIdentity(entry)}`
    nodes.push({ node_id: sourceId, node_type: 'contamination_source', classification: sourceClass, identity: stableIdentity(entry), reason: String(entry?.reason ?? 'unspecified') })
    let prior = sourceId
    for (let depth = 0; depth < (CONTAINMENT_RULES[sourceClass] || []).length && depth < maxDepth; depth += 1) {
      if (nodes.length >= maxNodes) { truncated = true; break }
      const consequence = CONTAINMENT_RULES[sourceClass][depth]
      const classification = CONSEQUENCE_CLASSES[consequence] || 'DOWNSTREAM_COORDINATION_RESTRICTED'
      classes.add(classification)
      const nodeId = `containment:${consequence}:${stableIdentity(entry)}`
      nodes.push({ node_id: nodeId, node_type: 'containment_consequence', consequence, classification, depth: depth + 1, quarantines_legitimacy: true })
      edges.push({ from: prior, to: nodeId, rule: `${sourceClass}->${consequence}`, depth: depth + 1 })
      prior = nodeId
    }
  }
  if (ambiguous || truncated) classes.add('CONTAINMENT_BOUNDARY_OVERFLOW')
  const material = { nodes: sortRecords(nodes), edges: sortRecords(edges), containment_classes: [...classes].sort(), bounded: true, max_depth: maxDepth, max_nodes: maxNodes, ambiguous, truncated, lineage_hash: String(contamination.lineage_hash ?? contamination.topology_hash ?? hashCanonical({ contamination })) }
  return evidenceObject('RecursiveIsolationGraph', { ...material, containment_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function propagateContainment(contamination = {}, options = {}) {
  const graph = buildContainmentGraph(contamination, options)
  const quarantined = graph.nodes.filter((node) => node.node_type === 'containment_consequence').map((node) => ({ node_id: node.node_id, classification: node.classification, consequence: node.consequence }))
  const material = { containment_hash: graph.containment_hash, quarantined_objects: sortRecords(quarantined), containment_classes: graph.containment_classes, fail_closed: graph.ambiguous || graph.truncated || graph.containment_classes.length > 0 }
  return evidenceObject('QuarantinePropagationEnvelope', { ...material, quarantine_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function computeIsolationBoundary(containmentGraph) {
  const classes = new Set(asArray(containmentGraph?.containment_classes))
  const blocked = classes.has('MERGE_TRUST_COLLAPSED') || classes.has('RECURSIVE_QUARANTINE_ACTIVE') || classes.has('CONTAINMENT_BOUNDARY_OVERFLOW')
  const boundaryNodes = asArray(containmentGraph?.nodes).filter((node) => node.node_type === 'containment_consequence')
  const material = { containment_hash: containmentGraph?.containment_hash ?? null, boundary_nodes: sortRecords(boundaryNodes), merge_legitimacy: blocked ? 'NULL' : 'UNCHANGED', merge_authorization_allowed: false, containment_blocked: blocked, governance_surfaces_trust_continuity: classes.has('GOVERNANCE_CONTAMINATION_EXPANDED') ? 'ISOLATED' : 'UNCHANGED' }
  return evidenceObject('ContainmentBoundaryObject', { ...material, boundary_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function computeFederatedIsolation(containmentGraph) {
  const classes = new Set(asArray(containmentGraph?.containment_classes))
  const isolated = classes.has('FEDERATED_CONTAINMENT_REQUIRED') || classes.has('LINEAGE_TRUST_ISOLATED') || classes.has('CONTAINMENT_BOUNDARY_OVERFLOW')
  const material = { containment_hash: containmentGraph?.containment_hash ?? null, federation_state: isolated ? 'FEDERATED_TRUST_ISOLATED' : 'FEDERATED_TRUST_UNCHANGED', isolated_boundaries: isolated ? sortRecords(asArray(containmentGraph?.nodes).filter((node) => ['FEDERATED_CONTAINMENT_REQUIRED', 'LINEAGE_TRUST_ISOLATED'].includes(node.classification))) : [], remote_authority_denied: true, remote_execution_legitimacy: false }
  return evidenceObject('FederatedContainmentObject', { ...material, federation_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function computeContainmentCollapse(containmentGraph, boundary = computeIsolationBoundary(containmentGraph), federation = computeFederatedIsolation(containmentGraph)) {
  const classes = asArray(containmentGraph?.containment_classes).sort()
  const collapsed = boundary.merge_legitimacy === 'NULL' || federation.federation_state === 'FEDERATED_TRUST_ISOLATED' || classes.includes('CONTAINMENT_BOUNDARY_OVERFLOW')
  const classification = classes.length === 0 ? 'NULL' : classes[0]
  const material = { containment_hash: containmentGraph?.containment_hash ?? null, boundary_hash: boundary.boundary_hash, federation_hash: federation.federation_hash, classification, containment_verdict: collapsed ? 'CONTAINMENT_ACTIVE' : 'NO_CONTAINMENT_REQUIRED', downstream_legitimacy: collapsed ? 'QUARANTINED' : 'UNCHANGED', governed_merge_allowed: false, preo_validity: collapsed ? 'NULL' : 'UNCHANGED', classes }
  return evidenceObject('ContainmentVerdictObject', { ...material, verdict_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}

export function buildContainmentEnvelope(contamination = {}, options = {}) {
  const isolation_graph = buildContainmentGraph(contamination, options)
  const quarantine = propagateContainment(contamination, options)
  const boundary = computeIsolationBoundary(isolation_graph)
  const federation = computeFederatedIsolation(isolation_graph)
  const verdict = computeContainmentCollapse(isolation_graph, boundary, federation)
  const quarantine_object_material = { quarantine_hash: quarantine.quarantine_hash, containment_hash: isolation_graph.containment_hash, quarantined_objects: quarantine.quarantined_objects, lineage_hash: isolation_graph.lineage_hash, containment_classes: isolation_graph.containment_classes }
  const legitimacy_quarantine_object = evidenceObject('LegitimacyQuarantineObject', { ...quarantine_object_material, object_hash: hashCanonical(quarantine_object_material), read_only: true, replay_neutral: true })
  const material = { quarantine_hash: quarantine.quarantine_hash, containment_hash: isolation_graph.containment_hash, lineage_hash: isolation_graph.lineage_hash, federation_hash: federation.federation_hash, boundary_hash: boundary.boundary_hash, verdict_hash: verdict.verdict_hash, classification: verdict.classification }
  return evidenceObject('QuarantineContainmentEnvelope', { ...material, status: verdict.containment_verdict, containment_classes: isolation_graph.containment_classes, legitimacy_quarantine_object, isolation_graph, quarantine, boundary, federation, verdict, envelope_hash: hashCanonical(material), read_only: true, replay_neutral: true })
}
