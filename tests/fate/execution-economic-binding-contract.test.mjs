import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const contract = JSON.parse(
  readFileSync(new URL('../../governance/runtime/EXECUTION_ECONOMIC_BINDING.json', import.meta.url), 'utf8')
)

test('economic legitimacy is required before execution legitimacy', () => {
  assert.equal(
    contract.required_invariant,
    'execution allowed ONLY IF VALID AND AUTHORIZED AND UNUSED AND POLICY_VALID AND ECONOMICALLY_VALID'
  )

  assert.equal(contract.failure_condition, 'NULL')
})

test('economic validation occurs before execution and consumption occurs after success', () => {
  assert.deepEqual(contract.runtime_binding_order, [
    'load_quota',
    'validate_quota_before_execution_reservation',
    'reserve_execution',
    'execute',
    'consume_quota_once_after_successful_execution',
    'emit_economic_telemetry',
    'persist_proof',
  ])
})

test('economic replay and fail-closed guards are required', () => {
  assert.ok(contract.required_guards.includes('failed_execution_preserves_quota'))
  assert.ok(contract.required_guards.includes('replay_does_not_double_consume_quota'))
  assert.ok(contract.required_guards.includes('quota_exhausted_returns_NULL'))
  assert.ok(contract.required_guards.includes('economic_drift_persisted_on_rejection'))
})

test('economic telemetry and drift classification are required', () => {
  assert.ok(contract.required_telemetry.includes('QUOTA_RESERVED'))
  assert.ok(contract.required_telemetry.includes('QUOTA_CONSUMED'))
  assert.ok(contract.required_telemetry.includes('QUOTA_REJECTED'))
  assert.equal(contract.required_drift_class, 'economic_drift')
})
