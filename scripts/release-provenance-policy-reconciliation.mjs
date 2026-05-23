/**
 * scripts/release-provenance-policy-reconciliation.mjs
 * Issue #1010 — RELEASE_PROVENANCE_POLICY_RECONCILIATION_V1
 *
 * Evidence only — compares distributed policy binding agreement deterministically.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate policy state, registries, dependency evidence, release state, or lineage.
 * Does not repair policy drift automatically.
 * Does not normalize BREAK_GLASS.
 *
 * Policy reconciliation compares whether policy binding states agree across
 * consumers, registries, and policy references — without treating agreement as authority.
 *
 * Exports pure functions for deterministic policy reconciliation evidence generation.
 * CLI: node scripts/release-provenance-policy-reconciliation.mjs <evaluations.json> [bindings.json]
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  canonicalJson,
  computePolicyHash,
  computeEvaluationHash,
} from './release-provenance-policy-bindings.mjs'

export const POLICY_RECONCILIATION_RESULTS = {
  POLICY_RECONCILED: 'POLICY_RECONCILED',
  POLICY_DRIFT_DETECTED: 'POLICY_DRIFT_DETECTED',
  NULL: 'NULL',
}

export const POLICY_RECONCILIATION_CLASSES = {
  POLICY_RECONCILIATION_SATISFIED: 'policy_reconciliation_satisfied',
  POLICY_BINDING_MISSING: 'policy_binding_missing',
  POLICY_REFERENCE_MISMATCH: 'policy_reference_mismatch',
  POLICY_EVALUATION_MISMATCH: 'policy_evaluation_mismatch',
  POLICY_HASH_MISMATCH: 'policy_hash_mismatch',
  POLICY_EVALUATION_HASH_MISMATCH: 'policy_evaluation_hash_mismatch',
  POLICY_LINEAGE_MUTATION: 'policy_lineage_mutation',
  POLICY_BOUNDARY_VIOLATION: 'policy_boundary_violation',
  POLICY_AUTHORITY_ATTEMPT: 'policy_authority_attempt',
  POLICY_PROOF_ATTEMPT: 'policy_proof_attempt',
  POLICY_EXECUTION_ATTEMPT: 'policy_execution_attempt',
  POLICY_DEPLOYMENT_ATTEMPT: 'policy_deployment_attempt',
  POLICY_BREAK_GLASS_NORMALIZATION: 'policy_break_glass_normalization',
  POLICY_RECONCILIATION_DRIFT: 'policy_reconciliation_drift',
}

const DISALLOWED_FIELDS = [
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

/**
 * Returns true if the hash is a valid 64-char lowercase hex SHA-256 string.
 */
function isValidHex64(hash) {
  if (typeof hash !== 'string') return false
  if (hash.length !== 64) return false
  return /^[0-9a-f]{64}$/.test(hash)
}

/**
 * Detects BREAK_GLASS normalization in a policy object.
 * Checks all known BREAK_GLASS indicator fields and class arrays.
 *
 * @param {object} obj
 * @returns {boolean}
 */
export function detectBreakGlassNormalization(obj) {
  if (!obj || typeof obj !== 'object') return false
  if (obj.break_glass === true) return true
  if (obj.is_break_glass === true) return true
  if (obj.break_glass_normalized === true) return true
  if (
    typeof obj.failure_class === 'string' &&
    obj.failure_class.toLowerCase().includes('break_glass')
  )
    return true
  for (const field of ['policy_classes', 'policy_reconciliation_classes', 'classes', 'dependency_classes']) {
    if (
      Array.isArray(obj[field]) &&
      obj[field].some((c) => typeof c === 'string' && c.toLowerCase().includes('break_glass'))
    )
      return true
  }
  return false
}

/**
 * Validates the evidence boundary invariants of any policy object.
 *
 * @param {object} obj
 * @returns {{ valid: boolean, violations: string[], authority_attempt: boolean, proof_attempt: boolean, execution_attempt: boolean, deployment_attempt: boolean }}
 */
