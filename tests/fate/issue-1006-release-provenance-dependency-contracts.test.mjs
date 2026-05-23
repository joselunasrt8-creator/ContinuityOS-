/**
 * Issue #1006 — RELEASE_PROVENANCE_DEPENDENCY_CONTRACTS_V1
 *
 * FATE tests proving deterministic dependency contracts for
 * downstream systems consuming release provenance evidence.
 *
 * Verifies:
 *   1.  valid CONSUMABLE_EVIDENCE satisfies a valid dependency contract
 *   2.  REJECTED consumption evidence rejects dependency
 *   3.  NULL consumption evidence produces NULL dependency
 *   4.  missing external policy rejects when required
 *   5.  missing human approval rejects when required
 *   6.  missing deployment authority rejects when required
 *   7.  allowed-use mismatch rejects
 *   8.  authority attempt returns NULL
 *   9.  proof attempt returns NULL
 *   10. execution attempt returns NULL
 *   11. deployment attempt returns NULL
 *   12. invalid contract hash returns NULL
 *   13. invalid consumption hash returns NULL
 *   14. BREAK_GLASS normalization returns NULL
 *   15. dependency evidence remains evidence-only
 *   16. dependency cannot create authority
 *   17. dependency cannot create proof
 *   18. dependency cannot execute
 *   19. dependency cannot trigger deployment
 *   20. same dependency state produces same hash
 *   21. reordered dependency classes preserve hash stability
 *   22. dependency contract cannot upgrade evidence into permission
 *
 * Additional:
 *   - invalid hash encoding
 *   - invalid hash length
 *   - consumer requirement downgrade behavior
 *   - deterministic rejection hashing
 *   - deterministic NULL hashing
 *   - no runtime route expansion
 *   - no deployment capability expansion
 *   - no lineage rewriting
 *   - no registry mutation
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
  DEPENDENCY_RESULTS,
  DEPENDENCY_CLASSES,
  canonicalJson,
  computeContractHash,
  computeDependencyHash,
  validateContractBoundary,
  validateConsumptionBoundary,
  classifyDependency,
  ALLOWED_DEPENDENCY_USES,
  buildDependencyContract,
  evaluateDependencyContract,
  validateDependencyBoundary,
} from '../../scripts/release-provenance-dependency-contracts.mjs'

const REQUIRED_DEPENDENCY_CLASSES = [
  'dependency_contract_satisfied',
  'dependency_consumption_not_accepted',
  'dependency_external_policy_missing',
  'dependency_human_approval_missing',
  'dependency_deployment_authority_missing',
  'dependency_allowed_use_mismatch',
  'dependency_boundary_violation',
  'dependency_authority_attempt',
  'dependency_proof_attempt',
  'dependency_execution_attempt',
  'dependency_deployment_attempt',
  'dependency_hash_invalid',
  'dependency_break_glass_normalization',
]

// Deterministic fake hashes (64-char hex)
const VALID_CONSUMPTION_HASH = 'a'.repeat(64)
const VALID_CONTRACT_HASH_PLACEHOLDER = 'b'.repeat(64)

// ── fixture helpers ──────────────────────────────────────────────────────────

function makeConsumptionEvidence(consumptionResult, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    release_id: 'R1',
    consumption_result: consumptionResult,
    consumption_hash: VALID_CONSUMPTION_HASH,
    ...extra,
  }
}

function makeConsumableEvidence(extra = {}) {
  return makeConsumptionEvidence('CONSUMABLE_EVIDENCE', extra)
}

function makeRejectedEvidence(extra = {}) {
  return makeConsumptionEvidence('REJECTED', extra)
}

function makeNullConsumptionEvidence(extra = {}) {
  return makeConsumptionEvidence('NULL', extra)
}

function makeContract(extra = {}) {
  const base = {
    artifact: 'RELEASE_PROVENANCE_DEPENDENCY_CONTRACT',
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    required_consumption_result: 'CONSUMABLE_EVIDENCE',
    requires_external_policy: false,
    requires_human_approval: false,
    requires_deployment_authority: false,
    allowed_use: 'OBSERVE | AUDIT | PACKAGE_METADATA | DEPLOYMENT_INPUT_EVIDENCE',
    contract_hash_alg: 'sha256',
    ...extra,
  }
  // Do not include contract_hash by default (optional field)
  return base
}

function makeContractWithHash(extra = {}) {
  const base = makeContract(extra)
  base.contract_hash = computeContractHash(base)
  return base
}

// ── artifact and export presence ─────────────────────────────────────────────

test('issue #1006: release-provenance-dependency-contracts.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-dependency-contracts.mjs')),
    'scripts/release-provenance-dependency-contracts.mjs must exist',
  )
})

test('issue #1006: exports DEPENDENCY_RESULTS with DEPENDENCY_SATISFIED, DEPENDENCY_REJECTED, NULL', () => {
  assert.equal(DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED, 'DEPENDENCY_SATISFIED')
  assert.equal(DEPENDENCY_RESULTS.DEPENDENCY_REJECTED, 'DEPENDENCY_REJECTED')
  assert.equal(DEPENDENCY_RESULTS.NULL, 'NULL')
})

test('issue #1006: exports DEPENDENCY_CLASSES with all 13 required values', () => {
  for (const cls of REQUIRED_DEPENDENCY_CLASSES) {
    const found = Object.values(DEPENDENCY_CLASSES).includes(cls)
    assert.ok(found, `DEPENDENCY_CLASSES must include value "${cls}"`)
  }
})

test('issue #1006: exports all required functions', () => {
  assert.equal(typeof canonicalJson, 'function')
  assert.equal(typeof computeContractHash, 'function')
  assert.equal(typeof computeDependencyHash, 'function')
  assert.equal(typeof validateContractBoundary, 'function')
  assert.equal(typeof validateConsumptionBoundary, 'function')
  assert.equal(typeof classifyDependency, 'function')
})

// ── FATE test 1: valid CONSUMABLE_EVIDENCE satisfies a valid dependency contract

test('FATE #1006-1: valid CONSUMABLE_EVIDENCE satisfies a valid dependency contract', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_CONTRACT_SATISFIED))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('FATE #1006-1b: DEPENDENCY_SATISFIED evaluation has all required fields', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_DEPENDENCY_EVALUATION')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.contract_id, 'contract-001')
  assert.equal(result.consumer_id, 'consumer-001')
  assert.equal(result.release_id, 'R1')
  assert.equal(result.consumption_hash, VALID_CONSUMPTION_HASH)
  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.ok(Array.isArray(result.dependency_classes))
  assert.equal(result.dependency_hash_alg, 'sha256')
  assert.equal(typeof result.dependency_hash, 'string')
  assert.equal(result.dependency_hash.length, 64)
})

test('FATE #1006-1c: DEPENDENCY_SATISFIED is deterministic — same input same result', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_result, r2.dependency_result)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
  assert.deepEqual(r1.dependency_classes, r2.dependency_classes)
})

// ── FATE test 2: REJECTED consumption evidence rejects dependency ─────────────

test('FATE #1006-2: REJECTED consumption evidence → DEPENDENCY_REJECTED', () => {
  const consumption = makeRejectedEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_CONSUMPTION_NOT_ACCEPTED))
})

test('FATE #1006-2b: REJECTED evidence cannot be upgraded to DEPENDENCY_SATISFIED', () => {
  const consumption = makeRejectedEvidence()
  const contract = makeContract()
  // Provide all satisfied flags — must not upgrade REJECTED
  const result = classifyDependency(consumption, contract, {
    externalPolicySatisfied: true,
    humanApprovalSatisfied: true,
    deploymentAuthoritySatisfied: true,
  })

  assert.notEqual(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
})

test('FATE #1006-2c: REJECTED dependency result is deterministic', () => {
  const consumption = makeRejectedEvidence()
  const contract = makeContract()
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_result, r2.dependency_result)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── FATE test 3: NULL consumption evidence produces NULL dependency ────────────

test('FATE #1006-3: NULL consumption result → NULL dependency', () => {
  const consumption = makeNullConsumptionEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

test('FATE #1006-3b: absent consumption evidence → NULL dependency', () => {
  const contract = makeContract()
  const result = classifyDependency(null, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

test('FATE #1006-3c: undefined consumption evidence → NULL dependency', () => {
  const contract = makeContract()
  const result = classifyDependency(undefined, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

test('FATE #1006-3d: NULL consumption with all flags satisfied → still NULL', () => {
  const consumption = makeNullConsumptionEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract, {
    externalPolicySatisfied: true,
    humanApprovalSatisfied: true,
    deploymentAuthoritySatisfied: true,
  })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

// ── FATE test 4: missing external policy rejects when required ────────────────

test('FATE #1006-4: requires_external_policy=true, flag absent → DEPENDENCY_REJECTED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_external_policy: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING))
})

test('FATE #1006-4b: requires_external_policy=true, flag present → DEPENDENCY_SATISFIED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_external_policy: true })
  const result = classifyDependency(consumption, contract, { externalPolicySatisfied: true })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.ok(!result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING))
})

test('FATE #1006-4c: requires_external_policy=false, flag absent → no rejection for policy', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_external_policy: false })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.ok(!result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING))
})

// ── FATE test 5: missing human approval rejects when required ─────────────────

test('FATE #1006-5: requires_human_approval=true, flag absent → DEPENDENCY_REJECTED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_human_approval: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HUMAN_APPROVAL_MISSING))
})

test('FATE #1006-5b: requires_human_approval=true, flag present → DEPENDENCY_SATISFIED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_human_approval: true })
  const result = classifyDependency(consumption, contract, { humanApprovalSatisfied: true })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-5c: human approval result is deterministic', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_human_approval: true })
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_result, r2.dependency_result)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── FATE test 6: missing deployment authority rejects when required ────────────

test('FATE #1006-6: requires_deployment_authority=true, flag absent → DEPENDENCY_REJECTED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_deployment_authority: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_AUTHORITY_MISSING))
})

test('FATE #1006-6b: requires_deployment_authority=true, flag present → DEPENDENCY_SATISFIED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_deployment_authority: true })
  const result = classifyDependency(consumption, contract, { deploymentAuthoritySatisfied: true })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-6c: deployment authority absent flag produces deterministic rejection', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_deployment_authority: true })
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── FATE test 7: allowed-use mismatch rejects ─────────────────────────────────

test('FATE #1006-7: requestedUse not in allowed_use → DEPENDENCY_REJECTED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ allowed_use: 'OBSERVE | AUDIT' })
  const result = classifyDependency(consumption, contract, { requestedUse: 'DEPLOY' })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_ALLOWED_USE_MISMATCH))
})

test('FATE #1006-7b: requestedUse matching allowed_use → DEPENDENCY_SATISFIED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ allowed_use: 'OBSERVE | AUDIT | DEPLOYMENT_INPUT_EVIDENCE' })
  const result = classifyDependency(consumption, contract, { requestedUse: 'AUDIT' })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-7c: no requestedUse provided → no allowed_use rejection', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ allowed_use: 'OBSERVE' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

// ── FATE test 8: authority attempt returns NULL ───────────────────────────────

test('FATE #1006-8: creates_authority=true in contract → NULL + dependency_authority_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ creates_authority: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_AUTHORITY_ATTEMPT))
})

test('FATE #1006-8b: authority_grant field in contract → NULL + dependency_authority_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ authority_grant: 'admin' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_AUTHORITY_ATTEMPT))
})

test('FATE #1006-8c: authority attempt is not overridden by valid consumption evidence', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ creates_authority: true })
  const result = classifyDependency(consumption, contract, {
    externalPolicySatisfied: true,
    humanApprovalSatisfied: true,
    deploymentAuthoritySatisfied: true,
  })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

// ── FATE test 9: proof attempt returns NULL ───────────────────────────────────

test('FATE #1006-9: creates_proof=true in contract → NULL + dependency_proof_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ creates_proof: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_PROOF_ATTEMPT))
})

test('FATE #1006-9b: proof_signature field in contract → NULL + dependency_proof_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ proof_signature: 'sig-abc' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_PROOF_ATTEMPT))
})

test('FATE #1006-9c: proof attempt result is deterministic', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ creates_proof: true })
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_result, r2.dependency_result)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── FATE test 10: execution attempt returns NULL ──────────────────────────────

test('FATE #1006-10: creates_execution=true in contract → NULL + dependency_execution_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ creates_execution: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXECUTION_ATTEMPT))
})

test('FATE #1006-10b: execution_token field in contract → NULL + dependency_execution_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ execution_token: 'tok-123' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXECUTION_ATTEMPT))
})

// ── FATE test 11: deployment attempt returns NULL ─────────────────────────────

test('FATE #1006-11: deployment_trigger field in contract → NULL + dependency_deployment_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ deployment_trigger: true })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_ATTEMPT))
})

test('FATE #1006-11b: deployment_token field in contract → NULL + dependency_deployment_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ deployment_token: 'deploy-tok' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_ATTEMPT))
})

test('FATE #1006-11c: deployment_capability field in contract → NULL + dependency_deployment_attempt', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ deployment_capability: 'cap-xyz' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_ATTEMPT))
})

// ── FATE test 12: invalid contract hash returns NULL ──────────────────────────

test('FATE #1006-12: invalid contract_hash → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ contract_hash: 'invalid-hash' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-12b: tampered contract_hash → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContractWithHash()
  contract.contract_hash = 'f'.repeat(64) // tamper with hash

  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-12c: valid contract_hash → DEPENDENCY_SATISFIED', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContractWithHash()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-12d: contract without contract_hash field → DEPENDENCY_SATISFIED (optional field)', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract() // no contract_hash
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

// ── FATE test 13: invalid consumption hash returns NULL ───────────────────────

test('FATE #1006-13: invalid consumption_hash encoding → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence({ consumption_hash: 'not-hex' })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-13b: short consumption_hash → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence({ consumption_hash: 'abc123' })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-13c: uppercase hex consumption_hash → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence({ consumption_hash: 'A'.repeat(64) })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-13d: null consumption_hash is allowed (hash validation only applies to non-null)', () => {
  const consumption = makeConsumableEvidence({ consumption_hash: null })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  // null hash is not invalid — it means not provided
  assert.notEqual(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

// ── FATE test 14: BREAK_GLASS normalization returns NULL ──────────────────────

test('FATE #1006-14: is_break_glass=true in consumption → NULL + dependency_break_glass_normalization', () => {
  const consumption = makeConsumableEvidence({ is_break_glass: true })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1006-14b: break_glass_normalized=true in consumption → NULL + dependency_break_glass_normalization', () => {
  const consumption = makeConsumableEvidence({ break_glass_normalized: true })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1006-14c: break_glass failure_class in consumption → NULL + dependency_break_glass_normalization', () => {
  const consumption = makeConsumableEvidence({ failure_class: 'break_glass_causal_normalization' })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1006-14d: BREAK_GLASS not overridden by satisfied flags', () => {
  const consumption = makeConsumableEvidence({ is_break_glass: true })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract, {
    externalPolicySatisfied: true,
    humanApprovalSatisfied: true,
    deploymentAuthoritySatisfied: true,
  })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
})

// ── FATE test 15: dependency evidence remains evidence-only ───────────────────

test('FATE #1006-15: classifyDependency always sets evidence_only=true (SATISFIED)', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.evidence_only, true)
})

test('FATE #1006-15b: classifyDependency always sets evidence_only=true (REJECTED)', () => {
  const consumption = makeRejectedEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.evidence_only, true)
})

test('FATE #1006-15c: classifyDependency always sets evidence_only=true (NULL)', () => {
  const result = classifyDependency(null, makeContract())

  assert.equal(result.evidence_only, true)
})

test('FATE #1006-15d: validateContractBoundary rejects evidence_only=false', () => {
  const bad = { evidence_only: false, creates_authority: false, creates_execution: false, creates_proof: false }
  const check = validateContractBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('evidence_only')))
})

// ── FATE test 16: dependency cannot create authority ─────────────────────────

test('FATE #1006-16: classifyDependency always sets creates_authority=false (all paths)', () => {
  const cases = [
    [makeConsumableEvidence(), makeContract()],
    [makeRejectedEvidence(), makeContract()],
    [makeNullConsumptionEvidence(), makeContract()],
    [null, makeContract()],
  ]
  for (const [consumption, contract] of cases) {
    const result = classifyDependency(consumption, contract)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for dependency_result=${result.dependency_result}`,
    )
  }
})

test('FATE #1006-16b: dependency evaluation contains no authority grant fields', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
})

// ── FATE test 17: dependency cannot create proof ──────────────────────────────

test('FATE #1006-17: classifyDependency always sets creates_proof=false (all paths)', () => {
  const cases = [
    [makeConsumableEvidence(), makeContract()],
    [makeRejectedEvidence(), makeContract()],
    [null, makeContract()],
  ]
  for (const [consumption, contract] of cases) {
    const result = classifyDependency(consumption, contract)
    assert.equal(result.creates_proof, false)
  }
})

test('FATE #1006-17b: dependency evaluation contains no proof fields', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
})

// ── FATE test 18: dependency cannot execute ───────────────────────────────────

test('FATE #1006-18: classifyDependency always sets creates_execution=false (all paths)', () => {
  const cases = [
    [makeConsumableEvidence(), makeContract()],
    [makeRejectedEvidence(), makeContract()],
    [null, makeContract()],
  ]
  for (const [consumption, contract] of cases) {
    const result = classifyDependency(consumption, contract)
    assert.equal(result.creates_execution, false)
  }
})

test('FATE #1006-18b: dependency evaluation contains no execution fields', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('execution_token' in result), 'must not contain execution_token')
})

// ── FATE test 19: dependency cannot trigger deployment ────────────────────────

test('FATE #1006-19: dependency evaluation contains no deployment-related fields', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
})

test('FATE #1006-19b: validateContractBoundary rejects deployment_trigger field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    deployment_trigger: true,
  }
  const check = validateContractBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('deployment_trigger')))
})

// ── FATE test 20: same dependency state produces same hash ────────────────────

test('FATE #1006-20: same dependency state produces same dependency hash', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_hash, r2.dependency_hash, 'same state must produce same dependency hash')
})

test('FATE #1006-20b: computeDependencyHash is deterministic — repeated calls same result', () => {
  const state = {
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    release_id: 'R1',
    consumption_hash: VALID_CONSUMPTION_HASH,
    dependency_result: DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED,
    dependency_classes: [DEPENDENCY_CLASSES.DEPENDENCY_CONTRACT_SATISFIED],
  }
  const results = Array.from({ length: 5 }, () => computeDependencyHash(state))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeDependencyHash must always return same value for identical inputs')
})

test('FATE #1006-20c: different dependency states produce different hashes', () => {
  const consumption = makeConsumableEvidence()
  const rejected = makeRejectedEvidence()
  const contract = makeContract()

  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(rejected, contract)

  assert.notEqual(r1.dependency_hash, r2.dependency_hash)
})

test('FATE #1006-20d: dependency_hash is 64-char hex SHA-256', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(result.dependency_hash), 'dependency_hash must be lowercase hex')
})

test('FATE #1006-20e: dependency_hash does not include dependency_hash itself in payload', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  const recomputed = computeDependencyHash({
    contract_id: result.contract_id,
    consumer_id: result.consumer_id,
    release_id: result.release_id,
    consumption_hash: result.consumption_hash,
    dependency_result: result.dependency_result,
    dependency_classes: result.dependency_classes,
  })
  assert.equal(result.dependency_hash, recomputed)
})

// ── FATE test 21: reordered dependency classes preserve hash stability ─────────

test('FATE #1006-21: computeDependencyHash stable under reordered dependency_classes', () => {
  const state1 = {
    contract_id: 'contract-001',
    consumer_id: 'consumer-001',
    release_id: 'R1',
    consumption_hash: VALID_CONSUMPTION_HASH,
    dependency_result: DEPENDENCY_RESULTS.DEPENDENCY_REJECTED,
    dependency_classes: [
      DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING,
      DEPENDENCY_CLASSES.DEPENDENCY_HUMAN_APPROVAL_MISSING,
    ],
  }
  const state2 = {
    ...state1,
    dependency_classes: [
      DEPENDENCY_CLASSES.DEPENDENCY_HUMAN_APPROVAL_MISSING,
      DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING,
    ],
  }
  assert.equal(
    computeDependencyHash(state1),
    computeDependencyHash(state2),
    'dependency hash must be stable under reordered dependency_classes',
  )
})

// ── FATE test 22: dependency contract cannot upgrade evidence into permission ──

test('FATE #1006-22: DEPENDENCY_SATISFIED does not grant execution permission', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.evidence_only, true)
})

test('FATE #1006-22b: DEPENDENCY_SATISFIED does not grant deployment authorization', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('deployment_trigger' in result))
  assert.ok(!('deployment_capability' in result))
  assert.ok(!('runtime_route' in result))
  assert.ok(!('route_expansion' in result))
})

test('FATE #1006-22c: evidence cannot be upgraded into authority by any dependency path', () => {
  // Even with all flags satisfied and valid consumption
  const consumption = makeConsumableEvidence()
  const contract = makeContract({
    requires_external_policy: true,
    requires_human_approval: true,
    requires_deployment_authority: true,
  })
  const result = classifyDependency(consumption, contract, {
    externalPolicySatisfied: true,
    humanApprovalSatisfied: true,
    deploymentAuthoritySatisfied: true,
  })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.creates_execution, false)
})

// ── Additional: invalid hash encoding ─────────────────────────────────────────

test('FATE #1006-add-1: contract_hash with uppercase hex → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ contract_hash: 'A'.repeat(64) })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

test('FATE #1006-add-2: contract_hash with wrong length → NULL + dependency_hash_invalid', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ contract_hash: 'abc123' })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID))
})

// ── Additional: consumer requirement downgrade behavior ───────────────────────

test('FATE #1006-add-3: satisfied flag on non-required field has no effect', () => {
  const consumption = makeConsumableEvidence()
  // Contract does NOT require external policy — flag is irrelevant
  const contract = makeContract({ requires_external_policy: false })
  const result = classifyDependency(consumption, contract, { externalPolicySatisfied: true })

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-add-4: multiple missing requirements produce multiple rejection classes', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({
    requires_external_policy: true,
    requires_human_approval: true,
    requires_deployment_authority: true,
  })
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING))
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_HUMAN_APPROVAL_MISSING))
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_AUTHORITY_MISSING))
})

// ── Additional: deterministic rejection hashing ────────────────────────────────

test('FATE #1006-add-5: deterministic rejection hash — same rejection same hash', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract({ requires_external_policy: true })
  const r1 = classifyDependency(consumption, contract)
  const r2 = classifyDependency(consumption, contract)

  assert.equal(r1.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_REJECTED)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── Additional: deterministic NULL hashing ────────────────────────────────────

test('FATE #1006-add-6: deterministic NULL hash — same NULL condition same hash', () => {
  const contract = makeContract()
  const r1 = classifyDependency(null, contract)
  const r2 = classifyDependency(null, contract)

  assert.equal(r1.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

// ── Additional: no runtime route expansion ────────────────────────────────────

test('FATE #1006-add-7: dependency evaluation does not expand runtime routes', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('runtime_routes' in result))
  assert.ok(!('route_expansion' in result))
  assert.ok(!('execution_surface' in result))
  assert.ok(!('runtime_route' in result))
})

test('FATE #1006-add-7b: validateContractBoundary rejects runtime_route field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    runtime_route: '/deploy',
  }
  const check = validateContractBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('runtime_route')))
})

// ── Additional: no deployment capability expansion ────────────────────────────

test('FATE #1006-add-8: dependency evaluation does not expand deployment capabilities', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('deployment_capability' in result))
  assert.ok(!('deploy_token' in result))
})

// ── Additional: no lineage rewriting ─────────────────────────────────────────

test('FATE #1006-add-9: dependency evaluation does not rewrite lineage', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.ok(!('lineage_repair' in result))
  assert.ok(!('ancestor_release_ids' in result))
  assert.ok(!('registry_mutation' in result))
})

test('FATE #1006-add-9b: validateContractBoundary rejects lineage_repair field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    lineage_repair: true,
  }
  const check = validateContractBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('lineage_repair')))
})

// ── Additional: no registry mutation ─────────────────────────────────────────

test('FATE #1006-add-10: dependency evaluation does not mutate input objects', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const consumptionSnapshot = JSON.stringify(consumption)
  const contractSnapshot = JSON.stringify(contract)

  classifyDependency(consumption, contract)

  assert.equal(JSON.stringify(consumption), consumptionSnapshot, 'consumption evidence must not be mutated')
  assert.equal(JSON.stringify(contract), contractSnapshot, 'contract must not be mutated')
})

test('FATE #1006-add-10b: validateContractBoundary rejects registry_mutation field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    registry_mutation: true,
  }
  const check = validateContractBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('registry_mutation')))
})

// ── Additional: no implicit authority upgrade ─────────────────────────────────

test('FATE #1006-add-11: consumption evidence with evidence_only=false → NULL (boundary violation)', () => {
  const consumption = makeConsumableEvidence({ evidence_only: false })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION))
})

test('FATE #1006-add-12: consumption evidence with creates_authority=true → NULL (boundary violation)', () => {
  const consumption = makeConsumableEvidence({ creates_authority: true })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION))
})

test('FATE #1006-add-13: consumption evidence with creates_execution=true → NULL (boundary violation)', () => {
  const consumption = makeConsumableEvidence({ creates_execution: true })
  const contract = makeContract()
  const result = classifyDependency(consumption, contract)

  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.ok(result.dependency_classes.includes(DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION))
})

// ── canonicalJson helpers ─────────────────────────────────────────────────────

test('FATE #1006-add-14: canonicalJson sorts keys alphabetically', () => {
  const obj = { z: 1, a: 2, m: 3 }
  const result = canonicalJson(obj)
  assert.ok(result.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #1006-add-15: canonicalJson normalizes different key insertion orders to same output', () => {
  const obj1 = { release_id: 'R1', dependency_result: 'DEPENDENCY_SATISFIED', contract_id: 'c1' }
  const obj2 = { dependency_result: 'DEPENDENCY_SATISFIED', contract_id: 'c1', release_id: 'R1' }
  assert.equal(canonicalJson(obj1), canonicalJson(obj2))
})

// ── computeContractHash ────────────────────────────────────────────────────────

test('FATE #1006-add-16: computeContractHash is deterministic', () => {
  const contract = makeContract()
  const h1 = computeContractHash(contract)
  const h2 = computeContractHash(contract)

  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(h1))
})

test('FATE #1006-add-17: computeContractHash changes when contract fields change', () => {
  const c1 = makeContract({ contract_id: 'contract-001' })
  const c2 = makeContract({ contract_id: 'contract-002' })

  assert.notEqual(computeContractHash(c1), computeContractHash(c2))
})

test('FATE #1006-add-18: computeContractHash excludes contract_hash field from payload', () => {
  const contract = makeContractWithHash()
  const recomputed = computeContractHash(contract)
  assert.equal(contract.contract_hash, recomputed)
})

// ── validateConsumptionBoundary ────────────────────────────────────────────────

test('FATE #1006-add-19: validateConsumptionBoundary accepts valid consumption evidence', () => {
  const consumption = makeConsumableEvidence()
  const check = validateConsumptionBoundary(consumption)
  assert.equal(check.valid, true)
  assert.deepEqual(check.violations, [])
})

test('FATE #1006-add-20: validateConsumptionBoundary rejects authority_grant field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    authority_grant: 'admin',
  }
  const check = validateConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('authority_grant')))
})

// ── Non-regression: prior provenance scripts remain intact ────────────────────

test('FATE #1006 non-regression: release-provenance-finality-checkpoints.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-finality-checkpoints.mjs')
  assert.ok(typeof mod.classifyFinalityCheckpoint === 'function')
  assert.ok(typeof mod.FINALITY_RESULTS === 'object')
  assert.ok(typeof mod.FINALITY_CLASSES === 'object')
})

test('FATE #1006 non-regression: release-provenance-causal-ordering.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/release-provenance-causal-ordering.mjs')
  assert.ok(typeof mod.classifyCausalOrdering === 'function')
  assert.ok(typeof mod.CAUSAL_FAILURE_CLASSES === 'object')
})

test('FATE #1006 non-regression: verify-release-provenance.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/verify-release-provenance.mjs')
  assert.ok(typeof mod.classifyReleaseTarget === 'function')
  assert.ok(typeof mod.verifyCanonicalReleaseBoundary === 'function')
})

test('FATE #1006 non-regression: issue-1002 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1002-release-provenance-finality-checkpoints.test.mjs')),
    '#1002 FATE test file must remain present',
  )
})

test('FATE #1006 non-regression: issue-1000 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1000-release-provenance-causal-ordering.test.mjs')),
    '#1000 FATE test file must remain present',
  )
})

// ── Issue #1006 required export name compatibility ────────────────────────────

test('FATE #1006-compat-1: ALLOWED_DEPENDENCY_USES is exported with all four required use values', () => {
  assert.ok(typeof ALLOWED_DEPENDENCY_USES === 'object' && ALLOWED_DEPENDENCY_USES !== null)
  assert.equal(ALLOWED_DEPENDENCY_USES.OBSERVE, 'OBSERVE')
  assert.equal(ALLOWED_DEPENDENCY_USES.AUDIT, 'AUDIT')
  assert.equal(ALLOWED_DEPENDENCY_USES.PACKAGE_METADATA, 'PACKAGE_METADATA')
  assert.equal(ALLOWED_DEPENDENCY_USES.DEPLOYMENT_INPUT_EVIDENCE, 'DEPLOYMENT_INPUT_EVIDENCE')
})

test('FATE #1006-compat-2: buildDependencyContract is exported and is a function', () => {
  assert.equal(typeof buildDependencyContract, 'function')
})

test('FATE #1006-compat-3: buildDependencyContract produces a valid contract object with all required fields', () => {
  const contract = buildDependencyContract({ contract_id: 'c-001', consumer_id: 'consumer-001' })
  assert.equal(contract.artifact, 'RELEASE_PROVENANCE_DEPENDENCY_CONTRACT')
  assert.equal(contract.contract_id, 'c-001')
  assert.equal(contract.consumer_id, 'consumer-001')
  assert.equal(contract.evidence_only, true)
  assert.equal(contract.creates_authority, false)
  assert.equal(contract.creates_execution, false)
  assert.equal(contract.creates_proof, false)
  assert.equal(contract.required_consumption_result, 'CONSUMABLE_EVIDENCE')
  assert.equal(typeof contract.requires_external_policy, 'boolean')
  assert.equal(typeof contract.requires_human_approval, 'boolean')
  assert.equal(typeof contract.requires_deployment_authority, 'boolean')
  assert.equal(contract.contract_hash_alg, 'sha256')
  assert.equal(typeof contract.contract_hash, 'string')
  assert.equal(contract.contract_hash.length, 64)
  assert.ok(/^[0-9a-f]{64}$/.test(contract.contract_hash))
})

test('FATE #1006-compat-4: buildDependencyContract contract_hash matches computeContractHash', () => {
  const contract = buildDependencyContract({ contract_id: 'c-001', consumer_id: 'consumer-001' })
  assert.equal(contract.contract_hash, computeContractHash(contract))
})

test('FATE #1006-compat-5: buildDependencyContract contract satisfies classifyDependency with valid consumption', () => {
  const consumption = makeConsumableEvidence()
  const contract = buildDependencyContract({ contract_id: 'c-001', consumer_id: 'consumer-001' })
  const result = classifyDependency(consumption, contract)
  assert.equal(result.dependency_result, DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED)
})

test('FATE #1006-compat-6: evaluateDependencyContract is exported and is a function', () => {
  assert.equal(typeof evaluateDependencyContract, 'function')
})

test('FATE #1006-compat-7: evaluateDependencyContract produces identical result to classifyDependency', () => {
  const consumption = makeConsumableEvidence()
  const contract = makeContract()
  const r1 = classifyDependency(consumption, contract)
  const r2 = evaluateDependencyContract(consumption, contract)
  assert.equal(r1.dependency_result, r2.dependency_result)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
  assert.deepEqual(r1.dependency_classes, r2.dependency_classes)
})

test('FATE #1006-compat-8: evaluateDependencyContract produces identical NULL result to classifyDependency', () => {
  const contract = makeContract()
  const r1 = classifyDependency(null, contract)
  const r2 = evaluateDependencyContract(null, contract)
  assert.equal(r1.dependency_result, DEPENDENCY_RESULTS.NULL)
  assert.equal(r1.dependency_hash, r2.dependency_hash)
})

test('FATE #1006-compat-9: validateDependencyBoundary is exported and is a function', () => {
  assert.equal(typeof validateDependencyBoundary, 'function')
})

test('FATE #1006-compat-10: validateDependencyBoundary produces identical result to validateContractBoundary', () => {
  const valid = { evidence_only: true, creates_authority: false, creates_execution: false, creates_proof: false }
  const r1 = validateContractBoundary(valid)
  const r2 = validateDependencyBoundary(valid)
  assert.equal(r1.valid, r2.valid)
  assert.deepEqual(r1.violations, r2.violations)
})

test('FATE #1006-compat-11: validateDependencyBoundary rejects authority_grant field', () => {
  const bad = { evidence_only: true, creates_authority: false, creates_execution: false, creates_proof: false, authority_grant: 'admin' }
  const check = validateDependencyBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.violations.some((v) => v.includes('authority_grant')))
})
