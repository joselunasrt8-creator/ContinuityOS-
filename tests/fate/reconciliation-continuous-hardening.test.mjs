import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/RECONCILIATION_VERIFICATION_SPEC.json', import.meta.url), 'utf8'))
const doc = readFileSync(new URL('../../docs/continuous-reconciliation-hardening.md', import.meta.url), 'utf8')
const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

const requiredSections = [
  'Continuous Reconciliation Architecture',
  'Reconciliation Verification Loop',
  'Drift Telemetry Expansion',
  'Federated Integrity Model',
  'Reconciliation FATE Matrix',
  'Recursive Traversal Rules',
  'Replay Lineage Rules',
  'Revocation Integrity Rules',
  'Observability Constraints',
  'Failure Classification Matrix',
]

const requiredPayloadFields = [
  'registry',
  'lookup_key',
  'expected_lineage',
  'observed_lineage',
  'drift_class',
  'reconciliation_depth',
  'canonical_traversal_position',
  'deterministic_hash_evidence',
]

const requiredDriftClasses = [
  'reconciliation_failure_drift',
  'recursive_ancestry_drift',
  'replay_chain_drift',
  'proof_lineage_drift',
  'preo_ancestry_drift',
  'revocation_propagation_drift',
  'duplicate_lineage_hash_drift',
  'orphan_legitimacy_object_drift',
  'federated_lineage_drift',
  'traversal_instability_drift',
  'telemetry_payload_drift',
]

const fateIds = [
  'orphan_proof_detection',
  'recursive_lineage_divergence',
  'replay_chain_corruption',
  'preo_ancestry_corruption',
  'federated_lineage_mismatch',
  'duplicate_lineage_replay',
  'stale_revocation_propagation',
  'deterministic_traversal_stability',
  'reconciliation_hash_instability',
  'observability_payload_drift',
]

test('continuous reconciliation hardening artifact exposes required output sections', () => {
  for (const section of requiredSections) {
    assert.match(doc, new RegExp(`## \\d+\\. ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${section} must be documented`)
  }
})

test('reconciliation scheduler is deterministic and observability-only', () => {
  assert.equal(spec.continuous_reconciliation_architecture.scheduler_design.mode, 'deterministic_read_only_traversal')
  assert.equal(spec.continuous_reconciliation_architecture.scheduler_design.mutation_policy, 'MUST_NOT_MUTATE_REGISTRIES_OR_RUNTIME_LEGITIMACY')
  assert.equal(spec.continuous_reconciliation_architecture.scheduler_design.replay_policy, 'MUST_NOT_RESERVE_OR_CONSUME_REPLAY_STATE')
  assert.deepEqual(spec.continuous_reconciliation_architecture.scheduler_design.ordering, [
    'proof_registry.created_at ASC',
    'proof_registry.decision_id ASC',
    'proof_registry.execution_id ASC',
    'proof_registry.proof_id ASC',
  ])
  assert.equal(spec.continuous_reconciliation_architecture.scheduler_design.failure_result, 'NULL')
})

test('reconciliation telemetry schema contains deterministic lineage evidence fields', () => {
  for (const field of requiredPayloadFields) {
    assert.ok(Object.hasOwn(spec.drift_telemetry_expansion.schema, field), `missing telemetry field: ${field}`)
    assert.ok(doc.includes('| `' + field + '`'), `${field} must be documented in telemetry payload table`)
  }
  assert.equal(spec.drift_telemetry_expansion.observability_only, true)
})

test('runtime drift taxonomy includes reconciliation hardening classes', () => {
  for (const driftClass of requiredDriftClasses) {
    assert.ok(spec.drift_telemetry_expansion.classes.includes(driftClass), `spec missing drift class: ${driftClass}`)
    assert.match(source, new RegExp(`"${driftClass}"`), `runtime DriftClass type must include ${driftClass}`)
  }
})

test('federated integrity model remains explicitly bounded and non-authoritative', () => {
  assert.match(doc, /remote runtime reference is never trusted by implication/i)
  assert.match(doc, /Local validation remains mandatory/i)
  assert.ok(spec.federated_integrity_model.forbidden.includes('trusted_federation_assumption'))
  assert.ok(spec.federated_integrity_model.forbidden.includes('remote_legitimacy_inference'))
  assert.ok(spec.federated_integrity_model.forbidden.includes('local_validation_bypass'))
})

test('reconciliation FATE matrix covers deterministic fail-closed lineage corruptions', () => {
  const byId = new Map(spec.reconciliation_fate_matrix.map((entry) => [entry.test_id, entry]))
  for (const testId of fateIds) {
    assert.equal(byId.get(testId)?.expected_result, 'NULL', `${testId} must fail closed to NULL`)
    assert.ok(doc.includes('| `' + testId + '`'), `${testId} must be documented in FATE matrix`)
  }
})

test('recursive, replay, and revocation rules forbid inference and mutation', () => {
  assert.ok(spec.recursive_traversal_rules.some((rule) => /never infer ancestry/i.test(rule)))
  assert.ok(spec.replay_lineage_rules.some((rule) => /must not reserve, consume, or release replay state/i.test(rule)))
  assert.ok(spec.revocation_integrity_rules.some((rule) => /never auto-heals stale rows/i.test(rule)))
  assert.match(doc, /Reconciliation must never create legitimacy\./)
})

test('continuous reconciliation exposes federated revocation observability without mutation semantics', () => {
  assert.match(source, /federated_revocation_observability_registry/)
  assert.match(source, /url\.pathname === "\/federation\/reconcile\/revocation" && request\.method === "GET"/)
  assert.match(source, /remote_authority_inherited: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /replay_state_consumed: false/)
  assert.match(source, /replay_neutral: true/)
  assert.doesNotMatch(source, /remote.*revoke.*local.*authority/)
  assert.equal(spec.federated_revocation_observability.remote_authority_inherited, false)
  assert.equal(spec.federated_revocation_observability.remote_execution_legitimacy, false)
  assert.equal(spec.federated_revocation_observability.replay_state_consumed, false)
})
