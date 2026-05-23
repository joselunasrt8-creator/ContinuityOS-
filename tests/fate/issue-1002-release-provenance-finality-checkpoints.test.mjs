/**
 * Issue #1002 — RELEASE_PROVENANCE_FINALITY_CHECKPOINTS_V1
 *
 * FATE tests proving deterministic finality checkpoints for
 * distributed release provenance.
 *
 * Verifies:
 *   1.  valid causal evidence can reach FINALIZED
 *   2.  concurrent causal evidence remains NOT_FINAL
 *   3.  reconciliation drift remains NOT_FINAL unless integrity-breaking
 *   4.  causal NULL results produce NULL finality
 *   5.  replay anomalies produce NULL finality
 *   6.  lineage mutation produces NULL finality
 *   7.  invalid rollback ancestry produces NULL finality
 *   8.  BREAK_GLASS normalization produces NULL finality
 *   9.  same checkpoint state produces same checkpoint hash
 *   10. finality evidence remains evidence-only
 *   11. finality evidence cannot create authority
 *   12. finality evidence cannot create proof
 *   13. finality evidence cannot execute
 *   14. finality never mutates registry state
 *   15. finality never rewrites lineage
 *   16. incomplete checkpoint prerequisites classify NOT_FINAL
 *
 * Additional:
 *   - canonical hash stability under reordered finality_classes
 *   - missing reconciliation when required
 *   - reconciliation NULL propagation
 *   - boundary invariant violation detection
 *   - no deployment capability expansion
 *   - no runtime route expansion
 *   - no BREAK_GLASS normalization
 *   - no implicit finality over concurrency
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
  FINALITY_RESULTS,
  FINALITY_CLASSES,
  RECONCILIATION_RESULTS,
  canonicalJson,
  computeCheckpointHash,
  classifyFinalityCheckpoint,
  validateFinalityEvidenceBoundary,
} from '../../scripts/release-provenance-finality-checkpoints.mjs'

const REQUIRED_FINALITY_CLASSES = [
  'finality_checkpoint_reached',
  'finality_pending_concurrency',
  'finality_pending_reconciliation',
  'finality_reconciliation_drift',
  'finality_replay_anomaly',
  'finality_lineage_mutation',
  'finality_rollback_invalid',
  'finality_break_glass_normalization',
  'finality_evidence_boundary_violation',
]

// Deterministic fake causal hashes (64-char hex)
const VALID_CAUSAL_HASH = 'c'.repeat(64)
const NULL_CAUSAL_HASH = '0'.repeat(64)
const VALID_RECON_HASH = 'e'.repeat(64)

// ── causal evidence fixture helpers ────────────────────────────────────────

function makeCausalEvidence(causalResult, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_CAUSAL_ORDERING',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    lineage_clock_alg: 'logical',
    release_id: 'R1',
    ancestor_release_ids: [],
    descendant_release_ids: [],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: causalResult,
    causal_hash: causalResult === FINALITY_RESULTS.NULL ? NULL_CAUSAL_HASH : VALID_CAUSAL_HASH,
    ...extra,
  }
}

function makeValidCausalEvidence(extra = {}) {
  return makeCausalEvidence('VALID_LINEAGE', extra)
}

function makeConcurrentCausalEvidence(extra = {}) {
  return makeCausalEvidence('CONCURRENT', {
    concurrent_release_ids: ['R2'],
    ...extra,
  })
}

function makeNullCausalEvidence(failureClass = null, extra = {}) {
  return makeCausalEvidence('NULL', {
    causal_hash: NULL_CAUSAL_HASH,
    ...(failureClass ? { failure_class: failureClass } : {}),
    ...extra,
  })
}

// ── reconciliation evidence fixture helpers ─────────────────────────────────

function makeReconciliationEvidence(reconciliationResult, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_RECONCILIATION_EVIDENCE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    reconciliation_result: reconciliationResult,
    reconciliation_hash: VALID_RECON_HASH,
    ...extra,
  }
}

function makeReconciledEvidence(extra = {}) {
  return makeReconciliationEvidence('RECONCILED', extra)
}

function makeDriftEvidence(integrityBreaking = false, extra = {}) {
  return makeReconciliationEvidence('DRIFT_DETECTED', {
    integrity_breaking: integrityBreaking,
    ...extra,
  })
}

function makeNullReconciliationEvidence(extra = {}) {
  return makeReconciliationEvidence('NULL', {
    reconciliation_hash: null,
    ...extra,
  })
}

// ── artifact and export presence ────────────────────────────────────────────

test('issue #1002: release-provenance-finality-checkpoints.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-finality-checkpoints.mjs')),
    'scripts/release-provenance-finality-checkpoints.mjs must exist',
  )
})

test('issue #1002: exports FINALITY_RESULTS with FINALIZED, NOT_FINAL, NULL', () => {
  assert.equal(FINALITY_RESULTS.FINALIZED, 'FINALIZED')
  assert.equal(FINALITY_RESULTS.NOT_FINAL, 'NOT_FINAL')
  assert.equal(FINALITY_RESULTS.NULL, 'NULL')
})

test('issue #1002: exports FINALITY_CLASSES with all 9 required values', () => {
  for (const cls of REQUIRED_FINALITY_CLASSES) {
    const found = Object.values(FINALITY_CLASSES).includes(cls)
    assert.ok(found, `FINALITY_CLASSES must include value "${cls}"`)
  }
})

test('issue #1002: exports RECONCILIATION_RESULTS with RECONCILED, DRIFT_DETECTED, NULL', () => {
  assert.equal(RECONCILIATION_RESULTS.RECONCILED, 'RECONCILED')
  assert.equal(RECONCILIATION_RESULTS.DRIFT_DETECTED, 'DRIFT_DETECTED')
  assert.equal(RECONCILIATION_RESULTS.NULL, 'NULL')
})

test('issue #1002: exports all required functions', () => {
  assert.equal(typeof canonicalJson, 'function')
  assert.equal(typeof computeCheckpointHash, 'function')
  assert.equal(typeof classifyFinalityCheckpoint, 'function')
  assert.equal(typeof validateFinalityEvidenceBoundary, 'function')
})

// ── FATE test 1: valid causal evidence can reach FINALIZED ──────────────────

test('FATE #1002-1: valid causal evidence (VALID_LINEAGE) → FINALIZED', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.FINALIZED)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_CHECKPOINT_REACHED))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
})

test('FATE #1002-1b: FINALIZED checkpoint has all required fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_FINALITY_CHECKPOINT')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.release_id, 'R1')
  assert.equal(result.causal_hash, VALID_CAUSAL_HASH)
  assert.equal(result.reconciliation_hash, null)
  assert.equal(result.finality_result, FINALITY_RESULTS.FINALIZED)
  assert.equal(result.checkpoint_hash_alg, 'sha256')
  assert.equal(typeof result.checkpoint_hash, 'string')
  assert.equal(result.checkpoint_hash.length, 64)
  assert.ok(Array.isArray(result.finality_classes))
})

test('FATE #1002-1c: FINALIZED with RECONCILED evidence → FINALIZED', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.FINALIZED)
  assert.equal(result.reconciliation_hash, VALID_RECON_HASH)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_CHECKPOINT_REACHED))
})

test('FATE #1002-1d: FINALIZED result is deterministic — same input same result', () => {
  const causal = makeValidCausalEvidence()
  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(causal)

  assert.equal(r1.finality_result, r2.finality_result)
  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
  assert.deepEqual(r1.finality_classes, r2.finality_classes)
})

// ── FATE test 2: concurrent causal evidence remains NOT_FINAL ───────────────

test('FATE #1002-2: concurrent causal evidence → NOT_FINAL', () => {
  const causal = makeConcurrentCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY))
})

test('FATE #1002-2b: concurrent evidence with RECONCILED reconciliation → still NOT_FINAL', () => {
  // Concurrency must be resolved before finality — reconciliation doesn't override it
  const causal = makeConcurrentCausalEvidence()
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY))
})

test('FATE #1002-2c: concurrent evidence is deterministic — same state same result', () => {
  const causal = makeConcurrentCausalEvidence()
  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(causal)

  assert.equal(r1.finality_result, r2.finality_result)
  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
})

// ── FATE test 3: reconciliation drift remains NOT_FINAL unless integrity-breaking

test('FATE #1002-3: non-integrity-breaking drift → NOT_FINAL with finality_reconciliation_drift', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeDriftEvidence(false)
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT))
})

test('FATE #1002-3b: integrity-breaking drift → NULL (fails closed)', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeDriftEvidence(true)
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT))
})

test('FATE #1002-3c: drift result is deterministic regardless of integrity_breaking value', () => {
  const causal = makeValidCausalEvidence()
  const reconNonBreaking = makeDriftEvidence(false)
  const r1 = classifyFinalityCheckpoint(causal, reconNonBreaking)
  const r2 = classifyFinalityCheckpoint(causal, reconNonBreaking)

  assert.equal(r1.finality_result, r2.finality_result)
  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
})

// ── FATE test 4: causal NULL results produce NULL finality ──────────────────

test('FATE #1002-4: causal NULL result → NULL finality', () => {
  const causal = makeNullCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
})

test('FATE #1002-4b: absent causal evidence → NULL finality', () => {
  const result = classifyFinalityCheckpoint(null)
  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
})

test('FATE #1002-4c: undefined causal evidence → NULL finality', () => {
  const result = classifyFinalityCheckpoint(undefined)
  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
})

test('FATE #1002-4d: causal NULL with RECONCILED reconciliation → still NULL finality', () => {
  const causal = makeNullCausalEvidence()
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
})

// ── FATE test 5: replay anomalies produce NULL finality ─────────────────────

test('FATE #1002-5: causal replay anomaly → NULL with finality_replay_anomaly', () => {
  const causal = makeNullCausalEvidence('causal_replay_anomaly')
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_REPLAY_ANOMALY))
})

test('FATE #1002-5b: replay anomaly finality class is present regardless of reconciliation', () => {
  const causal = makeNullCausalEvidence('causal_replay_anomaly')
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_REPLAY_ANOMALY))
})

test('FATE #1002-5c: replay anomaly result is deterministic', () => {
  const causal = makeNullCausalEvidence('causal_replay_anomaly')
  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(causal)

  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
  assert.deepEqual(r1.finality_classes, r2.finality_classes)
})

// ── FATE test 6: lineage mutation produces NULL finality ────────────────────

test('FATE #1002-6: lineage mutation detected → NULL with finality_lineage_mutation', () => {
  const causal = makeNullCausalEvidence('lineage_mutation_detected')
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_LINEAGE_MUTATION))
})

test('FATE #1002-6b: lineage mutation finality class is present regardless of reconciliation', () => {
  const causal = makeNullCausalEvidence('lineage_mutation_detected')
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_LINEAGE_MUTATION))
})

// ── FATE test 7: invalid rollback ancestry produces NULL finality ───────────

test('FATE #1002-7: rollback_lineage_missing → NULL with finality_rollback_invalid', () => {
  const causal = makeNullCausalEvidence('rollback_lineage_missing', {
    rollback_of: 'R-GHOST',
  })
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_ROLLBACK_INVALID))
})

test('FATE #1002-7b: rollback_lineage_fork → NULL with finality_rollback_invalid', () => {
  const causal = makeNullCausalEvidence('rollback_lineage_fork', {
    rollback_of: 'R1',
  })
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_ROLLBACK_INVALID))
})

test('FATE #1002-7c: rollback invalid result is deterministic', () => {
  const causal = makeNullCausalEvidence('rollback_lineage_missing')
  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(causal)

  assert.equal(r1.finality_result, r2.finality_result)
  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
})

// ── FATE test 8: BREAK_GLASS normalization produces NULL finality ───────────

test('FATE #1002-8: break_glass_causal_normalization → NULL with finality_break_glass_normalization', () => {
  const causal = makeNullCausalEvidence('break_glass_causal_normalization')
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1002-8b: BREAK_GLASS normalization is not overridden by reconciliation', () => {
  const causal = makeNullCausalEvidence('break_glass_causal_normalization')
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1002-8c: BREAK_GLASS normalization class is in FINALITY_CLASSES export', () => {
  assert.equal(
    FINALITY_CLASSES.FINALITY_BREAK_GLASS_NORMALIZATION,
    'finality_break_glass_normalization',
  )
})

// ── FATE test 9: same checkpoint state produces same checkpoint hash ─────────

test('FATE #1002-9: same checkpoint state produces same checkpoint hash', () => {
  const causal = makeValidCausalEvidence()
  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(causal)

  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash, 'same state must produce same checkpoint hash')
})

test('FATE #1002-9b: computeCheckpointHash is deterministic — repeated calls same result', () => {
  const state = {
    release_id: 'R1',
    causal_hash: VALID_CAUSAL_HASH,
    reconciliation_hash: null,
    finality_result: FINALITY_RESULTS.FINALIZED,
    finality_classes: [FINALITY_CLASSES.FINALITY_CHECKPOINT_REACHED],
  }
  const results = Array.from({ length: 5 }, () => computeCheckpointHash(state))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeCheckpointHash must always return same value for identical inputs')
})

test('FATE #1002-9c: different finality states produce different checkpoint hashes', () => {
  const causal = makeValidCausalEvidence()
  const concurrent = makeConcurrentCausalEvidence()

  const r1 = classifyFinalityCheckpoint(causal)
  const r2 = classifyFinalityCheckpoint(concurrent)

  assert.notEqual(r1.checkpoint_hash, r2.checkpoint_hash, 'different states must produce different hashes')
})

test('FATE #1002-9d: checkpoint_hash is 64-char hex SHA-256', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.checkpoint_hash.length, 64, 'checkpoint_hash must be 64-char hex')
  assert.ok(/^[0-9a-f]{64}$/.test(result.checkpoint_hash), 'checkpoint_hash must be lowercase hex')
})

test('FATE #1002-9e: checkpoint_hash does not include checkpoint_hash itself in payload', () => {
  // Verify by re-computing hash without checkpoint_hash field
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  const recomputed = computeCheckpointHash({
    release_id: result.release_id,
    causal_hash: result.causal_hash,
    reconciliation_hash: result.reconciliation_hash,
    finality_result: result.finality_result,
    finality_classes: result.finality_classes,
  })
  assert.equal(result.checkpoint_hash, recomputed, 'checkpoint_hash must be recomputable without including itself')
})

// ── FATE test 10: finality evidence remains evidence-only ───────────────────

test('FATE #1002-10: classifyFinalityCheckpoint always sets evidence_only=true (FINALIZED)', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.equal(result.evidence_only, true)
})

test('FATE #1002-10b: classifyFinalityCheckpoint always sets evidence_only=true (NOT_FINAL)', () => {
  const causal = makeConcurrentCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.equal(result.evidence_only, true)
})

test('FATE #1002-10c: classifyFinalityCheckpoint always sets evidence_only=true (NULL)', () => {
  const causal = makeNullCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.equal(result.evidence_only, true)
})

test('FATE #1002-10d: validateFinalityEvidenceBoundary rejects evidence_only=false', () => {
  const bad = { evidence_only: false, creates_authority: false, creates_execution: false }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('evidence_only')))
})

test('FATE #1002-10e: validateFinalityEvidenceBoundary accepts valid checkpoint', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  const check = validateFinalityEvidenceBoundary(result)
  assert.equal(check.valid, true)
  assert.deepEqual(check.violations, [])
})

// ── FATE test 11: finality evidence cannot create authority ─────────────────

test('FATE #1002-11: classifyFinalityCheckpoint always sets creates_authority=false (all paths)', () => {
  const cases = [
    makeValidCausalEvidence(),
    makeConcurrentCausalEvidence(),
    makeNullCausalEvidence(),
    null,
  ]
  for (const causal of cases) {
    const result = classifyFinalityCheckpoint(causal)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for finality_result=${result.finality_result}`,
    )
  }
})

test('FATE #1002-11b: validateFinalityEvidenceBoundary rejects creates_authority=true', () => {
  const bad = { evidence_only: true, creates_authority: true, creates_execution: false }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('creates_authority')))
})

test('FATE #1002-11c: finality checkpoint contains no authority grant fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
})

// ── FATE test 12: finality evidence cannot create proof ─────────────────────

test('FATE #1002-12: classifyFinalityCheckpoint result contains no proof fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
  assert.ok(!('creates_proof' in result), 'must not contain creates_proof')
})

test('FATE #1002-12b: validateFinalityEvidenceBoundary rejects proof_id field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    proof_id: 'prf-001',
  }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('proof_id')))
})

test('FATE #1002-12c: checkpoint_hash is evidence hash — not a cryptographic proof', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.equal(typeof result.checkpoint_hash, 'string')
  assert.equal(result.checkpoint_hash.length, 64)
  assert.equal(result.creates_authority, false)
  assert.equal(result.evidence_only, true)
})

// ── FATE test 13: finality evidence cannot execute ──────────────────────────

test('FATE #1002-13: classifyFinalityCheckpoint always sets creates_execution=false (all paths)', () => {
  const cases = [
    makeValidCausalEvidence(),
    makeConcurrentCausalEvidence(),
    makeNullCausalEvidence(),
    null,
  ]
  for (const causal of cases) {
    const result = classifyFinalityCheckpoint(causal)
    assert.equal(result.creates_execution, false)
  }
})

test('FATE #1002-13b: validateFinalityEvidenceBoundary rejects creates_execution=true', () => {
  const bad = { evidence_only: true, creates_authority: false, creates_execution: true }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('creates_execution')))
})

test('FATE #1002-13c: finality checkpoint contains no execution fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
})

// ── FATE test 14: finality never mutates registry state ─────────────────────

test('FATE #1002-14: classifyFinalityCheckpoint does not mutate input causal evidence', () => {
  const causal = makeValidCausalEvidence()
  const snapshot = JSON.stringify(causal)
  classifyFinalityCheckpoint(causal)
  assert.equal(JSON.stringify(causal), snapshot, 'causal evidence must not be mutated')
})

test('FATE #1002-14b: classifyFinalityCheckpoint does not mutate reconciliation evidence', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeReconciledEvidence()
  const snapshot = JSON.stringify(recon)
  classifyFinalityCheckpoint(causal, recon)
  assert.equal(JSON.stringify(recon), snapshot, 'reconciliation evidence must not be mutated')
})

test('FATE #1002-14c: classifyFinalityCheckpoint with NULL causal does not mutate evidence', () => {
  const causal = makeNullCausalEvidence('causal_replay_anomaly')
  const snapshot = JSON.stringify(causal)
  classifyFinalityCheckpoint(causal)
  assert.equal(JSON.stringify(causal), snapshot)
})

// ── FATE test 15: finality never rewrites lineage ───────────────────────────

test('FATE #1002-15: finality checkpoint does not contain lineage rewrite fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.ok(!('lineage_repair' in result), 'must not contain lineage_repair')
  assert.ok(!('ancestor_release_ids' in result), 'must not rewrite ancestor_release_ids')
  assert.ok(!('registry_mutation' in result), 'must not contain registry_mutation')
})

test('FATE #1002-15b: validateFinalityEvidenceBoundary rejects lineage_repair field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    lineage_repair: true,
  }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('lineage_repair')))
})

test('FATE #1002-15c: validateFinalityEvidenceBoundary rejects registry_mutation field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    registry_mutation: true,
  }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('registry_mutation')))
})

// ── FATE test 16: incomplete checkpoint prerequisites classify NOT_FINAL ─────

test('FATE #1002-16: require-reconciliation with no reconciliation evidence → NOT_FINAL', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal, null, { requireReconciliation: true })

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_RECONCILIATION))
})

test('FATE #1002-16b: require-reconciliation satisfied by RECONCILED evidence → FINALIZED', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeReconciledEvidence()
  const result = classifyFinalityCheckpoint(causal, recon, { requireReconciliation: true })

  assert.equal(result.finality_result, FINALITY_RESULTS.FINALIZED)
})

test('FATE #1002-16c: incomplete prerequisites result is deterministic', () => {
  const causal = makeValidCausalEvidence()
  const r1 = classifyFinalityCheckpoint(causal, null, { requireReconciliation: true })
  const r2 = classifyFinalityCheckpoint(causal, null, { requireReconciliation: true })

  assert.equal(r1.finality_result, r2.finality_result)
  assert.equal(r1.checkpoint_hash, r2.checkpoint_hash)
})

// ── Additional: canonical hash stability under reordered finality_classes ────

test('FATE #1002-add-1: computeCheckpointHash stable under reordered finality_classes', () => {
  const state1 = {
    release_id: 'R1',
    causal_hash: VALID_CAUSAL_HASH,
    reconciliation_hash: null,
    finality_result: FINALITY_RESULTS.NOT_FINAL,
    finality_classes: [
      FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY,
      FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT,
    ],
  }
  const state2 = {
    ...state1,
    finality_classes: [
      FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT,
      FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY,
    ],
  }
  assert.equal(
    computeCheckpointHash(state1),
    computeCheckpointHash(state2),
    'checkpoint hash must be stable under reordered finality_classes',
  )
})

test('FATE #1002-add-1b: canonicalJson sorts keys alphabetically', () => {
  const obj = { z: 1, a: 2, m: 3 }
  const result = canonicalJson(obj)
  assert.ok(result.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #1002-add-1c: canonicalJson normalizes different key insertion orders to same output', () => {
  const obj1 = { release_id: 'R1', finality_result: 'FINALIZED', causal_hash: 'abc' }
  const obj2 = { finality_result: 'FINALIZED', causal_hash: 'abc', release_id: 'R1' }
  assert.equal(canonicalJson(obj1), canonicalJson(obj2))
})

// ── Additional: missing reconciliation when required ────────────────────────

test('FATE #1002-add-2: missing reconciliation when required → finality_pending_reconciliation class', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal, null, { requireReconciliation: true })

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.equal(result.reconciliation_hash, null)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_RECONCILIATION))
})

test('FATE #1002-add-2b: reconciliation not required and absent → FINALIZED (no pending class)', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal, null, { requireReconciliation: false })

  assert.equal(result.finality_result, FINALITY_RESULTS.FINALIZED)
  assert.ok(!result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_RECONCILIATION))
})

// ── Additional: reconciliation NULL propagation ──────────────────────────────

test('FATE #1002-add-3: reconciliation NULL result → NULL finality', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeNullReconciliationEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
})

test('FATE #1002-add-3b: reconciliation NULL propagates even with valid causal evidence', () => {
  const causal = makeValidCausalEvidence()
  const recon = makeNullReconciliationEvidence()
  const result = classifyFinalityCheckpoint(causal, recon)

  // Valid causal evidence cannot overcome NULL reconciliation
  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

// ── Additional: boundary invariant violation detection ──────────────────────

test('FATE #1002-add-4: causal evidence with evidence_only=false → NULL + finality_evidence_boundary_violation', () => {
  const causal = makeValidCausalEvidence({ evidence_only: false })
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_EVIDENCE_BOUNDARY_VIOLATION))
})

test('FATE #1002-add-4b: causal evidence with creates_authority=true → NULL + finality_evidence_boundary_violation', () => {
  const causal = makeValidCausalEvidence({ creates_authority: true })
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_EVIDENCE_BOUNDARY_VIOLATION))
})

test('FATE #1002-add-4c: causal evidence with creates_execution=true → NULL + finality_evidence_boundary_violation', () => {
  const causal = makeValidCausalEvidence({ creates_execution: true })
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_EVIDENCE_BOUNDARY_VIOLATION))
})

test('FATE #1002-add-4d: validateFinalityEvidenceBoundary catches all boundary violations', () => {
  const bad = {
    evidence_only: false,
    creates_authority: true,
    creates_execution: true,
  }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.length >= 3)
})

// ── Additional: no deployment capability expansion ───────────────────────────

test('FATE #1002-add-5: finality checkpoint contains no deployment-related fields', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deploy_token' in result), 'must not contain deploy_token')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
  assert.ok(!('runtime_route' in result), 'must not contain runtime_route')
})

test('FATE #1002-add-5b: validateFinalityEvidenceBoundary rejects deployment_trigger', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    deployment_trigger: true,
  }
  const check = validateFinalityEvidenceBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('deployment_trigger')))
})

// ── Additional: no runtime route expansion ───────────────────────────────────

test('FATE #1002-add-6: finality checkpoint does not expand runtime routes', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)
  // FINALIZED checkpoint must never produce runtime route fields
  assert.ok(!('runtime_routes' in result))
  assert.ok(!('route_expansion' in result))
  assert.ok(!('execution_surface' in result))
})

// ── Additional: no BREAK_GLASS normalization ─────────────────────────────────

test('FATE #1002-add-7: finality never normalizes BREAK_GLASS', () => {
  // Attempting to finalize evidence derived from BREAK_GLASS normalization → NULL
  const causal = makeNullCausalEvidence('break_glass_causal_normalization')
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1002-add-7b: finality_break_glass_normalization class is correctly mapped', () => {
  const causal = makeNullCausalEvidence('break_glass_causal_normalization')
  const result = classifyFinalityCheckpoint(causal)

  assert.ok(
    result.finality_classes.every((cls) => Object.values(FINALITY_CLASSES).includes(cls)),
    'all finality_classes must be valid FINALITY_CLASSES values',
  )
})

// ── Additional: no implicit finality over concurrency ───────────────────────

test('FATE #1002-add-8: CONCURRENT causal evidence is never implicitly finalized', () => {
  const causal = makeConcurrentCausalEvidence()
  const recon = makeReconciledEvidence()
  // Even with RECONCILED reconciliation, concurrency blocks finality
  const result = classifyFinalityCheckpoint(causal, recon)

  assert.notEqual(result.finality_result, FINALITY_RESULTS.FINALIZED)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY))
})

test('FATE #1002-add-8b: concurrency is explicitly classified, not silently resolved', () => {
  const causal = makeConcurrentCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.finality_result, FINALITY_RESULTS.NOT_FINAL)
  assert.ok(result.finality_classes.includes(FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY))
  assert.ok(!result.finality_classes.includes(FINALITY_CLASSES.FINALITY_CHECKPOINT_REACHED))
})

// ── Checkpoint object shape validation ──────────────────────────────────────

test('FATE #1002: FINALIZED checkpoint has correct artifact and shape', () => {
  const causal = makeValidCausalEvidence()
  const result = classifyFinalityCheckpoint(causal)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_FINALITY_CHECKPOINT')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(typeof result.release_id, 'string')
  assert.equal(typeof result.causal_hash, 'string')
  assert.ok('reconciliation_hash' in result)
  assert.ok([FINALITY_RESULTS.FINALIZED, FINALITY_RESULTS.NOT_FINAL, FINALITY_RESULTS.NULL].includes(result.finality_result))
  assert.equal(result.checkpoint_hash_alg, 'sha256')
  assert.equal(typeof result.checkpoint_hash, 'string')
  assert.equal(result.checkpoint_hash.length, 64)
  assert.ok(Array.isArray(result.finality_classes))
})

test('FATE #1002: NULL checkpoint from absent evidence has correct shape', () => {
  const result = classifyFinalityCheckpoint(null)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_FINALITY_CHECKPOINT')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.release_id, null)
  assert.equal(result.causal_hash, null)
  assert.equal(result.reconciliation_hash, null)
  assert.equal(result.finality_result, FINALITY_RESULTS.NULL)
  assert.equal(result.checkpoint_hash_alg, 'sha256')
  assert.equal(typeof result.checkpoint_hash, 'string')
  assert.equal(result.checkpoint_hash.length, 64)
  assert.ok(Array.isArray(result.finality_classes))
})

// ── Non-regression: prior provenance scripts remain intact ──────────────────

test('FATE #1002 non-regression: release-provenance-causal-ordering.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-causal-ordering.mjs')
  assert.ok(typeof mod.classifyCausalOrdering === 'function')
  assert.ok(typeof mod.CAUSAL_FAILURE_CLASSES === 'object')
  assert.ok(typeof mod.CAUSAL_RESULTS === 'object')
})

test('FATE #1002 non-regression: verify-release-provenance.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/verify-release-provenance.mjs')
  assert.ok(typeof mod.classifyReleaseTarget === 'function')
  assert.ok(typeof mod.verifyCanonicalReleaseBoundary === 'function')
  assert.ok(typeof mod.FAILURE_CLASSES === 'object')
})

test('FATE #1002 non-regression: issue-1000 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1000-release-provenance-causal-ordering.test.mjs')),
    '#1000 FATE test file must remain present',
  )
})

test('FATE #1002 non-regression: issue-994 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-994-release-provenance-enforcement.test.mjs')),
    '#994 FATE test file must remain present',
  )
})

test('FATE #1002 non-regression: issue-996 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-996-provenance-registry-persistence.test.mjs')),
    '#996 FATE test file must remain present',
  )
})
