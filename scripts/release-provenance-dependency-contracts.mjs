/**
 * scripts/release-provenance-dependency-contracts.mjs
 * Issue #1006 — RELEASE_PROVENANCE_DEPENDENCY_CONTRACTS_V1
 *
 * Evidence only — classifies deterministic dependency contracts for
 * downstream systems consuming release provenance evidence.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate source registries. Does not rewrite lineage.
 * Does not repair ancestry automatically. Does not normalize BREAK_GLASS.
 *
 * Dependency contracts define who may rely on evidence under
 * non-authoritative constraints. They do not turn evidence into authority.
 *
 * Exports pure functions for dependency contract evaluation.
 * CLI: node scripts/release-provenance-dependency-contracts.mjs <consumption_evidence.json> <contract.json> [--external-policy-satisfied] [--human-approval-satisfied] [--deployment-authority-satisfied] [--requested-use <use>]
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const DEPENDENCY_RESULTS = {
  DEPENDENCY_SATISFIED: 'DEPENDENCY_SATISFIED',
  DEPENDENCY_REJECTED: 'DEPENDENCY_REJECTED',
  NULL: 'NULL',
}

export const DEPENDENCY_CLASSES = {
  DEPENDENCY_CONTRACT_SATISFIED: 'dependency_contract_satisfied',
  DEPENDENCY_CONSUMPTION_NOT_ACCEPTED: 'dependency_consumption_not_accepted',
  DEPENDENCY_EXTERNAL_POLICY_MISSING: 'dependency_external_policy_missing',
  DEPENDENCY_HUMAN_APPROVAL_MISSING: 'dependency_human_approval_missing',
  DEPENDENCY_DEPLOYMENT_AUTHORITY_MISSING: 'dependency_deployment_authority_missing',
  DEPENDENCY_ALLOWED_USE_MISMATCH: 'dependency_allowed_use_mismatch',
  DEPENDENCY_BOUNDARY_VIOLATION: 'dependency_boundary_violation',
  DEPENDENCY_AUTHORITY_ATTEMPT: 'dependency_authority_attempt',
  DEPENDENCY_PROOF_ATTEMPT: 'dependency_proof_attempt',
  DEPENDENCY_EXECUTION_ATTEMPT: 'dependency_execution_attempt',
  DEPENDENCY_DEPLOYMENT_ATTEMPT: 'dependency_deployment_attempt',
  DEPENDENCY_HASH_INVALID: 'dependency_hash_invalid',
  DEPENDENCY_BREAK_GLASS_NORMALIZATION: 'dependency_break_glass_normalization',
}

const CONSUMPTION_RESULTS = {
  CONSUMABLE_EVIDENCE: 'CONSUMABLE_EVIDENCE',
  REJECTED: 'REJECTED',
  NULL: 'NULL',
}

// Fields that indicate contract boundary violation attempts
const DISALLOWED_CONTRACT_FIELDS = [
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
]

// Fields that indicate consumption evidence boundary violations
const DISALLOWED_CONSUMPTION_FIELDS = [
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
 * Computes a deterministic SHA-256 contract hash over canonical contract fields.
 *
 * Hash covers: artifact, contract_id, consumer_id, evidence_only,
 * creates_authority, creates_execution, creates_proof,
 * required_consumption_result, requires_external_policy,
 * requires_human_approval, requires_deployment_authority, allowed_use.
 *
 * contract_hash itself is excluded (avoids circularity).
 *
 * @param {object} contractFields
 * @returns {string} hex SHA-256 digest
 */
