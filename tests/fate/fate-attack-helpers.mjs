import { canonicalize, hashCanonical } from '../../src/canonical.js'
import { readFileSync } from 'node:fs'

export const OUTCOME = Object.freeze({
  NULL: 'NULL',
  VALID: 'VALID',
  TOPOLOGY_DRIFT: 'TOPOLOGY_DRIFT',
  UNDECLARED_MUTATION_CAPABILITY: 'UNDECLARED_MUTATION_CAPABILITY',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  UNKNOWN_OBJECT_TYPE: 'UNKNOWN_OBJECT_TYPE',
})

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))

export const fixtures = Object.freeze({
  authority: fixture('valid-authority'),
  aeo: fixture('valid-aeo'),
  continuity: fixture('valid-continuity'),
  proof: fixture('valid-proof'),
  federationEnvelope: fixture('federation-envelope'),
})

export function hashObject(value) {
  return hashCanonical(value)
}
export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function makeState(overrides = {}) {
  const authority = clone(fixtures.authority)
  const aeo = clone(fixtures.aeo)
  const continuity = clone(fixtures.continuity)
  const objectHash = hashObject(aeo)
  const proof = { ...clone(fixtures.proof), validated_object_hash: objectHash, execution_hash: objectHash }

  return {
    runtimeId: 'runtime-local-fixture',
    now: '2026-05-14T00:30:00.000Z',
    consumedAuthorities: new Set(),
    seenObjectHashes: new Set(),
    usedNonces: new Set(),
    persistedProofIds: new Set([proof.proof_id]),
    authorityRegistry: new Map([[authority.authority_id, authority]]),
    continuityRegistry: new Map([[continuity.continuity_id, continuity]]),
    executionRegistry: new Map([[proof.execution_id, { execution_id: proof.execution_id, object_hash: objectHash, persisted: true }]]),
    proofRegistry: new Map([[proof.proof_id, proof]]),
    validKeyIds: new Set(['local-test-key-v1']),
    revokedAuthorityIds: new Set(),
    ...overrides,
  }
}

const same = (left, right) => canonicalize(left) === canonicalize(right)
const within = (now, expiresAt) => Number.isFinite(Date.parse(expiresAt)) && Date.parse(now) < Date.parse(expiresAt)
const requiredAeoKeys = ['object_type', 'aeo_id', 'decision_id', 'authority_id', 'session_id', 'continuity_id', 'runtime_id', 'intent', 'scope', 'target', 'validation', 'finality', 'nonce']

export function validateFederationEnvelope(envelope, state = makeState()) {
  if (!envelope || envelope.object_type !== 'FederationEnvelope') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (envelope.claims_local_authority || envelope.inherits_authority) return OUTCOME.NULL
  if (envelope.runtime_id === state.runtimeId) return OUTCOME.TOPOLOGY_DRIFT
  return OUTCOME.VALID
}

export function validateContinuity(continuity, authority, state = makeState()) {
  if (!continuity || continuity.object_type !== 'Continuity') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (!authority || authority.object_type !== 'Authority') return OUTCOME.NULL
  if (!state.continuityRegistry.has(continuity.continuity_id)) return OUTCOME.TOPOLOGY_DRIFT
  if (continuity.authority_id !== authority.authority_id || continuity.session_id !== authority.session_id) return OUTCOME.TOPOLOGY_DRIFT
  if (!continuity.chain?.includes(authority.authority_id) || !continuity.chain?.includes(authority.session_id)) return OUTCOME.NULL
  if (!within(state.now, continuity.expires_at)) return OUTCOME.NULL
  return OUTCOME.VALID
}

