/**
 * Issue #1012 — RELEASE_PROVENANCE_POLICY_FINALITY_V1
 *
 * FATE tests proving deterministic policy finality classification
 * for release provenance.
 *
 * Verifies:
 *   1.  POLICY_RECONCILED evidence → POLICY_FINALIZED
 *   2.  POLICY_DRIFT_DETECTED evidence → POLICY_NOT_FINAL
 *   3.  NULL reconciliation result → NULL finality
 *   4.  BREAK_GLASS normalization → NULL finality
 *   5.  boundary violations → NULL finality
 *   6.  hash validations → NULL finality
 *   7.  integrity-breaking reconciliation classes → NULL (before result classification)
 *   8.  policy finality remains evidence-only
 *   9.  policy finality cannot create authority
 *   10. policy finality cannot create proof
 *   11. policy finality cannot execute
 *   12. determinism — same state produces same hash
 *   13. non-mutation of inputs
 *   14. no deployment capability expansion
 *   15. no registry mutation
 *
 * Codex blockers:
 *   - missing policy_reconciliation_hash → NULL + malformed_hash
 *   - null policy_reconciliation_hash → NULL + malformed_hash
 *   - empty policy_reconciliation_hash → NULL + malformed_hash
 *   - POLICY_RECONCILED + policy_lineage_mutation → NULL + integrity_drift
 *   - POLICY_RECONCILED + policy_hash_mismatch → NULL + integrity_drift
 *   - non-array binding_ids → NULL + boundary_violation (no throw)
 *   - non-array policy_hashes → NULL + boundary_violation (no throw)
 *   - POLICY_FINALIZED output includes all evidence-only flags
 *   - POLICY_NOT_FINAL output includes all evidence-only flags
 *   - NULL output includes all evidence-only flags
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
  POLICY_FINALITY_RESULTS,
  POLICY_FINALITY_CLASSES,
  classifyPolicyFinality,
  computeFinalityHash,
} from '../../scripts/release-provenance-policy-finality.mjs'

import {
  POLICY_RECONCILIATION_RESULTS,
  computeReconciliationHash,
} from '../../scripts/release-provenance-policy-reconciliation.mjs'

// ── Required finality class values ────────────────────────────────────────────

const REQUIRED_FINALITY_CLASSES = [
  'policy_finalized',
  'policy_not_final_drift',
  'policy_not_final_dependency_disagreement',
  'policy_not_final_policy_disagreement',
  'policy_finality_boundary_violation',
  'policy_finality_authority_attempt',
  'policy_finality_proof_attempt',
  'policy_finality_execution_attempt',
  'policy_finality_deployment_attempt',
  'policy_finality_malformed_hash',
  'policy_finality_break_glass_normalization',
  'policy_finality_lineage_mutation',
  'policy_finality_integrity_drift',
]

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Builds a reconciliation evidence object with a correct deterministic hash
 * for the given result and classes.
 */
function makeReconEvidence(result, classes, overrides = {}) {
  const bindingIds = ['binding-001', 'binding-002']
  const contractIds = ['contract-001']
  const consumerIds = ['consumer-001', 'consumer-002']
  const evalHashes = []
  const policyHashes = []

  const hash = computeReconciliationHash({
    binding_ids: bindingIds,
    contract_ids: contractIds,
    consumer_ids: consumerIds,
    policy_evaluation_hashes: evalHashes,
    policy_hashes: policyHashes,
    policy_reconciliation_classes: classes,
    policy_reconciliation_result: result,
  })

  return {
    artifact: 'RELEASE_PROVENANCE_POLICY_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_reconciliation_result: result,
    policy_reconciliation_classes: classes,
    binding_ids: bindingIds,
    contract_ids: contractIds,
    consumer_ids: consumerIds,
    policy_hashes: policyHashes,
    policy_evaluation_hashes: evalHashes,
    policy_reconciliation_hash_alg: 'sha256',
    policy_reconciliation_hash: hash,
    ...overrides,
  }
}

function makeReconciledEvidence(overrides = {}) {
  return makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied'],
    overrides,
  )
}

function makeDriftEvidence(classes = ['policy_evaluation_mismatch', 'policy_reconciliation_drift'], overrides = {}) {
  return makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
    classes,
    overrides,
  )
}

function makeBindingMissingDrift(overrides = {}) {
  return makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
    ['policy_binding_missing', 'policy_reconciliation_drift'],
    overrides,
  )
}

