/**
 * scripts/release-provenance-policy-bindings.mjs
 * Issue #1008 — RELEASE_PROVENANCE_POLICY_BINDINGS_V1
 *
 * Evidence only — classifies deterministic policy bindings for
 * release provenance dependency contracts.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate source registries. Does not rewrite lineage.
 * Does not repair ancestry automatically. Does not normalize BREAK_GLASS.
 *
 * Policy bindings define which external constraints apply to dependency
 * contracts. They do not turn references into authority.
 *
 * Exports pure functions for policy binding evaluation.
 * CLI: node scripts/release-provenance-policy-bindings.mjs <dependency_evaluation.json> <policy_binding.json>
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const POLICY_RESULTS = {
  POLICY_BOUND: 'POLICY_BOUND',
  POLICY_REJECTED: 'POLICY_REJECTED',
  NULL: 'NULL',
}

export const POLICY_CLASSES = {
  POLICY_BINDING_SATISFIED: 'policy_binding_satisfied',
  POLICY_EXTERNAL_REFERENCE_MISSING: 'policy_external_reference_missing',
  POLICY_HUMAN_APPROVAL_MISSING: 'policy_human_approval_missing',
  POLICY_DEPLOYMENT_AUTHORITY_MISSING: 'policy_deployment_authority_missing',
  POLICY_DEPENDENCY_NOT_SATISFIED: 'policy_dependency_not_satisfied',
  POLICY_DRIFT_DETECTED: 'policy_drift_detected',
  POLICY_BOUNDARY_VIOLATION: 'policy_boundary_violation',
  POLICY_AUTHORITY_ATTEMPT: 'policy_authority_attempt',
  POLICY_PROOF_ATTEMPT: 'policy_proof_attempt',
  POLICY_EXECUTION_ATTEMPT: 'policy_execution_attempt',
  POLICY_DEPLOYMENT_ATTEMPT: 'policy_deployment_attempt',
  POLICY_HASH_INVALID: 'policy_hash_invalid',
  POLICY_BREAK_GLASS_NORMALIZATION: 'policy_break_glass_normalization',
  POLICY_LINEAGE_MUTATION: 'policy_lineage_mutation',
}

// Internal dependency result values — consumed from dependency evaluation evidence
const DEPENDENCY_RESULTS = {
  DEPENDENCY_SATISFIED: 'DEPENDENCY_SATISFIED',
  DEPENDENCY_REJECTED: 'DEPENDENCY_REJECTED',
  NULL: 'NULL',
}

// Fields that indicate binding boundary violation attempts
const DISALLOWED_BINDING_FIELDS = [
  'authority_grant',
  'execution_token',
  'proof_signature',
  'deployment_trigger',
  'deployment_token',
  'deployment_capability',
  'registry_mutation',
  'lineage_repair',
  'runtime_route',
  'runtime_routes',
  'route_expansion',
  'execution_surface',
  'policy_override',
]

// Fields that indicate dependency evidence boundary violations
const DISALLOWED_DEPENDENCY_FIELDS = [
  'authority_grant',
  'execution_token',
  'proof_signature',
  'deployment_trigger',
  'deployment_token',
  'registry_mutation',
  'lineage_repair',
]

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
 * Computes a deterministic SHA-256 policy binding hash over canonical binding fields.
 *
 * Hash covers: artifact, binding_id, contract_id, consumer_id, evidence_only,
 * creates_authority, creates_execution, creates_proof, external_policy_reference,
 * human_approval_reference, deployment_authority_reference, policy_hash_alg.
 *
 * policy_hash itself is excluded (avoids circularity).
 *
 * @param {object} bindingFields
 * @returns {string} hex SHA-256 digest
 */
