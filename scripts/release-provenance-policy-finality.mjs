/**
 * scripts/release-provenance-policy-finality.mjs
 * Issue #1012 — RELEASE_PROVENANCE_POLICY_FINALITY_V1
 *
 * Evidence only — classifies deterministic finality for release provenance
 * policy reconciliation evidence.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate policy state, registries, dependency evidence, release state, or lineage.
 * Does not repair policy drift. Does not normalize BREAK_GLASS.
 *
 * Policy finality determines when reconciled policy evidence is stable enough to
 * be treated as settled evidence, without creating authority or proof.
 *
 * Exports pure functions for deterministic policy finality classification.
 * CLI: node scripts/release-provenance-policy-finality.mjs <reconciliation_evidence.json>
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  POLICY_RECONCILIATION_RESULTS,
  POLICY_RECONCILIATION_CLASSES,
  computeReconciliationHash,
  detectBreakGlassNormalization,
  validateBoundary,
} from './release-provenance-policy-reconciliation.mjs'
import { canonicalJson } from './release-provenance-policy-bindings.mjs'

export const POLICY_FINALITY_RESULTS = {
  POLICY_FINALIZED: 'POLICY_FINALIZED',
  POLICY_NOT_FINAL: 'POLICY_NOT_FINAL',
  NULL: 'NULL',
}

export const POLICY_FINALITY_CLASSES = {
  POLICY_FINALIZED: 'policy_finalized',
  POLICY_NOT_FINAL_DRIFT: 'policy_not_final_drift',
  POLICY_NOT_FINAL_DEPENDENCY_DISAGREEMENT: 'policy_not_final_dependency_disagreement',
  POLICY_NOT_FINAL_POLICY_DISAGREEMENT: 'policy_not_final_policy_disagreement',
  POLICY_FINALITY_BOUNDARY_VIOLATION: 'policy_finality_boundary_violation',
  POLICY_FINALITY_AUTHORITY_ATTEMPT: 'policy_finality_authority_attempt',
  POLICY_FINALITY_PROOF_ATTEMPT: 'policy_finality_proof_attempt',
  POLICY_FINALITY_EXECUTION_ATTEMPT: 'policy_finality_execution_attempt',
  POLICY_FINALITY_DEPLOYMENT_ATTEMPT: 'policy_finality_deployment_attempt',
  POLICY_FINALITY_MALFORMED_HASH: 'policy_finality_malformed_hash',
  POLICY_FINALITY_BREAK_GLASS_NORMALIZATION: 'policy_finality_break_glass_normalization',
  POLICY_FINALITY_LINEAGE_MUTATION: 'policy_finality_lineage_mutation',
  POLICY_FINALITY_INTEGRITY_DRIFT: 'policy_finality_integrity_drift',
}

// Reconciliation classes that indicate integrity-breaking conditions.
// Presence of any of these in policy_reconciliation_classes produces NULL finality
// regardless of the declared policy_reconciliation_result — even POLICY_RECONCILED.
const INTEGRITY_BREAKING_RECON_CLASSES = new Set([
  POLICY_RECONCILIATION_CLASSES.POLICY_LINEAGE_MUTATION,
  POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH,
  POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH,
  POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION,
  POLICY_RECONCILIATION_CLASSES.POLICY_AUTHORITY_ATTEMPT,
  POLICY_RECONCILIATION_CLASSES.POLICY_PROOF_ATTEMPT,
  POLICY_RECONCILIATION_CLASSES.POLICY_EXECUTION_ATTEMPT,
  POLICY_RECONCILIATION_CLASSES.POLICY_DEPLOYMENT_ATTEMPT,
  POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION,
])

// Reconciliation classes that signal unresolved dependency disagreement.
const DEPENDENCY_DISAGREEMENT_CLASSES = new Set([
  POLICY_RECONCILIATION_CLASSES.POLICY_BINDING_MISSING,
])

// Reconciliation classes that signal unresolved policy reference disagreement.
const POLICY_DISAGREEMENT_CLASSES = new Set([
  POLICY_RECONCILIATION_CLASSES.POLICY_REFERENCE_MISMATCH,
])

// Array fields that must be arrays (if present) in the reconciliation evidence.
const REQUIRED_ARRAY_FIELDS = [
  'binding_ids',
  'contract_ids',
  'consumer_ids',
  'policy_evaluation_hashes',
  'policy_hashes',
  'policy_reconciliation_classes',
]

/**
 * Returns true if the hash is a valid 64-char lowercase hex SHA-256 string.
 */
function isValidHex64(hash) {
  if (typeof hash !== 'string') return false
  if (hash.length !== 64) return false
  return /^[0-9a-f]{64}$/.test(hash)
}

/**
 * Computes a deterministic SHA-256 policy finality hash.
 *
 * Hash covers (all sorted before hashing):
 *   policy_finality_result, policy_finality_classes,
 *   policy_reconciliation_hash, binding_ids, contract_ids, consumer_ids.
 *
 * policy_finality_hash itself is excluded (avoids circularity).
 * Same finality state always produces the same hash.
 * Reordered inputs preserve hash stability.
 *
 * @param {object} fields
 * @returns {string} hex SHA-256 digest
 */