function makeReferenceMismatchDrift(overrides = {}) {
  return makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
    ['policy_reference_mismatch', 'policy_reconciliation_drift'],
    overrides,
  )
}

function makeNullReconEvidence(classes = ['policy_boundary_violation'], overrides = {}) {
  return makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.NULL,
    classes,
    overrides,
  )
}

// ── Script presence and exports ───────────────────────────────────────────────

test('issue #1012: release-provenance-policy-finality.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-policy-finality.mjs')),
    'scripts/release-provenance-policy-finality.mjs must exist',
  )
})

test('issue #1012: exports POLICY_FINALITY_RESULTS with POLICY_FINALIZED, POLICY_NOT_FINAL, NULL', () => {
  assert.equal(POLICY_FINALITY_RESULTS.POLICY_FINALIZED, 'POLICY_FINALIZED')
  assert.equal(POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL, 'POLICY_NOT_FINAL')
  assert.equal(POLICY_FINALITY_RESULTS.NULL, 'NULL')
})

test('issue #1012: exports POLICY_FINALITY_CLASSES with all 13 required values', () => {
  for (const cls of REQUIRED_FINALITY_CLASSES) {
    const found = Object.values(POLICY_FINALITY_CLASSES).includes(cls)
    assert.ok(found, `POLICY_FINALITY_CLASSES must include value "${cls}"`)
  }
})

test('issue #1012: exports classifyPolicyFinality function', () => {
  assert.equal(typeof classifyPolicyFinality, 'function')
})

test('issue #1012: exports computeFinalityHash function', () => {
  assert.equal(typeof computeFinalityHash, 'function')
})

// ── FATE test 1: POLICY_RECONCILED → POLICY_FINALIZED ────────────────────────

test('FATE #1012-1: POLICY_RECONCILED evidence → POLICY_FINALIZED', () => {
  const evidence = makeReconciledEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
  assert.ok(result.policy_finality_classes.includes(POLICY_FINALITY_CLASSES.POLICY_FINALIZED))
})

test('FATE #1012-1b: POLICY_FINALIZED output has all required fields', () => {
  const evidence = makeReconciledEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_POLICY_FINALITY')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
  assert.ok(Array.isArray(result.policy_finality_classes))
  assert.ok(Array.isArray(result.binding_ids))
  assert.ok(Array.isArray(result.contract_ids))
  assert.ok(Array.isArray(result.consumer_ids))
  assert.equal(result.policy_finality_hash_alg, 'sha256')
  assert.equal(typeof result.policy_finality_hash, 'string')
  assert.equal(result.policy_finality_hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(result.policy_finality_hash))
})

test('FATE #1012-1c: POLICY_FINALIZED carries policy_reconciliation_hash through', () => {
  const evidence = makeReconciledEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_reconciliation_hash, evidence.policy_reconciliation_hash)
})

test('FATE #1012-1d: POLICY_FINALIZED result is deterministic — same input same output', () => {
  const evidence = makeReconciledEvidence()
  const r1 = classifyPolicyFinality(evidence)
  const r2 = classifyPolicyFinality(evidence)

  assert.equal(r1.policy_finality_result, r2.policy_finality_result)
  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
  assert.deepEqual(r1.policy_finality_classes, r2.policy_finality_classes)
})

// ── FATE test 2: POLICY_DRIFT_DETECTED → POLICY_NOT_FINAL ────────────────────

test('FATE #1012-2: POLICY_DRIFT_DETECTED (general drift) → POLICY_NOT_FINAL', () => {
  const evidence = makeDriftEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL)
  assert.ok(result.policy_finality_classes.includes(POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_DRIFT))
})

test('FATE #1012-2b: POLICY_NOT_FINAL output has all required evidence-only fields', () => {
  const evidence = makeDriftEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('FATE #1012-2c: binding_missing drift → POLICY_NOT_FINAL + dependency_disagreement', () => {
  const evidence = makeBindingMissingDrift()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_DEPENDENCY_DISAGREEMENT,
    ),
  )
})

test('FATE #1012-2d: reference_mismatch drift → POLICY_NOT_FINAL + policy_disagreement', () => {
  const evidence = makeReferenceMismatchDrift()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_POLICY_DISAGREEMENT,
    ),
  )
})

