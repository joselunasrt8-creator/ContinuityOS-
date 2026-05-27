#!/usr/bin/env node
/**
 * mindshift CLI — Governed Execution and Legitimacy Routing
 *
 * External developer-facing surface exposing bounded legitimacy primitives.
 *
 * Commands:
 *   authority   Inspect authority records (observability-only)
 *   compile     Compile an object into canonical legitimacy form
 *   validate    Validate a compiled object; produce a validation receipt
 *   execute     Execute a validated object (requires receipt)
 *   proof       Inspect proof lineage (observability-only)
 *   topology    Inspect topology state (observability-only)
 *   reconcile   Detect legitimacy drift across lifecycle phases
 *   adoption    Track external execution surface adoption (observability-only)
 *
 * Core invariant: validated_object == executed_object
 *
 * Constraints:
 *   - CLI does not create authority
 *   - No hidden execution paths
 *   - No execution without validation
 *   - No replay restoration
 *   - No implicit topology trust
 */

import { run as authority } from "./commands/authority.mjs"
import { run as compile } from "./commands/compile.mjs"
import { run as validate } from "./commands/validate.mjs"
import { run as execute } from "./commands/execute.mjs"
import { run as proof } from "./commands/proof.mjs"
import { run as topology } from "./commands/topology.mjs"
import { run as reconcile } from "./commands/reconcile.mjs"
import { run as adoption } from "./commands/adoption.mjs"

const COMMANDS = {
  authority,
  compile,
  validate,
  execute,
  proof,
  topology,
  reconcile,
  adoption,
}

const USAGE = `
mindshift <command> [args]

Commands:
  authority   Inspect authority records (observability-only, cannot create authority)
  compile     Compile a decision/object into canonical legitimacy form
  validate    Validate a compiled object; produce a validation receipt
  execute     Execute a validated object using its receipt
  proof       Inspect proof lineage (observability-only)
  topology    Inspect topology state (observability-only)
  reconcile   Detect legitimacy drift across lifecycle phases
  adoption    Track external execution surface adoption (observability-only)

Core invariant: validated_object == executed_object

Run \`mindshift <command> --help\` for command-specific usage.
`.trim()

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE + "\n")
    return
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write("mindshift-cli 1.0.0\n")
    return
  }

  const handler = COMMANDS[command]
  if (!handler) {
    process.stderr.write(`error: unknown command: ${command}\n\n${USAGE}\n`)
    process.exitCode = 1
    return
  }

  await handler(args.slice(1))
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err.message}\n`)
  process.exit(1)
})