export function computeContractHash(contractFields) {
  const payload = {
    allowed_use: contractFields.allowed_use ?? null,
    artifact: contractFields.artifact ?? null,
    consumer_id: contractFields.consumer_id ?? null,
    contract_id: contractFields.contract_id ?? null,
    creates_authority: contractFields.creates_authority ?? null,
    creates_execution: contractFields.creates_execution ?? null,
    creates_proof: contractFields.creates_proof ?? null,
    evidence_only: contractFields.evidence_only ?? null,
    required_consumption_result: contractFields.required_consumption_result ?? null,
    requires_deployment_authority: contractFields.requires_deployment_authority ?? null,
    requires_external_policy: contractFields.requires_external_policy ?? null,
    requires_human_approval: contractFields.requires_human_approval ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Computes a deterministic SHA-256 dependency evaluation hash.
 *
 * Hash covers: contract_id, consumer_id, release_id, consumption_hash,
 * dependency_result, sorted dependency_classes.
 *
 * dependency_hash itself is excluded (avoids circularity).
 *
 * Same dependency state always produces the same hash.
 *
 * @param {object} dependencyState
 * @returns {string} hex SHA-256 digest
 */
export function computeDependencyHash(dependencyState) {
  const payload = {
    consumption_hash: dependencyState.consumption_hash ?? null,
    contract_id: dependencyState.contract_id ?? null,
    consumer_id: dependencyState.consumer_id ?? null,
    dependency_classes: [...(dependencyState.dependency_classes ?? [])].sort(),
    dependency_result: dependencyState.dependency_result ?? DEPENDENCY_RESULTS.NULL,
    release_id: dependencyState.release_id ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Validates the evidence boundary invariants of a dependency contract object.
 *
 * Contract must always preserve:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *   - creates_proof: false
 *
 * Contract must not contain fields implying authority creation, proof creation,
 * execution authorization, deployment triggers, or registry mutation.
 *
 * @param {object} contractObject
 * @returns {{ valid: boolean, violations: string[], authority_attempt: boolean, proof_attempt: boolean, execution_attempt: boolean, deployment_attempt: boolean }}
 */
export function validateContractBoundary(contractObject) {
  const violations = []
  let authority_attempt = false
  let proof_attempt = false
  let execution_attempt = false
  let deployment_attempt = false

  if (contractObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (contractObject.creates_authority === true) {
    violations.push('creates_authority must be false')
    authority_attempt = true
  } else if (contractObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (contractObject.creates_execution === true) {
    violations.push('creates_execution must be false')
    execution_attempt = true
  } else if (contractObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }
  if (contractObject.creates_proof === true) {
    violations.push('creates_proof must be false')
    proof_attempt = true
  } else if (contractObject.creates_proof !== false) {
    violations.push('creates_proof must be false')
  }

  for (const field of DISALLOWED_CONTRACT_FIELDS) {
    if (field in contractObject) {
      violations.push(`disallowed field present: ${field}`)
      if (field === 'authority_grant') authority_attempt = true
      if (field === 'proof_signature') proof_attempt = true
      if (field === 'execution_token') execution_attempt = true
      if (field === 'deployment_trigger' || field === 'deployment_token' || field === 'deployment_capability') {
        deployment_attempt = true
      }
    }
  }

  return { valid: violations.length === 0, violations, authority_attempt, proof_attempt, execution_attempt, deployment_attempt }
}

/**
 * Validates the evidence boundary invariants of a consumption evidence object.
 *
 * Consumption evidence must preserve evidence-only semantics.
 *
 * @param {object} evidenceObject
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateConsumptionBoundary(evidenceObject) {
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

  for (const field of DISALLOWED_CONSUMPTION_FIELDS) {
    if (field in evidenceObject) {
      violations.push(`disallowed field present: ${field}`)
    }
  }

  return { valid: violations.length === 0, violations }
}

/**
 * Validates that a consumption hash is a valid 64-char lowercase hex string.
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
 * Detects BREAK_GLASS normalization in consumption evidence.
 * A consumption evidence is considered BREAK_GLASS-normalized when:
 * - is_break_glass: true is present
 * - break_glass_normalized: true is present
 * - failure_class includes 'break_glass'
 *
 * @param {object} consumptionEvidence
 * @returns {boolean}
 */
function detectBreakGlassNormalization(consumptionEvidence) {
  if (consumptionEvidence.is_break_glass === true) return true
  if (consumptionEvidence.break_glass_normalized === true) return true
  if (typeof consumptionEvidence.failure_class === 'string' &&
    consumptionEvidence.failure_class.toLowerCase().includes('break_glass')) return true
  return false
}

/**
 * Builds a dependency evaluation evidence object.
 * Always sets evidence_only, creates_authority, creates_execution, creates_proof correctly.
 * Computes dependency_hash deterministically.
 *
 * @param {object} fields - named fields for the evaluation
 * @returns {object} RELEASE_PROVENANCE_DEPENDENCY_EVALUATION evidence object
 */
function buildEvaluation(fields) {
  const {
    contractId,
    consumerId,
    releaseId,
    consumptionHash,
    dependencyResult,
    dependencyClasses,
  } = fields

  const state = {
    contract_id: contractId,
    consumer_id: consumerId,
    release_id: releaseId,
    consumption_hash: consumptionHash,
    dependency_result: dependencyResult,
    dependency_classes: dependencyClasses,
  }

  return {
    artifact: 'RELEASE_PROVENANCE_DEPENDENCY_EVALUATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    contract_id: contractId,
    consumer_id: consumerId,
    release_id: releaseId,
    consumption_hash: consumptionHash,
    dependency_result: dependencyResult,
    dependency_classes: dependencyClasses,
    dependency_hash_alg: 'sha256',
    dependency_hash: computeDependencyHash(state),
  }
}

/**
 * Classifies dependency contract satisfaction for release provenance consumption.
 *
 * Consumes release provenance consumption evidence and a dependency contract.
 * Deterministically classifies dependency satisfaction without creating authority,
 * proof, execution capability, deployment triggers, or registry mutations.
 *
 * Dependency results:
 *   DEPENDENCY_SATISFIED — consumption_result is CONSUMABLE_EVIDENCE, contract boundary valid,
 *                          consumption boundary valid, all required flags satisfied,
 *                          contract does not attempt authority/proof/execution/deployment creation
 *   DEPENDENCY_REJECTED  — consumption evidence is valid but contract prerequisites are incomplete
 *   NULL                 — consumption evidence is NULL, boundary violated, contract invalid,
 *                          BREAK_GLASS normalization detected, or hash invalid
 *
 * @param {object|null} consumptionEvidence - output of #1004 consumption boundary classification
 * @param {object|null} contractObject - dependency contract to evaluate
 * @param {object} [options]
 * @param {boolean} [options.externalPolicySatisfied] - satisfies requires_external_policy
 * @param {boolean} [options.humanApprovalSatisfied] - satisfies requires_human_approval
 * @param {boolean} [options.deploymentAuthoritySatisfied] - satisfies requires_deployment_authority
 * @param {string} [options.requestedUse] - use being requested; checked against allowed_use
 * @returns {object} RELEASE_PROVENANCE_DEPENDENCY_EVALUATION evidence object
 */
export function classifyDependency(consumptionEvidence, contractObject, options = {}) {
  const {
    externalPolicySatisfied = false,
    humanApprovalSatisfied = false,
    deploymentAuthoritySatisfied = false,
    requestedUse = null,
  } = options

  // Extract stable identifiers for building evaluation objects
  const contractId = contractObject?.contract_id ?? null
  const consumerId = contractObject?.consumer_id ?? null
  const nullConsumptionHash = null

  // ── Contract must exist ──────────────────────────────────────────────────────

  if (contractObject === null || contractObject === undefined) {
    return buildEvaluation({
      contractId: null,
      consumerId: null,
      releaseId: null,
      consumptionHash: nullConsumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION],
    })
  }

  // ── Validate contract boundary ───────────────────────────────────────────────

  const contractBoundary = validateContractBoundary(contractObject)

  if (!contractBoundary.valid) {
    const classes = []

    if (contractBoundary.authority_attempt) {
      classes.push(DEPENDENCY_CLASSES.DEPENDENCY_AUTHORITY_ATTEMPT)
    }
    if (contractBoundary.proof_attempt) {
      classes.push(DEPENDENCY_CLASSES.DEPENDENCY_PROOF_ATTEMPT)
    }
    if (contractBoundary.execution_attempt) {
      classes.push(DEPENDENCY_CLASSES.DEPENDENCY_EXECUTION_ATTEMPT)
    }
    if (contractBoundary.deployment_attempt) {
      classes.push(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_ATTEMPT)
    }
    // Add boundary violation if no more specific class was added
    if (classes.length === 0) {
      classes.push(DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION)
    }

    return buildEvaluation({
      contractId,
      consumerId,
      releaseId: null,
      consumptionHash: nullConsumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: classes,
    })
  }

  // ── Validate contract hash ───────────────────────────────────────────────────

  if (contractObject.contract_hash !== undefined && contractObject.contract_hash !== null) {
    const expectedHash = computeContractHash(contractObject)
    const providedHash = contractObject.contract_hash

    if (!isValidHex64(providedHash) || providedHash !== expectedHash) {
      return buildEvaluation({
        contractId,
        consumerId,
        releaseId: null,
        consumptionHash: nullConsumptionHash,
        dependencyResult: DEPENDENCY_RESULTS.NULL,
        dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID],
      })
    }
  }

  // ── Consumption evidence must exist ─────────────────────────────────────────

  if (consumptionEvidence === null || consumptionEvidence === undefined) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId: null,
      consumptionHash: nullConsumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [],
    })
  }

  const releaseId = consumptionEvidence.release_id ?? null
  const consumptionHash = consumptionEvidence.consumption_hash ?? null

  // ── Validate consumption evidence boundary ───────────────────────────────────

  const consumptionBoundary = validateConsumptionBoundary(consumptionEvidence)

  if (!consumptionBoundary.valid) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION],
    })
  }

  // ── Detect BREAK_GLASS normalization ─────────────────────────────────────────

  if (detectBreakGlassNormalization(consumptionEvidence)) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_BREAK_GLASS_NORMALIZATION],
    })
  }

  // ── Validate consumption hash ────────────────────────────────────────────────

  if (consumptionHash !== null && !isValidHex64(consumptionHash)) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_HASH_INVALID],
    })
  }

  // ── Handle consumption_result ────────────────────────────────────────────────

  const consumptionResult = consumptionEvidence.consumption_result

  if (consumptionResult === CONSUMPTION_RESULTS.NULL || !consumptionResult) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.NULL,
      dependencyClasses: [],
    })
  }

  if (consumptionResult === CONSUMPTION_RESULTS.REJECTED) {
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.DEPENDENCY_REJECTED,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_CONSUMPTION_NOT_ACCEPTED],
    })
  }

  // ── CONSUMABLE_EVIDENCE: check contract requirements ─────────────────────────

  if (consumptionResult === CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE) {
    const rejectionClasses = []

    // Check external policy requirement
    if (contractObject.requires_external_policy === true && !externalPolicySatisfied) {
      rejectionClasses.push(DEPENDENCY_CLASSES.DEPENDENCY_EXTERNAL_POLICY_MISSING)
    }

    // Check human approval requirement
    if (contractObject.requires_human_approval === true && !humanApprovalSatisfied) {
      rejectionClasses.push(DEPENDENCY_CLASSES.DEPENDENCY_HUMAN_APPROVAL_MISSING)
    }

    // Check deployment authority requirement
    if (contractObject.requires_deployment_authority === true && !deploymentAuthoritySatisfied) {
      rejectionClasses.push(DEPENDENCY_CLASSES.DEPENDENCY_DEPLOYMENT_AUTHORITY_MISSING)
    }

    // Check allowed_use mismatch
    if (requestedUse !== null && requestedUse !== undefined) {
      const allowedUse = contractObject.allowed_use ?? ''
      const allowedList = allowedUse.split('|').map((s) => s.trim()).filter(Boolean)
      if (!allowedList.includes(requestedUse)) {
        rejectionClasses.push(DEPENDENCY_CLASSES.DEPENDENCY_ALLOWED_USE_MISMATCH)
      }
    }

    if (rejectionClasses.length > 0) {
      return buildEvaluation({
        contractId,
        consumerId,
        releaseId,
        consumptionHash,
        dependencyResult: DEPENDENCY_RESULTS.DEPENDENCY_REJECTED,
        dependencyClasses: rejectionClasses,
      })
    }

    // All requirements satisfied
    return buildEvaluation({
      contractId,
      consumerId,
      releaseId,
      consumptionHash,
      dependencyResult: DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED,
      dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_CONTRACT_SATISFIED],
    })
  }

  // Unknown consumption_result → NULL (fail closed)
  return buildEvaluation({
    contractId,
    consumerId,
    releaseId,
    consumptionHash,
    dependencyResult: DEPENDENCY_RESULTS.NULL,
    dependencyClasses: [DEPENDENCY_CLASSES.DEPENDENCY_BOUNDARY_VIOLATION],
  })
}

