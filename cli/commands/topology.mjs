/**
 * mindshift topology
 *
 * Topology-aware execution inspection surface.
 * Read-only view of topology state.
 *
 * Constraints:
 *   - No implicit topology trust
 *   - Cannot modify topology
 *   - mode: observability_only
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { readJsonFile } from "../lib/io.mjs"
import { printJson, printLine, printError } from "../lib/output.mjs"
import { hashCanonical } from "../lib/canonical.mjs"

const TOPOLOGY_MANIFEST_PATH = "runtime/topology/topology_manifest.json"
const TOPOLOGY_GRAPH_PATH = "runtime/topology/runtime_graph.json"
const TOPOLOGY_ONTOLOGY_PATH = "runtime/topology/topology_ontology.json"

const USAGE = `
mindshift topology <subcommand> [options]

Subcommands:
  inspect             Inspect current topology manifest
  status              Show topology status and invariant state
  surface <file>      Inspect a specific surface file for topology compliance
  diff <file> <file>  Compare topology hashes between two surface files

Constraints:
  - No implicit topology trust
  - Cannot modify topology
  - mode: observability_only
`.trim()

function tryReadJson(path) {
  const full = join(process.cwd(), path)
  if (!existsSync(full)) return null
  try {
    return JSON.parse(readFileSync(full, "utf8"))
  } catch {
    return null
  }
}

export async function run(args) {
  const sub = args[0]

  if (!sub || sub === "--help" || sub === "-h") {
    printLine(USAGE)
    return
  }

  if (sub === "inspect") {
    await inspectTopology()
  } else if (sub === "status") {
    await topologyStatus()
  } else if (sub === "surface") {
    const filePath = args[1]
    if (!filePath) printError("surface requires a <file> argument")
    await inspectSurface(filePath)
  } else if (sub === "diff") {
    const fileA = args[1]
    const fileB = args[2]
    if (!fileA || !fileB) printError("diff requires two <file> arguments")
    await diffTopology(fileA, fileB)
  } else {
    printError(`unknown topology subcommand: ${sub}\n\n${USAGE}`)
  }
}

async function inspectTopology() {
  const manifest = tryReadJson(TOPOLOGY_MANIFEST_PATH)
  const graph = tryReadJson(TOPOLOGY_GRAPH_PATH)
  const ontology = tryReadJson(TOPOLOGY_ONTOLOGY_PATH)

  const issues = []

  if (!manifest) {
    issues.push({ code: "NO_MANIFEST", message: `topology manifest not found at: ${TOPOLOGY_MANIFEST_PATH}` })
  } else {
    if (manifest.executable === true) {
      issues.push({ code: "EXECUTABLE_TOPOLOGY", message: "topology manifest must not be executable" })
    }
    if (manifest.creates_authority === true) {
      issues.push({ code: "AUTHORITY_CREATION", message: "topology must not create authority" })
    }
    if (manifest.fail_closed_on_ambiguity !== true) {
      issues.push({ code: "FAIL_OPEN", message: "topology must fail_closed_on_ambiguity" })
    }
  }

  const manifest_hash = manifest ? hashCanonical(manifest) : null

  const result = {
    object_type: "TopologyInspection",
    mode: "observability_only",
    implicit_topology_trust: false,
    manifest_path: TOPOLOGY_MANIFEST_PATH,
    manifest_found: !!manifest,
    graph_found: !!graph,
    ontology_found: !!ontology,
    topology_status: manifest?.topology_status ?? null,
    version: manifest?.version ?? null,
    invariant: manifest?.invariant ?? null,
    fail_closed: manifest?.fail_closed_on_ambiguity === true,
    canonical_lifecycle: manifest?.canonical_lifecycle ?? [],
    manifest_hash,
    issues,
    ok: issues.length === 0,
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}

async function topologyStatus() {
  const manifest = tryReadJson(TOPOLOGY_MANIFEST_PATH)
  const graph = tryReadJson(TOPOLOGY_GRAPH_PATH)

  const result = {
    object_type: "TopologyStatus",
    mode: "observability_only",
    implicit_topology_trust: false,
    topology_status: manifest?.topology_status ?? "UNKNOWN",
    invariant: manifest?.invariant ?? null,
    evidence_only: manifest?.evidence_only !== false,
    executable: manifest?.executable === true,
    fail_closed_on_ambiguity: manifest?.fail_closed_on_ambiguity === true,
    graph_node_count: graph?.nodes?.length ?? null,
    graph_edge_count: graph?.edges?.length ?? null,
    checked_at: new Date().toISOString(),
  }

  printJson(result)
}

async function inspectSurface(filePath) {
  const surface = readJsonFile(filePath)

  const issues = []
  const surface_hash = hashCanonical(surface)

  if (surface.creates_authority === true) {
    issues.push({ code: "AUTHORITY_CREATION_FORBIDDEN", message: "surfaces must not create authority" })
  }
  if (surface.executable === true && surface.evidence_only !== false) {
    issues.push({ code: "IMPLICIT_EXECUTION", message: "executable surface must not also be evidence_only=true" })
  }

  const result = {
    object_type: "TopologySurfaceInspection",
    mode: "observability_only",
    implicit_topology_trust: false,
    source_file: filePath,
    object_type_in_file: surface.object_type ?? null,
    surface_hash,
    topology_status: surface.topology_status ?? null,
    evidence_only: surface.evidence_only !== false,
    executable: surface.executable === true,
    issues,
    ok: issues.length === 0,
  }

  printJson(result)
  if (!result.ok) process.exitCode = 1
}

async function diffTopology(fileA, fileB) {
  const objA = readJsonFile(fileA)
  const objB = readJsonFile(fileB)

  const hashA = hashCanonical(objA)
  const hashB = hashCanonical(objB)

  const result = {
    object_type: "TopologyDiff",
    mode: "observability_only",
    implicit_topology_trust: false,
    file_a: fileA,
    file_b: fileB,
    hash_a: hashA,
    hash_b: hashB,
    identical: hashA === hashB,
    diverged: hashA !== hashB,
  }

  printJson(result)
}
