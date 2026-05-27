/**
 * mindshift validate
 *
 * Validates a compiled legitimacy object against legitimacy rules.
 * Produces a validation receipt that binds the canonical hash.
 *
 * Core invariant enforced: validated_object == executed_object
 * The receipt's object_hash must equal the compiled object's canonical_hash.
 * Any object that fails validation cannot proceed to execute.
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError, writeOutputFile } from "../lib/output.mjs"
import { hashCanonical, canonicalize } from "../lib/canonical.mjs"

const USAGE = `
mindshift validate <compiled-file> [--out <receipt-file>]

Validates a compiled legitimacy object and produces a validation receipt.
The receipt binds the canonical hash so execute can enforce exact-object discipline.

Validation checks:
  - object_type is CompiledLegitimacyObject
  - canonical_hash matches recomputed hash of the embedded object
  - object has not been post-compile mutated
  - object is not already executed
  - required legitimacy fields are present
`.trim()

const REQUIRED_OBJECT_FIELDS = ["intent", "scope", "target", "finality"]

export async function run(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    printLine(USAGE)
    return
  }

  const filePath = requireArg(args, 0, "compiled-file")

  let outPath = null
  const outIdx = args.indexOf("--out")
  if (outIdx !== -1) {
    outPath = args[outIdx + 1]
    if (!outPath) printError("--out requires a path argument")
  }

  const compiled = readJsonFile(filePath)

  const issues = []

  // Structural check
  if (compiled.object_type !== "CompiledLegitimacyObject") {
    issues.push({
      code: "NOT_COMPILED_OBJECT",
      message: "input must be a CompiledLegitimacyObject produced by `mindshift compile`",
    })
  }

  // Exact-object discipline: recompute canonical hash and verify it matches
  let recomputed_hash = null
  if (compiled.object !== undefined) {
    recomputed_hash = hashCanonical(compiled.object)
    if (recomputed_hash !== compiled.canonical_hash) {
      issues.push({
        code: "HASH_MISMATCH",
        message: "canonical_hash does not match recomputed hash of embedded object — post-compile mutation detected",
        stored_hash: compiled.canonical_hash,
        recomputed_hash,
      })
    }
  } else {
    issues.push({ code: "MISSING_OBJECT", message: "compiled object is missing embedded .object" })
  }

  // Guard: already executed
  if (compiled.executed === true) {
    issues.push({ code: "ALREADY_EXECUTED", message: "object has already been executed — no replay restoration" })
  }

  // Guard: required legitimacy fields
  if (compiled.object && typeof compiled.object === "object") {
    for (const field of REQUIRED_OBJECT_FIELDS) {
      if (!(field in compiled.object)) {
        issues.push({ code: "MISSING_FIELD", message: `embedded object missing required field: ${field}` })
      }
    }
  }

  // Guard: finality proof requirement
  if (compiled.object?.finality?.proof_required === true) {
    if (!compiled.object?.finality?.proof_type) {
      issues.push({ code: "MISSING_PROOF_TYPE", message: "finality.proof_required is true but finality.proof_type is absent" })
    }
  }

  const ok = issues.length === 0
  const validated_at = new Date().toISOString()

  const receipt = {
    object_type: "ValidationReceipt",
    validated_at,
    source_file: filePath,
    object_hash: recomputed_hash ?? compiled.canonical_hash,
    canonical_form: compiled.canonical_form,
    ok,
    issues,
    validated_object: ok ? compiled.object : null,
    executed: false,
    replay_safe: true,
  }

  if (outPath) {
    writeOutputFile(outPath, receipt)
    printLine(`validation receipt written to: ${outPath}`)
    printLine(`ok: ${ok}`)
    if (!ok) {
      for (const issue of issues) printLine(`  issue: [${issue.code}] ${issue.message}`)
    }
  } else {
    printJson(receipt)
  }

  if (!ok) process.exitCode = 1
}