// ── Required export compatibility names (Issue #1006 spec) ─────────────────

export const ALLOWED_DEPENDENCY_USES = {
  OBSERVE: 'OBSERVE',
  AUDIT: 'AUDIT',
  PACKAGE_METADATA: 'PACKAGE_METADATA',
  DEPLOYMENT_INPUT_EVIDENCE: 'DEPLOYMENT_INPUT_EVIDENCE',
}

/**
 * Builds a RELEASE_PROVENANCE_DEPENDENCY_CONTRACT object with a computed contract_hash.
 * All evidence-only invariants are fixed. contract_hash is computed over canonical fields.
 *
 * @param {object} [params]
 * @returns {object} dependency contract object
 */
export function buildDependencyContract({
  contract_id = null,
  consumer_id = null,
  requires_external_policy = false,
  requires_human_approval = false,
  requires_deployment_authority = false,
  allowed_use = 'OBSERVE | AUDIT | PACKAGE_METADATA | DEPLOYMENT_INPUT_EVIDENCE',
} = {}) {
  const base = {
    artifact: 'RELEASE_PROVENANCE_DEPENDENCY_CONTRACT',
    contract_id,
    consumer_id,
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    required_consumption_result: 'CONSUMABLE_EVIDENCE',
    requires_external_policy,
    requires_human_approval,
    requires_deployment_authority,
    allowed_use,
    contract_hash_alg: 'sha256',
  }
  return { ...base, contract_hash: computeContractHash(base) }
}

