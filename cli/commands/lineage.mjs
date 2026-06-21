/**
 * mindshift lineage
 *
 * Runtime execution-lineage visibility surface.
 *   verify       Verify an append-only execution-lineage registry chain (fail-closed)
 *   observe      CI observer: verify evidence is intact + emit attributable observation
 *   head         Show the current inherited eligibility carry (or GENESIS)
 *   eligibility  Classify a candidate run against the registry head (ELIGIBLE | NULL)
 *
 * mode: observability_only
 *   - reads the registry; NEVER appends or mutates it
 *   - creates no authority; cannot widen execution eligibility
 *   - exits non-zero on NULL
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { writeFileSync } from "node:fs"
import { printJson, printLine, printError } from "../lib/output.mjs"
import {
  headCarry,
  consumedNonces,
  verifyRegistryChain,
} from "../../runtime/lineage/proofChainRegistry.mjs"
import { classifyExecutionEligibility } from "../../runtime/lineage/executionEligibility.mjs"
import { observeRegistry } from "../../runtime/lineage/observeRegistry.mjs"

const USAGE = `
mindshift lineage <subcommand> [options]

Subcommands:
  verify       <registry.jsonl> [--lineage-key <key>]
               Verify the append-only chain integrity (fail-closed). Reports
               tamper/fork/gap/duplicate and malformed-line detection.
  observe      <registry.jsonl> [--lineage-key <key>] [--out <file.json>]
               CI observer: re-verify the runtime-produced lineage evidence is
               intact and emit an attributable observation (verification_status,
               head_link_hash, registry_length, verified_at). Observes, never
               decides — creates no eligibility/authority. Exits non-zero unless VALID.
  head         <registry.jsonl> --lineage-key <key>
               Show the current inherited eligibility carry (the chain head a
               next run must inherit), or GENESIS for an empty lineage.
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
    printJson({
      object_type: "ExecutionLineageVerification",
      mode: "observability_only",
      registry,
      lineage_key: lineageKey ?? null,
      ok: res.result === "VALID",
      ...res,
    })
    if (res.result !== "VALID") process.exitCode = 1
    return
  }

  if (sub === "observe") {
    const registry = requireArg(args, 1, "registry.jsonl")
    const lineageKey = flag(args, "--lineage-key")
    const out = flag(args, "--out")
    const observation = observeRegistry(registry, { lineage_key: lineageKey })
    if (out) writeFileSync(out, JSON.stringify(observation, null, 2) + "\n")
    printJson(observation)
    // Fail closed: CI requires the runtime-produced evidence to be intact.
    if (!observation.intact) process.exitCode = 1
    return
  }

  if (sub === "head") {
    const registry = requireArg(args, 1, "registry.jsonl")
    const lineageKey = flag(args, "--lineage-key")
    if (!lineageKey) {
      printError(`lineage head requires --lineage-key <key>\n\n${USAGE}`)
      return
    }
    // Verify the chain first — a head read off a broken chain is meaningless.
    const chain = verifyRegistryChain(registry, lineageKey)
    if (chain.result !== "VALID") {
      printJson({
        object_type: "ExecutionLineageHead",
        mode: "observability_only",
        registry,
        lineage_key: lineageKey ?? null,
        ok: false,
        head: null,
        chain_result: chain.result,
        null_reasons: chain.null_reasons,
      })
      process.exitCode = 1
      return
    }
    const head = headCarry(registry, lineageKey)
    printJson({
      object_type: "ExecutionLineageHead",
      mode: "observability_only",
      registry,
      lineage_key: lineageKey ?? null,
      ok: true,
      head_link_hash: chain.head_link_hash,
      length: chain.length,
      head: head ?? "GENESIS",
    })
    return
  }

  if (sub === "eligibility") {
    const registry = requireArg(args, 1, "registry.jsonl")
    const currentPath = requireArg(args, 2, "current.json")
    const now = flag(args, "--now")
    const current = readJsonFile(currentPath)
    const lineageKey = current.lineage_key
    // Fail closed on a tampered/malformed registry with the documented NULL JSON,
    // rather than letting strict reads throw an uncaught exception (consistent with
    // the verify/head paths). A decision off a broken chain is meaningless.
    const chain = verifyRegistryChain(registry, lineageKey)
    if (chain.result !== "VALID") {
      printJson({
        object_type: "ExecutionEligibilityDecision",
        mode: "observability_only",
        registry,
        lineage_key: lineageKey ?? null,
        inherited_from: null,
        eligibility: "NULL",
        null_reasons: ["STORED_CHAIN_INVALID", ...chain.null_reasons],
        creates_authority: false,
        widens_eligibility: false,
      })
      process.exitCode = 1
      return
    }
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