export function validateBoundary(obj) {
  const violations = []
  let authority_attempt = false
  let proof_attempt = false
  let execution_attempt = false
  let deployment_attempt = false

  if (obj.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (obj.creates_authority === true) {
    violations.push('creates_authority must be false')
    authority_attempt = true
  } else if (obj.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (obj.creates_execution === true) {
    violations.push('creates_execution must be false')
    execution_attempt = true
  } else if (obj.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }
  if (obj.creates_proof === true) {
    violations.push('creates_proof must be false')
    proof_attempt = true
  } else if (obj.creates_proof !== false) {
    violations.push('creates_proof must be false')
  }

  for (const field of DISALLOWED_FIELDS) {
    if (field in obj) {
      violations.push(`disallowed field present: ${field}`)
      if (field === 'authority_grant') authority_attempt = true
      if (field === 'proof_signature') proof_attempt = true
      if (field === 'execution_token') execution_attempt = true
      if (
        field === 'deployment_trigger' ||
        field === 'deployment_token' ||
        field === 'deployment_capability'
      )
        deployment_attempt = true
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
 * Returns the most-specific NULL classification for a boundary validation result.
 */
function boundaryNullClass(boundary) {
  if (boundary.authority_attempt) return POLICY_RECONCILIATION_CLASSES.POLICY_AUTHORITY_ATTEMPT
  if (boundary.proof_attempt) return POLICY_RECONCILIATION_CLASSES.POLICY_PROOF_ATTEMPT
  if (boundary.execution_attempt) return POLICY_RECONCILIATION_CLASSES.POLICY_EXECUTION_ATTEMPT
  if (boundary.deployment_attempt) return POLICY_RECONCILIATION_CLASSES.POLICY_DEPLOYMENT_ATTEMPT
  return POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION
}

/**
 * Computes a deterministic SHA-256 policy reconciliation hash.
 *
 * Hash covers (all sorted before hashing):
 *   binding_ids, contract_ids, consumer_ids,
 *   policy_hashes, policy_evaluation_hashes,
 *   policy_reconciliation_result, policy_reconciliation_classes.
 *
 * policy_reconciliation_hash itself is excluded (avoids circularity).
 * Same reconciliation state always produces the same hash.
 * Reordered inputs preserve hash stability.
 *
 * @param {object} fields
 * @returns {string} hex SHA-256 digest
 */
export function computeReconciliationHash(fields) {
  const payload = {
    binding_ids: [...(fields.binding_ids ?? [])].sort(),
    consumer_ids: [...(fields.consumer_ids ?? [])].sort(),
    contract_ids: [...(fields.contract_ids ?? [])].sort(),
    policy_evaluation_hashes: [...(fields.policy_evaluation_hashes ?? [])].sort(),
    policy_hashes: [...(fields.policy_hashes ?? [])].sort(),
    policy_reconciliation_classes: [...(fields.policy_reconciliation_classes ?? [])].sort(),
    policy_reconciliation_result:
      fields.policy_reconciliation_result ?? POLICY_RECONCILIATION_RESULTS.NULL,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Normalizes policy evaluation evidence objects for deterministic comparison.
 * Sorts by consumer_id + binding_id key.
 * Returns a new array — does not mutate input.
 *
 * @param {object[]} evaluations
 * @returns {object[]}
 */
export function normalizeEvaluations(evaluations) {
  return [...evaluations].sort((a, b) => {
    const keyA = `${a.consumer_id ?? ''}\x00${a.binding_id ?? ''}`
    const keyB = `${b.consumer_id ?? ''}\x00${b.binding_id ?? ''}`
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
  })
}

/**
 * Normalizes policy binding objects for deterministic comparison.
 * Sorts by consumer_id + binding_id key.
 * Returns a new array — does not mutate input.
 *
 * @param {object[]} bindings
 * @returns {object[]}
 */
export function normalizeBindings(bindings) {
  return [...bindings].sort((a, b) => {
    const keyA = `${a.consumer_id ?? ''}\x00${a.binding_id ?? ''}`
    const keyB = `${b.consumer_id ?? ''}\x00${b.binding_id ?? ''}`
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
  })
}

/**
 * Builds the reconciliation evidence object.
 * Always sets evidence_only, creates_authority, creates_execution, creates_proof correctly.
 * Computes policy_reconciliation_hash deterministically.
 */
function buildEvidence(result, classes, bindingIds, contractIds, consumerIds, policyHashes, policyEvaluationHashes) {
  const hash = computeReconciliationHash({
    binding_ids: bindingIds,
    contract_ids: contractIds,
    consumer_ids: consumerIds,
    policy_hashes: policyHashes,
    policy_evaluation_hashes: policyEvaluationHashes,
    policy_reconciliation_result: result,
    policy_reconciliation_classes: classes,
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
    policy_evaluation_hashes: policyEvaluationHashes,
    policy_reconciliation_hash_alg: 'sha256',
    policy_reconciliation_hash: hash,
  }
}

/**
 * Reconciles policy binding states across consumers, registries, and policy references.
 *
 * Consumes two or more policy evaluation evidence objects (RELEASE_PROVENANCE_POLICY_EVALUATION).
 * Optionally consumes two or more policy binding objects (RELEASE_PROVENANCE_POLICY_BINDING).
 *
 * Deterministically classifies policy reconciliation without creating authority, proof,
 * execution capability, deployment triggers, or registry mutations.
 *
 * Policy reconciliation results:
 *   POLICY_RECONCILED     — all evaluations are POLICY_BOUND, all boundaries clean,
 *                           all hashes valid, bindings consistent where supplied
 *   POLICY_DRIFT_DETECTED — evaluations or bindings differ non-authoritatively:
 *                           any POLICY_REJECTED (clean), missing binding, reference mismatch
 *   NULL                  — integrity-breaking condition: NULL evaluation, boundary violation,
 *                           invalid hash, lineage mutation, BREAK_GLASS normalization,
 *                           authority/proof/execution/deployment attempt
 *
 * NULL always takes precedence over POLICY_DRIFT_DETECTED.
 * POLICY_DRIFT_DETECTED is not repaired — it is observed and classified only.
 *
 * @param {object[]} policyEvaluations - array of RELEASE_PROVENANCE_POLICY_EVALUATION objects
 * @param {object[]} [policyBindings]  - optional array of RELEASE_PROVENANCE_POLICY_BINDING objects
 * @returns {object} RELEASE_PROVENANCE_POLICY_RECONCILIATION evidence object
 */
export function reconcilePolicyBindings(policyEvaluations, policyBindings = []) {
  const nullClasses = new Set()
  const driftClasses = new Set()

  const bindingIdsSet = new Set()
  const contractIdsSet = new Set()
  const consumerIdsSet = new Set()
  const policyHashList = []
  const policyEvaluationHashList = []

  // ── Step 1: Minimum input requirement ─────────────────────────────────────

  if (!Array.isArray(policyEvaluations) || policyEvaluations.length < 2) {
    nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION)
    return buildEvidence(
      POLICY_RECONCILIATION_RESULTS.NULL,
      [...nullClasses].sort(),
      [],
      [],
      [],
      [],
      [],
    )
  }

  // ── Step 2: Validate each policy evaluation evidence object ────────────────

  for (const evaluation of policyEvaluations) {
    if (!evaluation || typeof evaluation !== 'object') {
      nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION)
      continue
    }

    // Collect IDs for evidence (from all inputs, including those with violations)
    if (evaluation.binding_id) bindingIdsSet.add(evaluation.binding_id)
    if (evaluation.contract_id) contractIdsSet.add(evaluation.contract_id)
    if (evaluation.consumer_id) consumerIdsSet.add(evaluation.consumer_id)

    // Boundary invariant check
    const boundary = validateBoundary(evaluation)
    if (!boundary.valid) {
      nullClasses.add(boundaryNullClass(boundary))
      continue
    }

    // BREAK_GLASS normalization detection
    if (detectBreakGlassNormalization(evaluation)) {
      nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION)
      continue
    }

    // NULL policy_result propagation — fail closed
    if (!evaluation.policy_result || evaluation.policy_result === 'NULL') {
      nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION)
      continue
    }

    // Validate policy_evaluation_hash integrity (if present)
    if (evaluation.policy_evaluation_hash !== undefined && evaluation.policy_evaluation_hash !== null) {
      if (!isValidHex64(evaluation.policy_evaluation_hash)) {
        nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH)
        continue
      }
      const recomputed = computeEvaluationHash({
        binding_id: evaluation.binding_id ?? null,
        contract_id: evaluation.contract_id ?? null,
        consumer_id: evaluation.consumer_id ?? null,
        release_id: evaluation.release_id ?? null,
        dependency_hash: evaluation.dependency_hash ?? null,
        policy_result: evaluation.policy_result,
        policy_classes: evaluation.policy_classes ?? [],
      })
      if (evaluation.policy_evaluation_hash !== recomputed) {
        nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_HASH_MISMATCH)
        continue
      }
      policyEvaluationHashList.push(evaluation.policy_evaluation_hash)
    }

    // POLICY_REJECTED with clean boundary → observable drift
    if (evaluation.policy_result === 'POLICY_REJECTED') {
      driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_EVALUATION_MISMATCH)
      driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT)
    }
  }

  // ── Step 3: Validate each policy binding object ────────────────────────────

  const validBindingMap = new Map() // consumer_id → validated binding

  for (const binding of policyBindings) {
    if (!binding || typeof binding !== 'object') {
      nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BOUNDARY_VIOLATION)
      continue
    }

    if (binding.binding_id) bindingIdsSet.add(binding.binding_id)
    if (binding.contract_id) contractIdsSet.add(binding.contract_id)

    // Boundary invariant check
    const boundary = validateBoundary(binding)
    if (!boundary.valid) {
      nullClasses.add(boundaryNullClass(boundary))
      continue
    }

    // BREAK_GLASS normalization detection
    if (detectBreakGlassNormalization(binding)) {
      nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BREAK_GLASS_NORMALIZATION)
      continue
    }

    // Validate policy_hash integrity (if present)
    if (binding.policy_hash !== undefined && binding.policy_hash !== null) {
      if (!isValidHex64(binding.policy_hash)) {
        nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_HASH_MISMATCH)
        continue
      }
      const recomputed = computePolicyHash(binding)
      if (binding.policy_hash !== recomputed) {
        // Valid format but wrong value — lineage mutation detected
        nullClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_LINEAGE_MUTATION)
        continue
      }
      policyHashList.push(binding.policy_hash)
    }

    if (binding.consumer_id) validBindingMap.set(binding.consumer_id, binding)
  }

  // ── Step 4: Check binding coverage across consumers ────────────────────────

  if (policyBindings.length > 0) {
    for (const consumerId of consumerIdsSet) {
      if (!validBindingMap.has(consumerId)) {
        driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_BINDING_MISSING)
        driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT)
      }
    }
  }

  // ── Step 5: Compare binding references across valid bindings ───────────────

  const validBindings = [...validBindingMap.values()]
  if (validBindings.length >= 2) {
    for (const field of [
      'external_policy_reference',
      'human_approval_reference',
      'deployment_authority_reference',
    ]) {
      const values = new Set(validBindings.map((b) => b[field] ?? null))
      if (values.size > 1) {
        driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_REFERENCE_MISMATCH)
        driftClasses.add(POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_DRIFT)
      }
    }
  }

  // ── Step 6: Determine final reconciliation result ──────────────────────────

  const bindingIds = [...bindingIdsSet].sort()
  const contractIds = [...contractIdsSet].sort()
  const consumerIds = [...consumerIdsSet].sort()
  const policyHashes = [...policyHashList].sort()
  const policyEvaluationHashes = [...policyEvaluationHashList].sort()

  let result
  let finalClasses

  if (nullClasses.size > 0) {
    // NULL takes precedence over all drift conditions
    result = POLICY_RECONCILIATION_RESULTS.NULL
    finalClasses = [...nullClasses].sort()
  } else if (driftClasses.size > 0) {
    result = POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED
    finalClasses = [...driftClasses].sort()
  } else {
    result = POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED
    finalClasses = [POLICY_RECONCILIATION_CLASSES.POLICY_RECONCILIATION_SATISFIED]
  }

  return buildEvidence(
    result,
    finalClasses,
    bindingIds,
    contractIds,
    consumerIds,
    policyHashes,
    policyEvaluationHashes,
  )
}

