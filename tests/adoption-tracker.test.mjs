import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  validateSurface,
  computeDependencyMetrics,
  computeIntegrationBreakdown,
  computeAdoptionScore,
  buildAdoptionReport,
} from "../runtime/adoption/adoption_tracker.mjs"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_SURFACE = {
  surface_id: "test_ci_cd",
  integration_type: "ci_cd",
  validator_bound: true,
  replay_safe: true,
  proof_generating: true,
  topology_visible: true,
  reconciliation_capable: false,
  closure_status: "CLOSED",
  dependency_class: "execution_dependency",
}

const MINIMAL_REGISTRY = {
  object_type: "ExternalSurfaceRegistry",
  version: "1.0.0",
  mode: "observability_only",
  creates_authority: false,
  adoption_formula: "install_base = execution_dependency + workflow_dependency + governance_dependency",
  surfaces: [VALID_SURFACE],
}

// ── validateSurface ───────────────────────────────────────────────────────────

test("validateSurface: valid surface passes", () => {
  const { ok, issues } = validateSurface(VALID_SURFACE)
  assert.equal(ok, true)
  assert.equal(issues.length, 0)
})

test("validateSurface: missing required fields are reported", () => {
  const { ok, issues } = validateSurface({ surface_id: "x" })
  assert.equal(ok, false)
  const codes = issues.map((i) => i.code)
  assert.ok(codes.includes("MISSING_REQUIRED_FIELD"))
  // all 7 remaining required fields should be reported
  const missingFields = issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD").map((i) => i.field)
  for (const f of ["integration_type", "validator_bound", "replay_safe", "proof_generating", "topology_visible", "reconciliation_capable", "closure_status"]) {
    assert.ok(missingFields.includes(f), `expected missing field: ${f}`)
  }
})

test("validateSurface: invalid integration_type is flagged", () => {
  const surface = { ...VALID_SURFACE, integration_type: "random_unknown_type" }
  const { ok, issues } = validateSurface(surface)
  assert.equal(ok, false)
  assert.ok(issues.some((i) => i.code === "INVALID_INTEGRATION_TYPE"))
})

test("validateSurface: invalid closure_status is flagged", () => {
  const surface = { ...VALID_SURFACE, closure_status: "MAYBE" }
  const { ok, issues } = validateSurface(surface)
  assert.equal(ok, false)
  assert.ok(issues.some((i) => i.code === "INVALID_CLOSURE_STATUS"))
})

test("validateSurface: non-boolean field is flagged", () => {
  const surface = { ...VALID_SURFACE, validator_bound: "yes" }
  const { ok, issues } = validateSurface(surface)
  assert.equal(ok, false)
  assert.ok(issues.some((i) => i.code === "INVALID_BOOLEAN" && i.field === "validator_bound"))
})

test("validateSurface: invalid dependency_class is flagged", () => {
  const surface = { ...VALID_SURFACE, dependency_class: "magic_dependency" }
  const { ok, issues } = validateSurface(surface)
  assert.equal(ok, false)
  assert.ok(issues.some((i) => i.code === "INVALID_DEPENDENCY_CLASS"))
})

// ── computeDependencyMetrics ──────────────────────────────────────────────────

test("computeDependencyMetrics: counts all categories correctly", () => {
  const surfaces = [
    { ...VALID_SURFACE, dependency_class: "execution_dependency" },
    { ...VALID_SURFACE, surface_id: "b", dependency_class: "workflow_dependency", proof_generating: false },
    { ...VALID_SURFACE, surface_id: "c", dependency_class: "governance_dependency", topology_visible: false, reconciliation_capable: true },
  ]
  const m = computeDependencyMetrics(surfaces)

  assert.equal(m.install_base_total, 3)
  assert.equal(m.execution_dependency_count, 1)
  assert.equal(m.workflow_dependency_count, 1)
  assert.equal(m.governance_dependency_count, 1)
  assert.equal(m.validator_bound_count, 3)
  assert.equal(m.replay_safe_count, 3)
  assert.equal(m.proof_generating_count, 2) // b has false
  assert.equal(m.topology_visible_count, 2) // c has false
  assert.equal(m.reconciliation_capable_count, 1) // only c
  assert.equal(m.closed_surface_count, 3)
})

test("computeDependencyMetrics: empty surfaces yields zeros", () => {
  const m = computeDependencyMetrics([])
  assert.equal(m.install_base_total, 0)
  assert.equal(m.execution_dependency_count, 0)
})

// ── computeIntegrationBreakdown ───────────────────────────────────────────────

test("computeIntegrationBreakdown: groups by integration_type", () => {
  const surfaces = [
    { integration_type: "ci_cd" },
    { integration_type: "ci_cd" },
    { integration_type: "cli_sdk" },
  ]
  const bd = computeIntegrationBreakdown(surfaces)
  assert.equal(bd.ci_cd, 2)
  assert.equal(bd.cli_sdk, 1)
})

// ── computeAdoptionScore ──────────────────────────────────────────────────────