export function computeFinalityHash(fields) {
  const payload = {
    binding_ids: [...(fields.binding_ids ?? [])].sort(),
    consumer_ids: [...(fields.consumer_ids ?? [])].sort(),
    contract_ids: [...(fields.contract_ids ?? [])].sort(),
    policy_finality_classes: [...(fields.policy_finality_classes ?? [])].sort(),
    policy_finality_result: fields.policy_finality_result ?? POLICY_FINALITY_RESULTS.NULL,
    policy_reconciliation_hash: fields.policy_reconciliation_hash ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Builds the finality evidence object.
 * Always sets evidence_only, creates_authority, creates_execution, creates_proof.
 * Computes policy_finality_hash deterministically.
 */
function buildFinality(result, classes, reconHash, bindingIds, contractIds, consumerIds) {
  const hash = computeFinalityHash({
    policy_finality_result: result,
    policy_finality_classes: classes,
    policy_reconciliation_hash: reconHash,
    binding_ids: bindingIds,
    contract_ids: contractIds,
    consumer_ids: consumerIds,
  })

  return {
    artifact: 'RELEASE_PROVENANCE_POLICY_FINALITY',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    policy_finality_result: result,
    policy_finality_classes: classes,
    policy_reconciliation_hash: reconHash,
    binding_ids: bindingIds,
    contract_ids: contractIds,
    consumer_ids: consumerIds,
    policy_finality_hash_alg: 'sha256',
    policy_finality_hash: hash,
  }
}

/**
 * Returns the most-specific NULL finality class for a boundary validation result.
 */
function boundaryNullClass(boundary) {
  if (boundary.authority_attempt) return POLICY_FINALITY_CLASSES.POLICY_FINALITY_AUTHORITY_ATTEMPT
  if (boundary.proof_attempt) return POLICY_FINALITY_CLASSES.POLICY_FINALITY_PROOF_ATTEMPT
  if (boundary.execution_attempt) return POLICY_FINALITY_CLASSES.POLICY_FINALITY_EXECUTION_ATTEMPT
  if (boundary.deployment_attempt) return POLICY_FINALITY_CLASSES.POLICY_FINALITY_DEPLOYMENT_ATTEMPT
  return POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION
}

/**
 * Classifies policy finality status for release provenance.
 *
 * Consumes policy reconciliation evidence (RELEASE_PROVENANCE_POLICY_RECONCILIATION).
 * Deterministically classifies finality without creating authority, proof,
 * execution capability, deployment triggers, or registry mutations.
 *
 * Policy finality results:
 *   POLICY_FINALIZED  — reconciliation_result is POLICY_RECONCILED, all boundaries
 *                       clean, hash integrity verified, no integrity-breaking classes,
 *                       no BREAK_GLASS normalization
 *   POLICY_NOT_FINAL  — non-integrity drift or unresolved dependency/policy disagreement
 *   NULL              — boundary violation, authority/proof/execution/deployment attempt,
 *                       missing/malformed hash, BREAK_GLASS normalization, lineage
 *                       mutation, or integrity-breaking drift
 *
 * NULL always takes precedence over POLICY_NOT_FINAL (fail closed).
 * Integrity-breaking classes produce NULL before any result classification,
 * even when policy_reconciliation_result is POLICY_RECONCILED.
 * POLICY_NOT_FINAL is not repaired — it is observed and classified only.
 *
 * @param {object|null} reconciliationEvidence - RELEASE_PROVENANCE_POLICY_RECONCILIATION object
 * @returns {object} RELEASE_PROVENANCE_POLICY_FINALITY evidence object
 */
export function classifyPolicyFinality(reconciliationEvidence) {
  // Absent or non-object input → NULL (fail closed)
  if (!reconciliationEvidence || typeof reconciliationEvidence !== 'object') {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION],
      null, [], [], [],
    )
  }

  const reconHash = reconciliationEvidence.policy_reconciliation_hash ?? null

  // ── Step 1: Boundary invariant check ─────────────────────────────────────

  const boundary = validateBoundary(reconciliationEvidence)
  if (!boundary.valid) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [boundaryNullClass(boundary)],
      reconHash, [], [], [],
    )
  }

  // ── Step 2: BREAK_GLASS normalization detection ───────────────────────────

  if (detectBreakGlassNormalization(reconciliationEvidence)) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BREAK_GLASS_NORMALIZATION],
      reconHash, [], [], [],
    )
  }

  // ── Step 3: Array field validation ───────────────────────────────────────
  // All six array fields must be arrays if present; non-array values are
  // boundary violations that would corrupt computeReconciliationHash.

  for (const field of REQUIRED_ARRAY_FIELDS) {
    const val = reconciliationEvidence[field]
    if (val !== undefined && val !== null && !Array.isArray(val)) {
      return buildFinality(
        POLICY_FINALITY_RESULTS.NULL,
        [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION],
        reconHash, [], [], [],
      )
    }
  }

  const bindingIds = Array.isArray(reconciliationEvidence.binding_ids)
    ? [...reconciliationEvidence.binding_ids].sort()
    : []
  const contractIds = Array.isArray(reconciliationEvidence.contract_ids)
    ? [...reconciliationEvidence.contract_ids].sort()
    : []
  const consumerIds = Array.isArray(reconciliationEvidence.consumer_ids)
    ? [...reconciliationEvidence.consumer_ids].sort()
    : []

  // ── Step 4: Hash is required ──────────────────────────────────────────────
  // Missing, null, undefined, or empty hash → NULL.
  // A POLICY_RECONCILED payload without policy_reconciliation_hash must never
  // become POLICY_FINALIZED.

  if (!reconHash) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // ── Step 5: Hash format validation ────────────────────────────────────────

  if (!isValidHex64(reconHash)) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_MALFORMED_HASH],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // ── Step 6: Hash integrity verification ──────────────────────────────────

  let recomputed
  try {
    recomputed = computeReconciliationHash({
      binding_ids: reconciliationEvidence.binding_ids ?? [],
      contract_ids: reconciliationEvidence.contract_ids ?? [],
      consumer_ids: reconciliationEvidence.consumer_ids ?? [],
      policy_evaluation_hashes: reconciliationEvidence.policy_evaluation_hashes ?? [],
      policy_hashes: reconciliationEvidence.policy_hashes ?? [],
      policy_reconciliation_classes: reconciliationEvidence.policy_reconciliation_classes ?? [],
      policy_reconciliation_result:
        reconciliationEvidence.policy_reconciliation_result ?? POLICY_RECONCILIATION_RESULTS.NULL,
    })
  } catch (_) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  if (reconHash !== recomputed) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_LINEAGE_MUTATION],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // ── Step 7: Integrity-breaking class check ────────────────────────────────
  // Applied before any finality result classification — even POLICY_RECONCILED
  // evidence with integrity-breaking classes produces NULL.

  const reconClasses = Array.isArray(reconciliationEvidence.policy_reconciliation_classes)
    ? reconciliationEvidence.policy_reconciliation_classes
    : []

  if (reconClasses.some((c) => INTEGRITY_BREAKING_RECON_CLASSES.has(c))) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_INTEGRITY_DRIFT],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // ── Step 8: Classify based on reconciliation result ───────────────────────

  const reconResult = reconciliationEvidence.policy_reconciliation_result

  // NULL reconciliation result → NULL finality
  if (!reconResult || reconResult === POLICY_RECONCILIATION_RESULTS.NULL) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.NULL,
      [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // POLICY_RECONCILED → POLICY_FINALIZED
  if (reconResult === POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED) {
    return buildFinality(
      POLICY_FINALITY_RESULTS.POLICY_FINALIZED,
      [POLICY_FINALITY_CLASSES.POLICY_FINALIZED],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // POLICY_DRIFT_DETECTED → POLICY_NOT_FINAL (non-integrity drift only; integrity
  // cases already handled in step 7)
  if (reconResult === POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED) {
    const hasPolicyDisagreement = reconClasses.some((c) => POLICY_DISAGREEMENT_CLASSES.has(c))
    const hasDependencyDisagreement = reconClasses.some((c) => DEPENDENCY_DISAGREEMENT_CLASSES.has(c))

    let notFinalClass
    if (hasPolicyDisagreement) {
      notFinalClass = POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_POLICY_DISAGREEMENT
    } else if (hasDependencyDisagreement) {
      notFinalClass = POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_DEPENDENCY_DISAGREEMENT
    } else {
      notFinalClass = POLICY_FINALITY_CLASSES.POLICY_NOT_FINAL_DRIFT
    }

    return buildFinality(
      POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL,
      [notFinalClass],
      reconHash, bindingIds, contractIds, consumerIds,
    )
  }

  // Unknown reconciliation result → boundary violation (fail closed)
  return buildFinality(
    POLICY_FINALITY_RESULTS.NULL,
    [POLICY_FINALITY_CLASSES.POLICY_FINALITY_BOUNDARY_VIOLATION],
    reconHash, bindingIds, contractIds, consumerIds,
  )
}

// ── CLI runner ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const [reconciliationPath] = positional

  if (!reconciliationPath) {
    console.error(
      'NULL — policy_finality_boundary_violation: usage: release-provenance-policy-finality.mjs <reconciliation_evidence.json>',
    )
    process.exit(1)
  }

  if (!existsSync(reconciliationPath)) {
    console.error(
      `NULL — policy_finality_boundary_violation: reconciliation evidence file not found: ${reconciliationPath}`,
    )
    process.exit(1)
  }

  let reconciliationEvidence
  try {
    reconciliationEvidence = JSON.parse(readFileSync(reconciliationPath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — policy_finality_boundary_violation: failed to parse reconciliation evidence JSON: ${e.message}`,
    )
    process.exit(1)
  }

  const evidence = classifyPolicyFinality(reconciliationEvidence)

  console.log(JSON.stringify(evidence, null, 2))

  if (evidence.policy_finality_result === POLICY_FINALITY_RESULTS.POLICY_FINALIZED) {
    process.exit(0)
  } else if (evidence.policy_finality_result === POLICY_FINALITY_RESULTS.POLICY_NOT_FINAL) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
