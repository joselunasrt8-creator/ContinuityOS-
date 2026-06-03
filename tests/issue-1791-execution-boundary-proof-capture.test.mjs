// Issue #1791B: Phase 3D Ω Execution-Boundary Proof Capture tests.
// Scope: proof-capture artifact formation only.
// Non-goals: no authority creation, no execution permission, no tool execution,
// no runtime route, no proof persistence.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)

const {
  captureExecutionBoundaryProof,
  evaluateOmegaValidator,
  createOmegaValidatorInputEnvelope,
  createPredicateVerificationContract,
  createValidatorBinding,
} = await import('../src/lib/agent-tool-gateway.ts')

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

function makeOutcome(envelopeOverrides = {}, conditions = ALL_TRUE_CONDITIONS) {
  const base = {
    template_id: 'filesystem_read_v1',
    schema_version: '1.0',
    predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
    predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
    lineage_version: 'lineage-v1',
  }
  const merged = { ...base, ...envelopeOverrides }
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
  const envelope = createOmegaValidatorInputEnvelope(contract)
  return evaluateOmegaValidator(envelope, { conditions })
}

test('gateway lib exports captureExecutionBoundaryProof with invariants', () => {
  assert.match(gatewayLib, /export function captureExecutionBoundaryProof/)
  assert.match(gatewayLib, /Proof artifact ≠ authority/)
  assert.match(gatewayLib, /VALID outcome ≠ executed action/)
  assert.match(gatewayLib, /no authority creation/)
  assert.match(gatewayLib, /no execution permission/)
})

test('TC-01 null outcome → null', () => {
  assert.equal(captureExecutionBoundaryProof(null), null)
  assert.equal(captureExecutionBoundaryProof(undefined), null)
})

test('TC-02 NULL result outcome → null', () => {
  const outcome = makeOutcome({}, ONE_FALSE_CONDITIONS)
  assert.notEqual(outcome, null)
  assert.equal(outcome.result, 'NULL')
  assert.equal(captureExecutionBoundaryProof(outcome), null)
})

test('TC-03 tampered outcome_id → null', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  assert.equal(outcome.result, 'VALID')
  const tampered = Object.freeze({ ...outcome, outcome_id: 'sha256:tampered-outcome-id' })
  assert.equal(captureExecutionBoundaryProof(tampered), null)
})

test('TC-04 missing/blank required outcome fields → null', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  assert.equal(captureExecutionBoundaryProof(Object.freeze({ ...outcome, outcome_id: '' })), null)
  assert.equal(captureExecutionBoundaryProof(Object.freeze({ ...outcome, envelope_id: '' })), null)
  assert.equal(captureExecutionBoundaryProof(Object.freeze({ ...outcome, contract_id: '   ' })), null)
  assert.equal(captureExecutionBoundaryProof(Object.freeze({ ...outcome, predicate_hash: '' })), null)
  assert.equal(captureExecutionBoundaryProof(Object.freeze({ ...outcome, lineage_version: '   ' })), null)
})

test('TC-05 VALID outcome → frozen proof', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  assert.equal(outcome.result, 'VALID')
  const proof = captureExecutionBoundaryProof(outcome)
  assert.notEqual(proof, null)
  assert.ok(Object.isFrozen(proof))
})

test('TC-06 proof contains exactly the required fields', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  const proof = captureExecutionBoundaryProof(outcome)
  assert.notEqual(proof, null)
  const keys = Object.keys(proof).sort()
  assert.deepEqual(keys, [
    'contract_id',
    'creates_authority',
    'envelope_id',
    'lineage_version',
    'outcome_id',
    'predicate_hash',
    'proof_id',
  ])
})

test('TC-07 creates_authority is always false', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  const proof = captureExecutionBoundaryProof(outcome)
  assert.notEqual(proof, null)
  assert.strictEqual(proof.creates_authority, false)
})

test('TC-08 proof contains no execution permission fields', () => {
  const outcome = makeOutcome()
  assert.notEqual(outcome, null)
  const proof = captureExecutionBoundaryProof(outcome)
  assert.notEqual(proof, null)
  assert.equal('execution_id' in proof, false)
  assert.equal('creates_execution_eligibility' in proof, false)
  assert.equal('authority_id' in proof, false)
  assert.equal('permission' in proof, false)
  assert.equal('authorization' in proof, false)
  assert.equal('creates_aeo' in proof, false)
  assert.equal('creates_atao' in proof, false)
  assert.equal('result' in proof, false)
  assert.equal('conditions' in proof, false)
})

test('TC-09 proof_id is deterministic', () => {
  const o1 = makeOutcome()
  const o2 = makeOutcome()
  assert.notEqual(o1, null)
  assert.notEqual(o2, null)
  const p1 = captureExecutionBoundaryProof(o1)
  const p2 = captureExecutionBoundaryProof(o2)
  assert.notEqual(p1, null)
  assert.notEqual(p2, null)
  assert.equal(p1.proof_id, p2.proof_id)
})

test('TC-10 proof_id changes when outcome_id changes', () => {
  const o1 = makeOutcome({ template_id: 'filesystem_read_v1' })
  const o2 = makeOutcome({ template_id: 'filesystem_write_v1' })
  assert.notEqual(o1, null)
  assert.notEqual(o2, null)
  assert.notEqual(o1.outcome_id, o2.outcome_id)
  const p1 = captureExecutionBoundaryProof(o1)
  const p2 = captureExecutionBoundaryProof(o2)
  assert.notEqual(p1, null)
  assert.notEqual(p2, null)
  assert.notEqual(p1.proof_id, p2.proof_id)
})

test('TC-11 no persistence / no migration / no route introduced', () => {
  assert.match(gatewayLib, /no proof persistence/)
  assert.match(gatewayLib, /no runtime route/)
  assert.doesNotMatch(gatewayLib, /INSERT INTO/)
  assert.doesNotMatch(gatewayLib, /app\.post\(/)
  assert.doesNotMatch(gatewayLib, /router\./)
})
