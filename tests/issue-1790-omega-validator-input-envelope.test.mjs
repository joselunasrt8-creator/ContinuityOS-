// Issue #1790: Phase 3C Ω Validator Input Envelope tests.
// Runtime coverage is intentionally limited to deterministic envelope formation.
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
const { createOmegaValidatorInputEnvelope, createPredicateVerificationContract, createValidatorBinding } =
  await import('../src/lib/agent-tool-gateway.ts')

// Build a valid contract the same way Phase 3B does.
function makeContract(overrides = {}) {
  const base = {
    template_id: 'filesystem_read_v1',
    schema_version: '1.0',
    predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
    predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
    lineage_version: 'lineage-v1',
  }
  const merged = { ...base, ...overrides }
  const binding = createValidatorBinding(
    merged.template_id,
    merged.schema_version,
    merged.predicate_set_id,
    merged.predicate_hash,
    merged.lineage_version,
  )
  const predicate = Object.freeze({
    predicate_set_id: merged.predicate_set_id,
    predicate_hash: merged.predicate_hash,
    lineage_version: merged.lineage_version,
    predicate_ids: Object.freeze(['check_surface_type', 'check_read_only_scope']),
    side_effects_allowed: false,
  })
  return createPredicateVerificationContract(binding, predicate)
}

test('gateway lib exports createOmegaValidatorInputEnvelope with non-goals', () => {
  assert.match(gatewayLib, /export function createOmegaValidatorInputEnvelope/)
  assert.match(gatewayLib, /no validator execution/)
  assert.match(gatewayLib, /no predicate execution/)
  assert.match(gatewayLib, /no proof generation/)
  assert.match(gatewayLib, /no authority creation/)
  assert.match(gatewayLib, /no execution eligibility/)
})

test('TC-01 null contract → null', () => {
  assert.equal(createOmegaValidatorInputEnvelope(null), null)
  assert.equal(createOmegaValidatorInputEnvelope(undefined), null)
})

test('TC-02 valid contract → non-null frozen envelope with required fields', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  assert.ok(Object.isFrozen(envelope))
  assert.equal(typeof envelope.envelope_id, 'string')
  assert.ok(envelope.envelope_id.length > 0)
  assert.equal(envelope.contract_id, contract.contract_id)
  assert.equal(envelope.template_id, contract.template_id)
  assert.equal(envelope.predicate_set_id, contract.predicate_set_id)
  assert.equal(envelope.predicate_hash, contract.predicate_hash)
  assert.equal(envelope.lineage_version, contract.lineage_version)
})

test('TC-03 envelope contains exactly the required fields', () => {
  const contract = makeContract()
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  const keys = Object.keys(envelope).sort()
  assert.deepEqual(keys, ['contract_id', 'envelope_id', 'lineage_version', 'predicate_hash', 'predicate_set_id', 'template_id'])
})

test('TC-04 envelope does NOT contain schema_version', () => {
  const contract = makeContract()
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  assert.equal('schema_version' in envelope, false)
})

test('TC-05 envelope does NOT contain authority, execution, proof, or replay fields', () => {
  const contract = makeContract()
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  assert.equal('creates_authority' in envelope, false)
  assert.equal('authority_id' in envelope, false)
  assert.equal('execution_id' in envelope, false)
  assert.equal('creates_execution_eligibility' in envelope, false)
  assert.equal('proof_id' in envelope, false)
  assert.equal('replay_id' in envelope, false)
  assert.equal('validation_result' in envelope, false)
  assert.equal('validator_result' in envelope, false)
})

test('TC-06 envelope_id is deterministic (same contract → same envelope_id)', () => {
  const c1 = makeContract()
  const c2 = makeContract()
  const e1 = createOmegaValidatorInputEnvelope(c1)
  const e2 = createOmegaValidatorInputEnvelope(c2)
  assert.notEqual(e1, null)
  assert.notEqual(e2, null)
  assert.equal(e1.envelope_id, e2.envelope_id)
})

test('TC-07 envelope_id changes when predicate_hash changes', () => {
  const c1 = makeContract()
  const c2 = makeContract({ predicate_hash: 'sha256:alternate-hash' })
  const e1 = createOmegaValidatorInputEnvelope(c1)
  const e2 = createOmegaValidatorInputEnvelope(c2)
  assert.notEqual(e1, null)
  assert.notEqual(e2, null)
  assert.notEqual(e1.envelope_id, e2.envelope_id)
})

test('TC-08 tampered contract_id (hash mismatch) → null', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const tampered = Object.freeze({ ...contract, contract_id: 'sha256:tampered-contract-id' })
  assert.equal(createOmegaValidatorInputEnvelope(tampered), null)
})

test('TC-09 contract with blank contract_id → null', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const blank = Object.freeze({ ...contract, contract_id: '' })
  assert.equal(createOmegaValidatorInputEnvelope(blank), null)
})

test('TC-10 contract with blank template_id → null', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const blank = Object.freeze({ ...contract, template_id: '   ' })
  assert.equal(createOmegaValidatorInputEnvelope(blank), null)
})

test('TC-11 contract with blank predicate_hash → null', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const blank = Object.freeze({ ...contract, predicate_hash: '' })
  assert.equal(createOmegaValidatorInputEnvelope(blank), null)
})

test('TC-12 contract with blank lineage_version → null', () => {
  const contract = makeContract()
  assert.notEqual(contract, null)
  const blank = Object.freeze({ ...contract, lineage_version: '' })
  assert.equal(createOmegaValidatorInputEnvelope(blank), null)
})

test('TC-13 envelope is immutable (Object.isFrozen)', () => {
  const contract = makeContract()
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  assert.ok(Object.isFrozen(envelope))
})

test('TC-14 envelope_id differs from contract_id', () => {
  const contract = makeContract()
  const envelope = createOmegaValidatorInputEnvelope(contract)
  assert.notEqual(envelope, null)
  assert.notEqual(envelope.envelope_id, envelope.contract_id)
})