export function computePolicyHash(bindingFields) {
  const payload = {
    artifact: bindingFields.artifact ?? null,
    binding_id: bindingFields.binding_id ?? null,
    contract_id: bindingFields.contract_id ?? null,
    consumer_id: bindingFields.consumer_id ?? null,
    creates_authority: bindingFields.creates_authority ?? null,
    creates_execution: bindingFields.creates_execution ?? null,
    creates_proof: bindingFields.creates_proof ?? null,
    deployment_authority_reference: bindingFields.deployment_authority_reference ?? null,
    evidence_only: bindingFields.evidence_only ?? null,
    external_policy_reference: bindingFields.external_policy_reference ?? null,
    human_approval_reference: bindingFields.human_approval_reference ?? null,
    policy_hash_alg: bindingFields.policy_hash_alg ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Computes a deterministic SHA-256 policy evaluation hash.
 *
 * Hash covers: binding_id, contract_id, consumer_id, release_id,
 * dependency_hash, policy_result, sorted policy_classes.
 *
 * policy_evaluation_hash itself is excluded (avoids circularity).
 *
 * Same policy state always produces the same hash.
 *
 * @param {object} evaluationState
 * @returns {string} hex SHA-256 digest
 */
export function computeEvaluationHash(evaluationState) {
  const payload = {
    binding_id: evaluationState.binding_id ?? null,
    contract_id: evaluationState.contract_id ?? null,
    consumer_id: evaluationState.consumer_id ?? null,
    dependency_hash: evaluationState.dependency_hash ?? null,
    policy_classes: [...(evaluationState.policy_classes ?? [])].sort(),
    policy_result: evaluationState.policy_result ?? POLICY_RESULTS.NULL,
    release_id: evaluationState.release_id ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Validates the evidence boundary invariants of a policy binding object.
 *
 * Binding must always preserve:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *   - creates_proof: false
 *
 * Binding must not contain fields implying authority creation, proof creation,
 * execution authorization, deployment triggers, or registry mutation.
 *
 * @param {object} bindingObject
 * @returns {{ valid: boolean, violations: string[], authority_attempt: boolean, proof_attempt: boolean, execution_attempt: boolean, deployment_attempt: boolean }}
 */
export function validateBindingBoundary(bindingObject) {
  const violations = []
  let authority_attempt = false
  let proof_attempt = false
  let execution_attempt = false
  let deployment_attempt = false

  if (bindingObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (bindingObject.creates_authority === true) {
    violations.push('creates_authority must be false')
    authority_attempt = true
  } else if (bindingObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (bindingObject.creates_execution === true) {
    violations.push('creates_execution must be false')
    execution_attempt = true
  } else if (bindingObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }
  if (bindingObject.creates_proof === true) {
    violations.push('creates_proof must be false')
    proof_attempt = true
  } else if (bindingObject.creates_proof !== false) {
    violations.push('creates_proof must be false')
  }

  for (const field of DISALLOWED_BINDING_FIELDS) {
    if (field in bindingObject) {
      violations.push(`disallowed field present: ${field}`)
      if (field === 'authority_grant') authority_attempt = true
      if (field === 'proof_signature') proof_attempt = true
      if (field === 'execution_token') execution_attempt = true
      if (
        field === 'deployment_trigger' ||
        field === 'deployment_token' ||
        field === 'deployment_capability'
      ) {
        deployment_attempt = true
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    authority_attempt,
    proof_attempt,
    execution_attempt,
    deployment_attempt,
  }
}

/**
 * Validates the evidence boundary invariants of dependency evaluation evidence.
 *
 * Dependency evidence must preserve evidence-only semantics.
 *
 * @param {object} dependencyEvidence
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateDependencyBoundary(dependencyEvidence) {
  const violations = []

  if (dependencyEvidence.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (dependencyEvidence.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (dependencyEvidence.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }
  if (dependencyEvidence.creates_proof !== false) {
    violations.push('creates_proof must be false')
  }

  for (const field of DISALLOWED_DEPENDENCY_FIELDS) {
    if (field in dependencyEvidence) {
      violations.push(`disallowed field present: ${field}`)
    }
  }

  return { valid: violations.length === 0, violations }
}

/**
 * Validates that a hash is a valid 64-char lowercase hex string.
 *
 * @param {string|null|undefined} hash
 * @returns {boolean}
 */
function isValidHex64(hash) {
  if (typeof hash !== 'string') return false
  if (hash.length !== 64) return false
  return /^[0-9a-f]{64}$/.test(hash)
}

/**
 * Detects BREAK_GLASS normalization in dependency evidence.
 *
 * @param {object} dependencyEvidence
 * @returns {boolean}
 */
function detectBreakGlassNormalization(dependencyEvidence) {
  if (dependencyEvidence.is_break_glass === true) return true
  if (dependencyEvidence.break_glass_normalized === true) return true
  if (
    typeof dependencyEvidence.failure_class === 'string' &&
    dependencyEvidence.failure_class.toLowerCase().includes('break_glass')
  )
    return true
  if (
    Array.isArray(dependencyEvidence.dependency_classes) &&
    dependencyEvidence.dependency_classes.some(
      (c) => typeof c === 'string' && c.toLowerCase().includes('break_glass'),
    )
  )
    return true
  return false
}

/**
 * Builds a policy evaluation evidence object.
 * Always sets evidence_only, creates_authority, creates_execution, creates_proof correctly.
 * Computes policy_evaluation_hash deterministically.
 *
 * @param {object} fields - named fields for the evaluation
 * @returns {object} RELEASE_PROVENANCE_POLICY_EVALUATION evidence object
 */
function buildEvaluation(fields) {
  const { bindingId, contractId, consumerId, releaseId, dependencyHash, policyResult, policyClasses } =
    fields

  const state = {
    binding_id: bindingId,
    contract_id: contractId,
    consumer_id: consumerId,
    release_id: releaseId,
    dependency_hash: dependencyHash,
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
    dependency_hash: dependencyHash,
    policy_result: policyResult,
    policy_classes: policyClasses,
    policy_evaluation_hash_alg: 'sha256',
    policy_evaluation_hash: computeEvaluationHash(state),
  }
}

/**
 * Classifies policy binding satisfaction for release provenance dependency contracts.
 *
 * Consumes dependency evaluation evidence and a policy binding object.
 * Deterministically classifies policy satisfaction without creating authority,
 * proof, execution capability, deployment triggers, or registry mutations.
 *
 * Policy results:
 *   POLICY_BOUND    — dependency_result is DEPENDENCY_SATISFIED, binding boundary valid,
 *                     dependency boundary valid, all required references present,
 *                     hashes valid, no authority/proof/execution/deployment attempts
 *   POLICY_REJECTED — dependency evidence is valid but required references are missing,
 *                     or dependency_result is DEPENDENCY_REJECTED (structurally valid)
 *   NULL            — dependency_result is NULL, binding boundary violated, hash invalid,
 *                     BREAK_GLASS normalization detected, or lineage mutation detected
 *
 * @param {object|null} dependencyEvidence - output of #1006 dependency contract classification
 * @param {object|null} bindingObject - policy binding to evaluate
 * @returns {object} RELEASE_PROVENANCE_POLICY_EVALUATION evidence object
 */
export function classifyPolicy(dependencyEvidence, bindingObject) {
  const bindingId = bindingObject?.binding_id ?? null
  const contractId = bindingObject?.contract_id ?? null
  const consumerId = bindingObject?.consumer_id ?? null

  // ── Binding must exist ───────────────────────────────────────────────────────

  if (bindingObject === null || bindingObject === undefined) {
    return buildEvaluation({
      bindingId: null,
      contractId: null,
      consumerId: null,
      releaseId: null,
      dependencyHash: null,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION],
    })
  }

  // ── Validate binding boundary ────────────────────────────────────────────────

  const bindingBoundary = validateBindingBoundary(bindingObject)

  if (!bindingBoundary.valid) {
    const classes = []

    if (bindingBoundary.authority_attempt) {
      classes.push(POLICY_CLASSES.POLICY_AUTHORITY_ATTEMPT)
    }
    if (bindingBoundary.proof_attempt) {
      classes.push(POLICY_CLASSES.POLICY_PROOF_ATTEMPT)
    }
    if (bindingBoundary.execution_attempt) {
      classes.push(POLICY_CLASSES.POLICY_EXECUTION_ATTEMPT)
    }
    if (bindingBoundary.deployment_attempt) {
      classes.push(POLICY_CLASSES.POLICY_DEPLOYMENT_ATTEMPT)
    }
    // Add boundary violation if no more specific class was added
    if (classes.length === 0) {
      classes.push(POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION)
    }

    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId: null,
      dependencyHash: null,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: classes,
    })
  }

  // ── Validate policy_hash ─────────────────────────────────────────────────────

  if (bindingObject.policy_hash !== undefined && bindingObject.policy_hash !== null) {
    if (!isValidHex64(bindingObject.policy_hash)) {
      return buildEvaluation({
        bindingId,
        contractId,
        consumerId,
        releaseId: null,
        dependencyHash: null,
        policyResult: POLICY_RESULTS.NULL,
        policyClasses: [POLICY_CLASSES.POLICY_HASH_INVALID],
      })
    }
    const expectedHash = computePolicyHash(bindingObject)
    if (bindingObject.policy_hash !== expectedHash) {
      return buildEvaluation({
        bindingId,
        contractId,
        consumerId,
        releaseId: null,
        dependencyHash: null,
        policyResult: POLICY_RESULTS.NULL,
        policyClasses: [POLICY_CLASSES.POLICY_LINEAGE_MUTATION],
      })
    }
  }

  // ── Dependency evidence must exist ───────────────────────────────────────────

  if (dependencyEvidence === null || dependencyEvidence === undefined) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId: null,
      dependencyHash: null,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [],
    })
  }

  const releaseId = dependencyEvidence.release_id ?? null
  const dependencyHash = dependencyEvidence.dependency_hash ?? null

  // ── Validate dependency evidence boundary ────────────────────────────────────

  const dependencyBoundary = validateDependencyBoundary(dependencyEvidence)

  if (!dependencyBoundary.valid) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION],
    })
  }

  // ── Detect BREAK_GLASS normalization ─────────────────────────────────────────

  if (detectBreakGlassNormalization(dependencyEvidence)) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [POLICY_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION],
    })
  }

  // ── Validate dependency_hash ─────────────────────────────────────────────────

  if (dependencyHash !== null && !isValidHex64(dependencyHash)) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [POLICY_CLASSES.POLICY_HASH_INVALID],
    })
  }

  // ── Handle dependency_result ─────────────────────────────────────────────────

  const dependencyResult = dependencyEvidence.dependency_result

  if (dependencyResult === DEPENDENCY_RESULTS.NULL || !dependencyResult) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.NULL,
      policyClasses: [],
    })
  }

  if (dependencyResult === DEPENDENCY_RESULTS.DEPENDENCY_REJECTED) {
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.POLICY_REJECTED,
      policyClasses: [POLICY_CLASSES.POLICY_DEPENDENCY_NOT_SATISFIED],
    })
  }

  // ── DEPENDENCY_SATISFIED: check required references ──────────────────────────

  if (dependencyResult === DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED) {
    const rejectionClasses = []

    // Required references must be non-null, non-empty strings
    if (!bindingObject.external_policy_reference) {
      rejectionClasses.push(POLICY_CLASSES.POLICY_EXTERNAL_REFERENCE_MISSING)
    }
    if (!bindingObject.human_approval_reference) {
      rejectionClasses.push(POLICY_CLASSES.POLICY_HUMAN_APPROVAL_MISSING)
    }
    if (!bindingObject.deployment_authority_reference) {
      rejectionClasses.push(POLICY_CLASSES.POLICY_DEPLOYMENT_AUTHORITY_MISSING)
    }

    if (rejectionClasses.length > 0) {
      // Missing references indicate policy drift from the expected binding state
      rejectionClasses.push(POLICY_CLASSES.POLICY_DRIFT_DETECTED)
      return buildEvaluation({
        bindingId,
        contractId,
        consumerId,
        releaseId,
        dependencyHash,
        policyResult: POLICY_RESULTS.POLICY_REJECTED,
        policyClasses: rejectionClasses,
      })
    }

    // All requirements satisfied
    return buildEvaluation({
      bindingId,
      contractId,
      consumerId,
      releaseId,
      dependencyHash,
      policyResult: POLICY_RESULTS.POLICY_BOUND,
      policyClasses: [POLICY_CLASSES.POLICY_BINDING_SATISFIED],
    })
  }

  // Unknown dependency_result → NULL (fail closed)
  return buildEvaluation({
    bindingId,
    contractId,
    consumerId,
    releaseId,
    dependencyHash,
    policyResult: POLICY_RESULTS.NULL,
    policyClasses: [POLICY_CLASSES.POLICY_BOUNDARY_VIOLATION],
  })
}