export const evaluateDependencyContract = classifyDependency
export const validateDependencyBoundary = validateContractBoundary

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)

  const externalPolicySatisfied = args.includes('--external-policy-satisfied')
  const humanApprovalSatisfied = args.includes('--human-approval-satisfied')
  const deploymentAuthoritySatisfied = args.includes('--deployment-authority-satisfied')

  let requestedUse = null
  const useIdx = args.indexOf('--requested-use')
  if (useIdx !== -1 && args[useIdx + 1]) {
    requestedUse = args[useIdx + 1]
  }

  const positional = args.filter((a) => !a.startsWith('--') && a !== requestedUse)
  const [consumptionEvidencePath, contractPath] = positional

  if (!consumptionEvidencePath || !contractPath) {
    console.error(
      'NULL — dependency_boundary_violation: usage: release-provenance-dependency-contracts.mjs <consumption_evidence.json> <contract.json> [--external-policy-satisfied] [--human-approval-satisfied] [--deployment-authority-satisfied] [--requested-use <use>]',
    )
    process.exit(1)
  }

  if (!existsSync(consumptionEvidencePath)) {
    console.error(`NULL — dependency_boundary_violation: consumption evidence file not found: ${consumptionEvidencePath}`)
    process.exit(1)
  }

  if (!existsSync(contractPath)) {
    console.error(`NULL — dependency_boundary_violation: contract file not found: ${contractPath}`)
    process.exit(1)
  }

  let consumptionEvidence
  try {
    consumptionEvidence = JSON.parse(readFileSync(consumptionEvidencePath, 'utf8'))
  } catch (e) {
    console.error(`NULL — dependency_boundary_violation: failed to parse consumption evidence JSON: ${e.message}`)
    process.exit(1)
  }

  let contractObject
  try {
    contractObject = JSON.parse(readFileSync(contractPath, 'utf8'))
  } catch (e) {
    console.error(`NULL — dependency_boundary_violation: failed to parse contract JSON: ${e.message}`)
    process.exit(1)
  }

  const result = classifyDependency(consumptionEvidence, contractObject, {
    externalPolicySatisfied,
    humanApprovalSatisfied,
    deploymentAuthoritySatisfied,
    requestedUse,
  })

  console.log(JSON.stringify(result, null, 2))

  if (result.dependency_result === DEPENDENCY_RESULTS.DEPENDENCY_SATISFIED) {
    process.exit(0)
  } else if (result.dependency_result === DEPENDENCY_RESULTS.DEPENDENCY_REJECTED) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