test('FATE #1012-2e: POLICY_NOT_FINAL is deterministic — same drift same hash', () => {
  const evidence = makeDriftEvidence()
  const r1 = classifyPolicyFinality(evidence)
  const r2 = classifyPolicyFinality(evidence)

  assert.equal(r1.policy_finality_result, r2.policy_finality_result)
  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
})

test('FATE #1012-2f: POLICY_NOT_FINAL cannot be upgraded to POLICY_FINALIZED', () => {
  const evidence = makeDriftEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.notEqual(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
})

// ── FATE test 3: NULL reconciliation → NULL finality ─────────────────────────

test('FATE #1012-3: NULL reconciliation result → NULL finality', () => {
  const evidence = makeNullReconEvidence()
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-3b: absent/null input → NULL finality', () => {
  assert.equal(classifyPolicyFinality(null).policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.equal(classifyPolicyFinality(undefined).policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-3c: non-object input → NULL finality', () => {
  assert.equal(classifyPolicyFinality('string').policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.equal(classifyPolicyFinality(42).policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.equal(classifyPolicyFinality([]).policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-3d: NULL finality output has all required evidence-only fields', () => {
  const result = classifyPolicyFinality(null)

  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.artifact, 'RELEASE_PROVENANCE_POLICY_FINALITY')
  assert.equal(typeof result.policy_finality_hash, 'string')
  assert.equal(result.policy_finality_hash.length, 64)
})

test('FATE #1012-3e: NULL result is deterministic — same null condition same hash', () => {
  const r1 = classifyPolicyFinality(null)
  const r2 = classifyPolicyFinality(null)

  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
})

// ── FATE test 4: BREAK_GLASS normalization → NULL ────────────────────────────

test('FATE #1012-4: break_glass=true in reconciliation evidence → NULL + break_glass_normalization', () => {
  const evidence = makeReconciledEvidence({ break_glass: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_BREAK_GLASS_NORMALIZATION,
    ),
  )
})

test('FATE #1012-4b: is_break_glass=true → NULL + break_glass_normalization', () => {
  const evidence = makeReconciledEvidence({ is_break_glass: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_BREAK_GLASS_NORMALIZATION,
    ),
  )
})

test('FATE #1012-4c: break_glass_normalized=true → NULL', () => {
  const evidence = makeReconciledEvidence({ break_glass_normalized: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-4d: failure_class containing break_glass → NULL', () => {
  const evidence = makeReconciledEvidence({ failure_class: 'policy_break_glass_normalization' })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

// ── FATE test 5: boundary violations → NULL ───────────────────────────────────

test('FATE #1012-5: creates_authority=true → NULL + authority_attempt', () => {
  const evidence = makeReconciledEvidence({ creates_authority: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_AUTHORITY_ATTEMPT,
    ),
  )
})

test('FATE #1012-5b: authority_grant field present → NULL + authority_attempt', () => {
  const evidence = makeReconciledEvidence({ authority_grant: 'admin' })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_AUTHORITY_ATTEMPT,
    ),
  )
})

test('FATE #1012-5c: creates_proof=true → NULL + proof_attempt', () => {
  const evidence = makeReconciledEvidence({ creates_proof: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_PROOF_ATTEMPT,
    ),
  )
})

test('FATE #1012-5d: creates_execution=true → NULL + execution_attempt', () => {
  const evidence = makeReconciledEvidence({ creates_execution: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_EXECUTION_ATTEMPT,
    ),
  )
})

test('FATE #1012-5e: deployment_trigger field present → NULL + deployment_attempt', () => {
  const evidence = makeReconciledEvidence({ deployment_trigger: 'deploy-now' })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_DEPLOYMENT_ATTEMPT,
    ),
  )
})

test('FATE #1012-5f: evidence_only=false → NULL + boundary_violation', () => {
  const evidence = makeReconciledEvidence({ evidence_only: false })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-5g: registry_mutation field present → NULL', () => {
  const evidence = makeReconciledEvidence({ registry_mutation: true })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

// ── FATE test 6: hash validations → NULL ──────────────────────────────────────

test('FATE #1012-6: malformed hash (short) → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: 'abc123' })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
  )
})

test('FATE #1012-6b: malformed hash (uppercase) → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: 'A'.repeat(64) })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
  )
})

test('FATE #1012-6c: malformed hash (non-hex chars) → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: 'z'.repeat(64) })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
  )
})

test('FATE #1012-6d: valid-format but wrong hash value → NULL + lineage_mutation', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: 'f'.repeat(64) })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_LINEAGE_MUTATION,
    ),
  )
})

