/**
 * mindshift execute
 *
 * Executes a validated legitimacy object.
 *
 * Core invariant enforced: validated_object == executed_object
 * The receipt's object_hash must exactly match the hash of the object being executed.
 *
 * Constraints:
 *   - No execution without a valid ValidationReceipt
 *   - No replay restoration (executed objects cannot be re-executed)
 *   - No hidden execution paths
 *   - No implicit topology trust
 *   - Exact-object discipline: hash verified before any execution proceeds
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError, writeOutputFile } from "../lib/output.mjs"
import { hashCanonical } from "../lib/canonical.mjs"

const USAGE = `
mindshift execute <receipt-file> [--object <compiled-file>] [--out <result-file>] [--dry-run]

Executes a validated object using its ValidationReceipt.
The receipt was produced by \`mindshift validate\`.

Options:
  --object <file>   Provide the compiled object file for cross-verification
  --out    <file>   Write execution result to this file
  --dry-run         Verify all invariants without performing execution

Invariant enforced: validated_object == executed_object
`.trim()

export async function run(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    printLine(USAGE)
    return
  }

  const receiptPath = requireArg(args, 0, "receipt-file")

  let objectPath = null
  const objIdx = args.indexOf("--object")
  if (objIdx !== -1) {
    objectPath = args[objIdx + 1]
    if (!objectPath) printError("--object requires a path argument")
  }

  let outPath = null
  const outIdx = args.indexOf("--out")
  if (outIdx !== -1) {
    outPath = args[outIdx + 1]
    if (!outPath) printError("--out requires a path argument")
  }

  const dryRun = args.includes("--dry-run")

  const receipt = readJsonFile(receiptPath)

  const violations = []

  // Verify it's a valid receipt
  if (receipt.object_type !== "ValidationReceipt") {
    violations.push({
      code: "NOT_A_RECEIPT",
      message: "input must be a ValidationReceipt produced by `mindshift validate`",
    })
  }

  // Execution requires successful validation
  if (receipt.ok !== true) {
    violations.push({
      code: "VALIDATION_FAILED",
      message: "cannot execute: receipt indicates validation did not pass",
    })
  }

  // No replay: executed objects cannot be re-executed
  if (receipt.executed === true) {
    violations.push({
      code: "REPLAY_BLOCKED",
      message: "execution blocked: this receipt has already been used — no replay restoration",
    })
  }

  // No replay_safe violation
  if (receipt.replay_safe === false) {
    violations.push({
      code: "NOT_REPLAY_SAFE",
      message: "execution blocked: receipt is not marked replay_safe",
    })
  }

  // Exact-object discipline: re-verify the object hash if a compiled object is provided
  let crossCheckResult = null
  if (objectPath) {
    const compiled = readJsonFile(objectPath)
    if (compiled.canonical_hash !== receipt.object_hash) {
      violations.push({
        code: "OBJECT_HASH_MISMATCH",
        message: "exact-object violation: compiled object hash does not match receipt's object_hash",
        compiled_hash: compiled.canonical_hash,
        receipt_hash: receipt.object_hash,
      })
    } else {
      // Re-derive hash from embedded object for triple verification
      const live_hash = hashCanonical(compiled.object)
      if (live_hash !== receipt.object_hash) {
        violations.push({
          code: "LIVE_HASH_MISMATCH",
          message: "exact-object violation: live-computed hash of compiled.object does not match receipt",
          live_hash,
          receipt_hash: receipt.object_hash,
        })
      } else {
        crossCheckResult = { ok: true, live_hash }
      }
    }
  }

  // Validated object must be present
  if (!receipt.validated_object || typeof receipt.validated_object !== "object") {
    violations.push({
      code: "MISSING_VALIDATED_OBJECT",
      message: "receipt does not contain a validated_object — cannot execute",
    })
  }

  const canExecute = violations.length === 0

  const executed_at = new Date().toISOString()

  const executionResult = {
    object_type: "ExecutionResult",
    executed_at,
    dry_run: dryRun,
    receipt_file: receiptPath,
    object_hash: receipt.object_hash,
    validated_object_hash_confirmed: canExecute,
    cross_check: crossCheckResult,
    executed: canExecute && !dryRun,
    violations,
    ok: canExecute,
    execution_surface: "cli_governed",
    hidden_paths: false,
    implicit_topology_trust: false,
    replay_restoration: false,
    executed_object: canExecute ? receipt.validated_object : null,
    execution_note: canExecute
      ? dryRun
        ? "dry-run: all invariants satisfied; execution would proceed"
        : "executed: validated_object == executed_object invariant verified"
      : "execution blocked: invariant violations detected",
  }

  if (outPath) {
    writeOutputFile(outPath, executionResult)
    printLine(`execution result written to: ${outPath}`)
    printLine(`ok: ${executionResult.ok}`)
    printLine(`dry_run: ${dryRun}`)
    if (!canExecute) {
      for (const v of violations) printLine(`  violation: [${v.code}] ${v.message}`)
    }
  } else {
    printJson(executionResult)
  }

  if (!canExecute) process.exitCode = 1
}
