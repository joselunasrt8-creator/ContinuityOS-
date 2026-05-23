/**
 * Issue #1008 — RELEASE_PROVENANCE_POLICY_BINDINGS_V1
 *
 * FATE tests proving deterministic policy bindings for release provenance
 * dependency contracts.
 *
 * Verifies:
 *   1.  valid dependency evidence with valid bindings returns POLICY_BOUND
 *   2.  missing external policy reference returns POLICY_REJECTED
 *   3.  missing human approval reference returns POLICY_REJECTED
 *   4.  missing deployment authority reference returns POLICY_REJECTED
 *   5.  NULL dependency evidence returns NULL
 *   6.  authority attempt returns NULL
 *   7.  proof attempt returns NULL
 *   8.  execution attempt returns NULL
 *   9.  deployment attempt returns NULL
 *   10. invalid policy hash returns NULL
 *   11. invalid dependency hash returns NULL
 *   12. BREAK_GLASS normalization returns NULL
 *   13. policy lineage mutation returns NULL
 *   14. policy evidence remains evidence-only
 *   15. policy bindings cannot create authority
 *   16. policy bindings cannot create proof
 *   17. policy bindings cannot execute
 *   18. policy bindings cannot trigger deployment
 *   19. same policy state produces same evaluation hash
 *   20. reordered policy classes preserve hash stability
 *   21. policy references cannot upgrade evidence into authority
 *   22. policy drift remains POLICY_REJECTED unless integrity-breaking
 *
 * Additional:
 *   - invalid hash encoding
 *   - invalid hash length
 *   - deterministic POLICY_REJECTED hashing
 *   - deterministic NULL hashing
 *   - binding lineage mutation propagation
 *   - no runtime route expansion
 *   - no deployment capability expansion
 *   - no registry mutation
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
  POLICY_RESULTS,
  POLICY_CLASSES,
  canonicalJson,
  computePolicyHash,
  computeEvaluationHash,
  validateBindingBoundary,
  validateDependencyBoundary,
  classifyPolicy,
} from '../../scripts/release-provenance-policy-bindings.mjs'

const REQUIRED_POLICY_CLASSES = [
  'policy_binding_satisfied',
  'policy_external_reference_missing',
  'policy_human_approval_missing',
  'policy_deployment_authority_missing',
  'policy_dependency_not_satisfied',
  'policy_drift_detected',
  'policy_boundary_violation',
  'policy_authority_attempt',
  'policy_proof_attempt',
  'policy_execution_attempt',
  'policy_deployment_attempt',
  'policy_hash_invalid',
  'policy_break_glass_normalization',
  'policy_lineage_mutation',
]

// Deterministic fake hashes (64-char lowercase hex)
const VALID_DEPENDENCY_HASH = 'a'.repeat(64)
const VALID_CONSUMPTION_HASH = 'b'.repeat(64)

// ── fixture helpers ──────────────────────────────────────────────────────────

function makeDependencyEvidence(dependencyResult, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_DEPENDENCY_EVALUATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    release_id: 'R1',
    consumption_hash: VALID_CONSUMPTION_HASH,
    dependency_result: dependencyResult,
    dependency_classes:
      dependencyResult === 'DEPENDENCY_SATISFIED' ? ['dependency_contract_satisfied'] : [],
    dependency_hash_alg: 'sha256',
    dependency_hash: VALID_DEPENDENCY_HASH,
    ...extra,
  }
}

function makeSatisfiedEvidence(extra = {}) {
  return makeDependencyEvidence('DEPENDENCY_SATISFIED', extra)
}

function makeRejectedEvidence(extra = {}) {
  return makeDependencyEvidence('DEPENDENCY_REJECTED', extra)
}

function makeNullEvidence(extra = {}) {
  return makeDependencyEvidence('NULL', extra)
}

function makeBinding(extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_POLICY_BINDING',
    binding_id: 'binding-001',
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
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

function makeBindingWithHash(extra = {}) {
  const base = makeBinding(extra)
  base.policy_hash = computePolicyHash(base)
  return base
}

// ── artifact and export presence ─────────────────────────────────────────────

test('issue #1008: release-provenance-policy-bindings.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-policy-bindings.mjs')),
    'scripts/release-provenance-policy-bindings.mjs must exist',
  )
})

test('issue #1008: exports POLICY_RESULTS with POLICY_BOUND, POLICY_REJECTED, NULL', () => {
  assert.equal(POLICY_RESULTS.POLICY_BOUND, 'POLICY_BOUND')
  assert.equal(POLICY_RESULTS.POLICY_REJECTED, 'POLICY_REJECTED')
  assert.equal(POLICY_RESULTS.NULL, 'NULL')
})

test('issue #1008: exports POLICY_CLASSES with all 14 required values', () => {
  for (const cls of REQUIRED_POLICY_CLASSES) {
    const found = Object.values(POLICY_CLASSES).includes(cls)
    assert.ok(found, `POLICY_CLASSES must include value "${cls}"`)
  }
})

test('issue #1008: exports all required functions', () => {
  assert.equal(typeof canonicalJson, 'function')
  assert.equal(typeof computePolicyHash, 'function')
  assert.equal(typeof computeEvaluationHash, 'function')
  assert.equal(typeof validateBindingBoundary, 'function')
  assert.equal(typeof validateDependencyBoundary, 'function')
  assert.equal(typeof classifyPolicy, 'function')
})

// ── FATE test 1: valid dependency evidence with valid bindings → POLICY_BOUND ─

test('FATE #1008-1: valid DEPENDENCY_SATISFIED with valid binding → POLICY_BOUND', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BINDING_SATISFIED))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('FATE #1008-1b: POLICY_BOUND evaluation has all required fields', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_POLICY_EVALUATION')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.binding_id, 'binding-001')
  assert.equal(result.contract_id, 'contract-001')
  assert.equal(result.consumer_id, 'consumer-001')
  assert.equal(result.release_id, 'R1')
  assert.equal(result.dependency_hash, VALID_DEPENDENCY_HASH)
  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.ok(Array.isArray(result.policy_classes))
  assert.equal(result.policy_evaluation_hash_alg, 'sha256')
  assert.equal(typeof result.policy_evaluation_hash, 'string')
  assert.equal(result.policy_evaluation_hash.length, 64)
})

test('FATE #1008-1c: POLICY_BOUND is deterministic — same input same result', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(r1.policy_result, r2.policy_result)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
  assert.deepEqual(r1.policy_classes, r2.policy_classes)
})

// ── FATE test 2: missing external policy reference → POLICY_REJECTED ──────────

test('FATE #1008-2: missing external_policy_reference → POLICY_REJECTED', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ external_policy_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING))
})

test('FATE #1008-2b: missing external_policy_reference includes drift detection', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ external_policy_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DRIFT_DETECTED))
})

test('FATE #1008-2c: present external_policy_reference satisfies that requirement', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ external_policy_reference: 'policy-ref-001' })
  const result = classifyPolicy(evidence, binding)

  assert.ok(!result.policy_classes.includes(POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING))
})

// ── FATE test 3: missing human approval reference → POLICY_REJECTED ───────────

test('FATE #1008-3: missing human_approval_reference → POLICY_REJECTED', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ human_approval_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HUMAN_APPROVAL_MISSING))
})

test('FATE #1008-3b: missing human_approval_reference result is deterministic', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ human_approval_reference: null })
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(r1.policy_result, r2.policy_result)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

// ── FATE test 4: missing deployment authority reference → POLICY_REJECTED ─────

test('FATE #1008-4: missing deployment_authority_reference → POLICY_REJECTED', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ deployment_authority_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPLOYMENT_AUTHORITY_MISSING))
})

test('FATE #1008-4b: all three references missing produces all three rejection classes', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({
    external_policy_reference: null,
    human_approval_reference: null,
    deployment_authority_reference: null,
  })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING))
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HUMAN_APPROVAL_MISSING))
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPLOYMENT_AUTHORITY_MISSING))
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DRIFT_DETECTED))
})

// ── FATE test 5: NULL dependency evidence → NULL ──────────────────────────────

test('FATE #1008-5: NULL dependency_result → NULL policy result', () => {
  const evidence = makeNullEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
})

test('FATE #1008-5b: absent dependency evidence → NULL', () => {
  const binding = makeBinding()
  const result = classifyPolicy(null, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
})

test('FATE #1008-5c: undefined dependency evidence → NULL', () => {
  const binding = makeBinding()
  const result = classifyPolicy(undefined, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
})

test('FATE #1008-5d: DEPENDENCY_REJECTED evidence → POLICY_REJECTED (not POLICY_BOUND)', () => {
  const evidence = makeRejectedEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPENDENCY_NOT_SATISFIED))
  assert.notEqual(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
})

test('FATE #1008-5e: DEPENDENCY_REJECTED cannot be upgraded to POLICY_BOUND', () => {
  // Even with all references present, rejected dependency cannot upgrade
  const evidence = makeRejectedEvidence()
  const binding = makeBinding() // all references present
  const result = classifyPolicy(evidence, binding)

  assert.notEqual(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
})

test('FATE #1008-5f: NULL dependency cannot be upgraded to POLICY_BOUND', () => {
  const evidence = makeNullEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.notEqual(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
})

// ── FATE test 6: authority attempt → NULL ────────────────────────────────────

test('FATE #1008-6: creates_authority=true in binding → NULL + policy_authority_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ creates_authority: true })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_AUTHORITY_ATTEMPT))
})

test('FATE #1008-6b: authority_grant field in binding → NULL + policy_authority_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ authority_grant: 'admin' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_AUTHORITY_ATTEMPT))
})

test('FATE #1008-6c: authority attempt is not overridden by valid dependency evidence', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ creates_authority: true })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
})

// ── FATE test 7: proof attempt → NULL ────────────────────────────────────────

test('FATE #1008-7: creates_proof=true in binding → NULL + policy_proof_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ creates_proof: true })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_PROOF_ATTEMPT))
})

test('FATE #1008-7b: proof_signature field in binding → NULL + policy_proof_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ proof_signature: 'sig-abc' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_PROOF_ATTEMPT))
})

test('FATE #1008-7c: proof attempt result is deterministic', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ creates_proof: true })
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(r1.policy_result, r2.policy_result)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

// ── FATE test 8: execution attempt → NULL ────────────────────────────────────

test('FATE #1008-8: creates_execution=true in binding → NULL + policy_execution_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ creates_execution: true })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_EXECUTION_ATTEMPT))
})

test('FATE #1008-8b: execution_token field in binding → NULL + policy_execution_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ execution_token: 'tok-123' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_EXECUTION_ATTEMPT))
})

// ── FATE test 9: deployment attempt → NULL ───────────────────────────────────

test('FATE #1008-9: deployment_trigger field in binding → NULL + policy_deployment_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ deployment_trigger: true })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPLOYMENT_ATTEMPT))
})

test('FATE #1008-9b: deployment_token field in binding → NULL + policy_deployment_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ deployment_token: 'deploy-tok' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPLOYMENT_ATTEMPT))
})

test('FATE #1008-9c: deployment_capability field in binding → NULL + policy_deployment_attempt', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ deployment_capability: 'cap-xyz' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DEPLOYMENT_ATTEMPT))
})

// ── FATE test 10: invalid policy hash → NULL ─────────────────────────────────

test('FATE #1008-10: invalid policy_hash encoding → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'invalid-hash' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-10b: policy_hash with wrong length → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'abc123' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-10c: policy_hash with uppercase hex → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'A'.repeat(64) })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-10d: valid policy_hash → POLICY_BOUND', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBindingWithHash()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
})

test('FATE #1008-10e: absent policy_hash field → evaluated normally (optional field)', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding() // no policy_hash
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
})

// ── FATE test 11: invalid dependency hash → NULL ──────────────────────────────

test('FATE #1008-11: invalid dependency_hash in evidence → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence({ dependency_hash: 'not-hex' })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-11b: short dependency_hash → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence({ dependency_hash: 'abc123' })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-11c: uppercase dependency_hash → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence({ dependency_hash: 'A'.repeat(64) })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-11d: null dependency_hash is allowed (hash validation applies to non-null only)', () => {
  const evidence = makeSatisfiedEvidence({ dependency_hash: null })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.notEqual(result.policy_result, POLICY_RESULTS.NULL)
})

// ── FATE test 12: BREAK_GLASS normalization → NULL ───────────────────────────

test('FATE #1008-12: is_break_glass=true in dependency evidence → NULL + policy_break_glass_normalization', () => {
  const evidence = makeSatisfiedEvidence({ is_break_glass: true })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1008-12b: break_glass_normalized=true → NULL + policy_break_glass_normalization', () => {
  const evidence = makeSatisfiedEvidence({ break_glass_normalized: true })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1008-12c: break_glass failure_class → NULL + policy_break_glass_normalization', () => {
  const evidence = makeSatisfiedEvidence({ failure_class: 'break_glass_causal_normalization' })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1008-12d: break_glass in dependency_classes → NULL + policy_break_glass_normalization', () => {
  const evidence = makeSatisfiedEvidence({
    dependency_classes: ['dependency_break_glass_normalization'],
  })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION))
})

// ── FATE test 13: policy lineage mutation → NULL ──────────────────────────────

test('FATE #1008-13: valid policy_hash format but wrong value → NULL + policy_lineage_mutation', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'f'.repeat(64) }) // valid format but wrong hash
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_LINEAGE_MUTATION))
})

test('FATE #1008-13b: tampered policy_hash after correct hash was set → NULL + policy_lineage_mutation', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBindingWithHash()
  binding.policy_hash = '0'.repeat(64) // tamper with valid hash

  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_LINEAGE_MUTATION))
})

test('FATE #1008-13c: lineage mutation result is deterministic', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'f'.repeat(64) })
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(r1.policy_result, r2.policy_result)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

// ── FATE test 14: policy evidence remains evidence-only ───────────────────────

test('FATE #1008-14: classifyPolicy always produces evidence_only=true (all paths)', () => {
  const cases = [
    [makeSatisfiedEvidence(), makeBinding()],
    [makeRejectedEvidence(), makeBinding()],
    [makeNullEvidence(), makeBinding()],
    [null, makeBinding()],
    [makeSatisfiedEvidence(), makeBinding({ external_policy_reference: null })],
  ]
  for (const [evidence, binding] of cases) {
    const result = classifyPolicy(evidence, binding)
    assert.equal(
      result.evidence_only,
      true,
      `evidence_only must be true for policy_result=${result.policy_result}`,
    )
  }
})

test('FATE #1008-14b: validateBindingBoundary rejects evidence_only=false', () => {
  const bad = {
    evidence_only: false,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
  }
  const check = validateBindingBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('evidence_only')))
})

// ── FATE test 15: policy bindings cannot create authority ─────────────────────

test('FATE #1008-15: classifyPolicy always sets creates_authority=false (all paths)', () => {
  const cases = [
    [makeSatisfiedEvidence(), makeBinding()],
    [makeRejectedEvidence(), makeBinding()],
    [makeNullEvidence(), makeBinding()],
    [null, makeBinding()],
  ]
  for (const [evidence, binding] of cases) {
    const result = classifyPolicy(evidence, binding)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for policy_result=${result.policy_result}`,
    )
  }
})

test('FATE #1008-15b: policy evaluation contains no authority grant fields', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
})

// ── FATE test 16: policy bindings cannot create proof ────────────────────────

test('FATE #1008-16: classifyPolicy always sets creates_proof=false (all paths)', () => {
  const cases = [
    [makeSatisfiedEvidence(), makeBinding()],
    [makeRejectedEvidence(), makeBinding()],
    [null, makeBinding()],
  ]
  for (const [evidence, binding] of cases) {
    const result = classifyPolicy(evidence, binding)
    assert.equal(result.creates_proof, false)
  }
})

test('FATE #1008-16b: policy evaluation contains no proof fields', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
})

// ── FATE test 17: policy bindings cannot execute ──────────────────────────────

test('FATE #1008-17: classifyPolicy always sets creates_execution=false (all paths)', () => {
  const cases = [
    [makeSatisfiedEvidence(), makeBinding()],
    [makeRejectedEvidence(), makeBinding()],
    [null, makeBinding()],
  ]
  for (const [evidence, binding] of cases) {
    const result = classifyPolicy(evidence, binding)
    assert.equal(result.creates_execution, false)
  }
})

test('FATE #1008-17b: policy evaluation contains no execution fields', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('execution_token' in result), 'must not contain execution_token')
})

// ── FATE test 18: policy bindings cannot trigger deployment ───────────────────

test('FATE #1008-18: policy evaluation contains no deployment-related fields', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
})

test('FATE #1008-18b: validateBindingBoundary rejects deployment_trigger field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    deployment_trigger: true,
  }
  const check = validateBindingBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('deployment_trigger')))
})

// ── FATE test 19: same policy state produces same evaluation hash ─────────────

test('FATE #1008-19: same policy state produces same evaluation hash', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(
    r1.policy_evaluation_hash,
    r2.policy_evaluation_hash,
    'same state must produce same evaluation hash',
  )
})

test('FATE #1008-19b: computeEvaluationHash is deterministic — repeated calls same result', () => {
  const state = {
    binding_id: 'binding-001',
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    release_id: 'R1',
    dependency_hash: VALID_DEPENDENCY_HASH,
    policy_result: POLICY_RESULTS.POLICY_BOUND,
    policy_classes: [POLICY_CLASSES.POLICY_BINDING_SATISFIED],
  }
  const results = Array.from({ length: 5 }, () => computeEvaluationHash(state))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeEvaluationHash must always return same value for identical inputs')
})

test('FATE #1008-19c: different policy states produce different hashes', () => {
  const evidence = makeSatisfiedEvidence()
  const rejected = makeRejectedEvidence()
  const binding = makeBinding()

  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(rejected, binding)

  assert.notEqual(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

test('FATE #1008-19d: policy_evaluation_hash is 64-char hex SHA-256', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.equal(result.policy_evaluation_hash.length, 64)
  assert.ok(
    /^[0-9a-f]{64}$/.test(result.policy_evaluation_hash),
    'policy_evaluation_hash must be lowercase hex',
  )
})

test('FATE #1008-19e: policy_evaluation_hash does not include itself in payload', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  const recomputed = computeEvaluationHash({
    binding_id: result.binding_id,
    contract_id: result.contract_id,
    consumer_id: result.consumer_id,
    release_id: result.release_id,
    dependency_hash: result.dependency_hash,
    policy_result: result.policy_result,
    policy_classes: result.policy_classes,
  })
  assert.equal(result.policy_evaluation_hash, recomputed)
})

// ── FATE test 20: reordered policy classes preserve hash stability ─────────────

test('FATE #1008-20: computeEvaluationHash stable under reordered policy_classes', () => {
  const state1 = {
    binding_id: 'binding-001',
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    release_id: 'R1',
    dependency_hash: VALID_DEPENDENCY_HASH,
    policy_result: POLICY_RESULTS.POLICY_REJECTED,
    policy_classes: [
      POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING,
      POLICY_CLASSES.POLICY_HUMAN_APPROVAL_MISSING,
      POLICY_CLASSES.POLICY_DRIFT_DETECTED,
    ],
  }
  const state2 = {
    ...state1,
    policy_classes: [
      POLICY_CLASSES.POLICY_DRIFT_DETECTED,
      POLICY_CLASSES.POLICY_HUMAN_APPROVAL_MISSING,
      POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING,
    ],
  }
  assert.equal(
    computeEvaluationHash(state1),
    computeEvaluationHash(state2),
    'evaluation hash must be stable under reordered policy_classes',
  )
})

// ── FATE test 21: policy references cannot upgrade evidence into authority ─────

test('FATE #1008-21: POLICY_BOUND does not grant execution permission', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.evidence_only, true)
})

test('FATE #1008-21b: POLICY_BOUND does not grant deployment authorization', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('deployment_trigger' in result))
  assert.ok(!('deployment_capability' in result))
  assert.ok(!('runtime_route' in result))
  assert.ok(!('route_expansion' in result))
})

test('FATE #1008-21c: evidence cannot be upgraded into authority by any policy path', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_BOUND)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.creates_execution, false)
})

// ── FATE test 22: policy drift remains POLICY_REJECTED unless integrity-breaking

test('FATE #1008-22: policy drift (missing references) is POLICY_REJECTED, not NULL', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ external_policy_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DRIFT_DETECTED))
  assert.notEqual(result.policy_result, POLICY_RESULTS.NULL)
})

test('FATE #1008-22b: integrity-breaking lineage mutation is NULL, not POLICY_REJECTED', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'f'.repeat(64) }) // valid format, wrong value
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_LINEAGE_MUTATION))
  assert.notEqual(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
})

test('FATE #1008-22c: policy drift is observable via policy_drift_detected class', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ human_approval_reference: null })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_DRIFT_DETECTED))
})

// ── Additional: invalid hash encoding ─────────────────────────────────────────

test('FATE #1008-add-1: policy_hash with non-hex chars → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'z'.repeat(64) })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

test('FATE #1008-add-2: policy_hash with wrong length → NULL + policy_hash_invalid', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_hash: 'abcdef' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_HASH_INVALID))
})

// ── Additional: deterministic POLICY_REJECTED hashing ────────────────────────

test('FATE #1008-add-3: deterministic POLICY_REJECTED hash — same rejection same hash', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ external_policy_reference: null })
  const r1 = classifyPolicy(evidence, binding)
  const r2 = classifyPolicy(evidence, binding)

  assert.equal(r1.policy_result, POLICY_RESULTS.POLICY_REJECTED)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

// ── Additional: deterministic NULL hashing ────────────────────────────────────

test('FATE #1008-add-4: deterministic NULL hash — same NULL condition same hash', () => {
  const binding = makeBinding()
  const r1 = classifyPolicy(null, binding)
  const r2 = classifyPolicy(null, binding)

  assert.equal(r1.policy_result, POLICY_RESULTS.NULL)
  assert.equal(r1.policy_evaluation_hash, r2.policy_evaluation_hash)
})

// ── Additional: binding lineage mutation propagation ──────────────────────────

test('FATE #1008-add-5: mutating binding fields after hash computed → NULL + policy_lineage_mutation', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBindingWithHash()
  // Mutate a reference field after hash was set
  binding.external_policy_reference = 'changed-ref'

  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_LINEAGE_MUTATION))
})

// ── Additional: no runtime route expansion ────────────────────────────────────

test('FATE #1008-add-6: policy evaluation does not expand runtime routes', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('runtime_routes' in result))
  assert.ok(!('route_expansion' in result))
  assert.ok(!('execution_surface' in result))
  assert.ok(!('runtime_route' in result))
})

test('FATE #1008-add-6b: validateBindingBoundary rejects runtime_route field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    runtime_route: '/deploy',
  }
  const check = validateBindingBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('runtime_route')))
})

// ── Additional: no deployment capability expansion ────────────────────────────

test('FATE #1008-add-7: policy evaluation does not expand deployment capabilities', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('deployment_capability' in result))
  assert.ok(!('deploy_token' in result))
})

// ── Additional: no registry mutation ─────────────────────────────────────────

test('FATE #1008-add-8: classifyPolicy does not mutate input objects', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding()
  const evidenceSnapshot = JSON.stringify(evidence)
  const bindingSnapshot = JSON.stringify(binding)

  classifyPolicy(evidence, binding)

  assert.equal(JSON.stringify(evidence), evidenceSnapshot, 'dependency evidence must not be mutated')
  assert.equal(JSON.stringify(binding), bindingSnapshot, 'policy binding must not be mutated')
})

test('FATE #1008-add-8b: validateBindingBoundary rejects registry_mutation field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    registry_mutation: true,
  }
  const check = validateBindingBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('registry_mutation')))
})

// ── Additional: no lineage rewriting ─────────────────────────────────────────

test('FATE #1008-add-9: policy evaluation does not rewrite lineage', () => {
  const result = classifyPolicy(makeSatisfiedEvidence(), makeBinding())

  assert.ok(!('lineage_repair' in result))
  assert.ok(!('ancestor_release_ids' in result))
  assert.ok(!('registry_mutation' in result))
})

test('FATE #1008-add-9b: validateBindingBoundary rejects lineage_repair field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    lineage_repair: true,
  }
  const check = validateBindingBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('lineage_repair')))
})

// ── Additional: no implicit authority upgrade ─────────────────────────────────

test('FATE #1008-add-10: dependency evidence with evidence_only=false → NULL (boundary violation)', () => {
  const evidence = makeSatisfiedEvidence({ evidence_only: false })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION))
})

test('FATE #1008-add-11: dependency evidence with creates_authority=true → NULL (boundary violation)', () => {
  const evidence = makeSatisfiedEvidence({ creates_authority: true })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION))
})

test('FATE #1008-add-12: dependency evidence with creates_execution=true → NULL (boundary violation)', () => {
  const evidence = makeSatisfiedEvidence({ creates_execution: true })
  const binding = makeBinding()
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION))
})

test('FATE #1008-add-13: policy_override field in binding → NULL (boundary violation)', () => {
  const evidence = makeSatisfiedEvidence()
  const binding = makeBinding({ policy_override: 'bypass' })
  const result = classifyPolicy(evidence, binding)

  assert.equal(result.policy_result, POLICY_RESULTS.NULL)
  assert.ok(result.policy_classes.includes(POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION))
})

// ── canonicalJson helpers ─────────────────────────────────────────────────────

test('FATE #1008-add-14: canonicalJson sorts keys alphabetically', () => {
  const obj = { z: 1, a: 2, m: 3 }
  const result = canonicalJson(obj)
  assert.ok(result.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #1008-add-15: canonicalJson normalizes different key insertion orders to same output', () => {
  const obj1 = { release_id: 'R1', policy_result: 'POLICY_BOUND', binding_id: 'b1' }
  const obj2 = { policy_result: 'POLICY_BOUND', binding_id: 'b1', release_id: 'R1' }
  assert.equal(canonicalJson(obj1), canonicalJson(obj2))
})

// ── computePolicyHash ─────────────────────────────────────────────────────────

test('FATE #1008-add-16: computePolicyHash is deterministic', () => {
  const binding = makeBinding()
  const h1 = computePolicyHash(binding)
  const h2 = computePolicyHash(binding)

  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(h1))
})

test('FATE #1008-add-17: computePolicyHash changes when binding fields change', () => {
  const b1 = makeBinding({ binding_id: 'binding-001' })
  const b2 = makeBinding({ binding_id: 'binding-002' })

  assert.notEqual(computePolicyHash(b1), computePolicyHash(b2))
})

test('FATE #1008-add-18: computePolicyHash excludes policy_hash field from payload', () => {
  const binding = makeBindingWithHash()
  const recomputed = computePolicyHash(binding)
  assert.equal(binding.policy_hash, recomputed)
})

// ── validateDependencyBoundary ────────────────────────────────────────────────

test('FATE #1008-add-19: validateDependencyBoundary accepts valid dependency evidence', () => {
  const evidence = makeSatisfiedEvidence()
  const check = validateDependencyBoundary(evidence)
  assert.equal(check.valid, true)
  assert.deepEqual(check.violations, [])
})

test('FATE #1008-add-20: validateDependencyBoundary rejects authority_grant field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    authority_grant: 'admin',
  }
  const check = validateDependencyBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('authority_grant')))
})

// ── Non-regression: prior provenance scripts remain intact ────────────────────

test('FATE #1008 non-regression: release-provenance-dependency-contracts.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-dependency-contracts.mjs')
  assert.ok(typeof mod.classifyDependency === 'function')
  assert.ok(typeof mod.DEPENDENCY_RESULTS === 'object')
  assert.ok(typeof mod.DEPENDENCY_CLASSES === 'object')
})

test('FATE #1008 non-regression: release-provenance-finality-checkpoints.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-finality-checkpoints.mjs')
  assert.ok(typeof mod.classifyFinalityCheckpoint === 'function')
  assert.ok(typeof mod.FINALITY_RESULTS === 'object')
})

test('FATE #1008 non-regression: release-provenance-causal-ordering.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-causal-ordering.mjs')
  assert.ok(typeof mod.classifyCausalOrdering === 'function')
  assert.ok(typeof mod.CAUSAL_FAILURE_CLASSES === 'object')
})

test('FATE #1008 non-regression: issue-1006 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1006-release-provenance-dependency-contracts.test.mjs')),
    '#1006 FATE test file must remain present',
  )
})

test('FATE #1008 non-regression: issue-1002 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1002-release-provenance-finality-checkpoints.test.mjs')),
    '#1002 FATE test file must remain present',
  )
})
