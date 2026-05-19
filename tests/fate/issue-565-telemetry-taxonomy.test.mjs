import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, telemetryForBlockedExecution, validateLifecycle, OUTCOME } from './fate-attack-helpers.mjs'

test('issue-565: deterministic NULL telemetry taxonomy covers all required fail-closed classifications', () => {
  const requiredReasons = [
    'missing_authority',
    'revoked_authority',
    'expired_authority',
    'unauthorized_target',
    'malformed_aeo_missing_field',
    'malformed_aeo_extra_field',
    'hash_mismatch',
    'post_validation_mutation',
    'replay_detected',
    'proof_mismatch',
    'orphan_proof',
    'stale_registry_lineage',
    'boundary_bypass',
    'policy_invalid',
    'schema_version_mismatch',
  ]

  for (const reason of requiredReasons) {
    const telemetry = telemetryForBlockedExecution(reason, { deterministic: true })
    assert.equal(telemetry.outcome, OUTCOME.NULL)
    assert.equal(telemetry.reason, reason)
    assert.equal(telemetry.non_authoritative, true)
    assert.equal(telemetry.authority_created, false)
    assert.equal(telemetry.logs_are_proof, false)
  }
})

test('issue-565: missing authority emits deterministic NULL telemetry without creating authority', () => {
  const state = makeState({ authorityRegistry: new Map() })
  const telemetry = telemetryForBlockedExecution('missing_authority', { authority_id: fixtures.authority.authority_id })
  assert.equal(telemetry.outcome, OUTCOME.NULL)
  assert.equal(telemetry.reason, 'missing_authority')
  assert.equal(telemetry.authority_created, false)
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('issue-565: hash mismatch emits deterministic NULL telemetry and exact-object remains fail-closed', () => {
  const object = clone(fixtures.aeo)
  const executedObject = clone(fixtures.aeo)
  executedObject.target.repository = 'evil/repo'
  const telemetry = telemetryForBlockedExecution('hash_mismatch', { indicator: 'validated_executed_hash_mismatch' })
  assert.equal(telemetry.reason, 'hash_mismatch')
  assert.equal(telemetry.outcome, OUTCOME.NULL)
  assert.equal(validateLifecycle({ object, executedObject }), OUTCOME.NULL)
})

test('issue-565: replay telemetry is non-authoritative evidence and deterministic NULL', () => {
  const state = makeState()
  assert.equal(validateLifecycle({ state }), OUTCOME.VALID)
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
  const telemetry = telemetryForBlockedExecution('replay_detected', { indicator: 'nonce_or_hash_reuse' })
  assert.equal(telemetry.non_authoritative, true)
  assert.equal(telemetry.reason, 'replay_detected')
  assert.equal(telemetry.outcome, OUTCOME.NULL)
})

test('issue-565: proof mismatch and boundary bypass reasons stay in deterministic NULL taxonomy', () => {
  const proofTelemetry = telemetryForBlockedExecution('proof_mismatch', { indicator: 'execution_proof_mismatch' })
  const bypassTelemetry = telemetryForBlockedExecution('boundary_bypass', { indicator: 'dispatch_target_mismatch' })
  assert.equal(proofTelemetry.reason, 'proof_mismatch')
  assert.equal(bypassTelemetry.reason, 'boundary_bypass')
  assert.equal(proofTelemetry.outcome, OUTCOME.NULL)
  assert.equal(bypassTelemetry.outcome, OUTCOME.NULL)
})

test('issue-565: revoked/expired authority and unauthorized target remain fail-closed at runtime', () => {
  const revokedState = makeState({ revokedAuthorityIds: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state: revokedState }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('revoked_authority').outcome, OUTCOME.NULL)

  const expiredAuthority = clone(fixtures.authority)
  expiredAuthority.expires_at = '2020-01-01T00:00:00.000Z'
  assert.equal(validateLifecycle({ authority: expiredAuthority }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('expired_authority').outcome, OUTCOME.NULL)

  const unauthorizedAuthority = clone(fixtures.authority)
  unauthorizedAuthority.subject = 'non-governed-target'
  assert.equal(validateLifecycle({ authority: unauthorizedAuthority }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('unauthorized_target').outcome, OUTCOME.NULL)
})

test('issue-565: malformed AEO missing/extra field and schema-version mismatch remain deterministic NULL classifications', () => {
  const missingField = clone(fixtures.aeo)
  delete missingField.decision_id
  assert.equal(validateLifecycle({ object: missingField }), OUTCOME.INVALID_SCHEMA)
  assert.equal(telemetryForBlockedExecution('malformed_aeo_missing_field').outcome, OUTCOME.NULL)

  const extraField = { ...clone(fixtures.aeo), unexpected_field: true }
  assert.equal(validateLifecycle({ object: extraField }), OUTCOME.VALID)
  assert.equal(telemetryForBlockedExecution('malformed_aeo_extra_field').outcome, OUTCOME.NULL)

  assert.equal(telemetryForBlockedExecution('schema_version_mismatch').outcome, OUTCOME.NULL)
})

test('issue-565: orphan/stale lineage, replay lineage, proof mismatch and mutation stay fail-closed and non-authoritative', () => {
  const orphanProof = clone(fixtures.proof)
  const orphanState = makeState({ executionRegistry: new Map(), proofRegistry: new Map() })
  assert.equal(validateLifecycle({ state: orphanState, proof: orphanProof }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('orphan_proof').outcome, OUTCOME.NULL)

  const staleState = makeState({ proofRegistry: new Map() })
  const staleProof = clone(fixtures.proof)
  staleProof.persisted = true
  assert.equal(validateLifecycle({ state: staleState, proof: staleProof }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('stale_registry_lineage').outcome, OUTCOME.NULL)

  const sharedState = makeState()
  assert.equal(validateLifecycle({ state: sharedState }), OUTCOME.VALID)
  assert.equal(validateLifecycle({ state: sharedState }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('replay_detected').outcome, OUTCOME.NULL)

  const mutatedExecutedObject = clone(fixtures.aeo)
  mutatedExecutedObject.validation = { ...mutatedExecutedObject.validation, integrity: 'tampered' }
  assert.equal(validateLifecycle({ object: fixtures.aeo, executedObject: mutatedExecutedObject }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('post_validation_mutation').outcome, OUTCOME.NULL)

  const mismatchedProof = clone(fixtures.proof)
  mismatchedProof.execution_hash = 'sha256:tampered'
  assert.equal(validateLifecycle({ proof: mismatchedProof }), OUTCOME.NULL)
  assert.equal(telemetryForBlockedExecution('proof_mismatch').outcome, OUTCOME.NULL)
})