// ── CLI runner ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const [evaluationsPath, bindingsPath] = positional

  if (!evaluationsPath) {
    console.error(
      'NULL — policy_boundary_violation: usage: release-provenance-policy-reconciliation.mjs <evaluations.json> [bindings.json]',
    )
    process.exit(1)
  }

  if (!existsSync(evaluationsPath)) {
    console.error(
      `NULL — policy_boundary_violation: evaluations file not found: ${evaluationsPath}`,
    )
    process.exit(1)
  }

  let evaluationsRaw
  try {
    evaluationsRaw = JSON.parse(readFileSync(evaluationsPath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — policy_boundary_violation: failed to parse evaluations JSON: ${e.message}`,
    )
    process.exit(1)
  }

  const policyEvaluations = Array.isArray(evaluationsRaw)
    ? evaluationsRaw
    : Array.isArray(evaluationsRaw?.evaluations)
      ? evaluationsRaw.evaluations
      : null

  if (!policyEvaluations) {
    console.error(
      'NULL — policy_boundary_violation: evaluations must be a JSON array or object with "evaluations" key',
    )
    process.exit(1)
  }

  let policyBindings = []

  if (bindingsPath) {
    if (!existsSync(bindingsPath)) {
      console.error(
        `NULL — policy_boundary_violation: bindings file not found: ${bindingsPath}`,
      )
      process.exit(1)
    }

    let bindingsRaw
    try {
      bindingsRaw = JSON.parse(readFileSync(bindingsPath, 'utf8'))
    } catch (e) {
      console.error(
        `NULL — policy_boundary_violation: failed to parse bindings JSON: ${e.message}`,
      )
      process.exit(1)
    }

    policyBindings = Array.isArray(bindingsRaw)
      ? bindingsRaw
      : Array.isArray(bindingsRaw?.bindings)
        ? bindingsRaw.bindings
        : null

    if (!policyBindings) {
      console.error(
        'NULL — policy_boundary_violation: bindings must be a JSON array or object with "bindings" key',
      )
      process.exit(1)
    }
  }

  const evidence = reconcilePolicyBindings(policyEvaluations, policyBindings)

  console.log(JSON.stringify(evidence, null, 2))

  if (evidence.policy_reconciliation_result === POLICY_RECONCILIATION_RESULTS.POLICY_RECONCILED) {
    process.exit(0)
  } else if (
    evidence.policy_reconciliation_result === POLICY_RECONCILIATION_RESULTS.POLICY_DRIFT_DETECTED
  ) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
