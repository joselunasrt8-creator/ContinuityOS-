// Phase 3A: Template-Bound Ω Validator Binding tests.
// Runtime coverage is intentionally limited to deterministic binding semantics.
// Non-goals: no authority creation, no validator execution, no predicate
// execution, no proof generation, no replay mutation, and no execution
// authorization.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)
const { createValidatorBinding } = await import('../src/lib/agent-tool-gateway.ts')

const VALID_INPUT = Object.freeze({
  template_id: 'filesystem_read_v1',
  schema_version: '1.0',
  predicate_set_id: 'filesystem_read_predicates_v1',
  predicate_hash: 'sha256:filesystem-read-predicate-hash',
  lineage_version: 'lineage-v1'
})

function bind(overrides = {}) {
  const input = { ...VALID_INPUT, ...overrides }
  return createValidatorBinding(
    input.template_id,
    input.schema_version,
    input.predicate_set_id,
    input.predicate_hash,
    input.lineage_version
  )
}

test('gateway lib exports pure createValidatorBinding boundary and non-goals', () => {
  assert.match(gatewayLib, /export function createValidatorBinding/)
  assert.match(gatewayLib, /Binding artifact only/)
  assert.match(gatewayLib, /template identity \+ predicate identity \+ lineage/)
  assert.match(gatewayLib, /no authority creation/)
  assert.match(gatewayLib, /no validator execution/)
  assert.match(gatewayLib, /no predicate execution/)
  assert.match(gatewayLib, /no proof generation/)
  assert.match(gatewayLib, /no replay mutation/)
  assert.match(gatewayLib, /no execution authorization/)
})

test('TC-01 missing template_id → NULL', () => {
  assert.equal(bind({ template_id: '' }), null)
  assert.equal(bind({ template_id: undefined }), null)
})

test('TC-02 missing schema_version → NULL', () => {
  assert.equal(bind({ schema_version: '' }), null)
  assert.equal(bind({ schema_version: undefined }), null)
})

test('TC-03 missing predicate_set_id → NULL', () => {
  assert.equal(bind({ predicate_set_id: '' }), null)
  assert.equal(bind({ predicate_set_id: undefined }), null)
})

test('TC-04 missing predicate_hash → NULL', () => {
  assert.equal(bind({ predicate_hash: '' }), null)
  assert.equal(bind({ predicate_hash: undefined }), null)
})

test('TC-05 missing lineage_version → NULL', () => {
  assert.equal(bind({ lineage_version: '' }), null)
  assert.equal(bind({ lineage_version: undefined }), null)
})

test('TC-06 whitespace-only values → NULL', () => {
  for (const field of Object.keys(VALID_INPUT)) {
    assert.equal(bind({ [field]: '   \t\n   ' }), null, `${field} must fail closed`)
  }
})

test('TC-07 valid binding → frozen ValidatorBinding', () => {
  const result = bind()
  assert.deepEqual(result, VALID_INPUT)
  assert.ok(Object.isFrozen(result))
})

test('TC-08 binding does not imply authority', () => {
  const result = bind()
  assert.notEqual(result, null)
  assert.equal('authority_id' in result, false)
  assert.equal('creates_authority' in result, false)
  assert.equal('authority' in result, false)
})

test('TC-09 binding does not imply execution', () => {
  const result = bind()
  assert.notEqual(result, null)
  assert.equal('execution_id' in result, false)
  assert.equal('execute' in result, false)
  assert.equal('creates_execution_eligibility' in result, false)
})

test('TC-10 binding does not imply validator execution', () => {
  const result = bind()
  assert.notEqual(result, null)
  assert.equal('validator_result' in result, false)
  assert.equal('validation_result' in result, false)
  assert.equal('predicate_result' in result, false)
})
