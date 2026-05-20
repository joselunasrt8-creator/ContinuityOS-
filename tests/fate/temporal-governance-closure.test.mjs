import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
}

const temporalRules = readJson('runtime/temporal_governance_rules.json')
const authorityExpiry = readJson('runtime/authority_expiration_policy.json')
const continuityTtl = readJson('runtime/continuity_ttl_rules.json')
const proofTemporal = readJson('runtime/proof_temporal_constraints.json')
const skewFailureModes = readJson('runtime/clock_skew_failure_modes.json')
const temporalBypassPaths = readJson('runtime/temporal_bypass_paths.json')

const validFixture = readJson('tests/fixtures/temporal-lineage/valid_temporal_lineage.json')
const expiredAuthority = readJson('tests/fixtures/temporal-lineage/expired_authority.json')
const expiredProof = readJson('tests/fixtures/temporal-lineage/expired_proof.json')
const staleDelegation = readJson('tests/fixtures/temporal-lineage/stale_delegation.json')
const delayedReplay = readJson('tests/fixtures/temporal-lineage/delayed_replay.json')
const continuityTimeout = readJson('tests/fixtures/temporal-lineage/continuity_timeout.json')
const clockSkewDivergence = readJson('tests/fixtures/temporal-lineage/clock_skew_divergence.json')
const resurrectedExecution = readJson('tests/fixtures/temporal-lineage/resurrected_execution.json')
const expiredOrchestration = readJson('tests/fixtures/temporal-lineage/expired_orchestration.json')

test('temporal governance closure: canonical execution gate requires temporal validity', () => {
  assert.equal(
    temporalRules.required_execution_gate,
    'VALID && AUTHORIZED && UNUSED && POLICY_VALID && CANONICAL_LINEAGE_CONTINUITY && TEMPORALLY_VALID',
  )
  assert.equal(temporalRules.else_result, 'NULL')
  assert.equal(temporalRules.invariants.previously_valid_not_currently_valid, 'previously_valid != currently_valid')
})

test('temporal governance closure: expired or stale objects fail closed to NULL', () => {
  assert.equal(expiredAuthority.expected_result, 'NULL')
  assert.equal(expiredProof.expected_result, 'NULL')
  assert.equal(staleDelegation.expected_result, 'NULL')
  assert.equal(delayedReplay.expected_result, 'NULL')
  assert.equal(continuityTimeout.expected_result, 'NULL')
  assert.equal(clockSkewDivergence.expected_result, 'NULL')
  assert.equal(resurrectedExecution.expected_result, 'NULL')
  assert.equal(expiredOrchestration.expected_result, 'NULL')
})

test('temporal governance closure: policy artifacts enforce deterministic temporal NULL responses', () => {
  assert.equal(authorityExpiry.rules.expired_authority, 'NULL')
  assert.equal(continuityTtl.rules.expired_continuity, 'NULL')
  assert.equal(proofTemporal.rules.expired_proof, 'NULL')
  assert.equal(proofTemporal.rules.delayed_replay, 'NULL')
  assert.equal(skewFailureModes.policy.clock_skew_beyond_policy, 'NULL')
  assert.equal(authorityExpiry.fail_closed, true)
  assert.equal(continuityTtl.fail_closed, true)
  assert.equal(proofTemporal.fail_closed, true)
  assert.equal(skewFailureModes.fail_closed, true)
})

test('temporal governance closure: temporal bypass paths are enumerated and fail-closed', () => {
  const ids = new Set(temporalBypassPaths.bypass_paths.map((entry) => entry.bypass_id))
  for (const id of [
    'stale_authority_continuation',
    'expired_execution_continuation',
    'delayed_replay_execution',
    'frozen_proof_resurrection',
    'asynchronous_temporal_drift',
    'clock_skew_legitimacy_divergence',
    'replay_after_continuity_expiration',
    'indefinite_delegation_persistence',
    'post_expiry_orchestration_continuation',
    'time_partitioned_execution_synthesis',
  ]) assert.equal(ids.has(id), true)

  assert.equal(temporalBypassPaths.fail_closed_response, 'NULL')
})

test('temporal governance closure: only bounded temporally valid lineage reaches VALID', () => {
  assert.equal(validFixture.temporally_valid, true)
  assert.equal(validFixture.canonical_lineage_continuity, true)
  assert.equal(validFixture.expected_result, 'VALID')
})
