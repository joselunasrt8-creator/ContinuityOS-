import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, telemetryForBlockedExecution, validateLifecycle, OUTCOME } from './fate-attack-helpers.mjs'

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
