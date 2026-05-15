import { createHash } from 'node:crypto'

export const CANONICAL_CROSS_REGISTRY_ORDER = Object.freeze([
  'session_registry',
  'continuity_registry',
  'authority_registry',
  'aeo_registry',
  'validation_registry',
  'execution_registry',
  'proof_registry',
  'invocation_registry',
  'preo_registry',
  'runtime_topology_registry',
  'recursive_governance_containment_registry',
  'root_authority_observability_registry',
  'unauthorized_mutation_closure_registry',
])

export const CROSS_REGISTRY_DRIFT_CLASSES = Object.freeze([
  'REGISTRY_LINEAGE_MISMATCH',
  'ORPHANED_AUTHORITY_RECORD',
  'ORPHANED_AEO_RECORD',
  'ORPHANED_VALIDATION_RECORD',
  'ORPHANED_EXECUTION_RECORD',
  'ORPHANED_PROOF_RECORD',
  'ORPHANED_INVOCATION_RECORD',
  'VALIDATED_HASH_DISCONTINUITY',
  'EXECUTION_PROOF_HASH_MISMATCH',
  'SESSION_CONTINUITY_DIVERGENCE',
  'AUTHORITY_CONTINUITY_DIVERGENCE',
  'REPLAY_GRAPH_FRAGMENTATION',
  'TOPOLOGY_BINDING_DIVERGENCE',
  'GOVERNANCE_BINDING_DIVERGENCE',
  'ROOT_AUTHORITY_EVIDENCE_ESCALATION',
  'OBSERVABILITY_RECORD_AUTHORITY_ESCALATION',
  'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY',
])

const EVIDENCE_FLAGS = Object.freeze({
  evidence_only: true,
  replay_neutral: true,
  non_authoritative: true,
  executable: false,
  deployment_capable: false,
  creates_authority: false,
  proof_generating: false,
})

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
  if (value === undefined) return null
  return value
}

export function canonicalize(value) { return JSON.stringify(normalize(value)) }
export function hashCanonical(value) { return createHash('sha256').update(canonicalize(value)).digest('hex') }
function asArray(value) { return Array.isArray(value) ? value : [] }
function truthy(value) { return value === true || value === 'true' || value === 1 || value === '1' }
function field(record, name) { return String(record?.[name] ?? '') }
function nonEmpty(value) { return typeof value === 'string' && value.length > 0 }

function recordIdentity(record) {
  if (!record || typeof record !== 'object') return canonicalize(record)
  return String(
    record.session_id ?? record.continuity_id ?? record.authority_id ?? record.aeo_id ?? record.validation_id ??
    record.execution_id ?? record.proof_id ?? record.invocation_nonce ?? record.preo_id ?? record.snapshot_id ??
    record.governance_observation_id ?? record.observation_id ?? record.closure_id ?? record.reconciliation_id ?? canonicalize(record)
  )
}

function sortRecords(records) {
  return [...records].map(normalize).sort((left, right) => recordIdentity(left).localeCompare(recordIdentity(right)) || canonicalize(left).localeCompare(canonicalize(right)))
}

export function canonicalRegistryState(state = {}) {
  return Object.fromEntries(CANONICAL_CROSS_REGISTRY_ORDER.map((registry) => [registry, sortRecords(asArray(state[registry]))]))
}

function edge(from_registry, from_id, to_registry, to_id, relation, status = 'RESOLVED', drift_class = '') {
  return Object.freeze({ object_type: 'CrossRegistryLineageEdge', from_registry, from_id, to_registry, to_id, relation, status, drift_class })
}

function drift(drift_class, registry, record_id, reason) {
  return Object.freeze({ object_type: 'CrossRegistryDrift', drift_class, registry, record_id, reason, legitimacy_status: 'NULL' })
}

function addDrift(ctx, drift_class, registry, record, reason) {
  const item = drift(drift_class, registry, recordIdentity(record), reason)
  ctx.drift.push(item)
  ctx.orphans.push({ registry, record_id: recordIdentity(record), drift_class, reason })
}

function one(records, predicate) {
  const matches = records.filter(predicate)
  return { match: matches[0] ?? null, ambiguous: matches.length > 1, count: matches.length }
}

