/**
 * mindshift adoption
 *
 * External Execution Surface Adoption Tracker (issue #1424).
 * Observability-only view of dependency formation across external surfaces.
 *
 * Constraints:
 *   - observability_only
 *   - cannot create authority
 *   - telemetry does not affect validation outcomes
 *   - visibility does not imply legitimacy
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { printJson, printLine, printError, writeOutputFile } from "../lib/output.mjs"
import { readJsonFile } from "../lib/io.mjs"
import {
  buildAdoptionReport,
  validateSurface,
  computeAdoptionScore,
  loadRegistry,
} from "../../runtime/adoption/adoption_tracker.mjs"

const USAGE = `
mindshift adoption <subcommand> [options]

Subcommands:
  report   [--out <file>]          Generate full adoption report from registry
  status                           Show summary counts (install_base total)
  inspect  <surface_id>            Inspect a single registered surface
  validate <registry-file>         Validate a registry file for structural compliance

Constraints:
  - observability_only
  - cannot create authority
  - telemetry does not affect validation outcomes
`.trim()

export async function run(args) {
  const sub = args[0]

  if (!sub || sub === "--help" || sub === "-h") {
    printLine(USAGE)
    return
  }

  if (sub === "report") {
    let outPath = null
    const outIdx = args.indexOf("--out")
    if (outIdx !== -1) {
      outPath = args[outIdx + 1]
      if (!outPath) printError("--out requires a path argument")
    }
    await generateReport(outPath)
  } else if (sub === "status") {
    await showStatus()
  } else if (sub === "inspect") {
    const surfaceId = args[1]
    if (!surfaceId) printError("inspect requires a <surface_id>")
    await inspectSurface(surfaceId)
  } else if (sub === "validate") {
    const filePath = args[1]
    if (!filePath) printError("validate requires a <registry-file>")
    await validateRegistry(filePath)
  } else {
    printError(`unknown adoption subcommand: ${sub}\n\n${USAGE}`)
  }
}

async function generateReport(outPath) {
  const registry = loadRegistry(process.cwd())
  if (!registry) {
    printError("registry not found at runtime/adoption/external_surface_registry.json")
  }

  const report = buildAdoptionReport(registry)

  if (outPath) {
    writeOutputFile(outPath, report)
    printLine(`adoption report written to: ${outPath}`)
    printLine(`surfaces_registered: ${report.surfaces_registered}`)
    printLine(`install_base_total:  ${report.metrics.install_base_total}`)
    printLine(`average_adoption_score: ${report.average_adoption_score}/100`)
    printLine(`all_surfaces_valid: ${report.all_surfaces_valid}`)
  } else {
    printJson(report)
  }
}

async function showStatus() {
  const registry = loadRegistry(process.cwd())
  if (!registry) {
    printError("registry not found at runtime/adoption/external_surface_registry.json")
  }

  const report = buildAdoptionReport(registry)
  const m = report.metrics

  const status = {
    object_type: "AdoptionStatus",
    mode: "observability_only",
    creates_authority: false,
    visibility_implies_legitimacy: false,
    install_base_total: m.install_base_total,
    execution_dependency: m.execution_dependency_count,
    workflow_dependency: m.workflow_dependency_count,
    governance_dependency: m.governance_dependency_count,
    validator_bound: m.validator_bound_count,
    replay_safe: m.replay_safe_count,
    proof_generating: m.proof_generating_count,
    topology_visible: m.topology_visible_count,
    reconciliation_capable: m.reconciliation_capable_count,
    closed_surfaces: m.closed_surface_count,
    average_adoption_score: report.average_adoption_score,
    integration_breakdown: report.integration_breakdown,
    checked_at: new Date().toISOString(),
  }

  printJson(status)
}

async function inspectSurface(surfaceId) {
  const registry = loadRegistry(process.cwd())
  if (!registry) {
    printError("registry not found at runtime/adoption/external_surface_registry.json")
  }

  const surface = (registry.surfaces ?? []).find((s) => s.surface_id === surfaceId)
  if (!surface) {
    printError(`surface not found in registry: ${surfaceId}`)
  }

  const { ok, issues } = validateSurface(surface)
  const adoption_score = computeAdoptionScore(surface)

  printJson({
    object_type: "SurfaceInspection",
    mode: "observability_only",
    creates_authority: false,
    visibility_implies_legitimacy: false,
    surface,
    structural_ok: ok,
    adoption_score,
    issues,
    inspected_at: new Date().toISOString(),
  })

  if (!ok) process.exitCode = 1
}

async function validateRegistry(filePath) {
  const registry = readJsonFile(filePath)

  const issues = []

  if (registry.object_type !== "ExternalSurfaceRegistry") {
    issues.push({ code: "WRONG_OBJECT_TYPE", message: `expected ExternalSurfaceRegistry, got: ${registry.object_type}` })
  }

  if (registry.creates_authority === true) {
    issues.push({ code: "CREATES_AUTHORITY", message: "registry must not create authority" })
  }

  if (!Array.isArray(registry.surfaces)) {
    issues.push({ code: "MISSING_SURFACES", message: "registry.surfaces must be an array" })
  } else {
    const ids = new Set()
    for (const surface of registry.surfaces) {
      const id = surface.surface_id
      if (ids.has(id)) {
        issues.push({ code: "DUPLICATE_SURFACE_ID", message: `duplicate surface_id: ${id}` })
      }
      ids.add(id)

      const { ok, issues: surfaceIssues } = validateSurface(surface)
      if (!ok) {
        issues.push(...surfaceIssues.map((i) => ({ ...i, surface_id: id })))
      }
    }
  }

  const ok = issues.length === 0

  printJson({
    object_type: "RegistryValidation",
    mode: "observability_only",
    source_file: filePath,
    surfaces_found: Array.isArray(registry.surfaces) ? registry.surfaces.length : null,
    ok,
    issues,
    validated_at: new Date().toISOString(),
  })

  if (!ok) process.exitCode = 1
}
