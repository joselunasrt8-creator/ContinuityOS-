/**
 * External Execution Surface Adoption Tracker
 *
 * Measures real workflow dependency, execution dependency, and governance
 * dependency formation across external surfaces adopting MindShift legitimacy
 * infrastructure.
 *
 * Constraints:
 *   - observability_only: cannot create authority or affect validation
 *   - telemetry must not affect validation outcomes
 *   - visibility does not imply legitimacy
 *   - registry is append-only when persisted
 */

import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// ── Required registry fields per issue #1424 ────────────────────────────────
const REQUIRED_SURFACE_FIELDS = [
  "surface_id",
  "integration_type",
  "validator_bound",
  "replay_safe",
  "proof_generating",
  "topology_visible",
  "reconciliation_capable",
  "closure_status",
]

const VALID_INTEGRATION_TYPES = new Set([
  "ci_cd",
  "governed_agent_runtime",
  "replay_safe_deployment",
  "proof_bound_workflow",
  "topology_visible_execution",
  "legitimacy_aware_automation",
  "cli_sdk",
])

const VALID_CLOSURE_STATUSES = new Set(["CLOSED", "OPEN", "PARTIAL", "UNKNOWN"])

const VALID_DEPENDENCY_CLASSES = new Set([
  "execution_dependency",
  "workflow_dependency",
  "governance_dependency",
])

// ── Canonical hash (Node crypto, no external deps) ───────────────────────────

function canonicalize(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value ?? null)
  }
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(",") +
    "}"
  )
}

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

function hashCanonical(value) {
  return sha256Hex(canonicalize(value))
}

// ── Surface validation ────────────────────────────────────────────────────────

export function validateSurface(surface) {
  const issues = []

  for (const field of REQUIRED_SURFACE_FIELDS) {
    if (!(field in surface)) {
      issues.push({ code: "MISSING_REQUIRED_FIELD", field, message: `missing required field: ${field}` })
    }
  }

  if (surface.integration_type && !VALID_INTEGRATION_TYPES.has(surface.integration_type)) {
    issues.push({
      code: "INVALID_INTEGRATION_TYPE",
      field: "integration_type",
      message: `unknown integration_type: ${surface.integration_type}. Valid: ${[...VALID_INTEGRATION_TYPES].join(", ")}`,
    })
  }

  if (surface.closure_status && !VALID_CLOSURE_STATUSES.has(surface.closure_status)) {
    issues.push({
      code: "INVALID_CLOSURE_STATUS",
      field: "closure_status",
      message: `unknown closure_status: ${surface.closure_status}. Valid: ${[...VALID_CLOSURE_STATUSES].join(", ")}`,
    })
  }

  if ("dependency_class" in surface && !VALID_DEPENDENCY_CLASSES.has(surface.dependency_class)) {
    issues.push({
      code: "INVALID_DEPENDENCY_CLASS",
      field: "dependency_class",
      message: `unknown dependency_class: ${surface.dependency_class}`,
    })
  }

  for (const boolField of ["validator_bound", "replay_safe", "proof_generating", "topology_visible", "reconciliation_capable"]) {
    if (boolField in surface && typeof surface[boolField] !== "boolean") {
      issues.push({ code: "INVALID_BOOLEAN", field: boolField, message: `${boolField} must be boolean` })
    }
  }

  return { ok: issues.length === 0, issues }
}

// ── Dependency metrics ────────────────────────────────────────────────────────

export function computeDependencyMetrics(surfaces) {
  const execution = surfaces.filter((s) => s.dependency_class === "execution_dependency")
  const workflow = surfaces.filter((s) => s.dependency_class === "workflow_dependency")
  const governance = surfaces.filter((s) => s.dependency_class === "governance_dependency")

  return {
    execution_dependency_count: execution.length,
    workflow_dependency_count: workflow.length,
    governance_dependency_count: governance.length,
    install_base_total: surfaces.length,
    validator_bound_count: surfaces.filter((s) => s.validator_bound === true).length,
    replay_safe_count: surfaces.filter((s) => s.replay_safe === true).length,
    proof_generating_count: surfaces.filter((s) => s.proof_generating === true).length,
    topology_visible_count: surfaces.filter((s) => s.topology_visible === true).length,
    reconciliation_capable_count: surfaces.filter((s) => s.reconciliation_capable === true).length,
    closed_surface_count: surfaces.filter((s) => s.closure_status === "CLOSED").length,
    open_surface_count: surfaces.filter((s) => s.closure_status === "OPEN").length,
    partial_surface_count: surfaces.filter((s) => s.closure_status === "PARTIAL").length,
  }
}

// ── Integration-type breakdown ────────────────────────────────────────────────

export function computeIntegrationBreakdown(surfaces) {
  const breakdown = {}
  for (const s of surfaces) {
    const type = s.integration_type ?? "unknown"
    breakdown[type] = (breakdown[type] ?? 0) + 1
  }
  return breakdown
}

// ── Adoption score (0–100) ────────────────────────────────────────────────────
// Weighted: validator_bound and replay_safe are foundational (40pt each),
// proof_generating and topology_visible are advanced (10pt each).

export function computeAdoptionScore(surface) {
  let score = 0
  if (surface.validator_bound === true) score += 40
  if (surface.replay_safe === true) score += 40
  if (surface.proof_generating === true) score += 10
  if (surface.topology_visible === true) score += 10
  return score
}

// ── Full adoption report ──────────────────────────────────────────────────────

export function buildAdoptionReport(registry, baseDir = process.cwd()) {
  const surfaces = registry.surfaces ?? []

  const validationResults = surfaces.map((s) => ({ surface_id: s.surface_id, ...validateSurface(s) }))
  const allValid = validationResults.every((r) => r.ok)

  const metrics = computeDependencyMetrics(surfaces)
  const integration_breakdown = computeIntegrationBreakdown(surfaces)

  const surface_scores = surfaces.map((s) => ({
    surface_id: s.surface_id,
    integration_type: s.integration_type,
    dependency_class: s.dependency_class ?? null,
    closure_status: s.closure_status,
    adoption_score: computeAdoptionScore(s),
  }))

  const average_adoption_score =
    surface_scores.length > 0
      ? Math.round(surface_scores.reduce((sum, s) => sum + s.adoption_score, 0) / surface_scores.length)
      : 0

  const reportCore = {
    object_type: "AdoptionReport",
    mode: "observability_only",
    creates_authority: false,
    creates_proof: false,
    telemetry_affects_validation: false,
    visibility_implies_legitimacy: false,
    registry_version: registry.version ?? null,
    surfaces_registered: surfaces.length,
    all_surfaces_valid: allValid,
    metrics,
    integration_breakdown,
    surface_scores,
    average_adoption_score,
    adoption_formula: registry.adoption_formula ?? "install_base = execution_dependency + workflow_dependency + governance_dependency",
    validation_issues: validationResults.filter((r) => !r.ok),
    constraints: {
      telemetry_cannot_authorize_execution: true,
      telemetry_cannot_become_proof: true,
      append_only_when_persisted: true,
      no_execution_route_expansion: true,
      visibility_does_not_imply_legitimacy: true,
    },
  }

  const report_hash = hashCanonical(reportCore)

  return {
    ...reportCore,
    generated_at: new Date().toISOString(),
    report_hash,
  }
}

// ── Registry loader ───────────────────────────────────────────────────────────

export function loadRegistry(baseDir = process.cwd()) {
  const registryPath = join(baseDir, "runtime/adoption/external_surface_registry.json")
  if (!existsSync(registryPath)) return null
  return JSON.parse(readFileSync(registryPath, "utf8"))
}