export function traverseCrossRegistries(state = {}, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 1000
  const canonical = canonicalRegistryState(state)
  const limited = Object.fromEntries(Object.entries(canonical).map(([registry, records]) => [registry, records.slice(0, limit)]))
  const ctx = { edges: [], drift: [], orphans: [] }
  const sessions = limited.session_registry
  const continuities = limited.continuity_registry
  const authorities = limited.authority_registry
  const aeos = limited.aeo_registry
  const validations = limited.validation_registry
  const executions = limited.execution_registry
  const proofs = limited.proof_registry
  const invocations = limited.invocation_registry

  for (const authority of authorities) {
    const session = one(sessions, (row) => field(row, 'session_id') === field(authority, 'session_id'))
    const continuity = one(continuities, (row) => field(row, 'continuity_id') === field(authority, 'continuity_id'))
    ctx.edges.push(edge('authority_registry', recordIdentity(authority), 'session_registry', field(authority, 'session_id'), 'AUTHORITY_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_AUTHORITY_RECORD'))
    ctx.edges.push(edge('authority_registry', recordIdentity(authority), 'continuity_registry', field(authority, 'continuity_id'), 'AUTHORITY_CONTINUITY', continuity.match && !continuity.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_AUTHORITY_RECORD'))
    if (!session.match || !continuity.match) addDrift(ctx, 'ORPHANED_AUTHORITY_RECORD', 'authority_registry', authority, 'authority requires valid session and continuity')
    if (session.ambiguous || continuity.ambiguous) addDrift(ctx, 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY', 'authority_registry', authority, 'authority lineage resolves ambiguously')
    if (continuity.match && field(continuity.match, 'session_id') !== field(authority, 'session_id')) addDrift(ctx, 'SESSION_CONTINUITY_DIVERGENCE', 'authority_registry', authority, 'authority session differs from continuity session')
  }

  for (const aeo of aeos) {
    const authority = one(authorities, (row) => field(row, 'authority_id') === field(aeo, 'authority_id'))
    ctx.edges.push(edge('aeo_registry', recordIdentity(aeo), 'authority_registry', field(aeo, 'authority_id'), 'AEO_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_AEO_RECORD'))
    if (!authority.match) addDrift(ctx, 'ORPHANED_AEO_RECORD', 'aeo_registry', aeo, 'AEO requires valid authority')
    if (authority.ambiguous) addDrift(ctx, 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY', 'aeo_registry', aeo, 'AEO authority resolves ambiguously')
    if (authority.match && field(aeo, 'continuity_id') && field(authority.match, 'continuity_id') && field(aeo, 'continuity_id') !== field(authority.match, 'continuity_id')) addDrift(ctx, 'AUTHORITY_CONTINUITY_DIVERGENCE', 'aeo_registry', aeo, 'AEO continuity differs from authority continuity')
  }

  for (const validation of validations) {
    const aeo = one(aeos, (row) => field(row, 'decision_id') === field(validation, 'decision_id') && field(row, 'validated_object_hash') === field(validation, 'validated_object_hash'))
    const session = one(sessions, (row) => field(row, 'session_id') === field(validation, 'session_id'))
    const invocation = one(invocations, (row) => field(row, 'invocation_nonce') === field(validation, 'invocation_nonce') && field(row, 'validated_object_hash') === field(validation, 'validated_object_hash'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'aeo_registry', recordIdentity(aeo.match), 'VALIDATION_AEO', aeo.match && !aeo.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_VALIDATION_RECORD'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'session_registry', field(validation, 'session_id'), 'VALIDATION_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_VALIDATION_RECORD'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'invocation_registry', field(validation, 'invocation_nonce'), 'VALIDATION_NONCE', invocation.match && !invocation.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_INVOCATION_RECORD'))
    if (!aeo.match || !session.match || !invocation.match || !field(validation, 'invocation_nonce')) addDrift(ctx, 'ORPHANED_VALIDATION_RECORD', 'validation_registry', validation, 'validation requires AEO, session, and nonce')
    if (aeo.ambiguous || session.ambiguous || invocation.ambiguous) addDrift(ctx, 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY', 'validation_registry', validation, 'validation lineage resolves ambiguously')
  }

  for (const execution of executions) {
    const validation = one(validations, (row) => field(row, 'decision_id') === field(execution, 'decision_id') && field(row, 'validated_object_hash') === field(execution, 'validated_object_hash') && field(row, 'invocation_nonce') === field(execution, 'invocation_nonce'))
    const session = one(sessions, (row) => field(row, 'session_id') === field(execution, 'session_id'))
    const continuity = one(continuities, (row) => field(row, 'continuity_id') === field(execution, 'continuity_id'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'validation_registry', recordIdentity(validation.match), 'EXECUTION_VALIDATION', validation.match && !validation.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_EXECUTION_RECORD'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'session_registry', field(execution, 'session_id'), 'EXECUTION_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_EXECUTION_RECORD'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'continuity_registry', field(execution, 'continuity_id'), 'EXECUTION_CONTINUITY', continuity.match && !continuity.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_EXECUTION_RECORD'))
    if (!validation.match || !session.match || !continuity.match) addDrift(ctx, 'ORPHANED_EXECUTION_RECORD', 'execution_registry', execution, 'execution requires validation, session, and continuity')
    if (validation.ambiguous || session.ambiguous || continuity.ambiguous) addDrift(ctx, 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY', 'execution_registry', execution, 'execution lineage resolves ambiguously')
    if (validation.match && field(validation.match, 'validated_object_hash') !== field(execution, 'validated_object_hash')) addDrift(ctx, 'VALIDATED_HASH_DISCONTINUITY', 'execution_registry', execution, 'execution hash differs from validation hash')
  }

  for (const proof of proofs) {
    const execution = one(executions, (row) => field(row, 'execution_id') === field(proof, 'execution_id'))
    const authority = one(authorities, (row) => field(row, 'decision_id') === field(proof, 'decision_id'))
    ctx.edges.push(edge('proof_registry', recordIdentity(proof), 'execution_registry', field(proof, 'execution_id'), 'PROOF_EXECUTION', execution.match && !execution.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_PROOF_RECORD'))
    ctx.edges.push(edge('proof_registry', recordIdentity(proof), 'authority_registry', recordIdentity(authority.match), 'PROOF_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHANED_PROOF_RECORD'))
    if (!execution.match || !authority.match || !field(proof, 'validated_object_hash')) addDrift(ctx, 'ORPHANED_PROOF_RECORD', 'proof_registry', proof, 'proof requires execution, authority, and validated object hash')
    if (execution.ambiguous || authority.ambiguous) addDrift(ctx, 'CROSS_REGISTRY_RECONCILIATION_AMBIGUITY', 'proof_registry', proof, 'proof lineage resolves ambiguously')
    if (execution.match && field(execution.match, 'validated_object_hash') !== field(proof, 'validated_object_hash')) addDrift(ctx, 'EXECUTION_PROOF_HASH_MISMATCH', 'proof_registry', proof, 'proof hash differs from execution hash')
  }

  const nonceToObjects = new Map()
  for (const record of [...validations, ...executions]) {
    const nonce = field(record, 'invocation_nonce')
    if (!nonce) continue
    const key = `${nonce}`
    const values = nonceToObjects.get(key) ?? new Set()
    values.add(`${field(record, 'decision_id')}:${field(record, 'validated_object_hash')}`)
    nonceToObjects.set(key, values)
  }
  for (const invocation of invocations) {
    const nonce = field(invocation, 'invocation_nonce')
    const objects = nonceToObjects.get(nonce) ?? new Set()
    if (objects.size !== 1) addDrift(ctx, objects.size === 0 ? 'ORPHANED_INVOCATION_RECORD' : 'REPLAY_GRAPH_FRAGMENTATION', 'invocation_registry', invocation, 'invocation nonce must map to exactly one validated/executed object')
  }

  for (const preo of limited.preo_registry) {
    if (truthy(preo.executable) || truthy(preo.creates_authority) || truthy(preo.proof_generating)) addDrift(ctx, 'OBSERVABILITY_RECORD_AUTHORITY_ESCALATION', 'preo_registry', preo, 'PREO must bind governed merge legitimacy only')
  }
  for (const topology of limited.runtime_topology_registry) {
    if (truthy(topology.executable) || truthy(topology.deployment_capable) || truthy(topology.creates_authority) || topology.evidence_only === 'false') addDrift(ctx, 'TOPOLOGY_BINDING_DIVERGENCE', 'runtime_topology_registry', topology, 'topology evidence became authoritative or executable')
  }
  for (const governance of limited.recursive_governance_containment_registry) {
    if (truthy(governance.executable) || truthy(governance.deployment_capable) || truthy(governance.creates_authority) || governance.evidence_only === 'false') addDrift(ctx, 'GOVERNANCE_BINDING_DIVERGENCE', 'recursive_governance_containment_registry', governance, 'recursive governance containment must remain evidence-only')
  }
  for (const root of limited.root_authority_observability_registry) {
    if (truthy(root.executable) || truthy(root.deployment_capable) || truthy(root.creates_authority) || root.non_authoritative === 'false') addDrift(ctx, 'ROOT_AUTHORITY_EVIDENCE_ESCALATION', 'root_authority_observability_registry', root, 'root authority evidence cannot grant authority')
  }
  for (const closure of limited.unauthorized_mutation_closure_registry) {
    if (truthy(closure.executable) || truthy(closure.creates_authority) || truthy(closure.proof_generating)) addDrift(ctx, 'OBSERVABILITY_RECORD_AUTHORITY_ESCALATION', 'unauthorized_mutation_closure_registry', closure, 'observability evidence cannot become proof or authority')
  }

  const unresolved_edges = ctx.edges.filter((item) => item.status !== 'RESOLVED').sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const drift_classes = [...new Set(ctx.drift.map((item) => item.drift_class))].sort()
  const orphaned_records = [...ctx.orphans].sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const containment_status = drift_classes.length > 0 || unresolved_edges.length > 0 ? 'RECONCILIATION_REQUIRED' : 'RECONCILED'
  const legitimacy_status = containment_status === 'RECONCILED' ? 'LEGITIMATE' : 'NULL'

  const lineage_edges = ctx.edges.sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const equivalence = Object.freeze({ object_type: 'CrossRegistryEquivalence', equivalent: containment_status === 'RECONCILED', drift_classes, legitimacy_status })
  const continuity_proof = Object.freeze({ object_type: 'CrossRegistryContinuityProof', replay_neutral: true, replay_consumed: false, continuity_preserved: containment_status === 'RECONCILED', legitimacy_status })

  const registry_set_hash = hashCanonical(limited)
  const lineage_graph_hash = hashCanonical(lineage_edges)
  const continuity_graph_hash = hashCanonical(lineage_edges.filter((item) => item.relation.includes('CONTINUITY') || item.relation.includes('SESSION')))
  const proof_graph_hash = hashCanonical(lineage_edges.filter((item) => item.from_registry === 'proof_registry' || item.to_registry === 'proof_registry'))
  const replay_graph_hash = hashCanonical({ invocations, nonce_to_objects: [...nonceToObjects.entries()].map(([nonce, objects]) => [nonce, [...objects].sort()]).sort() })
  const topology_binding_hash = hashCanonical(limited.runtime_topology_registry)
  const governance_binding_hash = hashCanonical({ recursive: limited.recursive_governance_containment_registry, root: limited.root_authority_observability_registry, closure: limited.unauthorized_mutation_closure_registry, preo: limited.preo_registry })
  const reconciliation_equivalence_hash = hashCanonical({ equivalence, continuity_proof, drift_classes, unresolved_edges, orphaned_records })

  return Object.freeze({
    object_type: 'CrossRegistryReconciliationSnapshot',
    reconciliation_id: hashCanonical({ registry_set_hash, lineage_graph_hash, continuity_graph_hash, proof_graph_hash, replay_graph_hash, topology_binding_hash, governance_binding_hash, reconciliation_equivalence_hash }),
    registry_set_hash,
    lineage_graph_hash,
    continuity_graph_hash,
    proof_graph_hash,
    replay_graph_hash,
    topology_binding_hash,
    governance_binding_hash,
    reconciliation_equivalence_hash,
    lineage_edges,
    continuity_proof,
    equivalence,
    drift: ctx.drift.sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b))),
    drift_classes,
    unresolved_edges,
    orphaned_records,
    containment_status,
    legitimacy_status,
    ...EVIDENCE_FLAGS,
  })
}

export function routeEvidenceFlags() { return { ...EVIDENCE_FLAGS } }
export function canAuthorizeFromReconciliation() { return false }
