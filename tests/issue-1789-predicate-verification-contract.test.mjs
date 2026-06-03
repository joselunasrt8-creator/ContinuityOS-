// Issue #1789: Phase 3B Predicate Verification Contract tests.
// Runtime coverage is intentionally limited to deterministic contract formation.
// Non-goals: no authority creation, no validator execution, no predicate execution,
// no proof generation, no replay mutation, no execution authorization,
// no database persistence.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)
const { createPredicateVerificationContract, createValidatorBinding } = await import('../src/lib/agent-tool-gateway.ts')

const VALID_BINDING_INPUT = Object.freeze({
  template_id: 'filesystem_read_v1',
  schema_version: '1.0',
  predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
  predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
  lineage_version: 'lineage-v1',
})

const VALID_PREDICATE = Object.freeze({
  predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
  predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
  lineage_version: 'lineage-v1',
  predicate_ids: Object.freeze(['check_surface_type', 'check_read_only_scope']),
  side_effects_allowed: false,
})

function makeBinding(overrides = {}) {
  const input = { ...VALID_BINDING_INPUT, ...overrides }
  return createValidatorBinding(
    input.template_id,
    input.schema_version,
    input.predicate_set_id,
    input.predicate_hash,
    input.lineage_version,
  )
}

function makeContract(bindingOverrides = {}, predicateOverrides = {}) {
  const binding = makeBinding(bindingOverrides)
  const predicate = Object.freeze({ ...VALID_PREDICATE, ...predicateOverrides })
  return createPredicateVerificationContract(binding, predicate)
}

test('gateway lib exports createPredicateVerificationContract with non-goals', () => {
  assert.match(gatewayLib, /export function createPredicateVerificationContract/)
  assert.match(gatewayLib, /no validator execution/)
  assert.match(gatewayLib, /no predicate execution/)
  assert.match(gatewayLib, /no proof generation/)
  assert.match(gatewayLib, /no authority creation/)
  assert.match(gatewayLib, /no execution eligibility/)
})

test('TC-01 null binding → null', () => {
  assert.equal(createPredicateVerificationContract(null, VALID_PREDICATE), null)
  assert.equal(createPredicateVerificationContract(undefined, VALID_PREDICATE), null)
})

test('TC-02 null predicate → null', () => {
  const binding = makeBinding()
  assert.equal(createPredicateVerificationContract(binding, null), null)
  assert.equal(createPredicateVerificationContract(binding, undefined), null)
})

test('TC-03 predicate_set_id mismatch → null', () => {
  assert.equal(makeContract({}, { predicate_set_id: 'different_set_id' }), null)
})

test('TC-04 predicate_hash mismatch → null', () => {
  assert.equal(makeContract({}, { predicate_hash: 'sha256:different-hash' }), null)
})

test('TC-05 lineage_version mismatch → null', () => {
  assert.equal(makeContract({}, { lineage_version: 'lineage-v2' }), null)
})

test('TC-06 blank template_id → null', () => {
  assert.equal(makeContract({ template_id: '' }), null)
  assert.equal(makeContract({ template_id: '   ' }), null)
})

test('TC-07 side_effects_allowed = true → null (purity violation)', () => {
  assert.equal(makeContract({}, { side_effects_allowed: true }), null)
})

test('TC-08 valid inputs → non-null frozen contract with expected fields', () => {
  const result = makeContract()
  assert.notEqual(result, null)
  assert.ok(Object.isFrozen(result))
  assert.equal(result.template_id, VALID_BINDING_INPUT.template_id)
  assert.equal(result.schema_version, VALID_BINDING_INPUT.schema_version)
  assert.equal(result.predicate_set_id, VALID_BINDING_INPUT.predicate_set_id)
  assert.equal(result.predicate_hash, VALID_BINDING_INPUT.predicate_hash)
  assert.equal(result.lineage_version, VALID_BINDING_INPUT.lineage_version)
  assert.equal(typeof result.contract_id, 'string')
  assert.ok(result.contract_id.length > 0)
})

test('TC-09 contract_id is deterministic (same inputs → same hash)', () => {
  const result1 = makeContract()
  const result2 = makeContract()
  assert.notEqual(result1, null)
  assert.notEqual(result2, null)
  assert.equal(result1.contract_id, result2.contract_id)
})

test('TC-10 contract is immutable (Object.isFrozen)', () => {
  const result = makeContract()
  assert.notEqual(result, null)
  assert.ok(Object.isFrozen(result))
})

test('TC-11 contract does NOT contain authority, execution, proof, or replay fields', () => {
  const result = makeContract()
  assert.notEqual(result, null)
  assert.equal('creates_authority' in result, false)
  assert.equal('authority_id' in result, false)
  assert.equal('execution_id' in result, false)
  assert.equal('creates_execution_eligibility' in result, false)
  assert.equal('proof_id' in result, false)
  assert.equal('replay_id' in result, false)
  assert.equal('validation_result' in result, false)
  assert.equal('validator_result' in result, false)
})

test('TC-12 contract_id changes when predicate_hash changes', () => {
  const result1 = makeContract()
  assert.notEqual(result1, null)
  const altHash = 'sha256:alternate-hash'
  const altBinding = createValidatorBinding(
    VALID_BINDING_INPUT.template_id,
    VALID_BINDING_INPUT.schema_version,
    VALID_BINDING_INPUT.predicate_set_id,
    altHash,
    VALID_BINDING_INPUT.lineage_version,
  )
  const altPredicate = Object.freeze({ ...VALID_PREDICATE, predicate_hash: altHash })
  const result2 = createPredicateVerificationContract(altBinding, altPredicate)
  assert.notEqual(result2, null)
  assert.notEqual(result1.contract_id, result2.contract_id)
})
