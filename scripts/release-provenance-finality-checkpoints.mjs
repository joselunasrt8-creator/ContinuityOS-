/**
 * scripts/release-provenance-finality-checkpoints.mjs
 * Issue #1002 — RELEASE_PROVENANCE_FINALITY_CHECKPOINTS_V1
 *
 * Evidence only — classifies deterministic finality checkpoints for
 * distributed release provenance.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate source registries. Does not rewrite lineage.
 * Does not repair ancestry automatically. Does not normalize BREAK_GLASS.
 *
 * Finality classifies when observed release provenance has reached a
 * deterministic checkpoint state. It does not create release legitimacy.
 *
 * Exports pure functions for finality classification analysis.
 * CLI: node scripts/release-provenance-finality-checkpoints.mjs <causal_evidence.json> [reconciliation_evidence.json] [--require-reconciliation]
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const FINALITY_RESULTS = {
  FINALIZED: 'FINALIZED',
  NOT_FINAL: 'NOT_FINAL',
  NULL: 'NULL',
}

export const FINALITY_CLASSES = {
  FINALITY_CHECKPOINT_REACHED: 'finality_checkpoint_reached',
  FINALITY_PENDING_CONCURRENCY: 'finality_pending_concurrency',
  FINALITY_PENDING_RECONCILIATION: 'finality_pending_reconciliation',
  FINALITY_RECONCILIATION_DRIFT: 'finality_reconciliation_drift',
  FINALITY_REPLAY_ANOMALY: 'finality_replay_anomaly',
  FINALITY_LINEAGE_MUTATION: 'finality_lineage_mutation',
  FINALITY_ROLLBACK_INVALID: 'finality_rollback_invalid',
  FINALITY_BREAK_GLASS_NORMALIZATION: 'finality_break_glass_normalization',
  FINALITY_EVIDENCE_BOUNDARY_VIOLATION: 'finality_evidence_boundary_violation',
}

export const RECONCILIATION_RESULTS = {
  RECONCILED: 'RECONCILED',
  DRIFT_DETECTED: 'DRIFT_DETECTED',
  NULL: 'NULL',
}

// Causal result values consumed from causal ordering evidence
const CAUSAL_RESULTS = {
  VALID_LINEAGE: 'VALID_LINEAGE',
  CONCURRENT: 'CONCURRENT',
  NULL: 'NULL',
}

// Maps causal failure_class values to finality classification classes
const CAUSAL_FAILURE_TO_FINALITY_CLASS = {
  causal_replay_anomaly: FINALITY_CLASSES.FINALITY_REPLAY_ANOMALY,
  lineage_mutation_detected: FINALITY_CLASSES.FINALITY_LINEAGE_MUTATION,
  rollback_lineage_missing: FINALITY_CLASSES.FINALITY_ROLLBACK_INVALID,
  rollback_lineage_fork: FINALITY_CLASSES.FINALITY_ROLLBACK_INVALID,
  break_glass_causal_normalization: FINALITY_CLASSES.FINALITY_BREAK_GLASS_NORMALIZATION,
  concurrent_release_conflict: FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY,
}

/**
 * Produces a canonical deep-sorted JSON representation.
 * Keys sorted alphabetically at every nesting level.
 * Arrays preserve element order (only object keys are sorted).
 * Ensures deterministic serialization regardless of insertion order.
 */
