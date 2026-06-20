/**
 * mindshift lineage
 *
 * Runtime execution-lineage visibility surface.
 *   verify       Verify an append-only execution-lineage registry chain (fail-closed)
 *   eligibility  Classify a candidate run against the registry head (ELIGIBLE | NULL)
 *
 * mode: observability_only
 *   - reads the registry; NEVER appends or mutates it
 *   - creates no authority; cannot widen execution eligibility
 *   - exits non-zero on NULL
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError } from "../lib/output.mjs"
import {
  headCarry,
  consumedNonces,
  verifyRegistryChain,
} from "../../runtime/lineage/proofChainRegistry.mjs"
import { classifyExecutionEligibility } from "../../runtime/lineage/executionEligibility.mjs"

const USAGE = `
mindshift lineage <subcommand> [options]

Subcommands:
  verify       <registry.jsonl> [--lineage-key <key>]
               Verify the append-only chain integrity (fail-closed).
  eligibility  <registry.jsonl> <current.json> [--now <iso>]
               Classify a candidate run against the registry head.
               current.json: { lineage_key, continuity_id, parent_continuity_id,
                               parent_executed_object_hash, validated_object_hash, nonce }

mode: observability_only (reads only; creates no authority; exits non-zero on NULL)
`.trim()

function flag(args, name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}

export async function run(args) {
  const sub = args[0]

  if (!sub || sub === "--help" || sub === "-h") {
    printLine(USAGE)
    return
  }

  if (sub === "verify") {
    const registry = requireArg(args, 1, "registry.jsonl")
    const lineageKey = flag(args, "--lineage-key")
    const res = verifyRegistryChain(registry, lineageKey)
    printJson({ object_type: "ExecutionLineageVerification", mode: "observability_only", registry, lineage_key: lineageKey ?? null, ...res })
    if (res.result !== "VALID") process.exitCode = 1
    return
  }

  if (sub === "eligibility") {
    const registry = requireArg(args, 1, "registry.jsonl")
    const currentPath = requireArg(args, 2, "current.json")
    const now = flag(args, "--now")
    const current = readJsonFile(currentPath)
    const lineageKey = current.lineage_key
    const prior = headCarry(registry, lineageKey)
    const decision = classifyExecutionEligibility(prior, current, {
      now,
      consumed_nonces: consumedNonces(registry, lineageKey),
    })
    printJson({
      object_type: "ExecutionEligibilityDecision",
      mode: "observability_only",
      registry,
      lineage_key: lineageKey ?? null,
      inherited_from: prior ? { continuity_id: prior.continuity_id, executed_object_hash: prior.executed_object_hash } : "GENESIS",
      eligibility: decision.eligibility,
      null_reasons: decision.null_reasons,
      creates_authority: decision.creates_authority,
      widens_eligibility: decision.widens_eligibility,
    })
    if (decision.eligibility !== "ELIGIBLE") process.exitCode = 1
    return
  }

  printError(`unknown lineage subcommand: ${sub}\n\n${USAGE}`)
}
