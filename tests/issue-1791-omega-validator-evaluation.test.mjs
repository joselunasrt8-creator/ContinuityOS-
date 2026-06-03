// Issue #1791: Phase 3D Ω Validator Evaluation Context and Outcome tests.
// Runtime coverage is intentionally limited to bounded outcome formation.
// Non-goals: no authority creation, no execution permission, no predicate execution,
// no proof generation, no proof capture, no persistence, no runtime route,
// no execution boundary invocation.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)

const {
  evaluateOmegaValidator,
  createOmegaValidatorInputEnvelope,
  createPredicateVerificationContract,
  createValidatorBinding,
} = await import('../src/lib/agent-tool-gateway.ts')

// Build a valid envelope through the full Phase 3B/3C chain.
function makeEnvelope(overrides = {}) {
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
  const contract = createPredicateVerificationContract(binding, predicate)
  return createOmegaValidatorInputEnvelope(contract)
}

const ALL_TRUE_CONDITIONS = Object.freeze({
  valid: true,
  authorized: true,
  unused: true,
  policy_valid: true,
  replay_safe: true,
  topology_visible: true,
  reconcilable: true,
})

const ONE_FALSE_CONDITIONS = Object.freeze({
  valid: false,
  authorized: true,
  unused: true,
  policy_valid: true,
  replay_safe: true,
  topology_visible: true,
  reconcilable: true,
})

test('gateway lib exports evaluateOmegaValidator with non-goals', () => {
  assert.match(gatewayLib, /export function evaluateOmegaValidator/)
  assert.match(gatewayLib, /no authority creation/)
  assert.match(gatewayLib, /no execution permission/)
  assert.match(gatewayLib, /no proof generation/)
  assert.match(gatewayLib, /no proof capture/)
  assert.match(gatewayLib, /no persistence/)
})

test('TC-01 null envelope → null', () => {
  const context = { conditions: ALL_TRUE_CONDITIONS }
  assert.equal(evaluateOmegaValidator(null, context), null)
  assert.equal(evaluateOmegaValidator(undefined, context), null)
})

test('TC-02 malformed / blank envelope field → null', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const context = { conditions: ALL_TRUE_CONDITIONS }

  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, envelope_id: '' }), context), null)
  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, contract_id: '' }), context), null)
  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, predicate_hash: '   ' }), context), null)
  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, lineage_version: '' }), context), null)
  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, template_id: '' }), context), null)
  assert.equal(evaluateOmegaValidator(Object.freeze({ ...envelope, predicate_set_id: '   ' }), context), null)
})

test('TC-03 tampered envelope_id → null', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const context = { conditions: ALL_TRUE_CONDITIONS }
  const tampered = Object.freeze({ ...envelope, envelope_id: 'sha256:tampered-envelope-id' })
  assert.equal(evaluateOmegaValidator(tampered, context), null)
})

test('TC-04 missing conditions → null', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  assert.equal(evaluateOmegaValidator(envelope, null), null)
  assert.equal(evaluateOmegaValidator(envelope, undefined), null)
  assert.equal(evaluateOmegaValidator(envelope, {}), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: null }), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: undefined }), null)
})

test('TC-05 non-boolean condition → null', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)

  assert.equal(evaluateOmegaValidator(envelope, { conditions: { ...ALL_TRUE_CONDITIONS, valid: 1 } }), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: { ...ALL_TRUE_CONDITIONS, authorized: 'yes' } }), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: { ...ALL_TRUE_CONDITIONS, unused: null } }), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: { ...ALL_TRUE_CONDITIONS, policy_valid: undefined } }), null)
  assert.equal(evaluateOmegaValidator(envelope, { conditions: { ...ALL_TRUE_CONDITIONS, replay_safe: 0 } }), null)
})

test('TC-06 one false condition → outcome.result = "NULL"', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ONE_FALSE_CONDITIONS })
  assert.notEqual(outcome, null)
  assert.equal(outcome.result, 'NULL')
})

test('TC-07 all seven conditions true → outcome.result = "VALID"', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  assert.notEqual(outcome, null)
  assert.equal(outcome.result, 'VALID')
})

test('TC-08 outcome_id is deterministic', () => {
  const e1 = makeEnvelope()
  const e2 = makeEnvelope()
  const context = { conditions: ALL_TRUE_CONDITIONS }
  const o1 = evaluateOmegaValidator(e1, context)
  const o2 = evaluateOmegaValidator(e2, context)
  assert.notEqual(o1, null)
  assert.notEqual(o2, null)
  assert.equal(o1.outcome_id, o2.outcome_id)
})

test('TC-09 outcome_id changes when result changes', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const oValid = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  const oNull = evaluateOmegaValidator(envelope, { conditions: ONE_FALSE_CONDITIONS })
  assert.notEqual(oValid, null)
  assert.notEqual(oNull, null)
  assert.equal(oValid.result, 'VALID')
  assert.equal(oNull.result, 'NULL')
  assert.notEqual(oValid.outcome_id, oNull.outcome_id)
})

test('TC-10 outcome is frozen', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  assert.notEqual(outcome, null)
  assert.ok(Object.isFrozen(outcome))
})

test('TC-11 outcome.conditions is frozen', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  assert.notEqual(outcome, null)
  assert.ok(Object.isFrozen(outcome.conditions))
})

test('TC-12 outcome contains exactly the required fields', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  assert.notEqual(outcome, null)
  const keys = Object.keys(outcome).sort()
  assert.deepEqual(keys, ['conditions', 'contract_id', 'envelope_id', 'lineage_version', 'outcome_id', 'predicate_hash', 'result'])
})

test('TC-13 outcome does not contain authority, execution, proof, replay, or permission fields', () => {
  const envelope = makeEnvelope()
  assert.notEqual(envelope, null)
  const outcome = evaluateOmegaValidator(envelope, { conditions: ALL_TRUE_CONDITIONS })
  assert.notEqual(outcome, null)
  assert.equal('creates_authority' in outcome, false)
  assert.equal('authority_id' in outcome, false)
  assert.equal('execution_id' in outcome, false)
  assert.equal('creates_execution_eligibility' in outcome, false)
  assert.equal('proof_id' in outcome, false)
  assert.equal('proof' in outcome, false)
  assert.equal('replay_id' in outcome, false)
  assert.equal('permission' in outcome, false)
  assert.equal('authorization' in outcome, false)
  assert.equal('creates_aeo' in outcome, false)
  assert.equal('creates_atao' in outcome, false)
})

test('TC-14 evaluator reuses checkOmegaValidatorBoundary', () => {
  assert.match(gatewayLib, /export function evaluateOmegaValidator/)
  assert.match(gatewayLib, /checkOmegaValidatorBoundary\(conditions\)/)
})

test('TC-15 evaluator does not introduce proof capture or persistence', () => {
  assert.match(gatewayLib, /no proof capture/)
  assert.match(gatewayLib, /no persistence/)
  assert.match(gatewayLib, /no execution boundary invocation/)
})