export function canonicalJson(value) {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

/**
 * Computes a deterministic SHA-256 checkpoint hash over canonical fields.
 *
 * Hash covers: release_id, causal_hash, reconciliation_hash, finality_result,
 * sorted finality_classes.
 *
 * Same checkpoint state always produces the same hash.
 * checkpoint_hash itself is excluded (avoids circularity).
 *
 * @param {object} checkpointState
 * @returns {string} hex SHA-256 digest
 */
export function computeCheckpointHash(checkpointState) {
  const payload = {
    causal_hash: checkpointState.causal_hash ?? null,
    finality_classes: [...(checkpointState.finality_classes ?? [])].sort(),
    finality_result: checkpointState.finality_result ?? FINALITY_RESULTS.NULL,
    reconciliation_hash: checkpointState.reconciliation_hash ?? null,
    release_id: checkpointState.release_id ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Validates the evidence boundary invariants of a finality checkpoint object.
 *
 * Checkpoint must always preserve:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *
 * Checkpoint must not contain fields implying proof creation, authority creation,
 * execution authorization, deployment triggers, registry mutation, or lineage repair.
 *
 * @param {object} checkpointObject
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateFinalityEvidenceBoundary(checkpointObject) {
  const violations = []

  if (checkpointObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (checkpointObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (checkpointObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }

  const disallowedFields = [
    'proof_id',
    'proof_binding_hash',
    'proof_signature',
    'authority_grant',
    'authorization',
    'deployment_token',
    'deployment_trigger',
    'execution_id',
    'registry_mutation',
    'lineage_repair',
    'creates_proof',
  ]
  for (const field of disallowedFields) {
    if (field in checkpointObject) {
      violations.push(`disallowed field present: ${field}`)
    }
  }

  return { valid: violations.length === 0, violations }
}

/**
 * Validates the evidence boundary invariants of an input causal evidence object.
 * Consumed causal evidence must preserve evidence-only semantics.
 *
 * @param {object} evidenceObject
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validateCausalEvidenceBoundary(evidenceObject) {
  const violations = []

  if (evidenceObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (evidenceObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (evidenceObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }

  return { valid: violations.length === 0, violations }
}

/**
 * Builds a finality checkpoint evidence object from constituent fields.
 * Always sets evidence_only, creates_authority, creates_execution correctly.
 * Computes checkpoint_hash deterministically.
 *
 * @param {object} base - artifact + evidence boundary fields
 * @param {string|null} releaseId
 * @param {string|null} causalHash
 * @param {string|null} reconciliationHash
 * @param {string} finalityResult
 * @param {string[]} finalityClasses
 * @returns {object} finality checkpoint evidence object
 */
function buildCheckpoint(base, releaseId, causalHash, reconciliationHash, finalityResult, finalityClasses) {
  const checkpointState = {
    release_id: releaseId,
    causal_hash: causalHash,
    reconciliation_hash: reconciliationHash,
    finality_result: finalityResult,
    finality_classes: finalityClasses,
  }
  return {
    ...base,
    release_id: releaseId,
    causal_hash: causalHash,
    reconciliation_hash: reconciliationHash,
    finality_result: finalityResult,
    checkpoint_hash_alg: 'sha256',
    checkpoint_hash: computeCheckpointHash(checkpointState),
    finality_classes: finalityClasses,
  }
}

/**
 * Classifies finality checkpoint status for release provenance.
 *
 * Consumes causal ordering evidence and optional reconciliation evidence.
 * Deterministically classifies finality status without creating authority,
 * proof, execution capability, deployment triggers, or registry mutations.
 *
 * Finality results:
 *   FINALIZED   — causal ordering valid, no anomalies, reconciliation settled if provided
 *   NOT_FINAL   — valid evidence exists but checkpoint prerequisites are incomplete
 *   NULL        — causal evidence invalid, replay/mutation/boundary violation detected
 *
 * @param {object|null} causalEvidence - output of classifyCausalOrdering
 * @param {object|null} [reconciliationEvidence] - optional reconciliation evidence
 * @param {object} [options]
 * @param {boolean} [options.requireReconciliation] - if true, reconciliation evidence is required
 * @returns {object} RELEASE_PROVENANCE_FINALITY_CHECKPOINT evidence object
 */
export function classifyFinalityCheckpoint(causalEvidence, reconciliationEvidence = null, options = {}) {
  const { requireReconciliation = false } = options

  const base = {
    artifact: 'RELEASE_PROVENANCE_FINALITY_CHECKPOINT',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
  }

  // Absent causal evidence → NULL
  if (causalEvidence === null || causalEvidence === undefined) {
    return buildCheckpoint(base, null, null, null, FINALITY_RESULTS.NULL, [])
  }

  // Validate boundary invariants of input causal evidence
  const boundaryCheck = validateCausalEvidenceBoundary(causalEvidence)
  if (!boundaryCheck.valid) {
    const releaseId = causalEvidence.release_id ?? null
    const causalHash = causalEvidence.causal_hash ?? null
    const reconHash = reconciliationEvidence?.reconciliation_hash ?? null
    return buildCheckpoint(
      base,
      releaseId,
      causalHash,
      reconHash,
      FINALITY_RESULTS.NULL,
      [FINALITY_CLASSES.FINALITY_EVIDENCE_BOUNDARY_VIOLATION],
    )
  }

  const releaseId = causalEvidence.release_id ?? null
  const causalHash = causalEvidence.causal_hash ?? null
  const reconHash = reconciliationEvidence?.reconciliation_hash ?? null
  const causalResult = causalEvidence.causal_result

  // NULL causal result → NULL finality
  if (causalResult === CAUSAL_RESULTS.NULL || !causalResult) {
    const failureClass = causalEvidence.failure_class ?? null
    const finalityClass = failureClass
      ? (CAUSAL_FAILURE_TO_FINALITY_CLASS[failureClass] ?? null)
      : null
    const finalityClasses = finalityClass ? [finalityClass] : []
    return buildCheckpoint(base, releaseId, causalHash, reconHash, FINALITY_RESULTS.NULL, finalityClasses)
  }

  // CONCURRENT causal result → NOT_FINAL (concurrency must be resolved explicitly)
  if (causalResult === CAUSAL_RESULTS.CONCURRENT) {
    return buildCheckpoint(
      base,
      releaseId,
      causalHash,
      reconHash,
      FINALITY_RESULTS.NOT_FINAL,
      [FINALITY_CLASSES.FINALITY_PENDING_CONCURRENCY],
    )
  }

  // VALID_LINEAGE: eligible for FINALIZED — check reconciliation

  if (reconciliationEvidence !== null && reconciliationEvidence !== undefined) {
    const reconResult = reconciliationEvidence.reconciliation_result

    // NULL reconciliation result → NULL finality
    if (reconResult === RECONCILIATION_RESULTS.NULL || !reconResult) {
      return buildCheckpoint(base, releaseId, causalHash, reconHash, FINALITY_RESULTS.NULL, [])
    }

    // Drift detected
    if (reconResult === RECONCILIATION_RESULTS.DRIFT_DETECTED) {
      // Integrity-breaking drift → NULL (fails closed)
      if (reconciliationEvidence.integrity_breaking === true) {
        return buildCheckpoint(
          base,
          releaseId,
          causalHash,
          reconHash,
          FINALITY_RESULTS.NULL,
          [FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT],
        )
      }
      // Non-integrity-breaking drift → NOT_FINAL
      return buildCheckpoint(
        base,
        releaseId,
        causalHash,
        reconHash,
        FINALITY_RESULTS.NOT_FINAL,
        [FINALITY_CLASSES.FINALITY_RECONCILIATION_DRIFT],
      )
    }

    // RECONCILED: proceed to FINALIZED
  } else if (requireReconciliation) {
    // Reconciliation required but absent → NOT_FINAL (prerequisites incomplete)
    return buildCheckpoint(
      base,
      releaseId,
      causalHash,
      null,
      FINALITY_RESULTS.NOT_FINAL,
      [FINALITY_CLASSES.FINALITY_PENDING_RECONCILIATION],
    )
  }

  // All prerequisites satisfied → FINALIZED
  return buildCheckpoint(
    base,
    releaseId,
    causalHash,
    reconHash,
    FINALITY_RESULTS.FINALIZED,
    [FINALITY_CLASSES.FINALITY_CHECKPOINT_REACHED],
  )
}

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)
  const requireReconciliation = args.includes('--require-reconciliation')
  const positional = args.filter((a) => !a.startsWith('--'))

  const [causalEvidencePath, reconciliationEvidencePath] = positional

  if (!causalEvidencePath) {
    console.error(
      'NULL — finality_evidence_boundary_violation: usage: release-provenance-finality-checkpoints.mjs <causal_evidence.json> [reconciliation_evidence.json] [--require-reconciliation]',
    )
    process.exit(1)
  }

  if (!existsSync(causalEvidencePath)) {
    console.error(`NULL — finality_evidence_boundary_violation: causal evidence file not found: ${causalEvidencePath}`)
    process.exit(1)
  }

  let causalEvidence
  try {
    causalEvidence = JSON.parse(readFileSync(causalEvidencePath, 'utf8'))
  } catch (e) {
    console.error(`NULL — finality_evidence_boundary_violation: failed to parse causal evidence JSON: ${e.message}`)
    process.exit(1)
  }

  let reconciliationEvidence = null
  if (reconciliationEvidencePath) {
    if (!existsSync(reconciliationEvidencePath)) {
      console.error(`NULL — finality_evidence_boundary_violation: reconciliation evidence file not found: ${reconciliationEvidencePath}`)
      process.exit(1)
    }
    try {
      reconciliationEvidence = JSON.parse(readFileSync(reconciliationEvidencePath, 'utf8'))
    } catch (e) {
      console.error(`NULL — finality_evidence_boundary_violation: failed to parse reconciliation evidence JSON: ${e.message}`)
      process.exit(1)
    }
  }

  const result = classifyFinalityCheckpoint(causalEvidence, reconciliationEvidence, { requireReconciliation })
  console.log(JSON.stringify(result, null, 2))

  if (result.finality_result === FINALITY_RESULTS.FINALIZED) {
    process.exit(0)
  } else if (result.finality_result === FINALITY_RESULTS.NOT_FINAL) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