test("computeAdoptionScore: full score is 100 when all criteria met", () => {
  const s = { validator_bound: true, replay_safe: true, proof_generating: true, topology_visible: true }
  assert.equal(computeAdoptionScore(s), 100)
})

test("computeAdoptionScore: foundational only (no proof or topology) is 80", () => {
  const s = { validator_bound: true, replay_safe: true, proof_generating: false, topology_visible: false }
  assert.equal(computeAdoptionScore(s), 80)
})

test("computeAdoptionScore: zero score when no criteria met", () => {
  assert.equal(computeAdoptionScore({}), 0)
})

test("computeAdoptionScore: partial scores are additive", () => {
  assert.equal(computeAdoptionScore({ validator_bound: true }), 40)
  assert.equal(computeAdoptionScore({ replay_safe: true }), 40)
  assert.equal(computeAdoptionScore({ proof_generating: true }), 10)
  assert.equal(computeAdoptionScore({ topology_visible: true }), 10)
})

// ── buildAdoptionReport ───────────────────────────────────────────────────────

test("buildAdoptionReport: produces a valid report from minimal registry", () => {
  const report = buildAdoptionReport(MINIMAL_REGISTRY)

  assert.equal(report.object_type, "AdoptionReport")
  assert.equal(report.mode, "observability_only")
  assert.equal(report.creates_authority, false)
  assert.equal(report.telemetry_affects_validation, false)
  assert.equal(report.visibility_implies_legitimacy, false)
  assert.equal(report.surfaces_registered, 1)
  assert.equal(report.all_surfaces_valid, true)
  assert.ok(report.report_hash, "report_hash must be present")
  assert.match(report.report_hash, /^[a-f0-9]{64}$/)
  assert.ok(report.generated_at)
})

test("buildAdoptionReport: report_hash is deterministic", () => {
  const r1 = buildAdoptionReport(MINIMAL_REGISTRY)
  const r2 = buildAdoptionReport(MINIMAL_REGISTRY)
  // hashes are computed before generated_at, so the core hash should be stable
  assert.equal(r1.report_hash, r2.report_hash)
})

test("buildAdoptionReport: metrics are correctly derived", () => {
  const registry = {
    ...MINIMAL_REGISTRY,
    surfaces: [
      { ...VALID_SURFACE, dependency_class: "execution_dependency" },
      { ...VALID_SURFACE, surface_id: "wf", dependency_class: "workflow_dependency", proof_generating: false },
    ],
  }
  const report = buildAdoptionReport(registry)
  assert.equal(report.metrics.install_base_total, 2)
  assert.equal(report.metrics.execution_dependency_count, 1)
  assert.equal(report.metrics.workflow_dependency_count, 1)
  assert.equal(report.metrics.proof_generating_count, 1)
})

test("buildAdoptionReport: flags invalid surfaces", () => {
  const registry = {
    ...MINIMAL_REGISTRY,
    surfaces: [{ surface_id: "bad" }], // missing required fields
  }
  const report = buildAdoptionReport(registry)
  assert.equal(report.all_surfaces_valid, false)
  assert.ok(report.validation_issues.length > 0)
})

test("buildAdoptionReport: constraints block authority creation and proof generation", () => {
  const report = buildAdoptionReport(MINIMAL_REGISTRY)
  assert.equal(report.constraints.telemetry_cannot_authorize_execution, true)
  assert.equal(report.constraints.telemetry_cannot_become_proof, true)
  assert.equal(report.constraints.visibility_does_not_imply_legitimacy, true)
  assert.equal(report.constraints.append_only_when_persisted, true)
})

test("buildAdoptionReport: surface_scores contain adoption_score for each surface", () => {
  const report = buildAdoptionReport(MINIMAL_REGISTRY)
  assert.equal(report.surface_scores.length, 1)
  assert.equal(report.surface_scores[0].surface_id, VALID_SURFACE.surface_id)
  assert.equal(typeof report.surface_scores[0].adoption_score, "number")
})

test("buildAdoptionReport: average_adoption_score is numeric", () => {
  const report = buildAdoptionReport(MINIMAL_REGISTRY)
  assert.equal(typeof report.average_adoption_score, "number")
  assert.ok(report.average_adoption_score >= 0 && report.average_adoption_score <= 100)
})

// ── Integration: production registry ─────────────────────────────────────────

test("production registry: all surfaces pass validation", () => {
  const registry = JSON.parse(readFileSync(join(process.cwd(), "runtime/adoption/external_surface_registry.json"), "utf8"))
  const report = buildAdoptionReport(registry)
  assert.equal(report.all_surfaces_valid, true, `Invalid surfaces: ${JSON.stringify(report.validation_issues)}`)
})

test("production registry: install_base formula satisfied", () => {
  const registry = JSON.parse(readFileSync(join(process.cwd(), "runtime/adoption/external_surface_registry.json"), "utf8"))
  const report = buildAdoptionReport(registry)
  const m = report.metrics
  assert.equal(
    m.execution_dependency_count + m.workflow_dependency_count + m.governance_dependency_count,
    m.install_base_total,
    "install_base = execution + workflow + governance",
  )
})