test('FATE #1012-6e: tampered reconciliation classes after hash set → NULL + lineage_mutation', () => {
  const evidence = makeReconciledEvidence()
  // Tamper: change classes after hash was computed
  evidence.policy_reconciliation_classes = ['policy_reconciliation_satisfied', 'policy_extra']
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_LINEAGE_MUTATION,
    ),
  )
})

test('FATE #1012-6f: tampered result field after hash set → NULL + lineage_mutation', () => {
  const evidence = makeReconciledEvidence()
  // Tamper: change result without updating hash
  evidence.policy_reconciliation_result = POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_LINEAGE_MUTATION,
    ),
  )
})

// ── FATE test 7: integrity-breaking classes → NULL (before result classification)

test('FATE #1012-7: POLICY_RECONCILED + policy_lineage_mutation in classes → NULL + integrity_drift', () => {
  // Build evidence with valid hash for this (inconsistent) state
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_lineage_mutation'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7b: POLICY_RECONCILED + policy_hash_mismatch in classes → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_hash_mismatch'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7c: POLICY_RECONCILED + policy_evaluation_hash_mismatch → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_evaluation_hash_mismatch'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7d: POLICY_RECONCILED + policy_boundary_violation in classes → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_boundary_violation'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7e: POLICY_RECONCILED + policy_authority_attempt in classes → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_authority_attempt'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7f: POLICY_RECONCILED + policy_break_glass_normalization in classes → NULL', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_break_glass_normalization'],
  )
  const result = classifyPolicyFinality(evidence)

  // detectBreakGlassNormalization fires before integrity class check (both produce NULL)
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-7g: POLICY_DRIFT_DETECTED + policy_lineage_mutation in classes → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED,
    ['policy_evaluation_mismatch', 'policy_lineage_mutation'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('FATE #1012-7h: integrity_drift check fires before result classification', () => {
  // POLICY_RECONCILED with integrity-breaking classes should NEVER produce POLICY_FINALIZED
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_lineage_mutation'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.notEqual(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

// ── FATE test 8–11: evidence-only invariants (all paths) ─────────────────────

test('FATE #1012-8: evidence_only=true on all result paths', () => {
  const cases = [
    makeReconciledEvidence(),
    makeDriftEvidence(),
    makeNullReconEvidence(),
  ]
  for (const evidence of cases) {
    const result = classifyPolicyFinality(evidence)
    assert.equal(
      result.evidence_only,
      true,
      `evidence_only must be true for result=${result.policy_finality_result}`,
    )
  }
  // Also check null input
  assert.equal(classifyPolicyFinality(null).evidence_only, true)
})

test('FATE #1012-9: creates_authority=false on all result paths', () => {
  const cases = [
    makeReconciledEvidence(),
    makeDriftEvidence(),
    makeNullReconEvidence(),
    null,
  ]
  for (const evidence of cases) {
    const result = classifyPolicyFinality(evidence)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for result=${result.policy_finality_result}`,
    )
  }
})

test('FATE #1012-10: creates_proof=false on all result paths', () => {
  const cases = [
    makeReconciledEvidence(),
    makeDriftEvidence(),
    makeNullReconEvidence(),
    null,
  ]
  for (const evidence of cases) {
    const result = classifyPolicyFinality(evidence)
    assert.equal(result.creates_proof, false)
  }
})

test('FATE #1012-11: creates_execution=false on all result paths', () => {
  const cases = [
    makeReconciledEvidence(),
    makeDriftEvidence(),
    makeNullReconEvidence(),
    null,
  ]
  for (const evidence of cases) {
    const result = classifyPolicyFinality(evidence)
    assert.equal(result.creates_execution, false)
  }
})

test('FATE #1012-11b: finality output contains no authority grant fields', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
})

test('FATE #1012-11c: finality output contains no proof fields', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
})

test('FATE #1012-11d: finality output contains no execution fields', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('execution_token' in result), 'must not contain execution_token')
  assert.ok(!('runtime_route' in result), 'must not contain runtime_route')
  assert.ok(!('route_expansion' in result), 'must not contain route_expansion')
})

// ── FATE test 12: determinism ─────────────────────────────────────────────────

test('FATE #1012-12: same POLICY_FINALIZED state produces same finality hash', () => {
  const evidence = makeReconciledEvidence()
  const r1 = classifyPolicyFinality(evidence)
  const r2 = classifyPolicyFinality(evidence)

  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
})

test('FATE #1012-12b: same POLICY_NOT_FINAL state produces same hash', () => {
  const evidence = makeDriftEvidence()
  const r1 = classifyPolicyFinality(evidence)
  const r2 = classifyPolicyFinality(evidence)

  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
})

test('FATE #1012-12c: same NULL state produces same hash', () => {
  const evidence = makeNullReconEvidence()
  const r1 = classifyPolicyFinality(evidence)
  const r2 = classifyPolicyFinality(evidence)

  assert.equal(r1.policy_finality_hash, r2.policy_finality_hash)
})

test('FATE #1012-12d: policy_finality_hash is 64-char lowercase hex', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.equal(result.policy_finality_hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(result.policy_finality_hash))
})

test('FATE #1012-12e: computeFinalityHash is deterministic', () => {
  const fields = {
    policy_finality_result: POLICY_FINALITY_RESULTS.POLICY_FINALIZED,
    policy_finality_classes: ['policy_finalized'],
    policy_reconciliation_hash: 'e'.repeat(64),
    binding_ids: ['b1', 'b2'],
    contract_ids: ['c1'],
    consumer_ids: ['a1', 'a2'],
  }
  const h1 = computeFinalityHash(fields)
  const h2 = computeFinalityHash(fields)

  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(h1))
})

test('FATE #1012-12f: computeFinalityHash stable under reordered input arrays', () => {
  const base = {
    policy_finality_result: POLICY_FINALITY_RESULTS.POLICY_FINALIZED,
    policy_finality_classes: ['policy_finalized'],
    policy_reconciliation_hash: 'e'.repeat(64),
    contract_ids: ['c1'],
  }
  const h1 = computeFinalityHash({ ...base, binding_ids: ['b2', 'b1'], consumer_ids: ['a2', 'a1'] })
  const h2 = computeFinalityHash({ ...base, binding_ids: ['b1', 'b2'], consumer_ids: ['a1', 'a2'] })

  assert.equal(h1, h2, 'hash must be stable regardless of array element order')
})

test('FATE #1012-12g: different finality states produce different hashes', () => {
  const finalizedHash = classifyPolicyFinality(makeReconciledEvidence()).policy_finality_hash
  const notFinalHash = classifyPolicyFinality(makeDriftEvidence()).policy_finality_hash

  assert.notEqual(finalizedHash, notFinalHash)
})

// ── FATE test 13: non-mutation of inputs ──────────────────────────────────────

test('FATE #1012-13: classifyPolicyFinality does not mutate input evidence', () => {
  const evidence = makeReconciledEvidence()
  const snapshot = JSON.stringify(evidence)

  classifyPolicyFinality(evidence)

  assert.equal(JSON.stringify(evidence), snapshot, 'input must not be mutated')
})

test('FATE #1012-13b: does not mutate drift evidence', () => {
  const evidence = makeDriftEvidence()
  const snapshot = JSON.stringify(evidence)

  classifyPolicyFinality(evidence)

  assert.equal(JSON.stringify(evidence), snapshot)
})

// ── FATE test 14–15: no deployment/registry mutation fields ──────────────────

test('FATE #1012-14: finality output contains no lineage or registry mutation fields', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.ok(!('lineage_repair' in result))
  assert.ok(!('registry_mutation' in result))
  assert.ok(!('auto_repair' in result))
  assert.ok(!('drift_resolution' in result))
})

// ── Codex blockers ────────────────────────────────────────────────────────────

test('CODEX #1012-C1: missing policy_reconciliation_hash → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence()
  delete evidence.policy_reconciliation_hash
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
    'class must be policy_finality_malformed_hash',
  )
})

test('CODEX #1012-C2: null policy_reconciliation_hash → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: null })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
  )
})

test('CODEX #1012-C3: empty string policy_reconciliation_hash → NULL + malformed_hash', () => {
  const evidence = makeReconciledEvidence({ policy_reconciliation_hash: '' })
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH,
    ),
  )
})

test('CODEX #1012-C4: POLICY_RECONCILED + policy_lineage_mutation class → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_lineage_mutation'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
  assert.notEqual(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
})

test('CODEX #1012-C5: POLICY_RECONCILED + policy_hash_mismatch class → NULL + integrity_drift', () => {
  const evidence = makeReconEvidence(
    POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    ['policy_reconciliation_satisfied', 'policy_hash_mismatch'],
  )
  const result = classifyPolicyFinality(evidence)

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT,
    ),
  )
})

test('CODEX #1012-C6: non-array binding_ids → NULL + boundary_violation (no throw)', () => {
  const evidence = {
    artifact: 'RELEASE_PROVENANCE_POLICY_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_reconciliation_result: POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
    binding_ids: 'not-an-array',
    contract_ids: ['c-001'],
    consumer_ids: ['consumer-001'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_hash: 'a'.repeat(64),
  }

  let result
  assert.doesNotThrow(() => {
    result = classifyPolicyFinality(evidence)
  }, 'must not throw on non-array binding_ids')

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION,
    ),
  )
})

test('CODEX #1012-C7: non-array policy_hashes → NULL + boundary_violation (no throw)', () => {
  const evidence = {
    artifact: 'RELEASE_PROVENANCE_POLICY_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_reconciliation_result: POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
    binding_ids: ['b-001'],
    contract_ids: ['c-001'],
    consumer_ids: ['consumer-001'],
    policy_hashes: 'not-an-array',
    policy_evaluation_hashes: [],
    policy_reconciliation_hash: 'a'.repeat(64),
  }

  let result
  assert.doesNotThrow(() => {
    result = classifyPolicyFinality(evidence)
  }, 'must not throw on non-array policy_hashes')

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(
    result.policy_finality_classes.includes(
      POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION,
    ),
  )
})

test('CODEX #1012-C8: POLICY_FINALIZED output includes all four evidence-only flags', () => {
  const result = classifyPolicyFinality(makeReconciledEvidence())

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('CODEX #1012-C9: POLICY_NOT_FINAL output includes all four evidence-only flags', () => {
  const result = classifyPolicyFinality(makeDriftEvidence())

  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('CODEX #1012-C10: NULL output includes all four evidence-only flags', () => {
  const cases = [
    classifyPolicyFinality(null),
    classifyPolicyFinality(makeNullReconEvidence()),
    classifyPolicyFinality(makeReconciledEvidence({ creates_authority: true })),
  ]
  for (const result of cases) {
    assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
    assert.equal(result.evidence_only, true)
    assert.equal(result.creates_authority, false)
    assert.equal(result.creates_execution, false)
    assert.equal(result.creates_proof, false)
  }
})

// ── Additional: array field validation ───────────────────────────────────────

test('FATE #1012-add-1: non-array contract_ids → NULL + boundary_violation (no throw)', () => {
  const evidence = {
    artifact: 'RELEASE_PROVENANCE_POLICY_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_reconciliation_result: POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    policy_reconciliation_classes: ['policy_reconciliation_satisfied'],
    binding_ids: ['b-001'],
    contract_ids: { invalid: true },
    consumer_ids: ['consumer-001'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_hash: 'a'.repeat(64),
  }

  let result
  assert.doesNotThrow(() => { result = classifyPolicyFinality(evidence) })
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
  assert.ok(result.policy_finality_classes.includes(POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION))
})

test('FATE #1012-add-2: non-array policy_reconciliation_classes → NULL + boundary_violation (no throw)', () => {
  const evidence = {
    artifact: 'RELEASE_PROVENANCE_POLICY_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_reconciliation_result: POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
    policy_reconciliation_classes: 42,
    binding_ids: ['b-001'],
    contract_ids: ['c-001'],
    consumer_ids: ['consumer-001'],
    policy_hashes: [],
    policy_evaluation_hashes: [],
    policy_reconciliation_hash: 'a'.repeat(64),
  }

  let result
  assert.doesNotThrow(() => { result = classifyPolicyFinality(evidence) })
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.NULL)
})

test('FATE #1012-add-3: absent array fields (undefined) are treated as empty — no violation', () => {
  // Build evidence where array fields are simply absent (not present at all)
  // This should not trigger array validation failure — missing is OK, present-non-array is not
  const base = makeReconciledEvidence()
  delete base.policy_hashes
  delete base.policy_evaluation_hashes
  // Recompute hash without those fields (they default to [] in computeReconciliationHash)
  const hash = computeReconciliationHash({
    binding_ids: base.binding_ids,
    contract_ids: base.contract_ids,
    consumer_ids: base.consumer_ids,
    policy_evaluation_hashes: [],
    policy_hashes: [],
    policy_reconciliation_classes: base.policy_reconciliation_classes,
    policy_reconciliation_result: base.policy_reconciliation_result,
  })
  base.policy_reconciliation_hash = hash

  const result = classifyPolicyFinality(base)
  assert.equal(result.policy_finality_result, POLICY_FINALITY_RESULTS.POLICY_FINALIZED)
})

// ── Additional: all integrity-breaking classes produce NULL ──────────────────

test('FATE #1012-add-4: all integrity-breaking recon classes produce NULL finality', () => {
  const integrityBreakingClasses = [
    'policy_lineage_mutation',
    'policy_hash_mismatch',
    'policy_evaluation_hash_mismatch',
    'policy_boundary_violation',
    'policy_authority_attempt',
    'policy_proof_attempt',
    'policy_execution_attempt',
    'policy_deployment_attempt',
  ]

  for (const cls of integrityBreakingClasses) {
    const evidence = makeReconEvidence(
      POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED,
      ['policy_reconciliation_satisfied', cls],
    )
    const result = classifyPolicyFinality(evidence)
    assert.equal(
      result.policy_finality_result,
      POLICY_FINALITY_RESULTS.NULL,
      `integrity-breaking class "${cls}" with POLICY_RECONCILED must produce NULL finality`,
    )
  }
})

// ── Additional: hash self-exclusion and recomputation ────────────────────────

test('FATE #1012-add-5: policy_finality_hash does not include itself in payload', () => {
  const evidence = makeReconciledEvidence()
  const result = classifyPolicyFinality(evidence)
  const recomputed = computeFinalityHash({
    policy_finality_result: result.policy_finality_result,
    policy_finality_classes: result.policy_finality_classes,
    policy_reconciliation_hash: result.policy_reconciliation_hash,
    binding_ids: result.binding_ids,
    contract_ids: result.contract_ids,
    consumer_ids: result.consumer_ids,
  })
  assert.equal(result.policy_finality_hash, recomputed)
})

test('FATE #1012-add-6: policy_finality_hash changes when finality result changes', () => {
  const h1 = computeFinalityHash({
    policy_finality_result: POLICY_FINALITY_RESULTS.POLICY_FINALIZED,
    policy_finality_classes: ['policy_finalized'],
    policy_reconciliation_hash: 'e'.repeat(64),
    binding_ids: [], contract_ids: [], consumer_ids: [],
  })
  const h2 = computeFinalityHash({
    policy_finality_result: POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL,
    policy_finality_classes: ['policy_not_final_drift'],
    policy_reconciliation_hash: 'e'.repeat(64),
    binding_ids: [], contract_ids: [], consumer_ids: [],
  })
  assert.notEqual(h1, h2)
})

// ── Non-regression: prior provenance scripts and tests remain intact ──────────

test('FATE #1012 non-regression: release-provenance-policy-reconciliation.mjs intact', async () => {
  const mod = await import('../../scripts/release-provenance-policy-reconciliation.mjs')
  assert.ok(typeof mod.reconcilePolicyBindings === 'function')
  assert.ok(typeof mod.POLICY_RECONCILIATION_RESULTS === 'object')
  assert.ok(typeof mod.POLICY_RECONCILIATION_CLASSES === 'object')
  assert.ok(typeof mod.computeReconciliationHash === 'function')
})

test('FATE #1012 non-regression: release-provenance-policy-bindings.mjs intact', async () => {
  const mod = await import('../../scripts/release-provenance-policy-bindings.mjs')
  assert.ok(typeof mod.classifyPolicy === 'function')
  assert.ok(typeof mod.POLICY_RESULTS === 'object')
  assert.ok(typeof mod.canonicalJson === 'function')
})

test('FATE #1012 non-regression: issue-1010 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1010-release-provenance-policy-reconciliation.test.mjs')),
    '#1010 FATE test file must remain present',
  )
})

test('FATE #1012 non-regression: issue-1008 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1008-release-provenance-policy-bindings.test.mjs')),
    '#1008 FATE test file must remain present',
  )
})

test('FATE #1012 non-regression: issue-1002 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1002-release-provenance-finality-checkpoints.test.mjs')),
    '#1002 FATE test file must remain present',
  )
})
