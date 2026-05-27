/**
 * mindshift compile
 *
 * Compiles a raw decision object into a canonical legitimacy object.
 * Produces a deterministic canonical hash binding the object's content.
 * The compiled object is the exact object that must flow through validate → execute.
 *
 * Invariant enforced: the hash produced here is the only valid execution hash.
 */

import { readJsonFile, requireArg } from "../lib/io.mjs"
import { printJson, printLine, printError, writeOutputFile } from "../lib/output.mjs"
import { normalize, canonicalize, hashCanonical } from "../lib/canonical.mjs"

const USAGE = `
mindshift compile <file> [--out <output-file>]

Compiles a decision/object JSON into a canonical legitimacy object with:
  - normalized canonical form
  - deterministic canonical hash
  - replay-safe envelope

The compiled object must not be modified before validation.
`.trim()

export async function run(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    printLine(USAGE)
    return
  }

  const filePath = requireArg(args, 0, "file")

  let outPath = null
  const outIdx = args.indexOf("--out")
  if (outIdx !== -1) {
    outPath = args[outIdx + 1]
    if (!outPath) printError("--out requires a path argument")
  }

  const raw = readJsonFile(filePath)

  const normalized = normalize(raw)
  const canonical_form = canonicalize(normalized)
  const canonical_hash = hashCanonical(normalized)

  const compiled = {
    object_type: "CompiledLegitimacyObject",
    compiled_at: new Date().toISOString(),
    source_file: filePath,
    canonical_hash,
    canonical_form,
    object: normalized,
    replay_safe: true,
    mutation_locked: true,
    executed: false,
    validated: false,
  }

  if (outPath) {
    writeOutputFile(outPath, compiled)
    printLine(`compiled object written to: ${outPath}`)
    printLine(`canonical_hash: ${canonical_hash}`)
  } else {
    printJson(compiled)
  }
}
