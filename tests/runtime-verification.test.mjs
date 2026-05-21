import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reportPath = new URL("../governance/runtime/RUNTIME_VERIFICATION_REPORT.json", import.meta.url);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

const canonicalTopology = [
  "/session",
  "/continuity",
  "/authority",
  "/compile",
  "/validate",
  "/execute",
  "/proof",
];

test("runtime verification report locks canonical mutation topology", () => {
  assert.deepEqual(report.canonical_execution_topology, canonicalTopology);
  assert.deepEqual(report.active_execution_surfaces.mutation_routes, canonicalTopology);
});

test("runtime verification report is fail-closed on mutation surface expansion", () => {
  assert.deepEqual(report.orphan_execution_candidates, []);
  assert.deepEqual(report.undeclared_mutation_paths, []);
  assert.equal(report.validation_results.undeclared_execution_surfaces_exist, false);
  assert.equal(report.validation_results.archive_or_generated_artifacts_executable, false);
});

test("runtime verification report preserves validator and proof closure", () => {
  assert.deepEqual(report.validator_coverage_gaps, []);
  assert.deepEqual(report.proof_continuity_gaps, []);
  assert.deepEqual(report.replay_enforcement_gaps, []);
  assert.equal(report.validation_results.deploy_paths_validator_bound, true);
  assert.equal(report.validation_results.proof_persistence_deterministic, true);
  assert.equal(report.validation_results.replay_enforcement_singular, true);
});

test("deploy surface remains bounded to governed paths", () => {
  assert.ok(report.deploy_capable_surfaces.includes(".github/workflows/governed-deploy.yml"));
  assert.ok(report.deploy_capable_surfaces.includes("wrangler.toml"));
});