// ── CLI runner ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const [dependencyEvidencePath, bindingPath] = positional

  if (!dependencyEvidencePath || !bindingPath) {
    console.error(
      'NULL — policy_boundary_violation: usage: release-provenance-policy-bindings.mjs <dependency_evaluation.json> <policy_binding.json>',
    )
    process.exit(1)
  }

  if (!existsSync(dependencyEvidencePath)) {
    console.error(
      `NULL — policy_boundary_violation: dependency evidence file not found: ${dependencyEvidencePath}`,
    )
    process.exit(1)
  }

  if (!existsSync(bindingPath)) {
    console.error(
      `NULL — policy_boundary_violation: policy binding file not found: ${bindingPath}`,
    )
    process.exit(1)
  }

  let dependencyEvidence
  try {
    dependencyEvidence = JSON.parse(readFileSync(dependencyEvidencePath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — policy_boundary_violation: failed to parse dependency evidence JSON: ${e.message}`,
    )
    process.exit(1)
  }

  let bindingObject
  try {
    bindingObject = JSON.parse(readFileSync(bindingPath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — policy_boundary_violation: failed to parse policy binding JSON: ${e.message}`,
    )
    process.exit(1)
  }

  const result = classifyPolicy(dependencyEvidence, bindingObject)

  console.log(JSON.stringify(result, null, 2))

  if (result.policy_result === POLICY_RESULTS.POLICY_BOUND) {
    process.exit(0)
  } else if (result.policy_result === POLICY_RESULTS.POLICY_REJECTED) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
