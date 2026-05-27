/**
 * mindshift reconcile
 *
 * Legitimacy state reconciliation surface.
 * Detects drift between compiled, validated, and executed states.
 * Read-only diagnostic: does not mutate state or restore replays.
 *
 * Constraints:
 *   - No replay restoration
 *   - No state mutation
 *   - mode: observability_only
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError } from "../lib/output.mjs"
import { hashCanonical } from "../lib/canonical.mjs"

const USAGE = `
mindshift reconcile <subcommand> [options]

Subcommands:
  check <compiled> <receipt> [<result>]   Check hash parity across lifecycle phases
  drift <file>                             Detect legitimacy drift in a single object
  surface                                  Reconcile detected surfaces against manifest

Constraints:
  - No replay restoration
  - No state mutation
  - mode: observability_only
`.trim()

export async function run(args) {
  const sub = args[0]

  if (!sub || sub === "--help" || sub === "-h") {
    printLine(USAGE)
    return
  }

  if (sub === "check") {
    const compiledPath = requireArg(args, 1, "compiled")
    const receiptPath = requireArg(args, 2, "receipt")
    const resultPath = args[3] ?? null
    await checkParity(compiledPath, receiptPath, resultPath)
  } else if (sub === "drift") {
    const filePath = requireArg(args, 1, "file")
    await detectDrift(filePath)
  } else if (sub === "surface") {
    await reconcileSurfaces()
  } else {
    printError(`unknown reconcile subcommand: ${sub}\n\n${USAGE}`)
  }
}

async function checkParity(compiledPath, receiptPath, resultPath) {
  const compiled = readJsonFile(compiledPath)
  const receipt = readJsonFile(receiptPath)
  const result = resultPath ? readJsonFile(resultPath) : null

  const issues = []

  // Phase 1: compile → validate parity
  const compiled_hash = compiled.canonical_hash ?? hashCanonical(compiled.object)
  const receipt_hash = receipt.object_hash

  if (compiled_hash !== receipt_hash) {
    issues.push({
      code: "COMPILE_VALIDATE_DRIFT",
      phase: "compile → validate",
      message: "canonical_hash mismatch between compiled object and validation receipt",
      compiled_hash,
      receipt_hash,
    })
  }

  // Phase 2: validate → execute parity (if result provided)
  let execute_hash = null
  if (result) {
    execute_hash = result.object_hash
    if (receipt_hash !== execute_hash) {
      issues.push({
        code: "VALIDATE_EXECUTE_DRIFT",
        phase: "validate → execute",
        message: "object_hash mismatch between validation receipt and execution result",
        receipt_hash,
        execute_hash,
      })
    }
  }

  // Check that validation actually passed
  if (receipt.ok !== true) {
    issues.push({
      code: "RECEIPT_NOT_OK",
      message: "validation receipt indicates failed validation — execution should be blocked",
    })
  }

  // Check execution result consistency
  if (result && result.ok !== true && result.executed === true) {
    issues.push({
      code: "EXECUTED_WITHOUT_OK",
      message: "execution result claims executed=true but ok is not true",
    })
  }

  const reconciled = {
    object_type: "ReconciliationCheck",
    mode: "observability_only",
    replay_restoration: false,
    mutation: false,
    compiled_hash,
    receipt_hash,
    execute_hash,
    phases_checked: result ? ["compile", "validate", "execute"] : ["compile", "validate"],
    hash_parity: issues.filter((i) => i.code.endsWith("_DRIFT")).length === 0,
    issues,
    ok: issues.length === 0,
    reconciled_at: new Date().toISOString(),
  }

  printJson(reconciled)
  if (!reconciled.ok) process.exitCode = 1
}

async function detectDrift(filePath) {
  const obj = readJsonFile(filePath)

  const issues = []

  // Recompute hash and compare stored hash
  let stored_hash = obj.canonical_hash ?? obj.object_hash ?? obj.proof_hash ?? null
  let recomputed_hash = null

  if (obj.object_type === "CompiledLegitimacyObject" && obj.object) {
    recomputed_hash = hashCanonical(obj.object)
  } else if (obj.object_type === "ValidationReceipt" && obj.validated_object) {
    recomputed_hash = hashCanonical(obj.validated_object)
    stored_hash = obj.object_hash
  } else if (obj.object_type === "ExecutionResult" && obj.executed_object) {
    recomputed_hash = hashCanonical(obj.executed_object)
    stored_hash = obj.object_hash
  }

  const drift_classes = []

  if (stored_hash && recomputed_hash && stored_hash !== recomputed_hash) {
    issues.push({
      code: "HASH_DRIFT",
      message: "stored hash does not match recomputed hash — object has been mutated post-compile",
      stored_hash,
      recomputed_hash,
    })
    drift_classes.push("mutation-induced")
  }

  if (obj.executed === true && obj.ok !== true) {
    issues.push({ code: "EXECUTED_INVALID", message: "object is marked executed but not ok" })
    drift_classes.push("execution-inconsistency")
  }

  if (obj.replay_safe === false) {
    issues.push({ code: "REPLAY_UNSAFE", message: "object is marked replay_safe=false" })
    drift_classes.push("replay-induced")
  }

  const result = {
    object_type: "DriftDetection",
    mode: "observability_only",
    replay_restoration: false,
    source_file: filePath,
    detected_object_type: obj.object_type ?? null,
    stored_hash,
    recomputed_hash,
    drift_classes,
    issues,
    ok: issues.length === 0,
    checked_at: new Date().toISOString(),
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}

async function reconcileSurfaces() {
  const { existsSync, readFileSync } = await import("node:fs")
  const { join } = await import("node:path")

  const surfacePaths = [
    "runtime/execution/execution_ontology.json",
    "runtime/topology/topology_manifest.json",
    "runtime/topology/topology_ontology.json",
    "runtime/validator_integrity_rules.json",
    "runtime/root_authority_constraints.json",
  ]

  const surfaces = []
  const issues = []

  for (const path of surfacePaths) {
    const full = join(process.cwd(), path)
    if (!existsSync(full)) {
      issues.push({ code: "MISSING_SURFACE", path, message: `surface file not found: ${path}` })
      surfaces.push({ path, found: false, hash: null })
      continue
    }

    let obj
    try {
      obj = JSON.parse(readFileSync(full, "utf8"))
    } catch {
      issues.push({ code: "PARSE_ERROR", path, message: `cannot parse surface: ${path}` })
      surfaces.push({ path, found: true, hash: null })
      continue
    }

    const surface_hash = hashCanonical(obj)
    surfaces.push({ path, found: true, hash: surface_hash, object_type: obj.object_type ?? null })
  }

  const result = {
    object_type: "SurfaceReconciliation",
    mode: "observability_only",
    replay_restoration: false,
    mutation: false,
    surfaces_checked: surfaces.length,
    surfaces,
    issues,
    ok: issues.length === 0,
    reconciled_at: new Date().toISOString(),
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}
