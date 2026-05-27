/**
 * mindshift authority
 *
 * Observability-only surface for authority records.
 * This command cannot create, modify, or grant authority.
 * mode: observability_only
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printError, printLine } from "../lib/output.mjs"
import { hashCanonical } from "../lib/canonical.mjs"

const USAGE = `
mindshift authority <subcommand> [options]

Subcommands:
  inspect <file>    Inspect an authority record and verify its hash integrity
  verify  <file>    Verify authority scope and expiry constraints

Constraints:
  - Cannot create authority
  - Cannot grant or delegate authority
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
    await inspectAuthority(filePath)
  } else if (sub === "verify") {
    const filePath = requireArg(args, 1, "file")
    await verifyAuthority(filePath)
  } else {
    printError(`unknown authority subcommand: ${sub}\n\n${USAGE}`)
  }
}

async function inspectAuthority(filePath) {
  const record = readJsonFile(filePath)

  const issues = []
  if (!record.authority_id) issues.push("missing: authority_id")
  if (!record.authority_scope) issues.push("missing: authority_scope")
  if (!record.topology_hash) issues.push("missing: topology_hash")
  if (!record.created_at) issues.push("missing: created_at")

  const computed_hash = hashCanonical(record)

  const result = {
    object_type: "AuthorityInspection",
    mode: "observability_only",
    runtime_authority: false,
    creates_authority: false,
    source_file: filePath,
    authority_id: record.authority_id ?? null,
    authority_scope: record.authority_scope ?? null,
    topology_hash: record.topology_hash ?? null,
    continuity_hash: record.continuity_hash ?? null,
    created_at: record.created_at ?? null,
    replay_neutral: record.replay_neutral === true,
    append_only: record.append_only === true,
    computed_canonical_hash: computed_hash,
    structural_issues: issues,
    ok: issues.length === 0,
  }

  printJson(result)

  if (!result.ok) {
    process.exitCode = 1
  }
}

async function verifyAuthority(filePath) {
  const record = readJsonFile(filePath)

  const now = new Date()
  const issues = []

  if (record.runtime_authority === true) {
    issues.push("VIOLATION: runtime_authority must not be true")
  }

  if (record.replay_neutral !== true) {
    issues.push("VIOLATION: authority record must be replay_neutral")
  }

  if (record.append_only !== true) {
    issues.push("VIOLATION: authority record must be append_only")
  }

  if (record.expires_at) {
    const expiry = new Date(record.expires_at)
    if (expiry < now) {
      issues.push(`authority expired at: ${record.expires_at}`)
    }
  }

  const result = {
    object_type: "AuthorityVerification",
    mode: "observability_only",
    runtime_authority: false,
    creates_authority: false,
    authority_id: record.authority_id ?? null,
    authority_scope: record.authority_scope ?? null,
    verified_at: now.toISOString(),
    expired: record.expires_at ? new Date(record.expires_at) < now : false,
    issues,
    ok: issues.length === 0,
  }

  printJson(result)

  if (!result.ok) {
    process.exitCode = 1
  }
}
