/**
 * mindshift proof
 *
 * Proof lineage visibility surface.
 * Inspects proof records and envelopes without generating new proofs.
 * mode: observability_only
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError } from "../lib/output.mjs"
import { hashCanonical } from "../lib/canonical.mjs"

const USAGE = `
mindshift proof <subcommand> [options]

Subcommands:
  inspect  <file>         Inspect a proof record or execution result for proof lineage
  lineage  <file...>      Show lineage chain across multiple proof records
  verify   <file>         Verify proof temporal and structural constraints

Constraints:
  - Cannot generate proofs
  - mode: observability_only
`.trim()

export async function run(args) {
  const sub = args[0]

  if (!sub || sub === "--help" || sub === "-h") {
    printLine(USAGE)
    return
  }

  if (sub === "inspect") {
    const filePath = requireArg(args, 1, "file")
    await inspectProof(filePath)
  } else if (sub === "lineage") {
    const files = args.slice(1)
    if (files.length === 0) printError("lineage requires at least one <file>")
    await showLineage(files)
  } else if (sub === "verify") {
    const filePath = requireArg(args, 1, "file")
    await verifyProof(filePath)
  } else {
    printError(`unknown proof subcommand: ${sub}\n\n${USAGE}`)
  }
}

async function inspectProof(filePath) {
  const record = readJsonFile(filePath)

  const issues = []
  if (!record.proof_id && !record.object_hash) issues.push("missing: proof_id or object_hash")
  if (!record.topology_hash && !record.receipt_file) issues.push("missing: topology_hash or receipt_file")

  const computed_hash = hashCanonical(record)

  const result = {
    object_type: "ProofInspection",
    mode: "observability_only",
    runtime_authority: false,
    proof_generating: false,
    source_file: filePath,
    proof_id: record.proof_id ?? null,
    proof_hash: record.proof_hash ?? record.object_hash ?? null,
    topology_hash: record.topology_hash ?? null,
    continuity_hash: record.continuity_hash ?? null,
    proof_scope: record.proof_scope ?? record.object_type ?? null,
    created_at: record.created_at ?? record.executed_at ?? record.validated_at ?? null,
    replay_neutral: record.replay_neutral !== false,
    computed_inspection_hash: computed_hash,
    issues,
    ok: issues.length === 0,
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}

async function showLineage(files) {
  const chain = []

  for (const filePath of files) {
    const record = readJsonFile(filePath)
    chain.push({
      source_file: filePath,
      proof_id: record.proof_id ?? null,
      object_hash: record.object_hash ?? record.proof_hash ?? record.canonical_hash ?? null,
      object_type: record.object_type ?? null,
      created_at: record.created_at ?? record.executed_at ?? record.validated_at ?? record.compiled_at ?? null,
      ok: record.ok !== false,
    })
  }

  // Verify lineage continuity: each entry's hash should chain forward
  const continuity_issues = []
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1]
    const curr = chain[i]
    if (prev.object_hash && curr.object_hash && prev.object_hash !== curr.object_hash) {
      // This is expected across phases (compile → validate → execute share the same hash)
      // Flag only if the types suggest they should match
      const samePhaseTypes = ["CompiledLegitimacyObject", "ValidationReceipt", "ExecutionResult"]
      if (samePhaseTypes.includes(prev.object_type) && samePhaseTypes.includes(curr.object_type)) {
        if (prev.object_hash !== curr.object_hash) {
          continuity_issues.push({
            position: i,
            message: `hash discontinuity between ${prev.source_file} and ${curr.source_file}`,
            prev_hash: prev.object_hash,
            curr_hash: curr.object_hash,
          })
        }
      }
    }
  }

  const result = {
    object_type: "ProofLineage",
    mode: "observability_only",
    proof_generating: false,
    chain_length: chain.length,
    chain,
    continuity_issues,
    ok: continuity_issues.length === 0,
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}

async function verifyProof(filePath) {
  const record = readJsonFile(filePath)

  const now = new Date()
  const issues = []

  // From runtime/proof_temporal_constraints.json semantics:
  // proofs must be replay_neutral and append_only
  if (record.replay_neutral === false) {
    issues.push({ code: "NOT_REPLAY_NEUTRAL", message: "proof record must be replay_neutral" })
  }

  if (record.runtime_authority === true) {
    issues.push({ code: "RUNTIME_AUTHORITY_FORBIDDEN", message: "proof records must not carry runtime_authority" })
  }

  if (record.proof_hash && typeof record.proof_hash !== "string") {
    issues.push({ code: "INVALID_PROOF_HASH", message: "proof_hash must be a string" })
  }

  if (record.proof_hash && !/^[a-f0-9]{64}$/.test(record.proof_hash)) {
    if (record.proof_hash && !/^[a-f0-9]{64}$/.test(record.proof_hash)) {
      issues.push({ code: "INVALID_HASH_FORMAT", message: "proof_hash does not match expected sha256 hex format" })
    }
  }

  const result = {
    object_type: "ProofVerification",
    mode: "observability_only",
    proof_generating: false,
    source_file: filePath,
    proof_id: record.proof_id ?? null,
    verified_at: now.toISOString(),
    issues,
    ok: issues.length === 0,
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}
