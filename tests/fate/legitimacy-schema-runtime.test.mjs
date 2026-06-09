import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLegitimacySchema } from '../../runtime/legitimacy/validators/schema-validator.js'

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)
const now = '2026-05-14T00:00:00.000Z'

function authority(overrides = {}) {
  return {
    object_type: 'Authority',
    authority_id: 'auth-1',
    decision_id: 'decision-1',
    owner: 'owner-1',
    identity_id: 'identity-1',
    session_id: 'session-1',
    continuity_id: 'continuity-1',
    intent: 'governed production deploy',
    scope: { environment: 'production' },
    constraints: { canonical_path: ['/authority', '/compile', '/validate', '/execute', '/proof'] },
    expiry: now,
    status: 'ACTIVE',
    ...overrides,
  }
}

function atao(overrides = {}) {
  return {
    object_type: 'ATAO',
    atao_id: 'atao-1',
    agent_id: 'agent-1',
    session_id: 'session-1',
    intent: 'prepare structured proposal',
    proposed_action: { system: 'github', action: 'open_pr', parameters: { branch: 'runtime-validation' } },
    scope: { repository: 'mindshift-demo' },
    risk_class: 'P2',
    timestamp: now,
    ...overrides,
  }
}

function aeo(overrides = {}) {
  return {
    intent: 'governed production deploy',
    scope: { environment: 'production' },
    validation: {
      decision_id: 'decision-1',
      authority_id: 'auth-1',
      require_active_authority: true,
      require_exact_object_hash: true,
      require_session_continuity: true,
    },
    target: { system: 'github', action: 'governed_deploy' },
    finality: { proof_required: true, proof_type: 'ProofObject', registry_required: true },
    ...overrides,
  }
}

function federationEnvelope(overrides = {}) {
  return {
    object_type: 'FederationEnvelope',
    runtime_id: 'local-runtime',
    remote_runtime_id: 'remote-runtime',
    payload_hash: hashA,
    evidence_hash: hashB,
    authority_effect: 'none',
    federation_boundary: 'remote_evidence_not_local_authority',
    observed_at: now,
    ...overrides,
  }
}

function continuityObject(overrides = {}) {
  return {
    object_type: 'ContinuityObject',
    continuity_id: 'continuity-1',
    identity_id: 'identity-1',
    session_id: 'session-1',
    parent_continuity_id: null,
    authority_chain: ['auth-1'],
    actor_chain: ['agent-1'],
    scope: { environment: 'production' },
    constraints: { max_depth: 1, delegation_allowed: false },
    revocation: { status: 'ACTIVE', revoked_at: null },
    issued_at: now,
    expires_at: '2026-05-15T00:00:00.000Z',
    continuity_hash: hashC,
    ...overrides,
  }
}


test('valid Authority object -> VALID_SCHEMA', () => {
  const result = validateLegitimacySchema(authority())
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.object_type, 'Authority')
  assert.match(result.object_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(result.errors, [])
  assert.ok(result.canonicalized_object)
})

test('missing Authority field -> NULL', () => {
  const candidate = authority()
  delete candidate.authority_id
  const result = validateLegitimacySchema(candidate)
  assert.equal(result.status, 'NULL')
  assert.equal(result.object_hash, null)
  assert.equal(result.canonicalized_object, null)
  assert.match(result.errors.join('\n'), /missing_required/)
})

test('Authority extra field -> NULL', () => {
  const result = validateLegitimacySchema(authority({ hidden_mutation: true }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.object_hash, null)
  assert.match(result.errors.join('\n'), /additional_property/)
})

test('valid ATAO object -> VALID_SCHEMA', () => {
  const result = validateLegitimacySchema(atao())
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.object_type, 'ATAO')
})

test('valid AEO exact five fields -> VALID_SCHEMA', () => {
  const result = validateLegitimacySchema(aeo())
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.object_type, 'AEO')
  assert.deepEqual(Object.keys(result.canonicalized_object), ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('AEO extra field -> NULL', () => {
  const result = validateLegitimacySchema(aeo({ object_type: 'AEO' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.object_hash, null)
})

test('unknown object_type -> UNKNOWN_OBJECT_TYPE or NULL', () => {
  const result = validateLegitimacySchema({ object_type: 'UnknownRuntimeObject', id: 'x' })
  assert.ok(['UNKNOWN_OBJECT_TYPE', 'NULL'].includes(result.status))
  assert.equal(result.object_hash, null)
  assert.equal(result.canonicalized_object, null)
})

test('malformed JSON -> NULL', () => {
  const result = validateLegitimacySchema('{"object_type":"Authority",')
  assert.equal(result.status, 'NULL')
  assert.equal(result.object_hash, null)
})

test('deterministic hash stable across key ordering', () => {
  const first = validateLegitimacySchema(authority())
  const reordered = {
    status: 'ACTIVE',
    expiry: now,
    constraints: { canonical_path: ['/authority', '/compile', '/validate', '/execute', '/proof'] },
    scope: { environment: 'production' },
    intent: 'governed production deploy',
    continuity_id: 'continuity-1',
    session_id: 'session-1',
    identity_id: 'identity-1',
    owner: 'owner-1',
    decision_id: 'decision-1',
    authority_id: 'auth-1',
    object_type: 'Authority',
  }
  const second = validateLegitimacySchema(reordered)
  assert.equal(first.status, 'VALID_SCHEMA')
  assert.equal(second.status, 'VALID_SCHEMA')
  assert.equal(first.object_hash, second.object_hash)
})

test('FederationEnvelope does not grant authority', () => {
  const result = validateLegitimacySchema(federationEnvelope())
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.canonicalized_object.authority_effect, 'none')
  assert.equal(result.canonicalized_object.federation_boundary, 'remote_evidence_not_local_authority')

  const granting = validateLegitimacySchema(federationEnvelope({ authority_effect: 'grants_authority' }))
  assert.equal(granting.status, 'NULL')
})

test('ContinuityObject broken chain does not imply authority', () => {
  const result = validateLegitimacySchema(continuityObject({ authority_chain: [] }))
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.object_type, 'ContinuityObject')
  assert.equal(Object.hasOwn(result.canonicalized_object, 'grants_authority'), false)
})


test('schema-valid object does not imply execution legitimacy', () => {
  const result = validateLegitimacySchema(authority())
  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(Object.hasOwn(result, 'execution_legitimacy'), false)
  assert.equal(Object.hasOwn(result, 'authorized'), false)
  assert.equal(Object.hasOwn(result, 'proof_created'), false)
})
