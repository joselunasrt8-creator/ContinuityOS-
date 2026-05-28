import { canonicalize, hashCanonical, normalize } from '../../src/canonical.js'
export { canonicalize, hashCanonical }

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
  'LINEAGE_DRIFT',
  'CONTINUITY_DRIFT',
  'PROOF_DRIFT',
  'EXECUTION_DRIFT',
  'VALIDATION_DRIFT',
  'REPLAY_DRIFT',
  'REGISTRY_DRIFT',
  'RECONCILIATION_DRIFT',
  'TOPOLOGY_DRIFT',
  'ORPHAN_PROOF',
  'ORPHAN_EXECUTION',
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
export const RECONCILIATION_NULL_REASONS = Object.freeze([
  'RECON_INPUT_HASH_MISMATCH',
  'NON_CANONICAL_INPUT_ORDER',
  'CONFLICT_SET_HASH_MISMATCH',
  'NON_REPRODUCIBLE_OUTPUT_HASH',
  'MISSING_LINEAGE_EDGE',
  'AMBIGUOUS_RECON_ORDERING',
  'NONDETERMINISTIC_QUARANTINE_MAPPING',
  'STALE_RECONCILIATION_EVIDENCE',
])

function asArray(value) { return Array.isArray(value) ? value : [] }
function truthy(value) { return value === true || value === 'true' || value === 1 || value === '1' }
function field(record, name) { return String(record?.[name] ?? '') }
function nonEmpty(value) { return typeof value === 'string' && value.length > 0 }
function lineageObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return normalize(value)
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? normalize(parsed) : null
  } catch {
    return null
  }
}
function continuityHashMaterial(input = {}) {
  const revocation = input?.revocation && typeof input.revocation === 'object' && !Array.isArray(input.revocation) ? input.revocation : {}
  return {
    actor_chain: Array.isArray(input?.actor_chain) ? input.actor_chain.map(String) : [],
    authority_chain: Array.isArray(input?.authority_chain) ? input.authority_chain.map(String) : [],
    constraints: normalize(input?.constraints ?? {}),
    continuity_id: String(input?.continuity_id || ''),
    expires_at: String(input?.expires_at || ''),
    identity_id: String(input?.identity_id || ''),
    issued_at: String(input?.issued_at || ''),
    parent_continuity_id: input?.parent_continuity_id ? String(input.parent_continuity_id) : null,
    revocation: { revoked_at: revocation.revoked_at ?? null, status: String(revocation.status || 'ACTIVE') },
    scope: normalize(input?.scope ?? {}),
    session_id: String(input?.session_id || ''),
  }
}
function continuityDrift(continuity, session, continuities) {
  if (!session) return 'continuity requires canonical session lineage'
  if (field(continuity, 'session_id') !== field(session, 'session_id')) return 'continuity session differs from session registry'
  if (field(continuity, 'identity_id') !== field(session, 'identity_id')) return 'continuity identity differs from session registry'
  if (field(continuity, 'status') !== 'ACTIVE' || field(continuity, 'revoked_at')) return 'continuity must remain ACTIVE and unrevoked'
  const canonical = lineageObject(continuity.canonical_continuity)
  if (!canonical) return 'continuity canonical lineage is missing or malformed'
  const actualHash = hashCanonical(continuityHashMaterial(canonical))
  if (actualHash !== field(continuity, 'continuity_hash') || actualHash !== String(canonical.continuity_hash || '')) return 'continuity hash must match canonical continuity lineage'
  const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ''
  if (canonicalParent !== field(continuity, 'parent_continuity_id')) return 'continuity parent differs from canonical continuity lineage'
  if (canonicalParent && !continuities.some((row) => field(row, 'continuity_id') === canonicalParent)) return 'continuity parent must resolve in continuity registry'
  return ''
}
function parseCanonicalObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return normalize(value)
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? normalize(parsed) : null
  } catch {
    return null
  }
}
function canonicalObjectHash(record) {
  const object = parseCanonicalObject(record?.canonical_aeo ?? record?.canonical_object ?? record?.validated_object ?? record?.object)
  return object ? hashCanonical(object) : ''
}
function isHistoricallyValidAuthority(status) { return ['ACTIVE', 'VALIDATED', 'RESERVED', 'EXECUTED', 'CONSUMED'].includes(String(status || '')) }
function isRejectedAuthority(status) { return ['REVOKED', 'NULL', 'EXPIRED', 'CONSUMED'].includes(String(status || '')) }

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
  const nonCanonicalInputOrder = hashCanonical(state) !== hashCanonical(canonicalRegistryState(state))
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

  for (const continuity of continuities) {
    const session = one(sessions, (row) => field(row, 'session_id') === field(continuity, 'session_id'))
    ctx.edges.push(edge('continuity_registry', recordIdentity(continuity), 'session_registry', field(continuity, 'session_id'), 'CONTINUITY_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'CONTINUITY_DRIFT'))
    if (session.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'continuity_registry', continuity, 'continuity session resolves ambiguously')
    const reason = continuityDrift(continuity, session.match, continuities)
    if (reason) addDrift(ctx, 'CONTINUITY_DRIFT', 'continuity_registry', continuity, reason)
  }

  for (const authority of authorities) {
    const session = one(sessions, (row) => field(row, 'session_id') === field(authority, 'session_id'))
    const continuity = one(continuities, (row) => field(row, 'continuity_id') === field(authority, 'continuity_id'))
    ctx.edges.push(edge('authority_registry', recordIdentity(authority), 'session_registry', field(authority, 'session_id'), 'AUTHORITY_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'LINEAGE_DRIFT'))
    ctx.edges.push(edge('authority_registry', recordIdentity(authority), 'continuity_registry', field(authority, 'continuity_id'), 'AUTHORITY_CONTINUITY', continuity.match && !continuity.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'LINEAGE_DRIFT'))
    if (!session.match || !continuity.match) addDrift(ctx, 'LINEAGE_DRIFT', 'authority_registry', authority, 'authority requires valid session and continuity')
    if (session.ambiguous || continuity.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'authority_registry', authority, 'authority lineage resolves ambiguously')
    if (continuity.match && field(continuity.match, 'session_id') !== field(authority, 'session_id')) addDrift(ctx, 'CONTINUITY_DRIFT', 'authority_registry', authority, 'authority session differs from continuity session')
  }

  for (const aeo of aeos) {
    const authority = one(authorities, (row) => field(row, 'authority_id') === field(aeo, 'authority_id'))
    ctx.edges.push(edge('aeo_registry', recordIdentity(aeo), 'authority_registry', field(aeo, 'authority_id'), 'AEO_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'LINEAGE_DRIFT'))
    if (!authority.match) addDrift(ctx, 'LINEAGE_DRIFT', 'aeo_registry', aeo, 'AEO requires valid authority')
    if (authority.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'aeo_registry', aeo, 'AEO authority resolves ambiguously')
    if (authority.match && field(aeo, 'continuity_id') && field(authority.match, 'continuity_id') && field(aeo, 'continuity_id') !== field(authority.match, 'continuity_id')) addDrift(ctx, 'CONTINUITY_DRIFT', 'aeo_registry', aeo, 'AEO continuity differs from authority continuity')
  }

  for (const validation of validations) {
    const aeo = one(aeos, (row) => field(row, 'decision_id') === field(validation, 'decision_id') && field(row, 'validated_object_hash') === field(validation, 'validated_object_hash'))
    const session = one(sessions, (row) => field(row, 'session_id') === field(validation, 'session_id'))
    const invocation = one(invocations, (row) => field(row, 'invocation_nonce') === field(validation, 'invocation_nonce') && field(row, 'validated_object_hash') === field(validation, 'validated_object_hash'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'aeo_registry', recordIdentity(aeo.match), 'VALIDATION_AEO', aeo.match && !aeo.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'VALIDATION_DRIFT'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'session_registry', field(validation, 'session_id'), 'VALIDATION_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'VALIDATION_DRIFT'))
    ctx.edges.push(edge('validation_registry', recordIdentity(validation), 'invocation_registry', field(validation, 'invocation_nonce'), 'VALIDATION_NONCE', invocation.match && !invocation.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'REPLAY_DRIFT'))
    if (!aeo.match || !session.match || !invocation.match || !field(validation, 'invocation_nonce')) addDrift(ctx, 'VALIDATION_DRIFT', 'validation_registry', validation, 'validation requires AEO, session, and nonce')
    if (aeo.ambiguous || session.ambiguous || invocation.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'validation_registry', validation, 'validation lineage resolves ambiguously')
    if (aeo.match) {
      const objectHash = canonicalObjectHash(aeo.match)
      if (!objectHash || objectHash !== field(validation, 'validated_object_hash') || objectHash !== field(aeo.match, 'validated_object_hash')) addDrift(ctx, 'LINEAGE_DRIFT', 'validation_registry', validation, 'validation hash must equal the canonical serialized object hash')
      if (canonicalize(parseCanonicalObject(aeo.match.canonical_aeo)) !== String(aeo.match.canonical_aeo || '')) addDrift(ctx, 'LINEAGE_DRIFT', 'aeo_registry', aeo.match, 'canonical object serialization is not stable')
    }
  }

  for (const execution of executions) {
    const validation = one(validations, (row) => field(row, 'decision_id') === field(execution, 'decision_id') && field(row, 'validated_object_hash') === field(execution, 'validated_object_hash') && field(row, 'invocation_nonce') === field(execution, 'invocation_nonce'))
    const session = one(sessions, (row) => field(row, 'session_id') === field(execution, 'session_id'))
    const continuity = one(continuities, (row) => field(row, 'continuity_id') === field(execution, 'continuity_id'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'validation_registry', recordIdentity(validation.match), 'EXECUTION_VALIDATION', validation.match && !validation.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_EXECUTION'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'session_registry', field(execution, 'session_id'), 'EXECUTION_SESSION', session.match && !session.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_EXECUTION'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'continuity_registry', field(execution, 'continuity_id'), 'EXECUTION_CONTINUITY', continuity.match && !continuity.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_EXECUTION'))
    const proof = one(proofs, (row) => field(row, 'execution_id') === field(execution, 'execution_id') && field(row, 'decision_id') === field(execution, 'decision_id') && field(row, 'validated_object_hash') === field(execution, 'validated_object_hash'))
    const authority = one(authorities, (row) => field(row, 'decision_id') === field(execution, 'decision_id'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'proof_registry', proof.match ? recordIdentity(proof.match) : '', 'EXECUTION_PROOF', proof.match && !proof.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'PROOF_DRIFT'))
    ctx.edges.push(edge('execution_registry', recordIdentity(execution), 'authority_registry', authority.match ? recordIdentity(authority.match) : '', 'EXECUTION_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'LINEAGE_DRIFT'))
    if (!validation.match || !session.match || !continuity.match) addDrift(ctx, 'ORPHAN_EXECUTION', 'execution_registry', execution, 'execution requires validation, session, and continuity')
    if (!proof.match) addDrift(ctx, 'PROOF_DRIFT', 'execution_registry', execution, 'execution requires canonical proof lineage')
    if (!authority.match || !isHistoricallyValidAuthority(field(authority.match, 'status')) || field(authority.match, 'session_id') !== field(execution, 'session_id')) addDrift(ctx, 'LINEAGE_DRIFT', 'execution_registry', execution, 'execution authority must exist and be historically valid for the execution session')
    if (validation.ambiguous || session.ambiguous || continuity.ambiguous || proof.ambiguous || authority.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'execution_registry', execution, 'execution lineage resolves ambiguously')
    if (validation.match && (field(validation.match, 'validated_object_hash') !== field(execution, 'validated_object_hash') || field(validation.match, 'status') !== 'VALID' || field(validation.match, 'result') !== 'VALID')) addDrift(ctx, 'VALIDATION_DRIFT', 'execution_registry', execution, 'execution requires matching VALID validation result')
    if (field(execution, 'status') && field(execution, 'status') !== 'EXECUTED') addDrift(ctx, 'EXECUTION_DRIFT', 'execution_registry', execution, 'execution status must remain EXECUTED within reconciled lineage')
  }

  for (const proof of proofs) {
    const execution = one(executions, (row) => field(row, 'execution_id') === field(proof, 'execution_id'))
    const authority = one(authorities, (row) => field(row, 'decision_id') === field(proof, 'decision_id'))
    const continuity = one(continuities, (row) => field(row, 'continuity_id') === field(proof, 'continuity_id'))
    ctx.edges.push(edge('proof_registry', recordIdentity(proof), 'execution_registry', field(proof, 'execution_id'), 'PROOF_EXECUTION', execution.match && !execution.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_PROOF'))
    ctx.edges.push(edge('proof_registry', recordIdentity(proof), 'authority_registry', recordIdentity(authority.match), 'PROOF_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_PROOF'))
    ctx.edges.push(edge('proof_registry', recordIdentity(proof), 'continuity_registry', field(proof, 'continuity_id'), 'PROOF_CONTINUITY', continuity.match && !continuity.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'ORPHAN_PROOF'))
    if (!execution.match) addDrift(ctx, 'ORPHAN_EXECUTION', 'proof_registry', proof, 'proof references missing execution lineage')
    if (!execution.match || !authority.match || !field(proof, 'validated_object_hash')) addDrift(ctx, 'ORPHAN_PROOF', 'proof_registry', proof, 'proof requires execution, authority, and validated object hash')
    if (authority.match && (!isHistoricallyValidAuthority(field(authority.match, 'status')) || field(authority.match, 'session_id') !== field(proof, 'session_id'))) addDrift(ctx, 'LINEAGE_DRIFT', 'proof_registry', proof, 'proof authority must exist and be historically valid for the proof session')
    if (!continuity.match) addDrift(ctx, 'ORPHAN_PROOF', 'proof_registry', proof, 'proof requires continuity lineage')
    if (execution.ambiguous || authority.ambiguous || continuity.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'proof_registry', proof, 'proof lineage resolves ambiguously')
    if (execution.match && field(execution.match, 'validated_object_hash') !== field(proof, 'validated_object_hash')) addDrift(ctx, 'PROOF_DRIFT', 'proof_registry', proof, 'proof hash differs from execution hash')
    if (continuity.match && field(proof, 'continuity_hash') !== field(continuity.match, 'continuity_hash')) addDrift(ctx, 'PROOF_DRIFT', 'proof_registry', proof, 'proof continuity hash differs from continuity registry')
    const authorityLineage = lineageObject(proof.authority_lineage)
    const executionLineage = lineageObject(proof.execution_lineage)
    if (!authorityLineage || !executionLineage || (authority.match && String(authorityLineage.authority_id || '') !== field(authority.match, 'authority_id')) || (execution.match && String(executionLineage.execution_id || '') !== field(execution.match, 'execution_id'))) addDrift(ctx, 'PROOF_DRIFT', 'proof_registry', proof, 'proof authority and execution lineage references must resolve deterministically')
  }

  const proofTruth = new Map()
  for (const proof of proofs) {
    const key = `${field(proof, 'decision_id')}:${field(proof, 'validated_object_hash')}`
    if (!key.includes(':') || key === ':') continue
    const set = proofTruth.get(key) ?? []
    set.push(proof)
    proofTruth.set(key, set)
  }
  for (const duplicateSet of proofTruth.values()) {
    if (duplicateSet.length > 1) {
      for (const proof of duplicateSet) addDrift(ctx, 'PROOF_DRIFT', 'proof_registry', proof, 'duplicate proof cannot become canonical truth')
    }
  }
  const executionByAuthority = new Map()
  for (const execution of executions) {
    const key = field(execution, 'decision_id')
    const set = executionByAuthority.get(key) ?? []
    set.push(execution)
    executionByAuthority.set(key, set)
  }
  for (const authority of authorities) {
    const executionsForAuthority = executionByAuthority.get(field(authority, 'decision_id')) ?? []
    if ((field(authority, 'status') === 'REVOKED' && executionsForAuthority.length > 0) || executionsForAuthority.length > 1) addDrift(ctx, 'REPLAY_DRIFT', 'authority_registry', authority, 'revoked or already consumed authority cannot be reused for execution')
    if (field(authority, 'status') === 'CONSUMED' && executionsForAuthority.length > 1) addDrift(ctx, 'REPLAY_DRIFT', 'authority_registry', authority, 'consumed authority cannot authorize multiple executions')
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
    if (objects.size !== 1) addDrift(ctx, objects.size === 0 ? 'REPLAY_DRIFT' : 'REPLAY_DRIFT', 'invocation_registry', invocation, 'invocation nonce must map to exactly one validated/executed object')
    const validation = one(validations, (row) => field(row, 'decision_id') === field(invocation, 'decision_id') && field(row, 'validated_object_hash') === field(invocation, 'validated_object_hash') && field(row, 'invocation_nonce') === field(invocation, 'invocation_nonce'))
    const execution = one(executions, (row) => field(row, 'decision_id') === field(invocation, 'decision_id') && field(row, 'validated_object_hash') === field(invocation, 'validated_object_hash') && field(row, 'invocation_nonce') === field(invocation, 'invocation_nonce'))
    if (!validation.match || !execution.match) addDrift(ctx, 'REPLAY_DRIFT', 'invocation_registry', invocation, 'invocation requires validation and execution lineage')
    if (validation.ambiguous || execution.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'invocation_registry', invocation, 'invocation lineage resolves ambiguously')
    if (field(invocation, 'status') !== 'EXECUTED') addDrift(ctx, 'REPLAY_DRIFT', 'invocation_registry', invocation, 'invocation status must remain EXECUTED')
    if ((validation.match && field(invocation, 'continuity_id') !== field(validation.match, 'continuity_id')) || (execution.match && field(invocation, 'continuity_id') !== field(execution.match, 'continuity_id'))) addDrift(ctx, 'REPLAY_DRIFT', 'invocation_registry', invocation, 'invocation continuity must match validation and execution lineage')
  }

  for (const preo of limited.preo_registry) {
    const authority = one(authorities, (row) => field(row, 'decision_id') === field(preo, 'decision_id') && field(row, 'authority_id') === field(preo, 'authority_id'))
    const aeo = one(aeos, (row) => field(row, 'decision_id') === field(preo, 'decision_id') && field(row, 'validated_object_hash') === field(preo, 'reviewed_hash'))
    ctx.edges.push(edge('preo_registry', recordIdentity(preo), 'authority_registry', field(preo, 'authority_id'), 'PREO_AUTHORITY', authority.match && !authority.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'REGISTRY_DRIFT'))
    ctx.edges.push(edge('preo_registry', recordIdentity(preo), 'aeo_registry', field(preo, 'reviewed_hash'), 'PREO_AEO_REVIEWED_HASH', aeo.match && !aeo.ambiguous ? 'RESOLVED' : 'UNRESOLVED', 'REGISTRY_DRIFT'))
    if (!authority.match || !aeo.match) addDrift(ctx, 'REGISTRY_DRIFT', 'preo_registry', preo, 'PREO requires authority and reviewed AEO hash lineage')
    if (authority.ambiguous || aeo.ambiguous) addDrift(ctx, 'RECONCILIATION_DRIFT', 'preo_registry', preo, 'PREO lineage resolves ambiguously')
    if (authority.match && field(preo, 'continuity_id') !== field(authority.match, 'continuity_id')) addDrift(ctx, 'REGISTRY_DRIFT', 'preo_registry', preo, 'PREO continuity differs from authority lineage')
    if (field(preo, 'status') !== 'PREO_VALID') addDrift(ctx, 'REGISTRY_DRIFT', 'preo_registry', preo, 'PREO status must remain PREO_VALID')
    if (truthy(preo.executable) || truthy(preo.creates_authority) || truthy(preo.proof_generating)) addDrift(ctx, 'REGISTRY_DRIFT', 'preo_registry', preo, 'PREO must bind governed merge legitimacy only')
  }
  for (const topology of limited.runtime_topology_registry) {
    if (truthy(topology.executable) || truthy(topology.deployment_capable) || truthy(topology.creates_authority) || topology.evidence_only === 'false') addDrift(ctx, 'TOPOLOGY_DRIFT', 'runtime_topology_registry', topology, 'topology evidence became authoritative or executable')
  }
  for (const governance of limited.recursive_governance_containment_registry) {
    if (truthy(governance.executable) || truthy(governance.deployment_capable) || truthy(governance.creates_authority) || governance.evidence_only === 'false') addDrift(ctx, 'TOPOLOGY_DRIFT', 'recursive_governance_containment_registry', governance, 'recursive governance containment must remain evidence-only')
  }
  for (const root of limited.root_authority_observability_registry) {
    if (truthy(root.executable) || truthy(root.deployment_capable) || truthy(root.creates_authority) || root.non_authoritative === 'false') addDrift(ctx, 'REGISTRY_DRIFT', 'root_authority_observability_registry', root, 'root authority evidence cannot grant authority')
  }
  for (const closure of limited.unauthorized_mutation_closure_registry) {
    if (truthy(closure.executable) || truthy(closure.creates_authority) || truthy(closure.proof_generating)) addDrift(ctx, 'REGISTRY_DRIFT', 'unauthorized_mutation_closure_registry', closure, 'observability evidence cannot become proof or authority')
  }

  const unresolved_edges = ctx.edges.filter((item) => item.status !== 'RESOLVED').sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const drift_classes = [...new Set(ctx.drift.map((item) => item.drift_class))].sort()
  const orphaned_records = [...ctx.orphans].sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const reconciliation_input_hash = hashCanonical(canonical)
  const conflict_set_hash = hashCanonical({ unresolved_edges, orphaned_records, drift_classes })
  const null_reasons = []
  if (nonCanonicalInputOrder) null_reasons.push('NON_CANONICAL_INPUT_ORDER')
  if (unresolved_edges.length > 0) null_reasons.push('MISSING_LINEAGE_EDGE')
  if (drift_classes.includes('RECONCILIATION_DRIFT')) null_reasons.push('AMBIGUOUS_RECON_ORDERING')
  if (drift_classes.includes('CONTINUITY_DRIFT')) null_reasons.push('STALE_RECONCILIATION_EVIDENCE')

  const lineage_edges = ctx.edges.sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b)))
  const registry_set_hash = hashCanonical(limited)
  const lineage_graph_hash = hashCanonical(lineage_edges)
  const continuity_graph_hash = hashCanonical(lineage_edges.filter((item) => item.relation.includes('CONTINUITY') || item.relation.includes('SESSION')))
  const proof_graph_hash = hashCanonical(lineage_edges.filter((item) => item.from_registry === 'proof_registry' || item.to_registry === 'proof_registry'))
  const replay_graph_hash = hashCanonical({ invocations, nonce_to_objects: [...nonceToObjects.entries()].map(([nonce, objects]) => [nonce, [...objects].sort()]).sort() })
  const topology_binding_hash = hashCanonical(limited.runtime_topology_registry)
  const governance_binding_hash = hashCanonical({ recursive: limited.recursive_governance_containment_registry, root: limited.root_authority_observability_registry, closure: limited.unauthorized_mutation_closure_registry, preo: limited.preo_registry })
  const deterministicNullReasons = Object.freeze([...new Set(null_reasons)].sort())
  const containment_status = deterministicNullReasons.length > 0 ? 'NULL' : 'RECONCILED_DETERMINISTIC'
  const legitimacy_status = containment_status === 'RECONCILED_DETERMINISTIC' ? 'LEGITIMATE' : 'NULL'
  const equivalence = Object.freeze({ object_type: 'CrossRegistryEquivalence', equivalent: containment_status === 'RECONCILED_DETERMINISTIC', drift_classes, legitimacy_status })
  const continuity_proof = Object.freeze({ object_type: 'CrossRegistryContinuityProof', replay_neutral: true, replay_consumed: false, continuity_preserved: containment_status === 'RECONCILED_DETERMINISTIC', legitimacy_status })
  const reconciliation_equivalence_hash = hashCanonical({ equivalence, continuity_proof, drift_classes, unresolved_edges, orphaned_records })
  const reconciliation_output_hash = hashCanonical({ reconciliation_input_hash, conflict_set_hash, registry_set_hash, lineage_graph_hash, continuity_graph_hash, proof_graph_hash, replay_graph_hash, topology_binding_hash, governance_binding_hash, reconciliation_equivalence_hash, null_reasons: deterministicNullReasons })
  const reproduced_output_hash = hashCanonical({ reconciliation_input_hash, conflict_set_hash, registry_set_hash, lineage_graph_hash, continuity_graph_hash, proof_graph_hash, replay_graph_hash, topology_binding_hash, governance_binding_hash, reconciliation_equivalence_hash, null_reasons: deterministicNullReasons })
  const reproducible = reconciliation_output_hash === reproduced_output_hash
  const quarantine_status = reproducible ? (deterministicNullReasons.length > 0 ? 'RECONCILED_DRIFT' : 'RECONCILED_DETERMINISTIC') : 'QUARANTINED_NONDETERMINISTIC'

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
    reconciliation_input_hash,
    conflict_set_hash,
    reconciliation_output_hash,
    determinism_version: 'v1',
    lineage_edges,
    continuity_proof,
    equivalence,
    drift: ctx.drift.sort((a, b) => hashCanonical(a).localeCompare(hashCanonical(b))),
    drift_classes,
    unresolved_edges,
    orphaned_records,
    containment_status,
    quarantine_status,
    null_reasons: deterministicNullReasons,
    legitimacy_status,
    ...EVIDENCE_FLAGS,
  })
}


export function deterministicReconciliationReport(snapshot = {}) {
  const report = {
    object_type: 'DeterministicCrossRegistryReconciliationReport',
    reconciliation_id: String(snapshot.reconciliation_id || ''),
    registry_set_hash: String(snapshot.registry_set_hash || ''),
    lineage_graph_hash: String(snapshot.lineage_graph_hash || ''),
    continuity_graph_hash: String(snapshot.continuity_graph_hash || ''),
    proof_graph_hash: String(snapshot.proof_graph_hash || ''),
    replay_graph_hash: String(snapshot.replay_graph_hash || ''),
    topology_binding_hash: String(snapshot.topology_binding_hash || ''),
    governance_binding_hash: String(snapshot.governance_binding_hash || ''),
    reconciliation_equivalence_hash: String(snapshot.reconciliation_equivalence_hash || ''),
    reconciliation_input_hash: String(snapshot.reconciliation_input_hash || ''),
    conflict_set_hash: String(snapshot.conflict_set_hash || ''),
    reconciliation_output_hash: String(snapshot.reconciliation_output_hash || ''),
    determinism_version: String(snapshot.determinism_version || 'v1'),
    containment_status: String(snapshot.containment_status || 'NULL'),
    quarantine_status: String(snapshot.quarantine_status || 'RECONCILED_DRIFT'),
    legitimacy_status: String(snapshot.legitimacy_status || 'NULL'),
    null_reasons: asArray(snapshot.null_reasons).map(String).sort(),
    drift_classes: asArray(snapshot.drift_classes).map(String).sort(),
    unresolved_edges: sortRecords(asArray(snapshot.unresolved_edges)),
    orphaned_records: sortRecords(asArray(snapshot.orphaned_records)),
    drift: sortRecords(asArray(snapshot.drift)),
    equivalence: normalize(snapshot.equivalence && typeof snapshot.equivalence === 'object' ? snapshot.equivalence : {}),
    continuity_proof: normalize(snapshot.continuity_proof && typeof snapshot.continuity_proof === 'object' ? snapshot.continuity_proof : {}),
    evidence_flags: routeEvidenceFlags(),
  }
  return Object.freeze(report)
}

export function routeEvidenceFlags() { return { ...EVIDENCE_FLAGS } }
export function canAuthorizeFromReconciliation() { return false }