export function validateAuthority(authority, object, state = makeState()) {
  if (!authority || authority.object_type !== 'Authority') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (!object || object.object_type !== 'AEO') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (!state.authorityRegistry.has(authority.authority_id)) return OUTCOME.NULL
  if (state.consumedAuthorities.has(authority.authority_id) || authority.status === 'CONSUMED') return OUTCOME.NULL
  if (state.revokedAuthorityIds.has(authority.authority_id) || authority.revoked_descendants?.includes(object.authority_id)) return OUTCOME.NULL
  if (!within(state.now, authority.expires_at)) return OUTCOME.NULL
  if (!state.validKeyIds.has(authority.key_id)) return OUTCOME.NULL
  if (authority.subject !== 'github-governed-production-deploy') return OUTCOME.NULL
  if (authority.runtime_id !== state.runtimeId || object.runtime_id !== state.runtimeId) return OUTCOME.NULL
  if (authority.session_id !== object.session_id || authority.continuity_id !== object.continuity_id || authority.decision_id !== object.decision_id) return OUTCOME.NULL
  if (!same(authority.scope, object.scope) || !same(authority.scope, object.target)) return OUTCOME.NULL
  return OUTCOME.VALID
}

export function validateReplay(state, object, options = {}) {
  if (!object || object.object_type !== 'AEO') return OUTCOME.UNKNOWN_OBJECT_TYPE
  const objectHash = hashObject(object)
  if (state.seenObjectHashes.has(objectHash)) return OUTCOME.NULL
  if (state.usedNonces.has(object.nonce)) return OUTCOME.NULL
  if (options.reserve !== false) {
    state.seenObjectHashes.add(objectHash)
    state.usedNonces.add(object.nonce)
  }
  return OUTCOME.VALID
}

export function validateProof(proof, object, state = makeState()) {
  if (!proof || proof.object_type !== 'Proof') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (!('validated_object_hash' in proof)) return OUTCOME.NULL
  const objectHash = hashObject(object)
  if (proof.validated_object_hash !== objectHash || proof.execution_hash !== objectHash) return OUTCOME.NULL
  const execution = state.executionRegistry.get(proof.execution_id)
  if (!execution || execution.object_hash !== objectHash || execution.persisted !== true) return OUTCOME.NULL
  const persistedProof = state.proofRegistry.get(proof.proof_id)
  if (!persistedProof || proof.persisted !== true) return OUTCOME.NULL
  if (persistedProof.validated_object_hash !== proof.validated_object_hash || persistedProof.execution_hash !== proof.execution_hash) return OUTCOME.NULL
  return OUTCOME.VALID
}

export function validateLifecycle({ state = makeState(), authority = fixtures.authority, continuity = fixtures.continuity, object = fixtures.aeo, executedObject = object, proof = null, envelope = null, dispatch = null } = {}) {
  if (!object || object.object_type !== 'AEO') return OUTCOME.UNKNOWN_OBJECT_TYPE
  if (!requiredAeoKeys.every((key) => key in object)) return OUTCOME.INVALID_SCHEMA
  if (object.mutation_capability === true || object.extra_metadata?.mutation_capability === true) return OUTCOME.UNDECLARED_MUTATION_CAPABILITY
  if (envelope) {
    const federation = validateFederationEnvelope(envelope, state)
    if (federation !== OUTCOME.VALID) return federation
  }
  if (dispatch) {
    if (!dispatch.authority_id) return OUTCOME.NULL
    if (!same(dispatch.target, object.target)) return OUTCOME.NULL
  }
  const authorityResult = validateAuthority(authority, object, state)
  if (authorityResult !== OUTCOME.VALID) return authorityResult
  const continuityResult = validateContinuity(continuity, authority, state)
  if (continuityResult !== OUTCOME.VALID) return continuityResult
  const replayResult = validateReplay(state, object)
  if (replayResult !== OUTCOME.VALID) return replayResult
  const validatedHash = hashObject(object)
  const executedHash = hashObject(executedObject)
  if (validatedHash !== executedHash) return OUTCOME.NULL
  if (proof) return validateProof(proof, executedObject, state)
  return OUTCOME.VALID
}

export function runParallel(candidates, sharedState = makeState()) {
  return candidates.map((candidate) => validateLifecycle({ state: sharedState, ...candidate }))
}
