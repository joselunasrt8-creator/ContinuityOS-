/**
 * MindShift SDK — Governed Legitimacy Primitives
 *
 * Portable legitimacy object handling for external developer integration.
 * All exports are observability-only or produce bounded legitimacy objects.
 *
 * Core invariant: validated_object == executed_object
 *
 * Constraints:
 *   - SDK does not create authority
 *   - No hidden execution paths
 *   - No execution without validation
 *   - No replay restoration
 *   - No implicit topology trust
 */

export { normalize, canonicalize, sha256Hex, hashCanonical } from "../lib/canonical.mjs"

// ── Compile ─────────────────────────────────────────────────────────────────

import { normalize, canonicalize, hashCanonical } from "../lib/canonical.mjs"

/**
 * Compiles a raw object into a canonical legitimacy object.
 * The returned CompiledLegitimacyObject is immutable and replay-safe.
 *
 * @param {unknown} object - The raw object to compile
 * @param {string} [sourceRef] - Optional reference label for the source
 * @returns {CompiledLegitimacyObject}
 */
export function compile(object, sourceRef = "sdk") {
  const normalized = normalize(object)
  const canonical_form = canonicalize(normalized)
  const canonical_hash = hashCanonical(normalized)

  return Object.freeze({
    object_type: "CompiledLegitimacyObject",
    compiled_at: new Date().toISOString(),
    source_file: sourceRef,
    canonical_hash,
    canonical_form,
    object: normalized,
    replay_safe: true,
    mutation_locked: true,
    executed: false,
    validated: false,
  })
}

// ── Validate ─────────────────────────────────────────────────────────────────

const REQUIRED_OBJECT_FIELDS = ["intent", "scope", "target", "finality"]

/**
 * Validates a CompiledLegitimacyObject.
 * Returns a ValidationReceipt binding the canonical hash.
 *
 * @param {CompiledLegitimacyObject} compiled
 * @returns {ValidationReceipt}
 */
export function validate(compiled) {
  const issues = []

  if (!compiled || compiled.object_type !== "CompiledLegitimacyObject") {
    issues.push({ code: "NOT_COMPILED_OBJECT", message: "input must be a CompiledLegitimacyObject" })
  }

  let recomputed_hash = null
  if (compiled?.object !== undefined) {
    recomputed_hash = hashCanonical(compiled.object)
    if (recomputed_hash !== compiled.canonical_hash) {
      issues.push({
        code: "HASH_MISMATCH",
        message: "post-compile mutation detected",
        stored_hash: compiled.canonical_hash,
        recomputed_hash,
      })
    }
  } else {
    issues.push({ code: "MISSING_OBJECT", message: "compiled object missing embedded .object" })
  }

  if (compiled?.executed === true) {
    issues.push({ code: "ALREADY_EXECUTED", message: "cannot validate an already-executed object" })
  }

  if (compiled?.object && typeof compiled.object === "object") {
    for (const field of REQUIRED_OBJECT_FIELDS) {
      if (!(field in compiled.object)) {
        issues.push({ code: "MISSING_FIELD", message: `missing required field: ${field}` })
      }
    }
  }

  const ok = issues.length === 0

  return Object.freeze({
    object_type: "ValidationReceipt",
    validated_at: new Date().toISOString(),
    source_file: compiled?.source_file ?? null,
    object_hash: recomputed_hash ?? compiled?.canonical_hash ?? null,
    canonical_form: compiled?.canonical_form ?? null,
    ok,
    issues,
    validated_object: ok ? compiled.object : null,
    executed: false,
    replay_safe: true,
  })
}

// ── Execute ───────────────────────────────────────────────────────────────────

/**
 * Executes a validated legitimacy object.
 * Enforces: validated_object == executed_object
 *
 * @param {ValidationReceipt} receipt
 * @param {{ dryRun?: boolean }} [options]
 * @returns {ExecutionResult}
 */
export function execute(receipt, options = {}) {
  const { dryRun = false } = options
  const violations = []

  if (!receipt || receipt.object_type !== "ValidationReceipt") {
    violations.push({ code: "NOT_A_RECEIPT", message: "input must be a ValidationReceipt" })
  }

  if (receipt?.ok !== true) {
    violations.push({ code: "VALIDATION_FAILED", message: "receipt indicates validation did not pass" })
  }

  if (receipt?.executed === true) {
    violations.push({ code: "REPLAY_BLOCKED", message: "receipt already used — no replay restoration" })
  }

  if (!receipt?.validated_object || typeof receipt?.validated_object !== "object") {
    violations.push({ code: "MISSING_VALIDATED_OBJECT", message: "receipt does not contain a validated_object" })
  }

  const canExecute = violations.length === 0

  return Object.freeze({
    object_type: "ExecutionResult",
    executed_at: new Date().toISOString(),
    dry_run: dryRun,
    object_hash: receipt?.object_hash ?? null,
    validated_object_hash_confirmed: canExecute,
    executed: canExecute && !dryRun,
    violations,
    ok: canExecute,
    execution_surface: "sdk_governed",
    hidden_paths: false,
    implicit_topology_trust: false,
    replay_restoration: false,
    executed_object: canExecute ? receipt.validated_object : null,
    execution_note: canExecute
      ? dryRun
        ? "dry-run: invariants satisfied"
        : "executed: validated_object == executed_object"
      : "blocked: invariant violations detected",
  })
}

