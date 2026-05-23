/**
 * Issue #1010 — RELEASE_PROVENANCE_POLICY_RECONCILIATION_V1
 *
 * FATE tests proving deterministic policy reconciliation for release provenance.
 *
 * Verifies:
 *   1.  equivalent policy states return POLICY_RECONCILED
 *   2.  missing binding returns POLICY_DRIFT_DETECTED
 *   3.  policy reference mismatch returns POLICY_DRIFT_DETECTED
 *   4.  policy evaluation mismatch returns POLICY_DRIFT_DETECTED
 *   5.  policy hash mismatch returns NULL
 *   6.  policy evaluation hash mismatch returns NULL
 *   7.  policy lineage mutation returns NULL
 *   8.  BREAK_GLASS normalization returns NULL
 *   9.  authority attempt returns NULL
 *   10. proof attempt returns NULL
 *   11. execution attempt returns NULL
 *   12. deployment attempt returns NULL
 *   13. NULL policy evaluation returns NULL
 *   14. policy reconciliation remains evidence-only
 *   15. policy reconciliation cannot create authority
 *   16. policy reconciliation cannot create proof
 *   17. policy reconciliation cannot execute
 *   18. policy reconciliation cannot trigger deployment
 *   19. same policy reconciliation state produces same hash
 *   20. reordered inputs preserve hash stability
 *   21. policy agreement cannot become authority
 *   22. policy drift remains observable without automatic repair
 *
 * Additional:
 *   - invalid hash encoding
 *   - invalid hash length
 *   - deterministic POLICY_DRIFT_DETECTED hashing
 *   - deterministic NULL hashing
 *   - binding order normalization
 *   - evaluation order normalization
 *   - missing policy evaluation input
 *   - missing policy binding input
 *   - no runtime route expansion
 *   - no registry mutation
 *   - no policy mutation
 *   - no lineage rewriting
 *   - no implicit authority upgrade
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no deployment capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

import {
  POLICY_RECONCILIATION_RESULTS,
  POLICY_RECONCILIATION_CLASSES,
  computeReconciliationHash,
  normalizeEvaluations,
  normalizeBindings,
  reconcilePolicyBindings,
  validateBoundary,
  detectBreakGlassNormalization,
} from '../../scripts/release-provenance-policy-reconciliation.mjs'

import {
  computePolicyHash,
  computeEvaluationHash,
} from '../../scripts/release-provenance-policy-bindings.mjs'

// ── Required reconciliation classes ──────────────────────────────────────────

const REQUIRED_RECONCILIATION_CLASSES = [
  'policy_reconciliation_satisfied',
  'policy_binding_missing',
  'policy_reference_mismatch',
  'policy_evaluation_mismatch',
  'policy_hash_mismatch',
  'policy_evaluation_hash_mismatch',
  'policy_lineage_mutation',
  'policy_boundary_violation',
  'policy_authority_attempt',
  'policy_proof_attempt',
  'policy_execution_attempt',
  'policy_deployment_attempt',
  'policy_break_glass_normalization',
  'policy_reconciliation_drift',
]

// ── Deterministic test hashes ─────────────────────────────────────────────────

const VALID_DEP_HASH = 'a'.repeat(64)

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeEvaluation(policyResult, consumerNum = 1, extra = {}) {
  const bindingId = `binding-00${consumerNum}`
  const contractId = `contract-00${consumerNum}`
  const consumerId = `consumer-00${consumerNum}`
  const releaseId = `R${consumerNum}`
  const policyClasses =
    policyResult === 'POLICY_BOUND'
      ? ['policy_binding_satisfied']
      : policyResult === 'POLICY_REJECTED'
        ? ['policy_dependency_not_satisfied']
        : []

  const state = {
    binding_id: bindingId,
    contract_id: contractId,
    consumer_id: consumerId,
    release_id: releaseId,
    dependency_hash: VALID_DEP_HASH,
    policy_result: policyResult,
    policy_classes: policyClasses,
  }

  return {
    artifact: 'RELEASE_PROVENANCE_POLICY_EVALUATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    binding_id: bindingId,
    contract_id: contractId,
    consumer_id: consumerId,
    release_id: releaseId,
    dependency_hash: VALID_DEP_HASH,
    policy_result: policyResult,
    policy_classes: policyClasses,
    policy_evaluation_hash_alg: 'sha256',
    policy_evaluation_hash: computeEvaluationHash(state),
    ...extra,
  }
}

function makeBoundEvaluation(consumerNum = 1, extra = {}) {
  return makeEvaluation('POLICY_BOUND', consumerNum, extra)
}

function makeRejectedEvaluation(consumerNum = 1, extra = {}) {
  return makeEvaluation('POLICY_REJECTED', consumerNum, extra)
}

function makeNullEvaluation(consumerNum = 1, extra = {}) {
  return makeEvaluation('NULL', consumerNum, extra)
}

function makeBinding(consumerNum = 1, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_POLICY_BINDING',
    binding_id: `binding-00${consumerNum}`,
    contract_id: `contract-00${consumerNum}`,
    consumer_id: `consumer-00${consumerNum}`,
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    external_policy_reference: 'policy-ref-001',
    human_approval_reference: 'approval-ref-001',
    deployment_authority_reference: 'deploy-auth-ref-001',
    policy_hash_alg: 'sha256',
    ...extra,
  }
}

function makeBindingWithHash(consumerNum = 1, extra = {}) {
  const base = makeBinding(consumerNum, extra)
  base.policy_hash = computePolicyHash(base)
  return base
}

// Two valid bound evaluations (minimum for reconciliation)
function makeTwoBoundEvaluations(extra1 = {}, extra2 = {}) {
  return [makeBoundEvaluation(1, extra1), makeBoundEvaluation(2, extra2)]
}

// ── Script presence and exports ───────────────────────────────────────────────

test('issue #1010: release-provenance-policy-reconciliation.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-policy-reconciliation.mjs')),
    'scripts/release-provenance-policy-reconciliation.mjs must exist',
  )
})

test('issue #1010: exports POLICY_RECONCILIATION_RESULTS with required values', () => {
  assert.equal(POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED, 'POLICY_RECONCILED')
  assert.equal(POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED, 'POLICY_DRIFT_DETECTED')
  assert.equal(POLICY_RECONCILIATION_RESULTS.NULL, 'NULL')
})

test('issue #1010: exports POLICY_RECONCILIATION_CLASSES with all 14 required values', () => {
  for (const cls of REQUIRED_RECONCILIATION_CLASSES) {
    const found = Object.values(POLICY_RECONCILIATION_CLASSES).includes(cls)
    assert.ok(found, `POLICY_RECONCILIATION_CLASSES must include value "${cls}"`)
  }
})

test('issue #1010: exports all required functions', () => {
  assert.equal(typeof computeReconciliationHash, 'function')
  assert.equal(typeof normalizeEvaluations, 'function')
  assert.equal(typeof normalizeBindings, 'function')
  assert.equal(typeof reconcilePolicyBindings, 'function')
  assert.equal(typeof validateBoundary, 'function')
  assert.equal(typeof detectBreakGlassNormalization, 'function')
})

// ── FATE test 1: equivalent policy states return POLICY_RECONCILED ─────────────

test('FATE #1010-1: two POLICY_BOUND evaluations → POLICY_RECONCILED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_SATISFIED,
    ),
  )
})

test('FATE #1010-1b: POLICY_RECONCILED evidence has all required fields', () => {
  const evaluations = makeTwoBoundEvaluations()
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_POLICY_RECONCILIATION')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(Array.isArray(result.policy_reconciliation_classes))
  assert.ok(Array.isArray(result.binding_ids))
  assert.ok(Array.isArray(result.contract_ids))
  assert.ok(Array.isArray(result.consumer_ids))
  assert.ok(Array.isArray(result.policy_hashes))
  assert.ok(Array.isArray(result.policy_evaluation_hashes))
  assert.equal(result.policy_reconciliation_hash_alg, 'sha256')
  assert.equal(typeof result.policy_reconciliation_hash, 'string')
  assert.equal(result.policy_reconciliation_hash.length, 64)
})

test('FATE #1010-1c: three POLICY_BOUND evaluations → POLICY_RECONCILED', () => {
  const evaluations = [
    makeBoundEvaluation(1),
    makeBoundEvaluation(2),
    makeBoundEvaluation(3),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
})

test('FATE #1010-1d: POLICY_RECONCILED also succeeds with valid bindings supplied', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
})

// ── FATE test 2: missing binding returns POLICY_DRIFT_DETECTED ─────────────────

test('FATE #1010-2: evaluations supplied but no binding for one consumer → POLICY_DRIFT_DETECTED', () => {
  const evaluations = makeTwoBoundEvaluations()
  // Only binding for consumer-001, not consumer-002
  const bindings = [makeBinding(1)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BINDING_MISSING,
    ),
  )
})

test('FATE #1010-2b: missing binding also produces policy_reconciliation_drift', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT,
    ),
  )
})

test('FATE #1010-2c: no bindings supplied → no binding_missing drift', () => {
  const evaluations = makeTwoBoundEvaluations()
  // No bindings provided — skip binding coverage check
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(
    !result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BINDING_MISSING,
    ),
  )
})

// ── FATE test 3: policy reference mismatch returns POLICY_DRIFT_DETECTED ─────

test('FATE #1010-3: bindings with different external_policy_reference → POLICY_DRIFT_DETECTED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [
    makeBinding(1, { external_policy_reference: 'policy-ref-A' }),
    makeBinding(2, { external_policy_reference: 'policy-ref-B' }),
  ]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_REFERENCE_MISMATCH,
    ),
  )
})

test('FATE #1010-3b: bindings with different human_approval_reference → POLICY_DRIFT_DETECTED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [
    makeBinding(1, { human_approval_reference: 'approval-A' }),
    makeBinding(2, { human_approval_reference: 'approval-B' }),
  ]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_REFERENCE_MISMATCH,
    ),
  )
})

test('FATE #1010-3c: bindings with different deployment_authority_reference → POLICY_DRIFT_DETECTED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [
    makeBinding(1, { deployment_authority_reference: 'deploy-auth-A' }),
    makeBinding(2, { deployment_authority_reference: 'deploy-auth-B' }),
  ]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
})

test('FATE #1010-3d: identical binding references → POLICY_RECONCILED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(
    !result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_REFERENCE_MISMATCH,
    ),
  )
})

// ── FATE test 4: policy evaluation mismatch returns POLICY_DRIFT_DETECTED ────

test('FATE #1010-4: one POLICY_BOUND and one POLICY_REJECTED → POLICY_DRIFT_DETECTED', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_MISMATCH,
    ),
  )
})

test('FATE #1010-4b: all POLICY_REJECTED (clean) → POLICY_DRIFT_DETECTED', () => {
  const evaluations = [makeRejectedEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_MISMATCH,
    ),
  )
})

test('FATE #1010-4c: evaluation mismatch includes policy_reconciliation_drift', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT,
    ),
  )
})

test('FATE #1010-4d: POLICY_REJECTED cannot be upgraded to POLICY_RECONCILED', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.notEqual(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
  )
})

// ── FATE test 5: policy hash mismatch returns NULL ────────────────────────────

test('FATE #1010-5: binding with invalid policy_hash format → NULL + policy_hash_mismatch', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'invalid-hash' }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-5b: binding with wrong-length policy_hash → NULL + policy_hash_mismatch', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'abc123' }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-5c: binding with uppercase policy_hash → NULL + policy_hash_mismatch', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'A'.repeat(64) }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-5d: valid policy_hash on all bindings → POLICY_RECONCILED', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBindingWithHash(1), makeBindingWithHash(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
})

// ── FATE test 6: policy evaluation hash mismatch returns NULL ─────────────────

test('FATE #1010-6: evaluation with invalid policy_evaluation_hash format → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { policy_evaluation_hash: 'not-valid-hex' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-6b: evaluation with tampered policy_evaluation_hash → NULL (integrity breach)', () => {
  const evaluations = [
    makeBoundEvaluation(1, { policy_evaluation_hash: 'f'.repeat(64) }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-6c: evaluation with short policy_evaluation_hash → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { policy_evaluation_hash: 'abc' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-6d: absent policy_evaluation_hash is allowed (optional field)', () => {
  const e1 = makeBoundEvaluation(1)
  const e2 = makeBoundEvaluation(2)
  delete e1.policy_evaluation_hash
  delete e2.policy_evaluation_hash
  const result = reconcilePolicyBindings([e1, e2])

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
})

// ── FATE test 7: policy lineage mutation returns NULL ─────────────────────────

test('FATE #1010-7: binding with valid-format but wrong policy_hash → NULL + policy_lineage_mutation', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [
    makeBinding(1, { policy_hash: 'f'.repeat(64) }), // valid format, wrong value
    makeBinding(2),
  ]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_LINEAGE_MUTATION,
    ),
  )
})

test('FATE #1010-7b: tampered binding field after hash set → NULL + policy_lineage_mutation', () => {
  const evaluations = makeTwoBoundEvaluations()
  const binding1 = makeBindingWithHash(1)
  // Tamper with a field after the hash was computed
  binding1.external_policy_reference = 'tampered-ref'
  const bindings = [binding1, makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_LINEAGE_MUTATION,
    ),
  )
})

test('FATE #1010-7c: lineage mutation result is deterministic', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'e'.repeat(64) }), makeBinding(2)]

  const r1 = reconcilePolicyBindings(evaluations, bindings)
  const r2 = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(r1.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

// ── FATE test 8: BREAK_GLASS normalization returns NULL ───────────────────────

test('FATE #1010-8: break_glass=true in evaluation → NULL + policy_break_glass_normalization', () => {
  const evaluations = [
    makeBoundEvaluation(1, { break_glass: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION,
    ),
  )
})

test('FATE #1010-8b: is_break_glass=true in evaluation → NULL + policy_break_glass_normalization', () => {
  const evaluations = [
    makeBoundEvaluation(1, { is_break_glass: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION,
    ),
  )
})

test('FATE #1010-8c: break_glass_normalized=true in evaluation → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { break_glass_normalized: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-8d: failure_class containing break_glass → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { failure_class: 'break_glass_causal_normalization' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-8e: break_glass in policy_classes → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, {
      policy_classes: ['policy_binding_satisfied', 'policy_break_glass_normalization'],
    }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-8f: break_glass=true in binding → NULL', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [
    makeBinding(1, { break_glass: true }),
    makeBinding(2),
  ]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION,
    ),
  )
})

// ── FATE test 9: authority attempt returns NULL ───────────────────────────────

test('FATE #1010-9: creates_authority=true in evaluation → NULL + policy_authority_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { creates_authority: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_AUTHORITY_ATTEMPT,
    ),
  )
})

test('FATE #1010-9b: authority_grant field in evaluation → NULL + policy_authority_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { authority_grant: 'admin' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_AUTHORITY_ATTEMPT,
    ),
  )
})

test('FATE #1010-9c: creates_authority=true in binding → NULL + policy_authority_attempt', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { creates_authority: true }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_AUTHORITY_ATTEMPT,
    ),
  )
})

// ── FATE test 10: proof attempt returns NULL ──────────────────────────────────

test('FATE #1010-10: creates_proof=true in evaluation → NULL + policy_proof_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { creates_proof: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_PROOF_ATTEMPT,
    ),
  )
})

test('FATE #1010-10b: proof_signature field in evaluation → NULL + policy_proof_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { proof_signature: 'sig-abc' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_PROOF_ATTEMPT,
    ),
  )
})

// ── FATE test 11: execution attempt returns NULL ──────────────────────────────

test('FATE #1010-11: creates_execution=true in evaluation → NULL + policy_execution_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { creates_execution: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EXECUTION_ATTEMPT,
    ),
  )
})

test('FATE #1010-11b: execution_token field in evaluation → NULL + policy_execution_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { execution_token: 'tok-123' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EXECUTION_ATTEMPT,
    ),
  )
})

// ── FATE test 12: deployment attempt returns NULL ─────────────────────────────

test('FATE #1010-12: deployment_trigger field in evaluation → NULL + policy_deployment_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { deployment_trigger: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_DEPLOYMENT_ATTEMPT,
    ),
  )
})

test('FATE #1010-12b: deployment_token field in binding → NULL + policy_deployment_attempt', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { deployment_token: 'deploy-tok' }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_DEPLOYMENT_ATTEMPT,
    ),
  )
})

test('FATE #1010-12c: deployment_capability field → NULL + policy_deployment_attempt', () => {
  const evaluations = [
    makeBoundEvaluation(1, { deployment_capability: 'cap-xyz' }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_DEPLOYMENT_ATTEMPT,
    ),
  )
})

// ── FATE test 13: NULL policy evaluation returns NULL ─────────────────────────

test('FATE #1010-13: NULL policy_result in evaluation → reconciliation NULL', () => {
  const evaluations = [makeNullEvaluation(1), makeBoundEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-13b: all NULL policy_results → reconciliation NULL', () => {
  const evaluations = [makeNullEvaluation(1), makeNullEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-13c: NULL policy_result takes precedence over POLICY_REJECTED drift', () => {
  const evaluations = [makeNullEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  // NULL takes precedence
  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.notEqual(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
})

test('FATE #1010-13d: NULL cannot be upgraded to POLICY_RECONCILED', () => {
  const evaluations = [makeNullEvaluation(1), makeBoundEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.notEqual(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
  )
})

// ── FATE test 14: policy reconciliation remains evidence-only ─────────────────

test('FATE #1010-14: reconciliation always produces evidence_only=true (all result paths)', () => {
  const cases = [
    [makeTwoBoundEvaluations(), []],
    [[makeBoundEvaluation(1), makeRejectedEvaluation(2)], []],
    [[makeNullEvaluation(1), makeBoundEvaluation(2)], []],
  ]
  for (const [evaluations, bindings] of cases) {
    const result = reconcilePolicyBindings(evaluations, bindings)
    assert.equal(
      result.evidence_only,
      true,
      `evidence_only must be true for result=${result.policy_reconciliation_result}`,
    )
  }
})

test('FATE #1010-14b: artifact field is always RELEASE_PROVENANCE_POLICY_RECONCILIATION', () => {
  const cases = [
    makeTwoBoundEvaluations(),
    [makeBoundEvaluation(1), makeRejectedEvaluation(2)],
    [makeNullEvaluation(1), makeBoundEvaluation(2)],
  ]
  for (const evaluations of cases) {
    const result = reconcilePolicyBindings(evaluations)
    assert.equal(result.artifact, 'RELEASE_PROVENANCE_POLICY_RECONCILIATION')
  }
})

// ── FATE test 15: policy reconciliation cannot create authority ───────────────

test('FATE #1010-15: creates_authority=false always (all result paths)', () => {
  const cases = [
    [makeTwoBoundEvaluations(), []],
    [[makeBoundEvaluation(1), makeRejectedEvaluation(2)], []],
    [[makeNullEvaluation(1), makeBoundEvaluation(2)], []],
  ]
  for (const [evaluations, bindings] of cases) {
    const result = reconcilePolicyBindings(evaluations, bindings)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for result=${result.policy_reconciliation_result}`,
    )
  }
})

test('FATE #1010-15b: POLICY_RECONCILED evidence contains no authority grant fields', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
  assert.ok(!('deployment_authority' in result), 'must not contain deployment_authority')
})

// ── FATE test 16: policy reconciliation cannot create proof ──────────────────

test('FATE #1010-16: creates_proof=false always (all result paths)', () => {
  const cases = [
    makeTwoBoundEvaluations(),
    [makeBoundEvaluation(1), makeRejectedEvaluation(2)],
    [makeNullEvaluation(1), makeBoundEvaluation(2)],
  ]
  for (const evaluations of cases) {
    const result = reconcilePolicyBindings(evaluations)
    assert.equal(result.creates_proof, false)
  }
})

test('FATE #1010-16b: reconciliation evidence contains no proof fields', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
})

// ── FATE test 17: policy reconciliation cannot execute ────────────────────────

test('FATE #1010-17: creates_execution=false always (all result paths)', () => {
  const cases = [
    makeTwoBoundEvaluations(),
    [makeBoundEvaluation(1), makeRejectedEvaluation(2)],
    [makeNullEvaluation(1), makeBoundEvaluation(2)],
  ]
  for (const evaluations of cases) {
    const result = reconcilePolicyBindings(evaluations)
    assert.equal(result.creates_execution, false)
  }
})

test('FATE #1010-17b: reconciliation evidence contains no execution fields', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('execution_token' in result), 'must not contain execution_token')
  assert.ok(!('execution_capability' in result), 'must not contain execution_capability')
})

// ── FATE test 18: policy reconciliation cannot trigger deployment ─────────────

test('FATE #1010-18: reconciliation evidence contains no deployment-related fields', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
  assert.ok(!('deploy_target' in result), 'must not contain deploy_target')
})

// ── FATE test 19: same state produces same hash ───────────────────────────────

test('FATE #1010-19: same POLICY_RECONCILED state produces same reconciliation hash', () => {
  const evaluations = makeTwoBoundEvaluations()
  const r1 = reconcilePolicyBindings(evaluations)
  const r2 = reconcilePolicyBindings(evaluations)

  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

test('FATE #1010-19b: same POLICY_DRIFT_DETECTED state produces same hash', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const r1 = reconcilePolicyBindings(evaluations)
  const r2 = reconcilePolicyBindings(evaluations)

  assert.equal(r1.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

test('FATE #1010-19c: same NULL state produces same hash', () => {
  const evaluations = [makeNullEvaluation(1), makeBoundEvaluation(2)]
  const r1 = reconcilePolicyBindings(evaluations)
  const r2 = reconcilePolicyBindings(evaluations)

  assert.equal(r1.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

test('FATE #1010-19d: computeReconciliationHash is deterministic', () => {
  const h1 = computeReconciliationHash({
    binding_ids: ['b1', 'b2'],
    contract_ids: ['c1'],
    consumer_ids: ['a1', 'a2'],
    policy_hashes: [],
    policy_evaluation_hashes: ['e'.repeat(64)],
    policy_reconciliation_result: 'POLICY_RECONCILED',
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
  })
  const h2 = computeReconciliationHash({
    binding_ids: ['b1', 'b2'],
    contract_ids: ['c1'],
    consumer_ids: ['a1', 'a2'],
    policy_hashes: [],
    policy_evaluation_hashes: ['e'.repeat(64)],
    policy_reconciliation_result: 'POLICY_RECONCILED',
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
  })
  assert.equal(h1, h2)
})

test('FATE #1010-19e: policy_reconciliation_hash is 64-char lowercase hex', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())
  assert.equal(result.policy_reconciliation_hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(result.policy_reconciliation_hash))
})

test('FATE #1010-19f: policy_reconciliation_hash does not include itself in payload', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())
  const recomputed = computeReconciliationHash({
    binding_ids: result.binding_ids,
    contract_ids: result.contract_ids,
    consumer_ids: result.consumer_ids,
    policy_hashes: result.policy_hashes,
    policy_evaluation_hashes: result.policy_evaluation_hashes,
    policy_reconciliation_result: result.policy_reconciliation_result,
    policy_reconciliation_classes: result.policy_reconciliation_classes,
  })
  assert.equal(result.policy_reconciliation_hash, recomputed)
})

// ── FATE test 20: reordered inputs preserve hash stability ────────────────────

test('FATE #1010-20: reordered evaluations produce same reconciliation hash', () => {
  const e1 = makeBoundEvaluation(1)
  const e2 = makeBoundEvaluation(2)

  const r1 = reconcilePolicyBindings([e1, e2])
  const r2 = reconcilePolicyBindings([e2, e1])

  assert.equal(r1.policy_reconciliation_result, r2.policy_reconciliation_result)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

test('FATE #1010-20b: reordered bindings produce same reconciliation hash', () => {
  const evaluations = makeTwoBoundEvaluations()
  const b1 = makeBinding(1)
  const b2 = makeBinding(2)

  const r1 = reconcilePolicyBindings(evaluations, [b1, b2])
  const r2 = reconcilePolicyBindings(evaluations, [b2, b1])

  assert.equal(r1.policy_reconciliation_result, r2.policy_reconciliation_result)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

test('FATE #1010-20c: computeReconciliationHash stable under reordered input arrays', () => {
  const h1 = computeReconciliationHash({
    binding_ids: ['b2', 'b1'],
    contract_ids: ['c1'],
    consumer_ids: ['a2', 'a1'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_result: 'POLICY_RECONCILED',
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
  })
  const h2 = computeReconciliationHash({
    binding_ids: ['b1', 'b2'],
    contract_ids: ['c1'],
    consumer_ids: ['a1', 'a2'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_result: 'POLICY_RECONCILED',
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
  })
  assert.equal(h1, h2, 'hash must be stable regardless of array element order')
})

test('FATE #1010-20d: reordered three evaluations produce same hash', () => {
  const e1 = makeBoundEvaluation(1)
  const e2 = makeBoundEvaluation(2)
  const e3 = makeBoundEvaluation(3)

  const r1 = reconcilePolicyBindings([e1, e2, e3])
  const r2 = reconcilePolicyBindings([e3, e1, e2])
  const r3 = reconcilePolicyBindings([e2, e3, e1])

  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
  assert.equal(r2.policy_reconciliation_hash, r3.policy_reconciliation_hash)
})

// ── FATE test 21: policy agreement cannot become authority ────────────────────

test('FATE #1010-21: POLICY_RECONCILED does not grant execution permission', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.evidence_only, true)
})

test('FATE #1010-21b: POLICY_RECONCILED does not grant deployment authorization', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('deployment_trigger' in result))
  assert.ok(!('deployment_capability' in result))
  assert.ok(!('runtime_route' in result))
  assert.ok(!('route_expansion' in result))
})

test('FATE #1010-21c: policy agreement with bindings still cannot create authority', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.evidence_only, true)
})

// ── FATE test 22: policy drift remains observable without automatic repair ─────

test('FATE #1010-22: POLICY_DRIFT_DETECTED is classifiable and observable', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(
    result.policy_reconciliation_result,
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
  )
  assert.ok(result.policy_reconciliation_classes.length > 0, 'drift must be classified')
  assert.ok(result.policy_reconciliation_hash.length === 64, 'drift must be hashable')
})

test('FATE #1010-22b: drift does not mutate input objects', () => {
  const e1 = makeBoundEvaluation(1)
  const e2 = makeRejectedEvaluation(2)
  const snapshot1 = JSON.stringify(e1)
  const snapshot2 = JSON.stringify(e2)

  reconcilePolicyBindings([e1, e2])

  assert.equal(JSON.stringify(e1), snapshot1, 'evaluation 1 must not be mutated')
  assert.equal(JSON.stringify(e2), snapshot2, 'evaluation 2 must not be mutated')
})

test('FATE #1010-22c: POLICY_DRIFT_DETECTED has no repair fields in output', () => {
  const result = reconcilePolicyBindings([makeBoundEvaluation(1), makeRejectedEvaluation(2)])

  assert.ok(!('lineage_repair' in result))
  assert.ok(!('registry_mutation' in result))
  assert.ok(!('drift_resolution' in result))
  assert.ok(!('auto_repair' in result))
})

test('FATE #1010-22d: drift is observable via policy_reconciliation_drift class', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const result = reconcilePolicyBindings(evaluations)

  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT,
    ),
  )
})

// ── Additional: invalid hash encoding ────────────────────────────────────────

test('FATE #1010-add-1: binding with non-hex policy_hash chars → NULL + policy_hash_mismatch', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'z'.repeat(64) }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH,
    ),
  )
})

test('FATE #1010-add-2: evaluation with uppercase hex evaluation hash → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { policy_evaluation_hash: 'A'.repeat(64) }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH,
    ),
  )
})

// ── Additional: invalid hash length ──────────────────────────────────────────

test('FATE #1010-add-3: evaluation with 32-char evaluation hash → NULL', () => {
  const evaluations = [
    makeBoundEvaluation(1, { policy_evaluation_hash: 'a'.repeat(32) }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-add-4: binding with 128-char policy_hash → NULL', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { policy_hash: 'a'.repeat(128) }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

// ── Additional: deterministic POLICY_DRIFT_DETECTED hashing ──────────────────

test('FATE #1010-add-5: deterministic POLICY_DRIFT_DETECTED hash — same drift same hash', () => {
  const evaluations = [makeBoundEvaluation(1), makeRejectedEvaluation(2)]
  const r1 = reconcilePolicyBindings(evaluations)
  const r2 = reconcilePolicyBindings(evaluations)

  assert.equal(r1.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

// ── Additional: deterministic NULL hashing ────────────────────────────────────

test('FATE #1010-add-6: deterministic NULL hash — same null condition same hash', () => {
  const evaluations = [makeNullEvaluation(1), makeBoundEvaluation(2)]
  const r1 = reconcilePolicyBindings(evaluations)
  const r2 = reconcilePolicyBindings(evaluations)

  assert.equal(r1.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.equal(r1.policy_reconciliation_hash, r2.policy_reconciliation_hash)
})

// ── Additional: binding order normalization ───────────────────────────────────

test('FATE #1010-add-7: normalizeBindings sorts by consumer_id + binding_id', () => {
  const b1 = makeBinding(2)
  const b2 = makeBinding(1)

  const normalized = normalizeBindings([b1, b2])

  assert.equal(normalized[0].consumer_id, 'consumer-001')
  assert.equal(normalized[1].consumer_id, 'consumer-002')
})

test('FATE #1010-add-7b: normalizeBindings does not mutate source array', () => {
  const b1 = makeBinding(2)
  const b2 = makeBinding(1)
  const original = [b1, b2]
  const originalFirst = original[0].consumer_id

  normalizeBindings(original)

  assert.equal(original[0].consumer_id, originalFirst, 'source array must not be mutated')
})

test('FATE #1010-add-7c: normalizeBindings is idempotent', () => {
  const bindings = [makeBinding(2), makeBinding(1)]
  const once = normalizeBindings(bindings)
  const twice = normalizeBindings(once)

  assert.deepEqual(once, twice)
})

// ── Additional: evaluation order normalization ────────────────────────────────

test('FATE #1010-add-8: normalizeEvaluations sorts by consumer_id + binding_id', () => {
  const e1 = makeBoundEvaluation(3)
  const e2 = makeBoundEvaluation(1)
  const e3 = makeBoundEvaluation(2)

  const normalized = normalizeEvaluations([e1, e2, e3])

  assert.equal(normalized[0].consumer_id, 'consumer-001')
  assert.equal(normalized[1].consumer_id, 'consumer-002')
  assert.equal(normalized[2].consumer_id, 'consumer-003')
})

test('FATE #1010-add-8b: normalizeEvaluations does not mutate source array', () => {
  const e1 = makeBoundEvaluation(2)
  const e2 = makeBoundEvaluation(1)
  const original = [e1, e2]
  const originalFirst = original[0].consumer_id

  normalizeEvaluations(original)

  assert.equal(original[0].consumer_id, originalFirst, 'source array must not be mutated')
})

// ── Additional: missing policy evaluation input ───────────────────────────────

test('FATE #1010-add-9: empty evaluations array → NULL + policy_boundary_violation', () => {
  const result = reconcilePolicyBindings([])

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION,
    ),
  )
})

test('FATE #1010-add-9b: single evaluation (< 2) → NULL', () => {
  const result = reconcilePolicyBindings([makeBoundEvaluation(1)])

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-add-9c: null evaluations argument → NULL', () => {
  const result = reconcilePolicyBindings(null)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

test('FATE #1010-add-9d: non-array evaluations argument → NULL', () => {
  const result = reconcilePolicyBindings({ evaluations: [] })

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
})

// ── Additional: missing policy binding input ──────────────────────────────────

test('FATE #1010-add-10: no bindings provided → reconciliation proceeds on evaluations alone', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
})

test('FATE #1010-add-10b: empty bindings array → no binding validation performed', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations(), [])

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED)
  assert.ok(
    !result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BINDING_MISSING,
    ),
  )
})

// ── Additional: no runtime route expansion ────────────────────────────────────

test('FATE #1010-add-11: reconciliation evidence does not expand runtime routes', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('runtime_routes' in result))
  assert.ok(!('route_expansion' in result))
  assert.ok(!('execution_surface' in result))
  assert.ok(!('runtime_route' in result))
})

test('FATE #1010-add-11b: validateBoundary rejects runtime_route field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    runtime_route: '/deploy',
  }
  const check = validateBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('runtime_route')))
})

// ── Additional: no registry mutation ─────────────────────────────────────────

test('FATE #1010-add-12: reconcilePolicyBindings does not mutate input arrays', () => {
  const e1 = makeBoundEvaluation(1)
  const e2 = makeBoundEvaluation(2)
  const b1 = makeBinding(1)
  const b2 = makeBinding(2)

  const evalSnapshot = JSON.stringify([e1, e2])
  const bindSnapshot = JSON.stringify([b1, b2])

  reconcilePolicyBindings([e1, e2], [b1, b2])

  assert.equal(JSON.stringify([e1, e2]), evalSnapshot, 'evaluations array must not be mutated')
  assert.equal(JSON.stringify([b1, b2]), bindSnapshot, 'bindings array must not be mutated')
})

test('FATE #1010-add-12b: validateBoundary rejects registry_mutation field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    registry_mutation: true,
  }
  const check = validateBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('registry_mutation')))
})

// ── Additional: no policy mutation ───────────────────────────────────────────

test('FATE #1010-add-13: reconciliation evidence contains no policy mutation fields', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('policy_mutation' in result))
  assert.ok(!('policy_override' in result))
  assert.ok(!('policy_state_change' in result))
})

test('FATE #1010-add-13b: validateBoundary rejects policy_override field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_override: 'bypass',
  }
  const check = validateBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('policy_override')))
})

// ── Additional: no lineage rewriting ─────────────────────────────────────────

test('FATE #1010-add-14: reconciliation evidence does not rewrite lineage', () => {
  const result = reconcilePolicyBindings(makeTwoBoundEvaluations())

  assert.ok(!('lineage_repair' in result))
  assert.ok(!('ancestor_release_ids' in result))
  assert.ok(!('registry_mutation' in result))
})

test('FATE #1010-add-14b: validateBoundary rejects lineage_repair field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    lineage_repair: true,
  }
  const check = validateBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('lineage_repair')))
})

// ── Additional: no implicit authority upgrade ─────────────────────────────────

test('FATE #1010-add-15: evidence_only=false in evaluation → NULL (boundary violation)', () => {
  const evaluations = [
    makeBoundEvaluation(1, { evidence_only: false }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION,
    ),
  )
})

test('FATE #1010-add-16: creates_authority=true in evaluation → NULL (never authority upgrade)', () => {
  const evaluations = [
    makeBoundEvaluation(1, { creates_authority: true }),
    makeBoundEvaluation(2),
  ]
  const result = reconcilePolicyBindings(evaluations)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.equal(result.creates_authority, false)
})

test('FATE #1010-add-17: creates_execution=true in binding → NULL (boundary violation)', () => {
  const evaluations = makeTwoBoundEvaluations()
  const bindings = [makeBinding(1, { creates_execution: true }), makeBinding(2)]
  const result = reconcilePolicyBindings(evaluations, bindings)

  assert.equal(result.policy_reconciliation_result, POLICY_RECONCILIATION_RESULTS.NULL)
  assert.ok(
    result.policy_reconciliation_classes.includes(
      POLICY_RECONCILIATION_CLASSES.POLICY_EXECUTION_ATTEMPT,
    ),
  )
})

// ── Additional: detectBreakGlassNormalization ─────────────────────────────────

test('FATE #1010-add-18: detectBreakGlassNormalization detects all BREAK_GLASS indicators', () => {
  assert.equal(detectBreakGlassNormalization({ break_glass: true }), true)
  assert.equal(detectBreakGlassNormalization({ is_break_glass: true }), true)
  assert.equal(detectBreakGlassNormalization({ break_glass_normalized: true }), true)
  assert.equal(
    detectBreakGlassNormalization({ failure_class: 'policy_break_glass_normalization' }),
    true,
  )
  assert.equal(
    detectBreakGlassNormalization({
      policy_classes: ['policy_break_glass_normalization'],
    }),
    true,
  )
})

test('FATE #1010-add-18b: detectBreakGlassNormalization returns false for clean objects', () => {
  const clean = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_result: 'POLICY_BOUND',
  }
  assert.equal(detectBreakGlassNormalization(clean), false)
  assert.equal(detectBreakGlassNormalization(null), false)
  assert.equal(detectBreakGlassNormalization(undefined), false)
})

// ── Additional: validateBoundary ──────────────────────────────────────────────

test('FATE #1010-add-19: validateBoundary accepts clean object', () => {
  const clean = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
  }
  const check = validateBoundary(clean)
  assert.equal(check.valid, true)
  assert.deepEqual(check.violations, [])
})

test('FATE #1010-add-19b: validateBoundary identifies all violation flags correctly', () => {
  const bad = {
    evidence_only: true,
    creates_authority: true,
    creates_execution: true,
    creates_proof: true,
    authority_grant: 'admin',
    proof_signature: 'sig',
    deployment_trigger: true,
  }
  const check = validateBoundary(bad)
  assert.equal(check.valid, false)
  assert.equal(check.authority_attempt, true)
  assert.equal(check.proof_attempt, true)
  assert.equal(check.execution_attempt, true)
  assert.equal(check.deployment_attempt, true)
})

// ── Additional: computeReconciliationHash behavior ────────────────────────────

test('FATE #1010-add-20: computeReconciliationHash changes with different result', () => {
  const base = {
    binding_ids: ['b1'],
    contract_ids: ['c1'],
    consumer_ids: ['a1'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
  }
  const h1 = computeReconciliationHash({
    ...base,
    policy_reconciliation_result: 'POLICY_RECONCILED',
  })
  const h2 = computeReconciliationHash({
    ...base,
    policy_reconciliation_result: 'POLICY_DRIFT_DETECTED',
  })
  assert.notEqual(h1, h2)
})

test('FATE #1010-add-20b: computeReconciliationHash is 64-char hex SHA-256', () => {
  const hash = computeReconciliationHash({
    binding_ids: [],
    contract_ids: [],
    consumer_ids: [],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_result: 'NULL',
    policy_reconciliation_classes: ['policy_boundary_violation'],
  })
  assert.equal(hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(hash))
})

// ── Non-regression: prior provenance scripts remain intact ────────────────────

test('FATE #1010 non-regression: release-provenance-policy-bindings.mjs is present and exports intact', async () => {
  const mod = await import('../../scripts/release-provenance-policy-bindings.mjs')
  assert.ok(typeof mod.classifyPolicy === 'function')
  assert.ok(typeof mod.POLICY_RESULTS === 'object')
  assert.ok(typeof mod.POLICY_CLASSES === 'object')
  assert.ok(typeof mod.computePolicyHash === 'function')
  assert.ok(typeof mod.computeEvaluationHash === 'function')
})

test('FATE #1010 non-regression: reconcile-release-provenance-registry.mjs is present and exports intact', async () => {
  const mod = await import('../../scripts/reconcile-release-provenance-registry.mjs')
  assert.ok(typeof mod.generateReconciliationEvidence === 'function')
  assert.ok(typeof mod.RECONCILIATION_RESULT === 'object')
})

test('FATE #1010 non-regression: issue-1008 FATE test file is present', () => {
  assert.ok(
    existsSync(
      join(root, 'tests/fate/issue-1008-release-provenance-policy-bindings.test.mjs'),
    ),
    '#1008 FATE test file must remain present',
  )
})

test('FATE #1010 non-regression: issue-998 FATE test file is present', () => {
  assert.ok(
    existsSync(
      join(root, 'tests/fate/issue-998-provenance-registry-reconciliation.test.mjs'),
    ),
    '#998 FATE test file must remain present',
  )
})