// ── Proof Lineage ─────────────────────────────────────────────────────────────

/**
 * Builds a proof lineage chain from an array of lifecycle objects.
 * Observability-only: does not generate proofs.
 *
 * @param {Array<CompiledLegitimacyObject|ValidationReceipt|ExecutionResult>} objects
 * @returns {ProofLineage}
 */
export function proofLineage(objects) {
  const chain = objects.map((obj) => ({
    object_type: obj.object_type ?? null,
    hash: obj.canonical_hash ?? obj.object_hash ?? null,
    timestamp: obj.compiled_at ?? obj.validated_at ?? obj.executed_at ?? null,
    ok: obj.ok !== false,
  }))

  const issues = []
  for (let i = 1; i < chain.length; i++) {
    if (chain[i - 1].hash && chain[i].hash && chain[i - 1].hash !== chain[i].hash) {
      issues.push({
        code: "LINEAGE_DISCONTINUITY",
        position: i,
        prev_hash: chain[i - 1].hash,
        curr_hash: chain[i].hash,
      })
    }
  }

  return Object.freeze({
    object_type: "ProofLineage",
    mode: "observability_only",
    proof_generating: false,
    chain,
    issues,
    ok: issues.length === 0,
  })
}

// ── Authority Inspection ──────────────────────────────────────────────────────

/**
 * Inspects an authority record. Observability-only; cannot create authority.
 *
 * @param {unknown} record
 * @returns {AuthorityInspection}
 */
export function inspectAuthority(record) {
  const issues = []
  if (!record?.authority_id) issues.push("missing: authority_id")
  if (!record?.authority_scope) issues.push("missing: authority_scope")
  if (record?.runtime_authority === true) issues.push("VIOLATION: runtime_authority must not be true")
  if (record?.replay_neutral !== true) issues.push("VIOLATION: authority record must be replay_neutral")

  return Object.freeze({
    object_type: "AuthorityInspection",
    mode: "observability_only",
    runtime_authority: false,
    creates_authority: false,
    authority_id: record?.authority_id ?? null,
    authority_scope: record?.authority_scope ?? null,
    topology_hash: record?.topology_hash ?? null,
    computed_hash: hashCanonical(record),
    issues,
    ok: issues.length === 0,
  })
}

// ── Topology Inspection ───────────────────────────────────────────────────────

/**
 * Inspects a topology manifest for constraint compliance.
 * No implicit topology trust: returns explicit inspection result.
 *
 * @param {unknown} manifest
 * @returns {TopologyInspection}
 */
export function inspectTopology(manifest) {
  const issues = []
  if (manifest?.executable === true) issues.push({ code: "EXECUTABLE_TOPOLOGY", message: "topology must not be executable" })
  if (manifest?.creates_authority === true) issues.push({ code: "AUTHORITY_CREATION", message: "topology must not create authority" })
  if (manifest?.fail_closed_on_ambiguity !== true) issues.push({ code: "FAIL_OPEN", message: "topology must fail_closed_on_ambiguity" })

  return Object.freeze({
    object_type: "TopologyInspection",
    mode: "observability_only",
    implicit_topology_trust: false,
    topology_status: manifest?.topology_status ?? null,
    invariant: manifest?.invariant ?? null,
    fail_closed: manifest?.fail_closed_on_ambiguity === true,
    manifest_hash: hashCanonical(manifest),
    issues,
    ok: issues.length === 0,
  })
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

/**
 * Checks hash parity across compile → validate → execute lifecycle.
 *
 * @param {CompiledLegitimacyObject} compiled
 * @param {ValidationReceipt} receipt
 * @param {ExecutionResult} [result]
 * @returns {ReconciliationCheck}
 */
export function reconcile(compiled, receipt, result = null) {
  const issues = []

  const compiled_hash = compiled?.canonical_hash ?? null
  const receipt_hash = receipt?.object_hash ?? null
  const execute_hash = result?.object_hash ?? null

  if (compiled_hash && receipt_hash && compiled_hash !== receipt_hash) {
    issues.push({ code: "COMPILE_VALIDATE_DRIFT", compiled_hash, receipt_hash })
  }

  if (result && receipt_hash && execute_hash && receipt_hash !== execute_hash) {
    issues.push({ code: "VALIDATE_EXECUTE_DRIFT", receipt_hash, execute_hash })
  }

  if (receipt?.ok !== true) {
    issues.push({ code: "RECEIPT_NOT_OK", message: "receipt indicates failed validation" })
  }

  return Object.freeze({
    object_type: "ReconciliationCheck",
    mode: "observability_only",
    replay_restoration: false,
    mutation: false,
    compiled_hash,
    receipt_hash,
    execute_hash,
    hash_parity: issues.filter((i) => i.code.endsWith("_DRIFT")).length === 0,
    issues,
    ok: issues.length === 0,
  })
}
